import express from 'express';
import { createAuthMiddleware } from './auth.js';
import { createCaroRouter } from './routes/caro.js';
import { createDuelRouter } from './routes/duel.js';
import { createLeaderboardRouter } from './routes/leaderboard.js';
import { createQuizRouter } from './routes/quiz.js';
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
  app.use(express.json({ limit: '4kb' }));

  // Gateway không cắt tiền tố, nên service nhận đường dẫn đầy đủ /api/games/...
  app.use('/api/games/caro', createCaroRouter({ db }));
  app.use('/api/games/quiz', createQuizRouter({ db }));
  app.use('/api/games/leaderboard', createLeaderboardRouter({ db }));
  app.use('/api/games/duel', createDuelRouter({ db, config, fetchImpl }));

  app.use((req, res) => {
    res.status(404).json({ ok: false, error: 'Không tìm thấy' });
  });

  // Chỉ trả message đã được kiểm soát cho client, không trả stack trace.
  app.use((err, req, res, _next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ ...err.details, ok: false, error: err.message });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ ok: false, error: 'Dữ liệu JSON không hợp lệ' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ ok: false, error: 'Dữ liệu gửi lên quá lớn' });
    }
    if (err && err.expose === true && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({ ok: false, error: 'Yêu cầu không hợp lệ' });
    }
    console.error(`[games] lỗi không mong đợi: ${err && err.message ? err.message : 'unknown'}`);
    return res.status(500).json({ ok: false, error: 'Lỗi máy chủ' });
  });

  return app;
}
