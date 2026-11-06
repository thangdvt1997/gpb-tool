import { describe, expect, it } from 'vitest';
import { computeCropRect } from './framing';
import {
  applyLook,
  boundingBox,
  clampToOfficeBoxes,
  computePresetPose,
  computeScaledBuffer,
  lookAngles,
  moveFromKeys,
  nextCountdown,
  PITCH_LIMIT,
  PRESETS,
  scaleMove,
  tiltToRadians,
  type PlanBox,
} from './photoLogic';
import { OFFICE_L_RECTS, isInsideOffice } from '../scene/officeBounds';

const L: PlanBox[] = [
  { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
  { minX: 10, maxX: 20, minZ: 5, maxZ: 10 },
];

describe('clampToOfficeBoxes', () => {
  it('giữ nguyên điểm bên trong', () => {
    expect(clampToOfficeBoxes({ x: 5, y: 1.5, z: 5 }, L, 0.3, 3)).toEqual({ x: 5, y: 1.5, z: 5 });
  });
  it('kẹp điểm ngoài vào mép có lề', () => {
    const r = clampToOfficeBoxes({ x: -4, y: 1, z: 5 }, L, 0.3, 3, 0.3);
    expect(r.x).toBeCloseTo(0.3);
  });
  it('chọn nhánh gần nhất của chữ L, không nhảy qua vùng khuyết', () => {
    const r = clampToOfficeBoxes({ x: 15, y: 1, z: 1 }, L, 0.3, 3, 0.3);
    expect(r.z).toBeGreaterThanOrEqual(5.3 - 1e-9);
    expect(r.x).toBeGreaterThan(10);
  });
  it('kẹp độ cao', () => {
    expect(clampToOfficeBoxes({ x: 5, y: 9, z: 5 }, L, 0.3, 3).y).toBe(3);
    expect(clampToOfficeBoxes({ x: 5, y: -2, z: 5 }, L, 0.3, 3).y).toBe(0.3);
  });
  it('mọi điểm sau kẹp nằm trong văn phòng thật', () => {
    for (const [x, z] of [[-100, -100], [100, 100], [0, 50], [-30, 7]] as const) {
      const r = clampToOfficeBoxes({ x, y: 1, z }, OFFICE_L_RECTS, 0.3, 3, 0.3);
      expect(isInsideOffice(r.x, r.z)).toBe(true);
    }
  });
  it('boundingBox bao trọn', () => {
    expect(boundingBox(L)).toEqual({ minX: 0, maxX: 20, minZ: 0, maxZ: 10 });
  });
});

describe('hướng nhìn và bay', () => {
  it('lookAngles nhìn +z là yaw 0, nhìn -z là yaw PI', () => {
    expect(lookAngles({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 5 }).yaw).toBeCloseTo(0);
    expect(Math.abs(lookAngles({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: -5 }).yaw)).toBeCloseTo(Math.PI);
    expect(lookAngles({ x: 0, y: 3, z: 0 }, { x: 0, y: 0, z: 1 }).pitch).toBeGreaterThan(1);
  });
  it('applyLook kẹp pitch', () => {
    expect(applyLook(0, 0, 0, 1e6).pitch).toBeCloseTo(PITCH_LIMIT);
    expect(applyLook(0, 0, 0, -1e6).pitch).toBeCloseTo(-PITCH_LIMIT);
  });
  it('moveFromKeys và scaleMove chuẩn hóa đường chéo', () => {
    const m = moveFromKeys(new Set(['KeyW', 'KeyD']));
    expect(m).toEqual({ forward: 1, right: 1, up: 0 });
    const s = scaleMove(m, 1 / 60, 3);
    expect(Math.hypot(s.forward, s.right)).toBeCloseTo(3 / 60);
    expect(scaleMove({ forward: 0, right: 0, up: 0 }, 0.016)).toEqual({ forward: 0, right: 0, up: 0 });
  });
  it('phím đối nhau triệt tiêu', () => {
    expect(moveFromKeys(new Set(['KeyQ', 'KeyE'])).up).toBe(0);
  });
});

describe('preset', () => {
  it('có 4 preset và pose hợp lệ', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['portrait', 'full', 'wide', 'top']);
    for (const p of PRESETS) {
      const r = computePresetPose(p.id, { x: 2, z: 3, yaw: 0.7 });
      expect(Number.isFinite(r.yaw + r.pitch + r.position.x + r.position.y + r.position.z)).toBe(true);
    }
  });
  it('chân dung đứng trước mặt, nhìn ngược về nhân vật', () => {
    const r = computePresetPose('portrait', { x: 0, z: 0, yaw: 0 });
    expect(r.position.z).toBeGreaterThan(0);
    expect(Math.cos(r.yaw)).toBeLessThan(0);
  });
  it('góc rộng đứng sau lưng; từ trên xuống nhìn gần thẳng đứng', () => {
    expect(computePresetPose('wide', { x: 0, z: 0, yaw: 0 }).position.z).toBeLessThan(0);
    expect(computePresetPose('top', { x: 0, z: 0, yaw: 0 }).pitch).toBeGreaterThan(1.5);
  });
});

describe('chụp: kích thước, cắt, đếm ngược', () => {
  const lim = { maxTexture: 4096, maxPixels: 16_000_000 };
  it('1x giữ nguyên, 2x nhân đôi khi đủ chỗ', () => {
    expect(computeScaledBuffer(800, 600, 1, lim)).toMatchObject({ width: 800, height: 600, reduced: false });
    expect(computeScaledBuffer(800, 600, 2, lim)).toMatchObject({ width: 1600, height: 1200, reduced: false });
  });
  it('2x bị chặn bởi texture tối đa', () => {
    const r = computeScaledBuffer(3000, 1000, 2, lim)!;
    expect(r.width).toBeLessThanOrEqual(4096);
    expect(r.reason).toBe('texture');
    expect(r.reduced).toBe(true);
  });
  it('2x bị chặn bởi tổng pixel', () => {
    const r = computeScaledBuffer(3000, 3000, 2, { maxTexture: 16384, maxPixels: 10_000_000 })!;
    expect(r.width * r.height).toBeLessThanOrEqual(10_000_000);
    expect(r.reason).toBe('pixels');
  });
  it('đầu vào xấu trả null', () => {
    expect(computeScaledBuffer(0, 100, 1, lim)).toBeNull();
  });
  it('cắt đúng 1:1, 4:5, 16:9, 9:16 trên buffer 2x', () => {
    const b = computeScaledBuffer(1000, 800, 2, lim)!;
    for (const [ratio, w, h] of [[1, 1600, 1600], [4 / 5, 1280, 1600], [16 / 9, 1600, 900], [9 / 16, 900, 1600]] as const) {
      const c = computeCropRect(b.width, b.height, ratio)!;
      expect(Math.abs(c.w / c.h - ratio)).toBeLessThan(0.01);
      expect(c.w).toBeLessThanOrEqual(b.width);
      expect(c.h).toBeLessThanOrEqual(b.height);
      void w; void h;
    }
  });
  it('đếm ngược về 0 và không âm', () => {
    expect(nextCountdown(3)).toBe(2);
    expect(nextCountdown(1)).toBe(0);
    expect(nextCountdown(0)).toBe(0);
  });
  it('tiltToRadians kẹp 45 độ', () => {
    expect(tiltToRadians(90)).toBeCloseTo(Math.PI / 4);
    expect(tiltToRadians(Number.NaN)).toBe(0);
  });
});
