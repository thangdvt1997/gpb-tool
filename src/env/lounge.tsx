// Khu lounge và các phòng phụ: LoungeDetail (sofa chữ L, bàn trà, thảm, cây lớn, kệ sách, tranh),
// PantryDetail (quầy pantry, máy pha cà phê), QuietRoomDetail (phòng nghỉ yên tĩnh),
// HealthRoomDetail (phòng y tế, mẹ và bé), KudosBoardDetail (bảng vinh danh).
// Gốc = tâm khu trên sàn. Các độ cao là tuyệt đối tính từ sàn. Bảng vinh danh có tâm cao 1,4 m và quay về +z trước khi áp rotationY.
// Lounge được thiết kế cho khoảng 11,4 x 16,3 m. Đồ đạc tĩnh mỗi cụm gộp một mesh màu đỉnh (src/scene/entry/merge.ts).

import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  canvasTexture,
  DecorBase,
  Disposable,
  FloorRect,
  fitFont,
  floorRect,
  Inst,
  instanced,
  makeRng,
  mergedMesh,
  pick,
  UNIT_BOX,
  UNIT_CYL,
  UNIT_PLANE,
  UNIT_SPHERE,
  useDisposeOnChange,
} from './shared';

const SOFA = '#3b5b7a';
const CUSHIONS = ['#f2c14e', '#e76f51', '#2a9d8f'];
const WOOD = '#8a5a3c';
const METAL_DARK = '#2d3748';
const POT_WHITE = '#e9e4da';
const LEAF = ['#3f9b4f', '#4caf62', '#2f8a48'];
const BOOKS = ['#2f6fdb', '#c0392b', '#2d9c6e', '#e6b422', '#6c5ce7', '#f8fafc', '#1f2937'];
const ART_BG = ['#fde68a', '#bae6fd', '#fbcfe8'];
const ART_COLS = ['#f97316', '#0ea5e9', '#84cc16', '#e11d48', '#a855f7', '#facc15'];

interface Built {
  meshes: THREE.Mesh[];
  owned: Disposable[];
}

