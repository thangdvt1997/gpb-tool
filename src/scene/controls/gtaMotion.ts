import type { Rect } from '../layout';

/**
 * Chuyển động kiểu GTA, hàm thuần (không React, không three). Quy ước hướng:
 * hướng nhìn = (sin yaw, cos yaw) trên mặt phẳng (x, z), khớp với Player.tsx (rotation.y = yaw).
 * Bên phải theo hướng yaw = (-cos yaw, sin yaw).
 * Đầu vào là hướng đi trong hệ thế giới (đã quy theo camera ở useGtaPlayer). Nhân vật có vận tốc,
 * tăng tốc và giảm tốc dần, tự quay mặt mượt theo hướng đi. Mọi bước nhân dt nên độc lập với FPS.
 */

export const MOTION = {
  walkSpeed: 4,
  runSpeed: 7,
  /** Gia tốc khi tăng tốc và khi phanh (m/s²). Phanh mạnh hơn để dừng gọn trước bàn, cửa. */
  accel: 16,
  decel: 22,
  /** Tỉ lệ điều khiển trên không so với dưới đất. */
  airControl: 0.35,
  /** Tốc độ quay mặt theo hướng đi (1/s, làm mượt mũ). */
  faceRate: 11,
  /** Tốc độ xoay tối đa (rad/s) khi quay mặt. */
  turnRate: 9,
  /** Xoay tại chỗ (đứng yên, thân theo camera): làm mượt (1/s) và tốc độ tối đa (rad/s). */
  turnInPlaceRate: 8,
  turnInPlaceMax: 6,
  jumpVelocity: 4.6,
  gravity: 14,
  /** Giới hạn dt để không nhảy vọt khi tab bị treo. */
  maxDt: 0.05,
  /** Bước tối đa mỗi lần kiểm va chạm (m), nhỏ hơn bề dày tường kính + bán kính. */
  maxSubStep: 0.12,
} as const;

export interface MotionState {
  /** Vị trí (m). Đối tượng này được ghi trực tiếp, không bị thay thế. */
  pos: { x: number; y: number; z: number };
  yaw: number;
  /** Vận tốc ngang (m/s). */
  vx: number;
  vz: number;
  vy: number;
  grounded: boolean;
  /** Kết quả khung hình vừa rồi. */
  moved: boolean;
  running: boolean;
  jumped: boolean;
  /** Tốc độ ngang thực tế (m/s), sau va chạm. Dùng cho nhịp hoạt ảnh. */
  speed: number;
  /** Tốc độ quay thân (rad/s, có dấu) của bước vừa rồi. Dùng cho hoạt ảnh xoay tại chỗ. */
  turnSpeed: number;
}

export interface MotionInput {
  /** Hướng đi trong hệ thế giới. Độ dài 0..1 (joystick nhẹ thì đi chậm). */
  dirX: number;
  dirZ: number;
  run: boolean;
  jump: boolean;
  /** Có giá trị thì quay mặt về hướng này (góc nhìn thứ nhất: theo camera). null: quay theo hướng đi. */
  faceYaw: number | null;
  /**
   * Có giá trị và đứng yên (không đẩy cần) thì thân quay mượt về hướng này, tại chỗ (giữ chuột phải kéo:
   * thân theo camera). Đang đi thì vẫn quay theo hướng đi. null: đứng yên giữ hướng.
   */
  turnYaw: number | null;
}

export function createMotionState(
  pos: { x: number; y: number; z: number },
  yaw: number = 0,
): MotionState {
  return {
    pos,
    yaw,
    vx: 0,
    vz: 0,
    vy: 0,
    grounded: true,
    moved: false,
    running: false,
    jumped: false,
    speed: 0,
    turnSpeed: 0,
  };
}

export function createMotionInput(): MotionInput {
  return { dirX: 0, dirZ: 0, run: false, jump: false, faceYaw: null, turnYaw: null };
}

const TWO_PI = Math.PI * 2;

