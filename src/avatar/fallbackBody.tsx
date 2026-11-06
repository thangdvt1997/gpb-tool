import * as THREE from 'three';
import type { BodyType } from './appearance';
import { Box, useOwned, type Vec3 } from './fallbackParts';

/*
 * Hình thể nhân vật dự phòng: số đo, khung xương gốc và bề mặt thân trơn (không còn thân hộp).
 *
 * Mọi toạ độ trong file là toạ độ gốc, chưa nhân BODY_HEIGHT_SCALE. Nhân vật được scale đều ở group ngoài cùng,
 * nên số đo thật (mét) = số đo gốc × hệ số. Bảng MEASURES ghi số đo thật, bodyShapeOf đổi sang toạ độ gốc.
 */

/** Chiều cao gốc chưa scale (đế giày tới đỉnh tóc ngắn). Xem FallbackAvatar. */
export const BASE_HEIGHT = 1.716;

/**
 * Chiều cao đích theo kiểu dáng (mét): slim 1,60 (dáng nữ), regular 1,70 (dáng nam), broad 1,74.
 * Hệ số đặt lên group ngoài cùng nên tỷ lệ đầu thân (khoảng 7,6 đầu) giữ nguyên.
 */
export const BODY_HEIGHT_SCALE: Record<BodyType, number> = {
  slim: 1.6 / BASE_HEIGHT,
  regular: 1.7 / BASE_HEIGHT,
  broad: 1.74 / BASE_HEIGHT,
};

// ---- Khung xương gốc (m, chưa scale). Khớp với rig trong animation.ts: tay và chân xoay quanh các khớp này. ----

/** Tâm khớp vai (đầu xương cánh tay), ngay dưới mỏm cùng vai. */
export const SHOULDER_Y = 1.385;
/** Khớp hông. Chân dài 0,86 m gốc (0,85 m thật ở 1,70 m). */
export const HIP_Y = 0.86;
/** Tâm đầu. */
export const HEAD_Y = 1.6;
/** Chân cổ, nơi đặt cổ áo. */
export const NECK_BASE_Y = 1.455;
/** Cổ lùi nhẹ ra sau so với tâm đầu. */
export const NECK_Z = -0.01;
/** Thắt lưng quần. */
export const BELT_Y = 0.965;
/** Eo tự nhiên và tầm ngực. */
export const WAIST_Y = 1.06;
export const CHEST_Y = 1.25;

/** Cánh tay trên, cẳng tay, bàn tay (m gốc). */
export const UPPER_ARM = 0.29;
export const FOREARM = 0.26;
export const HAND = 0.18;
/** Đùi (hông tới gối) và cẳng chân (gối tới mắt cá). Mắt cá cách đất 0,06 m. */
export const THIGH = 0.43;
export const SHIN = 0.37;

/**
 * Hệ số scale khối đầu: hộp sọ gốc là elipsoit bán kính 0,1 (cao ×1,12). Rộng 0,15, sâu 0,19, cao 0,224
 * (đỉnh tới cằm) ở dáng nam. Tóc và mặt nằm trong cùng group nên co theo.
 */
export const HEAD_SCALE: Vec3 = [0.75, 1, 0.95];

/** Số đo thật (mét) trên nhân vật đã scale. Đường kính chi đo ở chỗ to nhất của đoạn. */
interface Measures {
  /** Hai đầu vai (mỏm cùng vai). */
  shoulder: number;
  chestW: number;
  chestD: number;
  waistW: number;
  waistD: number;
  hipW: number;
  hipD: number;
  neckD: number;
  upperArmD: number;
  forearmD: number;
  wristD: number;
  thighD: number;
  kneeD: number;
  calfD: number;
  ankleD: number;
  /** Bề ngang bàn tay. */
  handW: number;
  /** Độ nhô ngực về phía trước (m). Dáng nữ có giá trị nhỏ, kín đáo. */
  bust: number;
  /** Tay thả hơi dạng ra (rad) để tránh xuyên hông. */
  abduct: number;
  /** Hệ số bề ngang giày. */
  foot: number;
}

