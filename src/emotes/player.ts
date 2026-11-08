import { EMOTES, LEAD_IN, LEAD_OUT, isInternalEmote } from './library';
import type { EaseName, EmoteDef, EmoteId, EmoteState, Pose, PoseKey } from './types';

/**
 * Bộ phát emote. Trạng thái nằm ngoài React (module), nên useFrame chỉ gọi
 * sampleEmotePose(out) để ghi vào một Pose dựng sẵn: không tạo đối tượng, vật liệu hay mảng mới.
 */

const KEYS: readonly PoseKey[] = [
  'rootY', 'rootRotY', 'headRotZ', 'armLX', 'armLZ', 'armRX', 'armRZ', 'legLX', 'legRX',
];

/** Giảm chuyển động: emote một lần chỉ hiện tư thế tĩnh trong khoảng này (giây). */
const REDUCED_HOLD = 1.5;

const IDLE_STATE: EmoteState = Object.freeze({ phase: 'idle', id: null, mode: null, startedAt: 0 });

let current: EmoteDef | null = null;
let state: EmoteState = IDLE_STATE;
let reduced = false;
/** true: tư thế đóng băng ở khung đứng yên (chế độ chụp ảnh), không tự hết giờ và không bị notifyMovement hủy. */
let frozen = false;
const listeners = new Set<() => void>();

/** Có đang bật giảm chuyển động không. Đọc mỗi lần phát để theo kịp thay đổi của hệ điều hành. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function setState(next: EmoteState): void {
  state = next;
  listeners.forEach((fn) => fn());
}

/** Đăng ký nhận thay đổi trạng thái (dùng với useSyncExternalStore). Trả hàm hủy đăng ký. */
export function subscribeEmote(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Emote hiện tại đang ở tư thế tĩnh (giảm chuyển động hoặc chụp ảnh): avatar không dùng clip. */
export function isEmoteReduced(): boolean {
  return reduced || frozen;
}

/** Ảnh chụp trạng thái. Cùng một đối tượng cho tới khi trạng thái đổi. */
export function getEmoteState(): EmoteState {
  return state;
}

/**
 * Bắt đầu emote do người dùng chọn. Bấm lại stance đang giữ thì thoát tấn.
 * Từ chối emote nội bộ (không làm gì); scene dùng playInternalEmote.
 */
export function playEmote(id: EmoteId, nowMs: number = performance.now()): void {
  if (isInternalEmote(id)) return;
  if (current !== null && current.id === id && current.mode === 'hold') {
    cancelEmote();
    return;
  }
  start(id, nowMs);
}

/**
 * Phát emote nội bộ (apologize, startle, hit, down, angry_stance) cho scene gọi cho NPC và đối thủ.
 * Phát lại emote hold đang giữ thì giữ nguyên, không bật tắt. Id không nội bộ thì bỏ qua.
 */
export function playInternalEmote(id: EmoteId, nowMs: number = performance.now()): void {
  if (!isInternalEmote(id)) return;
  if (current !== null && current.id === id && current.mode === 'hold') return;
  start(id, nowMs);
}

function start(id: EmoteId, nowMs: number): void {
  current = EMOTES[id];
  reduced = prefersReducedMotion();
  frozen = false;
  setState({ phase: 'playing', id, mode: current.mode, startedAt: nowMs });
}

/**
 * Giữ nhân vật ở khung đứng yên (reducedFrame) của emote người dùng, không chuyển động, tới khi gọi
 * releaseHeldPose hoặc cancelEmote. Dùng cho chế độ chụp ảnh. Emote nội bộ bị từ chối.
 */
export function holdEmotePose(id: EmoteId, nowMs: number = performance.now()): void {
  if (isInternalEmote(id)) return;
  current = EMOTES[id];
  reduced = true;
  frozen = true;
  setState({ phase: 'playing', id, mode: current.mode, startedAt: nowMs });
}

/** Bỏ tư thế đang giữ bởi holdEmotePose. Trả true nếu có bỏ; emote chạy bình thường thì không đụng. */
export function releaseHeldPose(): boolean {
  if (!frozen) return false;
  cancelEmote();
  return true;
}

/** Hủy emote đang chạy, kể cả stance. Không làm gì nếu đang rảnh. */
export function cancelEmote(): void {
  if (current === null) return;
  current = null;
  frozen = false;
  setState(IDLE_STATE);
}

/**
 * Gọi khi nhân vật di chuyển (W, A, S, D, click-để-đi, nhảy).
 * Hủy emote đang chạy, trừ stance là emote đứng yên nên được giữ.
 */
export function notifyMovement(): void {
  if (current === null || frozen || current.mode === 'hold') return;
  cancelEmote();
}

function ease(name: EaseName | undefined, u: number): number {
  switch (name) {
    case 'linear':
      return u;
    case 'smooth':
      return u * u * (3 - 2 * u);
    case 'out':
      return 1 - (1 - u) * (1 - u);
    case 'sine':
    default:
      return 0.5 - 0.5 * Math.cos(Math.PI * u);
  }
}

function lerpInto(out: Pose, from: Partial<Pose> | null, to: Partial<Pose> | null, k: number): void {
  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[i];
    const a = from === null ? 0 : (from[key] ?? 0);
    const b = to === null ? 0 : (to[key] ?? 0);
    out[key] = a + (b - a) * k;
  }
}

