/**
 * Clip animation đã bake (Task 02): định nghĩa clip, tên tệp và bộ nạp cho runtime.
 * Clip được sinh từ chính tư thế procedural trong animation.ts (scripts/assets/bake-clips.ts) thành keyframe
 * quaternion trên xương MPFB, nên tên clip theo CLIP_MAP (src/scene/motion/clipMap.ts) và có thể thay thế procedural.
 * Module này không import React; an toàn để dùng trong Node (script bake, test).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { REST_POSE, computePose, type AvatarAnimation, type AvatarPose } from './animation';

export type BakedModelId = 'male_real' | 'female_real' | 'chibi';

export const BAKED_MODEL_IDS: readonly BakedModelId[] = ['male_real', 'female_real', 'chibi'];

/** URL tệp animation của từng mô hình (rest pose xương khác nhau nên mỗi mô hình một tệp). */
export function bakedClipUrl(model: BakedModelId): string {
  return `/models/anim_${model}.glb`;
}

/** Xương có keyframe quaternion (đúng các xương mà AvatarPose điều khiển, theo MPFB_BONE_MAP). */
export const BAKED_BONES: readonly string[] = [
  'neck_01', 'head', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r',
];

/** Xương gốc: keyframe vị trí (rootY) và xoay quanh Y (rootRotY). */
export const BAKED_ROOT_BONE = 'Root';

export interface BakedClipDef {
  name: string;
  durationSec: number;
  loop: boolean;
  fps: number;
  pose: (t: number, out: AvatarPose) => void;
}

const TAU = Math.PI * 2;
const ease = (x: number): number => {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
};

function copyPose(out: AvatarPose, src: AvatarPose): void {
  Object.assign(out, src);
}

function mix(out: AvatarPose, a: AvatarPose, b: AvatarPose, w: number): void {
  for (const k of Object.keys(REST_POSE) as Array<keyof AvatarPose>) out[k] = a[k] + (b[k] - a[k]) * w;
}

/** Đứng thở, khép kín sau 2π giây (breath = sin(2t) như idleInto, đầu nghiêng sin(t)). */
function idleAt(t: number, out: AvatarPose): void {
  copyPose(out, REST_POSE);
  const breath = Math.sin(t * 2);
  out.rootY = breath * 0.003;
  out.headRotZ = 0.02 * Math.sin(t);
  out.armLX = 0.03 * breath;
  out.armRX = 0.03 * breath;
}

const IDLE0 = { ...REST_POSE };
idleAt(0, IDLE0);
const JUMP = computePose('jump', 0);
const SIT0 = computePose('sit', 0);

/** Ngồi thở, khép kín sau π giây. */
function seatedAt(t: number, out: AvatarPose): void {
  copyPose(out, SIT0);
  const b = Math.sin(t * 2);
  out.rootY = SIT0.rootY + 0.002 * b;
  out.headRotZ = 0.02 * b;
}

function fromProcedural(anim: AvatarAnimation): (t: number, out: AvatarPose) => void {
  return (t, out) => copyPose(out, computePose(anim, t));
}

const SIT_DOWN_SEC = 0.6;
const HOP_SEC = 0.25;

