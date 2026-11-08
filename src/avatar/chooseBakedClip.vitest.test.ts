import { describe, expect, it } from 'vitest';
import { BAKED_CLIP_DEFS, chooseBakedClip, clipTimeScale } from './bakedClips';
import { CLIP_MAP } from '../scene/motion/clipMap';

const ALL = new Set(BAKED_CLIP_DEFS.map((d) => d.name));

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

describe('clipTimeScale', () => {
  it('Walk 4 m/s là 1, tỷ lệ theo tốc độ và bị kẹp', () => {
    expect(clipTimeScale('Walk', 4)).toBeCloseTo(1, 5);
    expect(clipTimeScale('Walk', 3)).toBeCloseTo(0.75, 5);
    expect(clipTimeScale('Walk', 0)).toBe(1);
    expect(clipTimeScale('Run', 100)).toBe(1.6);
    expect(clipTimeScale('Idle', 5)).toBe(1);
  });
});
