/**
 * Tên hoạt ảnh có sẵn.
 * - idle, walk, run, jump, sit: tư thế đơn lẻ.
 * - locomotion: trộn mượt idle, walk, run, jump, sit theo playerLocomotion (chỉ nhân vật người chơi dùng).
 */
export type AvatarAnimation = 'idle' | 'walk' | 'run' | 'jump' | 'sit' | 'wave' | 'dance' | 'locomotion';

/**
 * Tư thế của nhân vật tại một thời điểm. Mọi góc tính bằng radian.
 * Quy ước rig dự phòng: tay và chân ở tư thế nghỉ hướng xuống (-Y);
 * xoay quanh X là đung đưa tới lui (âm: đưa ra trước); xoay quanh Z là giơ ngang (dương: sang trái, âm: sang phải).
 */
export interface AvatarPose {
  /** Độ dịch chuyển theo Y của gốc (mét). */
  rootY: number;
  /** Xoay quanh trục Y của gốc (rad). */
  rootRotY: number;
  /** Nghiêng đầu quanh trục Z (rad). */
  headRotZ: number;
  /** Quay đầu quanh trục Y (rad, dương: sang trái nhân vật), tương đối với cổ. Đầu nhìn theo camera. */
  headRotY: number;
  /** Quay cổ quanh trục Y (rad). Tổng góc nhìn = neckRotY + headRotY. */
  neckRotY: number;
  /** Tay trái: xoay quanh X (đung đưa) và quanh Z (giơ ngang). */
  armLX: number;
  armLZ: number;
  /** Tay phải: xoay quanh X (đung đưa) và quanh Z (giơ ngang). */
  armRX: number;
  armRZ: number;
  /** Chân trái và phải (khớp hông): xoay quanh X. */
  legLX: number;
  legRX: number;
  /** Gối trái và phải: xoay quanh X, dương là gập cẳng chân ra sau. Emote không ghi hai trường này (giữ 0). */
  kneeLX: number;
  kneeRX: number;
}

/** Tư thế nghỉ, không cử động. */
export const REST_POSE: AvatarPose = {
  rootY: 0,
  rootRotY: 0,
  headRotZ: 0,
  headRotY: 0,
  neckRotY: 0,
  armLX: 0,
  armLZ: 0,
  armRX: 0,
  armRZ: 0,
  legLX: 0,
  legRX: 0,
  kneeLX: 0,
  kneeRX: 0,
};

const POSE_KEYS: ReadonlyArray<keyof AvatarPose> = [
  'rootY',
  'rootRotY',
  'headRotZ',
  'headRotY',
  'neckRotY',
  'armLX',
  'armLZ',
  'armRX',
  'armRZ',
  'legLX',
  'legRX',
  'kneeLX',
  'kneeRX',
];

/** Khớp hông của rig dự phòng (m, chưa scale), khớp HIP_Y trong fallbackBody. */
const HIP_HEIGHT = 0.86;
/** Độ cao khớp hông khi ngồi trên đệm ghế (mặt đệm 0,48 m cộng bề dày đùi). */
const SEATED_HIP = 0.56;

/** Độ cao khớp hông của rig dự phòng (m). rootY trong AvatarPose tính theo mốc này. */
export const POSE_HIP_HEIGHT = HIP_HEIGHT;

// ---------------------------------------------------------------------------------------------------------------
// Bảng map AvatarPose sang xương MPFB (rig game_engine, 53 xương, tên kiểu Unreal).
// Tên đã kiểm trong public/models/{male_real,female_real,chibi}.glb. Ba tệp cùng bộ xương.
// Trục: mô hình Y lên, mặt hướng +Z, bên trái nhân vật ở +X, giống rig dự phòng. Trục cục bộ của xương
// (Blender: Y dọc xương, cuộn xương khác nhau) không dùng trực tiếp; MpfbAvatar đổi góc từ không gian mô hình
// sang không gian cục bộ của từng xương nên quy ước dấu giữ nguyên như FallbackAvatar.

/** Khớp mà AvatarPose điều khiển. */
export type PoseJoint = 'neck' | 'head' | 'armL' | 'armR' | 'foreArmL' | 'foreArmR' | 'legL' | 'legR' | 'kneeL' | 'kneeR';

