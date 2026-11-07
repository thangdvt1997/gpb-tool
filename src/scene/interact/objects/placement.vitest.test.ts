// Cửa, máy tính, rèm trong khu mẫu: nằm trong chữ L, không chồng vật có sẵn, không chắn hành lang Nam.
import { describe, expect, it } from 'vitest';
import zone from '../../../content/zones/it.json';
import type { ZoneObject } from '../../../content/types';
import { collisionRects, footprint, PLAYER_RADIUS, toWorldX, toWorldZ, type Rect } from '../../layout';
import { isInsideOffice } from '../../officeBounds';
import { OFFICE_PROP_BLOCKERS } from '../../officePropsLayout';
import { buildSampleConfig, SAMPLE_CURTAIN, SAMPLE_DESK, SAMPLE_DOOR } from './InteractObjects';
import { leafEnd } from './door';
import type { Footprint } from '../registry';

const objects = (zone as unknown as { objects: ZoneObject[] }).objects;
const rectOf = (f: Footprint): Rect => ({ minX: f.cx - f.hx, maxX: f.cx + f.hx, minZ: f.cz - f.hz, maxZ: f.cz + f.hz });
const overlap = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const cfg = buildSampleConfig(objects, () => false);
const g = cfg.geo;

const NEW: ReadonlyArray<readonly [string, Footprint]> = [
  ['cửa', SAMPLE_DOOR.fp],
  ['máy tính', SAMPLE_DESK.fp],
  ['rèm', SAMPLE_CURTAIN.fp],
];

describe('cửa, máy tính, rèm trong khu mẫu', () => {
  it('được đăng ký trong cấu hình', () => {
    expect(cfg.doors?.map((d) => d.id)).toEqual(['sample_door']);
    expect(cfg.computers?.map((d) => d.id)).toEqual(['sample_computer']);
    expect(cfg.curtains?.map((d) => d.id)).toEqual(['sample_curtain']);
  });

  it.each(NEW)('%s: bốn góc footprint nằm trong chữ L', (_n, f) => {
    const r = rectOf(f);
    for (const [x, z] of [[r.minX, r.minZ], [r.minX, r.maxZ], [r.maxX, r.minZ], [r.maxX, r.maxZ]] as const) expect(isInsideOffice(x, z)).toBe(true);
  });

  it('lá cửa lúc đóng và điểm đứng dùng vật nằm trong chữ L', () => {
    const e = leafEnd(SAMPLE_DOOR.hinge, SAMPLE_DOOR.yaw, 0, SAMPLE_DOOR.length);
    expect(isInsideOffice(SAMPLE_DOOR.hinge.x, SAMPLE_DOOR.hinge.z)).toBe(true);
    expect(isInsideOffice(e.x, e.z)).toBe(true);
    // Đầu lá cửa trùng footprint đã khai.
    expect(Math.abs(e.z - SAMPLE_DOOR.fp.cz)).toBeCloseTo(SAMPLE_DOOR.fp.hz, 5);
    for (const p of [SAMPLE_DESK.stand, SAMPLE_CURTAIN.stand]) expect(isInsideOffice(p.x, p.z)).toBe(true);
  });

  it.each(NEW)('%s: không chồng vật thể it.json và đạo cụ sàn', (_n, f) => {
    const r = rectOf(f);
    for (const o of collisionRects(objects)) expect(overlap(r, o)).toBe(false);
    for (const o of OFFICE_PROP_BLOCKERS) expect(overlap(r, o)).toBe(false);
    for (const o of objects) expect(overlap(r, footprint(o)), o.id).toBe(false);
  });

  it('không chồng nhau và không chồng vật mẫu khác (tủ, máy in, TV, cây nước, công tắc)', () => {
    const fresh = NEW.map(([, f]) => rectOf(f));
    const samples = [cfg.cabinets![0]!, cfg.printers![0]!, cfg.tvs![0]!, cfg.coolers![0]!, cfg.switches![0]!].map((c) => rectOf(c.footprint));
    for (let i = 0; i < fresh.length; i++) {
      for (let j = i + 1; j < fresh.length; j++) expect(overlap(fresh[i]!, fresh[j]!), `${i} x ${j}`).toBe(false);
      for (const o of samples) expect(overlap(fresh[i]!, o), `mới ${i}`).toBe(false);
    }
  });

  it('điểm đứng không bị vật cản chiếm (tính cả bán kính nhân vật)', () => {
    const blockers = [...collisionRects(objects), ...OFFICE_PROP_BLOCKERS];
    for (const p of [SAMPLE_DESK.stand, SAMPLE_CURTAIN.stand]) {
      const hit = blockers.some((r) => p.x > r.minX - PLAYER_RADIUS && p.x < r.maxX + PLAYER_RADIUS && p.z > r.minZ - PLAYER_RADIUS && p.z < r.maxZ + PLAYER_RADIUS);
      expect(hit).toBe(false);
    }
  });

  it('không chắn hành lang Nam (x 36–44,2; y 25,5–28,5 theo bản vẽ)', () => {
    const lane: Rect = { minX: toWorldX(36), maxX: toWorldX(44.2), minZ: toWorldZ(25.5), maxZ: toWorldZ(28.5) };
    for (const [, f] of NEW) expect(overlap(rectOf(f), lane)).toBe(false);
  });

  it('cửa mở về phía Đông, ra khỏi hành lang (xa người đứng phía Tây)', () => {
    const open = leafEnd(SAMPLE_DOOR.hinge, SAMPLE_DOOR.yaw, -Math.PI / 2, SAMPLE_DOOR.length);
    expect(open.x).toBeGreaterThan(SAMPLE_DOOR.hinge.x);
    expect(open.z).toBeCloseTo(SAMPLE_DOOR.hinge.z, 5);
  });
});
