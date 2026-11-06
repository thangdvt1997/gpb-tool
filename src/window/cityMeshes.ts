/**
 * Dựng các phần tĩnh của thành phố: mặt đất, toà nhà, cây, cột đèn, mây, bầu trời.
 * Mỗi hàm đẩy mọi geometry, material, texture đã tạo vào danh sách trash để dispose khi unmount.
 * Số draw call của từng nhóm được ghi chú ở đầu mỗi hàm.
 */
import * as THREE from 'three';
import {
  CANOPY,
  COUNTS,
  FAR_PLAZA,
  GROUND_Y,
  LAMP_XS,
  LAMP_Z,
  LOD,
  MIDRISE,
  NEAR_PLAZA,
  OPPOSITE_TOWER,
  PARK,
  RESIDENTIAL,
  ROAD,
  TREES,
  VIEW_EYE,
  type Block,
  type TreeSpec,
} from './cityLayout';
import { createCityMaterial, createSkyMaterial, type CityUniforms } from './cityShader';
import {
  makeCloudTexture,
  makeFacadeTexture,
  makeGrassTexture,
  makeLeafTexture,
  makeRoadTexture,
  makeStoneTexture,
} from './cityTextures';
import { createRng } from './traffic';

export type Trash = Array<{ dispose(): void }>;

const tmpM = new THREE.Matrix4();
const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();

/** Ghi ma trận cho thể hiện i: vị trí, cỡ và góc Euler (thứ tự YXZ). Không cấp phát đối tượng mới. */
export function setInstance(
  mesh: THREE.InstancedMesh,
  i: number,
  p: readonly [number, number, number],
  s: readonly [number, number, number],
  euler?: readonly [number, number, number],
): void {
  tmpP.set(p[0], p[1], p[2]);
  tmpS.set(s[0], s[1], s[2]);
  if (euler) {
    tmpE.set(euler[0], euler[1], euler[2], 'YXZ');
    tmpQ.setFromEuler(tmpE);
  } else {
    tmpQ.identity();
  }
  tmpM.compose(tmpP, tmpQ, tmpS);
  mesh.setMatrixAt(i, tmpM);
}

/** Đặt màu thể hiện i (tuyến tính, thang 0 đến 1). */
export function setInstanceColor(mesh: THREE.InstancedMesh, i: number, r: number, g: number, b: number): void {
  tmpC.setRGB(r, g, b);
  mesh.setColorAt(i, tmpC);
}

export interface CityTextures {
  stone: THREE.CanvasTexture;
  road: THREE.CanvasTexture;
  grass: THREE.CanvasTexture;
  leaf: THREE.CanvasTexture;
  cloud: THREE.CanvasTexture;
  cream: THREE.CanvasTexture;
}

export function makeCityTextures(trash: Trash): CityTextures {
  const tex: CityTextures = {
    stone: makeStoneTexture(),
    road: makeRoadTexture(),
    grass: makeGrassTexture(),
    leaf: makeLeafTexture(),
    cloud: makeCloudTexture(),
    cream: makeFacadeTexture({ body: '#efe6d6', glass: '#56697a', cols: 14, rows: 7, litAmount: 0.12, seed: 9 }),
  };
  for (const t of Object.values(tex)) trash.push(t);
  return tex;
}

/** Mặt phẳng nằm ngang, UV đo từ góc (x0, z0) theo mét chia cho kích thước ô tile. */
function tiledPlane(x0: number, x1: number, z0: number, z1: number, tileX: number, tileY: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - x0) / tileX, (pos.getZ(i) - z0) / tileY);
  }
  uv.needsUpdate = true;
  return g;
}

/**
 * Mặt đất: nền, vỉa hè gần, đường nhựa có vạch, dải phân cách, quảng trường xa, công viên, lề.
 * Draw call: 9.
 */