function copyInto(out: Pose, src: Partial<Pose>): void {
  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[i];
    out[key] = src[key] ?? 0;
  }
}

function cycleLength(def: EmoteDef): number {
  let sum = 0;
  for (let i = 0; i < def.frames.length; i++) sum += def.frames[i].dur;
  return sum;
}

/**
 * Ghi tư thế emote tại thời điểm nowMs vào `out`. Trả true nếu emote đang điều khiển tư thế,
 * false nếu rảnh (khi đó `out` không đổi và avatar dùng animation thường).
 * Emote một lần tự kết thúc: hết giờ thì trạng thái về rảnh.
 */
export function sampleEmotePose(out: Pose, nowMs: number = performance.now()): boolean {
  const def = current;
  if (def === null) return false;
  const t = Math.max(0, (nowMs - state.startedAt) / 1000);
  if (!samplePoseOf(out, def, t, reduced, frozen)) {
    cancelEmote();
    return false;
  }
  return true;
}

/** Thời lượng (giây) của emote `once` kể từ lúc bắt đầu tới khi về nghỉ; loop/hold trả Infinity. */
export function emoteDurationSec(def: EmoteDef): number {
  if (def.mode !== 'once') return Infinity;
  let sum = LEAD_IN + LEAD_OUT;
  for (let i = 1; i < def.frames.length; i++) sum += def.frames[i].dur;
  return sum;
}

/**
 * Thuần: tư thế của `def` sau `t` giây kể từ lúc bắt đầu. Dùng chung cho nhân vật của mình (sampleEmotePose)
 * và avatar từ xa. Trả false khi emote một lần đã kết thúc (`out` không đổi).
 * `frozen`: giữ tư thế tĩnh mãi, không tự hết giờ.
 */
export function samplePoseOf(out: Pose, def: EmoteDef, t: number, reduced: boolean, frozen = false): boolean {
  const frames = def.frames;

  if (reduced) {
    // Giảm chuyển động: một tư thế tĩnh, đổi tức thì, không nội suy, không lặp.
    if (!frozen && def.mode === 'once' && t > REDUCED_HOLD) {
      return false;
    }
    copyInto(out, frames[def.reducedFrame].pose);
    return true;
  }

  // Lead-in: từ tư thế nghỉ vào mốc đầu.
  if (t < LEAD_IN) {
    lerpInto(out, null, frames[0].pose, ease('smooth', t / LEAD_IN));
    return true;
  }
  let local = t - LEAD_IN;

  if (def.mode === 'loop') {
    // Mốc i (i >= 1) tới sau đoạn dur của nó; đoạn cuối quay về mốc 0 với dur của mốc 0.
    local %= cycleLength(def);
    let acc = 0;
    for (let i = 1; i <= frames.length; i++) {
      const toIdx = i % frames.length;
      const seg = frames[toIdx].dur;
      if (local < acc + seg || i === frames.length) {
        const u = seg > 0 ? Math.min(1, (local - acc) / seg) : 1;
        lerpInto(out, frames[i - 1].pose, frames[toIdx].pose, ease(frames[toIdx].ease, u));
        return true;
      }
      acc += seg;
    }
    return true;
  }

  // once / hold: đi qua các mốc 1..n-1.
  let acc = 0;
  for (let i = 1; i < frames.length; i++) {
    const seg = frames[i].dur;
    if (local < acc + seg) {
      lerpInto(out, frames[i - 1].pose, frames[i].pose, ease(frames[i].ease, (local - acc) / seg));
      return true;
    }
    acc += seg;
  }
  const last = frames[frames.length - 1].pose;
  if (def.mode === 'hold') {
    copyInto(out, last);
    return true;
  }
  // once: lead-out về nghỉ rồi kết thúc.
  const tail = local - acc;
  if (tail >= LEAD_OUT) {
    return false;
  }
  lerpInto(out, last, null, ease('smooth', tail / LEAD_OUT));
  return true;
}
