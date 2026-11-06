import { Router } from 'express';
import { ApiError, createRateLimiter, integerInRange, newId, requireObject } from '../util.js';

const MODES = Object.freeze(['fight', 'dance']);
const START_HP = 100;
const DAMAGE_PER_POWER = 10;
const INVITE_TTL_MS = 30_000;
const DOWN_MS = 30_000;
const IDLE_MS = 3 * 60_000;
const DIRECTORY_TIMEOUT_MS = 3_000;
const MAX_ID_LENGTH = 100;
const TZ_OFFSET_MS = 7 * 3_600_000;

// Thời gian theo hợp đồng: ISO có offset +07:00. Chuỗi cùng độ dài và cùng offset nên so sánh chuỗi đúng thứ tự thời gian.
function isoAt(ms) {
  return new Date(ms + TZ_OFFSET_MS).toISOString().replace('Z', '+07:00');
}

function otherOf(duel, userId) {
  return duel.inviter_id === userId ? duel.invitee_id : duel.inviter_id;
}

function isParticipant(duel, userId) {
  return duel.inviter_id === userId || duel.invitee_id === userId;
}

// Chỉ trả cho người tham gia. Không có tên và không có email.
function toDuel(d) {
  const isFight = d.mode === 'fight';
  return {
    id: d.id,
    mode: d.mode,
    status: d.status,
    inviterId: d.inviter_id,
    inviteeId: d.invitee_id,
    createdAt: d.created_at,
    expiresAt: d.status === 'invited' ? isoAt(Date.parse(d.created_at) + INVITE_TTL_MS) : null,
    acceptedAt: d.accepted_at,
    endedAt: d.ended_at,
    winnerId: d.winner_id,
    hp: isFight ? { inviter: d.hp_inviter, invitee: d.hp_invitee } : null,
    down: d.down_user_id ? { userId: d.down_user_id, downUntil: d.down_until } : null,
    lastHit: d.last_hit_by
      ? { by: d.last_hit_by, power: d.last_hit_power, damage: d.last_hit_damage, at: d.last_hit_at }
      : null,
  };
}

function parseUserId(value) {
  const ok =
    (typeof value === 'string' && value.length > 0) || (typeof value === 'number' && Number.isFinite(value));
  const id = ok ? String(value).trim() : '';
  if (!id || id.length > MAX_ID_LENGTH) throw new ApiError(400, 'targetUserId không hợp lệ');
  return id;
}

// Hỏi auth xem người được mời có phải nhân viên đang hoạt động không (forward cookie của người mời).
// Không xác minh được thì từ chối (fail closed).
async function isActiveEmployee({ authUrl, fetchImpl, cookie, targetId }) {
  try {
    const headers = { Accept: 'application/json' };
    if (cookie) headers.Cookie = cookie;
    const res = await fetchImpl(`${authUrl}/api/auth/directory/${encodeURIComponent(targetId)}`, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(DIRECTORY_TIMEOUT_MS),
    });
    if (res.status !== 200) {
      await res.arrayBuffer().catch(() => {});
      return false;
    }
    const body = await res.json();
    return Boolean(body) && body.id !== undefined && body.id !== null && String(body.id) === targetId;
  } catch {
    return false;
  }
}

