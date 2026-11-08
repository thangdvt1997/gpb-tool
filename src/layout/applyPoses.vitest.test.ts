import { describe, expect, it } from 'vitest';
import type { ZoneDef, ZoneObject } from '../content/types';
import { applyLayoutPoses, effectiveZone, fixtureTransform, poseDelta, type LayoutPoses } from './applyPoses';
import { collisionRects } from '../scene/layout';

const obj = (id: string, x: number, z: number, w = 4, d = 2): ZoneObject => ({
  id, kind: 'amenity', label: id, position: [x, 0.5, z], size: [w, 1, d], action: 'info', roles: [],
});
const poses = (saved: LayoutPoses['saved']): LayoutPoses => ({
  saved,
  defaults: { pantry: { x: 10, z: 5, rotation: 0 }, desk_a: { x: 0, z: 0, rotation: 0 }, tv_lobby: { x: -1, z: 0.05, rotation: 0 } },
});

describe('applyLayoutPoses', () => {
  const objects = [obj('pantry', 10, 5), obj('desk_a', 0, 0)];
  it('dịch tâm theo độ lệch, giữ y', () => {
    const out = applyLayoutPoses(objects, poses({ pantry: { x: 13, z: 2, rotation: 0 } }));
    expect(out[0].position).toEqual([13, 0.5, 2]);
    expect(out[1]).toBe(objects[1]);
  });
  it('xoay 90 hoán đổi rộng và sâu, va chạm theo chỗ mới', () => {
    const out = applyLayoutPoses(objects, poses({ pantry: { x: 10, z: 5, rotation: 90 } }));
    expect(out[0].size).toEqual([2, 1, 4]);
    const [r] = collisionRects([out[0]]);
    expect(r).toEqual({ minX: 9, maxX: 11, minZ: 3, maxZ: 7 });
  });
  it('bàn không bao giờ di chuyển; không đổi thì trả cùng mảng', () => {
    expect(applyLayoutPoses(objects, poses({ desk_a: { x: 9, z: 9, rotation: 0 } }))).toBe(objects);
    expect(applyLayoutPoses(objects, poses({ pantry: { x: 10, z: 5, rotation: 0 } }))).toBe(objects);
    expect(applyLayoutPoses(objects, undefined)).toBe(objects);
  });
  it('effectiveZone giữ tham chiếu khi saved không đổi', () => {
    const zone: ZoneDef = { id: 'z', name: 'z', objects };
    const p = poses({ pantry: { x: 13, z: 2, rotation: 0 } });
    expect(effectiveZone(zone, p)).toBe(effectiveZone(zone, { ...p }));
    expect(effectiveZone(zone, p).objects[0].position[0]).toBe(13);
  });
  it('fixtureTransform dịch tivi và cộng góc xoay', () => {
    const t = fixtureTransform('tv_lobby', [-1, 1.5, 0.05], 0, poses({ tv_lobby: { x: 2, z: 3.05, rotation: 180 } }));
    expect(t.position).toEqual([2, 1.5, 3.05]);
    expect(t.rotationY).toBeCloseTo(Math.PI);
    expect(poseDelta('tv_lobby', poses({}))).toBeNull();
  });
});
