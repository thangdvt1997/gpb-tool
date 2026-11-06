import { describe, expect, it } from 'vitest';
import { blendTime, CLIP_MAP, missingClips, planCrossfade, resolveClip } from './clipMap';
import {
  canLocoJump,
  canLocoTransition,
  createLocoInput,
  createLocomotionFsm,
  LOCO_STATES,
  LOCO_TRANSITIONS,
  stepLocomotionFsm,
  type LocoInput,
  type LocoState,
} from './locomotionFsm';

const H = 1 / 60;
function run(f: ReturnType<typeof createLocomotionFsm>, inp: LocoInput, secs: number): void {
  for (let i = 0; i < Math.round(secs / H); i++) stepLocomotionFsm(f, inp, H);
}
function walkIn(): LocoInput {
  const i = createLocoInput();
  i.speed = 4;
  i.moveIntent = true;
  return i;
}

describe('bảng chuyển', () => {
  it('mọi trạng thái có hàng trong bảng và đích hợp lệ', () => {
    for (const s of LOCO_STATES) for (const t of LOCO_TRANSITIONS[s]) expect(LOCO_STATES).toContain(t);
  });
  it('chuyển không hợp lệ bị từ chối', () => {
    expect(canLocoTransition('seated', 'run')).toBe(false);
    expect(canLocoTransition('airborne', 'idle')).toBe(false);
    expect(canLocoTransition('sitDown', 'airborne')).toBe(false);
  });
  it('chỉ nhảy được từ idle, walk, run, land, emote', () => {
    const can = LOCO_STATES.filter((s) => canLocoJump(s));
    expect(can.sort()).toEqual(['emote', 'idle', 'land', 'run', 'walk'].sort());
  });
});

