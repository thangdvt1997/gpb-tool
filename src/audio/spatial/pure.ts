/**
 * Logic thuần của âm thanh không gian (task 14): không phụ thuộc AudioContext, three hay React.
 */

export type BusName = 'master' | 'ambient' | 'sfx' | 'ui' | 'voice';
export const BUS_NAMES: readonly BusName[] = ['master', 'ambient', 'sfx', 'ui', 'voice'];

export interface BusState {
  volume: number;
  muted: boolean;
}
export type BusSettings = Record<BusName, BusState>;

export const SETTINGS_KEY = 'gpb.audio.spatial.v1';

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export function defaultBusSettings(): BusSettings {
  return {
    master: { volume: 0.8, muted: false },
    ambient: { volume: 0.5, muted: false },
    sfx: { volume: 0.8, muted: false },
    ui: { volume: 0.7, muted: false },
    voice: { volume: 1, muted: false },
  };
}

/** Đọc cấu hình từ chuỗi JSON; giá trị hỏng rơi về mặc định từng bus. */
export function parseBusSettings(raw: string | null | undefined): BusSettings {
  const out = defaultBusSettings();
  if (!raw) return out;
  try {
    const obj = JSON.parse(raw) as Partial<Record<BusName, Partial<BusState>>>;
    for (const name of BUS_NAMES) {
      const s = obj?.[name];
      if (!s || typeof s !== 'object') continue;
      if (typeof s.volume === 'number') out[name].volume = clamp01(s.volume);
      if (typeof s.muted === 'boolean') out[name].muted = s.muted;
    }
  } catch {
    /* JSON hỏng: dùng mặc định */
  }
  return out;
}

export function serializeBusSettings(s: BusSettings): string {
  return JSON.stringify(s);
}

/** Gain thực của một bus: tắt tiếng thì 0. */
export function busGain(s: BusState): number {
  return s.muted ? 0 : clamp01(s.volume);
}

export type Rolloff = 'linear' | 'inverse' | 'exponential';

export interface DistanceModel {
  refDistance: number;
  maxDistance: number;
  rolloff: number;
  model: Rolloff;
}

/** Gain theo khoảng cách, cùng công thức với PannerNode; bằng 0 khi vượt maxDistance (giới hạn nghe). */
export function distanceGain(dist: number, m: DistanceModel): number {
  if (!(dist >= 0)) return 0;
  if (dist >= m.maxDistance) return 0;
  const d = Math.max(dist, m.refDistance);
  let g: number;
  switch (m.model) {
    case 'linear': {
      const span = m.maxDistance - m.refDistance;
      g = span <= 0 ? 1 : 1 - (m.rolloff * (d - m.refDistance)) / span;
      break;
    }
    case 'exponential':
      g = Math.pow(d / m.refDistance, -m.rolloff);
      break;
    default:
      g = m.refDistance / (m.refDistance + m.rolloff * (d - m.refDistance));
  }
  return clamp01(g);
}

/** Đáp ứng hướng (cone) của nguồn: 1 trong góc trong, outerGain ngoài góc ngoài, nội suy giữa. Góc tính độ, là góc đầy đủ. */
export function coneGain(angleDeg: number, inner: number, outer: number, outerGain: number): number {
  const a = Math.abs(angleDeg) * 2;
  if (a <= inner) return 1;
  if (a >= outer) return outerGain;
  return 1 + ((outerGain - 1) * (a - inner)) / (outer - inner);
}

export interface ZoneOcclusion {
  /** Cùng vùng. */
  sameZone: number;
  /** Khác vùng (qua tường). */
  otherZone: number;
}

/** Tần số cắt bộ lọc thấp (Hz) và hệ số gain khi nghe qua tường. */
export interface OcclusionResult {
  cutoffHz: number;
  gain: number;
}

export const OPEN_CUTOFF_HZ = 20000;
export const WALL_CUTOFF_HZ = 700;
export const WALL_GAIN = 0.55;

