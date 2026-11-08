import { describe, expect, it } from 'vitest';
import type { ZoneDef, ZoneObject } from '../content/types';
import { applyLayoutPoses, effectiveZone, fixtureTransform, poseDelta, rotateBoxesAbout, unrotatedOf, layoutRotationY, type LayoutPoses } from './applyPoses';
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

describe('khối ghép xoay thật', () => {
  const objects = [obj('pantry', 10, 5, 6, 2)];
  it('đặt layoutRot, footprint hoán đổi, unrotatedOf trả size gốc cùng tâm', () => {
    const out = applyLayoutPoses(objects, poses({ pantry: { x: 12, z: 5, rotation: 90 } }))[0];
    expect(out.layoutRot).toBe(90);
    expect(out.size).toEqual([2, 1, 6]);
    const u = unrotatedOf(out);
    expect(u.size).toEqual([6, 1, 2]);
    expect(u.layoutRot).toBeUndefined();
    expect(u.position).toEqual(out.position);
    expect(layoutRotationY(out)).toBeCloseTo(Math.PI / 2);
    const o180 = applyLayoutPoses(objects, poses({ pantry: { x: 10, z: 5, rotation: 180 } }))[0];
    expect(o180.size).toEqual([6, 1, 2]);
    expect(unrotatedOf(o180).size).toEqual([6, 1, 2]);
  });
  it('không xoay: không có layoutRot', () => {
    expect(applyLayoutPoses(objects, poses({ pantry: { x: 13, z: 5, rotation: 0 } }))[0].layoutRot).toBeUndefined();
  });
  it('rotateBoxesAbout quay hộp quanh tâm khớp footprint xoay', () => {
    const box = { minX: 7, maxX: 9, minZ: 4, maxZ: 5.5 }; // lệch tâm (10, 5)
    const r90 = rotateBoxesAbout([box], 10, 5, 90)[0];
    // (dx,dz) -> (dz,-dx): dx[-3,-1], dz[-1,0.5] -> x[-1,0.5], z[1,3]
    expect([r90.minX, r90.maxX, r90.minZ, r90.maxZ]).toEqual([9, 10.5, 6, 8]);
    const r180 = rotateBoxesAbout([box], 10, 5, 180)[0];
    expect([r180.minX, r180.maxX, r180.minZ, r180.maxZ]).toEqual([11, 13, 4.5, 6]);
    const r270 = rotateBoxesAbout([box], 10, 5, 270)[0];
    expect([r270.minX, r270.maxX, r270.minZ, r270.maxZ]).toEqual([9.5, 11, 2, 4]);
    const back = rotateBoxesAbout(rotateBoxesAbout([box], 10, 5, 90), 10, 5, 270)[0];
    expect(back).toEqual(box);
  });
});
