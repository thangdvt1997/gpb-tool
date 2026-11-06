import { Router } from 'express';
import { PLANT_CATALOG, PLANT_IDS } from '../catalog.js';
import { createPlantRepo } from '../db.js';
import { advance, applyCare, CARE_ACTIONS, viewPlant } from '../sim.js';
import { ApiError, displayName, requireObject } from '../util.js';

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const LOG_LIMIT = 20;

// Giới hạn số hành động mỗi người trong cửa sổ trượt. Lưu trong bộ nhớ, khởi động lại sẽ reset.
function createRateLimiter({ limit, windowMs }) {
  const hits = new Map();
  return {
    take(key, nowMs) {
      const cutoff = nowMs - windowMs;
      const recent = (hits.get(key) || []).filter((t) => t > cutoff);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(nowMs);
      hits.set(key, recent);
      return true;
    },
  };
}

function requirePlantId(raw) {
  if (typeof raw !== 'string' || !PLANT_IDS.has(raw)) {
    throw new ApiError(404, 'Không tìm thấy cây');
  }
  return raw;
}

export function createPlantsRouter({ db, clock = Date.now }) {
  const router = Router();
  const repo = createPlantRepo(db);
  const limiter = createRateLimiter({ limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS });

  // Đọc trạng thái: đưa mọi cây tới hiện tại trong một transaction, ghi lại nếu có phút mới.
  router.get('/state', (req, res) => {
    const nowMs = clock();
    const plants = db.transaction(() => {
      const result = [];
      for (const { id } of PLANT_CATALOG) {
        const current = repo.get(id);
        if (!current) continue;
        const next = advance(current, nowMs);
        if (next !== current) repo.save(next);
        result.push(next);
      }
      return result;
    })();
    res.json({
      plants: plants.map((plant) => viewPlant(plant, nowMs)),
      serverTime: new Date(nowMs).toISOString(),
    });
  });

  // Chăm sóc: advance rồi áp dụng hành động, cùng một transaction. Lỗi nghiệp vụ (409) vẫn giữ phần đã mô phỏng.
  router.post('/:id/care', (req, res) => {
    const id = requirePlantId(req.params.id);
    const body = requireObject(req.body);
    const action = body.action;
    if (typeof action !== 'string' || !CARE_ACTIONS.includes(action)) {
      throw new ApiError(400, 'Hành động chăm sóc không hợp lệ');
    }

    const user = req.user;
    const nowMs = clock();
    // Đếm mọi lần thử hợp lệ (kể cả bị 409) để không spam được bằng yêu cầu bị từ chối.
    if (!limiter.take(user.id, nowMs)) {
      throw new ApiError(429, 'Bạn chăm sóc quá nhiều, nghỉ một chút nhé.');
    }
    const userName = displayName(user);
    const who = user.email || user.id;

    const outcome = db.transaction(() => {
      const current = repo.get(id);
      if (!current) return { ok: false, status: 404, error: 'Không tìm thấy cây' };
      const advanced = advance(current, nowMs);
      const result = applyCare(advanced, action, nowMs);
      if (!result.ok) {
        if (advanced !== current) repo.save(advanced);
        return result;
      }
      repo.save(result.state);
      repo.addCareLog({ plantId: id, userName, action, at: nowMs });
      repo.addAudit({ at: nowMs, who, action: `plant.${action}`, target: id });
      return { ok: true, plant: viewPlant(result.state, nowMs), message: result.message };
    })();

    if (!outcome.ok) throw new ApiError(outcome.status, outcome.error);
    return res.json({ plant: outcome.plant, message: outcome.message });
  });

  // Nhật ký: 20 hành động gần nhất, mới nhất trước. Không làm thay đổi trạng thái cây.
  router.get('/:id/log', (req, res) => {
    const id = requirePlantId(req.params.id);
    res.json({ log: repo.recentLog(id, LOG_LIMIT) });
  });

  return router;
}
