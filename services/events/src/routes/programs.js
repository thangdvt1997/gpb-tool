import { Router } from 'express';
import { findEvent, writeAudit } from '../db.js';
import { findBlocked } from '../profanity.js';
import { ApiError, cleanText, isClosed, oneOf, requireObject } from '../util.js';

const MAX_PROGRAMS_PER_EVENT = 30;
const PROGRAM_KINDS = ['singing', 'dance', 'poem', 'game', 'other'];
const MAX_DURATION_MIN = 30;

export function createProgramsRouter({ db }) {
  const router = Router();

  router.post('/:id/programs', (req, res) => {
    const body = requireObject(req.body);
    const performer = cleanText(body.performer, { label: 'Tên người biểu diễn', min: 2, max: 80 });
    const title = cleanText(body.title, { label: 'Tên tiết mục', min: 3, max: 120 });
    if (findBlocked(title) || findBlocked(performer)) {
      return res.status(422).json({ ok: false, error: 'content_rejected' });
    }
    const kind = oneOf(body.kind, PROGRAM_KINDS, 'Loại tiết mục không hợp lệ');
    const durationMin = body.durationMin;
    if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > MAX_DURATION_MIN) {
      throw new ApiError(400, `Thời lượng phải là số nguyên từ 1 đến ${MAX_DURATION_MIN} phút`);
    }

    const user = req.user;
    // Người đăng ký là người đang đăng nhập, không lấy từ body.
    const performerUserId = String(user.id);
    const eventId = req.params.id;
    const now = new Date();
    const createdAt = now.toISOString();

    const programId = db.transaction(() => {
      const event = findEvent(db, eventId);
      if (!event) throw new ApiError(404, 'Không tìm thấy sự kiện');
      if (isClosed(event, now)) {
        throw new ApiError(409, 'Sự kiện đã đóng, không nhận đăng ký thêm.');
      }
      const already = db
        .prepare('SELECT 1 FROM programs WHERE event_id = ? AND performer_user_id = ? LIMIT 1')
        .get(event.id, performerUserId);
      if (already) throw new ApiError(409, 'Bạn đã đăng ký tiết mục trong sự kiện này rồi.');

      const { count } = db.prepare('SELECT COUNT(*) AS count FROM programs WHERE event_id = ?').get(event.id);
      if (count >= MAX_PROGRAMS_PER_EVENT) {
        throw new ApiError(409, `Sự kiện đã đủ ${MAX_PROGRAMS_PER_EVENT} tiết mục.`);
      }

      let info;
      try {
        info = db
          .prepare(
            `INSERT INTO programs (event_id, performer_name, performer_user_id, title, kind, duration_min, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(event.id, performer, performerUserId, title, kind, durationMin, createdAt);
      } catch (err) {
        // Lớp bảo vệ cuối cho ràng buộc một người một tiết mục.
        if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new ApiError(409, 'Bạn đã đăng ký tiết mục trong sự kiện này rồi.');
        }
        throw err;
      }
      const id = Number(info.lastInsertRowid);
      writeAudit(db, user, {
        action: 'program.create',
        target: event.id,
        payload: { programId: id, title, kind, durationMin },
      });
      return id;
    }).immediate();

    res.status(201).json({ ok: true, id: programId });
  });

  return router;
}
