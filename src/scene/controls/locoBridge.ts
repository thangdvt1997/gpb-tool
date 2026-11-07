/**
 * Cầu nối giữa điều khiển (motion, ghế, emote) và state machine locomotion (TASK 02). Hàm thuần, không React/three.
 * Mỗi khung useGtaPlayer đổ input vào FSM qua fillLocoInput, rồi lấy đầu vào trộn hoạt ảnh procedural qua
 * locoBlendInputs (stepLocomotion). Hoạt ảnh vẫn là tư thế procedural đã có, chỉ nguồn quyết định
 * "trên không hay chạm đất" chuyển sang FSM. Ngồi vẫn theo ghế thật (FSM sitDown có minTime nên không dùng để quyết).
 */
import { resolveClip, type ResolvedClip } from '../motion/clipMap';
import type { LocoInput, LocoState } from '../motion/locomotionFsm';

/** Phần trạng thái của một khung mà FSM cần. Tất cả lấy từ MotionState, session ghế và emote. */
export interface LocoFrameFacts {
  speed: number;
  vy: number;
  grounded: boolean;
  jumped: boolean;
  /** Người chơi đang bấm phím/joystick hoặc tự đi. */
  moveIntent: boolean;
  run: boolean;
  /** Đang ngồi ở ghế (phiên điều khiển). */
  seated: boolean;
  /** Emote đang phát (phase khác idle): id, hoặc null nếu không. */
  emoteId: string | null;
  /** Bị khóa/choáng từ ngoài (isLocked của useGtaPlayer: nằm đỡ trong duel; hoặc locoPulses.requestStun). */
  stunned?: boolean;
  /** Vừa dùng vật (xung từ bus sự kiện tương tác, xem locoPulses). */
  interactActive?: boolean;
}

/** Ghi input FSM từ dữ kiện khung. Không cấp phát. */
export function fillLocoInput(out: LocoInput, f: LocoFrameFacts, fsmState: LocoState): LocoInput {
  out.speed = f.speed;
  out.moveIntent = f.moveIntent;
  out.run = f.run;
  out.grounded = f.grounded;
  out.vy = f.vy;
  out.jumped = f.jumped;
  out.sitRequested = f.seated;
  out.standRequested = !f.seated;
  // Dùng vật chỉ tính khi đang chạm đất và không nhảy: nhảy luôn thắng để tư thế trên không không bị trễ.
  const useNow = f.interactActive === true && f.grounded && !f.jumped;
  out.interactRequested = useNow;
  out.interactDone = !useNow;
  out.emoteRequested = f.emoteId;
  // Đang ở trạng thái emote mà emote đã hết thì báo xong.
  out.emoteDone = f.emoteId === null && fsmState === 'emote';
  out.stunned = f.stunned === true;
  return out;
}

/** Đầu vào cho stepLocomotion (trộn hoạt ảnh procedural). */
export interface LocoBlendInputs {
  grounded: boolean;
  sitting: boolean;
}

/**
 * Trạng thái FSM -> (chạm đất, ngồi) cho trộn hoạt ảnh.
 * Trên không = jumpStart hoặc airborne; ngồi theo ghế thật (seated) để đứng dậy không bị trễ minTime của FSM.
 */
export function locoBlendInputs(state: LocoState, seated: boolean, out: LocoBlendInputs, actuallyGrounded = true): LocoBlendInputs {
  // actuallyGrounded: dữ kiện thật từ chuyển động, để interact/stunned (không cho chuyển sang nhảy ngay) không che tư thế trên không.
  out.grounded = state !== 'jumpStart' && state !== 'airborne' && !((state === 'interact' || state === 'stunned') && !actuallyGrounded);
  out.sitting = seated;
  return out;
}

const NO_CLIPS: ReadonlySet<string> = new Set<string>();

/** Hoạt ảnh/clip sẽ dùng cho trạng thái FSM. Chưa có clip rig thật nên luôn ra tư thế procedural (hoặc 'none' cho emote). */
export function clipForState(state: LocoState, available: ReadonlySet<string> = NO_CLIPS): ResolvedClip {
  return resolveClip(state, available);
}

/**
 * Nội suy tư thế vẽ giữa hai bước mô phỏng (camera đọc kết quả này thay vì vị trí bước).
 * Dịch chuyển lớn (> snapDist) hoặc snap = true thì nhảy thẳng. Ghi vào out, trả out.
 */
export function blendRenderPose(
  out: { x: number; y: number; z: number },
  prev: { x: number; y: number; z: number },
  cur: { x: number; y: number; z: number },
  alpha: number,
  snap = false,
  snapDist = 1,
): { x: number; y: number; z: number } {
  const a = snap || Math.hypot(cur.x - prev.x, cur.z - prev.z) > snapDist ? 1 : alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  out.x = prev.x + (cur.x - prev.x) * a;
  out.y = prev.y + (cur.y - prev.y) * a;
  out.z = prev.z + (cur.z - prev.z) * a;
  return out;
}
