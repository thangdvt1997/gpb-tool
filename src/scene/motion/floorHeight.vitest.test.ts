import { describe, expect, it } from 'vitest';
import {
  boxSlope,
  canStepTo,
  DEFAULT_FLOOR_CONFIG,
  floorConfigForHeight,
  resolveFloorHeight,
  settleOnGround,
  type HeightBox,
} from './floorHeight';

const cfg = { ...DEFAULT_FLOOR_CONFIG, radius: 0 };
const step = (h: number): HeightBox => ({ minX: 1, maxX: 2, minZ: -1, maxZ: 1, topY: h });

describe('floorHeight', () => {
  it('không có hộp: sàn phẳng y = 0 (văn phòng hiện tại)', () => {
    const r = resolveFloorHeight(0, 0, 0, [], cfg);
    expect(r).toEqual({ floorY: 0, blocked: false, slope: 0, surface: -1 });
  });
  it('bậc thấp hơn stepHeight bước lên được', () => {
    const r = resolveFloorHeight(1.5, 0, 0, [step(0.15)], cfg);
    expect(r.floorY).toBeCloseTo(0.15);
    expect(r.blocked).toBe(false);
  });
  it('bậc cao hơn stepHeight bị chặn', () => {
    expect(resolveFloorHeight(1.5, 0, 0, [step(0.6)], cfg).blocked).toBe(true);
    expect(canStepTo(0, 0, 1.5, 0, 0, [step(0.6)], cfg)).toBe(false);
  });
  it('đứng sẵn trên bục cao thì không bị chặn bởi chính nó', () => {
    const r = resolveFloorHeight(1.5, 0, 0.6, [step(0.6)], cfg);
    expect(r.blocked).toBe(false);
    expect(r.floorY).toBeCloseTo(0.6);
  });
  it('dốc nhẹ đi được, dốc quá maxSlope bị chặn', () => {
    const gentle: HeightBox = { minX: 0, maxX: 4, minZ: -1, maxZ: 1, topY: 0, ramp: { axis: 'x', endY: 0.5 } };
    const steep: HeightBox = { minX: 0, maxX: 0.5, minZ: -1, maxZ: 1, topY: 0, ramp: { axis: 'x', endY: 0.5 } };
    expect(boxSlope(gentle)).toBeLessThan(cfg.maxSlope);
    expect(resolveFloorHeight(2, 0, 0.25, [gentle], cfg).blocked).toBe(false);
    expect(resolveFloorHeight(2, 0, 0.25, [gentle], cfg).floorY).toBeCloseTo(0.25);
    expect(boxSlope(steep)).toBeGreaterThan(cfg.maxSlope);
    expect(resolveFloorHeight(0.4, 0, 0, [steep], cfg).blocked).toBe(true);
  });
  it('settleOnGround: đi xuống bậc trong tầm được hút xuống, không bị coi là rơi', () => {
    const r = settleOnGround(0, 0, 0.2, 0, true, [], cfg);
    expect(r.grounded).toBe(true);
    expect(r.y).toBe(0);
    expect(r.snapped).toBe(true);
  });
  it('settleOnGround: nhảy lên (vy > 0) không bị hút xuống', () => {
    const r = settleOnGround(0, 0, 0.1, 4, true, [], cfg);
    expect(r.grounded).toBe(false);
  });
  it('settleOnGround: rơi sâu hơn stepHeight thì không còn grounded', () => {
    const r = settleOnGround(0, 0, 1, 0, true, [], cfg);
    expect(r.grounded).toBe(false);
  });
  it('tham số tỉ lệ theo chiều cao và được kẹp trong khoảng hỗ trợ', () => {
    const a = floorConfigForHeight(1.5);
    const b = floorConfigForHeight(1.75);
    const c = floorConfigForHeight(1.95);
    expect(a.stepHeight).toBeLessThan(b.stepHeight);
    expect(b.stepHeight).toBeLessThan(c.stepHeight);
    expect(floorConfigForHeight(3).stepHeight).toBe(floorConfigForHeight(2.1).stepHeight);
  });
});
