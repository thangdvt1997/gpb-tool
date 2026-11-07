/**
 * Cài đặt điều khiển trung tâm: kiểu, mặc định, kiểm tra, migrate, đảo trục, xung đột phím.
 * Toàn bộ hàm trong tệp này là hàm thuần, không đụng window hay localStorage.
 */

export const SETTINGS_VERSION = 2;
export const STORAGE_KEY_V2 = 'gpb.settings.v2';
/** Khóa cũ, chỉ đọc để migrate (do session.ts và interact/settings.ts ghi). */
export const LEGACY_CONTROLS_KEY = 'gpb.controls.v1';
export const LEGACY_INTERACT_KEY = 'gpb.interact.settings.v1';

export type InputContext = 'gameplay' | 'ui' | 'editor';

export const ACTION_IDS = [
  'moveForward',
  'moveBack',
  'moveLeft',
  'moveRight',
  'run',
  'jump',
  'interact',
  'firstPerson',
  'map',
  'cancel',
  'editor',
] as const;
export type ActionId = (typeof ACTION_IDS)[number];

/** Ngữ cảnh của từng action: xung đột chỉ xét trong cùng ngữ cảnh. */
export const ACTION_CONTEXT: Record<ActionId, InputContext> = {
  moveForward: 'gameplay',
  moveBack: 'gameplay',
  moveLeft: 'gameplay',
  moveRight: 'gameplay',
  run: 'gameplay',
  jump: 'gameplay',
  interact: 'gameplay',
  firstPerson: 'gameplay',
  map: 'gameplay',
  cancel: 'ui',
  editor: 'editor',
};

/** Binding là mã phím vật lý (KeyboardEvent.code), không phụ thuộc bố cục bàn phím. */
export type Bindings = Record<ActionId, string>;

export const DEFAULT_BINDINGS: Bindings = {
  moveForward: 'KeyW',
  moveBack: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  run: 'ShiftLeft',
  jump: 'Space',
  interact: 'KeyE',
  firstPerson: 'KeyV',
  map: 'KeyM',
  cancel: 'Escape',
  editor: 'KeyP',
};

/** Phím trình duyệt/hệ điều hành cần giữ: không cho gán. */
export const RESERVED_CODES: readonly string[] = [
  'F1', 'F3', 'F5', 'F6', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'ContextMenu', 'PrintScreen',
];

export type ControlMode = 'rightMouse' | 'leftMouse';

export interface Settings {
  version: number;
  mouse: { sensitivity: number; invertX: boolean; invertY: boolean };
  bindings: Bindings;
  volume: number;
  hintsEnabled: boolean;
  highlightEnabled: boolean;
  controlMode: ControlMode;
  /** Cảm ứng: cỡ joystick (px), hiện nút phụ, chạm một lần lên sàn để đi tới đó. */
  touch: { joystickSize: number; buttonsEnabled: boolean; tapToWalk: boolean };
  /** Tay cầm: vùng chết (0 đến 0,5) và độ nhạy nhìn (hệ số nhân). Chỉ useGamepadInput đọc. */
  gamepad: { deadzone: number; sensitivity: number };
  /** Hiển thị: giảm chuyển động (gtaCamera tắt rung, nhún, trễ camera; hộp thoại theo prefers-reduced-motion). */
  display: { reducedMotion: boolean };
}

export const RANGES = {
  sensitivity: { min: 0.2, max: 3 },
  volume: { min: 0, max: 1 },
  joystickSize: { min: 80, max: 200 },
  deadzone: { min: 0, max: 0.5 },
  gamepadSensitivity: { min: 0.2, max: 3 },
} as const;

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    mouse: { sensitivity: 1, invertX: false, invertY: false },
    bindings: { ...DEFAULT_BINDINGS },
    volume: 0.5,
    hintsEnabled: true,
    highlightEnabled: true,
    controlMode: 'rightMouse',
    touch: { joystickSize: 120, buttonsEnabled: true, tapToWalk: true },
    gamepad: { deadzone: 0.15, sensitivity: 1 },
    display: { reducedMotion: false },
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function num(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Mã phím hợp lệ: chuỗi chữ số ngắn, không nằm trong danh sách phím giữ riêng. */
export function isValidKeyCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Za-z0-9]{1,20}$/.test(code) && !RESERVED_CODES.includes(code);
}

// ---- Xung đột phím ----

export interface Conflict {
  context: InputContext;
  code: string;
  actions: ActionId[];
}

/** Trả về mọi nhóm hai action trở lên cùng phím trong cùng ngữ cảnh. */
export function findConflicts(b: Bindings): Conflict[] {
  const map = new Map<string, Conflict>();
  for (const id of ACTION_IDS) {
    const key = `${ACTION_CONTEXT[id]}|${b[id]}`;
    const c = map.get(key);
    if (c) c.actions.push(id);
    else map.set(key, { context: ACTION_CONTEXT[id], code: b[id], actions: [id] });
  }
  return [...map.values()].filter((c) => c.actions.length > 1);
}

export type RebindResult =
  | { ok: true; bindings: Bindings }
  | { ok: false; error: 'invalid-key' | 'conflict'; conflictWith?: ActionId };

/** Gán phím mới cho một action. Trùng phím trong cùng ngữ cảnh thì báo lỗi, không tự đổi chỗ. */
export function rebind(b: Bindings, action: ActionId, code: string): RebindResult {
  if (!isValidKeyCode(code)) return { ok: false, error: 'invalid-key' };
  const other = ACTION_IDS.find((id) => id !== action && ACTION_CONTEXT[id] === ACTION_CONTEXT[action] && b[id] === code);
  if (other) return { ok: false, error: 'conflict', conflictWith: other };
  return { ok: true, bindings: { ...b, [action]: code } };
}