export function buildGround(shared: CityUniforms, tex: CityTextures, trash: Trash): THREE.Group {
  const group = new THREE.Group();
  group.position.y = GROUND_Y;
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    group.add(m);
    trash.push(geo, mat);
  };

  const base = new THREE.PlaneGeometry(1200, 1200);
  base.rotateX(-Math.PI / 2);
  base.translate(0, 0, -300);
  add(base, createCityMaterial(shared, { color: '#6a6e73' }), 0);

  add(
    tiledPlane(-200, 200, NEAR_PLAZA.z1, NEAR_PLAZA.z0, 8, 8),
    createCityMaterial(shared, { map: tex.stone, color: '#ffffff' }),
    0.05,
  );
  add(
    tiledPlane(-200, 200, ROAD.z1, ROAD.z0, 20, 14),
    createCityMaterial(shared, { map: tex.road, color: '#ffffff' }),
    0.1,
  );
  add(
    tiledPlane(-200, 200, ROAD.median - 0.8, ROAD.median + 0.8, 6, 6),
    createCityMaterial(shared, { map: tex.grass, color: '#ffffff' }),
    0.15,
  );
  add(
    tiledPlane(-200, 200, FAR_PLAZA.z1, FAR_PLAZA.z0, 8, 8),
    createCityMaterial(shared, { map: tex.stone, color: '#ffffff' }),
    0.05,
  );
  add(
    tiledPlane(PARK.x0, PARK.x1, PARK.z1, PARK.z0, 6, 6),
    createCityMaterial(shared, { map: tex.grass, color: '#ffffff' }),
    0.05,
  );
  add(tiledPlane(60, 130, -96.5, -94.5, 8, 8), createCityMaterial(shared, { map: tex.stone, color: '#d8d2c4' }), 0.08);

  // Hai lề bê tông, cao 18 cm.
  const kerbMat = createCityMaterial(shared, { color: '#c9c7c0' });
  const kerbGeo = new THREE.BoxGeometry(400, 0.18, 0.5);
  const kerbNear = new THREE.Mesh(kerbGeo, kerbMat);
  kerbNear.position.set(0, 0.09, -21.5);
  const kerbFar = new THREE.Mesh(kerbGeo, kerbMat);
  kerbFar.position.set(0, 0.09, -36.25);
  group.add(kerbNear, kerbFar);
  trash.push(kerbGeo, kerbMat);
  return group;
}

/**
 * Toà nhà kính đối diện: thân, lưới ô kính (InstancedMesh), khung thanh đứng và ngang, mái kính trước sảnh.
 * Draw call: 4.
 */
