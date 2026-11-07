import express from 'express';
import { createAuthMiddleware } from './auth.js';

// HTTP chỉ còn health và snapshot đọc. Kênh realtime là WebSocket (wsServer.js), không còn SSE.
export function createApp({ world, hub, presence, authClient, turn }) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    const s = presence.stats();
    res.json({ ok: true, tick: world.getTick(), connections: hub.size(), players: s.players });
  });

  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // Mỗi request kiểm tra lại phiên qua auth.
  app.use(createAuthMiddleware(authClient));

  app.get('/api/world/presence', (req, res) => {
    res.json({ ok: true, ...world.snapshot(req.user) });
  });

  // Credential TURN ngắn hạn cho thoại WebRTC. Chỉ người đã đăng nhập (middleware ở trên).
  app.get('/api/world/turn', (req, res) => {
    const out = turn && turn.issue(req.user);
    if (!out) return res.status(503).json({ ok: false, error: 'turn_unavailable' });
    return res.json({ ok: true, ...out });
  });

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'not_found' });
  });

  app.use((err, _req, res, _next) => {
    console.error(`[world] lỗi không mong đợi: ${err && err.message ? err.message : 'unknown'}`);
    return res.status(500).json({ ok: false, error: 'server_error' });
  });

  return app;
}