/** Hoán đổi phím của hai action (dùng khi người dùng chọn "hoán đổi" sau báo trùng). */
export function swapBindings(b: Bindings, a: ActionId, c: ActionId): Bindings {
  return { ...b, [a]: b[c], [c]: b[a] };
}

// ---- Đảo trục ----

/** Áp độ nhạy và đảo trục lên mouse delta (đã chuẩn hóa theo thiết bị ở nơi gọi, không nhân theo FPS). */
export function applyMouseDelta(dx: number, dy: number, m: Settings['mouse']): { dx: number; dy: number } {
  return { dx: (m.invertX ? -dx : dx) * m.sensitivity, dy: (m.invertY ? -dy : dy) * m.sensitivity };
}

// ---- Kiểm tra giá trị ----

/** Kiểm tra và kẹp một đối tượng bất kỳ về Settings hợp lệ. Giá trị sai kiểu dùng mặc định. */
export function sanitize(input: unknown): Settings {
  const d = defaultSettings();
  const o = rec(input);
  const mouse = rec(o.mouse);
  const touch = rec(o.touch);
  const gp = rec(o.gamepad);
  const disp = rec(o.display);
  const rawB = rec(o.bindings);
  const bindings = { ...d.bindings };
  for (const id of ACTION_IDS) {
    if (isValidKeyCode(rawB[id])) bindings[id] = rawB[id] as string;
  }
  // Nếu sau khi nhận có trùng phím thì trả toàn bộ phím về mặc định (mặc định không trùng).
  const safeBindings = findConflicts(bindings).length > 0 ? { ...DEFAULT_BINDINGS } : bindings;
  return {
    version: SETTINGS_VERSION,
    mouse: {
      sensitivity: num(mouse.sensitivity, RANGES.sensitivity.min, RANGES.sensitivity.max, d.mouse.sensitivity),
      invertX: bool(mouse.invertX, d.mouse.invertX),
      invertY: bool(mouse.invertY, d.mouse.invertY),
    },
    bindings: safeBindings,
    volume: num(o.volume, RANGES.volume.min, RANGES.volume.max, d.volume),
    hintsEnabled: bool(o.hintsEnabled, d.hintsEnabled),
    highlightEnabled: bool(o.highlightEnabled, d.highlightEnabled),
    controlMode: o.controlMode === 'leftMouse' || o.controlMode === 'rightMouse' ? o.controlMode : d.controlMode,
    touch: {
      joystickSize: num(touch.joystickSize, RANGES.joystickSize.min, RANGES.joystickSize.max, d.touch.joystickSize),
      buttonsEnabled: bool(touch.buttonsEnabled, d.touch.buttonsEnabled),
      tapToWalk: bool(touch.tapToWalk, d.touch.tapToWalk),
    },
    gamepad: {
      deadzone: num(gp.deadzone, RANGES.deadzone.min, RANGES.deadzone.max, d.gamepad.deadzone),
      sensitivity: num(gp.sensitivity, RANGES.gamepadSensitivity.min, RANGES.gamepadSensitivity.max, d.gamepad.sensitivity),
    },
    display: { reducedMotion: bool(disp.reducedMotion, d.display.reducedMotion) },
  };
}

// ---- Migrate ----

/**
 * Gộp cài đặt cũ (gpb.controls.v1 và gpb.interact.settings.v1) thành Settings v2.
 * Nhận đối tượng đã parse, thiếu thì dùng mặc định. helpHidden=true tắt gợi ý.
 */
export function migrateLegacy(controlsV1: unknown, interactV1: unknown): Settings {
  const c = rec(controlsV1);
  const i = rec(interactV1);
  const hintsFromControls = typeof c.helpHidden === 'boolean' ? !c.helpHidden : true;
  const hints = typeof i.keyHints === 'boolean' ? i.keyHints && hintsFromControls : hintsFromControls;
  return sanitize({
    mouse: { sensitivity: c.sensitivity },
    volume: c.volume,
    hintsEnabled: hints,
    highlightEnabled: i.highlight,
  });
}

/** Chuyển dữ liệu đã lưu (mọi version) lên version hiện tại bằng cách kiểm tra và kẹp phần nhận ra được. */
export function migrate(stored: unknown): Settings {
  return sanitize(stored);
}

// ---- Xuất và nhập JSON ----

export function exportJson(s: Settings): string {
  return JSON.stringify(s, null, 2);
}

export type ImportResult = { ok: true; settings: Settings } | { ok: false; errors: string[] };

/**
 * Nhập JSON. Lỗi cú pháp, không phải đối tượng, phím không hợp lệ hoặc trùng phím đều trả lỗi
 * (không sửa ngầm); giá trị số ngoài khoảng thì được kẹp.
 */
export function importJson(text: string): ImportResult {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['JSON không hợp lệ'] };
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return { ok: false, errors: ['Nội dung phải là một đối tượng'] };
  const errors: string[] = [];
  const rawB = rec(rec(v).bindings);
  const merged: Bindings = { ...DEFAULT_BINDINGS };
  for (const id of ACTION_IDS) {
    if (id in rawB) {
      if (isValidKeyCode(rawB[id])) merged[id] = rawB[id] as string;
      else errors.push(`Phím không hợp lệ cho ${id}`);
    }
  }
  for (const c of findConflicts(merged)) errors.push(`Trùng phím ${c.code} trong ${c.context}: ${c.actions.join(', ')}`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, settings: sanitize(v) };
}
