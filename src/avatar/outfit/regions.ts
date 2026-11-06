/**
 * Phân vùng đỉnh của mesh thân MPFB theo trọng số skin tới xương (thuần, không phụ thuộc three).
 * Đầu vào là mảng thô (position, skinIndex, skinWeight, tên xương, vị trí xương ở tư thế bind), nên test được
 * bằng dữ liệu đỉnh giả. Rig game_engine 53 xương: Root, pelvis, spine_01..03, clavicle_l/r, upperarm, lowerarm,
 * hand + 5 ngón, neck_01, head, thigh, calf, foot, ball.
 */

/** Vùng cơ thể. Giá trị số để lưu trong Uint8Array. */
export const Region = {
  other: 0,
  head: 1,
  neck: 2,
  torso: 3,
  pelvis: 4,
  upperArm: 5,
  foreArm: 6,
  hand: 7,
  thigh: 8,
  calf: 9,
  foot: 10,
} as const;
export type RegionId = (typeof Region)[keyof typeof Region];

/** Bên cơ thể: 0 giữa, 1 trái, 2 phải. */
export const SIDE_CENTER = 0;
export const SIDE_LEFT = 1;
export const SIDE_RIGHT = 2;

export const REGION_NAMES: Readonly<Record<RegionId, string>> = {
  0: 'other',
  1: 'head',
  2: 'neck',
  3: 'torso',
  4: 'pelvis',
  5: 'upperArm',
  6: 'foreArm',
  7: 'hand',
  8: 'thigh',
  9: 'calf',
  10: 'foot',
};

/** Vùng và bên của một xương theo tên. Xương lạ (Root...) là 'other'. */
export function boneRegion(name: string): { region: RegionId; side: number } {
  const m = /_(l|r)$/.exec(name);
  const side = m ? (m[1] === 'l' ? SIDE_LEFT : SIDE_RIGHT) : SIDE_CENTER;
  if (name === 'head') return { region: Region.head, side };
  if (name === 'neck_01') return { region: Region.neck, side };
  if (name === 'pelvis') return { region: Region.pelvis, side };
  if (/^spine_\d+$/.test(name) || /^clavicle_[lr]$/.test(name)) return { region: Region.torso, side: SIDE_CENTER };
  if (/^upperarm_[lr]$/.test(name)) return { region: Region.upperArm, side };
  if (/^lowerarm_[lr]$/.test(name)) return { region: Region.foreArm, side };
  if (/^(hand|index_\d+|middle_\d+|pinky_\d+|ring_\d+|thumb_\d+)_[lr]$/.test(name)) return { region: Region.hand, side };
  if (/^thigh_[lr]$/.test(name)) return { region: Region.thigh, side };
  if (/^calf_[lr]$/.test(name)) return { region: Region.calf, side };
  if (/^(foot|ball)_[lr]$/.test(name)) return { region: Region.foot, side };
  return { region: Region.other, side: SIDE_CENTER };
}

/** Dữ liệu thô của mesh thân (không gian cục bộ của mesh, đơn vị m, tư thế bind). */
export interface BodyData {
  /** 3 số mỗi đỉnh. */
  positions: ArrayLike<number>;
  /** 3 số mỗi đỉnh (có thể rỗng nếu không có pháp tuyến). */
  normals: ArrayLike<number>;
  /** Chỉ số tam giác. */
  index: ArrayLike<number>;
  /** 4 số mỗi đỉnh: chỉ số xương trong boneNames. */
  skinIndex: ArrayLike<number>;
  /** 4 số mỗi đỉnh: trọng số. */
  skinWeight: ArrayLike<number>;
  /** Tên xương theo chỉ số skin. */
  boneNames: readonly string[];
  /** Vị trí xương (đầu xương) ở tư thế bind, cùng không gian với positions. */
  bonePos: Readonly<Record<string, readonly [number, number, number]>>;
}

/** Kết quả phân vùng. Mỗi mảng có một phần tử mỗi đỉnh. */
export interface Classification {
  vertexCount: number;
  region: Uint8Array;
  side: Uint8Array;
  /**
   * Toạ độ dọc chi: 0 tại khớp đầu, 1 tại khớp cuối của đoạn xương (upperArm: vai tới khuỷu; foreArm: khuỷu tới cổ tay;
   * thigh: hông tới gối; calf: gối tới cổ chân; foot: cổ chân tới mũi). Vùng thân/đầu: 0.
   */
  t: Float32Array;
  /** Chiều dài đoạn xương (cùng đơn vị mesh) của trục t tại đỉnh; đổi t sang mét: t * tLen. 1 nếu đỉnh không thuộc chi. */
  tLen: Float32Array;
  /** Độ cao chuẩn hoá: 0 tại xương chậu, 1 tại gốc cổ. Có thể âm (dưới hông) hoặc lớn hơn 1. */
  u: Float32Array;
  /** Mốc dùng để chuẩn hoá. */
  yPelvis: number;
  yNeck: number;
  /** Chiều cao thân (max y - min y) dùng để co độ dày theo cỡ mesh. */
  bodyHeight: number;
}

