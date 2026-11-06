import { describe, expect, it, vi } from 'vitest';
import { buildRouteStrip } from '../routeStrip';
import { EMPTY_NAV_SNAPSHOT, getNavSnapshot, resetNavSnapshot, setNavSnapshot, subscribeNav } from '../navStore';
import { trapTabTarget } from '../focusTrap';

describe('buildRouteStrip', () => {
  it('một đoạn: 4 đỉnh, 6 chỉ số, nằm trên sàn, rộng đúng width', () => {
    const s = buildRouteStrip([{ x: 0, z: 0 }, { x: 4, z: 0 }], { width: 0.2, y: 0.05 });
    expect(s.positions.length).toBe(12);
    expect(s.indices.length).toBe(6);
    for (let i = 1; i < 12; i += 3) expect(s.positions[i]).toBeCloseTo(0.05);
    const zs = [s.positions[2]!, s.positions[5]!, s.positions[8]!, s.positions[11]!];
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.2);
    const xs = [s.positions[0]!, s.positions[3]!, s.positions[6]!, s.positions[9]!];
    expect(Math.min(...xs)).toBeCloseTo(-0.1);
    expect(Math.max(...xs)).toBeCloseTo(4.1);
  });
  it('nhiều đoạn, bỏ đoạn suy biến; chỉ số trong phạm vi đỉnh', () => {
    const s = buildRouteStrip([{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 3 }]);
    expect(s.positions.length / 3).toBe(8);
    expect(Math.max(...s.indices)).toBe(7);
  });
  it('dưới 2 điểm: rỗng', () => {
    expect(buildRouteStrip([]).indices.length).toBe(0);
    expect(buildRouteStrip([{ x: 1, z: 1 }]).indices.length).toBe(0);
  });
});

describe('navStore', () => {
  it('phát sự kiện khi đổi, bỏ qua khi không đổi, tăng version', () => {
    resetNavSnapshot();
    const fn = vi.fn();
    const off = subscribeNav(fn);
    const v0 = getNavSnapshot().version;
    const pts = [{ x: 0, z: 0 }, { x: 1, z: 0 }];
    setNavSnapshot({ points: pts, goal: { x: 1, z: 0 } });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(getNavSnapshot().version).toBe(v0 + 1);
    expect(getNavSnapshot().points).toBe(pts);
    setNavSnapshot({ points: pts });
    expect(fn).toHaveBeenCalledTimes(1);
    setNavSnapshot({ worldMarkers: false });
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    setNavSnapshot({ guidance: false });
    expect(fn).toHaveBeenCalledTimes(2);
    resetNavSnapshot();
    expect(getNavSnapshot().points).toBe(EMPTY_NAV_SNAPSHOT.points);
    expect(getNavSnapshot().goal).toBeNull();
  });
});

describe('trapTabTarget', () => {
  const list = ['a', 'b', 'c'];
  it('Tab ở cuối về đầu, Shift+Tab ở đầu về cuối', () => {
    expect(trapTabTarget(list, 'c', false, 'box')).toBe('a');
    expect(trapTabTarget(list, 'a', true, 'box')).toBe('c');
  });
  it('ở giữa để trình duyệt xử lý', () => {
    expect(trapTabTarget(list, 'b', false, 'box')).toBeNull();
    expect(trapTabTarget(list, 'b', true, 'box')).toBeNull();
  });
  it('focus lạc ra ngoài hộp được kéo về', () => {
    expect(trapTabTarget(list, null, false, 'box')).toBe('a');
    expect(trapTabTarget(list, 'x', true, 'box')).toBe('c');
  });
  it('hộp không có phần tử focus được: giữ focus ở hộp', () => {
    expect(trapTabTarget([], null, false, 'box')).toBe('box');
  });
});
