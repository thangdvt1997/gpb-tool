import { describe, expect, it } from 'vitest';
import { propBlockers, type PropKind } from '../editor/props';
import { buildPhotoObstacles, isInsideCameraBlocker, slideCamera } from './photoCollision';

const STATIC = [{ minX: 20, maxX: 21, minZ: 20, maxZ: 21 }];
const kinds: Record<string, PropKind> = { p_aaaaaa: 'table', p_bbbbbb: 'wall4' };
const at = (x: number, z: number) => ({ x, z, rotation: 0 as const });
const cam = (x: number, z: number) => ({ x, y: 1.5, z });

describe('vật cản camera chụp ảnh theo bố trí người dùng', () => {
  it('chưa có bố trí người dùng: đúng bố trí tĩnh', () => {
    expect(buildPhotoObstacles(STATIC, propBlockers({}, undefined))).toBe(STATIC);
  });
  it('vật mới thêm chặn camera', () => {
    const obs = buildPhotoObstacles(STATIC, propBlockers({ p_aaaaaa: at(0, 0) }, kinds));
    expect(obs.length).toBe(2);
    const from = cam(0, -3);
    const r = slideCamera(from, cam(0, 0), obs);
    expect(isInsideCameraBlocker(r, obs)).toBe(false);
    expect(r.z).toBeLessThan(-0.45);
  });
  it('vật đã xóa (không còn trong bố trí) không chặn', () => {
    const before = buildPhotoObstacles(STATIC, propBlockers({ p_aaaaaa: at(0, 0) }, kinds));
    const after = buildPhotoObstacles(STATIC, propBlockers({}, kinds));
    expect(slideCamera(cam(0, -3), cam(0, 0), before).z).toBeLessThan(-0.45);
    expect(slideCamera(cam(0, -3), cam(0, 0), after)).toEqual(cam(0, 0));
  });
  it('vật đã di chuyển chặn ở chỗ mới, chỗ cũ trống', () => {
    const obs = buildPhotoObstacles(STATIC, propBlockers({ p_aaaaaa: at(5, 5) }, kinds));
    expect(slideCamera(cam(0, -3), cam(0, 0), obs)).toEqual(cam(0, 0));
    const r = slideCamera(cam(5, 2), cam(5, 5), obs);
    expect(r.z).toBeLessThan(5 - 0.45);
  });
  it('tường có cửa: đi qua được khe cửa, bị chặn ở phần tường', () => {
    const obs = propBlockers({ p_bbbbbb: { ...at(0, 0), door: true } }, kinds);
    expect(obs.length).toBe(2);
    const walk = (x: number) => {
      let p = cam(x, -3);
      for (let i = 0; i < 70; i++) p = slideCamera(p, cam(x, p.z + 0.1), obs);
      return p.z;
    };
    expect(walk(0)).toBeGreaterThan(2.9);
    expect(walk(1.5)).toBeLessThan(-0.07);
  });
});
