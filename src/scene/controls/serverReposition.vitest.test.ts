import { describe, expect, it } from 'vitest';
import { pushServerReposition, takeServerReposition } from './serverReposition';

describe('serverReposition', () => {
  it('lấy một lần, yêu cầu mới thay cũ', () => {
    expect(takeServerReposition()).toBeNull();
    pushServerReposition({ x: 1, z: 2, yaw: 0.5 });
    pushServerReposition({ x: 3, z: 4 });
    expect(takeServerReposition()).toEqual({ x: 3, z: 4, yaw: undefined });
    expect(takeServerReposition()).toBeNull();
  });
  it('bỏ tọa độ hỏng, yaw hỏng thì bỏ yaw', () => {
    expect(pushServerReposition({ x: NaN, z: 1 })).toBe(false);
    expect(takeServerReposition()).toBeNull();
    pushServerReposition({ x: 1, z: 1, yaw: Infinity });
    expect(takeServerReposition()?.yaw).toBeUndefined();
  });
});
