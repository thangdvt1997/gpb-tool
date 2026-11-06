/**
 * Logic thuần của hành động nhanh. Chỉ có `import type` để Node chạy trực tiếp trong kiểm thử.
 * Mỗi hành động ánh xạ tới MỘT emote có thật trong library; không có clip thì không có hành động.
 */
import type { EmoteId, EmoteMode, Keyframe } from '../types';

export type QuickActionId = 'wave' | 'dance_1' | 'dance_2' | 'kata' | 'punch_combo' | 'stance';

/** Sự kiện có thể hủy hành động. */
export type CancelCause = 'move' | 'jump' | 'sit' | 'interact' | 'editor' | 'focus_loss' | 'user' | 'wheel_open';

export interface QuickAction {
  id: QuickActionId;
  emoteId: EmoteId;
  label: string;
  /** Phím tắt (chữ thường). Không được nằm trong RESERVED_KEYS. */
  hotkey: string;
  /** full-body: thay toàn bộ tư thế, chỉ phát khi đứng yên. Chưa có upper-body (rig chưa có mask). */
  layer: 'full_body';
  requires: { stationary: true; standing: true; inAllowedZone: true };
  /** Sự kiện hủy hành động đang chạy. 'stance' không bị hủy khi di chuyển (khớp player.notifyMovement). */
  cancelOn: readonly CancelCause[];
  cooldownSec: number;
  /** Cần người khác đồng ý? Luôn false trong bộ này (xem NOT_IMPLEMENTED). */
  needsOtherPlayer: false;
}

const SELF_CANCEL: readonly CancelCause[] = ['move', 'jump', 'sit', 'interact', 'editor', 'focus_loss', 'user', 'wheel_open'];

function act(id: QuickActionId, label: string, hotkey: string, cooldownSec: number, cancelOn: readonly CancelCause[] = SELF_CANCEL): QuickAction {
  return {
    id, emoteId: id, label, hotkey, layer: 'full_body',
    requires: { stationary: true, standing: true, inAllowedZone: true },
    cancelOn, cooldownSec, needsOtherPlayer: false,
  };
}

/** Phím mở bánh xe. */
export const WHEEL_TOGGLE_KEY = 'q';
/** Phím lõi đang dùng (W A S D Shift Space E V Esc) và phím emote 1-6. */
export const RESERVED_KEYS: readonly string[] = [
  'w', 'a', 's', 'd', 'shift', ' ', 'e', 'v', 'escape', '1', '2', '3', '4', '5', '6',
];

export const QUICK_ACTIONS: readonly QuickAction[] = [
  act('wave', 'Vẫy tay', 'z', 1.5),
  act('dance_1', 'Nhảy 1', 'x', 1),
  act('dance_2', 'Nhảy 2', 'c', 1),
  act('kata', 'Múa võ', 'r', 2),
  act('punch_combo', 'Tập quyền', 'f', 2),
  act('stance', 'Tấn', 't', 0.5, ['jump', 'sit', 'interact', 'editor', 'focus_loss', 'user', 'wheel_open']),
];

/** Hành động chưa làm, kèm lý do. Không hiện trong UI, không chạy giả. */
export const NOT_IMPLEMENTED: readonly { id: string; reason: string }[] = [
  { id: 'handshake', reason: 'Cần người khác: chưa có cơ chế đồng ý hai bên.' },
  { id: 'wave_at_player', reason: 'Vẫy tay hướng về người khác: chưa có cơ chế đồng ý và chọn đối tượng.' },
  { id: 'nod', reason: 'Pose chỉ có headRotZ (nghiêng), không có kênh gật đầu.' },
  { id: 'shake_head', reason: 'Thiếu kênh xoay đầu quanh trục Y trong Pose.' },
  { id: 'point', reason: 'Không có clip chỉ tay trong library.' },
  { id: 'cross_arms', reason: 'Không có clip khoanh tay trong library.' },
  { id: 'phone', reason: 'Thiếu prop điện thoại, hand IK và clip.' },
  { id: 'sit_relax', reason: 'Thiếu clip ngồi và trạng thái ngồi từ hệ thống ghế.' },
  { id: 'face_expression', reason: 'Rig chưa có morph target mặt.' },
];

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

export interface QuickContext {
  /** Vận tốc ngang (đơn vị/giây), do host cấp. */
  speed: number;
  airborne: boolean;
  sitting: boolean;
  editorOpen: boolean;
  /** Đang tương tác vật thể (E). */
  interacting: boolean;
  position: { x: number; z: number };
  /** Vùng cho phép; null = host chưa cấu hình, coi là không giới hạn. Mảng rỗng = không đâu cho phép. */
  zones: readonly Rect[] | null;
}

export type DenyReason =
  | 'moving' | 'airborne' | 'sitting' | 'editor_open' | 'interacting'
  | 'outside_zone' | 'cooldown' | 'unknown_action';

export type StartCheck = { ok: true } | { ok: false; reason: DenyReason };

