/**
 * State machine locomotion của nhân vật (hàm thuần, không React/three).
 * Một tick tối đa MỘT lần chuyển trạng thái. Chuyển phải nằm trong LOCO_TRANSITIONS; chuyển "mềm" còn phải
 * qua thời gian tối thiểu của trạng thái hiện tại, chuyển "cứng" (choáng, mất chạm đất, hủy emote) thì không.
 * Khi nhiều đề nghị cùng lúc, đề nghị có ưu tiên cao nhất thắng.
 * Ra: danh sách sự kiện (enter/exit/footstep/jump/land/rejected) cho âm thanh và animation.
 */

export const LOCO_STATES = [
  'idle',
  'walk',
  'run',
  'jumpStart',
  'airborne',
  'land',
  'sitDown',
  'seated',
  'standUp',
  'interact',
  'emote',
  'stunned',
] as const;

export type LocoState = (typeof LOCO_STATES)[number];

/** Bảng chuyển hợp lệ. Ngoài bảng thì bị từ chối. */
export const LOCO_TRANSITIONS: Readonly<Record<LocoState, readonly LocoState[]>> = {
  idle: ['walk', 'run', 'jumpStart', 'airborne', 'sitDown', 'interact', 'emote', 'stunned'],
  walk: ['idle', 'run', 'jumpStart', 'airborne', 'sitDown', 'interact', 'stunned'],
  run: ['idle', 'walk', 'jumpStart', 'airborne', 'stunned'],
  jumpStart: ['airborne', 'stunned'],
  airborne: ['land', 'stunned'],
  land: ['idle', 'walk', 'run', 'jumpStart', 'airborne', 'sitDown', 'stunned'],
  sitDown: ['seated', 'standUp'],
  seated: ['standUp', 'interact'],
  standUp: ['idle', 'stunned'],
  interact: ['idle', 'seated', 'stunned'],
  // Emote bị hủy khi di chuyển/nhảy: đi thẳng sang trạng thái di chuyển tương ứng.
  emote: ['idle', 'walk', 'run', 'jumpStart', 'airborne', 'stunned'],
  stunned: ['idle', 'airborne'],
};

export interface LocoStateDef {
  /** Thời gian tối thiểu (giây) trước khi được rời bằng chuyển mềm. */
  minTime: number;
  /** Ưu tiên khi nhiều đề nghị cùng tick. Lớn hơn thắng. */
  priority: number;
  /** Tự chuyển sang trạng thái này khi hết minTime (trạng thái có thời lượng cố định). */
  autoExit: LocoState | null;
}

export const LOCO_DEFS: Readonly<Record<LocoState, LocoStateDef>> = {
  idle: { minTime: 0, priority: 0, autoExit: null },
  walk: { minTime: 0.05, priority: 10, autoExit: null },
  run: { minTime: 0.05, priority: 11, autoExit: null },
  emote: { minTime: 0.3, priority: 20, autoExit: null },
  land: { minTime: 0.12, priority: 40, autoExit: null },
  airborne: { minTime: 0.05, priority: 45, autoExit: null },
  jumpStart: { minTime: 0.08, priority: 50, autoExit: 'airborne' },
  interact: { minTime: 0.3, priority: 60, autoExit: null },
  seated: { minTime: 0.2, priority: 70, autoExit: null },
  sitDown: { minTime: 0.6, priority: 80, autoExit: 'seated' },
  standUp: { minTime: 0.5, priority: 81, autoExit: 'idle' },
  stunned: { minTime: 0.4, priority: 100, autoExit: null },
};

export interface LocoConfig {
  /** Tốc độ (m/s) bắt đầu đi / thôi đi: lệch nhau để không nhấp nháy idle<->walk. */
  walkEnterSpeed: number;
  walkExitSpeed: number;
  runEnterSpeed: number;
  runExitSpeed: number;
  /** Chỉ cho ngồi khi tốc độ không vượt mức này. */
  maxSitSpeed: number;
  /** Độ dài một bước chân (m), để phát sự kiện footstep theo quãng đường. */
  walkStepLength: number;
  runStepLength: number;
}

export const DEFAULT_LOCO_CONFIG: LocoConfig = {
  walkEnterSpeed: 0.3,
  walkExitSpeed: 0.15,
  runEnterSpeed: 4.2,
  runExitSpeed: 3.9,
  maxSitSpeed: 4.4,
  walkStepLength: 0.75,
  runStepLength: 1.1,
};

