import { describe, expect, it } from 'vitest';
import { HEAD_YAW_LIMIT, headYawGoal, stepHeadLook, type LocomotionState } from '../../avatar/animation';
import { createMotionInput, createMotionState, stepMotion, wrapAngle } from './gtaMotion';

const H = 1 / 60;

function loco(): LocomotionState {
  return { phase: 0, move: 0, run: 0, air: 0, sit: 0, headYaw: 0, turn: 0, turnPhase: 0, fsm: 'idle', speed: 0 };
}

describe('xoay tại chỗ (turnYaw)', () => {
  it('đứng yên: thân quay mượt về hướng camera, không trượt', () => {
    const s = createMotionState({ x: 0, y: 0, z: 0 }, 0);
    const input = createMotionInput();
    input.turnYaw = Math.PI / 2;
    const yaws: number[] = [];
    for (let i = 0; i < 60; i++) {
      stepMotion(s, input, H, 0.3, []);
      yaws.push(s.yaw);
    }
    expect(s.pos.x).toBe(0);
    expect(s.pos.z).toBe(0);
    expect(Math.abs(wrapAngle(s.yaw - Math.PI / 2))).toBeLessThan(0.01);
    // Đơn điệu, không nhảy cóc: mỗi bước không quá turnInPlaceMax * h.
    for (let i = 1; i < yaws.length; i++) {
      const d = yaws[i]! - yaws[i - 1]!;
      expect(d).toBeGreaterThanOrEqual(-1e-9);
      expect(d).toBeLessThanOrEqual(6 * H + 1e-9);
    }
  });

  it('báo tốc độ quay thân để chạy hoạt ảnh xoay', () => {
    const s = createMotionState({ x: 0, y: 0, z: 0 }, 0);
    const input = createMotionInput();
    input.turnYaw = -1;
    stepMotion(s, input, H, 0.3, []);
    expect(s.turnSpeed).toBeLessThan(0);
    input.turnYaw = null;
    stepMotion(s, input, H, 0.3, []);
    expect(s.turnSpeed).toBe(0);
  });

  it('đang đi thì quay theo hướng đi, bỏ qua turnYaw', () => {
    const s = createMotionState({ x: 0, y: 0, z: 0 }, 0);
    const input = createMotionInput();
    input.dirX = 1;
    input.turnYaw = Math.PI;
    for (let i = 0; i < 60; i++) stepMotion(s, input, H, 0.3, []);
    expect(Math.abs(wrapAngle(s.yaw - Math.PI / 2))).toBeLessThan(0.05);
  });

  it('đổi hướng đi liên tục: thân quay mượt, không khựng (không bước nào đứng hẳn giữa chừng)', () => {
    const s = createMotionState({ x: 0, y: 0, z: 0 }, 0);
    const input = createMotionInput();
    input.dirZ = 1;
    for (let i = 0; i < 30; i++) stepMotion(s, input, H, 0.3, []);
    input.dirZ = 0;
    input.dirX = 1;
    let prev = s.yaw;
    let stalled = 0;
    for (let i = 0; i < 20; i++) {
      stepMotion(s, input, H, 0.3, []);
      if (Math.abs(wrapAngle(Math.PI / 2 - s.yaw)) > 0.05 && Math.abs(s.yaw - prev) < 1e-6) stalled++;
      prev = s.yaw;
    }
    expect(stalled).toBe(0);
    expect(s.speed).toBeGreaterThan(1);
  });
});

describe('đầu nhìn theo camera', () => {
  it('kẹp ±70 độ', () => {
    expect(HEAD_YAW_LIMIT).toBeCloseTo((70 * Math.PI) / 180);
    expect(headYawGoal(0.5, 0)).toBeCloseTo(0.5);
    expect(headYawGoal(2, 0)).toBeCloseTo(HEAD_YAW_LIMIT);
    expect(headYawGoal(-2, 0)).toBeCloseTo(-HEAD_YAW_LIMIT);
    // Gói góc: thân 3,0, camera -3,0 là lệch 0,28 rad, không phải -6.
    expect(headYawGoal(-3, 3)).toBeCloseTo(2 * Math.PI - 6);
  });

  it('chuyển động mượt về góc đích, về giữa khi tắt', () => {
    const s = loco();
    stepHeadLook(s, 1, 0, 0, 0, true, H);
    expect(s.headYaw).toBeGreaterThan(0);
    expect(s.headYaw).toBeLessThan(0.5);
    for (let i = 0; i < 120; i++) stepHeadLook(s, 1, 0, 0, 0, true, H);
    expect(s.headYaw).toBeCloseTo(1, 2);
    for (let i = 0; i < 120; i++) stepHeadLook(s, 1, 0, 0, 0, false, H);
    expect(Math.abs(s.headYaw)).toBeLessThan(0.01);
  });

  it('xoay tại chỗ bật khi đứng yên và thân quay, tắt khi đi', () => {
    const s = loco();
    for (let i = 0; i < 30; i++) stepHeadLook(s, 0, 0, 4, 0, true, H);
    expect(s.turn).toBeGreaterThan(0.8);
    expect(s.turnPhase).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) stepHeadLook(s, 0, 0, 4, 3, true, H);
    expect(s.turn).toBeLessThan(0.05);
  });
});
