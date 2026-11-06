import express from 'express';
import { createAuthMiddleware } from './auth.js';
import { createConfirmStore } from './confirmTokens.js';
import { createCheckinsRouter } from './routes/checkins.js';
import { createItRouter } from './routes/it.js';
import { createKudosRouter } from './routes/kudos.js';
import { createRoomsRouter } from './routes/rooms.js';
import { ApiError } from './util.js';

export function createApp({ config, db, fetchImpl }) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Chặn request ghi từ trang của site khác (cookie được gửi kèm). Client không phải trình duyệt không gửi header này.
  const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  app.use((req, res, next) => {
    if (UNSAFE_METHODS.has(req.method) && req.headers['sec-fetch-site'] === 'cross-site') {
      return res.status(403).json({ ok: false, error: 'Yêu cầu bị từ chối' });
    }
    return next();
  });

  // Mọi route còn lại phải đăng nhập. Auth chạy trước khi đọc body.
  app.use(createAuthMiddleware({ authUrl: config.authUrl, fetchImpl }));
  app.use(express.json({ limit: '16kb' }));

  const confirms = createConfirmStore({ ttlMs: 60_000 });
  // Đăng ký trước router /api/it để /api/it/checkins không bị router chung bắt.
  app.use('/api/it/checkins', createCheckinsRouter({ db }));
  app.use(
    '/api/it',
    createItRouter({
      db,
      confirms,
      servicesFile: config.servicesFile,
      securityFile: config.securityFile,
    }),
  );
  app.use('/api/rooms', createRoomsRouter({ db }));
  app.use('/api/kudos', createKudosRouter({ db }));

  app.use((req, res) => {
    res.status(404).json({ ok: false, error: 'Không tìm thấy' });
  });

  // Chỉ trả message đã được kiểm soát cho client, không trả stack trace.
  app.use((err, req, res, _next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ ok: false, error: err.message });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ ok: false, error: 'Dữ liệu JSON không hợp lệ' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ ok: false, error: 'Dữ liệu gửi lên quá lớn' });
    }
    console.error(`[it] lỗi không mong đợi: ${err && err.message ? err.message : 'unknown'}`);
    return res.status(500).json({ ok: false, error: 'Lỗi máy chủ' });
  });

  return app;
}
