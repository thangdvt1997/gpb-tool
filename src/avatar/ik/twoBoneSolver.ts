import * as THREE from 'three';

/**
 * Bộ giải IK hai xương giải tích (luật cos) chỉ làm việc với vector, không đụng tới xương.
 * Dùng cho đùi-cẳng-bàn chân và cánh tay trên-cẳng tay-bàn tay.
 */

/** Giới hạn góc trong của khớp giữa (gối, khuỷu), đơn vị radian. Góc π = duỗi thẳng. */
export interface HingeLimits {
  /** Góc trong nhỏ nhất (gập tối đa). Gối ~ 0,45 rad, khuỷu ~ 0,4 rad. */
  minInterior: number;
  /** Góc trong lớn nhất, tối đa π (khớp không ưỡn ngược nên không có giá trị > π). */
  maxInterior: number;
}

export const KNEE_LIMITS: HingeLimits = { minInterior: 0.45, maxInterior: Math.PI };
export const ELBOW_LIMITS: HingeLimits = { minInterior: 0.4, maxInterior: Math.PI };

export interface TwoBoneResult {
  /** Vị trí khớp giữa sau giải. */
  mid: THREE.Vector3;
  /** Vị trí đầu mút sau giải (bằng mục tiêu nếu với tới). */
  end: THREE.Vector3;
  /** true nếu mục tiêu nằm trong vùng với tới (chưa bị kẹp). */
  reachable: boolean;
  /** Khoảng cách từ đầu mút đến mục tiêu (m), 0 nếu với tới. */
  error: number;
  /** Góc trong thực tế tại khớp giữa (rad). */
  interior: number;
}

export function createTwoBoneResult(): TwoBoneResult {
  return { mid: new THREE.Vector3(), end: new THREE.Vector3(), reachable: true, error: 0, interior: Math.PI };
}

const _u = new THREE.Vector3();
const _n = new THREE.Vector3();
const _t = new THREE.Vector3();

/** Khoảng cách gốc-đầu mút ứng với góc trong gamma. */
function distanceForInterior(l1: number, l2: number, gamma: number): number {
  return Math.sqrt(Math.max(0, l1 * l1 + l2 * l2 - 2 * l1 * l2 * Math.cos(gamma)));
}

/** Chọn một vector vuông góc với u (đã chuẩn hóa) khi mọi gợi ý đều suy biến. */
function anyPerpendicular(u: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  if (Math.abs(u.y) < 0.9) _t.set(0, 1, 0);
  else _t.set(1, 0, 0);
  return out.crossVectors(u, _t).normalize();
}

/** Lấy phần của v vuông góc với u vào out; trả về độ dài trước khi chuẩn hóa. */
function perpComponent(v: THREE.Vector3, u: THREE.Vector3, out: THREE.Vector3): number {
  out.copy(v).addScaledVector(u, -v.dot(u));
  const len = out.length();
  if (len > 1e-6) out.multiplyScalar(1 / len);
  return len;
}

/**
 * Giải vị trí khớp giữa và đầu mút.
 * @param root vị trí gốc chuỗi (vai/hông), thế giới
 * @param curMid vị trí khớp giữa hiện tại, dùng làm hướng gập dự phòng khi không có pole
 * @param pole điểm pole (khuỷu/gối sẽ nằm về phía điểm này); null để giữ hướng gập hiện tại
 */
export function solveTwoBone(
  root: THREE.Vector3,
  curMid: THREE.Vector3,
  l1: number,
  l2: number,
  target: THREE.Vector3,
  pole: THREE.Vector3 | null,
  limits: HingeLimits,
  out: TwoBoneResult,
): TwoBoneResult {
  l1 = Math.max(1e-6, l1);
  l2 = Math.max(1e-6, l2);
  _u.subVectors(target, root);
  let dist = _u.length();
  if (!Number.isFinite(dist)) {
    // Mục tiêu hỏng (NaN/Inf): giữ nguyên tư thế hiện tại.
    out.mid.copy(curMid);
    _u.subVectors(curMid, root).normalize();
    out.end.copy(root).addScaledVector(_u, l1 + l2);
    out.reachable = false;
    out.error = Infinity;
    out.interior = Math.PI;
    return out;
  }
  if (dist > 1e-9) _u.multiplyScalar(1 / dist);
  else {
    _u.subVectors(curMid, root);
    if (_u.lengthSq() < 1e-12) _u.set(0, -1, 0);
    _u.normalize();
  }

  const gMax = Math.min(Math.PI, Math.max(limits.maxInterior, limits.minInterior));
  const gMin = Math.max(1e-3, Math.min(limits.minInterior, gMax));
  const dMax = distanceForInterior(l1, l2, gMax);
  const dMin = Math.max(distanceForInterior(l1, l2, gMin), Math.abs(l1 - l2) + 1e-6, 1e-6);
  const d = Math.min(dMax, Math.max(dMin, dist));
  const reachable = dist <= dMax + 1e-9 && dist >= dMin - 1e-9;

  // Hướng gập: thành phần của (pole - gốc) vuông góc trục; dự phòng theo khớp hiện tại rồi tới trục bất kỳ.
  let ok = false;
  if (pole) {
    _t.subVectors(pole, root);
    ok = Number.isFinite(_t.x + _t.y + _t.z) && perpComponent(_t, _u, _n) > 1e-5;
  }
  if (!ok) {
    _t.subVectors(curMid, root);
    ok = perpComponent(_t, _u, _n) > 1e-5;
  }
  if (!ok) anyPerpendicular(_u, _n);

  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  out.mid.copy(root).addScaledVector(_u, a).addScaledVector(_n, h);
  out.end.copy(root).addScaledVector(_u, d);
  out.reachable = reachable;
  out.error = reachable ? 0 : out.end.distanceTo(target);
  const cosG = (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2);
  out.interior = Math.acos(Math.min(1, Math.max(-1, cosG)));
  return out;
}
