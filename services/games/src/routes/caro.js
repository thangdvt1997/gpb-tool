import { Router } from 'express';
import {
  ApiError,
  cleanText,
  createRateLimiter,
  displayName,
  integerInRange,
  newId,
  nowIso,
  requireObject,
} from '../util.js';

const SIZE = 15;
const CELLS = SIZE * SIZE;
const WIN_LENGTH = 5;
const EMPTY = '.';
const SYMBOL = Object.freeze({ x: 'X', o: 'O' });
// Bốn hướng cần kiểm tra: ngang, dọc, chéo xuôi, chéo ngược.
const DIRECTIONS = Object.freeze([
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]);
const WIN_POINTS = 3;
const DRAW_POINTS = 1;
const LIST_LIMIT = 50;
// Mỗi người chỉ được giữ tối đa số phòng đang chờ này. Phòng chờ đóng khi chủ rời hoặc có người vào.
const MAX_WAITING_ROOMS_PER_USER = 3;
// Phòng chờ quá thời gian này mà không có người vào thì tự đóng.
const WAITING_TTL_MS = 30 * 60_000;

function otherSide(side) {
  return side === 'x' ? 'o' : 'x';
}

// Đếm số quân cùng màu liên tiếp qua ô (row, col) theo một hướng, gồm cả ô vừa đánh.
function lineLength(board, row, col, [dr, dc], symbol) {
  let count = 1;
  for (const sign of [1, -1]) {
    let r = row + dr * sign;
    let c = col + dc * sign;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === symbol) {
      count += 1;
      r += dr * sign;
      c += dc * sign;
    }
  }
  return count;
}

function isWinningMove(board, row, col, symbol) {
  return DIRECTIONS.some((dir) => lineLength(board, row, col, dir, symbol) >= WIN_LENGTH);
}

function sideOf(room, userId) {
  if (room.x_id === userId) return 'x';
  if (room.o_id === userId) return 'o';
  return null;
}

// Không trả user_id nội bộ cho client: chỉ trả tên hiển thị.
function playersOf(room) {
  return {
    x: room.x_id ? { name: room.x_name } : null,
    o: room.o_id ? { name: room.o_name } : null,
  };
}

// Trạng thái đầy đủ của phòng. Board là 15 chuỗi, mỗi chuỗi 15 ký tự. Không trả danh sách nước đi.
function toState(room) {
  const board = [];
  for (let r = 0; r < SIZE; r += 1) {
    board.push(room.board.slice(r * SIZE, (r + 1) * SIZE));
  }
  return {
    id: room.id,
    name: room.name,
    status: room.status,
    players: playersOf(room),
    board,
    turn: room.turn,
    winner: room.winner,
    moveCount: room.move_count,
    updatedAt: room.updated_at,
  };
}

function toSummary(room) {
  return {
    id: room.id,
    name: room.name,
    status: room.status,
    players: playersOf(room),
    createdAt: room.created_at,
  };
}

