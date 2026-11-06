import { Router } from 'express';
import { findEvent, writeAudit } from '../db.js';
import { ApiError, isClosed, isOrganizer, requireObject } from '../util.js';

export function createVotesRouter({ db }) {
  const router = Router();

  // Mỗi người một phiếu trong mỗi sự kiện (UNIQUE(event_id, voter_user_id) là lớp bảo vệ cuối).
  router.post('/:id/vote', (req, res) => {
    const body = requireObject(req.body);
    const programId = body.programId;
    if (!Number.isSafeInteger(programId) || programId < 1) {
      throw new ApiError(400, 'Mã tiết mục không hợp lệ');
    }

    const user = req.user;
    const voterId = String(user.id);
    const now = new Date();
    const createdAt = now.toISOString();

    try {
      db.transaction(() => {
        const event = findEvent(db, req.params.id);
        if (!event) throw new ApiError(404, 'Không tìm thấy sự kiện');
        if (isClosed(event, now)) {
          throw new ApiError(409, 'Sự kiện đã đóng, không nhận bình chọn.');
        }
        const program = db
          .prepare('SELECT performer_user_id AS performerUserId FROM programs WHERE id = ? AND event_id = ?')
          .get(programId, event.id);
        if (!program) throw new ApiError(400, 'Tiết mục không thuộc sự kiện này');
        if (program.performerUserId === voterId) {
          throw new ApiError(409, 'Bạn không thể bình chọn tiết mục của chính mình.');
        }
        const already = db
          .prepare('SELECT 1 FROM votes WHERE event_id = ? AND voter_user_id = ? LIMIT 1')
          .get(event.id, voterId);
        if (already) throw new ApiError(409, 'Bạn đã bình chọn trong sự kiện này rồi.');

        db.prepare(
          'INSERT INTO votes (event_id, program_id, voter_user_id, created_at) VALUES (?, ?, ?, ?)',
        ).run(event.id, programId, voterId, createdAt);
        // Không ghi programId vào audit: hash của số nhỏ dễ dò ngược, làm lộ phiếu kín.
        writeAudit(db, user, { action: 'vote.create', target: event.id, payload: {} });
      }).immediate();
    } catch (err) {
      if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new ApiError(409, 'Bạn đã bình chọn trong sự kiện này rồi.');
      }
      throw err;
    }

    res.status(201).json({ ok: true });
  });

  // Kết quả công bố khi sự kiện đã đóng, hoặc khi người gọi là IT/quản trị.
  router.get('/:id/results', (req, res) => {
    const event = findEvent(db, req.params.id);
    if (!event) throw new ApiError(404, 'Không tìm thấy sự kiện');
    if (!isClosed(event, new Date()) && !isOrganizer(req.user)) {
      throw new ApiError(403, 'Kết quả sẽ công bố khi sự kiện kết thúc.');
    }
    const rows = db
      .prepare(
        `SELECT p.id AS programId, p.performer_name AS performer, p.title, COUNT(v.id) AS votes
         FROM programs p
         LEFT JOIN votes v ON v.program_id = p.id
         WHERE p.event_id = ?
         GROUP BY p.id
         ORDER BY votes DESC, p.id ASC`,
      )
      .all(event.id);
    res.json(rows);
  });

  return router;
}
