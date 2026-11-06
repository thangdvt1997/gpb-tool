/**
 * Hàm thuần tính vị trí xe, xe máy và người đi bộ theo thời gian t.
 * Không dùng React, không giữ trạng thái: cùng (seed, t) luôn cho cùng kết quả.
 *
 * Tọa độ là mặt phẳng XZ cục bộ của CityView (mét). Mọi chuyển động dùng
 * thời gian tuyệt đối t (giây), không tích luỹ delta, nên không trôi khi tab ẩn.
 */
import * as THREE from 'three';

export type Pt = readonly [number, number];

/** Tuyến đường đã lấy mẫu đều theo chiều dài cung. */
export interface RouteTable {
  /** Tổng chiều dài một vòng (m). */
  readonly length: number;
  readonly xs: Float32Array;
  readonly zs: Float32Array;
  /** Quãng đường tích luỹ tại mỗi mẫu, cum[0] = 0. */
  readonly cum: Float32Array;
  /** Góc quay quanh trục Y để vật thể nhìn theo hướng đi (atan2(dx, dz)). */
  readonly heading: Float32Array;
}

export interface Pose {
  x: number;
  z: number;
  heading: number;
}

export interface VehicleSpec {
  route: number;
  /** Vị trí ban đầu theo tỉ lệ của một vòng, trong [0, 1). */
  offset: number;
  /** Tốc độ (m/s). */
  speed: number;
  /** Chỉ số màu trong bảng màu xe. */
  color: number;
  /** Đèn trước bật (dùng cho buổi tối). */
  lightsOn: boolean;
}

export interface WalkerSpec {
  route: number;
  offset: number;
  speed: number;
  /** Chỉ số màu áo. */
  shirt: number;
  /** Pha ban đầu của nhịp bước, trong [0, 2π). */
  phase: number;
}

/** Bộ sinh số giả ngẫu nhiên mulberry32, tái lập theo seed. */
export function createRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lấy mẫu đường cong CatmullRom đều theo chiều dài cung. */
export function buildRoute(points: readonly Pt[], closed = true, samples = 480): RouteTable {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    closed,
    'centripetal',
  );
  const pts = curve.getSpacedPoints(samples);
  const n = pts.length;
  const xs = new Float32Array(n);
  const zs = new Float32Array(n);
  const cum = new Float32Array(n);
  const heading = new Float32Array(n);

  let acc = 0;
  for (let i = 0; i < n; i++) {
    xs[i] = pts[i].x;
    zs[i] = pts[i].z;
    if (i > 0) acc += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
    cum[i] = acc;
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    heading[i] = Math.atan2(xs[b] - xs[a], zs[b] - zs[a]);
  }
  return { length: acc, xs, zs, cum, heading };
}

/** Vị trí và hướng tại quãng đường s (m) trên tuyến, quấn vòng khi s vượt chiều dài. Ghi vào out, không cấp phát. */
export function poseAt(route: RouteTable, s: number, out: Pose): Pose {
  const L = route.length;
  let u = s % L;
  if (u < 0) u += L;
  const cum = route.cum;
  // Tìm lo sao cho cum[lo] <= u < cum[hi].
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= u) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo];
  const f = span > 0 ? (u - cum[lo]) / span : 0;
  out.x = route.xs[lo] + (route.xs[hi] - route.xs[lo]) * f;
  out.z = route.zs[lo] + (route.zs[hi] - route.zs[lo]) * f;
  out.heading = route.heading[lo];
  return out;
}

function randomOffsetSpeed(rng: () => number, speedRange: readonly [number, number]) {
  return {
    offset: rng(),
    speed: speedRange[0] + (speedRange[1] - speedRange[0]) * rng(),
  };
}

/** Sinh danh sách xe cố định theo seed. routeCount là số tuyến xe có thể chọn. */
export function makeVehicles(
  seed: number,
  count: number,
  routeCount: number,
  speedRange: readonly [number, number],
  colorCount: number,
  nightLightChance = 0.7,
): VehicleSpec[] {
  const rng = createRng(seed);
  const out: VehicleSpec[] = [];
  for (let i = 0; i < count; i++) {
    const { offset, speed } = randomOffsetSpeed(rng, speedRange);
    out.push({
      route: Math.floor(rng() * routeCount) % routeCount,
      offset,
      speed,
      color: Math.floor(rng() * colorCount) % colorCount,
      lightsOn: rng() < nightLightChance,
    });
  }
  return out;
}

/** Vị trí xe tại thời điểm t (giây tuyệt đối). */
export function vehiclePose(spec: VehicleSpec, routes: readonly RouteTable[], t: number, out: Pose): Pose {
  const route = routes[spec.route];
  return poseAt(route, spec.offset * route.length + spec.speed * t, out);
}

/** Sinh danh sách người đi bộ hoặc xe máy chạy theo tuyến, theo seed. */
export function makeWalkers(
  seed: number,
  count: number,
  routeCount: number,
  speedRange: readonly [number, number],
  shirtCount: number,
): WalkerSpec[] {
  const rng = createRng(seed);
  const out: WalkerSpec[] = [];
  for (let i = 0; i < count; i++) {
    const { offset, speed } = randomOffsetSpeed(rng, speedRange);
    out.push({
      route: Math.floor(rng() * routeCount) % routeCount,
      offset,
      speed,
      shirt: Math.floor(rng() * shirtCount) % shirtCount,
      phase: rng() * Math.PI * 2,
    });
  }
  return out;
}

/** Vị trí người đi bộ tại thời điểm t. Nhịp bước được tính ở shader từ phase và speed. */
export function walkerPose(spec: WalkerSpec, routes: readonly RouteTable[], t: number, out: Pose): Pose {
  const route = routes[spec.route];
  return poseAt(route, spec.offset * route.length + spec.speed * t, out);
}

/** Tần số bước (rad/s) theo tốc độ đi, dùng cho hoạt ảnh chân. Khoảng 1.6 Hz ở 1.3 m/s. */
export function gaitOmega(speed: number): number {
  return 2 * Math.PI * 1.6 * (speed / 1.3);
}

export interface ScatterPoint {
  x: number;
  z: number;
  heading: number;
}

/** Rải điểm đứng yên trong hình chữ nhật quanh (cx, cz), hướng chọn từ hai góc gần nhau. */
export function makeScatter(
  seed: number,
  count: number,
  cx: number,
  cz: number,
  halfX: number,
  halfZ: number,
  baseHeading: number,
): ScatterPoint[] {
  const rng = createRng(seed);
  const out: ScatterPoint[] = [];
  for (let i = 0; i < count; i++) {
    const flip = rng() < 0.5 ? 0 : Math.PI;
    out.push({
      x: cx + (rng() * 2 - 1) * halfX,
      z: cz + (rng() * 2 - 1) * halfZ,
      heading: baseHeading + flip + (rng() * 2 - 1) * 0.25,
    });
  }
  return out;
}

/*
 * Kiểm thử đơn giản (ghi chú, không chạy):
 * 1. createRng(7)() luôn cho cùng một dãy số giữa các lần khởi tạo.
 * 2. Với route vuông cạnh 100 m, poseAt(route, 0) và poseAt(route, route.length) cho cùng (x, z).
 * 3. poseAt(route, -1) bằng poseAt(route, route.length - 1) (quấn vòng đúng).
 * 4. vehiclePose(spec, routes, t) với t tăng một lượng L/speed thì quay về đúng vị trí ban đầu.
 * 5. Gọi cùng (spec, t) hai lần cho cùng kết quả; không phụ thuộc thứ tự gọi.
 */