export interface MpfbJointMap {
  /** Tên xương trong GLB. */
  bone: string;
  /** Trường góc xoay quanh X (mô hình) lấy từ AvatarPose; null là không xoay. */
  rotX: keyof AvatarPose | null;
  /** Trường góc xoay quanh Z (mô hình) lấy từ AvatarPose; null là không xoay. */
  rotZ: keyof AvatarPose | null;
  /** Trường góc xoay quanh Y (mô hình) lấy từ AvatarPose; null là không xoay. */
  rotY?: keyof AvatarPose | null;
  /** Khớp cha trong bảng này mà góc của nó cộng dồn (cẳng tay theo cánh tay, gối theo hông). */
  follows: PoseJoint | null;
}

export const MPFB_BONE_MAP: Readonly<Record<PoseJoint, MpfbJointMap>> = {
  // Cổ và đầu chia góc nhìn theo camera (đầu đi theo cổ).
  neck: { bone: 'neck_01', rotX: null, rotZ: null, rotY: 'neckRotY', follows: null },
  head: { bone: 'head', rotX: null, rotZ: 'headRotZ', rotY: 'headRotY', follows: 'neck' },
  armL: { bone: 'upperarm_l', rotX: 'armLX', rotZ: 'armLZ', follows: null },
  armR: { bone: 'upperarm_r', rotX: 'armRX', rotZ: 'armRZ', follows: null },
  // Cẳng tay đi theo cánh tay (AvatarPose không có khuỷu). Bàn tay, ngón giữ tư thế nghỉ tương đối.
  foreArmL: { bone: 'lowerarm_l', rotX: null, rotZ: null, follows: 'armL' },
  foreArmR: { bone: 'lowerarm_r', rotX: null, rotZ: null, follows: 'armR' },
  legL: { bone: 'thigh_l', rotX: 'legLX', rotZ: null, follows: null },
  legR: { bone: 'thigh_r', rotX: 'legRX', rotZ: null, follows: null },
  // Gối: dương là gập cẳng chân ra sau. Bàn chân (foot_*, ball_*) đi theo cẳng chân.
  kneeL: { bone: 'calf_l', rotX: 'kneeLX', rotZ: null, follows: 'legL' },
  kneeR: { bone: 'calf_r', rotX: 'kneeRX', rotZ: null, follows: 'legR' },
};

/**
 * Xương MPFB không có trường tương ứng trong AvatarPose, giữ tư thế nghỉ:
 * pelvis, spine_01, spine_02, spine_03, neck_01, clavicle_*, hand_*, ngón tay, foot_*, ball_*.
 * rootY và rootRotY áp lên group gốc của nhân vật, không lên xương Root.
 */
export const MPFB_REST_BONES: readonly string[] = [
  'pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'hand_l', 'hand_r',
  'foot_l', 'foot_r', 'ball_l', 'ball_r',
];

/** Thứ tự áp dụng: khớp cha trước khớp con (follows). */
export const MPFB_JOINT_ORDER: readonly PoseJoint[] = [
  'neck', 'head', 'armL', 'armR', 'foreArmL', 'foreArmR', 'legL', 'legR', 'kneeL', 'kneeR',
];

function reset(out: AvatarPose): AvatarPose {
  for (const k of POSE_KEYS) out[k] = 0;
  return out;
}

/** out = a + (b - a) * w, ghi vào out (out có thể trùng a). */
function mixInto(out: AvatarPose, a: AvatarPose, b: AvatarPose, w: number): AvatarPose {
  for (const k of POSE_KEYS) out[k] = a[k] + (b[k] - a[k]) * w;
  return out;
}

function idleInto(out: AvatarPose, t: number): AvatarPose {
  // Thở nhẹ: thân dao động nhỏ theo sin, tay chỉ khẽ đung đưa.
  const breath = Math.sin(t * 2);
  reset(out);
  out.rootY = breath * 0.003;
  out.headRotZ = 0.02 * Math.sin(t * 0.8);
  out.armLX = 0.03 * breath;
  out.armRX = 0.03 * breath;
  return out;
}

