/**
 * Đo cơ thể thật (từ mảng đỉnh thô của mesh thân) để đặt phụ kiện: khung đầu, tiết diện thân theo độ cao, tiết diện
 * chi/ngón theo trục xương. Thuần, không phụ thuộc three; test được bằng ba tệp GLB thật.
 * Không gian: tư thế bind của mesh (x ngang, trái là +x theo xương _l; y lên; z là hướng nhìn).
 */
import { Region, type BodyData, type Classification } from './regions';

export type V3 = [number, number, number];

/** Khung đầu đo từ đỉnh thuộc vùng đầu. */
export interface HeadFrame {
  /** Tâm ngang của đầu. */
  cx: number;
  cz: number;
  minY: number;
  maxY: number;
  height: number;
  /** Bán kính nửa chiều rộng / nửa chiều sâu lớn nhất. */
  rx: number;
  rz: number;
  /** Z lớn nhất của mặt (mũi). */
  frontZ: number;
  backZ: number;
  /** Số đỉnh đầu đã dùng. */
  count: number;
}

export function measureHead(data: BodyData, cls: Classification): HeadFrame {
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let count = 0;
  for (let v = 0; v < cls.vertexCount; v++) {
    if (cls.region[v] !== Region.head) continue;
    const x = data.positions[v * 3];
    const y = data.positions[v * 3 + 1];
    const z = data.positions[v * 3 + 2];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    count++;
  }
  if (count === 0) {
    const h = data.bonePos['head'] ?? [0, 1.6, 0];
    return { cx: h[0], cz: h[2], minY: h[1], maxY: h[1] + 0.2, height: 0.2, rx: 0.08, rz: 0.1, frontZ: h[2] + 0.1, backZ: h[2] - 0.1, count: 0 };
  }
  return {
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    minY,
    maxY,
    height: maxY - minY,
    rx: (maxX - minX) / 2,
    rz: (maxZ - minZ) / 2,
    frontZ: maxZ,
    backZ: minZ,
    count,
  };
}

/** Bán kính ngang của đầu ở độ cao y (lớn nhất trong dải ±band): dùng để mũ và tai nghe ôm sát. */
export interface HeadRadius {
  rx: number;
  rz: number;
  cx: number;
  cz: number;
  count: number;
}

