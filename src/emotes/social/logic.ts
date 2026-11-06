/**
 * Logic thuần của hành động xã hội có mục tiêu (TASK 15). Không import runtime từ player/React
 * nên vitest chạy trực tiếp. Quy ước hướng: yaw = atan2(dx, dz), tức hướng nhìn là (sin yaw, cos yaw)
 * trên mặt phẳng XZ, khớp rotation.y của three với mặt nhân vật quay về +Z.
 */
import type { EmoteId } from '../types';
import { STATIONARY_SPEED } from '../quick/logic';

export type SocialActionId = 'wave_at' | 'handshake' | 'high_five' | 'bow' | 'point_at';

export interface SocialAction {
  id: SocialActionId;
  emoteId: EmoteId;
  label: string;
  /** true: hành động hai người, cần người kia chấp nhận. */
  needsConsent: boolean;
  /** Tầm tối đa (m) tới mục tiêu. Hành động chạm tay phải gần hơn. */
  maxRange: number;
  /** Nửa góc nhìn (rad) mục tiêu phải nằm trong. */
  halfFov: number;
  cooldownSec: number;
}

const DEG = Math.PI / 180;

export const SOCIAL_ACTIONS: readonly SocialAction[] = [
  { id: 'wave_at', emoteId: 'wave_at', label: 'Vẫy chào', needsConsent: false, maxRange: 8, halfFov: 70 * DEG, cooldownSec: 3 },
  { id: 'bow', emoteId: 'bow', label: 'Cúi chào', needsConsent: false, maxRange: 5, halfFov: 70 * DEG, cooldownSec: 3 },
  { id: 'point_at', emoteId: 'point_at', label: 'Chỉ tay', needsConsent: false, maxRange: 12, halfFov: 60 * DEG, cooldownSec: 3 },
  { id: 'handshake', emoteId: 'handshake', label: 'Bắt tay', needsConsent: true, maxRange: 2.5, halfFov: 80 * DEG, cooldownSec: 8 },
  { id: 'high_five', emoteId: 'high_five', label: 'Đập tay', needsConsent: true, maxRange: 2.5, halfFov: 80 * DEG, cooldownSec: 8 },
];

export function getSocialAction(id: string): SocialAction | undefined {
  return SOCIAL_ACTIONS.find((a) => a.id === id);
}

/** Thời gian chờ trả lời lời mời (ms). */
export const INVITE_TTL_MS = 15_000;
/** Đang chờ/đã nhận mà một bên đi xa hơn maxRange nhân hệ số này thì hủy. */
export const CANCEL_DISTANCE_FACTOR = 1.6;
/** Khoảng cách tối thiểu: sát hơn thì coi là chồng lên nhau, từ chối. */
export const MIN_DISTANCE = 0.3;

export interface Vec2 { x: number; z: number }
export interface Peer extends Vec2 { id: string }
export interface SelfState extends Vec2 { yaw: number }

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Yaw để đứng ở `from` nhìn về `to`. Trùng điểm thì giữ `fallback`. */
export function yawToward(from: Vec2, to: Vec2, fallback = 0): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.hypot(dx, dz) < 1e-6) return fallback;
  return Math.atan2(dx, dz);
}

/** Hiệu góc chuẩn hóa về (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Yaw mới cho cả hai người để nhìn nhau. */
export function facePair(a: Vec2, b: Vec2): { a: number; b: number } {
  return { a: yawToward(a, b), b: yawToward(b, a) };
}

/**
 * Chọn mục tiêu gần nhất nằm trong bán kính và trong tầm nhìn của hành động.
 * Bỏ qua chính mình, người chồng lên nhau. Hòa khoảng cách thì lấy id nhỏ hơn cho ổn định.
 */
export function pickTarget(self: SelfState, peers: readonly Peer[], action: SocialAction, selfId = ''): Peer | null {
  let best: Peer | null = null;
  let bestD = Infinity;
  for (const p of peers) {
    if (p.id === selfId) continue;
    const d = distance(self, p);
    if (d < MIN_DISTANCE || d > action.maxRange) continue;
    if (Math.abs(angleDiff(self.yaw, yawToward(self, p, self.yaw))) > action.halfFov) continue;
    if (d < bestD || (d === bestD && best !== null && p.id < best.id)) { best = p; bestD = d; }
  }
  return best;
}

