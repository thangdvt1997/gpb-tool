import { describe, expect, it } from 'vitest';
import it_ from '../content/zones/it.json';
import type { ZoneDef } from '../content/types';
import { lobbyBlockers } from '../scene/entry/lobbyLayout';
import { PLAYER_RADIUS, SPAWN } from '../scene/layout';
import { buildNavGrid, findRoute, segmentClear } from './core/index.js';
import { buildMinimapSources } from './sources';

const zone = it_ as unknown as ZoneDef;
const key = (r: { minX: number; maxX: number; minZ: number; maxZ: number }) => [r.minX, r.maxX, r.minZ, r.maxZ].map((v) => v.toFixed(3)).join(',');

describe('tự đi quanh chậu cây sảnh mở', () => {
  const src = buildMinimapSources({ zone, role: 'employee', plants: false });

  it('vật cản của bản đồ có hai chậu cây sảnh (khớp va chạm của ITOffice)', () => {
    const have = new Set(src.obstacles.map(key));
    for (const b of lobbyBlockers()) expect(have.has(key(b))).toBe(true);
  });

  it('tuyến từ điểm xuất hiện về hành lang Nam phía Tây (đích e2e 26-autowalk) không cắt chậu cây', () => {
    const grid = buildNavGrid({ walkRects: src.walkRects, obstacles: src.obstacles, radius: src.radius });
    const r = findRoute(grid, { x: SPAWN.x, z: SPAWN.z }, { x: -14.7, z: 4.5 } as never);
    expect(r.status).toBe('ok');
    const pad = PLAYER_RADIUS - 0.05;
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1];
      const b = r.points[i];
      expect(segmentClear(grid, a, b)).toBe(true);
      for (const p of lobbyBlockers()) {
        // Lấy mẫu dọc đoạn: không điểm nào lọt vào chậu nới theo bán kính nhân vật.
        for (let t = 0; t <= 1; t += 0.02) {
          const x = a.x + (b.x - a.x) * t;
          const z = a.z + (b.z - a.z) * t;
          const inside = x > p.minX - pad && x < p.maxX + pad && z > p.minZ - pad && z < p.maxZ + pad;
          expect(inside).toBe(false);
        }
      }
    }
  });
});