export function buildOppositeTower(shared: CityUniforms, trash: Trash): THREE.Group {
  const T = OPPOSITE_TOWER;
  const group = new THREE.Group();
  const cols = 14;
  const rows = Math.round(T.h / 3.6);
  const cw = T.w / cols;
  const rh = T.h / rows;
  const zFront = T.z + T.d / 2;

  const bodyGeo = new THREE.BoxGeometry(T.w, T.h, T.d);
  const bodyMat = createCityMaterial(shared, { color: '#4a5b6b' });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(T.x, GROUND_Y + T.h / 2, T.z);
  group.add(body);
  trash.push(bodyGeo, bodyMat);

  // Ô kính: mỗi ô một màu xanh xám hơi khác nhau.
  const rng = createRng(77);
  const paneGeo = new THREE.PlaneGeometry(cw * 0.9, rh * 0.82);
  const paneMat = createCityMaterial(shared, { color: '#ffffff' });
  const panes = new THREE.InstancedMesh(paneGeo, paneMat, cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      setInstance(panes, i, [T.x - T.w / 2 + (c + 0.5) * cw, GROUND_Y + (r + 0.5) * rh, zFront + 0.02], [1, 1, 1]);
      const shade = 0.2 + rng() * 0.08;
      setInstanceColor(panes, i, shade * 0.8, shade * 0.95, shade * 1.15);
    }
  }
  panes.instanceMatrix.needsUpdate = true;
  group.add(panes);
  trash.push(paneGeo, paneMat, panes);

  // Thanh đứng và thanh ngang (lưới khung), một InstancedMesh dùng chung hộp đơn vị.
  const frameGeo = new THREE.BoxGeometry(1, 1, 1);
  const frameMat = createCityMaterial(shared, { color: '#ffffff' });
  const frame = new THREE.InstancedMesh(frameGeo, frameMat, cols + 1 + rows + 1);
  for (let c = 0; c <= cols; c++) {
    setInstance(frame, c, [T.x - T.w / 2 + c * cw, GROUND_Y + T.h / 2, zFront + 0.12], [0.25, T.h, 0.45]);
    setInstanceColor(frame, c, 0.16, 0.19, 0.22);
  }
  for (let r = 0; r <= rows; r++) {
    const i = cols + 1 + r;
    setInstance(frame, i, [T.x, GROUND_Y + r * rh, zFront + 0.1], [T.w, 0.5, 0.3]);
    setInstanceColor(frame, i, 0.56, 0.6, 0.64);
  }
  frame.instanceMatrix.needsUpdate = true;
  group.add(frame);
  trash.push(frameGeo, frameMat, frame);

  // Mái kính trước sảnh: trong suốt, không ghi độ sâu.
  const canopyGeo = new THREE.BoxGeometry(CANOPY.w, 0.4, CANOPY.d);
  const canopyMat = createCityMaterial(shared, {
    color: '#a9cbdc',
    opacity: 0.42,
    transparent: true,
    depthWrite: false,
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.set(CANOPY.x, GROUND_Y + CANOPY.height, CANOPY.z);
  group.add(canopy);
  trash.push(canopyGeo, canopyMat);
  return group;
}

/** Chung cư kem, mặt có lưới cửa sổ. Draw call: 1. */
export function buildMidrise(shared: CityUniforms, tex: CityTextures, trash: Trash): THREE.Mesh {
  const geo = new THREE.BoxGeometry(MIDRISE.w, MIDRISE.h, MIDRISE.d);
  const mat = createCityMaterial(shared, { map: tex.cream, color: '#ffffff' });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(MIDRISE.x, GROUND_Y + MIDRISE.h / 2, MIDRISE.z);
  trash.push(geo, mat);
  return mesh;
}

const BALCONY_FLOOR = 3.2;

/** Số ban công của một toà nhà ở mức chi tiết gần. */
function balconyCount(b: Block): { floors: number; cols: number } {
  return { floors: Math.max(0, Math.floor(b.h / BALCONY_FLOOR) - 1), cols: Math.max(2, Math.floor(b.w / 3.4)) };
}

/**
 * Chung cư cao tầng kem hồng ở xa. Thân là InstancedMesh (draw call 1).
 * Ban công chỉ dựng cho các toà đủ gần (LOD gần), draw call 1.
 */
export function buildResidential(
  shared: CityUniforms,
  trash: Trash,
): { bodies: THREE.InstancedMesh; balconies: THREE.InstancedMesh | null } {
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const bodyMat = createCityMaterial(shared, { color: '#ffffff' });
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, RESIDENTIAL.length);
  const palette: Array<[number, number, number]> = [
    [0.9, 0.7, 0.6],
    [0.86, 0.64, 0.56],
    [0.92, 0.74, 0.67],
  ];
  RESIDENTIAL.forEach((b, i) => {
    setInstance(bodies, i, [b.x, GROUND_Y + b.h / 2, b.z], [b.w, b.h, b.d]);
    const p = palette[i % palette.length];
    setInstanceColor(bodies, i, p[0], p[1], p[2]);
  });
  bodies.instanceMatrix.needsUpdate = true;
  trash.push(bodyGeo, bodyMat, bodies);

  // Đếm ban công của các toà gần để cấp phát đúng một lần.
  const near = RESIDENTIAL.filter((b) => dist(VIEW_EYE, [b.x, GROUND_Y + b.h / 2, b.z]) < LOD.balconyFar);
  let total = 0;
  for (const b of near) {
    const n = balconyCount(b);
    total += n.floors * n.cols;
  }
  if (total === 0) return { bodies, balconies: null };

  const balGeo = new THREE.BoxGeometry(1, 1, 1);
  const balMat = createCityMaterial(shared, { color: '#e6c3b6' });
  const balconies = new THREE.InstancedMesh(balGeo, balMat, total);
  let k = 0;
  for (const b of near) {
    const { floors, cols } = balconyCount(b);
    const bw = (b.w / cols) * 0.85;
    for (let f = 1; f <= floors; f++) {
      for (let c = 0; c < cols; c++) {
        const x = b.x - b.w / 2 + (c + 0.5) * (b.w / cols);
        setInstance(balconies, k, [x, GROUND_Y + f * BALCONY_FLOOR + 0.5, b.z + b.d / 2 + 0.6], [bw, 1.0, 1.2]);
        k++;
      }
    }
  }
  balconies.instanceMatrix.needsUpdate = true;
  trash.push(balGeo, balMat, balconies);
  return { bodies, balconies };
}

