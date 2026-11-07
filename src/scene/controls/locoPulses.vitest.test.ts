import { describe, expect, it } from 'vitest';
import { createLocoInput, createLocomotionFsm, stepLocomotionFsm } from '../motion/locomotionFsm';
import { CLIP_MAP } from '../motion/clipMap';
import type { LocoState } from '../motion/locomotionFsm';
import { onInteractEvent, emitInteractEvent, clearInteractListeners } from '../interact/objects/interactEvents';
import { clipForState, fillLocoInput, locoBlendInputs, type LocoFrameFacts } from './locoBridge';
import { INTERACT_PULSE, createLocoPulses, interactActive, isUseEvent, noteInteractEvent, requestStun, stunActive } from './locoPulses';

const base: LocoFrameFacts = { speed: 0, vy: 0, grounded: true, jumped: false, moveIntent: false, run: false, seated: false, emoteId: null };

function run(fsm: ReturnType<typeof createLocomotionFsm>, facts: Partial<LocoFrameFacts>, secs: number): void {
  const inp = createLocoInput();
  for (let t = 0; t < secs; t += 1 / 60) {
    fillLocoInput(inp, { ...base, ...facts }, fsm.state);
    stepLocomotionFsm(fsm, inp, 1 / 60);
  }
}

describe('locoPulses: nguồn interact từ bus sự kiện', () => {
  it('hành động thật bật xung; từ chối và ghế thì không', () => {
    expect(isUseEvent('door.open')).toBe(true);
    expect(isUseEvent('light.switch')).toBe(true);
    expect(isUseEvent('item.pickup')).toBe(true);
    for (const t of ['door.blocked', 'door.locked', 'item.denied', 'chair.sit', 'chair.stand', 'water.denied']) expect(isUseEvent(t)).toBe(false);
    const p = createLocoPulses();
    expect(noteInteractEvent(p, 'chair.sit', 10)).toBe(false);
    expect(interactActive(p, 10.1)).toBe(false);
    expect(noteInteractEvent(p, 'door.open', 10)).toBe(true);
    expect(interactActive(p, 10 + INTERACT_PULSE - 0.01)).toBe(true);
    expect(interactActive(p, 10 + INTERACT_PULSE + 0.01)).toBe(false);
  });

  it('nghe thật qua onInteractEvent (không sửa module interact)', () => {
    clearInteractListeners();
    const p = createLocoPulses();
    const off = onInteractEvent((e) => void noteInteractEvent(p, e.type, 5));
    emitInteractEvent({ type: 'drawer.open', id: 'd1' });
    expect(interactActive(p, 5.1)).toBe(true);
    off();
    clearInteractListeners();
  });

  it('FSM: dùng vật -> interact -> hết xung -> về idle/walk', () => {
    const f = createLocomotionFsm();
    run(f, { interactActive: true }, 0.1);
    expect(f.state).toBe('interact');
    run(f, { interactActive: false }, 0.5);
    expect(f.state).toBe('idle');
    run(f, { speed: 2, moveIntent: true }, 0.3);
    run(f, { speed: 2, moveIntent: true, interactActive: true }, 0.1);
    expect(f.state).toBe('interact');
    run(f, { speed: 2, moveIntent: true }, 0.5);
    expect(f.state).toBe('walk');
  });

  it('nhảy luôn thắng dùng vật: tư thế trên không không bị che', () => {
    const f = createLocomotionFsm();
    const bi = { grounded: true, sitting: false };
    run(f, { interactActive: true, jumped: true, grounded: false, vy: 5 }, 1 / 60);
    expect(f.state).toBe('jumpStart');
    // Đang interact rồi rời đất: blend vẫn báo trên không nhờ dữ kiện thật.
    const g = createLocomotionFsm();
    run(g, { interactActive: true }, 0.1);
    expect(g.state).toBe('interact');
    expect(locoBlendInputs(g.state, false, bi, false).grounded).toBe(false);
    expect(locoBlendInputs(g.state, false, bi, true).grounded).toBe(true);
  });

  it('không có sự kiện thì hành vi cũ không đổi (không bao giờ vào interact/stunned)', () => {
    const f = createLocomotionFsm();
    const seen = new Set<LocoState>();
    const inp = createLocoInput();
    for (let i = 0; i < 600; i++) {
      const walking = i % 200 < 100;
      fillLocoInput(inp, { ...base, speed: walking ? 2 : 0, moveIntent: walking }, f.state);
      stepLocomotionFsm(f, inp, 1 / 60);
      seen.add(f.state);
    }
    expect(seen.has('interact')).toBe(false);
    expect(seen.has('stunned')).toBe(false);
  });
});

describe('stunned: điểm nối chưa có nguồn', () => {
  it('requestStun làm FSM vào stunned rồi thoát khi hết hạn', () => {
    const p = createLocoPulses();
    requestStun(p, 0, 0.5);
    expect(stunActive(p, 0.2)).toBe(true);
    const f = createLocomotionFsm();
    run(f, { stunned: true }, 0.1);
    expect(f.state).toBe('stunned');
    run(f, { stunned: false }, 0.6);
    expect(f.state).toBe('idle');
    expect(stunActive(p, 0.6)).toBe(false);
  });
});

describe('clipMap: fallback procedural khi chưa có clip thật', () => {
  it('tập clip rỗng: mọi trạng thái ra procedural (emote: none), không clip', () => {
    for (const s of Object.keys(CLIP_MAP) as LocoState[]) {
      const r = clipForState(s);
      expect(r.clip).toBeNull();
      expect(r.source).toBe(s === 'emote' ? 'none' : 'procedural');
    }
  });
  it('có clip thì dùng clip', () => {
    expect(clipForState('interact', new Set(['Interact'])).source).toBe('clip');
    expect(clipForState('stunned', new Set(['Hit'])).usedAlternate).toBe(true);
  });
});