export function headSlice(data: BodyData, cls: Classification, y0: number, band: number): HeadRadius {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let count = 0;
  const pts: number[] = [];
  for (let v = 0; v < cls.vertexCount; v++) {
    if (cls.region[v] !== Region.head) continue;
    const y = data.positions[v * 3 + 1];
    if (Math.abs(y - y0) > band) continue;
    const x = data.positions[v * 3];
    const z = data.positions[v * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    pts.push(x, z);
    count++;
  }
  if (!count) return { rx: 0, rz: 0, cx: 0, cz: 0, count: 0 };
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  let rx = Math.max((maxX - minX) / 2, 1e-4);
  let rz = Math.max((maxZ - minZ) / 2, 1e-4);
  // Elip đi qua các cạnh hộp bao không chứa góc hộp: nở đều tới khi chứa mọi điểm.
  let k = 1;
  for (let i = 0; i < pts.length; i += 2) {
    const dx = (pts[i] - cx) / rx;
    const dz = (pts[i + 1] - cz) / rz;
    k = Math.max(k, Math.hypot(dx, dz));
  }
  rx *= k;
  rz *= k;
  return { rx, rz, cx, cz, count };
}

/** Z của bề mặt mặt trước tại độ cao y và gần mặt phẳng giữa (|x| nhỏ): chỗ đặt cầu mũi kính, khẩu trang. */
export function faceFrontZ(data: BodyData, cls: Classification, y0: number, band: number, halfWidth: number, x0 = 0): number {
  let best = -Infinity;
  for (let v = 0; v < cls.vertexCount; v++) {
    if (cls.region[v] !== Region.head) continue;
    const y = data.positions[v * 3 + 1];
    if (Math.abs(y - y0) > band) continue;
    if (Math.abs(data.positions[v * 3] - x0) > halfWidth) continue;
    const z = data.positions[v * 3 + 2];
    if (z > best) best = z;
  }
  return best;
}

/** Tiết diện elip của thân (vùng thân, chậu, cổ) tại độ cao y. */
export interface TorsoSlice {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  frontZ: number;
  backZ: number;
  count: number;
}

const TORSO_REGIONS: ReadonlySet<number> = new Set([Region.torso, Region.pelvis, Region.neck]);

export function torsoSlice(data: BodyData, cls: Classification, y0: number, band: number): TorsoSlice {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let count = 0;
  for (let v = 0; v < cls.vertexCount; v++) {
    if (!TORSO_REGIONS.has(cls.region[v])) continue;
    const y = data.positions[v * 3 + 1];
    if (Math.abs(y - y0) > band) continue;
    const x = data.positions[v * 3];
    const z = data.positions[v * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    count++;
  }
  if (!count) {
    const p = data.bonePos['pelvis'] ?? [0, y0, 0];
    return { cx: p[0], cz: p[2], rx: 0.15, rz: 0.1, frontZ: p[2] + 0.1, backZ: p[2] - 0.1, count: 0 };
  }
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, rx: (maxX - minX) / 2, rz: (maxZ - minZ) / 2, frontZ: maxZ, backZ: minZ, count };
}

/** Tiết diện tròn của một chi/ngón: tâm, trục (đơn vị) và bán kính trung bình. */
export interface LimbSection {
  center: V3;
  /** Trục từ xương đầu tới xương cuối, đơn vị. */
  axis: V3;
  radius: number;
  /** Độ dài đoạn xương. */
  length: number;
  count: number;
}

function dominantBone(data: BodyData, v: number): number {
  let bi = -1;
  let bw = 0;
  for (let k = 0; k < 4; k++) {
    const w = data.skinWeight[v * 4 + k] ?? 0;
    if (w > bw) {
      bw = w;
      bi = data.skinIndex[v * 4 + k];
    }
  }
  return bi;
}

/**
 * Tiết diện quanh điểm t (0 đầu xương, 1 cuối xương) của đoạn boneA->boneB, lấy từ đỉnh có xương chủ đạo là boneA
 * (hoặc `alsoBone` nếu có) nằm trong dải t ± dt. Bán kính là trung bình khoảng cách vuông góc tới trục.
 */
export function limbSection(data: BodyData, boneA: string, boneB: string, t: number, dt = 0.12, alsoBone?: string): LimbSection {
  const a = data.bonePos[boneA];
  const b = data.bonePos[boneB];
  if (!a || !b) return { center: [0, 0, 0], axis: [0, 1, 0], radius: 0.03, length: 0.1, count: 0 };
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  const axis: V3 = [d[0] / len, d[1] / len, d[2] / len];
  const ia = data.boneNames.indexOf(boneA);
  const ib = alsoBone ? data.boneNames.indexOf(alsoBone) : -2;
  const c: V3 = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
  let sum = 0;
  let n = 0;
  const n3 = Math.floor(data.positions.length / 3);
  for (let v = 0; v < n3; v++) {
    const bi = dominantBone(data, v);
    if (bi !== ia && bi !== ib) continue;
    const px = data.positions[v * 3] - a[0];
    const py = data.positions[v * 3 + 1] - a[1];
    const pz = data.positions[v * 3 + 2] - a[2];
    const along = (px * d[0] + py * d[1] + pz * d[2]) / (len * len);
    if (Math.abs(along - t) > dt) continue;
    const proj = along * len;
    const ox = px - axis[0] * proj;
    const oy = py - axis[1] * proj;
    const oz = pz - axis[2] * proj;
    sum += Math.hypot(ox, oy, oz);
    n++;
  }
  return { center: c, axis, radius: n ? sum / n : 0.03, length: len, count: n };
}

/* ------------------------------------------------------------------ */
/* Bộ dò bề mặt thân: bán kính theo góc, chiều cao bề mặt                */
/* ------------------------------------------------------------------ */

/**
 * Bộ dò bề mặt từ đỉnh thân/chậu/cổ: tra bán kính theo góc quanh một trục đứng, z mặt trước/sau và y đỉnh vai
 * tại một toạ độ. Góc 0 là +z (trước), +90 độ là +x (trái của nhân vật).
 */
export class BodyProbe {
  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private readonly zs: Float32Array;
  readonly n: number;

  /** `include` quyết định đỉnh nào vào bộ dò; mặc định thân, chậu, cổ. */
  constructor(data: BodyData, cls: Classification, include?: (v: number) => boolean) {
    const keep: number[] = [];
    for (let v = 0; v < cls.vertexCount; v++) if (include ? include(v) : TORSO_REGIONS.has(cls.region[v])) keep.push(v);
    this.n = keep.length;
    this.xs = new Float32Array(this.n);
    this.ys = new Float32Array(this.n);
    this.zs = new Float32Array(this.n);
    keep.forEach((v, i) => {
      this.xs[i] = data.positions[v * 3];
      this.ys[i] = data.positions[v * 3 + 1];
      this.zs[i] = data.positions[v * 3 + 2];
    });
  }

  /**
   * Bán kính ngoài cùng của thân tại độ cao y theo góc theta quanh trục (cx, cz): khoảng cách lớn nhất của đỉnh nằm trong
   * nêm góc ±dTheta và dải y ± band. Không có đỉnh thì nới dần.
   */
  polar(cx: number, cz: number, y: number, theta: number, band = 0.012, dTheta = 0.2): number {
    for (let attempt = 0; attempt < 4; attempt++) {
      const b = band * (1 + attempt * 1.5);
      const dt = dTheta * (1 + attempt);
      let best = 0;
      for (let i = 0; i < this.n; i++) {
        if (Math.abs(this.ys[i] - y) > b) continue;
        const dx = this.xs[i] - cx;
        const dz = this.zs[i] - cz;
        const r = Math.hypot(dx, dz);
        if (r < 1e-5) continue;
        let d = Math.atan2(dx, dz) - theta;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) <= dt && r > best) best = r;
      }
      if (best > 0) return best;
    }
    return 0.1;
  }

  /** Z lớn nhất (mặt trước) hoặc nhỏ nhất (mặt sau) của đỉnh quanh (x, y) trong bán kính r. NaN nếu không có đỉnh. */
  surfaceZ(x: number, y: number, front: boolean, r = 0.014): number {
    for (let attempt = 0; attempt < 4; attempt++) {
      const rr = r * (1 + attempt);
      let best = front ? -Infinity : Infinity;
      for (let i = 0; i < this.n; i++) {
        if (Math.abs(this.xs[i] - x) > rr || Math.abs(this.ys[i] - y) > rr) continue;
        const z = this.zs[i];
        if (front ? z > best : z < best) best = z;
      }
      if (Number.isFinite(best)) return best;
    }
    return NaN;
  }

  /** Y cao nhất của đỉnh quanh (x, z) trong bán kính r: mặt trên vai. */
  topY(x: number, z: number, r = 0.02): number {
    for (let attempt = 0; attempt < 4; attempt++) {
      const rr = r * (1 + attempt);
      let best = -Infinity;
      for (let i = 0; i < this.n; i++) {
        if (Math.abs(this.xs[i] - x) > rr || Math.abs(this.zs[i] - z) > rr) continue;
        if (this.ys[i] > best) best = this.ys[i];
      }
      if (Number.isFinite(best)) return best;
    }
    return NaN;
  }
}