describe('locomotion', () => {
  it('idle -> walk -> run -> walk -> idle theo tốc độ, có trễ', () => {
    const f = createLocomotionFsm();
    const i = walkIn();
    run(f, i, 0.2);
    expect(f.state).toBe('walk');
    i.run = true;
    i.speed = 7;
    run(f, i, 0.2);
    expect(f.state).toBe('run');
    i.speed = 4;
    i.run = false;
    run(f, i, 0.2);
    expect(f.state).toBe('walk');
    i.speed = 0;
    i.moveIntent = false;
    run(f, i, 0.2);
    expect(f.state).toBe('idle');
  });
  it('tốc độ nằm trong vùng trễ không làm nhấp nháy', () => {
    const f = createLocomotionFsm();
    const i = walkIn();
    run(f, i, 0.2);
    i.speed = 0.2; // giữa exit 0.15 và enter 0.3
    run(f, i, 0.5);
    expect(f.state).toBe('walk');
  });
  it('nhảy: idle -> jumpStart -> airborne -> land -> idle, có sự kiện jump và land', () => {
    const f = createLocomotionFsm();
    const i = createLocoInput();
    const seen: string[] = [];
    const tick = (secs: number): void => {
      for (let k = 0; k < Math.round(secs / H); k++) {
        stepLocomotionFsm(f, i, H);
        for (const e of f.events) seen.push(e.type);
        i.jumped = false;
      }
    };
    i.jumped = true;
    i.grounded = false;
    i.vy = 4.6;
    tick(H);
    expect(f.state).toBe('jumpStart');
    tick(0.2);
    expect(f.state).toBe('airborne');
    i.vy = -5;
    tick(0.1);
    i.grounded = true;
    tick(0.05);
    expect(f.state).toBe('land');
    tick(0.3);
    expect(f.state).toBe('idle');
    expect(seen).toContain('jump');
    expect(seen).toContain('land');
  });
  it('land mang cường độ rơi', () => {
    const f = createLocomotionFsm('airborne');
    f.timeIn = 1;
    const i = createLocoInput();
    i.grounded = false;
    i.vy = -6;
    stepLocomotionFsm(f, i, H);
    i.grounded = true;
    i.vy = 0;
    stepLocomotionFsm(f, i, H);
    const ev = f.events.find((e) => e.type === 'land');
    expect(ev && ev.type === 'land' ? ev.impact : 0).toBeCloseTo(6, 6);
  });
  it('mất chạm đất khi đi (rơi khỏi mép) vào airborne ngay, bỏ qua minTime', () => {
    const f = createLocomotionFsm('walk');
    const i = walkIn();
    i.grounded = false;
    stepLocomotionFsm(f, i, H);
    expect(f.state).toBe('airborne');
  });
  it('không nhảy khi đang ngồi: bị từ chối có sự kiện', () => {
    const f = createLocomotionFsm('seated');
    f.timeIn = 1;
    const i = createLocoInput();
    i.jumped = true;
    stepLocomotionFsm(f, i, H);
    expect(f.state).toBe('seated');
    expect(f.events.some((e) => e.type === 'rejected' && e.request === 'jump')).toBe(true);
  });
  it('ngồi và đứng dậy: idle -> sitDown -> seated -> standUp -> idle', () => {
    const f = createLocomotionFsm();
    const i = createLocoInput();
    i.sitRequested = true;
    stepLocomotionFsm(f, i, H);
    expect(f.state).toBe('sitDown');
    i.sitRequested = false;
    run(f, i, 0.7);
    expect(f.state).toBe('seated');
    i.standRequested = true;
    run(f, i, 0.1);
    expect(f.state).toBe('seated'); // seated chưa đủ minTime 0.2 s
    run(f, i, 0.2);
    expect(f.state).toBe('standUp');
    i.standRequested = false;
    run(f, i, 0.6);
    expect(f.state).toBe('idle');
  });
  it('không ngồi khi đang chạy nhanh', () => {
    const f = createLocomotionFsm('run');
    f.timeIn = 1;
    const i = walkIn();
    i.run = true;
    i.speed = 7;
    i.sitRequested = true;
    stepLocomotionFsm(f, i, H);
    expect(f.state).toBe('run');
    expect(f.events.some((e) => e.type === 'rejected' && e.request === 'sit')).toBe(true);
  });
  it('đứng dậy chưa xong thì không đi được (minTime)', () => {
    const f = createLocomotionFsm('standUp');
    const i = walkIn();
    run(f, i, 0.2);
    expect(f.state).toBe('standUp');
  });
  it('interact quay về seated nếu bắt đầu khi đang ngồi', () => {
    const f = createLocomotionFsm('seated');
    f.timeIn = 1;
    const i = createLocoInput();
    i.interactRequested = true;
    stepLocomotionFsm(f, i, H);
    expect(f.state).toBe('interact');
    i.interactRequested = false;
    i.interactDone = true;
    run(f, i, 0.4);
    expect(f.state).toBe('seated');
  });
  it('emote bị hủy khi di chuyển, bỏ qua minTime', () => {
    const f = createLocomotionFsm();
    const i = createLocoInput();
    i.emoteRequested = 'wave';
    stepLocomotionFsm(f, i, H);
    expect(f.state).toBe('emote');
    expect(f.emoteId).toBe('wave');
    i.emoteRequested = null;
    Object.assign(i, walkIn());
    stepLocomotionFsm(f, i, H);
    expect(f.state).toBe('walk');
    expect(f.emoteId).toBeNull();
  });
  it('emote tự về idle khi phát xong', () => {
    const f = createLocomotionFsm('emote');
    const i = createLocoInput();
    i.emoteDone = true;
    run(f, i, 0.4);
    expect(f.state).toBe('idle');
  });
  it('emote chỉ bắt đầu từ idle', () => {
    const f = createLocomotionFsm('walk');
    f.timeIn = 1;
    const i = walkIn();
    i.emoteRequested = 'wave';
    stepLocomotionFsm(f, i, H);
    expect(f.state).toBe('walk');
  });
  it('choáng thắng mọi thứ, thoát được sau minTime', () => {
    const f = createLocomotionFsm('run');
    const i = walkIn();
    i.stunned = true;
    i.jumped = true;
    stepLocomotionFsm(f, i, H);
    expect(f.state).toBe('stunned');
    i.jumped = false;
    i.stunned = false;
    run(f, i, 0.1);
    expect(f.state).toBe('stunned');
    run(f, i, 0.5);
    expect(f.state).not.toBe('stunned');
  });
  it('phát footstep luân phiên chân L/R theo quãng đường', () => {
    const f = createLocomotionFsm('walk');
    f.timeIn = 1;
    const i = walkIn();
    const feet: string[] = [];
    for (let k = 0; k < 60; k++) {
      stepLocomotionFsm(f, i, H);
      for (const e of f.events) if (e.type === 'footstep') feet.push(e.foot);
    }
    // 4 m/s * 1 s / 0.75 m = 5 bước
    expect(feet.length).toBe(5);
    expect(feet[0]).toBe('L');
    expect(feet[1]).toBe('R');
  });
  it('mỗi tick tối đa một lần chuyển', () => {
    const f = createLocomotionFsm();
    const i = walkIn();
    i.jumped = true;
    i.grounded = false;
    stepLocomotionFsm(f, i, H);
    expect(f.events.filter((e) => e.type === 'enter').length).toBe(1);
    expect(f.state).toBe('jumpStart');
  });
  it('ngẫu nhiên: không bao giờ thực hiện chuyển ngoài bảng', () => {
    let seed = 12345;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const f = createLocomotionFsm();
    const i = createLocoInput();
    for (let k = 0; k < 5000; k++) {
      i.speed = rnd() * 8;
      i.moveIntent = rnd() < 0.6;
      i.run = rnd() < 0.5;
      i.grounded = rnd() < 0.8;
      i.vy = rnd() * 10 - 5;
      i.jumped = rnd() < 0.05;
      i.sitRequested = rnd() < 0.03;
      i.standRequested = rnd() < 0.05;
      i.interactRequested = rnd() < 0.03;
      i.interactDone = rnd() < 0.1;
      i.emoteRequested = rnd() < 0.03 ? 'wave' : null;
      i.emoteDone = rnd() < 0.1;
      i.stunned = rnd() < 0.02;
      stepLocomotionFsm(f, i, H);
      for (const e of f.events) if (e.type === 'enter') expect(canLocoTransition(e.from as LocoState, e.state)).toBe(true);
    }
  });
});