/** Bước đi theo pha (rad). Chân và tay đối nhau, gối gập khi chân ở phía sau. */
function walkInto(out: AvatarPose, phase: number): AvatarPose {
  const s = Math.sin(phase);
  reset(out);
  out.rootY = Math.abs(s) * 0.02;
  out.armLX = -0.45 * s;
  out.armRX = 0.45 * s;
  out.legLX = 0.5 * s;
  out.legRX = -0.5 * s;
  out.kneeLX = 0.55 * Math.max(0, s);
  out.kneeRX = 0.55 * Math.max(0, -s);
  return out;
}

/** Chạy: sải dài hơn, tay đánh mạnh, gối gập sâu, thân nảy nhiều hơn. */
function runInto(out: AvatarPose, phase: number): AvatarPose {
  const s = Math.sin(phase);
  reset(out);
  out.rootY = Math.abs(s) * 0.05 - 0.02;
  out.armLX = -0.9 * s;
  out.armRX = 0.9 * s;
  out.armLZ = 0.12;
  out.armRZ = -0.12;
  out.legLX = 0.85 * s;
  out.legRX = -0.85 * s;
  out.kneeLX = 0.3 + 1.0 * Math.max(0, s);
  out.kneeRX = 0.3 + 1.0 * Math.max(0, -s);
  return out;
}

/** Trên không: co chân, tay dang nhẹ. */
function jumpInto(out: AvatarPose): AvatarPose {
  reset(out);
  out.armLX = -0.35;
  out.armRX = -0.35;
  out.armLZ = 0.45;
  out.armRZ = -0.45;
  out.legLX = -0.55;
  out.legRX = -0.15;
  out.kneeLX = 0.95;
  out.kneeRX = 0.55;
  return out;
}

/** Ngồi: hông gập 90 độ (đùi ra trước), gối gập 90 độ (cẳng chân thẳng xuống), hạ gốc tới mặt đệm. */
function sitInto(out: AvatarPose, t: number): AvatarPose {
  reset(out);
  out.rootY = SEATED_HIP - HIP_HEIGHT + Math.sin(t * 2) * 0.002;
  out.headRotZ = 0.02 * Math.sin(t * 0.7);
  out.armLX = -0.55;
  out.armRX = -0.55;
  out.armLZ = 0.06;
  out.armRZ = -0.06;
  out.legLX = -Math.PI / 2;
  out.legRX = -Math.PI / 2;
  out.kneeLX = Math.PI / 2;
  out.kneeRX = Math.PI / 2;
  return out;
}

/**
 * Tính tư thế theo thời gian t (giây, từ clock của three.js).
 * Các hoạt ảnh thường là hàm thuần trả đối tượng mới. Riêng 'locomotion' đọc playerLocomotion
 * và trả về bộ đệm dùng chung (chỉ đọc, không giữ lại qua khung hình).
 */
export function computePose(animation: AvatarAnimation, t: number): AvatarPose {
  switch (animation) {
    case 'walk':
      return walkInto({ ...REST_POSE }, t * 6);
    case 'run':
      return runInto({ ...REST_POSE }, t * 10);
    case 'jump':
      return jumpInto({ ...REST_POSE });
    case 'sit':
      return sitInto({ ...REST_POSE }, t);
    case 'locomotion':
      return locomotionPose(t);
    case 'wave': {
      // Giơ tay phải lên và vẫy nhẹ, tay trái thả xuôi.
      return {
        ...REST_POSE,
        rootY: Math.sin(t * 2) * 0.003,
        headRotZ: 0.05 * Math.sin(t * 1.2),
        armRZ: -2.7 + 0.25 * Math.sin(t * 8),
      };
    }
    case 'dance': {
      // Nảy người theo nhịp, hai tay đưa ra ngoài và đổi nhịp.
      const beat = Math.sin(t * 4);
      return {
        ...REST_POSE,
        rootY: Math.abs(beat) * 0.06,
        rootRotY: 0.3 * Math.sin(t * 2),
        headRotZ: 0.1 * beat,
        armLZ: 1.2 + 0.4 * beat,
        armRZ: -1.2 - 0.4 * beat,
        legLX: 0.1 * beat,
        legRX: -0.1 * beat,
      };
    }
    case 'idle':
    default:
      return idleInto({ ...REST_POSE }, t);
  }
}