export function createDuelRouter({ db, config, fetchImpl = fetch }) {
  const router = Router();

  const selectDuel = db.prepare('SELECT * FROM duels WHERE id = ?');
  const selectBusy = db.prepare(
    `SELECT id FROM duels WHERE status IN ('invited', 'active') AND (inviter_id IN (@a, @b) OR invitee_id IN (@a, @b)) LIMIT 1`,
  );
  const selectInbox = db.prepare(
    `SELECT * FROM duels WHERE status = 'invited' AND (inviter_id = @u OR invitee_id = @u) ORDER BY created_at DESC LIMIT 20`,
  );
  const selectActive = db.prepare(
    `SELECT * FROM duels WHERE status = 'active' AND (inviter_id = @u OR invitee_id = @u) LIMIT 1`,
  );
  const insertDuel = db.prepare(
    `INSERT INTO duels (id, mode, status, inviter_id, invitee_id, created_at, updated_at)
     VALUES (@id, @mode, 'invited', @inviter, @invitee, @now, @now)`,
  );
  const expireInvites = db.prepare(
    `UPDATE duels SET status = 'expired', ended_at = @now, updated_at = @now
     WHERE status = 'invited' AND created_at <= @cutoff`,
  );
  // Hết giờ nằm đỡ: trận kết thúc, người nằm đỡ thua.
  const finishDownExpired = db.prepare(
    `UPDATE duels SET status = 'finished', ended_at = @now, updated_at = @now,
       winner_id = CASE WHEN down_user_id = inviter_id THEN invitee_id ELSE inviter_id END
     WHERE status = 'active' AND down_user_id IS NOT NULL AND down_until <= @now`,
  );
  const finishIdle = db.prepare(
    `UPDATE duels SET status = 'finished', ended_at = @now, updated_at = @now, winner_id = NULL
     WHERE status = 'active' AND updated_at <= @cutoff`,
  );
  const activate = db.prepare(
    `UPDATE duels SET status = 'active', accepted_at = @now, updated_at = @now,
       hp_inviter = @hp, hp_invitee = @hp
     WHERE id = @id AND status = 'invited'`,
  );
  const closeDuel = db.prepare(
    `UPDATE duels SET status = @status, ended_at = @now, updated_at = @now, winner_id = @winner
     WHERE id = @id AND status = @from`,
  );
  const saveHit = db.prepare(
    `UPDATE duels SET hp_inviter = @hp_inviter, hp_invitee = @hp_invitee,
       down_user_id = @down_user_id, down_until = @down_until,
       last_hit_by = @by, last_hit_power = @power, last_hit_damage = @damage, last_hit_at = @now,
       updated_at = @now
     WHERE id = @id`,
  );
  const touch = db.prepare(`UPDATE duels SET updated_at = @now WHERE id = @id AND status = 'active'`);

  const inviteLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 10,
    message: 'Gửi lời mời quá nhanh, hãy thử lại sau ít phút',
  });
  // 30 đòn mỗi phút cho mỗi người (đòn bị từ chối vì sai trạng thái cũng tính, để chặn spam).
  const hitLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 30,
    message: 'Quá nhiều đòn trong một phút',
  });

  // Hết hạn theo request, không dùng timer nền. Gọi ở đầu mọi route.
  const sweep = db.transaction(() => {
    const now = Date.now();
    expireInvites.run({ now: isoAt(now), cutoff: isoAt(now - INVITE_TTL_MS) });
    finishDownExpired.run({ now: isoAt(now) });
    finishIdle.run({ now: isoAt(now), cutoff: isoAt(now - IDLE_MS) });
  });

  function loadFor(id, userId) {
    const duel = selectDuel.get(id);
    if (!duel) throw new ApiError(404, 'Không tìm thấy trận');
    if (!isParticipant(duel, userId)) throw new ApiError(403, 'Bạn không tham gia trận này');
    return duel;
  }

  // Bọc handler: sweep trước, chuyển lỗi sang middleware lỗi (Express 4 không tự bắt lỗi async).
  const route = (fn) => async (req, res, next) => {
    try {
      sweep();
      await fn(req, res);
    } catch (err) {
      next(err);
    }
  };

  const inviteTx = db.transaction((user, targetId, mode) => {
    if (selectBusy.get({ a: user.id, b: targetId })) {
      throw new ApiError(409, 'Một trong hai người đã có trận hoặc lời mời đang chờ');
    }
    const id = newId('DUEL');
    insertDuel.run({ id, mode, inviter: user.id, invitee: targetId, now: isoAt(Date.now()) });
    return selectDuel.get(id);
  });

  const acceptTx = db.transaction((id, user) => {
    const duel = loadFor(id, user.id);
    if (duel.invitee_id !== user.id) throw new ApiError(403, 'Chỉ người được mời mới chấp nhận được');
    if (duel.status !== 'invited') throw new ApiError(409, 'Lời mời không còn hiệu lực');
    if (selectActive.get({ u: duel.inviter_id }) || selectActive.get({ u: duel.invitee_id })) {
      throw new ApiError(409, 'Một trong hai người đang có trận');
    }
    activate.run({ id, now: isoAt(Date.now()), hp: duel.mode === 'fight' ? START_HP : null });
    return selectDuel.get(id);
  });

  const declineTx = db.transaction((id, user) => {
    const duel = loadFor(id, user.id);
    if (duel.invitee_id !== user.id) throw new ApiError(403, 'Chỉ người được mời mới từ chối được');
    if (duel.status !== 'invited') throw new ApiError(409, 'Lời mời không còn hiệu lực');
    closeDuel.run({ id, from: 'invited', status: 'cancelled', now: isoAt(Date.now()), winner: null });
    return selectDuel.get(id);
  });

  const hitTx = db.transaction((id, user, power) => {
    const duel = loadFor(id, user.id);
    if (duel.status !== 'active') throw new ApiError(409, 'Trận không đang diễn ra');
    if (duel.mode !== 'fight') throw new ApiError(409, 'Chỉ đánh được trong trận fight');
    if (duel.down_user_id) throw new ApiError(409, 'Một bên đang nằm đỡ, không thể ra đòn');
    const damage = DAMAGE_PER_POWER * power;
    const now = Date.now();
    const hits = { hp_inviter: duel.hp_inviter, hp_invitee: duel.hp_invitee };
    const targetIsInviter = duel.invitee_id === user.id;
    const key = targetIsInviter ? 'hp_inviter' : 'hp_invitee';
    hits[key] = Math.max(0, hits[key] - damage);
    const targetId = otherOf(duel, user.id);
    const down = hits[key] === 0;
    saveHit.run({
      id,
      ...hits,
      down_user_id: down ? targetId : null,
      down_until: down ? isoAt(now + DOWN_MS) : null,
      by: user.id,
      power,
      damage,
      now: isoAt(now),
    });
    return selectDuel.get(id);
  });

  const endTx = db.transaction((id, user, mode) => {
    const duel = loadFor(id, user.id);
    if (duel.mode !== mode) throw new ApiError(409, 'Sai chế độ trận');
    if (duel.status !== 'active') throw new ApiError(409, 'Trận không đang diễn ra');
    const winner = mode === 'fight' ? otherOf(duel, user.id) : null;
    closeDuel.run({ id, from: 'active', status: 'finished', now: isoAt(Date.now()), winner });
    return selectDuel.get(id);
  });

  router.post(
    '/invite',
    route(async (req, res) => {
      const body = requireObject(req.body ?? {});
      const targetId = parseUserId(body.targetUserId);
      if (typeof body.mode !== 'string' || !MODES.includes(body.mode)) {
        throw new ApiError(400, 'Chế độ phải là fight hoặc dance');
      }
      if (targetId === req.user.id) throw new ApiError(400, 'Không thể tự mời chính mình');
      inviteLimiter.take(req.user.id);
      const cookie = typeof req.headers.cookie === 'string' ? req.headers.cookie : '';
      const active = await isActiveEmployee({
        authUrl: config.authUrl,
        fetchImpl,
        cookie,
        targetId,
      });
      if (!active) throw new ApiError(403, 'Người được mời không phải nhân viên đang hoạt động');
      const duel = inviteTx(req.user, targetId, body.mode);
      res.status(201).json({ ok: true, duel: toDuel(duel) });
    }),
  );

  router.get(
    '/inbox',
    route(async (req, res) => {
      res.json({ ok: true, duels: selectInbox.all({ u: req.user.id }).map(toDuel) });
    }),
  );

  router.get(
    '/active',
    route(async (req, res) => {
      const duel = selectActive.get({ u: req.user.id });
      if (duel && duel.mode === 'dance') touch.run({ id: duel.id, now: isoAt(Date.now()) });
      res.json({ ok: true, duel: duel ? toDuel(selectDuel.get(duel.id)) : null });
    }),
  );

  router.post(
    '/:id/accept',
    route(async (req, res) => {
      res.json({ ok: true, duel: toDuel(acceptTx(req.params.id, req.user)) });
    }),
  );

  router.post(
    '/:id/decline',
    route(async (req, res) => {
      res.json({ ok: true, duel: toDuel(declineTx(req.params.id, req.user)) });
    }),
  );

  router.post(
    '/:id/hit',
    route(async (req, res) => {
      hitLimiter.take(req.user.id);
      const body = requireObject(req.body ?? {});
      const power = integerInRange(body.power, 'Power', 1, 3);
      res.json({ ok: true, duel: toDuel(hitTx(req.params.id, req.user, power)) });
    }),
  );

  router.post(
    '/:id/forfeit',
    route(async (req, res) => {
      res.json({ ok: true, duel: toDuel(endTx(req.params.id, req.user, 'fight')) });
    }),
  );

  router.post(
    '/:id/leave',
    route(async (req, res) => {
      res.json({ ok: true, duel: toDuel(endTx(req.params.id, req.user, 'dance')) });
    }),
  );

  router.get(
    '/:id',
    route(async (req, res) => {
      const duel = loadFor(req.params.id, req.user.id);
      // Trận dance không có đòn nên không có tín hiệu hoạt động: người tham gia đang xem thì giữ trận sống.
      if (duel.status === 'active' && duel.mode === 'dance') {
        touch.run({ id: duel.id, now: isoAt(Date.now()) });
      }
      res.json({ ok: true, duel: toDuel(selectDuel.get(duel.id)) });
    }),
  );

  return router;
}
