import { describe, expect, it } from 'vitest';
import it_ from '../../content/zones/it.json';
import type { ZoneObject } from '../../content/types';
import { decorBlockersOf } from '../../env';
import { PLANT_SIZE, PLANT_SPOTS } from '../itFixtures';
import { collisionRects, footprint, PLAYER_RADIUS, SPAWN, toWorldX, toWorldZ, type Rect } from '../layout';
import { isInsideOffice } from '../officeBounds';
import { LOBBY_MAIN_PATHS, LOBBY_PLAN, LOBBY_PLANTS, LOBBY_RUG, LOBBY_WINDOWS, lobbyBlockers } from './lobbyLayout';
import { entryBlockers } from './placement';

const objects = (it_ as unknown as { objects: ZoneObject[] }).objects;
const overlap = (a: Rect, b: Rect) => a.maxX > b.minX && a.minX < b.maxX && a.maxZ > b.minZ && a.minZ < b.maxZ;
const planRect = ([x0, x1, y0, y1]: readonly [number, number, number, number]): Rect => ({
  minX: toWorldX(x0),
  maxX: toWorldX(x1),
  minZ: toWorldZ(y0),
  maxZ: toWorldZ(y1),
});
const plantFixtures: Rect[] = Object.values(PLANT_SPOTS).map(([x, , z]) => ({
  minX: x - PLANT_SIZE[0] / 2,
  maxX: x + PLANT_SIZE[0] / 2,
  minZ: z - PLANT_SIZE[2] / 2,
  maxZ: z + PLANT_SIZE[2] / 2,
}));
/** Mọi vật chặn đi lại của cảnh, cùng nguồn với ITOffice (trừ chặn của khu tương tác mẫu, nằm xa sảnh). */
const solids = (): Rect[] => [
  ...collisionRects(objects),
  ...decorBlockersOf(objects, true),
  ...entryBlockers(objects),
  ...lobbyBlockers(),
  ...plantFixtures,
];
const lobby = planRect(LOBBY_PLAN);
const inside = (r: Rect, box: Rect) => r.minX >= box.minX && r.maxX <= box.maxX && r.minZ >= box.minZ && r.maxZ <= box.maxZ;

describe('sảnh mở chibi', () => {
  it('cây lớn nằm trong sảnh, trong chữ L, không đè vật thể nào của it.json hay chặn khác', () => {
    const others = [...collisionRects(objects), ...decorBlockersOf(objects, true), ...entryBlockers(objects), ...plantFixtures];
    for (const b of lobbyBlockers()) {
      expect(inside(b, lobby)).toBe(true);
      expect(isInsideOffice(b.minX, b.minZ) && isInsideOffice(b.maxX, b.maxZ)).toBe(true);
      expect(others.filter((o) => overlap(o, b))).toEqual([]);
      // Cửa thang Tây (lift7_west) và quầy cần trống trước mặt: cây không chồng footprint mở rộng 0,5 m của chúng.
      for (const id of ['lift7_west', 'service_desk', 'checkin_board', 'entrance']) {
        const f = footprint(objects.find((o) => o.id === id)!);
        expect(overlap(b, { minX: f.minX - 0.5, maxX: f.maxX + 0.5, minZ: f.minZ - 0.05, maxZ: f.maxZ + 0.05 }), id).toBe(false);
      }
    }
    expect(LOBBY_PLANTS).toHaveLength(2);
  });

  it('lối đi chính trong sảnh và hành lang không có vật đặc nào (tính cả bán kính nhân vật)', () => {
    const all = solids();
    for (const p of LOBBY_MAIN_PATHS) {
      const r = planRect(p.rect);
      expect(r.maxX - r.minX).toBeGreaterThan(2 * PLAYER_RADIUS);
      expect(r.maxZ - r.minZ).toBeGreaterThan(2 * PLAYER_RADIUS);
      expect(all.filter((o) => overlap(o, r)), p.id).toEqual([]);
    }
  });

  it('điểm xuất hiện nằm trên lối đi Nam sảnh, cách mọi vật đặc ít nhất bán kính nhân vật', () => {
    const spawnSouth = planRect(LOBBY_MAIN_PATHS.find((p) => p.id === 'spawnSouth')!.rect);
    expect(SPAWN.x).toBeGreaterThan(spawnSouth.minX);
    expect(SPAWN.x).toBeLessThan(spawnSouth.maxX);
    expect(SPAWN.z).toBeGreaterThan(spawnSouth.minZ);
    expect(SPAWN.z).toBeLessThan(spawnSouth.maxZ);
    const me: Rect = { minX: SPAWN.x - PLAYER_RADIUS, maxX: SPAWN.x + PLAYER_RADIUS, minZ: SPAWN.z - PLAYER_RADIUS, maxZ: SPAWN.z + PLAYER_RADIUS };
    expect(solids().filter((o) => overlap(o, me))).toEqual([]);
  });

  it('thảm tròn nằm trọn trong sảnh; dải cửa sổ nằm trên mặt hai lõi thang, dưới trần', () => {
    const rug: Rect = {
      minX: toWorldX(LOBBY_RUG.x - LOBBY_RUG.r),
      maxX: toWorldX(LOBBY_RUG.x + LOBBY_RUG.r),
      minZ: toWorldZ(LOBBY_RUG.y - LOBBY_RUG.r),
      maxZ: toWorldZ(LOBBY_RUG.y + LOBBY_RUG.r),
    };
    expect(inside(rug, lobby)).toBe(true);
    expect(LOBBY_RUG.core).toBeLessThan(LOBBY_RUG.r);
    const cores = ['core_lift1', 'core_lift2'].map((id) => footprint(objects.find((o) => o.id === id)!));
    for (const w of LOBBY_WINDOWS) {
      const wx = toWorldX(w.wallX);
      expect(cores.some((c) => Math.abs(c.maxX - wx) < 1e-6 || Math.abs(c.minX - wx) < 1e-6)).toBe(true);
      expect(w.top).toBeLessThan(2.97);
      expect(w.bottom).toBeGreaterThan(2.15);
      expect(w.panes).toBeGreaterThanOrEqual(3);
    }
  });
});