/** Vùng khác nhau thì lọc thấp và giảm gain; cùng vùng thì để nguyên. Không raycast. */
export function occlusionFor(sourceZone: string, listenerZone: string): OcclusionResult {
  return sourceZone === listenerZone
    ? { cutoffHz: OPEN_CUTOFF_HZ, gain: 1 }
    : { cutoffHz: WALL_CUTOFF_HZ, gain: WALL_GAIN };
}

/** Gain tổng hợp cho một nguồn đặt trong scene. */
export function spatialGain(dist: number, m: DistanceModel, sourceZone: string, listenerZone: string): number {
  return distanceGain(dist, m) * occlusionFor(sourceZone, listenerZone).gain;
}

export interface Voice {
  id: number;
  /** Ưu tiên cao hơn thì khó bị cướp hơn. */
  priority: number;
  /** Khoảng cách tới listener (m). */
  distance: number;
  /** Thời điểm bắt đầu (giây). */
  startedAt: number;
}

/**
 * Chọn voice bị cướp khi đầy: ưu tiên thấp nhất; cùng ưu tiên thì xa nhất; cùng xa thì cũ nhất.
 * Trả null nếu còn chỗ hoặc voice mới còn kém hơn mọi voice đang phát (khi đó nên bỏ voice mới).
 */
export function pickVoiceToSteal(
  active: readonly Voice[],
  incoming: { priority: number; distance: number },
  maxVoices: number,
): Voice | null | 'reject' {
  if (active.length < maxVoices) return null;
  let worst: Voice | null = null;
  for (const v of active) {
    if (
      !worst ||
      v.priority < worst.priority ||
      (v.priority === worst.priority &&
        (v.distance > worst.distance || (v.distance === worst.distance && v.startedAt < worst.startedAt)))
    ) {
      worst = v;
    }
  }
  if (!worst) return null;
  const incomingWorse =
    incoming.priority < worst.priority ||
    (incoming.priority === worst.priority && incoming.distance >= worst.distance);
  return incomingWorse ? 'reject' : worst;
}

export type Surface = 'tile' | 'carpet' | 'stairs';

export interface FootstepState {
  /** Quãng đường tích luỹ từ bước trước (m). */
  accumulated: number;
  /** Chân kế tiếp: 0 trái, 1 phải. */
  foot: 0 | 1;
}

export interface FootstepInput {
  speed: number;
  dt: number;
  grounded: boolean;
}

export interface FootstepResult {
  state: FootstepState;
  /** Có bước chân cần phát trong frame này. */
  step: boolean;
  /** Âm lượng 0..1 theo tốc độ (đi nhẹ, chạy to). */
  intensity: number;
  foot: 0 | 1;
}

export const MIN_STEP_SPEED = 0.3;
export const WALK_STRIDE = 0.75;
export const RUN_STRIDE = 1.1;
const RUN_SPEED = 4;

export function newFootstepState(): FootstepState {
  return { accumulated: 0, foot: 0 };
}

/** Quãng bước theo tốc độ: nội suy từ bước đi sang bước chạy. */
export function strideFor(speed: number): number {
  const t = Math.min(1, Math.max(0, (speed - 1.5) / (RUN_SPEED - 1.5)));
  return WALK_STRIDE + (RUN_STRIDE - WALK_STRIDE) * t;
}

/** Bước chân đồng bộ vận tốc: đứng yên hoặc trên không thì không phát; trên không còn reset quãng. */
export function stepFootsteps(prev: FootstepState, inp: FootstepInput): FootstepResult {
  if (!inp.grounded || inp.speed < MIN_STEP_SPEED || !(inp.dt > 0)) {
    // Đứng yên thì giữ nửa quãng để bước đầu không phát ngay lập tức
    const state = inp.grounded && inp.speed < MIN_STEP_SPEED ? { accumulated: 0, foot: prev.foot } : { ...prev };
    return { state, step: false, intensity: 0, foot: prev.foot };
  }
  const acc = prev.accumulated + inp.speed * Math.min(inp.dt, 0.1);
  const stride = strideFor(inp.speed);
  if (acc >= stride) {
    const foot = prev.foot;
    return {
      state: { accumulated: acc - stride, foot: foot === 0 ? 1 : 0 },
      step: true,
      intensity: Math.min(1, 0.35 + (inp.speed / RUN_SPEED) * 0.65),
      foot,
    };
  }
  return { state: { accumulated: acc, foot: prev.foot }, step: false, intensity: 0, foot: prev.foot };
}

