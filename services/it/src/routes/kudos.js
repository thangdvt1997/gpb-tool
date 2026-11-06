import { Router } from 'express';
import { writeAudit } from '../db.js';
import { findBlocked } from '../profanity.js';
import { ApiError, cleanText, newId, requireObject, vnDayKey } from '../util.js';

const DAILY_LIMIT_MSG = 'Hôm nay bạn đã gửi vinh danh rồi';
const BOARD_SIZE = 20;

export function createKudosRouter({ db }) {
  const router = Router();

  router.post('/', (req, res) => {
    const body = requireObject(req.body);
    const user = req.user;
    const toName = cleanText(body.toName, { label: 'Tên người nhận', min: 2, max: 80 });
    const message = cleanText(body.message, { label: 'Lời nhắn', min: 1, max: 140 });

    if (findBlocked(toName) || findBlocked(message)) {
      return res.status(422).json({ ok: false, error: 'content_rejected' });
    }

    const day = vnDayKey(new Date());
    // Mã nội bộ (chuỗi) dùng cho audit; id trả về cho client là số seq của bảng kudos.
    const textId = newId('KD');
    const fromUserId = String(user.id);
    // fromName lấy từ tên hiển thị, không dùng email.
    const fromName = user.name || 'Ẩn danh';
    let id = 0;

    try {
      db.transaction(() => {
        const already = db
          .prepare('SELECT 1 FROM kudos WHERE from_user_id = ? AND day_vn = ? LIMIT 1')
          .get(fromUserId, day);
        if (already) throw new ApiError(429, DAILY_LIMIT_MSG);
        const info = db
          .prepare(
            `INSERT INTO kudos (id, from_user_id, from_name, to_name, message, day_vn, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(textId, fromUserId, fromName, toName, message, day, new Date().toISOString());
        id = Number(info.lastInsertRowid);
        writeAudit(db, user, { action: 'kudos.create', target: textId, payload: { toName, message } });
      })();
    } catch (err) {
      // Ràng buộc UNIQUE (user, ngày) là lớp bảo vệ cuối nếu có ghi song song.
      if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new ApiError(429, DAILY_LIMIT_MSG);
      throw err;
    }

    res.status(201).json({ ok: true, id });
  });

  router.get('/board', (req, res) => {
    // id là số (seq), khớp với hợp đồng và KudosItem phía frontend.
    const rows = db
      .prepare(
        `SELECT seq AS id, from_name AS fromName, to_name AS toName, message, created_at AS createdAt
         FROM kudos ORDER BY seq DESC LIMIT ?`,
      )
      .all(BOARD_SIZE);
    res.json(rows);
  });

  return router;
}
