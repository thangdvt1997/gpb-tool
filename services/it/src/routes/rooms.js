import { Router } from 'express';
import { ROOMS } from '../data/rooms.js';
import { writeAudit } from '../db.js';
import { ApiError, cleanText, newId, parseIsoInstant, requireObject } from '../util.js';

const MAX_WINDOW_MS = 8 * 60 * 60 * 1000;

function requireWindow(start, end) {
  if (end.getTime() <= start.getTime()) {
    throw new ApiError(400, 'Giờ kết thúc phải sau giờ bắt đầu');
  }
  if (end.getTime() - start.getTime() > MAX_WINDOW_MS) {
    throw new ApiError(400, 'Khoảng thời gian tối đa là 8 giờ');
  }
}

export function createRoomsRouter({ db }) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(ROOMS);
  });

  router.get('/free', (req, res) => {
    const { start: rawStart, end: rawEnd } = req.query;
    if (!rawStart || !rawEnd) throw new ApiError(400, 'Thiếu tham số start hoặc end');
    const start = parseIsoInstant(rawStart, 'start');
    const end = parseIsoInstant(rawEnd, 'end');
    requireWindow(start, end);

    // Trùng lịch khi existing.start < end AND existing.end > start.
    const busy = new Set(
      db
        .prepare('SELECT DISTINCT room_id FROM bookings WHERE start_at < ? AND end_at > ?')
        .all(end.toISOString(), start.toISOString())
        .map((row) => row.room_id),
    );
    res.json(ROOMS.filter((room) => !busy.has(room.id)));
  });

  router.post('/book', (req, res) => {
    const body = requireObject(req.body);
    const room = ROOMS.find((r) => r.id === body.roomId);
    if (!room) throw new ApiError(400, 'Phòng không tồn tại');
    const start = parseIsoInstant(body.start, 'start');
    const end = parseIsoInstant(body.end, 'end');
    requireWindow(start, end);
    if (start.getTime() < Date.now()) {
      throw new ApiError(400, 'Không thể đặt phòng trong quá khứ');
    }
    const title = cleanText(body.title, { label: 'Tiêu đề cuộc họp', min: 1, max: 120 });

    const user = req.user;
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const bookingId = newId('BK');

    // Kiểm tra trùng và ghi trong cùng transaction (better-sqlite3 đồng bộ, không có khoảng hở giữa hai bước).
    const booked = db.transaction(() => {
      const clash = db
        .prepare('SELECT 1 FROM bookings WHERE room_id = ? AND start_at < ? AND end_at > ? LIMIT 1')
        .get(room.id, endIso, startIso);
      if (clash) return false;
      db.prepare(
        `INSERT INTO bookings (id, room_id, start_at, end_at, title,
                               booked_by_id, booked_by_email, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        bookingId,
        room.id,
        startIso,
        endIso,
        title,
        user.id,
        user.email || '',
        new Date().toISOString(),
      );
      writeAudit(db, user, {
        action: 'booking.create',
        target: bookingId,
        payload: { roomId: room.id, start: startIso, end: endIso, title },
      });
      return true;
    })();

    if (!booked) {
      return res.status(409).json({ ok: false, error: 'Phòng đã có người đặt trong khoảng này' });
    }
    res.status(201).json({ ok: true, bookingId });
  });

  return router;
}
