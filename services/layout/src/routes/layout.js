import express from 'express';
import {
  MOVE_ROTATIONS,
  PLACEMENT_ERROR,
  checkPlacement,
  isDeskId,
  isMovableId,
  placedPositions,
} from '../movable.js';

// Giới hạn: mỗi người 30 lần di chuyển mỗi phút (cửa sổ trượt, giữ trong bộ nhớ của tiến trình).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_MOVES = 30;
const RATE_MESSAGE = 'Bạn di chuyển quá nhanh, chờ một chút nhé.';
const DESK_MESSAGE = 'Không được di chuyển bàn làm việc.';
const NOT_MOVABLE_MESSAGE = 'Vật này không di chuyển được.';
const RESET_ROLES = new Set(['it', 'admin']);

function createMoveLimiter() {
  const hits = new Map();
  let calls = 0;

  return function allow(userId) {
    const now = Date.now();
    const cutoff = now - RATE_WINDOW_MS;

    // Dọn định kỳ các người dùng không còn lần nào trong cửa sổ, để Map không lớn mãi.
    calls += 1;
    if (calls % 500 === 0) {
      for (const [key, list] of hits) {
        if (!list.some((t) => t > cutoff)) hits.delete(key);
      }
    }

    const recent = (hits.get(userId) || []).filter((t) => t > cutoff);
    if (recent.length >= RATE_MAX_MOVES) {
      hits.set(userId, recent);
      return false;
    }
    recent.push(now);
    hits.set(userId, recent);
    return true;
  };
}

// Làm tròn toạ độ tới 0,1 m. Trả NaN nếu không phải số hữu hạn. "+ 0" đổi -0 thành 0.
function roundTenth(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return NaN;
  return Math.round(value * 10) / 10 + 0;
}

function displayName(user) {
  return user.name || user.email || user.id;
}

function bodyOf(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

export function createLayoutRouter({ store, model, hub }) {
  const router = express.Router();
  const allowMove = createMoveLimiter();

  function currentState() {
    const snap = store.snapshot();
    return { items: snap.items, defaults: model.defaults, version: snap.version };
  }

  router.get('/state', (_req, res) => {
    res.json(currentState());
  });

  router.get('/stream', (_req, res) => {
    if (!hub.open(res, currentState)) {
      res.status(503).json({ ok: false, error: 'Quá nhiều kết nối, thử lại sau.' });
    }
  });

  router.post('/move', (req, res) => {
    const user = req.user;
    if (!allowMove(user.id)) {
      return res.status(429).json({ ok: false, error: RATE_MESSAGE });
    }

    const body = bodyOf(req);
    const { id } = body;
    if (typeof id !== 'string' || id === '') {
      return res.status(400).json({ ok: false, error: 'Thiếu id vật cần di chuyển.' });
    }
    if (isDeskId(id)) {
      return res.status(403).json({ ok: false, error: DESK_MESSAGE });
    }
    if (!isMovableId(id)) {
      return res.status(404).json({ ok: false, error: NOT_MOVABLE_MESSAGE });
    }

    const x = roundTenth(body.x);
    const z = roundTenth(body.z);
    if (Number.isNaN(x) || Number.isNaN(z)) {
      return res.status(400).json({ ok: false, error: 'Toạ độ x, z phải là số.' });
    }
    const { rotation } = body;
    if (!MOVE_ROTATIONS.includes(rotation)) {
      return res.status(400).json({ ok: false, error: 'Góc xoay phải là 0, 90, 180 hoặc 270.' });
    }

    const result = store.move({
      id,
      x,
      z,
      rotation,
      who: user.email || user.id,
      movedBy: displayName(user),
      check: (items) => checkPlacement(model, { id, x, z, rotation }, placedPositions(model, items)),
    });
    if (!result.ok) {
      return res.status(409).json({ ok: false, error: PLACEMENT_ERROR });
    }

    hub.broadcast('move', {
      id,
      x,
      z,
      rotation,
      version: result.version,
      movedBy: result.item.movedBy,
    });
    return res.json({ ok: true, item: result.item, version: result.version });
  });

  router.post('/reset', (req, res) => {
    const user = req.user;
    if (!RESET_ROLES.has(user.role)) {
      return res.status(403).json({ ok: false, error: 'Chỉ IT hoặc admin mới được đặt lại bố trí.' });
    }

    const body = bodyOf(req);
    let id;
    if (body.id !== undefined && body.id !== null) {
      if (typeof body.id !== 'string' || body.id === '') {
        return res.status(400).json({ ok: false, error: 'id không hợp lệ.' });
      }
      if (isDeskId(body.id)) {
        return res.status(403).json({ ok: false, error: DESK_MESSAGE });
      }
      if (!isMovableId(body.id)) {
        return res.status(404).json({ ok: false, error: NOT_MOVABLE_MESSAGE });
      }
      id = body.id;
    }

    const result = store.reset({ id, who: user.email || user.id });
    if (result.changed) {
      hub.broadcast('reset', id === undefined ? { version: result.version } : { version: result.version, id });
    }
    return res.json({ ok: true, version: result.version });
  });

  return router;
}
