import express from 'express';
import { BOARD_IDS, CHANNELS } from '../config.js';
import { readBoardVersion, readStrokes, readTvStates } from '../db.js';

// Trạng thái đầy đủ cho client mới và cho GET /state.
export function buildState(db) {
  const boards = {};
  for (const id of BOARD_IDS) {
    boards[id] = { version: readBoardVersion(db, id), strokes: readStrokes(db, id) };
  }
  return { tvs: readTvStates(db), boards, channels: CHANNELS };
}

export function createStateRouter({ db, hub }) {
  const router = express.Router();

  router.get('/state', (_req, res) => {
    res.json(buildState(db));
  });

  // Mọi nhân viên đã đăng nhập đều nhận realtime, kể cả khi không thao tác trên trang.
  router.get('/stream', (_req, res) => {
    const opened = hub.open(res, () => buildState(db));
    if (!opened) {
      res.status(503).json({ ok: false, error: 'Quá nhiều kết nối, thử lại sau' });
    }
  });

  return router;
}