describe('clipMap', () => {
  it('thiếu clip dùng tư thế procedural, emote thì none', () => {
    const none = new Set<string>();
    expect(resolveClip('walk', none).source).toBe('procedural');
    expect(resolveClip('emote', none).source).toBe('none');
  });
  it('dùng tên thay thế khi clip chính thiếu', () => {
    const r = resolveClip('run', new Set(['Jog']));
    expect(r.clip).toBe('Jog');
    expect(r.usedAlternate).toBe(true);
  });
  it('thời gian blend theo cặp và nhanh khi vào choáng', () => {
    expect(blendTime('idle', 'walk')).toBe(0.15);
    expect(blendTime('walk', 'stunned')).toBe(0.05);
    expect(blendTime('seated', 'airborne')).toBe(0.2);
  });
  it('crossfade giữa hai clip chân báo overlapLegs, procedural thì không', () => {
    const all = new Set(Object.values(CLIP_MAP).map((d) => d.clip));
    expect(planCrossfade('walk', 'run', all).overlapLegs).toBe(true);
    expect(planCrossfade('walk', 'run', new Set()).overlapLegs).toBe(false);
  });
  it('missingClips liệt kê đủ khi không có clip nào', () => {
    expect(missingClips(new Set())).toHaveLength(LOCO_STATES.length);
    expect(missingClips(new Set(['Idle', 'Walk']))).not.toContain('walk');
  });
});