export function createCaroRouter({ db }) {
  const router = Router();

  const selectRoom = db.prepare('SELECT * FROM caro_rooms WHERE id = ?');
  const selectWaiting = db.prepare(
    "SELECT * FROM caro_rooms WHERE status = 'waiting' ORDER BY created_at DESC LIMIT ?",
  );
  const insertRoom = db.prepare(
    `INSERT INTO caro_rooms (id, name, status, x_id, x_name, o_id, o_name, board, turn, winner, move_count, created_at, updated_at)
     VALUES (@id, @name, 'waiting', @x_id, @x_name, NULL, NULL, @board, NULL, NULL, 0, @now, @now)`,
  );
  const saveRoomStmt = db.prepare(
    `UPDATE caro_rooms
     SET status = @status, o_id = @o_id, o_name = @o_name, board = @board,
         turn = @turn, winner = @winner, move_count = @move_count, updated_at = @updated_at
     WHERE id = @id`,
  );
  const insertResult = db.prepare(
    'INSERT INTO caro_results (room_id, x_user, o_user, winner, finished_at) VALUES (?, ?, ?, ?, ?)',
  );
  const insertScore = db.prepare(
    'INSERT INTO scores (user_id, user_name, kind, points, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const countOwnWaiting = db.prepare(
    "SELECT COUNT(*) AS n FROM caro_rooms WHERE x_id = ? AND status = 'waiting'",
  );
  const expireWaiting = db.prepare(
    `UPDATE caro_rooms SET status = 'finished', turn = NULL, winner = NULL, updated_at = @now
     WHERE status = 'waiting' AND created_at < @cutoff`,
  );
  // Giới hạn tốc độ tạo phòng: 5 phòng mỗi phút cho mỗi người.
  const createLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 5,
    message: 'Tạo phòng quá nhanh, hãy thử lại sau ít phút',
  });

  function findRoom(id) {
    const room = selectRoom.get(id);
    if (!room) throw new ApiError(404, 'Không tìm thấy phòng');
    return room;
  }

  // Đóng các phòng chờ quá hạn. Không dùng timer nền: gọi khi đọc danh sách, khi tạo phòng và khi join.
  function closeStaleWaitingRooms() {
    const now = Date.now();
    expireWaiting.run({
      now: new Date(now).toISOString(),
      cutoff: new Date(now - WAITING_TTL_MS).toISOString(),
    });
  }

  // Ghi đè trạng thái phòng: lấy các cột hiện tại rồi áp dụng patch.
  function saveRoom(room, patch) {
    saveRoomStmt.run({
      id: room.id,
      status: room.status,
      o_id: room.o_id,
      o_name: room.o_name,
      board: room.board,
      turn: room.turn,
      winner: room.winner,
      move_count: room.move_count,
      updated_at: room.updated_at,
      ...patch,
    });
  }

  // Ghi kết quả ván và điểm bảng xếp hạng: mỗi người chơi một dòng, thắng 3, hòa 1, thua 0.
  // Bỏ cuộc giữa trận (awardWinner = false): bên thắng vẫn được ghi thắng nhưng không cộng điểm.
  // Chỉ gọi khi cả hai bên đã có mặt.
  function settleMatch(room, winner, at, { awardWinner = true } = {}) {
    insertResult.run(room.id, room.x_id, room.o_id, winner, at);
    const winPoints = awardWinner ? WIN_POINTS : 0;
    const xPoints = winner === 'x' ? winPoints : winner === 'draw' ? DRAW_POINTS : 0;
    const oPoints = winner === 'o' ? winPoints : winner === 'draw' ? DRAW_POINTS : 0;
    insertScore.run(room.x_id, room.x_name, 'caro', xPoints, at);
    insertScore.run(room.o_id, room.o_name, 'caro', oPoints, at);
  }

  // Kiểm tra số phòng chờ và tạo phòng trong cùng một transaction để không vượt giới hạn khi có nhiều request.
  const createRoomTx = db.transaction((user, name) => {
    closeStaleWaitingRooms();
    const { n } = countOwnWaiting.get(user.id);
    if (n >= MAX_WAITING_ROOMS_PER_USER) {
      throw new ApiError(409, `Bạn đang có ${MAX_WAITING_ROOMS_PER_USER} phòng chờ người chơi, hãy đợi hoặc rời bớt phòng`);
    }
    const id = newId('CARO');
    insertRoom.run({
      id,
      name,
      x_id: user.id,
      x_name: displayName(user),
      board: EMPTY.repeat(CELLS),
      now: nowIso(),
    });
    return id;
  });

  const joinRoom = db.transaction((roomId, user) => {
    closeStaleWaitingRooms();
    const room = findRoom(roomId);
    if (sideOf(room, user.id)) {
      throw new ApiError(409, 'Bạn đã ở trong phòng này', { room: toState(room) });
    }
    if (room.status === 'finished') {
      throw new ApiError(409, 'Phòng đã đóng', { room: toState(room) });
    }
    if (room.status !== 'waiting' || room.o_id) {
      throw new ApiError(409, 'Phòng đã đủ người', { room: toState(room) });
    }
    saveRoom(room, {
      status: 'playing',
      o_id: user.id,
      o_name: displayName(user),
      turn: 'x',
      updated_at: nowIso(),
    });
    return findRoom(roomId);
  });

  const playMove = db.transaction((roomId, user, row, col) => {
    const room = findRoom(roomId);
    const side = sideOf(room, user.id);
    if (!side) throw new ApiError(403, 'Bạn không phải người chơi trong phòng này');
    if (room.status !== 'playing') {
      throw new ApiError(409, room.status === 'waiting' ? 'Phòng chưa đủ hai người chơi' : 'Ván đã kết thúc');
    }
    if (room.turn !== side) throw new ApiError(409, 'Chưa đến lượt của bạn');

    const index = row * SIZE + col;
    if (room.board[index] !== EMPTY) throw new ApiError(409, 'Ô này đã có quân');

    const symbol = SYMBOL[side];
    const board = room.board.slice(0, index) + symbol + room.board.slice(index + 1);
    const moveCount = room.move_count + 1;
    const now = nowIso();

    let patch;
    if (isWinningMove(board, row, col, symbol)) {
      patch = { status: 'finished', turn: null, winner: side };
    } else if (moveCount === CELLS) {
      patch = { status: 'finished', turn: null, winner: 'draw' };
    } else {
      patch = { status: 'playing', turn: otherSide(side), winner: null };
    }
    saveRoom(room, { ...patch, board, move_count: moveCount, updated_at: now });
    if (patch.status === 'finished') settleMatch(room, patch.winner, now);
    return findRoom(roomId);
  });

  const leaveRoom = db.transaction((roomId, user) => {
    const room = findRoom(roomId);
    const side = sideOf(room, user.id);
    if (!side) throw new ApiError(403, 'Bạn không ở trong phòng này');
    if (room.status === 'finished') return room;

    const now = nowIso();
    if (room.status === 'waiting') {
      // Chủ phòng rời khi chưa có đối thủ: đóng phòng, không ghi kết quả.
      saveRoom(room, { status: 'finished', turn: null, winner: null, updated_at: now });
    } else {
      // Đang chơi: người rời bị xử thua. Bên còn lại thắng nhưng không được cộng điểm.
      const winner = otherSide(side);
      saveRoom(room, { status: 'finished', turn: null, winner, updated_at: now });
      settleMatch(room, winner, now, { awardWinner: false });
    }
    return findRoom(roomId);
  });

  router.get('/rooms', (_req, res) => {
    closeStaleWaitingRooms();
    res.json(selectWaiting.all(LIST_LIMIT).map(toSummary));
  });

  router.post('/rooms', (req, res) => {
    createLimiter.take(req.user.id);
    const body = requireObject(req.body ?? {});
    const name = cleanText(body.name, { label: 'Tên phòng', min: 2, max: 40 });
    const id = createRoomTx(req.user, name);
    res.status(201).json(toState(findRoom(id)));
  });

  router.get('/rooms/:id', (req, res) => {
    res.json(toState(findRoom(req.params.id)));
  });

  router.post('/rooms/:id/join', (req, res) => {
    res.json(toState(joinRoom(req.params.id, req.user)));
  });

  router.post('/rooms/:id/move', (req, res) => {
    const body = requireObject(req.body ?? {});
    const row = integerInRange(body.row, 'Hàng', 0, SIZE - 1);
    const col = integerInRange(body.col, 'Cột', 0, SIZE - 1);
    res.json(toState(playMove(req.params.id, req.user, row, col)));
  });

  router.post('/rooms/:id/leave', (req, res) => {
    res.json(toState(leaveRoom(req.params.id, req.user)));
  });

  return router;
}
