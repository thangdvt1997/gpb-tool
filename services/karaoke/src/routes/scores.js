import { Router } from 'express';
import { getSongById } from '../data/songs.js';

const MAX_PLAYS_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;
const MAX_DURATION_MS = 600000;
const LEADERBOARD_SIZE = 20;
const HISTORY_SIZE = 20;
const LIMIT_MSG = 'Bạn đã hát quá nhiều lượt trong một giờ. Thử lại sau.';
// Hát ngắn hơn 50% thời lượng bài thì ghi cờ suspicious. Không từ chối. Cờ chỉ hiện ở lịch sử cá nhân, bảng xếp hạng bỏ qua lượt này.
const SUSPICIOUS_DURATION_RATIO = 0.5;
// Điều kiện lọc bảng xếp hạng: chỉ tính lượt không bị gắn cờ.
const LEADERBOARD_CLEAN_ONLY = 's.suspicious = 0';
const MAX_NAME_CHARS = 80;
const DEFAULT_NAME = 'Ẩn danh';

// Tên hiển thị: bỏ khoảng trắng thừa, cắt theo ký tự (không cắt đôi cặp thay thế), thiếu thì "Ẩn danh".
function displayName(name) {
  const clean = typeof name === 'string' ? name.trim() : '';
  if (!clean) return DEFAULT_NAME;
  return Array.from(clean).slice(0, MAX_NAME_CHARS).join('');
}

// Chỉ kiểm tra khoảng giá trị. Điểm do frontend tính và server không tính lại.
// Trả về thông báo lỗi tiếng Việt, hoặc null nếu hợp lệ.
function validateScoreBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return 'Dữ liệu gửi lên không hợp lệ';
  }
  if (typeof body.songId !== 'string' || !getSongById(body.songId)) {
    return 'Bài hát không tồn tại';
  }
  if (!Number.isInteger(body.score) || body.score < 0 || body.score > 100) {
    return 'Điểm phải là số nguyên từ 0 đến 100';
  }
  // Viết kiểu !(a && b) để NaN và Infinity cũng bị loại.
  if (typeof body.accuracy !== 'number' || !(body.accuracy >= 0 && body.accuracy <= 1)) {
    return 'Độ chính xác phải là số từ 0 đến 1';
  }
  if (!Number.isInteger(body.durationMs) || body.durationMs < 0 || body.durationMs > MAX_DURATION_MS) {
    return 'Thời lượng phải là số nguyên mili giây từ 0 đến 600000';
  }
  return null;
}

// whereClause phải bắt đầu bằng WHERE và luôn kèm LEADERBOARD_CLEAN_ONLY.
// Tên hiển thị cũng lấy từ lượt không bị gắn cờ để bảng xếp hạng chỉ dựa trên dữ liệu đã tính.
function leaderboardSql(whereClause) {
  return `
    SELECT
      (SELECT s2.user_name FROM scores s2
        WHERE s2.user_id = s.user_id AND s2.suspicious = 0
        ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1) AS userName,
      MAX(s.score) AS bestScore,
      COUNT(*) AS plays,
      MAX(s.created_at) AS lastPlayedAt
    FROM scores s
    ${whereClause}
    GROUP BY s.user_id
    ORDER BY bestScore DESC, plays DESC
    LIMIT ${LEADERBOARD_SIZE}`;
}

export function createScoresRouter({ db }) {
  const router = Router();

  const insertScore = db.prepare(
    `INSERT INTO scores (user_id, user_name, song_id, score, accuracy, duration_ms, created_at, suspicious)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const countRecent = db.prepare('SELECT COUNT(*) AS n FROM scores WHERE user_id = ? AND created_at >= ?');
  const leaderboardAll = db.prepare(leaderboardSql(`WHERE ${LEADERBOARD_CLEAN_ONLY}`));
  const leaderboardOne = db.prepare(leaderboardSql(`WHERE ${LEADERBOARD_CLEAN_ONLY} AND s.song_id = ?`));
  // Lịch sử cá nhân giữ cả lượt đáng ngờ, trường suspicious là 0 hoặc 1.
  const history = db.prepare(
    `SELECT song_id AS songId, score, accuracy, created_at AS createdAt, suspicious
     FROM scores WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ${HISTORY_SIZE}`,
  );

  // Đếm và ghi trong cùng một transaction IMMEDIATE: giữ khóa ghi trước khi đếm,
  // nên tiến trình khác ghi vào cùng file cũng không vượt được giới hạn.
  const recordScore = db.transaction((entry, now) => {
    const since = new Date(now.getTime() - HOUR_MS).toISOString();
    const { n } = countRecent.get(entry.userId, since);
    if (n >= MAX_PLAYS_PER_HOUR) return null;
    const info = insertScore.run(
      entry.userId,
      entry.userName,
      entry.songId,
      entry.score,
      entry.accuracy,
      entry.durationMs,
      now.toISOString(),
      entry.suspicious,
    );
    return Number(info.lastInsertRowid);
  });

  router.post('/scores', (req, res) => {
    const error = validateScoreBody(req.body);
    if (error) {
      return res.status(400).json({ ok: false, error });
    }
    const { user, body } = req;
    // validateScoreBody đã xác nhận songId tồn tại.
    const song = getSongById(body.songId);
    const suspicious = body.durationMs < song.durationMs * SUSPICIOUS_DURATION_RATIO ? 1 : 0;
    const id = recordScore.immediate(
      {
        userId: String(user.id),
        // Không dùng email làm tên hiển thị trên bảng xếp hạng.
        userName: displayName(user.name),
        songId: body.songId,
        score: body.score,
        accuracy: body.accuracy,
        durationMs: body.durationMs,
        suspicious,
      },
      new Date(),
    );
    if (id === null) {
      return res.status(429).json({ ok: false, error: LIMIT_MSG });
    }
    return res.status(201).json({ ok: true, id });
  });

  router.get('/leaderboard', (req, res) => {
    const { songId } = req.query;
    let rows;
    if (songId === undefined || songId === '') {
      rows = leaderboardAll.all();
    } else if (typeof songId === 'string' && getSongById(songId)) {
      rows = leaderboardOne.all(songId);
    } else {
      return res.status(400).json({ ok: false, error: 'Bài hát không tồn tại' });
    }
    return res.json(rows);
  });

  router.get('/me/history', (req, res) => {
    res.json(history.all(String(req.user.id)));
  });

  return router;
}
