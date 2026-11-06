/**
 * Ánh xạ trạng thái locomotion -> tên clip, thời gian crossfade theo cặp trạng thái, fallback khi thiếu clip.
 * Hiện dự án CHƯA có clip rig thật cho các trạng thái này (animation là tư thế procedural trong
 * src/avatar/animation.ts), nên mặc định mọi clip đều "thiếu" và dùng tư thế procedural: không giả lập
 * bằng clip không liên quan.
 */
import type { AvatarAnimation } from '../../avatar/animation';
import type { LocoState } from './locomotionFsm';

export interface ClipDef {
  /** Tên clip ưu tiên. */
  clip: string;
  /** Tên thay thế, thử lần lượt nếu clip chính thiếu. */
  alternates: readonly string[];
  loop: boolean;
  /** Clip có điều khiển chân không. Chỉ một clip điều khiển chân tại một thời điểm (trừ lúc crossfade giữa hai clip). */
  drivesLegs: boolean;
  /** Tư thế procedural khi không có clip. null: nhường cho hệ emote/khác, không tự vẽ. */
  procedural: AvatarAnimation | null;
}

export const CLIP_MAP: Readonly<Record<LocoState, ClipDef>> = {
  idle: { clip: 'Idle', alternates: [], loop: true, drivesLegs: true, procedural: 'locomotion' },
  walk: { clip: 'Walk', alternates: ['WalkForward'], loop: true, drivesLegs: true, procedural: 'locomotion' },
  run: { clip: 'Run', alternates: ['Jog', 'Walk'], loop: true, drivesLegs: true, procedural: 'locomotion' },
  jumpStart: { clip: 'JumpStart', alternates: ['Jump'], loop: false, drivesLegs: true, procedural: 'locomotion' },
  airborne: { clip: 'Airborne', alternates: ['Fall', 'Jump'], loop: true, drivesLegs: true, procedural: 'locomotion' },
  land: { clip: 'Land', alternates: ['Idle'], loop: false, drivesLegs: true, procedural: 'locomotion' },
  sitDown: { clip: 'SitDown', alternates: ['Sit'], loop: false, drivesLegs: true, procedural: 'locomotion' },
  seated: { clip: 'SeatedIdle', alternates: ['Sit'], loop: true, drivesLegs: true, procedural: 'locomotion' },
  standUp: { clip: 'StandUp', alternates: ['Idle'], loop: false, drivesLegs: true, procedural: 'locomotion' },
  interact: { clip: 'Interact', alternates: ['Reach'], loop: false, drivesLegs: false, procedural: 'locomotion' },
  emote: { clip: 'Emote', alternates: [], loop: false, drivesLegs: true, procedural: null },
  stunned: { clip: 'Stunned', alternates: ['Hit'], loop: false, drivesLegs: true, procedural: 'locomotion' },
};

/** Thời gian crossfade mặc định (giây). */
export const DEFAULT_BLEND = 0.2;

/** Ghi đè theo cặp "từ>tới". Chuyển vào choáng/nhảy phải gấp, vào ngồi chậm hơn. */
const BLEND_OVERRIDES: Readonly<Record<string, number>> = {
  'idle>walk': 0.15,
  'walk>idle': 0.2,
  'walk>run': 0.2,
  'run>walk': 0.25,
  'run>idle': 0.25,
  'idle>run': 0.2,
  'idle>jumpStart': 0.06,
  'walk>jumpStart': 0.06,
  'run>jumpStart': 0.06,
  'jumpStart>airborne': 0.08,
  'airborne>land': 0.05,
  'land>idle': 0.15,
  'land>walk': 0.12,
  'land>run': 0.12,
  'idle>sitDown': 0.2,
  'sitDown>seated': 0.25,
  'seated>standUp': 0.2,
  'standUp>idle': 0.2,
  'emote>idle': 0.15,
  'emote>walk': 0.12,
  'emote>run': 0.12,
};

export function blendTime(from: LocoState, to: LocoState): number {
  if (to === 'stunned') return 0.05;
  return BLEND_OVERRIDES[`${from}>${to}`] ?? DEFAULT_BLEND;
}

export type ClipSource = 'clip' | 'procedural' | 'none';

export interface ResolvedClip {
  source: ClipSource;
  /** Tên clip tìm thấy (source = 'clip'). */
  clip: string | null;
  /** Có phải đã dùng tên thay thế thay vì clip chính. */
  usedAlternate: boolean;
  procedural: AvatarAnimation | null;
  loop: boolean;
}

/** Tìm clip cho trạng thái trong tập clip có sẵn; thiếu thì tư thế procedural; không có cả hai thì 'none'. */
export function resolveClip(state: LocoState, available: ReadonlySet<string>): ResolvedClip {
  const def = CLIP_MAP[state];
  if (available.has(def.clip)) {
    return { source: 'clip', clip: def.clip, usedAlternate: false, procedural: def.procedural, loop: def.loop };
  }
  for (const alt of def.alternates) {
    if (available.has(alt)) return { source: 'clip', clip: alt, usedAlternate: true, procedural: def.procedural, loop: def.loop };
  }
  if (def.procedural !== null) {
    return { source: 'procedural', clip: null, usedAlternate: false, procedural: def.procedural, loop: def.loop };
  }
  return { source: 'none', clip: null, usedAlternate: false, procedural: null, loop: def.loop };
}

export interface CrossfadePlan {
  from: ResolvedClip;
  to: ResolvedClip;
  fadeSeconds: number;
  /** Cả hai đầu đều là clip và cùng điều khiển chân: chỉ hợp lệ trong khoảng fade, sau đó dừng clip cũ. */
  overlapLegs: boolean;
}

export function planCrossfade(from: LocoState, to: LocoState, available: ReadonlySet<string>): CrossfadePlan {
  const a = resolveClip(from, available);
  const b = resolveClip(to, available);
  // Procedural không có thời gian fade riêng cho chân (đã làm mượt trong stepLocomotion): vẫn trả fade để đồng bộ.
  return {
    from: a,
    to: b,
    fadeSeconds: blendTime(from, to),
    overlapLegs: a.source === 'clip' && b.source === 'clip' && CLIP_MAP[from].drivesLegs && CLIP_MAP[to].drivesLegs,
  };
}

/** Liệt kê trạng thái thiếu clip (không có cả tên chính lẫn tên thay thế) để báo cáo asset còn thiếu. */
export function missingClips(available: ReadonlySet<string>): LocoState[] {
  const out: LocoState[] = [];
  for (const k of Object.keys(CLIP_MAP) as LocoState[]) {
    const def = CLIP_MAP[k];
    if (!available.has(def.clip) && !def.alternates.some((a) => available.has(a))) out.push(k);
  }
  return out;
}
