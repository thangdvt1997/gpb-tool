import { describe, expect, it } from 'vitest';
import { ALL_BAKED_CLIP_DEFS, BAKED_CLIP_DEFS, chooseBakedClip, clipTimeScale, emoteFadeSec } from './bakedClips';
import { CLIP_MAP } from '../scene/motion/clipMap';

const ALL = new Set(ALL_BAKED_CLIP_DEFS.map((d) => d.name));
const LOCO_ONLY = new Set(BAKED_CLIP_DEFS.map((d) => d.name));

describe('chooseBakedClip (người chơi, FSM)', () => {
  it('mỗi trạng thái FSM có clip trong CLIP_MAP thì ra baked', () => {
    expect(chooseBakedClip('locomotion', 'idle', ALL, false)).toEqual({ clip: 'Idle', source: 'baked' });
    expect(chooseBakedClip('locomotion', 'walk', ALL, false)).toEqual({ clip: 'Walk', source: 'baked' });
    expect(chooseBakedClip('locomotion', 'run', ALL, false)).toEqual({ clip: 'Run', source: 'baked' });
    expect(chooseBakedClip('locomotion', 'airborne', ALL, false).clip).toBe('Airborne');
    expect(chooseBakedClip('locomotion', 'seated', ALL, false).clip).toBe('SeatedIdle');
    expect(chooseBakedClip('locomotion', 'interact', ALL, false).clip).toBe('Interact');
  });
  it('mọi trạng thái trừ emote đều có clip bake', () => {
    for (const st of Object.keys(CLIP_MAP)) {
      const r = chooseBakedClip('locomotion', st, ALL, false);
      expect(r.source).toBe(st === 'emote' ? 'procedural' : 'baked');
    }
  });
  it('emote đang phát, chưa nạp, tải lỗi hoặc ?baked=0 thì procedural', () => {
    expect(chooseBakedClip('locomotion', 'idle', ALL, true).source).toBe('procedural');
    expect(chooseBakedClip('locomotion', 'idle', null, false).source).toBe('procedural');
    expect(chooseBakedClip('locomotion', 'idle', new Set(), false)).toEqual({ clip: null, source: 'procedural' });
  });
  it('thiếu clip riêng thì dùng tên thay thế, không có thì procedural', () => {
    expect(chooseBakedClip('locomotion', 'run', new Set(['Walk']), false).clip).toBe('Walk');
    expect(chooseBakedClip('locomotion', 'walk', new Set(['Idle']), false).source).toBe('procedural');
  });
  it('animation cố định (NPC) theo CLIP_FOR_ANIMATION', () => {
    expect(chooseBakedClip('sit', 'idle', ALL, false).clip).toBe('SeatedIdle');
    expect(chooseBakedClip('walk', 'idle', new Set(['Idle']), false).source).toBe('procedural');
  });
});

describe('chooseBakedClip (emote)', () => {
  it('emote có clip Emote_<id> thì phát clip bake', () => {
    expect(chooseBakedClip('locomotion', 'emote', ALL, true, { emoteId: 'wave' })).toEqual({ clip: 'Emote_wave', source: 'baked' });
    expect(chooseBakedClip('locomotion', 'idle', ALL, true, { emoteId: 'dance_1' }).clip).toBe('Emote_dance_1');
  });
  it('thiếu clip emote (GLB cũ), GLB lỗi, ?baked=0, id rỗng hoặc giảm chuyển động thì procedural', () => {
    expect(chooseBakedClip('locomotion', 'emote', LOCO_ONLY, true, { emoteId: 'wave' }).source).toBe('procedural');
    expect(chooseBakedClip('locomotion', 'emote', null, true, { emoteId: 'wave' }).source).toBe('procedural');
    expect(chooseBakedClip('locomotion', 'emote', new Set(), true, { emoteId: 'wave' }).source).toBe('procedural');
    expect(chooseBakedClip('locomotion', 'emote', ALL, true, {}).source).toBe('procedural');
    expect(chooseBakedClip('locomotion', 'emote', ALL, true, { emoteId: 'wave', emoteReduced: true }).source).toBe('procedural');
  });
  it('emote lặp fade bằng LEAD_IN, emote còn lại fade ngắn', () => {
    expect(emoteFadeSec('dance_1')).toBeCloseTo(0.3, 5);
    expect(emoteFadeSec('wave')).toBeCloseTo(0.1, 5);
    expect(emoteFadeSec('khong_co')).toBeCloseTo(0.1, 5);
  });
});

describe('xoay tại chỗ dùng Walk bước chậm', () => {
  it('idle + turn cao thì Walk, thấp thì Idle', () => {
    expect(chooseBakedClip('locomotion', 'idle', ALL, false, { turn: 0.5 }).clip).toBe('Walk');
    expect(chooseBakedClip('locomotion', 'idle', ALL, false, { turn: 0.05 }).clip).toBe('Idle');
    expect(chooseBakedClip('locomotion', 'idle', ALL, false, { turn: 0 }).clip).toBe('Idle');
  });
  it('trễ: đang Walk thì giữ tới khi turn dưới ngưỡng thấp', () => {
    expect(chooseBakedClip('locomotion', 'idle', ALL, false, { turn: 0.12, prevClip: 'Idle' }).clip).toBe('Idle');
    expect(chooseBakedClip('locomotion', 'idle', ALL, false, { turn: 0.12, prevClip: 'Walk' }).clip).toBe('Walk');
    expect(chooseBakedClip('locomotion', 'idle', ALL, false, { turn: 0.05, prevClip: 'Walk' }).clip).toBe('Idle');
  });
  it('chỉ khi FSM idle; ngồi, đi, NPC không bị ảnh hưởng; thiếu Walk thì Idle', () => {
    expect(chooseBakedClip('locomotion', 'seated', ALL, false, { turn: 1 }).clip).toBe('SeatedIdle');
    expect(chooseBakedClip('locomotion', 'run', ALL, false, { turn: 1 }).clip).toBe('Run');
    expect(chooseBakedClip('idle', 'idle', ALL, false, { turn: 1 }).clip).toBe('Idle');
    expect(chooseBakedClip('locomotion', 'idle', new Set(['Idle']), false, { turn: 1 }).clip).toBe('Idle');
  });
  it('clipTimeScale của Walk tại chỗ theo mức xoay, kẹp 0,3 đến 1,2; đang đi không đổi', () => {
    expect(clipTimeScale('Walk', 0, 0.6)).toBeCloseTo(1, 5);
    expect(clipTimeScale('Walk', 0, 0.1)).toBe(0.3);
    expect(clipTimeScale('Walk', 0, 1)).toBe(1.2);
    expect(clipTimeScale('Walk', 4, 1)).toBeCloseTo(1, 5);
    expect(clipTimeScale('Idle', 0, 1)).toBe(1);
  });
});

describe('clipTimeScale', () => {
  it('Walk 4 m/s là 1, tỷ lệ theo tốc độ và bị kẹp', () => {
    expect(clipTimeScale('Walk', 4)).toBeCloseTo(1, 5);
    expect(clipTimeScale('Walk', 3)).toBeCloseTo(0.75, 5);
    expect(clipTimeScale('Walk', 0)).toBe(1);
    expect(clipTimeScale('Run', 100)).toBe(1.6);
    expect(clipTimeScale('Idle', 5)).toBe(1);
  });
});
