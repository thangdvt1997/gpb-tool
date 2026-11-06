/**
 * Đối tượng chuyển động: ô tô, xe máy, người đi bộ.
 * Mỗi nhóm là một InstancedMesh, hình học gộp từ nhiều khối (một draw call cho cả nhóm).
 * - Ô tô: 1 draw cho thân và cabin, 1 draw cho đèn trước. Tổng 2.
 * - Xe máy: 1 draw.
 * - Người: 1 draw cho thân và chân (shader đưa chân đung), 1 draw cho đầu. Tổng 2.
 * Vị trí cập nhật từ thời gian tuyệt đối t, không tích luỹ delta.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COUNTS, GROUND_Y, ROUTES, STANDING_BIKE_GROUPS, STANDING_BIKE_SPLIT } from './cityLayout';
import { createCityMaterial, type CityUniforms } from './cityShader';
import { setInstance, type Trash } from './cityMeshes';
import {
  buildRoute,
  gaitOmega,
  makeScatter,
  makeVehicles,
  makeWalkers,
  poseAt,
  vehiclePose,
  type Pt,
  type Pose,
  type RouteTable,
  type VehicleSpec,
  type WalkerSpec,
} from './traffic';

interface Part {
  geo: THREE.BufferGeometry;
  m: THREE.Matrix4;
  rgb: [number, number, number];
  /** +1 chân trái, -1 chân phải, 0 phần thân. */
  leg?: number;
}

function xf(p: [number, number, number], r: [number, number, number] = [0, 0, 0]): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2]));
  return new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), q, new THREE.Vector3(1, 1, 1));
}

