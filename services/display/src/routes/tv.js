import express from 'express';
import { CHANNELS, TV_IDS } from '../config.js';
import { readTv, writeAudit } from '../db.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isChannelId(value) {
  return Number.isInteger(value) && CHANNELS.some((channel) => channel.id === value);
}

function displayName(user) {
  return user.name || user.email || user.id;
}

// Mọi nhân viên đều đổi được kênh và bật tắt tivi. Mỗi thay đổi phát sự kiện 'tv' tới mọi client.
export function createTvRouter({ db, hub }) {
  const router = express.Router();

  router.post('/:tvId', (req, res) => {
    const { tvId } = req.params;
    if (!TV_IDS.includes(tvId)) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy tivi' });
    }

    const body = req.body;
    if (!isPlainObject(body)) {
      return res.status(400).json({ ok: false, error: 'Dữ liệu không hợp lệ' });
    }
    const hasOn = body.on !== undefined;
    const hasChannel = body.channel !== undefined;
    if (!hasOn && !hasChannel) {
      return res.status(400).json({ ok: false, error: 'Cần ít nhất một trong hai trường: on hoặc channel' });
    }
    if (hasOn && typeof body.on !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'on phải là true hoặc false' });
    }
    if (hasChannel && !isChannelId(body.channel)) {
      return res.status(400).json({ ok: false, error: `channel phải là số nguyên từ 1 đến ${CHANNELS.length}` });
    }

    const user = req.user;
    const tv = db.transaction(() => {
      const current = readTv(db, tvId);
      const on = hasOn ? body.on : current.on;
      const channel = hasChannel ? body.channel : current.channel;
      db.prepare('UPDATE tvs SET on_air = ?, channel = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(
        on ? 1 : 0,
        channel,
        new Date().toISOString(),
        displayName(user),
        tvId,
      );
      if (hasOn) writeAudit(db, user, on ? 'tv.on' : 'tv.off', tvId);
      if (hasChannel) writeAudit(db, user, 'tv.channel', `${tvId}:${channel}`);
      return readTv(db, tvId);
    })();

    hub.broadcast('tv', tv);
    return res.json({ tv });
  });

  return router;
}
