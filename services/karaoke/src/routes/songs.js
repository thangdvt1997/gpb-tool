import { Router } from 'express';
import { listSongs } from '../data/songs.js';

export function createSongsRouter() {
  const router = Router();

  router.get('/songs', (_req, res) => {
    res.json(listSongs());
  });

  return router;
}