export function wrapAngle(a: number): number {
  let r = a % TWO_PI;
  if (r > Math.PI) r -= TWO_PI;
  else if (r < -Math.PI) r += TWO_PI;
  return r;
}

function hits(x: number, z: number, r: number, rects: readonly Rect[]): boolean {
  for (let i = 0; i < rects.length; i++) {
    const c = rects[i]!;
    if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
  }
  return false;
}

/** Đẩy điểm ra khỏi vùng va chạm theo hướng gần nhất, ghi vào pos. Không cấp phát. */
function pushOut(pos: { x: number; z: number }, r: number, rects: readonly Rect[]): void {
  for (let iter = 0; iter < 4; iter++) {
    let rc: Rect | null = null;
    for (let i = 0; i < rects.length; i++) {
      const c = rects[i]!;
      if (pos.x > c.minX - r && pos.x < c.maxX + r && pos.z > c.minZ - r && pos.z < c.maxZ + r) {
        rc = c;
        break;
      }
    }
    if (rc === null) return;
    const dLeft = pos.x - (rc.minX - r);
    const dRight = rc.maxX + r - pos.x;
    const dDown = pos.z - (rc.minZ - r);
    const dUp = rc.maxZ + r - pos.z;
    const m = Math.min(dLeft, dRight, dDown, dUp);
    if (m === dLeft) pos.x = rc.minX - r;
    else if (m === dRight) pos.x = rc.maxX + r;
    else if (m === dDown) pos.z = rc.minZ - r;
    else pos.z = rc.maxZ + r;
  }
}

/** Quay `from` về `to` mượt (mũ) nhưng không quá maxStep. */
function turnToward(from: number, to: number, k: number, maxStep: number): number {
  const diff = wrapAngle(to - from);
  const step = Math.max(-maxStep, Math.min(maxStep, diff * k));
  return wrapAngle(from + step);
}

/**
 * Cập nhật một khung hình. Ghi thẳng vào `s` (và `s.pos`), trả về chính `s`. Không tạo đối tượng mới.
 * - `bounds`: hộp đi lại trong lòng tường ngoài (chưa trừ bán kính, hàm tự trừ).
 * - Đi theo từng trục và chia bước nhỏ nên trượt dọc vật thể, không xuyên tường kể cả khi chạy.
 *   Trục bị chặn thì vận tốc trục đó về 0, nên không "dồn lực" vào tường.
 */