function dist(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Các toà nhà xa phía sau, mờ theo sương. Draw call: 1.
 */
export function buildSkyline(shared: CityUniforms, trash: Trash): THREE.InstancedMesh {
  const rng = createRng(909);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = createCityMaterial(shared, { color: '#ffffff' });
  const mesh = new THREE.InstancedMesh(geo, mat, COUNTS.skyline);
  for (let i = 0; i < COUNTS.skyline; i++) {
    const w = 20 + rng() * 30;
    const d = 20 + rng() * 20;
    const h = 40 + rng() * 110;
    const x = -420 + rng() * 740;
    const z = -300 - rng() * 180;
    setInstance(mesh, i, [x, GROUND_Y + h / 2, z], [w, h, d]);
    const v = 0.5 + rng() * 0.1;
    setInstanceColor(mesh, i, v * 0.95, v, v * 1.08);
  }
  mesh.instanceMatrix.needsUpdate = true;
  trash.push(geo, mat, mesh);
  return mesh;
}

/** Trục đèn đường dọc lề xa. Draw call: 1. */
export function buildLamps(shared: CityUniforms, trash: Trash): THREE.InstancedMesh {
  const geo = new THREE.BoxGeometry(0.22, 9, 0.22);
  const mat = createCityMaterial(shared, { color: '#7d848c' });
  const mesh = new THREE.InstancedMesh(geo, mat, LAMP_XS.length);
  LAMP_XS.forEach((x, i) => setInstance(mesh, i, [x, GROUND_Y + 4.5, LAMP_Z], [1, 1, 1]));
  mesh.instanceMatrix.needsUpdate = true;
  trash.push(geo, mat, mesh);
  return mesh;
}

/** Dải lá thuôn, gốc ở y = 0, dài 3 m. */
function leafGeometry(): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(0.9, 3.0, 1, 4);
  g.translate(0, 1.5, 0);
  return g;
}

export interface TreeParts {
  trunks: THREE.InstancedMesh;
  leavesNear: THREE.InstancedMesh;
  leavesFar: THREE.InstancedMesh | null;
}

interface FrondPlan {
  tree: TreeSpec;
  nearCount: number;
  farCount: number;
}

/**
 * Cây: thân (một InstancedMesh), lá gần (một InstancedMesh, nhiều lá), lá xa (một InstancedMesh, ít lá).
 * Cây nằm trong LOD.treeFar dùng đủ lá. Lá lay theo gió qua shader (sway). Tổng cây dưới 40.
 * Draw call: 3.
 */