export interface LocoInput {
  /** Tốc độ ngang thực tế (m/s) sau va chạm. */
  speed: number;
  /** Người chơi đang đẩy cần/phím di chuyển. */
  moveIntent: boolean;
  /** Giữ chạy. */
  run: boolean;
  /** Chạm đất (từ motor/vật lý, không suy từ Y). */
  grounded: boolean;
  /** Vận tốc đứng (m/s, dương = lên). */
  vy: number;
  /** Motor vừa nhảy ở tick này. */
  jumped: boolean;
  sitRequested: boolean;
  standRequested: boolean;
  interactRequested: boolean;
  /** Thao tác tương tác hiện tại đã xong. */
  interactDone: boolean;
  /** id emote muốn phát, hoặc null. */
  emoteRequested: string | null;
  /** Emote đã phát xong. */
  emoteDone: boolean;
  /** Bị khóa/choáng từ ngoài (trúng đòn, nằm đỡ, bị chặn). */
  stunned: boolean;
}

export function createLocoInput(): LocoInput {
  return {
    speed: 0,
    moveIntent: false,
    run: false,
    grounded: true,
    vy: 0,
    jumped: false,
    sitRequested: false,
    standRequested: false,
    interactRequested: false,
    interactDone: false,
    emoteRequested: null,
    emoteDone: false,
    stunned: false,
  };
}

export type LocoEvent =
  | { type: 'enter'; state: LocoState; from: LocoState }
  | { type: 'exit'; state: LocoState; to: LocoState }
  | { type: 'footstep'; foot: 'L' | 'R'; run: boolean }
  | { type: 'jump' }
  | { type: 'land'; impact: number }
  | { type: 'rejected'; request: 'jump' | 'sit' | 'interact' | 'emote'; state: LocoState };

export interface LocomotionFsm {
  state: LocoState;
  previous: LocoState | null;
  /** Thời gian đã ở trạng thái hiện tại (giây). */
  timeIn: number;
  /** Sự kiện của tick gần nhất. Mảng được tái dùng, đọc xong trong cùng tick. */
  events: LocoEvent[];
  emoteId: string | null;
  /** Trạng thái quay về khi interact xong. */
  returnTo: LocoState;
  /** Tốc độ rơi lớn nhất (m/s, dương) từ lúc rời đất, dùng làm cường độ tiếng đáp. */
  fallPeak: number;
  stepAcc: number;
  nextFoot: 'L' | 'R';
}

export function createLocomotionFsm(initial: LocoState = 'idle'): LocomotionFsm {
  return {
    state: initial,
    previous: null,
    timeIn: 0,
    events: [],
    emoteId: null,
    returnTo: 'idle',
    fallPeak: 0,
    stepAcc: 0,
    nextFoot: 'L',
  };
}

export function canLocoTransition(from: LocoState, to: LocoState): boolean {
  return LOCO_TRANSITIONS[from].includes(to);
}

/** Trạng thái khóa di chuyển do người chơi (ngồi, đứng dậy, tương tác, choáng). */
export function isLocoMoveLocked(s: LocoState): boolean {
  return s === 'sitDown' || s === 'seated' || s === 'standUp' || s === 'interact' || s === 'stunned';
}

/** Có thể nhảy ở trạng thái này (để cổng hóa ý định nhảy trước motor). */
export function canLocoJump(s: LocoState): boolean {
  return canLocoTransition(s, 'jumpStart');
}

/** Trạng thái chân chạm đất. */
function isGroundedGroup(s: LocoState): boolean {
  return s === 'idle' || s === 'walk' || s === 'run' || s === 'land';
}

interface Offer {
  to: LocoState;
}