export function stepMotion(
  s: MotionState,
  input: MotionInput,
  dt: number,
  radius: number,
  obstacles: readonly Rect[],
  bounds?: Rect,
): MotionState {
  const d = Math.min(Math.max(dt, 0), MOTION.maxDt);
  const pos = s.pos;

  // Phòng khi xuất hiện sát hoặc trong vật thể.
  pushOut(pos, radius, obstacles);

  let mag = Math.hypot(input.dirX, input.dirZ);
  let ux = 0;
  let uz = 0;
  if (mag > 1e-3) {
    ux = input.dirX / mag;
    uz = input.dirZ / mag;
    mag = Math.min(1, mag);
  } else {
    mag = 0;
  }
  // Chạy khi giữ Shift và đang đẩy cần (phím hoặc joystick quá nửa).
  const wantRun = input.run && mag > 0.5;
  const targetSpeed = mag * (wantRun ? MOTION.runSpeed : MOTION.walkSpeed);
  const tvx = ux * targetSpeed;
  const tvz = uz * targetSpeed;

  // Tiến vận tốc về vận tốc đích, giới hạn theo gia tốc (tăng tốc hoặc phanh).
  const curSpeed = Math.hypot(s.vx, s.vz);
  const control = s.grounded ? 1 : MOTION.airControl;
  const rate = (targetSpeed >= curSpeed ? MOTION.accel : MOTION.decel) * control;
  const dvx = tvx - s.vx;
  const dvz = tvz - s.vz;
  const dvLen = Math.hypot(dvx, dvz);
  const maxDv = rate * d;
  if (dvLen <= maxDv || dvLen < 1e-6) {
    s.vx = tvx;
    s.vz = tvz;
  } else {
    s.vx += (dvx / dvLen) * maxDv;
    s.vz += (dvz / dvLen) * maxDv;
  }

  const x0 = pos.x;
  const z0 = pos.z;
  const distX = s.vx * d;
  const distZ = s.vz * d;
  const dist = Math.hypot(distX, distZ);
  if (dist > 1e-6) {
    const n = Math.max(1, Math.ceil(dist / MOTION.maxSubStep));
    const sx = distX / n;
    const sz = distZ / n;
    const minX = bounds ? bounds.minX + radius : -Infinity;
    const maxX = bounds ? bounds.maxX - radius : Infinity;
    const minZ = bounds ? bounds.minZ + radius : -Infinity;
    const maxZ = bounds ? bounds.maxZ - radius : Infinity;
    let blockX = false;
    let blockZ = false;
    for (let i = 0; i < n; i++) {
      if (!blockX) {
        const nx = Math.min(maxX, Math.max(minX, pos.x + sx));
        if (nx !== pos.x + sx || hits(nx, pos.z, radius, obstacles)) blockX = true;
        if (!hits(nx, pos.z, radius, obstacles)) pos.x = nx;
      }
      if (!blockZ) {
        const nz = Math.min(maxZ, Math.max(minZ, pos.z + sz));
        if (nz !== pos.z + sz || hits(pos.x, nz, radius, obstacles)) blockZ = true;
        if (!hits(pos.x, nz, radius, obstacles)) pos.z = nz;
      }
    }
    if (blockX) s.vx = 0;
    if (blockZ) s.vz = 0;
  }
  const mx = pos.x - x0;
  const mz = pos.z - z0;
  const movedDist = Math.hypot(mx, mz);
  s.moved = movedDist > 1e-5;
  s.speed = d > 0 ? movedDist / d : 0;

  // Quay mặt: theo camera (góc nhìn thứ nhất) hoặc theo hướng đang đẩy cần.
  const k = 1 - Math.exp(-MOTION.faceRate * d);
  const maxTurn = MOTION.turnRate * d;
  const yaw0 = s.yaw;
  if (input.faceYaw !== null) {
    s.yaw = wrapAngle(input.faceYaw);
  } else if (mag > 0) {
    s.yaw = turnToward(s.yaw, Math.atan2(ux, uz), k, maxTurn);
  } else if (input.turnYaw !== null) {
    const kt = 1 - Math.exp(-MOTION.turnInPlaceRate * d);
    s.yaw = turnToward(s.yaw, input.turnYaw, kt, MOTION.turnInPlaceMax * d);
  }
  s.turnSpeed = d > 0 ? wrapAngle(s.yaw - yaw0) / d : 0;

  // Nhảy theo trục đứng, độc lập với va chạm phẳng (obstacles là hình chữ nhật 2D, không có chiều cao).
  s.jumped = false;
  if (input.jump && s.grounded) {
    s.vy = MOTION.jumpVelocity;
    s.grounded = false;
    s.jumped = true;
  }
  if (!s.grounded) {
    s.vy -= MOTION.gravity * d;
    pos.y += s.vy * d;
    if (pos.y <= 0) {
      pos.y = 0;
      s.vy = 0;
      s.grounded = true;
    }
  } else {
    pos.y = 0;
  }

  s.running = wantRun && s.speed > MOTION.walkSpeed * 1.05;
  return s;
}

/** Dừng hẳn (ngồi, dịch chuyển): xóa vận tốc. */
export function haltMotion(s: MotionState): void {
  s.vx = 0;
  s.vz = 0;
  s.vy = 0;
  s.grounded = true;
  s.pos.y = 0;
  s.moved = false;
  s.running = false;
  s.jumped = false;
  s.speed = 0;
  s.turnSpeed = 0;
}
