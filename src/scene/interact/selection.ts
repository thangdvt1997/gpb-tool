import { PLAYER_RADIUS, type Rect } from '../layout';
import type { Footprint, InteractableDef, InteractPoint } from './registry';

/** Tư thế nhân vật theo quy ước playerPose: hướng nhìn = (sin yaw, cos yaw). */
export interface Pose {
  x: number;
  z: number;
  yaw: number;
}

/** Mặc định khi vật không khai báo riêng. Cùng giá trị với INTERACT trong geometry.ts. */
export const INTERACT_DEFAULTS = {
  range: 1.8,
  maxAngle: (40 * Math.PI) / 180,
  standOff: 0.8,
} as const;

/**
 * Chọn đúng một vật để tương tác mỗi khung hình.
 * Điều kiện: trong maxDistance, hướng nhìn lệch không quá maxAngle (hoặc tia nhìn chạm thân vật),
 * và đoạn thẳng từ nhân vật tới điểm gần nhất của vật không cắt vật cản nào (không xuyên tường).
 * Điểm số = khoảng cách + 0,5 × độ lệch (rad) − priority: ưu tiên vật gần và thẳng trước mặt.
 * Chống nhấp nháy (trễ): vật đang chọn được nới tầm và góc, và chỉ bị thay khi vật mới tốt hơn rõ rệt.
 */