/** Chạy một tick. Trả về chính `f` (đã đổi trạng thái nếu có, f.events chứa sự kiện). */
export function stepLocomotionFsm(
  f: LocomotionFsm,
  inp: LocoInput,
  dt: number,
  cfg: LocoConfig = DEFAULT_LOCO_CONFIG,
): LocomotionFsm {
  const d = dt > 0 && Number.isFinite(dt) ? dt : 0;
  f.events.length = 0;
  f.timeIn += d;
  const s = f.state;
  const soft = f.timeIn >= LOCO_DEFS[s].minTime;
  let best: Offer | null = null;

  const offer = (to: LocoState, hard: boolean): void => {
    if (!canLocoTransition(s, to)) return;
    if (!hard && !soft) return;
    if (best === null || LOCO_DEFS[to].priority > LOCO_DEFS[best.to].priority) best = { to };
  };

  /** Chọn idle/walk/run theo tốc độ, có trễ. */
  const locomotionTarget = (): LocoState => {
    const wantRun = inp.run && inp.moveIntent;
    const runOn = s === 'run' ? cfg.runExitSpeed : cfg.runEnterSpeed;
    if (wantRun && inp.speed > runOn) return 'run';
    const walkOn = s === 'idle' || s === 'land' || s === 'emote' ? cfg.walkEnterSpeed : cfg.walkExitSpeed;
    if (inp.speed > walkOn) return 'walk';
    return 'idle';
  };

  // Yêu cầu bị từ chối: báo để UI/âm thanh biết (không im lặng).
  if (inp.jumped && !isGroundedGroup(s) && s !== 'emote') f.events.push({ type: 'rejected', request: 'jump', state: s });
  if (inp.sitRequested && !(s === 'idle' || s === 'walk' || s === 'land'))
    if (s !== 'sitDown' && s !== 'seated') f.events.push({ type: 'rejected', request: 'sit', state: s });
  if (inp.emoteRequested !== null && s !== 'idle' && s !== 'emote')
    f.events.push({ type: 'rejected', request: 'emote', state: s });
  if (inp.interactRequested && !(s === 'idle' || s === 'walk' || s === 'seated'))
    f.events.push({ type: 'rejected', request: 'interact', state: s });

  // Choáng/khóa: ưu tiên cao nhất, bỏ qua thời gian tối thiểu.
  if (inp.stunned) offer('stunned', true);

  if (s === 'stunned') {
    if (!inp.stunned) offer(inp.grounded ? 'idle' : 'airborne', false);
  } else if (isGroundedGroup(s) || s === 'emote') {
    const cancelEmote = s === 'emote' && (inp.moveIntent || inp.jumped || !inp.grounded || inp.speed > cfg.walkEnterSpeed);
    const hard = cancelEmote;
    if (inp.jumped) offer('jumpStart', true);
    else if (!inp.grounded) offer('airborne', true);
    else if (s === 'emote') {
      if (cancelEmote) {
        const t = locomotionTarget();
        offer(t, hard);
      } else if (inp.emoteDone) offer('idle', false);
    } else {
      if (inp.sitRequested && inp.speed <= cfg.maxSitSpeed) offer('sitDown', false);
      if (inp.interactRequested) offer('interact', false);
      if (inp.emoteRequested !== null) offer('emote', false);
      offer(locomotionTarget(), false);
    }
  } else if (s === 'airborne') {
    if (inp.grounded) offer('land', false);
  } else if (s === 'sitDown') {
    if (inp.standRequested) offer('standUp', false);
  } else if (s === 'seated') {
    if (inp.standRequested) offer('standUp', false);
    else if (inp.interactRequested) offer('interact', false);
  } else if (s === 'interact') {
    if (inp.interactDone) offer(f.returnTo, false);
  }

  // Trạng thái có thời lượng cố định tự thoát khi hết minTime (ưu tiên thấp hơn mọi đề nghị khác đã có).
  const autoExit = LOCO_DEFS[s].autoExit;
  if (autoExit !== null && soft && best === null) offer(autoExit, false);

  const chosen = best as Offer | null;
  if (chosen !== null) applyTransition(f, chosen.to, inp);

  emitFootsteps(f, inp, d, cfg);
  if (f.state === 'airborne' || f.state === 'jumpStart') f.fallPeak = Math.max(f.fallPeak, -inp.vy);
  return f;
}

function applyTransition(f: LocomotionFsm, to: LocoState, inp: LocoInput): void {
  const from = f.state;
  f.events.push({ type: 'exit', state: from, to });
  f.previous = from;
  f.state = to;
  f.timeIn = 0;
  f.events.push({ type: 'enter', state: to, from });
  if (to === 'jumpStart') {
    f.fallPeak = 0;
    f.events.push({ type: 'jump' });
  } else if (to === 'airborne' && from !== 'jumpStart') {
    f.fallPeak = Math.max(0, -inp.vy);
  } else if (to === 'land') {
    f.events.push({ type: 'land', impact: f.fallPeak });
    f.fallPeak = 0;
  } else if (to === 'interact') {
    f.returnTo = from === 'seated' ? 'seated' : 'idle';
  } else if (to === 'emote') {
    f.emoteId = inp.emoteRequested;
  }
  if (from === 'emote') f.emoteId = null;
}

function emitFootsteps(f: LocomotionFsm, inp: LocoInput, dt: number, cfg: LocoConfig): void {
  if (f.state !== 'walk' && f.state !== 'run') return;
  const run = f.state === 'run';
  f.stepAcc += inp.speed * dt;
  const len = run ? cfg.runStepLength : cfg.walkStepLength;
  while (f.stepAcc >= len) {
    f.stepAcc -= len;
    f.events.push({ type: 'footstep', foot: f.nextFoot, run });
    f.nextFoot = f.nextFoot === 'L' ? 'R' : 'L';
  }
}

/** Thoát khẩn cấp (mất kết nối, hồi sinh, đổi cảnh): không kiểm tra bảng chuyển. */
export function resetLocomotionFsm(f: LocomotionFsm, state: LocoState = 'idle'): void {
  f.state = state;
  f.previous = null;
  f.timeIn = 0;
  f.events.length = 0;
  f.emoteId = null;
  f.returnTo = 'idle';
  f.fallPeak = 0;
  f.stepAcc = 0;
}
