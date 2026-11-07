import { describe, expect, it } from 'vitest';
import { isTapToWalk } from './tapToWalk';
import { mergeReduceMotion } from './cameraModes';
import { defaultSettings, sanitize } from '../../settings/schema';
import { joystickMetrics } from '../interact/joystickMetrics';

const touch = { pointerType: 'touch', t: 1000, x: 100, y: 100 };

describe('chạm để đi', () => {
  it('chạm nhanh, gần như đứng yên thì đi', () => {
    expect(isTapToWalk(touch, { t: 1100, x: 104, y: 103 }, true)).toBe(true);
  });
  it('chạm lâu, kéo xa hoặc tắt cài đặt thì không', () => {
    expect(isTapToWalk(touch, { t: 1250, x: 100, y: 100 }, true)).toBe(false);
    expect(isTapToWalk(touch, { t: 1100, x: 112, y: 100 }, true)).toBe(false);
    expect(isTapToWalk(touch, { t: 1100, x: 100, y: 100 }, false)).toBe(false);
  });
  it('chuột không đổi hành vi, kể cả khi tắt chạm để đi', () => {
    const m = { pointerType: 'mouse', t: 0, x: 0, y: 0 };
    expect(isTapToWalk(m, { t: 5000, x: 50, y: 50 }, false)).toBe(true);
    expect(isTapToWalk(null, { t: 5000, x: 50, y: 50 }, false)).toBe(true);
  });
  it('mặc định bật và sanitize kiểm tra kiểu', () => {
    expect(defaultSettings().touch.tapToWalk).toBe(true);
    expect(sanitize({ touch: { tapToWalk: false } }).touch.tapToWalk).toBe(false);
    expect(sanitize({ touch: { tapToWalk: 'x' } }).touch.tapToWalk).toBe(true);
    expect(sanitize({ touch: {} }).touch.tapToWalk).toBe(true);
  });
});

describe('giảm chuyển động gộp nguồn', () => {
  const c = { reduceMotion: false, shakeScale: 0.25 };
  it('bất kỳ nguồn nào bật đều giảm', () => {
    expect(mergeReduceMotion(c, false, false).reduceMotion).toBe(false);
    expect(mergeReduceMotion(c, true, false).reduceMotion).toBe(true);
    expect(mergeReduceMotion(c, false, true).reduceMotion).toBe(true);
    expect(mergeReduceMotion({ ...c, reduceMotion: true }, false).reduceMotion).toBe(true);
  });
});

describe('cỡ joystick', () => {
  it('tỉ lệ theo cài đặt, kẹp trong khoảng cho phép', () => {
    const m = joystickMetrics(160);
    expect(m.size).toBe(160);
    expect(m.radius).toBeCloseTo(60);
    expect(m.knob).toBeCloseTo(70);
    expect(joystickMetrics(10).size).toBe(80);
    expect(joystickMetrics(Number.NaN).size).toBe(120);
  });
});