const MEASURES: Record<BodyType, Measures> = {
  slim: {
    shoulder: 0.35, chestW: 0.26, chestD: 0.2, waistW: 0.24, waistD: 0.17, hipW: 0.34, hipD: 0.21,
    neckD: 0.095, upperArmD: 0.07, forearmD: 0.06, wristD: 0.045,
    thighD: 0.165, kneeD: 0.09, calfD: 0.1, ankleD: 0.058, handW: 0.075,
    bust: 0.014, abduct: 0.09, foot: 0.92,
  },
  regular: {
    shoulder: 0.4, chestW: 0.31, chestD: 0.22, waistW: 0.28, waistD: 0.19, hipW: 0.32, hipD: 0.21,
    neckD: 0.1, upperArmD: 0.09, forearmD: 0.076, wristD: 0.055,
    thighD: 0.165, kneeD: 0.1, calfD: 0.11, ankleD: 0.065, handW: 0.085,
    bust: 0, abduct: 0.05, foot: 1,
  },
  broad: {
    shoulder: 0.43, chestW: 0.34, chestD: 0.25, waistW: 0.32, waistD: 0.23, hipW: 0.34, hipD: 0.23,
    neckD: 0.11, upperArmD: 0.1, forearmD: 0.084, wristD: 0.06,
    thighD: 0.18, kneeD: 0.108, calfD: 0.12, ankleD: 0.07, handW: 0.09,
    bust: 0, abduct: 0.06, foot: 1.05,
  },
};

/** Một vòng cắt ngang thân: elip bán trục a (ngang) và b (sâu), tâm lệch z, ở độ cao y. */
export interface Ring {
  y: number;
  a: number;
  b: number;
  z: number;
}