/** Tranh trừu tượng: nền màu nhạt với các đốm tròn. */
function drawArt(seed: number) {
  const rng = makeRng(seed);
  return (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
    ctx.fillStyle = pick(rng, ART_BG);
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = pick(rng, ART_COLS);
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(rng() * w, rng() * h, 20 + rng() * 70, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
}

// ---------------------------------------------------------------- Lounge

export interface LoungeDetailProps extends DecorBase {
  /** Hạt giống cho màu lá, màu sách và tranh. */
  seed?: number;
  /** Có cây cảnh (cây lớn và cây nhỏ). Mặc định true. */
  plants?: boolean;
}

// Số liệu đồ đạc (m, theo tâm khu). Vẽ và va chạm (loungeBlockers) dùng chung các hằng này.
// Tránh karaoke_room (x -5,4..-1,0; z -7,15..-3,95), games_corner (x -4,2..-1,0; z -2,35..-0,15)
// và util_health (x 0,3..4,3; z -6,85..-3,35). Giữ hành lang tối thiểu 1,2 m giữa đồ đạc và các vật đặc.
const SOFA_LONG = { x: 2.4, z: -1.2, w: 3.2, d: 0.95 }; // dãy dài của sofa chữ L, quay mặt về bàn trà (hướng Nam)
const SOFA_SHORT = { x: 0.8, z: -0.2, w: 0.95, d: 2.0 }; // nhánh ngắn của sofa chữ L, quay mặt về phía Đông
const SOFA_SOUTH = { x: 2.4, z: 2.6, w: 2.4, d: 0.9 }; // ghế đôi phía Nam bàn trà, quay mặt về phía Bắc
const TEA_TABLE = { x: 2.4, z: 0.4, w: 1.1, d: 1.1 }; // bàn trà Ø 1,1 m, va chạm theo hình vuông bao
const RUG = { x: 2.4, z: 0.4 }; // thảm Ø 4,4 m dưới cụm bàn trà (chỉ trang trí, không chặn đi lại)
const SHELF = { x: -5.5, z: 0, w: 0.35, d: 4.0 }; // kệ sách sát tường Tây
const PLANT_BIG = { x: 4.6, z: -7.6, w: 0.76, d: 0.76 }; // chậu Ø 0,76 m, góc Đông-Bắc, phía Bắc util_health
const PLANT_SMALL = { x: -5.0, z: 6.8, w: 0.56, d: 0.56 }; // chậu Ø 0,56 m, góc Tây-Nam

/** Hình chữ nhật chặn đi lại của khu lounge, theo tọa độ three.js. center là tâm khu trên sàn (x, z). */
export function loungeBlockers(center: readonly [number, number], plants: boolean): FloorRect[] {
  const list = [SOFA_LONG, SOFA_SHORT, SOFA_SOUTH, TEA_TABLE, SHELF];
  if (plants) list.push(PLANT_BIG, PLANT_SMALL);
  return list.map((r) => floorRect(center[0], center[1], r));
}

function buildLounge(seed: number, plants: boolean): Built {
  const rng = makeRng(seed);
  const box: Inst[] = [];
  const cyl: Inst[] = [];
  const sph: Inst[] = [];

  // Thảm tròn Ø 4,4 m, vòng trong Ø 3 m.
  cyl.push({ p: [RUG.x, 0.005, RUG.z], s: [2.2, 0.01, 2.2], c: '#b5523b' });
  cyl.push({ p: [RUG.x, 0.006, RUG.z], s: [1.5, 0.012, 1.5], c: '#f2c14e' });

  // Bàn trà tròn Ø 1,1 m cao 0,44 m, có 3 tách.
  const tx = TEA_TABLE.x;
  const tz = TEA_TABLE.z;
  cyl.push({ p: [tx, 0.42, tz], s: [0.55, 0.04, 0.55], c: WOOD });
  cyl.push({ p: [tx, 0.205, tz], s: [0.05, 0.39, 0.05], c: METAL_DARK });
  cyl.push({ p: [tx, 0.01, tz], s: [0.35, 0.02, 0.35], c: METAL_DARK });
  cyl.push({ p: [tx + 0.22, 0.465, tz + 0.05], s: [0.03, 0.05, 0.03], c: '#f8fafc' });
  cyl.push({ p: [tx - 0.18, 0.465, tz - 0.2], s: [0.03, 0.05, 0.03], c: '#f8fafc' });
  cyl.push({ p: [tx, 0.465, tz + 0.25], s: [0.03, 0.05, 0.03], c: '#f8fafc' });

  // Sofa chữ L ở giữa-Bắc, mở về phía Đông-Nam (quay mặt về bàn trà): dãy dài dọc trục x, nhánh ngắn dọc trục z ở đầu Tây.
  box.push({ p: [SOFA_LONG.x, 0.21, SOFA_LONG.z], s: [SOFA_LONG.w, 0.42, SOFA_LONG.d], c: SOFA });
  box.push({ p: [SOFA_LONG.x, 0.67, SOFA_LONG.z - 0.375], s: [SOFA_LONG.w, 0.5, 0.2], c: SOFA });
  box.push({ p: [SOFA_LONG.x + SOFA_LONG.w / 2 - 0.1, 0.53, SOFA_LONG.z], s: [0.2, 0.22, SOFA_LONG.d], c: SOFA });
  box.push({ p: [SOFA_SHORT.x, 0.21, SOFA_SHORT.z], s: [SOFA_SHORT.w, 0.42, SOFA_SHORT.d], c: SOFA });
  box.push({ p: [SOFA_SHORT.x - 0.375, 0.67, SOFA_SHORT.z], s: [0.2, 0.5, SOFA_SHORT.d], c: SOFA });
  [SOFA_LONG.x - 0.9, SOFA_LONG.x, SOFA_LONG.x + 0.9].forEach((x, i) => {
    box.push({ p: [x, 0.49, SOFA_LONG.z - 0.1], s: [0.55, 0.14, 0.7], c: CUSHIONS[i] });
  });

  // Ghế đôi phía Nam, quay mặt về phía bàn trà.
  box.push({ p: [SOFA_SOUTH.x, 0.21, SOFA_SOUTH.z], s: [SOFA_SOUTH.w, 0.42, SOFA_SOUTH.d], c: SOFA });
  box.push({ p: [SOFA_SOUTH.x, 0.67, SOFA_SOUTH.z + 0.35], s: [SOFA_SOUTH.w, 0.5, 0.2], c: SOFA });

  if (plants) {
    // Cây lớn trong chậu Ø 0,76 m ở góc Đông-Bắc. Thân cao 1,5 m, tán lá là các khối cầu.
    cyl.push({ p: [PLANT_BIG.x, 0.35, PLANT_BIG.z], s: [0.38, 0.7, 0.38], c: POT_WHITE });
    cyl.push({ p: [PLANT_BIG.x, 1.45, PLANT_BIG.z], s: [0.04, 1.5, 0.04], c: '#6b4a2b' });
    const leaves: ReadonlyArray<readonly [number, number, number, number]> = [
      [0, 2.35, 0, 0.6],
      [0.35, 2.1, 0.2, 0.42],
      [-0.3, 2.0, -0.25, 0.45],
      [0.2, 2.75, -0.3, 0.4],
      [-0.25, 2.65, 0.3, 0.38],
    ];
    for (const [x, y, z, r] of leaves) {
      sph.push({ p: [PLANT_BIG.x + x, y, PLANT_BIG.z + z], s: [r, r, r], c: pick(rng, LEAF) });
    }

    // Cây nhỏ ở góc Tây-Nam.
    cyl.push({ p: [PLANT_SMALL.x, 0.25, PLANT_SMALL.z], s: [0.28, 0.5, 0.28], c: POT_WHITE });
    sph.push({ p: [PLANT_SMALL.x, 0.95, PLANT_SMALL.z], s: [0.42, 0.4, 0.42], c: pick(rng, LEAF) });
    sph.push({ p: [PLANT_SMALL.x + 0.2, 1.25, PLANT_SMALL.z + 0.1], s: [0.34, 0.32, 0.34], c: pick(rng, LEAF) });
  }

  // Kệ sách sát tường Tây: tấm lưng, 4 tầng, mỗi tầng 28 cuốn cùng kích thước khác màu.
  box.push({ p: [SHELF.x - 0.15, 1.1, SHELF.z], s: [0.05, 2.2, SHELF.d], c: WOOD });
  for (const y of [0.2, 0.7, 1.2, 1.7]) {
    box.push({ p: [SHELF.x, y, SHELF.z], s: [SHELF.w, 0.03, SHELF.d], c: WOOD });
    for (let k = 0; k < 28; k++) {
      box.push({
        p: [SHELF.x, y + 0.015 + 0.2, -1.9 + (k + 0.5) * (3.8 / 28)],
        s: [0.22, 0.4, 0.12],
        c: pick(rng, BOOKS),
      });
    }
  }

  // Khung tranh trên tường Bắc (hai bức, cao 1,0 m, rộng 1,3 m).
  box.push({ p: [-2.0, 1.6, -8.12], s: [1.3, 1.0, 0.04], c: WOOD });
  box.push({ p: [2.0, 1.6, -8.12], s: [1.3, 1.0, 0.04], c: WOOD });

  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  // Hai bức tranh chung một texture (nửa trái, nửa phải) và một mesh: một draw call thay vì hai.
  const drawA = drawArt(seed + 1);
  const drawB = drawArt(seed + 2);
  const paintTex = canvasTexture(512, 192, (ctx, w, h) => {
    const half = w / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, half, h);
    ctx.clip();
    drawA(ctx, half, h);
    ctx.restore();
    ctx.save();
    ctx.translate(half, 0);
    ctx.beginPath();
    ctx.rect(0, 0, half, h);
    ctx.clip();
    drawB(ctx, half, h);
    ctx.restore();
  });
  const paintMat = new THREE.MeshBasicMaterial({ map: paintTex });
  const paintGeo = paintPair([
    { x: -2.0, u0: 0 },
    { x: 2.0, u0: 0.5 },
  ]);
  const paint = new THREE.Mesh(paintGeo, paintMat);

  const built = solidBuilt(solidMat, box, cyl, sph);
  built.meshes.push(paint);
  built.owned.push(solidMat, paintTex, paintMat, paintGeo);
  return built;
}

/** Mặt tranh trên tường Bắc (1,2 x 0,9 m, tâm cao 1,6 m), mỗi bức lấy nửa texture bắt đầu từ u0. */
function paintPair(items: ReadonlyArray<{ x: number; u0: number }>): THREE.BufferGeometry {
  const parts = items.map(({ x, u0 }) => {
    const g = UNIT_PLANE.clone();
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * 0.5);
    g.scale(1.2, 0.9, 1);
    g.translate(x, 1.6, -8.09);
    return g;
  });
  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  for (const g of parts) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Khối, trụ, cầu của một cụm gộp chung một mesh màu đỉnh (một draw call thay vì ba InstancedMesh).
 * mat phải bật vertexColors. owned chứa hình học gộp; người gọi thêm vật liệu và texture của mình.
 */
function solidBuilt(mat: THREE.Material, box: Inst[], cyl: Inst[], sph: Inst[]): Built {
  const solid = mergedMesh(mat, [
    [UNIT_BOX, box],
    [UNIT_CYL, cyl],
    [UNIT_SPHERE, sph],
  ]);
  const meshes: THREE.Mesh[] = [];
  const owned: Disposable[] = [];
  if (solid) {
    meshes.push(solid);
    owned.push(solid.geometry);
  }
  return { meshes, owned };
}

/** Khu lounge: sofa chữ L, sofa đôi, bàn trà tròn, thảm, cây lớn, kệ sách và hai bức tranh. */
export function LoungeDetail({
  position = [0, 0, 0],
  scale = 1,
  rotationY = 0,
  seed = 3,
  plants = true,
}: LoungeDetailProps) {
  const built = useMemo(() => buildLounge(seed, plants), [seed, plants]);
  useDisposeOnChange(built.owned);
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      {built.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- Pantry

export interface PantryDetailProps extends DecorBase {
  /** Chiều ngang khu (m, trục x). Mặc định 6. */
  width?: number;
  /** Chiều sâu khu (m, trục z). Mặc định 6,5. Từ 5 m trở lên có thêm bàn tròn và ghế đẩu. */
  depth?: number;
  seed?: number;
  /** Có cây cảnh trên quầy. Mặc định true. */
  plants?: boolean;
}

/** Số liệu quầy pantry theo kích thước khu. Vẽ và va chạm (pantryBlockers) dùng chung hàm này. */
function pantryLayout(width: number, depth: number) {
  return {
    len: Math.min(width - 0.6, 5.4), // chiều dài quầy
    zc: -depth / 2 + 0.4, // tâm quầy theo z
    fridgeX: width / 2 - 0.35, // tủ lạnh, khi width >= 5
    tableZ: depth / 2 - 1.4, // tâm bàn tròn theo z, khi depth >= 5 (x = 0,3)
    plantX: -width / 2 + 0.35, // cây nhỏ ở góc
    plantZ: depth / 2 - 0.35,
  };
}

/**
 * Hình chữ nhật chặn đi lại của quầy pantry hoặc khu cà phê, theo tọa độ three.js.
 * center là tâm khu trên sàn (x, z). width và depth là kích thước khu (m).
 */
export function pantryBlockers(
  center: readonly [number, number],
  width: number,
  depth: number,
  plants: boolean,
): FloorRect[] {
  const L = pantryLayout(width, depth);
  const at = (r: { x: number; z: number; w: number; d: number }) => floorRect(center[0], center[1], r);
  const out: FloorRect[] = [at({ x: 0, z: L.zc, w: L.len, d: 0.6 })];
  if (width >= 5) out.push(at({ x: L.fridgeX, z: L.zc, w: 0.7, d: 0.65 }));
  // Bàn tròn và hai ghế đẩu: cụm bao quanh, x từ -0,58 đến 1,18 m quanh tâm 0,3 m.
  if (depth >= 5) out.push(at({ x: 0.3, z: L.tableZ, w: 1.76, d: 0.9 }));
  if (plants) out.push(at({ x: L.plantX, z: L.plantZ, w: 0.3, d: 0.3 }));
  return out;
}

function buildPantry(width: number, depth: number, seed: number, plants: boolean): Built {
  const rng = makeRng(seed);
  const box: Inst[] = [];
  const cyl: Inst[] = [];
  const sph: Inst[] = [];
  const led: Inst[] = [];

  const { len, zc, fridgeX, tableZ, plantX, plantZ } = pantryLayout(width, depth);
  // Tủ bếp dài, mặt đá trắng, tủ treo phía sau.
  box.push({ p: [0, 0.45, zc], s: [len, 0.9, 0.6], c: '#d7c7ad' });
  box.push({ p: [0, 0.92, zc], s: [len + 0.06, 0.04, 0.66], c: '#eef0f2' });
  if (depth >= 4) box.push({ p: [0, 1.75, -depth / 2 + 0.2], s: [len, 0.7, 0.35], c: '#c8b49a' });

  // Máy pha cà phê: khối 0,34 x 0,42 x 0,36 m, đèn báo xanh nhỏ ở mặt trước.
  const mx = -len / 2 + 0.6;
  box.push({ p: [mx, 1.13, zc], s: [0.34, 0.42, 0.36], c: METAL_DARK });
  led.push({ p: [mx, 1.2, zc + 0.185], s: [0.05, 0.02, 0.01] });

  // Chồng cốc sứ Ø 0,08 m, cao 0,09 m.
  cyl.push({ p: [mx + 0.5, 0.965, zc], s: [0.04, 0.09, 0.04], c: '#f8fafc' });
  cyl.push({ p: [mx + 0.5, 1.055, zc], s: [0.04, 0.09, 0.04], c: '#f8fafc' });

  // Tủ lạnh ở đầu quầy khi khu đủ rộng.
  if (width >= 5) box.push({ p: [fridgeX, 0.9, zc], s: [0.7, 1.8, 0.65], c: '#e5e7eb' });

  // Bàn tròn Ø 0,9 m, cao 0,74 m với hai ghế đẩu.
  if (depth >= 5) {
    const tz = tableZ;
    cyl.push({ p: [0.3, 0.74, tz], s: [0.45, 0.04, 0.45], c: WOOD });
    cyl.push({ p: [0.3, 0.36, tz], s: [0.05, 0.72, 0.05], c: METAL_DARK });
    for (const sx of [-0.7, 0.7]) {
      cyl.push({ p: [0.3 + sx, 0.45, tz], s: [0.18, 0.05, 0.18], c: '#2d3748' });
      cyl.push({ p: [0.3 + sx, 0.2125, tz], s: [0.03, 0.425, 0.03], c: METAL_DARK });
    }
  }

  // Cây nhỏ ở góc.
  if (plants) {
    cyl.push({ p: [plantX, 0.15, plantZ], s: [0.15, 0.3, 0.15], c: POT_WHITE });
    sph.push({ p: [plantX, 0.5, plantZ], s: [0.25, 0.25, 0.25], c: pick(rng, LEAF) });
  }

  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const ledMat = new THREE.MeshBasicMaterial({ color: '#34d399' });

  const built = solidBuilt(solidMat, box, cyl, sph);
  const ledMesh = instanced(UNIT_BOX, ledMat, led);
  if (ledMesh) built.meshes.push(ledMesh);
  built.owned.push(solidMat, ledMat);
  return built;
}

/** Quầy pantry và khu nghỉ. Dùng cho pantry và util_coffee (chiều ngang nhỏ hơn). */
export function PantryDetail({
  position = [0, 0, 0],
  scale = 1,
  rotationY = 0,
  width = 6,
  depth = 6.5,
  seed = 5,
  plants = true,
}: PantryDetailProps) {
  const built = useMemo(() => buildPantry(width, depth, seed, plants), [width, depth, seed, plants]);
  useDisposeOnChange(built.owned);
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      {built.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- Phòng nghỉ yên tĩnh

export interface RoomDetailProps extends DecorBase {
  seed?: number;
  /** Có cây nhỏ trong phòng. Mặc định true. */
  plants?: boolean;
}

function buildQuiet(seed: number, plants: boolean): Built {
  const rng = makeRng(seed);
  const box: Inst[] = [];
  const cyl: Inst[] = [];
  const sph: Inst[] = [];
  const glow: Inst[] = [];
  const CHAIR = '#8c6e5a';

  // Ghế bành: đệm, lưng và hai tay.
  box.push({ p: [0, 0.21, -0.35], s: [0.9, 0.42, 0.85], c: CHAIR });
  box.push({ p: [0, 0.695, -0.7], s: [0.9, 0.55, 0.16], c: CHAIR });
  box.push({ p: [-0.52, 0.57, -0.35], s: [0.14, 0.3, 0.85], c: CHAIR });
  box.push({ p: [0.52, 0.57, -0.35], s: [0.14, 0.3, 0.85], c: CHAIR });

  // Bàn nhỏ tròn Ø 0,6 m cao 0,45 m.
  cyl.push({ p: [0, 0.435, 0.45], s: [0.3, 0.03, 0.3], c: WOOD });
  cyl.push({ p: [0, 0.2, 0.45], s: [0.04, 0.4, 0.04], c: METAL_DARK });

  // Đèn đứng với chụp sáng ấm.
  cyl.push({ p: [0.65, 0.4, 0.6], s: [0.012, 0.8, 0.012], c: METAL_DARK });
  glow.push({ p: [0.65, 0.85, 0.6], s: [0.12, 0.1, 0.12] });

  // Cây nhỏ.
  if (plants) {
    cyl.push({ p: [-0.6, 0.15, 0.9], s: [0.15, 0.3, 0.15], c: POT_WHITE });
    sph.push({ p: [-0.6, 0.5, 0.9], s: [0.22, 0.24, 0.22], c: pick(rng, LEAF) });
  }

  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffd08a' });
  const built = solidBuilt(solidMat, box, cyl, sph);
  const glowMesh = instanced(UNIT_SPHERE, glowMat, glow);
  if (glowMesh) built.meshes.push(glowMesh);
  built.owned.push(solidMat, glowMat);
  return built;
}

/** Phòng nghỉ yên tĩnh (2 x 2,6 m): ghế bành, bàn nhỏ, đèn đứng và cây. */
export function QuietRoomDetail({
  position = [0, 0, 0],
  scale = 1,
  rotationY = 0,
  seed = 2,
  plants = true,
}: RoomDetailProps) {
  const built = useMemo(() => buildQuiet(seed, plants), [seed, plants]);
  useDisposeOnChange(built.owned);
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      {built.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- Phòng y tế, mẹ và bé

function buildHealth(): Built {
  const box: Inst[] = [];
  // Giường nằm: khung, nệm và gối.
  box.push({ p: [-0.9, 0.2, -0.9], s: [1.9, 0.4, 0.85], c: '#e2e8f0' });
  box.push({ p: [-0.9, 0.46, -0.9], s: [1.85, 0.12, 0.8], c: '#ffffff' });
  box.push({ p: [-1.45, 0.58, -0.9], s: [0.45, 0.12, 0.3], c: '#bfdbfe' });
  // Bàn thay đồ cho bé: thân cao 0,9 m và mặt gỗ.
  box.push({ p: [1.2, 0.45, -1.2], s: [1.0, 0.9, 0.6], c: '#f1f5f9' });
  box.push({ p: [1.2, 0.92, -1.2], s: [1.0, 0.04, 0.6], c: WOOD });
  // Tủ thuốc trắng có dấu thập đỏ ở mặt trước.
  box.push({ p: [-1.3, 0.8, 1.3], s: [0.8, 1.6, 0.4], c: '#f8fafc' });
  box.push({ p: [-1.3, 1.2, 1.51], s: [0.36, 0.1, 0.02], c: '#e53e3e' });
  box.push({ p: [-1.3, 1.2, 1.51], s: [0.1, 0.36, 0.02], c: '#e53e3e' });

  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const built = solidBuilt(solidMat, box, [], []);
  built.owned.push(solidMat);
  return built;
}

/** Phòng y tế và phòng mẹ và bé (4 x 3,5 m): giường nằm, bàn thay đồ, tủ thuốc có dấu thập đỏ. Chỉ một draw call. */
export function HealthRoomDetail({ position = [0, 0, 0], scale = 1, rotationY = 0 }: DecorBase) {
  const built = useMemo(() => buildHealth(), []);
  useDisposeOnChange(built.owned);
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      {built.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- Bảng vinh danh

export interface KudosBoardDetailProps extends DecorBase {
  /** Chiều dài bảng (m, trục x của phần local). Mặc định 3. */
  width?: number;
  /** Cao bảng (m). Mặc định 2. */
  height?: number;
  seed?: number;
}

const KUDOS_CY = 1.4; // tâm bảng tính từ sàn (m)
const CORK = '#d9a86c';
const FRAME = '#3f2d1e';
const NOTE_COLORS = ['#fde68a', '#fbcfe8', '#bfdbfe', '#bbf7d0', '#fed7aa'];

/** Bảng vinh danh: bảng bần, tiêu đề và 9 ô ghi chú dán. Bảng hướng về +z trước khi áp rotationY. */
export function KudosBoardDetail({
  position = [0, 0, 0],
  scale = 1,
  rotationY = 0,
  width = 3,
  height = 2,
  seed = 5,
}: KudosBoardDetailProps) {
  const res = useMemo(() => {
    const rng = makeRng(seed);
    // Khung và mặt bần gộp một mesh màu đỉnh: một draw call.
    const boardMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const board = mergedMesh(boardMat, [
      [
        UNIT_BOX,
        [
          { p: [0, KUDOS_CY, -0.05], s: [width + 0.1, height + 0.1, 0.06], c: FRAME },
          { p: [0, KUDOS_CY, 0], s: [width, height, 0.12], c: CORK },
        ],
      ],
    ]);
    const titleTex = canvasTexture(768, 96, (ctx, w, h) => {
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff7ed';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fitFont(ctx, 'VINH DANH ĐỒNG NGHIỆP', w - 40, 56);
      ctx.fillText('VINH DANH ĐỒNG NGHIỆP', w / 2, h / 2);
    });
    const titleMat = new THREE.MeshBasicMaterial({ map: titleTex });
    const noteMat = new THREE.MeshBasicMaterial();
    const notes: Inst[] = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        notes.push({
          p: [(c - 1) * (width / 3.5), KUDOS_CY + 0.3 - r * 0.5, 0.066],
          s: [0.42, 0.42, 1],
          c: pick(rng, NOTE_COLORS),
        });
      }
    }
    const noteBatch = instanced(UNIT_PLANE, noteMat, notes);
    const owned: Disposable[] = [boardMat, titleTex, titleMat, noteMat];
    if (board) owned.push(board.geometry);
    return { board, titleMat, noteBatch, owned };
  }, [width, height, seed]);
  useDisposeOnChange(res.owned);

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      {res.board && <primitive object={res.board} />}
      <mesh
        geometry={UNIT_PLANE}
        material={res.titleMat}
        position={[0, KUDOS_CY + 0.7, 0.066]}
        scale={[width - 0.4, (width - 0.4) / 8, 1]}
      />
      {res.noteBatch && <primitive object={res.noteBatch} />}
    </group>
  );
}
