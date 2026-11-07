import { describe, expect, it } from 'vitest';
import zone from '../../../content/zones/it.json';
import type { ZoneObject } from '../../../content/types';
import { collisionRects } from '../../layout';
import { isInsideOffice } from '../../officeBounds';
import { OFFICE_PROP_BLOCKERS } from '../../officePropsLayout';
import { DOOR_DEFAULTS } from './door';
import { doorBlocker, deskBlocker, placementFree, rectsOverlap, windowFrameParts, windowRect } from './blockers';
import { SAMPLE_CURTAIN, SAMPLE_DESK, SAMPLE_DOOR } from './InteractObjects';

const objects = (zone as unknown as { objects: ZoneObject[] }).objects;
const { hinge, yaw, length } = SAMPLE_DOOR;
const M = DOOR_DEFAULTS.maxAngle;
const closed = { phase: 'closed' as const, angle: 0, dir: 1 as const };

describe('vật cản cửa theo trạng thái', () => {
  it('đóng: chặn dọc lá cửa tại vị trí đóng', () => {
    const r = doorBlocker(hinge, yaw, length, closed, M);
    expect(r.maxZ - r.minZ).toBeGreaterThan(length - 0.01);
    expect(r.minZ).toBeLessThan(hinge.z - length + 0.01);
  });
  it('khóa và đang mở/đóng vẫn chặn như đóng', () => {
    const c = doorBlocker(hinge, yaw, length, closed, M);
    for (const phase of ['locked', 'opening', 'closing'] as const) {
      expect(doorBlocker(hinge, yaw, length, { phase, angle: 0.5, dir: 1 }, M)).toEqual(c);
    }
  });
  it('mở: lá xoay thành vật cản khác vị trí đóng, lối cũ thông', () => {
    const c = doorBlocker(hinge, yaw, length, closed, M);
    const o = doorBlocker(hinge, yaw, length, { phase: 'open', angle: -M, dir: -1 }, M);
    expect(o).not.toEqual(c);
    // Điểm giữa lá lúc đóng không còn bị chặn.
    const mid = { minX: hinge.x - 0.02, maxX: hinge.x + 0.02, minZ: hinge.z - length / 2 - 0.02, maxZ: hinge.z - length / 2 + 0.02 };
    expect(rectsOverlap(mid, c)).toBe(true);
    expect(rectsOverlap(mid, o)).toBe(false);
  });
  it('mở hẳn với góc 0 dùng hướng đã chốt', () => {
    const a = doorBlocker(hinge, yaw, length, { phase: 'open', angle: 0, dir: -1 }, M);
    const b = doorBlocker(hinge, yaw, length, { phase: 'open', angle: -M, dir: -1 }, M);
    expect(a).toEqual(b);
  });
});

describe('bàn máy tính', () => {
  it('chặn: người đứng trong bàn bị chồng, người đứng trước bàn thì không', () => {
    const d = deskBlocker(SAMPLE_DESK.fp);
    expect(rectsOverlap({ minX: SAMPLE_DESK.x - 0.1, maxX: SAMPLE_DESK.x + 0.1, minZ: SAMPLE_DESK.z - 0.1, maxZ: SAMPLE_DESK.z + 0.1 }, d)).toBe(true);
    const s = SAMPLE_DESK.stand;
    expect(rectsOverlap({ minX: s.x - 0.35, maxX: s.x + 0.35, minZ: s.z - 0.35, maxZ: s.z + 0.35 }, d)).toBe(false);
  });
});

describe('rèm và cửa sổ phía sau', () => {
  const c = { x: SAMPLE_CURTAIN.x, z: SAMPLE_CURTAIN.z, yaw: SAMPLE_CURTAIN.yaw };
  const wr = windowRect(c, SAMPLE_CURTAIN.width);
  it('khung cửa sổ có kính và đủ thanh khung nằm trong chiều cao rèm', () => {
    const parts = windowFrameParts(SAMPLE_CURTAIN.width, SAMPLE_CURTAIN.height);
    expect(parts.filter((p) => p.kind === 'glass')).toHaveLength(1);
    expect(parts.filter((p) => p.kind === 'frame').length).toBeGreaterThanOrEqual(4);
    for (const p of parts) expect(p.pos[1] + p.size[1] / 2).toBeLessThanOrEqual(SAMPLE_CURTAIN.height);
  });
  it('cửa sổ rộng hơn rèm và chạm rèm (rèm che được)', () => {
    expect(wr.maxX - wr.minX).toBeGreaterThan(SAMPLE_CURTAIN.width);
  });
  it('không chồng vật khác, cửa sổ nằm trong hình L (tâm)', () => {
    const others = [...collisionRects(objects), ...OFFICE_PROP_BLOCKERS, deskBlocker(SAMPLE_DESK.fp), doorBlocker(hinge, yaw, length, closed, M)];
    expect(placementFree(wr, others)).toBe(true);
    expect(isInsideOffice(SAMPLE_CURTAIN.x, SAMPLE_CURTAIN.z)).toBe(true);
  });
  it('placementFree phát hiện chồng', () => {
    expect(placementFree(wr, [wr])).toBe(false);
  });
});