/** Hình thể đã đổi sang toạ độ gốc. Mọi bán kính là bán kính, không phải đường kính. */
export interface BodyShape {
  /** Nửa khoảng cách hai đầu vai. */
  shoulderHalf: number;
  chestA: number;
  chestB: number;
  waistA: number;
  waistB: number;
  hipA: number;
  hipB: number;
  neckR: number;
  upperArmR: number;
  forearmR: number;
  wristR: number;
  thighR: number;
  kneeR: number;
  calfR: number;
  ankleR: number;
  handW: number;
  abduct: number;
  /** Hệ số bề ngang giày (FallbackShoe). */
  limb: number;
  /** x của khớp vai (tâm đầu xương cánh tay). */
  armX: number;
  /** x của khớp hông. */
  legX: number;
  /** Mặt cắt thân từ đáy chậu tới chân cổ. */
  rings: readonly Ring[];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function buildShape(bodyType: BodyType): BodyShape {
  const m = MEASURES[bodyType];
  const k = 1 / BODY_HEIGHT_SCALE[bodyType];
  const S = (m.shoulder / 2) * k;
  const cA = (m.chestW / 2) * k;
  const cB = (m.chestD / 2) * k;
  const wA = (m.waistW / 2) * k;
  const wB = (m.waistD / 2) * k;
  const hA = (m.hipW / 2) * k;
  const hB = (m.hipD / 2) * k;
  const nR = (m.neckD / 2) * k;
  const bust = m.bust * k;
  const thighR = (m.thighD / 2) * k;
  // Mặt cắt thân. Hông rộng nhất ngang khớp hông, eo ở 1,06, ngực ở 1,25, vai dốc từ chân cổ xuống đầu vai.
  const rings: Ring[] = [
    { y: 0.8, a: hA * 0.55, b: hB * 0.6, z: 0 },
    { y: 0.83, a: hA * 0.9, b: hB * 0.92, z: -0.004 },
    { y: HIP_Y, a: hA, b: hB, z: -0.008 },
    { y: 0.92, a: lerp(hA, wA, 0.35), b: hB * 0.97, z: -0.008 },
    { y: 0.99, a: lerp(hA, wA, 0.78), b: lerp(hB, wB, 0.7), z: -0.004 },
    { y: WAIST_Y, a: wA, b: wB, z: 0 },
    { y: 1.16, a: lerp(wA, cA, 0.6), b: lerp(wB, cB, bust > 0 ? 0.4 : 0.7), z: 0.004 },
    { y: CHEST_Y, a: cA, b: cB, z: 0.008 + bust },
    { y: 1.32, a: cA * 1.01, b: cB * 0.95, z: 0.004 + bust * 0.4 },
    { y: 1.37, a: lerp(cA, S, 0.6), b: cB * 0.85, z: -0.004 },
    { y: 1.4, a: S - 0.03, b: cB * 0.72, z: -0.01 },
    { y: 1.425, a: S * 0.55, b: cB * 0.58, z: -0.014 },
    { y: 1.45, a: nR * 1.3, b: nR * 1.15, z: -0.012 },
    { y: 1.475, a: nR * 0.9, b: nR * 0.85, z: NECK_Z },
  ];
  return {
    shoulderHalf: S,
    chestA: cA,
    chestB: cB,
    waistA: wA,
    waistB: wB,
    hipA: hA,
    hipB: hB,
    neckR: nR,
    upperArmR: (m.upperArmD / 2) * k,
    forearmR: (m.forearmD / 2) * k,
    wristR: (m.wristD / 2) * k,
    thighR,
    kneeR: (m.kneeD / 2) * k,
    calfR: (m.calfD / 2) * k,
    ankleR: (m.ankleD / 2) * k,
    handW: m.handW * k,
    abduct: m.abduct,
    limb: m.foot,
    // Tâm khớp vai lùi vào trong đầu vai 3 cm; đùi chạm mép hông.
    armX: S - 0.03,
    legX: hA - thighR,
    rings,
  };
}

const BODY_SHAPES: Record<BodyType, BodyShape> = {
  slim: buildShape('slim'),
  regular: buildShape('regular'),
  broad: buildShape('broad'),
};

/** Hình thể theo kiểu dáng. Trả về cùng một đối tượng cho cùng kiểu dáng (dùng làm deps an toàn). */
export function bodyShapeOf(bodyType: BodyType): BodyShape {
  return BODY_SHAPES[bodyType];
}

/** Nội suy Hermite (Catmull-Rom không đều) mặt cắt tại độ cao y, để thân trơn thay vì gãy khúc. */
export function ringAt(rings: readonly Ring[], y: number): Ring {
  const n = rings.length;
  if (y <= rings[0].y) return rings[0];
  if (y >= rings[n - 1].y) return rings[n - 1];
  let i = 0;
  while (i < n - 2 && y > rings[i + 1].y) i++;
  const r0 = rings[i];
  const r1 = rings[i + 1];
  const h = r1.y - r0.y;
  const t = (y - r0.y) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const slope = (j: number, key: 'a' | 'b' | 'z') => {
    const p = rings[Math.max(0, j - 1)];
    const q = rings[Math.min(n - 1, j + 1)];
    return (q[key] - p[key]) / (q.y - p.y);
  };
  const interp = (key: 'a' | 'b' | 'z') =>
    h00 * r0[key] + h10 * h * slope(i, key) + h01 * r1[key] + h11 * h * slope(i + 1, key);
  return { y, a: Math.max(0.003, interp('a')), b: Math.max(0.003, interp('b')), z: interp('z') };
}

/** z của mặt trước (hoặc sau khi back = true) thân tại (x, y), cộng độ phồng inflate. */
export function surfaceZ(rings: readonly Ring[], x: number, y: number, inflate = 0, back = false): number {
  const r = ringAt(rings, y);
  const a = r.a + inflate;
  const b = r.b + inflate;
  const u = Math.min(1, Math.abs(x) / a);
  const dz = b * Math.sqrt(1 - u * u);
  return back ? r.z - dz : r.z + dz;
}

/**
 * Vị trí và góc xoay để một chi tiết phẳng (thẻ, nắp túi, huy hiệu) nằm áp lên mặt trước thân tại (x, y).
 * lift là khoảng hở ra ngoài bề mặt (m).
 */
export function onSurface(
  rings: readonly Ring[],
  x: number,
  y: number,
  lift: number,
  inflate = 0,
): { position: Vec3; rotation: Vec3 } {
  const e = 0.004;
  const z = surfaceZ(rings, x, y, inflate);
  const dzdx = (surfaceZ(rings, x + e, y, inflate) - surfaceZ(rings, x - e, y, inflate)) / (2 * e);
  const dzdy = (surfaceZ(rings, x, y + e, inflate) - surfaceZ(rings, x, y - e, inflate)) / (2 * e);
  return { position: [x, y, z + lift], rotation: [Math.atan(dzdy), Math.atan(-dzdx), 0] };
}

/**
 * Lưới vỏ nối các mặt cắt từ y0 tới y1. Góc theta đo từ phía trước (+Z) quay sang +X.
 * Đủ 2π thì vỏ kín vòng; nhỏ hơn thì là một dải (ví dụ nẹp áo sơ mi trước ngực).
 */
function buildLoft(
  rings: readonly Ring[],
  y0: number,
  y1: number,
  inflate: number,
  thetaStart: number,
  thetaLength: number,
  radial: number,
): THREE.BufferGeometry {
  const closed = thetaLength >= Math.PI * 2 - 1e-6;
  const cols = closed ? radial : radial + 1;
  const rows = Math.max(2, Math.ceil((y1 - y0) / 0.02) + 1);
  const positions: number[] = [];
  for (let i = 0; i < rows; i++) {
    const r = ringAt(rings, y0 + ((y1 - y0) * i) / (rows - 1));
    const a = r.a + inflate;
    const b = r.b + inflate;
    for (let j = 0; j < cols; j++) {
      const th = thetaStart + (thetaLength * j) / radial;
      positions.push(a * Math.sin(th), r.y, r.z + b * Math.cos(th));
    }
  }
  const index: number[] = [];
  const segs = radial;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const j1 = closed ? (j + 1) % cols : j + 1;
      const v00 = i * cols + j;
      const v01 = i * cols + j1;
      const v10 = (i + 1) * cols + j;
      const v11 = (i + 1) * cols + j1;
      // Pháp tuyến hướng ra ngoài: (theo theta) × (lên trên).
      index.push(v00, v01, v10, v01, v11, v10);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

export interface LoftProps {
  rings: readonly Ring[];
  y0: number;
  y1: number;
  color: string;
  /** Độ phồng ra ngoài bề mặt (m), cho lớp áo khoác, thắt lưng. */
  inflate?: number;
  thetaStart?: number;
  thetaLength?: number;
  radial?: number;
  metallic?: boolean;
  /** Vẽ hai mặt (váy hở gấu). */
  doubleSide?: boolean;
}

/** Một đoạn vỏ thân hoặc vỏ váy, bám theo các mặt cắt. */
export function Loft({
  rings,
  y0,
  y1,
  color,
  inflate = 0,
  thetaStart = -Math.PI,
  thetaLength = Math.PI * 2,
  radial = 24,
  metallic = false,
  doubleSide = false,
}: LoftProps) {
  const geometry = useOwned(
    () => buildLoft(rings, y0, y1, inflate, thetaStart, thetaLength, radial),
    [rings, y0, y1, inflate, thetaStart, thetaLength, radial],
  );
  const material = useOwned(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: metallic ? 0.3 : 0.7,
        metalness: metallic ? 0.7 : 0,
        side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      }),
    [color, metallic, doubleSide],
  );
  return <mesh geometry={geometry} material={material} castShadow />;
}