export const STATIONARY_SPEED = 0.05;

export function inZones(p: { x: number; z: number }, zones: readonly Rect[] | null): boolean {
  if (zones === null) return true;
  return zones.some((r) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ);
}

/** Kiểm tra điều kiện bắt đầu. `cooldownUntilMs` là mốc (ms) hết hồi, 0 nếu chưa từng chạy. */
export function canStart(action: QuickAction | undefined, ctx: QuickContext, nowMs: number, cooldownUntilMs: number): StartCheck {
  if (!action) return { ok: false, reason: 'unknown_action' };
  if (ctx.editorOpen) return { ok: false, reason: 'editor_open' };
  if (ctx.sitting) return { ok: false, reason: 'sitting' };
  if (ctx.airborne) return { ok: false, reason: 'airborne' };
  if (ctx.interacting) return { ok: false, reason: 'interacting' };
  if (ctx.speed > STATIONARY_SPEED) return { ok: false, reason: 'moving' };
  if (!inZones(ctx.position, ctx.zones)) return { ok: false, reason: 'outside_zone' };
  if (nowMs < cooldownUntilMs) return { ok: false, reason: 'cooldown' };
  return { ok: true };
}

export function shouldCancel(action: QuickAction, cause: CancelCause): boolean {
  return action.cancelOn.includes(cause);
}

/** Thời lượng (giây): null nếu loop/hold (chạy tới khi hủy). */
export function durationSec(def: { mode: EmoteMode; frames: readonly Keyframe[] }, leadIn: number, leadOut: number): number | null {
  if (def.mode !== 'once') return null;
  return leadIn + def.frames.reduce((s, f) => s + f.dur, 0) + leadOut;
}

// ---- Phím tắt ----

export function normalizeKey(key: string): string {
  return key.toLowerCase();
}

export interface KeyConflict { key: string; actions: string[]; reservedBy: boolean }

/** Tìm phím trùng giữa các hành động hoặc trùng phím dành riêng (kể cả phím mở bánh xe). */
export function findKeyConflicts(
  actions: readonly { id: string; hotkey: string }[],
  reserved: readonly string[] = RESERVED_KEYS,
  wheelKey: string = WHEEL_TOGGLE_KEY,
): KeyConflict[] {
  const res = new Set([...reserved.map(normalizeKey), normalizeKey(wheelKey)]);
  const by = new Map<string, string[]>();
  for (const a of actions) {
    const k = normalizeKey(a.hotkey);
    by.set(k, [...(by.get(k) ?? []), a.id]);
  }
  const out: KeyConflict[] = [];
  by.forEach((ids, key) => {
    if (ids.length > 1 || res.has(key) || key === '') out.push({ key, actions: ids, reservedBy: res.has(key) });
  });
  return out;
}

/** Phím gõ → id hành động, hoặc null. Bỏ qua nếu có Ctrl/Meta/Alt/Shift. */
export function actionForKey(
  key: string,
  mods: { ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean },
  actions: readonly QuickAction[] = QUICK_ACTIONS,
): QuickActionId | null {
  if (mods.ctrl || mods.meta || mods.alt || mods.shift) return null;
  const k = normalizeKey(key);
  return actions.find((a) => a.hotkey === k)?.id ?? null;
}

/** Đổi phím tắt có kiểm tra: trả danh sách mới hoặc lý do từ chối. */
export function rebind(
  actions: readonly QuickAction[], id: QuickActionId, newKey: string,
): { ok: true; actions: QuickAction[] } | { ok: false; reason: string } {
  const k = normalizeKey(newKey);
  if (k.length !== 1) return { ok: false, reason: 'Chỉ nhận một ký tự.' };
  const next = actions.map((a) => (a.id === id ? { ...a, hotkey: k } : a));
  const c = findKeyConflicts(next).find((x) => x.key === k);
  if (c) return { ok: false, reason: c.reservedBy ? 'Trùng phím đang dùng.' : 'Trùng hành động khác.' };
  return { ok: true, actions: next };
}

// ---- Bánh xe ----

/** Chọn ô theo góc con trỏ so với tâm (0 ở trên, theo chiều kim đồng hồ). -1 nếu trong vùng chết. */
export function wheelIndexFromPointer(dx: number, dy: number, count: number, deadzone = 24): number {
  if (count <= 0 || Math.hypot(dx, dy) < deadzone) return -1;
  const full = Math.PI * 2;
  const ang = (Math.atan2(dx, -dy) + full) % full;
  const step = full / count;
  return Math.floor(((ang + step / 2) % full) / step);
}

/** Phím số '1'..'9' → chỉ số, -1 nếu ngoài khoảng. Chỉ dùng khi bánh xe đang mở. */
export function wheelIndexFromDigit(key: string, count: number): number {
  if (key.length !== 1 || key < '1' || key > '9') return -1;
  const i = Number(key) - 1;
  return i < count ? i : -1;
}