export type SfxEvent =
  | 'footstep'
  | 'door'
  | 'drawer'
  | 'switch'
  | 'chair'
  | 'printer'
  | 'waterCooler'
  | 'tv'
  | 'uiClick';

export interface SfxSpec {
  bus: BusName;
  spatial: boolean;
  priority: number;
  /** Thời lượng tối đa (giây), để dọn voice. */
  duration: number;
  /** Chặn lặp: khoảng tối thiểu giữa hai lần phát cùng sự kiện + cùng nguồn (giây). */
  cooldown: number;
  model: DistanceModel;
  /** Mô tả chữ cho tín hiệu quan trọng (trợ năng). */
  caption: string;
}

const near: DistanceModel = { refDistance: 1, maxDistance: 12, rolloff: 1.5, model: 'inverse' };

export const SFX_SPECS: Record<SfxEvent, SfxSpec> = {
  footstep: { bus: 'sfx', spatial: false, priority: 1, duration: 0.2, cooldown: 0.12, model: near, caption: '' },
  door: { bus: 'sfx', spatial: true, priority: 3, duration: 0.7, cooldown: 0.3, model: { ...near, maxDistance: 20 }, caption: 'Cửa mở hoặc đóng' },
  drawer: { bus: 'sfx', spatial: true, priority: 2, duration: 0.5, cooldown: 0.25, model: near, caption: 'Ngăn kéo' },
  switch: { bus: 'sfx', spatial: true, priority: 2, duration: 0.15, cooldown: 0.15, model: near, caption: 'Công tắc' },
  chair: { bus: 'sfx', spatial: true, priority: 1, duration: 0.5, cooldown: 0.3, model: near, caption: '' },
  printer: { bus: 'sfx', spatial: true, priority: 3, duration: 2.5, cooldown: 1, model: { ...near, maxDistance: 18 }, caption: 'Máy in đang in' },
  waterCooler: { bus: 'sfx', spatial: true, priority: 2, duration: 1.2, cooldown: 0.8, model: near, caption: 'Cây nước' },
  tv: { bus: 'ambient', spatial: true, priority: 2, duration: 3, cooldown: 2, model: { ...near, maxDistance: 16 }, caption: 'TV đang phát' },
  uiClick: { bus: 'ui', spatial: false, priority: 5, duration: 0.1, cooldown: 0.04, model: near, caption: '' },
};

/** Cổng cooldown theo khóa: trả true nếu được phát, và ghi nhận thời điểm. */
export class CooldownGate {
  private last = new Map<string, number>();
  allow(key: string, now: number, cooldown: number): boolean {
    const prev = this.last.get(key);
    if (prev !== undefined && now - prev < cooldown) return false;
    this.last.set(key, now);
    return true;
  }
  clear(): void {
    this.last.clear();
  }
}

/** Biến thiên nhỏ (nhân) quanh 1, rng nhận 0..1. */
export function jitter(rng: () => number, amount: number): number {
  return 1 + (rng() * 2 - 1) * amount;
}

/** Hệ số cao độ theo bề mặt để bước chân không lặp máy móc. */
export function surfaceParams(surface: Surface): { cutoffHz: number; thump: number; click: number } {
  switch (surface) {
    case 'carpet': return { cutoffHz: 900, thump: 0.6, click: 0 };
    case 'stairs': return { cutoffHz: 2500, thump: 1, click: 0.5 };
    default: return { cutoffHz: 4200, thump: 0.5, click: 1 };
  }
}