/** Điểm tai mỗi bên (cạnh ngoài cùng của đầu ở khoảng tai) và dái tai. */
export interface EarPoint {
  /** Điểm ngoài cùng của tai. */
  x: number;
  y: number;
  z: number;
  /** Dái tai: thấp nhất của cụm đỉnh ngoài cùng. */
  lobeY: number;
}

export function earPoint(data: BodyData, cls: Classification, head: HeadFrame, side: 'l' | 'r'): EarPoint {
  const sign = side === 'l' ? 1 : -1;
  const lo = head.minY + 0.22 * head.height;
  const hi = head.minY + 0.62 * head.height;
  let maxAbs = 0;
  for (let v = 0; v < cls.vertexCount; v++) {
    if (cls.region[v] !== Region.head) continue;
    const y = data.positions[v * 3 + 1];
    if (y < lo || y > hi) continue;
    const x = (data.positions[v * 3] - head.cx) * sign;
    if (x > maxAbs) maxAbs = x;
  }
  let sy = 0;
  let sz = 0;
  let n = 0;
  let lobe = Infinity;
  for (let v = 0; v < cls.vertexCount; v++) {
    if (cls.region[v] !== Region.head) continue;
    const y = data.positions[v * 3 + 1];
    if (y < lo || y > hi) continue;
    const x = (data.positions[v * 3] - head.cx) * sign;
    if (x < maxAbs * 0.88) continue;
    sy += y;
    sz += data.positions[v * 3 + 2];
    n++;
    if (y < lobe) lobe = y;
  }
  if (!n) return { x: head.cx + sign * head.rx, y: head.minY + 0.4 * head.height, z: head.cz, lobeY: head.minY + 0.33 * head.height };
  return { x: head.cx + sign * maxAbs, y: sy / n, z: sz / n, lobeY: lobe };
}