/** Gộp nhiều khối thành một hình học, mỗi đỉnh mang màu và thuộc tính chân. Giải phóng hình học gốc. */
function bake(parts: Part[]): THREE.BufferGeometry {
  const list = parts.map((p) => {
    const g = p.geo.toNonIndexed();
    g.applyMatrix4(p.m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const leg = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      col[i * 3] = p.rgb[0];
      col[i * 3 + 1] = p.rgb[1];
      col[i * 3 + 2] = p.rgb[2];
      leg[i] = p.leg ?? 0;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aLeg', new THREE.BufferAttribute(leg, 1));
    return g;
  });
  for (const p of parts) p.geo.dispose();
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  if (!merged) throw new Error('Không gộp được hình học đối tượng chuyển động');
  return merged;
}

function wheel(x: number, z: number): Part {
  return {
    geo: new THREE.CylinderGeometry(0.36, 0.36, 0.24, 10),
    m: xf([x, 0.36, z], [0, 0, Math.PI / 2]),
    rgb: [0.06, 0.06, 0.07],
  };
}

function bikeWheel(z: number): Part {
  return {
    geo: new THREE.CylinderGeometry(0.32, 0.32, 0.1, 8),
    m: xf([0, 0.32, z], [0, 0, Math.PI / 2]),
    rgb: [0.08, 0.08, 0.09],
  };
}

const CAR_COLORS = ['#e8e8ec', '#2d3e5e', '#8f1f22', '#5a6470', '#c8a23a', '#1f5a3c', '#eeeeee', '#262626'];
const SHIRT_COLORS = ['#d64545', '#3a6fb0', '#e0b640', '#4aa36a', '#7b4fb3', '#f0f0f0', '#2b2b2b', '#e07a3a'];
const BIKE_COLORS = ['#c0392b', '#2e86c1', '#1c1c1c', '#f2f2f2', '#27ae60', '#e67e22'];

export interface ActorSet {
  carRoutes: RouteTable[];
  carSpecs: VehicleSpec[];
  cars: THREE.InstancedMesh;
  headlights: THREE.InstancedMesh;
  bikeRoutes: RouteTable[];
  bikeSpecs: VehicleSpec[];
  bikes: THREE.InstancedMesh;
  /** Số xe máy đứng yên, nằm ở đầu mảng instance. Các xe sau đó là xe đang chạy. */
  bikeStanding: number;
  walkRoutes: RouteTable[];
  walkSpecs: WalkerSpec[];
  torsos: THREE.InstancedMesh;
  heads: THREE.InstancedMesh;
  /** Khung bao cho từng nhóm, dùng để frustum culling. */
  bounds: THREE.Sphere[];
}

/** Bao cầu quanh một tuyến (tính từ các điểm điều khiển), dùng làm boundingSphere cho InstancedMesh chuyển động. */
function routeSphere(points: readonly Pt[]): THREE.Sphere {
  let cx = 0;
  let cz = 0;
  for (const [x, z] of points) {
    cx += x;
    cz += z;
  }
  cx /= points.length;
  cz /= points.length;
  let r = 0;
  for (const [x, z] of points) r = Math.max(r, Math.hypot(x - cx, z - cz));
  return new THREE.Sphere(new THREE.Vector3(cx, GROUND_Y + 1, cz), r + 4);
}

function setHex(mesh: THREE.InstancedMesh, i: number, hex: string): void {
  mesh.setColorAt(i, new THREE.Color(hex));
}

export function buildActors(shared: CityUniforms, trash: Trash): ActorSet {
  // Ô tô: thân và cabin, bánh xe.
  const carGeo = bake([
    { geo: new THREE.BoxGeometry(1.9, 0.75, 4.4), m: xf([0, 0.82, 0]), rgb: [1, 1, 1] },
    { geo: new THREE.BoxGeometry(1.65, 0.62, 2.2), m: xf([0, 1.48, -0.2]), rgb: [0.12, 0.15, 0.18] },
    wheel(-0.9, 1.35),
    wheel(0.9, 1.35),
    wheel(-0.9, -1.35),
    wheel(0.9, -1.35),
  ]);
  const carMat = createCityMaterial(shared, { vertexColors: true });
  const cars = new THREE.InstancedMesh(carGeo, carMat, COUNTS.cars);
  const carRoutes = [buildRoute(ROUTES.cars)];
  const carSpecs = makeVehicles(31, COUNTS.cars, 1, [7, 11], CAR_COLORS.length, 0.7);
  carSpecs.forEach((s, i) => setHex(cars, i, CAR_COLORS[s.color]));

  // Đèn trước: hai hộp nhỏ mỗi xe, chỉ hiện khi trời tối.
  const lampGeo = new THREE.BoxGeometry(0.36, 0.16, 0.05);
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fff1c4' });
  const headlights = new THREE.InstancedMesh(lampGeo, lampMat, COUNTS.cars * 2);
  trash.push(carGeo, carMat, cars, lampGeo, lampMat, headlights);

  // Xe máy: thân, yên, tay lái, hai bánh. Gồm xe đứng và xe chạy chậm.
  const bikeGeo = bake([
    { geo: new THREE.BoxGeometry(0.3, 0.42, 1.25), m: xf([0, 0.62, 0.05]), rgb: [1, 1, 1] },
    { geo: new THREE.BoxGeometry(0.26, 0.1, 0.5), m: xf([0, 0.9, -0.22]), rgb: [0.12, 0.12, 0.13] },
    { geo: new THREE.BoxGeometry(0.5, 0.05, 0.05), m: xf([0, 1.02, 0.58]), rgb: [0.12, 0.12, 0.13] },
    bikeWheel(0.62),
    bikeWheel(-0.62),
  ]);
  const bikeMat = createCityMaterial(shared, { vertexColors: true });
  const bikeTotal = COUNTS.bikesStanding + COUNTS.bikesMoving;
  const bikes = new THREE.InstancedMesh(bikeGeo, bikeMat, bikeTotal);
  const bikeRoutes = [buildRoute(ROUTES.bikes)];
  const bikeSpecs = makeVehicles(77, COUNTS.bikesMoving, 1, [4.5, 6.5], BIKE_COLORS.length, 0);
  let bi = 0;
  const standingTotal = STANDING_BIKE_SPLIT[0] + STANDING_BIKE_SPLIT[1];
  STANDING_BIKE_GROUPS.forEach((g, gi) => {
    const n = STANDING_BIKE_SPLIT[gi];
    const pts = makeScatter(900 + gi, n, g.cx, g.cz, g.hx, g.hz, g.heading);
    for (const p of pts) {
      setInstance(bikes, bi, [p.x, GROUND_Y, p.z], [1, 1, 1], [0, p.heading, 0]);
      setHex(bikes, bi, BIKE_COLORS[bi % BIKE_COLORS.length]);
      bi++;
    }
  });
  bikeSpecs.forEach((s, k) => setHex(bikes, standingTotal + k, BIKE_COLORS[s.color]));
  trash.push(bikeGeo, bikeMat, bikes);

  // Người đi bộ: thân và chân có thể đung, đầu tách riêng nhưng dùng chung ma trận.
  const bodyGeo = bake([
    { geo: new THREE.CylinderGeometry(0.2, 0.22, 0.7, 6), m: xf([0, 1.2, 0]), rgb: [1, 1, 1], leg: 0 },
    { geo: new THREE.BoxGeometry(0.16, 0.85, 0.16), m: xf([0.1, 0.425, 0]), rgb: [0.3, 0.3, 0.34], leg: 1 },
    { geo: new THREE.BoxGeometry(0.16, 0.85, 0.16), m: xf([-0.1, 0.425, 0]), rgb: [0.3, 0.3, 0.34], leg: -1 },
  ]);
  const headGeo = bake([{ geo: new THREE.SphereGeometry(0.13, 8, 6), m: xf([0, 1.62, 0]), rgb: [1, 1, 1], leg: 0 }]);

  const walkCount = COUNTS.walkersNear + COUNTS.walkersFar;
  const walkRoutes = [buildRoute(ROUTES.walkersNear), buildRoute(ROUTES.walkersFar)];
  const walkSpecs: WalkerSpec[] = [];
  const near = makeWalkers(13, COUNTS.walkersNear, 1, [1.1, 1.5], SHIRT_COLORS.length);
  const far = makeWalkers(17, COUNTS.walkersFar, 1, [1.1, 1.5], SHIRT_COLORS.length);
  for (const w of near) walkSpecs.push(w);
  for (const w of far) {
    w.route = 1;
    walkSpecs.push(w);
  }

  // Thuộc tính theo thể hiện: pha và tần số bước, ghi một lần khi dựng.
  const phase = new Float32Array(walkCount);
  const omega = new Float32Array(walkCount);
  walkSpecs.forEach((w, i) => {
    phase[i] = w.phase;
    omega[i] = gaitOmega(w.speed);
  });
  const phaseAttr = new THREE.InstancedBufferAttribute(phase, 1);
  const omegaAttr = new THREE.InstancedBufferAttribute(omega, 1);
  bodyGeo.setAttribute('aPhase', phaseAttr);
  bodyGeo.setAttribute('aOmega', omegaAttr);
  headGeo.setAttribute('aPhase', phaseAttr);
  headGeo.setAttribute('aOmega', omegaAttr);

  const torsoMat = createCityMaterial(shared, { gait: true, vertexColors: true });
  const torsos = new THREE.InstancedMesh(bodyGeo, torsoMat, walkCount);
  walkSpecs.forEach((w, i) => setHex(torsos, i, SHIRT_COLORS[w.shirt]));
  const headMat = createCityMaterial(shared, { gait: true, color: '#d9a67e' });
  const heads = new THREE.InstancedMesh(headGeo, headMat, walkCount);
  // Đầu dùng chung ma trận với thân (cùng vị trí và hướng).
  heads.instanceMatrix = torsos.instanceMatrix;
  trash.push(bodyGeo, torsoMat, torsos, headGeo, headMat, heads);

  const bounds = [routeSphere(ROUTES.cars), routeSphere(ROUTES.bikes), routeSphere(ROUTES.walkersNear), routeSphere(ROUTES.walkersFar)];
  cars.boundingSphere = bounds[0];
  headlights.boundingSphere = bounds[0];
  bikes.boundingSphere = bounds[1];
  torsos.boundingSphere = bounds[2];
  heads.boundingSphere = bounds[2];

  cars.instanceMatrix.needsUpdate = true;
  if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
  bikes.instanceMatrix.needsUpdate = true;
  if (bikes.instanceColor) bikes.instanceColor.needsUpdate = true;
  torsos.instanceMatrix.needsUpdate = true;
  if (torsos.instanceColor) torsos.instanceColor.needsUpdate = true;

  return {
    carRoutes,
    carSpecs,
    cars,
    headlights,
    bikeRoutes,
    bikeSpecs,
    bikes,
    bikeStanding: standingTotal,
    walkRoutes,
    walkSpecs,
    torsos,
    heads,
    bounds,
  };
}

const tmpPose: Pose = { x: 0, z: 0, heading: 0 };

/**
 * Cập nhật ma trận của xe, đèn và người tại thời điểm t.
 * lightsAmount: 0 là ban ngày (ẩn đèn), lớn hơn 0 là bật đèn trước.
 * Xe máy đứng yên không được cập nhật lại.
 */
export function updateActors(a: ActorSet, t: number, lightsAmount: number): void {
  const lightsOn = lightsAmount > 0.01;
  a.headlights.visible = lightsOn;

  for (let i = 0; i < a.carSpecs.length; i++) {
    const spec = a.carSpecs[i];
    vehiclePose(spec, a.carRoutes, t, tmpPose);
    const h = tmpPose.heading;
    setInstance(a.cars, i, [tmpPose.x, GROUND_Y, tmpPose.z], [1, 1, 1], [0, h, 0]);

    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const rx = Math.cos(h);
    const rz = -Math.sin(h);
    const on = lightsOn && spec.lightsOn;
    const s = on ? 1 : 0;
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? -1 : 1;
      const px = tmpPose.x + fx * 2.22 + rx * sg * 0.62;
      const pz = tmpPose.z + fz * 2.22 + rz * sg * 0.62;
      setInstance(a.headlights, i * 2 + side, [px, GROUND_Y + 0.8, pz], [s, s, s], [0, h, 0]);
    }
  }
  a.cars.instanceMatrix.needsUpdate = true;
  a.headlights.instanceMatrix.needsUpdate = true;

  for (let k = 0; k < a.bikeSpecs.length; k++) {
    vehiclePose(a.bikeSpecs[k], a.bikeRoutes, t, tmpPose);
    setInstance(a.bikes, a.bikeStanding + k, [tmpPose.x, GROUND_Y, tmpPose.z], [1, 1, 1], [0, tmpPose.heading, 0]);
  }
  if (a.bikeSpecs.length > 0) a.bikes.instanceMatrix.needsUpdate = true;

  for (let j = 0; j < a.walkSpecs.length; j++) {
    const w = a.walkSpecs[j];
    const route = a.walkRoutes[w.route];
    const s = w.offset * route.length + w.speed * t;
    poseAt(route, s, tmpPose);
    setInstance(a.torsos, j, [tmpPose.x, GROUND_Y, tmpPose.z], [1, 1, 1], [0, tmpPose.heading, 0]);
  }
  a.torsos.instanceMatrix.needsUpdate = true;
}