export function buildTrees(shared: CityUniforms, tex: CityTextures, trash: Trash): TreeParts {
  const rng = createRng(4242);
  const plans: FrondPlan[] = TREES.map((tree) => {
    const palm = tree.kind === 'palm';
    return { tree, nearCount: palm ? 12 : 14, farCount: palm ? 4 : 5 };
  });
  const nearPlans = plans.filter((p) => dist(VIEW_EYE, [p.tree.x, GROUND_Y + p.tree.height, p.tree.z]) <= LOD.treeFar);
  const farPlans = plans.filter((p) => dist(VIEW_EYE, [p.tree.x, GROUND_Y + p.tree.height, p.tree.z]) > LOD.treeFar);
  const sum = (arr: FrondPlan[], key: 'nearCount' | 'farCount') => arr.reduce((s, p) => s + p[key], 0);

  // Thân: dùng chung một InstancedMesh cho mọi cây.
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = createCityMaterial(shared, { color: '#7a6650' });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES.length);
  TREES.forEach((t, i) => setInstance(trunks, i, [t.x, GROUND_Y, t.z], [1, t.height, 1]));
  trunks.instanceMatrix.needsUpdate = true;
  trash.push(trunkGeo, trunkMat, trunks);

  // Lá gần và lá xa dùng chung vật liệu lá, chỉ khác số lượng.
  const leafGeo = leafGeometry();
  const leafMat = createCityMaterial(shared, {
    map: tex.leaf,
    alphaTest: 0.5,
    sway: 1,
    doubleSide: true,
    color: '#ffffff',
  });
  const buildLeaves = (list: FrondPlan[], useNear: boolean): THREE.InstancedMesh => {
    const count = sum(list, useNear ? 'nearCount' : 'farCount');
    const mesh = new THREE.InstancedMesh(leafGeo, leafMat, count);
    let k = 0;
    for (const p of list) {
      const palm = p.tree.kind === 'palm';
      const n = useNear ? p.nearCount : p.farCount;
      const crownY = GROUND_Y + p.tree.height;
      for (let j = 0; j < n; j++) {
        const az = (j / n) * Math.PI * 2 + rng() * 0.4;
        const elev = palm ? 0.15 + rng() * 0.45 : 0.2 + rng() * 0.9;
        const len = palm ? 3.2 + rng() * 1.0 : 2.2 + rng() * 0.8;
        setInstance(mesh, k, [p.tree.x, crownY, p.tree.z], [1, len / 3.0, 1], [Math.PI / 2 - elev, az, 0]);
        const g = palm ? 0.9 + rng() * 0.15 : 0.7 + rng() * 0.15;
        setInstanceColor(mesh, k, g * 0.8, g, g * 0.6);
        k++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  };
  const leavesNear = buildLeaves(nearPlans, true);
  const leavesFar = farPlans.length > 0 ? buildLeaves(farPlans, false) : null;
  trash.push(leafGeo, leafMat, leavesNear);
  if (leavesFar) trash.push(leavesFar);
  return { trunks, leavesNear, leavesFar };
}

export interface CloudSpec {
  x0: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  /** Tốc độ trôi (m/s) về phía -X, dùng trong vòng cập nhật có chu kỳ. */
  speed: number;
}

/** Mây mềm trôi chậm. Draw call: 1. Trả về mô tả để cập nhật vị trí theo thời gian. */
export function buildClouds(
  shared: CityUniforms,
  tex: CityTextures,
  trash: Trash,
): { mesh: THREE.InstancedMesh; specs: CloudSpec[] } {
  const rng = createRng(2026);
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = createCityMaterial(shared, {
    map: tex.cloud,
    transparent: true,
    depthWrite: false,
    opacity: 0.9,
    doubleSide: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, COUNTS.clouds);
  const specs: CloudSpec[] = [];
  for (let i = 0; i < COUNTS.clouds; i++) {
    const spec: CloudSpec = {
      x0: -400 + rng() * 800,
      y: GROUND_Y + 110 + rng() * 60,
      z: -380 - rng() * 260,
      sx: 120 + rng() * 120,
      sy: 40 + rng() * 25,
      speed: 0.4 + rng() * 0.8,
    };
    specs.push(spec);
    setInstance(mesh, i, [spec.x0, spec.y, spec.z], [spec.sx, spec.sy, 1]);
  }
  mesh.instanceMatrix.needsUpdate = true;
  trash.push(geo, mat, mesh);
  return { mesh, specs };
}

/**
 * Bầu trời: một khối cầu lớn, shader gradient và quầng mặt trời. Draw call: 1.
 * Bán kính 900 m, cần camera.far đủ lớn (xem ghi chú trong báo cáo tích hợp).
 */
export function buildSky(trash: Trash): { mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
  const geo = new THREE.SphereGeometry(900, 24, 16);
  const material = createSkyMaterial();
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  trash.push(geo, material);
  return { mesh, material };
}