/** Dựng bộ đệm tư thế dùng lại cho sampleEmotePose (gọi một lần cho mỗi avatar, không gọi trong useFrame). */
export function createPoseScratch(): AvatarPose {
  return { ...REST_POSE };
}

// ---------------------------------------------------------------------------------------------------------------
// Trộn chuyển động của nhân vật người chơi.

/**
 * Trạng thái trộn hoạt ảnh di chuyển. Module điều khiển (scene/controls) gọi stepLocomotion mỗi khung,
 * avatar có animation='locomotion' đọc qua computePose. Trọng số đã làm mượt nên đổi trạng thái không giật.
 */
export interface LocomotionState {
  /** Pha bước chân (rad), tăng theo quãng đường đi được nên nhịp chân khớp tốc độ. */
  phase: number;
  /** 0 = đứng, 1 = đang di chuyển. */
  move: number;
  /** 0 = đi bộ, 1 = chạy (trong phần di chuyển). */
  run: number;
  /** 0 = chạm đất, 1 = trên không. */
  air: number;
  /** 0 = đứng, 1 = ngồi hẳn. */
  sit: number;
  /** Góc quay đầu (rad) đã làm mượt, đầu nhìn theo camera. Bên điều khiển ghi qua stepHeadLook. */
  headYaw: number;
  /** 0..1: mức xoay tại chỗ (đứng yên mà thân đang quay). */
  turn: number;
  /** Pha bước nhỏ khi xoay tại chỗ (rad), tăng theo góc đã quay. */
  turnPhase: number;
  /** Trạng thái FSM locomotion (idle, walk, run, ...) khung trước; avatar chọn clip bake theo đây. */
  fsm: string;
  /** Tốc độ ngang (m/s) khung trước, để chỉnh tốc độ phát clip. */
  speed: number;
}

export const playerLocomotion: LocomotionState = {
  phase: 0, move: 0, run: 0, air: 0, sit: 0, headYaw: 0, turn: 0, turnPhase: 0, fsm: 'idle', speed: 0,
};

/** Giới hạn quay đầu so với thân (rad), khoảng ±70 độ. */
export const HEAD_YAW_LIMIT = (70 * Math.PI) / 180;
/** Phần góc nhìn do cổ đảm nhận, phần còn lại do đầu. */
const NECK_SHARE = 0.4;
/** Tốc độ làm mượt góc quay đầu (1/s). */
const HEAD_RATE = 9;
/** Tốc độ quay thân (rad/s) từ đó coi là xoay tại chỗ hết mức. */
const TURN_FULL = 2.5;
/** Pha bước (rad) cho mỗi rad thân quay: quay 90 độ khoảng hai bước nhỏ. */
const TURN_STRIDE = 4;

function wrapPi(a: number): number {
  const t = Math.PI * 2;
  let r = a % t;
  if (r > Math.PI) r -= t;
  else if (r < -Math.PI) r += t;
  return r;
}

/**
 * Góc đầu cần quay để nhìn theo hướng camera: hiệu (camera - thân) gói về [-π, π], kẹp ±HEAD_YAW_LIMIT.
 * Quy ước yaw của playerPose: dương quay sang trái nhân vật, khớp headRotY. Hàm thuần.
 */
export function headYawGoal(cameraYaw: number, bodyYaw: number, limit: number = HEAD_YAW_LIMIT): number {
  const d = wrapPi(cameraYaw - bodyYaw);
  return d > limit ? limit : d < -limit ? -limit : d;
}

/**
 * Cập nhật quay đầu và xoay tại chỗ. turnSpeed: tốc độ quay thân (rad/s, có dấu), speed: tốc độ đi (m/s).
 * lookActive false (ngồi, góc nhìn thứ nhất, emote) thì đầu về giữa. Không cấp phát.
 */
