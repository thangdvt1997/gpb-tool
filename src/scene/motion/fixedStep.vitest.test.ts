import { describe, expect, it } from 'vitest';
import { createMotionInput, createMotionState, stepMotion } from '../controls/gtaMotion';
import {
  advanceFixedStep,
  createFixedStepper,
  FixedStepRunner,
  lerpAngle,
  pauseFixedStep,
  resumeFixedStep,
  type MotionPose,
} from './fixedStep';

/** Mô phỏng chạy thẳng `seconds` giây với fps cho trước, trả vị trí z. */
function simulate(fps: number, seconds: number): { z: number; steps: number } {
  const m = createMotionState({ x: 0, y: 0, z: 0 }, 0);
  const inp = createMotionInput();
  inp.dirZ = 1;
  inp.run = true;
  const r = new FixedStepRunner((o) => {
    o.x = m.pos.x;
    o.y = m.pos.y;
    o.z = m.pos.z;
    o.yaw = m.yaw;
  });
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) r.advance(1 / fps, (h) => stepMotion(m, inp, h, 0.3, []));
  return { z: m.pos.z, steps: r.stepper.totalSteps };
}

describe('fixedStep', () => {
  it('chạy đúng số bước theo thời gian', () => {
    const s = createFixedStepper();
    let n = 0;
    advanceFixedStep(s, 0.5, () => n++);
    // maxFrameDt 0.1 -> tối đa 6 bước, bị trần 5.
    expect(n).toBe(5);
  });
  it('dt nhỏ tích lũy qua nhiều khung', () => {
    const s = createFixedStepper();
    let n = 0;
    for (let i = 0; i < 6; i++) advanceFixedStep(s, 1 / 360, () => n++);
    expect(n).toBe(1);
  });
  it('cùng tổng thời gian cho cùng số bước ở 30/60/120/144 FPS', () => {
    const counts = [30, 60, 120, 144].map((f) => simulate(f, 2).steps);
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBe(120);
  });
  it('quãng đường khớp giữa các FPS trong dung sai 1 mm', () => {
    const zs = [30, 60, 120, 144].map((f) => simulate(f, 2).z);
    for (const z of zs) expect(Math.abs(z - zs[1]!)).toBeLessThan(1e-3);
    expect(zs[1]).toBeGreaterThan(5);
  });
  it('chạy lại cùng đầu vào cho kết quả giống hệt (tất định)', () => {
    expect(simulate(75, 1.5).z).toBe(simulate(75, 1.5).z);
  });
  it('kẹp bước mỗi khung và bỏ thời gian dư', () => {
    const s = createFixedStepper({ maxStepsPerFrame: 3, maxFrameDt: 1 });
    let n = 0;
    advanceFixedStep(s, 1, () => n++);
    expect(n).toBe(3);
    expect(s.acc).toBeLessThan(s.h);
    expect(s.droppedTime).toBeGreaterThan(0.9);
  });
  it('kẹp dt lớn (tab treo) không chạy loạt bước', () => {
    const s = createFixedStepper();
    let n = 0;
    advanceFixedStep(s, 30, () => n++);
    expect(n).toBeLessThanOrEqual(6);
    expect(s.droppedTime).toBeGreaterThan(29);
  });
  it('bỏ qua dt NaN, âm, 0', () => {
    const s = createFixedStepper();
    let n = 0;
    for (const dt of [NaN, -1, 0, Infinity]) advanceFixedStep(s, dt, () => n++);
    expect(n).toBe(0);
  });
  it('tạm dừng không chạy bước và khi tiếp tục không dồn thời gian', () => {
    const s = createFixedStepper();
    let n = 0;
    advanceFixedStep(s, 0.01, () => n++);
    pauseFixedStep(s);
    advanceFixedStep(s, 5, () => n++);
    expect(n).toBe(0);
    resumeFixedStep(s);
    advanceFixedStep(s, 0.001, () => n++);
    expect(n).toBe(0);
  });
  it('alpha nằm trong [0,1) và đúng phần dư', () => {
    const s = createFixedStepper();
    advanceFixedStep(s, s.h * 1.5, () => undefined);
    expect(s.alpha).toBeCloseTo(0.5, 6);
  });
  it('config sai ném lỗi', () => {
    expect(() => createFixedStepper({ hz: 0 })).toThrow();
    expect(() => createFixedStepper({ maxStepsPerFrame: 0 })).toThrow();
  });
  it('lerpAngle đi cung ngắn qua ±π', () => {
    const v = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(Math.abs(v) - Math.PI)).toBeLessThan(1e-9);
  });
  it('runner nội suy giữa trước và sau, và không nội suy qua dịch chuyển tức thời', () => {
    const p = { x: 0 };
    const r = new FixedStepRunner((o: MotionPose) => {
      o.x = p.x;
    });
    r.advance(r.stepper.h * 1.5, () => {
      p.x += 1;
    });
    expect(r.render.x).toBeCloseTo(0.5, 6);
    r.advance(r.stepper.h, () => {
      p.x += 100;
    });
    expect(r.prev.x).toBe(r.cur.x);
  });
});
