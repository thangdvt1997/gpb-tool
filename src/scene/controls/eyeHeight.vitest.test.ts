import { describe, expect, it } from 'vitest';
import { cameraHeightsFor } from './eyeHeight';

describe('cameraHeightsFor', () => {
  it('1,70 m giữ giá trị cũ', () => {
    expect(cameraHeightsFor(1.7)).toEqual({ eyeStand: 1.58, eyeSit: 1.18, target: 1.5, targetSit: 1.1 });
  });
  it('chibi 1,10 m hạ camera theo tỷ lệ', () => {
    const c = cameraHeightsFor(1.1);
    expect(c.eyeStand).toBeCloseTo(1.58 * (1.1 / 1.7), 6);
    expect(c.eyeSit).toBeLessThan(c.eyeStand);
  });
  it('dữ liệu hỏng dùng mốc, giá trị cực đoan bị kẹp', () => {
    expect(cameraHeightsFor(undefined).eyeStand).toBe(1.58);
    expect(cameraHeightsFor(Number.NaN).eyeStand).toBe(1.58);
    expect(cameraHeightsFor(0.1).eyeStand).toBeCloseTo(1.58 * 0.45, 6);
    expect(cameraHeightsFor(5).eyeStand).toBeCloseTo(1.58 * 1.3, 6);
  });
});
