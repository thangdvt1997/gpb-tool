/**
 * Map tay cầm -> hành động. Hàm thuần, không đụng navigator: nhận ảnh chụp trạng thái tay cầm
 * (cùng hình dạng với Gamepad của trình duyệt) nên test được không cần thiết bị thật.
 */

export interface PadState {
  /** Gamepad.mapping: chỉ 'standard' mới có bố cục nút/trục biết trước. */
  mapping: string;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

export interface PadConfig {
  deadzone: number;
  sensitivity: number;
  invertX: boolean;
  invertY: boolean;
}

export interface PadActions {
  /** Cùng quy ước MoveInput: forward +1 tiến, strafe +1 sang phải; độ dài tối đa 1. */
  move: { forward: number; strafe: number };
  /** Tốc độ xoay nhìn đã nhân độ nhạy, đơn vị chuẩn hóa (-độ nhạy..độ nhạy). x phải dương, y xuống dương. */
  look: { x: number; y: number };
  run: boolean;
  jump: boolean;
  interact: boolean;
  cancel: boolean;
  map: boolean;
  firstPerson: boolean;
}

/** Chỉ số nút theo bố cục "standard" của Gamepad API. */
export const PAD_BUTTON = {
  jump: 0, // A
  interact: 2, // X
  firstPerson: 3, // Y
  runTrigger: 7, // RT
  map: 8, // Back/Select
  cancel: 9, // Start/Menu
  runStick: 10, // L3
} as const;

export function emptyActions(): PadActions {
  return { move: { forward: 0, strafe: 0 }, look: { x: 0, y: 0 }, run: false, jump: false, interact: false, cancel: false, map: false, firstPerson: false };
}

/**
 * Vùng chết tròn: dưới ngưỡng thì 0, trên ngưỡng thì co giãn lại để bắt đầu từ 0 (không giật nhảy),
 * độ dài tối đa 1. Giá trị không hữu hạn coi như 0.
 */
export function applyDeadzone(x: number, y: number, deadzone: number): { x: number; y: number } {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  const dz = Math.min(Math.max(deadzone, 0), 0.95);
  const len = Math.hypot(x, y);
  if (len <= dz || len === 0) return { x: 0, y: 0 };
  const scaled = Math.min((len - dz) / (1 - dz), 1);
  return { x: (x / len) * scaled, y: (y / len) * scaled };
}

/** Đường cong analog: lũy thừa 2 giữ dấu, giúp chỉnh nhẹ chính xác hơn gần tâm. */
export function analogCurve(v: number): number {
  return Math.sign(v) * v * v;
}

function pressed(p: PadState, i: number): boolean {
  const b = p.buttons[i];
  return !!b && (b.pressed || b.value > 0.5);
}

/** Trả null nếu bố cục không phải "standard" (không đoán mò nút/trục của tay cầm lạ). */
export function mapGamepad(p: PadState, cfg: PadConfig): PadActions | null {
  if (p.mapping !== 'standard') return null;
  const out = emptyActions();
  const l = applyDeadzone(p.axes[0] ?? 0, p.axes[1] ?? 0, cfg.deadzone);
  // Trục Y của tay cầm: lên là âm. Đảo dấu để forward dương là tiến.
  out.move = { forward: -l.y, strafe: l.x };
  // D-pad (nút 12 lên, 13 xuống, 14 trái, 15 phải) cộng vào, rồi kẹp độ dài 1.
  const dpadF = (pressed(p, 12) ? 1 : 0) - (pressed(p, 13) ? 1 : 0);
  const dpadS = (pressed(p, 15) ? 1 : 0) - (pressed(p, 14) ? 1 : 0);
  if (dpadF !== 0 || dpadS !== 0) {
    const len = Math.hypot(out.move.forward + dpadF, out.move.strafe + dpadS);
    const k = len > 1 ? 1 / len : 1;
    out.move = { forward: (out.move.forward + dpadF) * k, strafe: (out.move.strafe + dpadS) * k };
  }
  const r = applyDeadzone(p.axes[2] ?? 0, p.axes[3] ?? 0, cfg.deadzone);
  const rx = analogCurve(r.x) * cfg.sensitivity;
  const ry = analogCurve(r.y) * cfg.sensitivity;
  out.look = { x: cfg.invertX ? -rx : rx, y: cfg.invertY ? -ry : ry };
  out.jump = pressed(p, PAD_BUTTON.jump);
  out.interact = pressed(p, PAD_BUTTON.interact);
  out.firstPerson = pressed(p, PAD_BUTTON.firstPerson);
  out.map = pressed(p, PAD_BUTTON.map);
  out.cancel = pressed(p, PAD_BUTTON.cancel);
  out.run = pressed(p, PAD_BUTTON.runTrigger) || pressed(p, PAD_BUTTON.runStick);
  return out;
}
