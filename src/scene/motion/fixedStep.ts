/**
 * Bộ tích lũy bước thời gian cố định (hàm thuần, không React).
 * - Mô phỏng luôn chạy với bước h = 1/hz, bất kể FPS hiển thị, nên cùng đầu vào cho cùng kết quả.
 * - Giới hạn số bước mỗi khung (chống "spiral of death": khung chậm -> nhiều bước -> khung chậm hơn).
 * - Kẹp dt lớn (tab treo), tạm dừng khi tab ẩn: không dồn thời gian.
 * - alpha = phần dư / h, dùng nội suy giữa trạng thái trước và sau bước cuối khi vẽ.
 */

export interface FixedStepConfig {
  /** Tần số mô phỏng (Hz). Mặc định 60. */
  hz: number;
  /** Số bước tối đa mỗi khung. Vượt thì bỏ phần thời gian dư (mô phỏng chậm lại thay vì treo). */
  maxStepsPerFrame: number;
  /** dt tối đa của một khung (giây). dt lớn hơn bị kẹp. */
  maxFrameDt: number;
}

export const DEFAULT_FIXED_STEP: FixedStepConfig = { hz: 60, maxStepsPerFrame: 5, maxFrameDt: 0.1 };

export interface FixedStepper {
  readonly cfg: FixedStepConfig;
  /** Bước cố định (giây) = 1/hz. */
  readonly h: number;
  /** Thời gian tích lũy chưa tiêu (giây), luôn trong [0, h) sau mỗi advance. */
  acc: number;
  /** Nội suy hiển thị 0..1 sau advance gần nhất. */
  alpha: number;
  /** Tổng số bước đã chạy (để debug và test). */
  totalSteps: number;
  /** Tổng thời gian bị bỏ do kẹp dt hoặc vượt maxStepsPerFrame (giây). */
  droppedTime: number;
  paused: boolean;
}

/** Sai số khi so acc với h, tránh lệch một bước do làm tròn số thực (ví dụ 144 khung = 1 giây). */
const EPS = 1e-9;

export function createFixedStepper(cfg: Partial<FixedStepConfig> = {}): FixedStepper {
  const c: FixedStepConfig = { ...DEFAULT_FIXED_STEP, ...cfg };
  if (!(c.hz > 0) || !(c.maxStepsPerFrame >= 1) || !(c.maxFrameDt > 0)) {
    throw new RangeError('FixedStepConfig không hợp lệ: hz > 0, maxStepsPerFrame >= 1, maxFrameDt > 0');
  }
  return { cfg: c, h: 1 / c.hz, acc: 0, alpha: 0, totalSteps: 0, droppedTime: 0, paused: false };
}

/**
 * Tiêu `dt` giây thực, gọi `step(h)` cho mỗi bước cố định. Trả số bước đã chạy.
 * dt NaN, âm hoặc đang tạm dừng: 0 bước, alpha giữ nguyên.
 */
export function advanceFixedStep(s: FixedStepper, dt: number, step: (h: number) => void): number {
  if (s.paused || !(dt > 0) || !Number.isFinite(dt)) return 0;
  let d = dt;
  if (d > s.cfg.maxFrameDt) {
    s.droppedTime += d - s.cfg.maxFrameDt;
    d = s.cfg.maxFrameDt;
  }
  s.acc += d;
  let n = 0;
  while (s.acc >= s.h - EPS && n < s.cfg.maxStepsPerFrame) {
    step(s.h);
    s.acc -= s.h;
    n++;
  }
  if (s.acc < 0) s.acc = 0;
  if (s.acc >= s.h - EPS) {
    // Còn nợ sau khi chạm trần số bước: bỏ cả bước nguyên, giữ phần lẻ để alpha vẫn đúng.
    const keep = s.acc % s.h;
    s.droppedTime += s.acc - keep;
    s.acc = keep;
  }
  s.totalSteps += n;
  s.alpha = Math.min(1, Math.max(0, s.acc / s.h));
  return n;
}

/** Tạm dừng (tab ẩn, mất focus, menu tạm dừng). Xóa thời gian dồn. */
export function pauseFixedStep(s: FixedStepper): void {
  s.paused = true;
  s.acc = 0;
}

/** Tiếp tục: không cộng dồn thời gian đã trôi khi dừng. */
export function resumeFixedStep(s: FixedStepper): void {
  s.paused = false;
  s.acc = 0;
}

export function resetFixedStep(s: FixedStepper): void {
  s.acc = 0;
  s.alpha = 0;
  s.totalSteps = 0;
  s.droppedTime = 0;
  s.paused = false;
}

/** Tư thế dùng cho nội suy hiển thị. */
export interface MotionPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export function createPose(): MotionPose {
  return { x: 0, y: 0, z: 0, yaw: 0 };
}

export function copyPose(to: MotionPose, from: MotionPose): MotionPose {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  to.yaw = from.yaw;
  return to;
}

/** Nội suy góc theo cung ngắn nhất (qua ±π không quay vòng dài). */
export function lerpAngle(a: number, b: number, t: number): number {
  const TWO_PI = Math.PI * 2;
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  else if (d < -Math.PI) d += TWO_PI;
  return a + d * t;
}

/** out = prev + (cur - prev) * alpha. Ghi vào out, không cấp phát. */
export function lerpPose(out: MotionPose, prev: MotionPose, cur: MotionPose, alpha: number): MotionPose {
  out.x = prev.x + (cur.x - prev.x) * alpha;
  out.y = prev.y + (cur.y - prev.y) * alpha;
  out.z = prev.z + (cur.z - prev.z) * alpha;
  out.yaw = lerpAngle(prev.yaw, cur.yaw, alpha);
  return out;
}

/**
 * Bộ chạy không phụ thuộc React: giữ tư thế trước/sau bước cuối và tư thế hiển thị đã nội suy.
 * `read` đọc tư thế hiện tại từ mô phỏng (ví dụ MotionState) sau mỗi bước.
 */
export class FixedStepRunner {
  readonly stepper: FixedStepper;
  readonly prev: MotionPose = createPose();
  readonly cur: MotionPose = createPose();
  /** Tư thế để vẽ (đã nội suy). */
  readonly render: MotionPose = createPose();
  /** Quãng dịch giữa hai bước liên tiếp vượt ngưỡng này (m) coi là dịch chuyển tức thời: không nội suy. */
  teleportDistance = 2;
  private readonly read: (out: MotionPose) => void;

  constructor(read: (out: MotionPose) => void, cfg: Partial<FixedStepConfig> = {}) {
    this.stepper = createFixedStepper(cfg);
    this.read = read;
    this.snap();
  }

  /** Đặt prev = cur = render = trạng thái mô phỏng hiện tại (sau dịch chuyển, hồi sinh, đổi cảnh). */
  snap(): void {
    this.read(this.cur);
    copyPose(this.prev, this.cur);
    copyPose(this.render, this.cur);
    this.stepper.acc = 0;
    this.stepper.alpha = 0;
  }

  /** Chạy các bước cần thiết cho dt giây thực rồi cập nhật `render`. Trả số bước. */
  advance(dt: number, step: (h: number) => void): number {
    const n = advanceFixedStep(this.stepper, dt, (h) => {
      copyPose(this.prev, this.cur);
      step(h);
      this.read(this.cur);
      const jump = Math.hypot(this.cur.x - this.prev.x, this.cur.z - this.prev.z);
      if (jump > this.teleportDistance) copyPose(this.prev, this.cur);
    });
    lerpPose(this.render, this.prev, this.cur, this.stepper.alpha);
    return n;
  }
}
