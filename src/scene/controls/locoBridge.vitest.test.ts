import { describe, expect, it } from 'vitest';
import { createLocoInput, createLocomotionFsm, stepLocomotionFsm } from '../motion/locomotionFsm';
import { blendRenderPose, clipForState, fillLocoInput, locoBlendInputs, type LocoFrameFacts } from './locoBridge';

const base: LocoFrameFacts = { speed: 0, vy: 0, grounded: true, jumped: false, moveIntent: false, run: false, seated: false, emoteId: null };

function run(fsm: ReturnType<typeof createLocomotionFsm>, facts: Partial<LocoFrameFacts>, secs: number): void {
  const inp = createLocoInput();
  for (let t = 0; t < secs; t += 1 / 60) {
    fillLocoInput(inp, { ...base, ...facts }, fsm.state);
    stepLocomotionFsm(fsm, inp, 1 / 60);
  }
}

describe('locoBridge: input -> FSM -> đầu vào trộn', () => {
  it('đứng, đi, chạy theo tốc độ', () => {
    const f = createLocomotionFsm();
    run(f, { speed: 2, moveIntent: true }, 0.3);
    expect(f.state).toBe('walk');
    run(f, { speed: 5.5, moveIntent: true, run: true }, 0.3);
    expect(f.state).toBe('run');
    run(f, {}, 0.5);
    expect(f.state).toBe('idle');
  });

  it('nhảy -> trên không -> đáp -> idle, grounded cho trộn đúng từng pha', () => {
    const f = createLocomotionFsm();
    const bi = { grounded: true, sitting: false };
    run(f, { jumped: true, grounded: false, vy: 5 }, 1 / 60);
    expect(f.state).toBe('jumpStart');
    expect(locoBlendInputs(f.state, false, bi).grounded).toBe(false);
    run(f, { grounded: false, vy: 2 }, 0.2);
    expect(f.state).toBe('airborne');
    expect(locoBlendInputs(f.state, false, bi).grounded).toBe(false);
    run(f, { grounded: true }, 1 / 60);
    expect(f.state).toBe('land');
    expect(locoBlendInputs(f.state, false, bi).grounded).toBe(true);
    run(f, {}, 0.4);
    expect(f.state).toBe('idle');
  });

  it('ngồi theo ghế thật, không chờ minTime của FSM', () => {
    const bi = { grounded: true, sitting: false };
    const f = createLocomotionFsm();
    run(f, { seated: true }, 0.1);
    expect(f.state).toBe('sitDown');
    expect(locoBlendInputs(f.state, true, bi).sitting).toBe(true);
    // Đứng dậy ngay khi còn sitDown: pha trộn ngồi tắt ngay.
    expect(locoBlendInputs(f.state, false, bi).sitting).toBe(false);
    run(f, { seated: true }, 1);
    expect(f.state).toBe('seated');
  });

  it('emote: vào emote khi đứng yên, hết emote thì về idle, di chuyển thì hủy', () => {
    const f = createLocomotionFsm();
    run(f, { emoteId: 'wave' }, 0.1);
    expect(f.state).toBe('emote');
    expect(f.emoteId).toBe('wave');
    run(f, {}, 0.4);
    expect(f.state).toBe('idle');
    run(f, { emoteId: 'wave' }, 0.1);
    run(f, { speed: 2, moveIntent: true, emoteId: 'wave' }, 0.1);
    expect(f.state).toBe('walk');
  });

  it('clip: chưa có clip thật thì procedural, emote không có', () => {
    expect(clipForState('walk').source).toBe('procedural');
    expect(clipForState('emote').source).toBe('none');
    expect(clipForState('run', new Set(['Run'])).clip).toBe('Run');
  });
});

describe('blendRenderPose: nội suy cho camera', () => {
  it('nội suy theo alpha, kẹp alpha, nhảy thẳng khi dịch chuyển lớn hoặc snap', () => {
    const out = { x: 0, y: 0, z: 0 };
    const p = { x: 0, y: 0, z: 0 };
    const c = { x: 0.1, y: 0.2, z: 0.1 };
    blendRenderPose(out, p, c, 0.5);
    expect(out).toEqual({ x: 0.05, y: 0.1, z: 0.05 });
    blendRenderPose(out, p, c, 2);
    expect(out.x).toBeCloseTo(0.1);
    blendRenderPose(out, p, { x: 5, y: 0, z: 0 }, 0.2);
    expect(out.x).toBe(5);
    blendRenderPose(out, p, c, 0.1, true);
    expect(out.x).toBeCloseTo(0.1);
  });
});