export const SELECT = {
  /** Bán kính (m) của vật chỉ có point, không có footprint. */
  pointRadius: 0.25,
  /** Vật đang chọn được nới thêm tầm (m) và góc (rad) trước khi bỏ. */
  keepRange: 0.2,
  keepAngle: (8 * Math.PI) / 180,
  /** Vật mới phải tốt hơn vật đang chọn ít nhất chừng này điểm mới thay. */
  switchMargin: 0.2,
  /** Thu nhỏ vật cản một chút để không chặn khi tia sượt mép. */
  occluderInset: 0.02,
} as const;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrap(a: number): number {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  else if (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

export function footprintOf(def: InteractableDef): Footprint | null {
  if (def.footprint) return def.footprint;
  if (def.point) return { cx: def.point.x, cz: def.point.z, hx: SELECT.pointRadius, hz: SELECT.pointRadius };
  return null;
}

export function rectOf(f: Footprint): Rect {
  return { minX: f.cx - f.hx, maxX: f.cx + f.hx, minZ: f.cz - f.hz, maxZ: f.cz + f.hz };
}

/** Phép thử slab: đoạn từ (x, z) theo (dx, dz), t ∈ [0, maxT], có cắt hình chữ nhật không. */
function segmentHitsRect(r: Rect, x: number, z: number, dx: number, dz: number, maxT: number): boolean {
  let t0 = 0;
  let t1 = maxT;
  // Trục x
  if (Math.abs(dx) < 1e-9) {
    if (x < r.minX || x > r.maxX) return false;
  } else {
    let a = (r.minX - x) / dx;
    let b = (r.maxX - x) / dx;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  // Trục z
  if (Math.abs(dz) < 1e-9) {
    if (z < r.minZ || z > r.maxZ) return false;
  } else {
    let a = (r.minZ - z) / dz;
    let b = (r.maxZ - z) / dz;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function contains(r: Rect, x: number, z: number): boolean {
  return x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
}

/**
 * Có vật cản giữa nhân vật và điểm (qx, qz) của vật đích không.
 * Bỏ qua vật cản chồng lên footprint của chính vật đích (vật đặt trên bàn, ngăn kéo trong tủ)
 * và vật cản đang chứa nhân vật (không thể xảy ra khi va chạm đúng, nhưng tránh khóa cứng).
 */
export function isOccluded(pose: Pose, qx: number, qz: number, target: Rect, occluders: readonly Rect[]): boolean {
  const dx = qx - pose.x;
  const dz = qz - pose.z;
  const s = SELECT.occluderInset;
  for (const o of occluders) {
    if (overlaps(o, target)) continue;
    if (contains(o, pose.x, pose.z)) continue;
    const r: Rect = { minX: o.minX + s, maxX: o.maxX - s, minZ: o.minZ + s, maxZ: o.maxZ - s };
    if (r.minX >= r.maxX || r.minZ >= r.maxZ) continue;
    if (segmentHitsRect(r, pose.x, pose.z, dx, dz, 1)) return true;
  }
  return false;
}

export interface Measure {
  dist: number;
  angle: number;
  /** Điểm gần nhất trên footprint. */
  qx: number;
  qz: number;
  inRange: boolean;
}

/** Đo khoảng cách và độ lệch hướng nhìn tới footprint. inRange: đạt cả tầm lẫn hướng (đã tính nới). */
export function measure(f: Footprint, pose: Pose, range: number, maxAngle: number): Measure {
  const qx = clamp(pose.x, f.cx - f.hx, f.cx + f.hx);
  const qz = clamp(pose.z, f.cz - f.hz, f.cz + f.hz);
  const dx = qx - pose.x;
  const dz = qz - pose.z;
  const dist = Math.hypot(dx, dz);
  if (dist >= range) return { dist, angle: Math.PI, qx, qz, inRange: false };
  if (dist < 1e-3) return { dist: 0, angle: 0, qx, qz, inRange: true };
  const angle = Math.abs(wrap(Math.atan2(dx, dz) - pose.yaw));
  if (angle <= maxAngle) return { dist, angle, qx, qz, inRange: true };
  // Vật dài: tia nhìn thẳng chạm thân vật trong tầm cũng tính là đang nhìn vào.
  const hit = segmentHitsRect(rectOf(f), pose.x, pose.z, Math.sin(pose.yaw), Math.cos(pose.yaw), range);
  return { dist, angle: Math.min(angle, maxAngle), qx, qz, inRange: hit };
}

export interface PickResult {
  def: InteractableDef;
  score: number;
}

/**
 * Chọn vật tốt nhất. currentId: vật đang chọn ở khung trước (để giữ ổn định).
 * accept(def): bộ lọc thêm (bật/tắt, còn hành động khả dụng). Không cấp phát mảng trong vòng lặp.
 */
export function pickInteractable(
  defs: readonly InteractableDef[],
  pose: Pose,
  currentId: string | null,
  occluders: readonly Rect[],
  accept: (def: InteractableDef) => boolean,
): InteractableDef | null {
  let best: InteractableDef | null = null;
  let bestScore = Infinity;
  let cur: InteractableDef | null = null;
  let curScore = Infinity;
  for (const def of defs) {
    const f = footprintOf(def);
    if (!f) continue;
    const isCur = def.id === currentId;
    const range = (def.maxDistance ?? INTERACT_DEFAULTS.range) + (isCur ? SELECT.keepRange : 0);
    const maxAngle = (def.maxAngle ?? INTERACT_DEFAULTS.maxAngle) + (isCur ? SELECT.keepAngle : 0);
    const m = measure(f, pose, range, maxAngle);
    if (!m.inRange) continue;
    if (!accept(def)) continue;
    if (m.dist > 1e-3 && isOccluded(pose, m.qx, m.qz, rectOf(f), occluders)) continue;
    const score = m.dist + 0.5 * m.angle - (def.priority ?? 0);
    if (isCur) {
      cur = def;
      curScore = score;
    }
    if (score < bestScore) {
      bestScore = score;
      best = def;
    }
  }
  if (cur && best !== cur && bestScore > curScore - SELECT.switchMargin) return cur;
  return best;
}

function blockedAt(x: number, z: number, obstacles: readonly Rect[], bounds: Rect | undefined): boolean {
  const r = PLAYER_RADIUS;
  if (bounds && (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r)) return true;
  return obstacles.some((o) => x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r);
}

/**
 * Điểm đứng để dùng vật khi bấm chuột từ xa.
 * Có point: dùng đúng point (vị trí và hướng nhìn đã khai báo).
 * Không có: cạnh footprint gần nhân vật nhất, cách mép standOff, quay mặt vào vật; bỏ cạnh bị chặn.
 */
export function approachPointOf(
  def: InteractableDef,
  pose: Pose,
  obstacles: readonly Rect[] = [],
  bounds?: Rect,
): InteractPoint | null {
  if (def.point) return def.point;
  const f = footprintOf(def);
  if (!f) return null;
  const s = INTERACT_DEFAULTS.standOff;
  const along = (v: number, c: number, h: number) => clamp(v, c - Math.max(0, h - 0.3), c + Math.max(0, h - 0.3));
  const ax = along(pose.x, f.cx, f.hx);
  const az = along(pose.z, f.cz, f.hz);
  const candidates: InteractPoint[] = [
    { x: f.cx + f.hx + s, z: az, yaw: -Math.PI / 2 },
    { x: f.cx - f.hx - s, z: az, yaw: Math.PI / 2 },
    { x: ax, z: f.cz + f.hz + s, yaw: Math.PI },
    { x: ax, z: f.cz - f.hz - s, yaw: 0 },
  ];
  candidates.sort((a, b) => Math.hypot(a.x - pose.x, a.z - pose.z) - Math.hypot(b.x - pose.x, b.z - pose.z));
  return candidates.find((c) => !blockedAt(c.x, c.z, obstacles, bounds)) ?? candidates[0] ?? null;
}