/** Đoạn xương định nghĩa trục t cho từng vùng chi: [xương đầu, xương cuối] theo hậu tố bên. */
const SEGMENTS: Readonly<Partial<Record<RegionId, readonly [string, string]>>> = {
  [Region.upperArm]: ['upperarm', 'lowerarm'],
  [Region.foreArm]: ['lowerarm', 'hand'],
  [Region.thigh]: ['thigh', 'calf'],
  [Region.calf]: ['calf', 'foot'],
  [Region.foot]: ['foot', 'ball'],
};

/**
 * Phân vùng từng đỉnh theo vùng có tổng trọng số skin lớn nhất, rồi tính t (dọc chi) và u (độ cao).
 * Đỉnh không có trọng số (tổng 0) thuộc 'other' và không bao giờ được trang phục che.
 */
export function classifyBody(data: BodyData): Classification {
  const n = Math.floor(data.positions.length / 3);
  const region = new Uint8Array(n);
  const side = new Uint8Array(n);
  const t = new Float32Array(n);
  const tLen = new Float32Array(n).fill(1);
  const u = new Float32Array(n);
  const boneInfo = data.boneNames.map(boneRegion);

  const pel = data.bonePos['pelvis'];
  const neck = data.bonePos['neck_01'];
  const yPelvis = pel ? pel[1] : 0;
  const yNeck = neck ? neck[1] : yPelvis + 1;
  const span = Math.max(1e-6, yNeck - yPelvis);

  let minY = Infinity;
  let maxY = -Infinity;
  const acc = new Float64Array(11 * 3); // [vùng][bên]
  for (let v = 0; v < n; v++) {
    acc.fill(0);
    for (let k = 0; k < 4; k++) {
      const w = data.skinWeight[v * 4 + k] ?? 0;
      if (w <= 0) continue;
      const info = boneInfo[data.skinIndex[v * 4 + k] ?? -1];
      if (!info) continue;
      acc[info.region * 3 + info.side] += w;
    }
    // Cộng gộp bên để chọn vùng, rồi chọn bên có trọng số lớn hơn trong vùng đó.
    let bestRegion = 0;
    let bestW = 0;
    for (let r = 1; r < 11; r++) {
      const w = acc[r * 3] + acc[r * 3 + 1] + acc[r * 3 + 2];
      if (w > bestW) {
        bestW = w;
        bestRegion = r;
      }
    }
    region[v] = bestW > 0 ? bestRegion : 0;
    let bestSide = SIDE_CENTER;
    if (bestRegion !== 0) {
      const l = acc[bestRegion * 3 + 1];
      const r = acc[bestRegion * 3 + 2];
      if (l > r && l > acc[bestRegion * 3]) bestSide = SIDE_LEFT;
      else if (r > l && r > acc[bestRegion * 3]) bestSide = SIDE_RIGHT;
    }
    side[v] = bestSide;

    const px = data.positions[v * 3] ?? 0;
    const py = data.positions[v * 3 + 1] ?? 0;
    const pz = data.positions[v * 3 + 2] ?? 0;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
    u[v] = (py - yPelvis) / span;

    const seg = SEGMENTS[region[v] as RegionId];
    if (seg && bestSide !== SIDE_CENTER) {
      const suffix = bestSide === SIDE_LEFT ? '_l' : '_r';
      const a = data.bonePos[seg[0] + suffix];
      const b = data.bonePos[seg[1] + suffix];
      if (a && b) {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const dz = b[2] - a[2];
        const len2 = dx * dx + dy * dy + dz * dz;
        if (len2 > 1e-12) tLen[v] = Math.sqrt(len2);
        if (len2 > 1e-12) t[v] = ((px - a[0]) * dx + (py - a[1]) * dy + (pz - a[2]) * dz) / len2;
      }
    }
  }
  return {
    vertexCount: n,
    region,
    side,
    t,
    tLen,
    u,
    yPelvis,
    yNeck,
    bodyHeight: Number.isFinite(maxY - minY) && maxY > minY ? maxY - minY : 1,
  };
}
