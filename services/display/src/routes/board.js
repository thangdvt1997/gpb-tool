import express from 'express';
import { BOARD_IDS, MAX_STROKES_PER_BOARD, MAX_STROKES_PER_USER_PER_MINUTE } from '../config.js';
import { countStrokes, readBoardVersion, writeAudit } from '../db.js';

const WINDOW_MS = 60_000;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const CLEAR_ROLES = ['it', 'admin'];
const MAX_POINTS = 500;
const MIN_POINTS = 2;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isUnit(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function displayName(user) {
  return user.name || user.email || user.id;
}

// Kiểm tra và chuẩn hóa nét vẽ. Trả về { value } khi hợp lệ, { error } khi không.
function parseStroke(body) {
  if (!isPlainObject(body)) return { error: 'Dữ liệu nét vẽ không hợp lệ' };

  const { points, color, width } = body;
  if (!Array.isArray(points) || points.length < MIN_POINTS || points.length > MAX_POINTS) {
    return { error: `points phải có từ ${MIN_POINTS} đến ${MAX_POINTS} điểm` };
  }
  const normalized = [];
  for (const point of points) {
    if (!Array.isArray(point) || point.length !== 2 || !isUnit(point[0]) || !isUnit(point[1])) {
      return { error: 'Mỗi điểm phải là [x, y] với x và y nằm trong khoảng [0, 1]' };
    }
    normalized.push([round4(point[0]), round4(point[1])]);
  }
  if (typeof color !== 'string' || !HEX_COLOR.test(color)) {
    return { error: 'color phải có dạng #RRGGBB' };
  }
  if (!Number.isInteger(width) || width < 1 || width > 12) {
    return { error: 'width phải là số nguyên từ 1 đến 12' };
  }
  return { value: { points: normalized, color, width } };
}

// Giới hạn nét theo người trong cửa sổ trượt, giữ trong bộ nhớ (mất khi khởi động lại).
// Mỗi người giữ tối đa `limit` mốc thời gian nên bộ nhớ bị chặn. Định kỳ xóa người không còn trong cửa sổ.
function createStrokeLimiter({ limit, windowMs }) {
  const hits = new Map();

  function recent(key, now) {
    return (hits.get(key) || []).filter((at) => now - at < windowMs);
  }

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const key of [...hits.keys()]) {
      const list = recent(key, now);
      if (list.length > 0) hits.set(key, list);
      else hits.delete(key);
    }
  }, windowMs);
  sweep.unref();

  return {
    // Trả về số giây cần chờ. 0 nghĩa là còn quota.
    wait(key, now = Date.now()) {
      const list = recent(key, now);
      if (list.length < limit) return 0;
      return Math.ceil((list[0] + windowMs - now) / 1000);
    },
    record(key, now = Date.now()) {
      const list = recent(key, now);
      list.push(now);
      hits.set(key, list);
    },
  };
}

function requireBoard(req, res, next) {
  if (!BOARD_IDS.includes(req.params.boardId)) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy bảng' });
  }
  return next();
}

export function createBoardRouter({ db, hub }) {
  const router = express.Router();
  const limiter = createStrokeLimiter({ limit: MAX_STROKES_PER_USER_PER_MINUTE, windowMs: WINDOW_MS });

  router.post('/:boardId/strokes', requireBoard, (req, res) => {
    const parsed = parseStroke(req.body);
    if (parsed.error) {
      return res.status(400).json({ ok: false, error: parsed.error });
    }

    const { boardId } = req.params;
    const user = req.user;
    const userName = displayName(user);
    const createdAt = new Date().toISOString();
    const { points, color, width } = parsed.value;

    // Kiểm tra sức chứa, quota và ghi nằm trong một transaction đồng bộ nên không request nào chen vào giữa.
    // Nét bị 409 hoặc 429 không được ghi và không tính vào quota.
    const outcome = db.transaction(() => {
      if (countStrokes(db, boardId) >= MAX_STROKES_PER_BOARD) {
        return { status: 409 };
      }
      const retryAfter = limiter.wait(user.id);
      if (retryAfter > 0) {
        return { status: 429, retryAfter };
      }

      const info = db
        .prepare('INSERT INTO strokes (board_id, user_name, color, width, points, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(boardId, userName, color, width, JSON.stringify(points), createdAt);
      db.prepare('UPDATE boards SET version = version + 1 WHERE id = ?').run(boardId);
      const version = readBoardVersion(db, boardId);
      writeAudit(db, user, 'board.stroke', boardId);
      limiter.record(user.id);

      return {
        status: 201,
        version,
        stroke: { id: Number(info.lastInsertRowid), color, width, points, userName, createdAt },
      };
    })();

    if (outcome.status === 409) {
      return res.status(409).json({ ok: false, error: 'Bảng đã đầy, cần quản trị viên xóa bảng.' });
    }
    if (outcome.status === 429) {
      res.set('Retry-After', String(outcome.retryAfter));
      return res.status(429).json({ ok: false, error: 'Bạn vẽ quá nhanh, thử lại sau ít phút' });
    }

    hub.broadcast('stroke', { boardId, version: outcome.version, stroke: outcome.stroke });
    return res.status(201).json({ version: outcome.version });
  });

  router.post('/:boardId/clear', requireBoard, (req, res) => {
    if (!CLEAR_ROLES.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: 'Chỉ IT hoặc quản trị viên được xóa bảng' });
    }

    const { boardId } = req.params;
    const version = db.transaction(() => {
      db.prepare('DELETE FROM strokes WHERE board_id = ?').run(boardId);
      db.prepare('UPDATE boards SET version = version + 1 WHERE id = ?').run(boardId);
      writeAudit(db, req.user, 'board.clear', boardId);
      return readBoardVersion(db, boardId);
    })();

    hub.broadcast('clear', { boardId, version });
    return res.status(200).json({ version });
  });

  return router;
}