export function stepHeadLook(
  s: LocomotionState,
  cameraYaw: number,
  bodyYaw: number,
  turnSpeed: number,
  speed: number,
  lookActive: boolean,
  dt: number,
): void {
  const d = Math.min(Math.max(dt, 0), 0.1);
  // Đang đi thì biên hẹp dần (70 xuống 42 độ) để chạy ngang không ngoái đầu quá mức.
  const goal = lookActive ? headYawGoal(cameraYaw, bodyYaw, HEAD_YAW_LIMIT * (1 - 0.4 * s.move)) : 0;
  s.headYaw = approach(s.headYaw, goal, HEAD_RATE, d);
  const still = speed < 0.4 && s.sit < 0.5 && s.air < 0.5;
  const turnGoal = still ? clamp01(Math.abs(turnSpeed) / TURN_FULL) : 0;
  s.turn = approach(s.turn, turnGoal, turnGoal > s.turn ? 14 : 8, d);
  if (still) s.turnPhase = (s.turnPhase + Math.abs(turnSpeed) * TURN_STRIDE * d) % (Math.PI * 2000);
}

/** Pha bước (rad) mỗi mét: 4 m/s cho nhịp 6 rad/s như hoạt ảnh walk cũ. Chạy sải dài hơn nên ít rad/m hơn. */
const WALK_STRIDE = 1.5;
const RUN_STRIDE = 1.3;
/** Tốc độ (m/s) bắt đầu và kết thúc chuyển từ đi sang chạy. */
const RUN_FROM = 4.3;
const RUN_TO = 6.6;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function approach(cur: number, goal: number, rate: number, dt: number): number {
  return cur + (goal - cur) * (1 - Math.exp(-rate * dt));
}

/**
 * Cập nhật trọng số trộn. speed: tốc độ ngang thực tế (m/s). Không cấp phát.
 */
export function stepLocomotion(
  s: LocomotionState,
  speed: number,
  grounded: boolean,
  sitting: boolean,
  dt: number,
): void {
  const d = Math.min(Math.max(dt, 0), 0.1);
  const runGoal = clamp01((speed - RUN_FROM) / (RUN_TO - RUN_FROM));
  s.run = approach(s.run, runGoal, 8, d);
  const stride = WALK_STRIDE + (RUN_STRIDE - WALK_STRIDE) * s.run;
  if (grounded) s.phase = (s.phase + speed * stride * d) % (Math.PI * 2000);
  s.move = approach(s.move, sitting ? 0 : clamp01(speed / 1.2), 10, d);
  s.air = approach(s.air, grounded || sitting ? 0 : 1, grounded ? 14 : 9, d);
  s.sit = approach(s.sit, sitting ? 1 : 0, 6, d);
}

const LOCO = {
  out: { ...REST_POSE },
  a: { ...REST_POSE },
  b: { ...REST_POSE },
};

function locomotionPose(t: number): AvatarPose {
  const s = playerLocomotion;
  const out = idleInto(LOCO.out, t);
  if (s.move > 1e-3) {
    // Dáng bước: trộn đi và chạy cùng pha, rồi trộn với đứng theo mức di chuyển (chạy chậm thì sải ngắn).
    walkInto(LOCO.a, s.phase);
    if (s.run > 1e-3) mixInto(LOCO.a, LOCO.a, runInto(LOCO.b, s.phase), s.run);
    mixInto(out, out, LOCO.a, s.move);
  }
  if (s.turn > 1e-3) {
    // Xoay tại chỗ: nhấc chân nhỏ luân phiên theo góc đã quay, để thân không trượt trên sàn.
    const ph = Math.sin(s.turnPhase);
    const lift = 0.22 * s.turn;
    out.legLX += -lift * Math.max(0, ph);
    out.kneeLX += 2 * lift * Math.max(0, ph);
    out.legRX += -lift * Math.max(0, -ph);
    out.kneeRX += 2 * lift * Math.max(0, -ph);
    out.armLX += 0.08 * s.turn * ph;
    out.armRX -= 0.08 * s.turn * ph;
  }
  if (s.air > 1e-3) mixInto(out, out, jumpInto(LOCO.b), s.air);
  if (s.sit > 1e-3) mixInto(out, out, sitInto(LOCO.b, t), s.sit);
  // Cổ 40 %, đầu 60 % góc nhìn.
  out.neckRotY = s.headYaw * NECK_SHARE;
  out.headRotY = s.headYaw * (1 - NECK_SHARE);
  return out;
}
