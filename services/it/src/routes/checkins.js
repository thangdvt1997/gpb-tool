import { Router } from 'express';
import { writeAudit } from '../db.js';
import { ApiError, requireObject, vnDayKey } from '../util.js';

const GATES = Object.freeze(['lift7']);
const DETAIL_ROLES = Object.freeze(['it', 'admin']);
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// ISO có offset +07:00, ví dụ 2026-11-06T09:00:00.123+07:00.
function vnIso(date) {
  return new Date(date.getTime() + VN_OFFSET_MS).toISOString().replace('Z', '+07:00');
}

function toCheckin(row) {
  return {
    userId: row.user_id,
    name: row.name,
    department: row.department,
    day: row.day,
    at: row.at,
    gate: row.gate,
  };
}

export function createCheckinsRouter({ db }) {
  const router = Router();

  const findOwn = db.prepare('SELECT * FROM checkins WHERE user_id = ? AND day = ?');

  router.post('/', (req, res) => {
    // Body tùy chọn: thiếu body thì express.json để req.body là undefined hoặc {}.
    const body = req.body === undefined ? {} : requireObject(req.body);
    const gate = body.gate === undefined ? 'lift7' : body.gate;
    if (typeof gate !== 'string' || !GATES.includes(gate)) {
      throw new ApiError(400, 'Cổng không hợp lệ');
    }

    const user = req.user;
    const userId = String(user.id);
    const now = new Date();
    const day = vnDayKey(now);
    let row = null;
    let created = false;

    db.transaction(() => {
      row = findOwn.get(userId, day);
      if (row) return;
      try {
        db.prepare(
          'INSERT INTO checkins (user_id, name, department, day, at, gate) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(userId, user.name || 'Ẩn danh', user.department || '', day, vnIso(now), gate);
      } catch (err) {
        // Ghi song song: UNIQUE (user_id, day) là lớp bảo vệ cuối, trả bản ghi đã có.
        if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          row = findOwn.get(userId, day);
          return;
        }
        throw err;
      }
      row = findOwn.get(userId, day);
      created = true;
      writeAudit(db, user, { action: 'checkin.create', target: `${userId}:${day}`, payload: { gate } });
    })();

    res.status(created ? 201 : 200).json({ ok: true, alreadyCheckedIn: !created, checkin: toCheckin(row) });
  });

  router.get('/me', (req, res) => {
    const day = vnDayKey(new Date());
    const row = findOwn.get(String(req.user.id), day);
    res.json({ ok: true, day, checkedIn: Boolean(row), checkin: row ? toCheckin(row) : null });
  });

  router.get('/today', (req, res) => {
    const detail = req.query.detail === '1';
    if (detail && !DETAIL_ROLES.includes(req.user.role)) {
      throw new ApiError(403, 'Không có quyền xem chi tiết');
    }
    const day = vnDayKey(new Date());
    const byDepartment = db
      .prepare(
        `SELECT department, COUNT(*) AS count FROM checkins WHERE day = ?
         GROUP BY department ORDER BY count DESC, department ASC`,
      )
      .all(day);
    const count = byDepartment.reduce((sum, d) => sum + d.count, 0);
    const out = { ok: true, day, count, byDepartment };
    if (detail) {
      out.items = db
        .prepare('SELECT user_id, name, department, at FROM checkins WHERE day = ? ORDER BY at ASC, id ASC')
        .all(day)
        .map((r) => ({ userId: r.user_id, name: r.name, department: r.department, at: r.at }));
    }
    res.json(out);
  });

  return router;
}