export interface SocialContext {
  speed: number;
  airborne: boolean;
  sitting: boolean;
  editorOpen: boolean;
  interacting: boolean;
  /** Đang trong trận (duel). */
  inMatch: boolean;
}

export type SocialDenyReason =
  | 'unknown_action' | 'editor_open' | 'sitting' | 'airborne' | 'in_match' | 'interacting'
  | 'moving' | 'cooldown' | 'no_target' | 'too_far' | 'busy';

export type SocialCheck = { ok: true } | { ok: false; reason: SocialDenyReason };

/** Điều kiện bản thân được phép bắt đầu hành động xã hội (chưa xét mục tiêu). */
export function canStartSocial(
  action: SocialAction | undefined, ctx: SocialContext, nowMs: number, cooldownUntilMs: number,
): SocialCheck {
  if (!action) return { ok: false, reason: 'unknown_action' };
  if (ctx.inMatch) return { ok: false, reason: 'in_match' };
  if (ctx.editorOpen) return { ok: false, reason: 'editor_open' };
  if (ctx.sitting) return { ok: false, reason: 'sitting' };
  if (ctx.airborne) return { ok: false, reason: 'airborne' };
  if (ctx.interacting) return { ok: false, reason: 'interacting' };
  if (ctx.speed > STATIONARY_SPEED) return { ok: false, reason: 'moving' };
  if (nowMs < cooldownUntilMs) return { ok: false, reason: 'cooldown' };
  return { ok: true };
}

// ---- Máy trạng thái lời mời -------------------------------------------------

export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';

export interface SocialInvite {
  id: string;
  actionId: SocialActionId;
  from: string;
  to: string;
  createdAt: number;
  expiresAt: number;
  status: InviteStatus;
}

export type InviteEvent =
  | { type: 'accept'; by: string; now: number }
  | { type: 'decline'; by: string; now: number }
  | { type: 'cancel'; by: string; now: number }
  /** dist: khoảng cách hiện tại giữa hai người (nếu biết). */
  | { type: 'tick'; now: number; dist?: number };

export function isTerminal(s: InviteStatus): boolean {
  return s !== 'pending';
}

export function createInvite(
  id: string, actionId: SocialActionId, from: string, to: string, now: number, ttlMs = INVITE_TTL_MS,
): SocialInvite {
  return { id, actionId, from, to, createdAt: now, expiresAt: now + ttlMs, status: 'pending' };
}

/**
 * Chuyển trạng thái thuần: trả bản mới, không sửa bản cũ. Trạng thái cuối bất biến.
 * - Chỉ người được mời accept/decline; chỉ người mời cancel.
 * - accept sau khi quá hạn thì thành expired (không chấp nhận muộn).
 * - tick: quá hạn -> expired; quá xa -> cancelled.
 */
export function reduceInvite(inv: SocialInvite, ev: InviteEvent): SocialInvite {
  if (isTerminal(inv.status)) return inv;
  const set = (status: InviteStatus): SocialInvite => ({ ...inv, status });
  if (ev.now >= inv.expiresAt) return set('expired');
  switch (ev.type) {
    case 'accept': return ev.by === inv.to ? set('accepted') : inv;
    case 'decline': return ev.by === inv.to ? set('declined') : inv;
    case 'cancel': return ev.by === inv.from ? set('cancelled') : inv;
    case 'tick': {
      const action = getSocialAction(inv.actionId);
      if (action && ev.dist !== undefined && ev.dist > action.maxRange * CANCEL_DISTANCE_FACTOR) return set('cancelled');
      return inv;
    }
  }
}

/** Giây còn lại (làm tròn lên, không âm). */
export function remainingSec(inv: SocialInvite, nowMs: number): number {
  return Math.max(0, Math.ceil((inv.expiresAt - nowMs) / 1000));
}

// ---- Thông điệp mạng (đề xuất, xem docs/design/EMOTES_SOCIAL.md) -------------

export type SocialMessage =
  | { type: 'social_invite'; invite: SocialInvite }
  | { type: 'social_respond'; inviteId: string; by: string; answer: 'accept' | 'decline' }
  | { type: 'social_cancel'; inviteId: string; by: string }
  /** Hành động không cần đồng ý: chỉ thông báo để người xem phát emote. */
  | { type: 'social_play'; actionId: SocialActionId; from: string; to: string; startTime: number };
