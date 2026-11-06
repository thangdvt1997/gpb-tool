import { describe, expect, it } from 'vitest';
import { POSE_INTERVAL_MS, POSE_KEEPALIVE_MS, shouldSendPose, worldEnabled } from './poseThrottle';

describe('shouldSendPose', () => {
  const p = { x: 1, z: 2, yaw: 0 };
  it('lần đầu luôn gửi', () => {
    expect(shouldSendPose({ t: -Infinity, x: NaN, z: NaN, yaw: NaN }, p, 0)).toBe(true);
  });
  it('không gửi trước 100 ms', () => {
    expect(shouldSendPose({ t: 0, x: 0, z: 0, yaw: 0 }, p, POSE_INTERVAL_MS - 1)).toBe(false);
  });
  it('đứng yên chỉ gửi nhịp giữ kết nối', () => {
    const last = { t: 0, ...p };
    expect(shouldSendPose(last, p, 500)).toBe(false);
    expect(shouldSendPose(last, p, POSE_KEEPALIVE_MS)).toBe(true);
  });
  it('di chuyển thì gửi sau 100 ms', () => {
    expect(shouldSendPose({ t: 0, x: 0, z: 2, yaw: 0 }, p, POSE_INTERVAL_MS)).toBe(true);
  });
});

describe('worldEnabled', () => {
  it('cờ build hoặc query', () => {
    expect(worldEnabled('1', '')).toBe(true);
    expect(worldEnabled(undefined, '?world=1')).toBe(true);
    expect(worldEnabled(undefined, '?world=0')).toBe(false);
    expect(worldEnabled('', '')).toBe(false);
  });
});
