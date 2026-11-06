import type { Rect } from '../scene/layout';
import type { Pose, Rotation } from './types';

/** Khoảng cách an toàn tối thiểu giữa vật di chuyển và vật khác, mét. */
export const SAFE_GAP = 0.6;
/** Vùng cấm quanh thang máy, thang bộ và lối vào, mét. */
export const KEEP_OUT = 1.5;
/** Nửa kích thước vùng đi được: sàn 58 × 30 m, trừ 0,8 m sát tường. Tâm sàn là gốc. */
export const PLAY_HALF = { x: 28.2, z: 14.2 };

const EPS = 1e-6;

/** Đưa giá trị lạ (ví dụ từ JSON) về Rotation hợp lệ. Mặc định 0. */
export function asRotation(v: unknown): Rotation {
  const n = Number(v);
  if (n === 90) return 90;
  if (n === 180) return 180;
  if (n === 270) return 270;
  return 0;
}

/** Xoay thêm 90° theo chiều kim đồng hồ, quay vòng về 0 sau 270. */
export function nextRotation(r: Rotation): Rotation {
  if (r === 0) return 90;
  if (r === 90) return 180;
  if (r === 180) return 270;
  return 0;
}

/**
 * Footprint của vật có kích thước chưa xoay w × d, tâm đặt tại pose.
 * Xoay 90° hoặc 270° thì hoán đổi w và d.
 */
export function rectOfPose(pose: Pose, w: number, d: number): Rect {
  const swap = pose.rotation === 90 || pose.rotation === 270;
  const sx = swap ? d : w;
  const sz = swap ? w : d;
  return {
    minX: pose.x - sx / 2,
    maxX: pose.x + sx / 2,
    minZ: pose.z - sz / 2,
    maxZ: pose.z + sz / 2,
  };
}

/** Nới hình chữ nhật ra m mét về mọi phía. */
export function inflate(r: Rect, m: number): Rect {
  return { minX: r.minX - m, maxX: r.maxX + m, minZ: r.minZ - m, maxZ: r.maxZ + m };
}

/** Hai hình chữ nhật chồng nhau thật sự. Chạm cạnh không tính là chồng. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX - EPS && a.maxX > b.minX + EPS && a.minZ < b.maxZ - EPS && a.maxZ > b.minZ + EPS;
}

export interface PlacementCheck {
  valid: boolean;
  /** Lý do bị từ chối, tiếng Việt. null khi hợp lệ. */
  reason: string | null;
}

export interface PlacementContext {
  /** Footprint vật cố định (đã loại vật di chuyển được). */
  fixed: readonly Rect[];
  /** Footprint thang máy, thang bộ, lối vào, CHƯA nới. Hàm sẽ nới KEEP_OUT. */
  keepOut: readonly Rect[];
  /** Footprint hiện thời của các vật di chuyển khác. */
  movables: readonly Rect[];
}

/**
 * Kiểm tra sơ bộ phía client trước khi gửi. Server vẫn là bên quyết định.
 * Toàn bộ footprint (đã xoay) phải nằm trong sàn, không vào vùng cấm, và cách vật khác ít nhất SAFE_GAP.
 */
export function checkPlacement(rect: Rect, ctx: PlacementContext): PlacementCheck {
  if (
    rect.minX < -PLAY_HALF.x - EPS ||
    rect.maxX > PLAY_HALF.x + EPS ||
    rect.minZ < -PLAY_HALF.z - EPS ||
    rect.maxZ > PLAY_HALF.z + EPS
  ) {
    return { valid: false, reason: 'Vượt ra ngoài sàn.' };
  }
  for (const k of ctx.keepOut) {
    if (overlaps(rect, inflate(k, KEEP_OUT))) {
      return { valid: false, reason: 'Nằm trong vùng cấm 1,5 m quanh thang máy, thang bộ hoặc lối vào.' };
    }
  }
  const fixedReason = blockedBy(
    rect,
    ctx.fixed,
    'Chồng lên vật thể cố định.',
    'Cần cách vật thể cố định tối thiểu 0,6 m.',
  );
  if (fixedReason) return { valid: false, reason: fixedReason };
  const movableReason = blockedBy(
    rect,
    ctx.movables,
    'Chồng lên vật di chuyển khác.',
    'Cần cách vật di chuyển khác tối thiểu 0,6 m.',
  );
  if (movableReason) return { valid: false, reason: movableReason };
  return { valid: true, reason: null };
}

/** Trả lý do nếu rect chồng hoặc quá sát một trong các rects; null nếu không. */
function blockedBy(rect: Rect, rects: readonly Rect[], overlapMsg: string, gapMsg: string): string | null {
  for (const r of rects) {
    if (overlaps(rect, r)) return overlapMsg;
    if (overlaps(rect, inflate(r, SAFE_GAP))) return gapMsg;
  }
  return null;
}
