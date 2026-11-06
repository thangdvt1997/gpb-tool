import type { Duel } from '../../duel/types';

/**
 * Tư thế hiển thị của một bên trong trận (MOVEMENT_EMOTES mục 4).
 * Hàm thuần, không gọi API. Ghi kết quả vào đối tượng `out` do người gọi dựng sẵn.
 */

export type DuelPoseEmote = 'down' | 'dance_1' | 'stance';

export interface FighterVisual {
  /** Góc quay quanh Y để nhìn về đối thủ (rad). Quy ước: 0 nhìn về +Z. */
  facingYaw: number;
  /** Emote duy trì: down, stance (fight) hoặc dance_1 (dance); null khi không có trận. */
  hold: DuelPoseEmote | null;
  /** True khi đang nằm đỡ: không di chuyển, không đấm. */
  locked: boolean;
}

export function createFighterVisual(): FighterVisual {
  return { facingYaw: 0, hold: null, locked: false };
}

export interface Vec2 {
  x: number;
  z: number;
}

/** Khóa của đòn trúng hiện tại, hoặc null. Khóa đổi nghĩa là có đòn mới. */
export function hitKey(duel: Duel | null): string | null {
  const h = duel?.lastHit;
  if (!h) return null;
  return `${h.by}|${h.at ?? ''}|${h.damage}`;
}

/** Người bị trúng đòn: bên còn lại của người đánh. */
export function hitTargetId(duel: Duel): string | null {
  const h = duel.lastHit;
  if (!h) return null;
  if (h.by === duel.inviterId) return duel.inviteeId;
  if (h.by === duel.inviteeId) return duel.inviterId;
  return null;
}

/** Còn nằm đỡ tại thời điểm nowMs (Date.now) không. */
export function isDown(duel: Duel, userId: string, nowMs: number): boolean {
  if (duel.status !== 'active' || duel.downUserId !== userId) return false;
  if (duel.downUntil === null) return true;
  const t = Date.parse(duel.downUntil);
  return Number.isNaN(t) || nowMs < t;
}

/** Góc nhìn từ `from` về `to`; giữ `fallback` nếu hai điểm trùng. */
export function yawToward(from: Vec2, to: Vec2, fallback: number): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx * dx + dz * dz < 1e-8) return fallback;
  return Math.atan2(dx, dz);
}

/**
 * Tính hiển thị cho `userId`. Trận không active hoặc userId không tham gia thì hold = null.
 * Trận fight: stance, hoặc down nếu đang nằm đỡ. Trận dance: dance_1 cho cả hai.
 */
export function computeFighterVisual(
  duel: Duel | null,
  userId: string,
  self: Vec2 | undefined,
  other: Vec2 | undefined,
  nowMs: number,
  out: FighterVisual,
): void {
  if (duel === null || duel.status !== 'active' || (duel.inviterId !== userId && duel.inviteeId !== userId)) {
    out.hold = null;
    out.locked = false;
    return;
  }
  if (self !== undefined && other !== undefined) out.facingYaw = yawToward(self, other, out.facingYaw);
  if (duel.mode === 'dance') {
    out.hold = 'dance_1';
    out.locked = false;
    return;
  }
  const down = isDown(duel, userId, nowMs);
  out.hold = down ? 'down' : 'stance';
  out.locked = down;
}
