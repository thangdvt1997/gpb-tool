import express from 'express';
import { createAuthMiddleware } from './auth.js';
import { createEventsRouter } from './routes/events.js';
import { createProgramsRouter } from './routes/programs.js';
import { createVotesRouter } from './routes/votes.js';
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

  // Chặn request ghi từ trang của site khác. Cookie được gửi kèm nên POST không có body
  // (vd đóng sự kiện) có thể bị kích hoạt từ form cross-site. Trình duyệt luôn gửi Sec-Fetch-Site;
  // client không phải trình duyệt không gửi header này nên không bị ảnh hưởng.
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

  app.use('/api/events', createEventsRouter({ db }));
  app.use('/api/events', createProgramsRouter({ db }));
  app.use('/api/events', createVotesRouter({ db }));

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
    console.error(`[events] lỗi không mong đợi: ${err && err.message ? err.message : 'unknown'}`);
    return res.status(500).json({ ok: false, error: 'Lỗi máy chủ' });
  });

  return app;
}
