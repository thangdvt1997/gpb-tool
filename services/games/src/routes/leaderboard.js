import { Router } from 'express';
import { ApiError } from '../util.js';

const KINDS = Object.freeze(['caro', 'quiz']);
const TOP_N = 20;

export function createLeaderboardRouter({ db }) {
  const router = Router();

  // Gộp theo người dùng. Tên hiển thị lấy từ dòng điểm mới nhất của loại đó.
  const selectTop = db.prepare(`
    SELECT
      (SELECT t.user_name FROM scores t
        WHERE t.user_id = s.user_id AND t.kind = @kind
        ORDER BY t.seq DESC LIMIT 1) AS userName,
      SUM(s.points) AS points,
      COUNT(*) AS games
    FROM scores s
    WHERE s.kind = @kind
    GROUP BY s.user_id
    ORDER BY points DESC, games DESC
    LIMIT @limit
  `);

  router.get('/', (req, res) => {
    const kind = req.query.kind === undefined ? 'quiz' : req.query.kind;
    if (typeof kind !== 'string' || !KINDS.includes(kind)) {
      throw new ApiError(400, 'Loại bảng xếp hạng chỉ là caro hoặc quiz');
    }
    res.json(selectTop.all({ kind, limit: TOP_N }));
  });

  return router;
}