/**
 * Mặt cắt cho váy hoặc tà áo: từ topY xuống hông bám thân (cộng ease), dưới hông loe dần tới bottomY.
 * flare là tỉ lệ bán trục ở gấu so với hông.
 */
export function skirtRings(shape: BodyShape, topY: number, bottomY: number, flare: number, ease: number): Ring[] {
  const { hipA, hipB } = shape;
  const rings: Ring[] = [];
  const hip = ringAt(shape.rings, HIP_Y);
  rings.push({ y: bottomY, a: hipA * flare + ease, b: hipB * (1 + (flare - 1) * 1.2) + ease, z: 0 });
  rings.push({
    y: lerp(bottomY, HIP_Y, 0.55),
    a: hipA * lerp(flare, 1, 0.6) + ease,
    b: hipB * lerp(1 + (flare - 1) * 1.2, 1, 0.6) + ease,
    z: -0.004,
  });
  rings.push({ y: HIP_Y - 0.04, a: hipA + ease, b: hipB + ease, z: hip.z });
  for (const r of shape.rings) {
    if (r.y >= HIP_Y && r.y <= topY) rings.push({ y: r.y, a: r.a + ease, b: r.b + ease, z: r.z });
  }
  if (rings[rings.length - 1].y < topY) {
    const top = ringAt(shape.rings, topY);
    rings.push({ y: topY, a: top.a + ease, b: top.b + ease, z: top.z });
  }
  return rings;
}