export const BAKED_CLIP_DEFS: readonly BakedClipDef[] = [
  { name: 'Idle', durationSec: TAU, loop: true, fps: 8, pose: idleAt },
  // computePose('walk'|'run') dùng pha t*6 và t*10 rad: một chu kỳ = 2π/6 và 2π/10 giây.
  { name: 'Walk', durationSec: TAU / 6, loop: true, fps: 20, pose: fromProcedural('walk') },
  { name: 'Run', durationSec: TAU / 10, loop: true, fps: 30, pose: fromProcedural('run') },
  { name: 'JumpStart', durationSec: HOP_SEC, loop: false, fps: 30, pose: (t, o) => mix(o, IDLE0, JUMP, ease(t / HOP_SEC)) },
  {
    name: 'Airborne',
    durationSec: 1,
    loop: true,
    fps: 10,
    pose: (t, o) => {
      copyPose(o, JUMP);
      o.armLZ += 0.05 * Math.sin(TAU * t);
      o.armRZ -= 0.05 * Math.sin(TAU * t);
    },
  },
  {
    name: 'Land',
    durationSec: 0.3,
    loop: false,
    fps: 30,
    pose: (t, o) => {
      mix(o, JUMP, IDLE0, ease(t / 0.3));
      o.rootY -= 0.05 * Math.sin(Math.PI * Math.min(1, t / 0.3));
      o.kneeLX += 0.4 * Math.sin(Math.PI * Math.min(1, t / 0.3));
      o.kneeRX += 0.4 * Math.sin(Math.PI * Math.min(1, t / 0.3));
    },
  },
  { name: 'SitDown', durationSec: SIT_DOWN_SEC, loop: false, fps: 30, pose: (t, o) => mix(o, IDLE0, SIT0, ease(t / SIT_DOWN_SEC)) },
  { name: 'SeatedIdle', durationSec: Math.PI, loop: true, fps: 8, pose: seatedAt },
  { name: 'StandUp', durationSec: SIT_DOWN_SEC, loop: false, fps: 30, pose: (t, o) => mix(o, SIT0, IDLE0, ease(t / SIT_DOWN_SEC)) },
  {
    name: 'Interact',
    durationSec: 0.9,
    loop: false,
    fps: 30,
    pose: (t, o) => {
      // Tay phải đưa ra trước (xoay X âm là ra trước), giữ rồi thu về.
      const up = ease(t / 0.3);
      const down = ease((t - 0.6) / 0.3);
      const k = up * (1 - down);
      copyPose(o, IDLE0);
      o.armRX = -1.2 * k;
      o.armRZ = -0.15 * k;
      o.headRotZ = 0.03 * k;
    },
  },
  {
    name: 'Stunned',
    durationSec: 0.5,
    loop: false,
    fps: 30,
    pose: (t, o) => {
      const k = Math.sin(Math.PI * Math.min(1, t / 0.5));
      copyPose(o, IDLE0);
      o.rootY = -0.04 * k;
      o.headRotZ = 0.25 * k;
      o.armLZ = 0.4 * k;
      o.armRZ = -0.4 * k;
      o.legLX = -0.1 * k;
      o.legRX = -0.1 * k;
      o.kneeLX = 0.3 * k;
      o.kneeRX = 0.3 * k;
    },
  },
  {
    name: 'Wave',
    durationSec: Math.PI,
    loop: true,
    fps: 20,
    pose: (t, o) => {
      copyPose(o, computePose('wave', t));
      o.headRotZ = 0.05 * Math.sin(t * 2);
    },
  },
  { name: 'Dance', durationSec: Math.PI, loop: true, fps: 20, pose: fromProcedural('dance') },
];

/** Tên clip bake cho một AvatarAnimation cố định (không gồm 'locomotion': người chơi dùng FSM + CLIP_MAP). */
export const CLIP_FOR_ANIMATION: Readonly<Partial<Record<AvatarAnimation, string>>> = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  jump: 'Airborne',
  sit: 'SeatedIdle',
  wave: 'Wave',
  dance: 'Dance',
};

const cache = new Map<string, Promise<Map<string, THREE.AnimationClip> | null>>();

/** Nạp tệp clip đã bake. Trả null khi tải/giải mã lỗi (runtime rơi về procedural). Kết quả được nhớ theo URL. */
export function loadBakedClips(url: string): Promise<Map<string, THREE.AnimationClip> | null> {
  let p = cache.get(url);
  if (!p) {
    p = new GLTFLoader()
      .loadAsync(url)
      .then((g) => {
        const m = new Map<string, THREE.AnimationClip>();
        for (const c of g.animations) m.set(c.name, c);
        return m.size > 0 ? m : null;
      })
      .catch(() => null);
    cache.set(url, p);
  }
  return p;
}

/** Giá trị rootY (mét, đơn vị gốc của rig) tại thời điểm t từ track Root.position của clip; 0 nếu không có. */
export function clipRootOffsetY(clip: THREE.AnimationClip, restY: number, t: number): number {
  const tr = clip.tracks.find((k) => k.name === `${BAKED_ROOT_BONE}.position`);
  if (!tr) return 0;
  const v = tr.createInterpolant().evaluate(t) as ArrayLike<number>;
  return v[1] - restY;
}
