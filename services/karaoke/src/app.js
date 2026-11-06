import express from 'express';
import { createAuthMiddleware } from './auth.js';
import { createScoresRouter } from './routes/scores.js';
import { createSongsRouter } from './routes/songs.js';

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

  // Mọi route còn lại phải đăng nhập. Auth chạy trước khi đọc body.
  app.use(createAuthMiddleware({ authUrl: config.authUrl, fetchImpl }));
  app.use(express.json({ limit: '4kb' }));

  app.use('/api/karaoke', createSongsRouter());
  app.use('/api/karaoke', createScoresRouter({ db }));

  app.use((req, res) => {
    res.status(404).json({ ok: false, error: 'Không tìm thấy' });
  });

  // Chỉ trả message đã được kiểm soát cho client, không trả stack trace.
  app.use((err, _req, res, _next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ ok: false, error: 'Dữ liệu JSON không hợp lệ' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ ok: false, error: 'Dữ liệu gửi lên quá lớn' });
    }
    // Lỗi 4xx do Express báo (ví dụ URL hỏng, charset lạ) là lỗi của client, không trả 500.
    if (err && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({ ok: false, error: 'Yêu cầu không hợp lệ' });
    }
    console.error(`[karaoke] lỗi không mong đợi: ${err && err.message ? err.message : 'unknown'}`);
    return res.status(500).json({ ok: false, error: 'Lỗi máy chủ' });
  });

  return app;
}
