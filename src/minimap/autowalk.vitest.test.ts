import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createAutoWalk, markArrivedAtPoint, stepAutoWalk, STALL_MS, isMoveKey } from './core/index.js';
import { cancelWalkRequest, requestWalk, takeWalkRequest } from '../scene/controls/walkRequest';

const route = { status: 'ok', length: 10, points: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }] } as never;

// Mô phỏng đúng vòng của useNavigation: bộ điều khiển -> requestWalk -> Player lấy bằng takeWalkRequest.
function tick(state: ReturnType<typeof createAutoWalk>, x: number, z: number, now: number) {
  const act = stepAutoWalk(state, { route, x, z, now });
  if (act.type === 'walk') {
    requestWalk({ x: act.x, z: act.z, facingYaw: null, onArrive: () => markArrivedAtPoint(state, route, act.index) });
  }
  return act;
}

describe('bộ điều khiển tự đi qua walkRequest', () => {
  beforeEach(() => cancelWalkRequest());

  it('đi lần lượt các điểm gấp tới đích rồi dừng', () => {
    const st = createAutoWalk({ x: 0, z: 0 }, 0);
    expect(tick(st, 0, 0, 0).type).toBe('walk');
    const r1 = takeWalkRequest();
    expect(r1).toMatchObject({ x: 5, z: 0 });
    expect(tick(st, 2, 0, 250).type).toBe('none');
    expect(takeWalkRequest()).toBeNull();
    r1?.onArrive?.();
    expect(tick(st, 5, 0.2, 500).type).toBe('walk');
    const r2 = takeWalkRequest();
    expect(r2).toMatchObject({ x: 5, z: 5 });
    r2?.onArrive?.();
    expect(tick(st, 5, 4.6, 750)).toEqual({ type: 'stop', reason: 'arrived' });
  });

  it('kẹt quá STALL_MS thì dừng', () => {
    const st = createAutoWalk({ x: 0, z: 0 }, 0);
    tick(st, 0, 0, 0);
    expect(tick(st, 0, 0, STALL_MS + 10)).toEqual({ type: 'stop', reason: 'stall' });
  });

  it('phím di chuyển tắt tự đi, cancelWalkRequest xóa yêu cầu đang chờ', () => {
    expect(isMoveKey('KeyW')).toBe(true);
    expect(isMoveKey('KeyM')).toBe(false);
    requestWalk({ x: 1, z: 1, facingYaw: null, onArrive: vi.fn() });
    cancelWalkRequest();
    expect(takeWalkRequest()).toBeNull();
  });
});
