import { Router } from 'express';
import { EVENT_SELECT, findEvent, writeAudit } from '../db.js';
import { findBlocked } from '../profanity.js';
import { ApiError, cleanText, isClosed, isOrganizer, newId, parseIsoInstant, requireObject } from '../util.js';

const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

function requireWindow(start, end) {
  if (end.getTime() <= start.getTime()) {
    throw new ApiError(400, 'Thời gian kết thúc phải sau thời gian bắt đầu');
  }
  if (end.getTime() - start.getTime() > MAX_DURATION_MS) {
    throw new ApiError(400, 'Sự kiện không được kéo dài quá 24 giờ');
  }
}

// Trạng thái trả cho client: 'closed' khi đã đóng thủ công hoặc đã quá endsAt. DB không được ghi lại.
function withEffectiveStatus(event, now) {
  return { ...event, status: isClosed(event, now) ? 'closed' : event.status };
}

export function createEventsRouter({ db }) {
  const router = Router();

  // Trả sự kiện đang mở (kể cả đã quá endsAt, khi đó status là 'closed') hoặc đã đóng nhưng chưa tới endsAt.
  // Sắp xếp theo thời gian bắt đầu.
  router.get('/', (req, res) => {
    const now = new Date();
    const rows = db
      .prepare(`${EVENT_SELECT} WHERE e.status = 'open' OR e.ends_at > ? ORDER BY e.starts_at ASC`)
      .all(now.toISOString());
    res.json(rows.map((row) => withEffectiveStatus(row, now)));
  });

  router.post('/', (req, res) => {
    if (!isOrganizer(req.user)) {
      throw new ApiError(403, 'Chỉ quản trị hoặc IT được tạo sự kiện.');
    }
    const body = requireObject(req.body);
    const title = cleanText(body.title, { label: 'Tên sự kiện', min: 3, max: 120 });
    const description = cleanText(body.description, {
      label: 'Mô tả',
      max: 1000,
      multiline: true,
      optional: true,
    });
    if (findBlocked(title) || findBlocked(description)) {
      return res.status(422).json({ ok: false, error: 'content_rejected' });
    }
    const start = parseIsoInstant(body.startsAt, 'Thời gian bắt đầu');
    const end = parseIsoInstant(body.endsAt, 'Thời gian kết thúc');
    if (start.getTime() <= Date.now()) {
      throw new ApiError(400, 'Thời gian bắt đầu phải ở tương lai.');
    }
    requireWindow(start, end);

    const user = req.user;
    const id = newId('EV');
    const startsAt = start.toISOString();
    const endsAt = end.toISOString();
    // Tên hiển thị, không dùng email. Người tạo không có tên thì ghi "Ẩn danh".
    const createdByName = user.name || 'Ẩn danh';

    db.transaction(() => {
      db.prepare(
        `INSERT INTO events (id, title, description, starts_at, ends_at, status,
                             created_by_id, created_by_name, created_at)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
      ).run(id, title, description, startsAt, endsAt, String(user.id), createdByName, new Date().toISOString());
      writeAudit(db, user, { action: 'event.create', target: id, payload: { title, startsAt, endsAt } });
    }).immediate();

    res.status(201).json({ ok: true, id });
  });

  router.get('/:id', (req, res) => {
    const event = findEvent(db, req.params.id);
    if (!event) throw new ApiError(404, 'Không tìm thấy sự kiện');
    const programs = db
      .prepare(
        `SELECT id, performer_name AS performer, title, kind, duration_min AS durationMin,
                created_at AS createdAt
         FROM programs WHERE event_id = ? ORDER BY id ASC`,
      )
      .all(event.id);
    res.json({ event: withEffectiveStatus(event, new Date()), programs });
  });

  // Đóng sự kiện. Gọi lại khi đã đóng vẫn trả 200 và không ghi audit thêm.
  router.post('/:id/close', (req, res) => {
    if (!isOrganizer(req.user)) {
      throw new ApiError(403, 'Chỉ quản trị hoặc IT được đóng sự kiện.');
    }
    const event = findEvent(db, req.params.id);
    if (!event) throw new ApiError(404, 'Không tìm thấy sự kiện');

    db.transaction(() => {
      const info = db.prepare("UPDATE events SET status = 'closed' WHERE id = ? AND status = 'open'").run(event.id);
      if (info.changes === 0) return;
      writeAudit(db, req.user, { action: 'event.close', target: event.id, payload: {} });
    }).immediate();

    res.json({ ok: true });
  });

  return router;
}
