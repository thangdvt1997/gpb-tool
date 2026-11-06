import express from 'express';
import { createAuthMiddleware } from './auth.js';
import { createPlantsRouter } from './routes/plants.js';
import { ApiError } from './util.js';

export function createApp({ config, db, fetchImpl, clock }) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Mọi route còn lại phải đăng nhập. Auth chạy trước khi đọc body.
  app.use(createAuthMiddleware({ authUrl: config.authUrl, fetchImpl }));
  app.use(express.json({ limit: '16kb' }));

  app.use('/api/plants', createPlantsRouter({ db, clock }));

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
    console.error(`[plants] lỗi không mong đợi: ${err && err.message ? err.message : 'unknown'}`);
    return res.status(500).json({ ok: false, error: 'Lỗi máy chủ' });
  });

  return app;
}