export interface SurfaceLineProps {
  rings: readonly Ring[];
  /** Điểm đầu và cuối trên mặt thân, dạng [x, y]. */
  from: [number, number];
  to: [number, number];
  width: number;
  thick?: number;
  lift?: number;
  inflate?: number;
  steps?: number;
  /** true: chạy ở mặt sau thân. */
  back?: boolean;
  color: string;
  metallic?: boolean;
}

/**
 * Dải phẳng chạy áp theo mặt thân (nẹp áo, ve áo, cà vạt, khoá kéo, viền raglan).
 * Chia thành vài đoạn thẳng để bám độ cong của ngực.
 */
export function SurfaceLine({
  rings,
  from,
  to,
  width,
  thick = 0.006,
  lift = 0.003,
  inflate = 0,
  steps = 3,
  back = false,
  color,
  metallic,
}: SurfaceLineProps) {
  const points: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = lerp(from[0], to[0], t);
    const y = lerp(from[1], to[1], t);
    const z = surfaceZ(rings, x, y, inflate, back);
    points.push([x, y, back ? z - lift - thick / 2 : z + lift + thick / 2]);
  }
  return (
    <>
      {points.slice(1).map((p, i) => (
        <Segment key={i} from={points[i]} to={p} width={width} thick={thick} color={color} metallic={metallic} />
      ))}
    </>
  );
}

/** Hộp dẹt nối hai điểm: nghiêng trong mặt XY (xoay Z) rồi chúi theo Z (xoay X). */
export function Segment({
  from,
  to,
  width,
  thick,
  color,
  metallic,
}: {
  from: Vec3;
  to: Vec3;
  width: number;
  thick: number;
  color: string;
  metallic?: boolean;
}) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const planar = Math.hypot(dx, dy);
  // Dài thêm một chút để hai đoạn liền nhau không hở ở chỗ gập.
  const length = Math.hypot(planar, dz) + thick;
  const roll = Math.atan2(-dx, dy);
  // Sau khi xoay Z, trục +Y của hộp nằm theo hướng from→to trong mặt XY; chúi về +Z một góc atan(dz / planar).
  const pitch = Math.atan2(dz, planar);
  const mid: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  return (
    <group position={mid} rotation={[0, 0, roll]}>
      <group rotation={[pitch, 0, 0]}>
        <Box size={[width, length, thick]} color={color} metallic={metallic} />
      </group>
    </group>
  );
}
