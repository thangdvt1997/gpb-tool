// Khu bàn làm việc: DeskDetail (khối bàn đa hàng), ServiceDeskDetail (quầy Service Desk), NocWallDetail (tường NOC).
// Gốc = điểm trên sàn ở tâm khối. Kích thước bộ bàn mẫu trong src/env/deskConfig.ts (rộng 1,2, sâu 0,65, cao 0,75 m).
//
// Bộ bàn mẫu theo ảnh văn phòng thật (promy_update/room.txt mục 3, REAL_OFFICE_STYLE.md mục 3 và 5):
//   - Mặt gỗ melamine màu kem vàng nhạt dày 25 mm, khung chân thép hộp chữ O bạc xám, một số khối có tấm chắn gỗ.
//   - Hộc tủ di động 3 ngăn gỗ cùng màu, bánh xe, tay kéo, ổ khoá, đặt dưới bàn phía hộc, chừa 0,7 m để chân.
//   - Ghế xoay lưng lưới khung cong, đệm nỉ đen, tay vịn, chân sao năm cánh có bánh xe, lệch góc và kéo ra ngẫu nhiên.
//   - Ba kiểu chỗ ngồi: một màn, hai màn (chân đế hoặc tay đỡ), laptop trên giá kèm cốc và giấy. Đồ dùng: bình nước,
//     cốc, tai nghe, quạt mini, cây nhỏ, cốc bút, tấm lót bàn, mỗi món một góc bàn, không đè bàn phím.
//   - Dãy bench: các bàn sát nhau theo chiều ngang, không vách ngăn. Lưới chỗ ngồi 1,2 x 1,2 m, ghế ở +z cách tâm
//     bàn 0,55 m, khớp lưới ghế của hệ tương tác (src/scene/interact/geometry.ts) để nhân vật ngồi đúng ghế.
//     Mọi chỗ ngồi kể cả ghế nằm trong footprint khối bàn của it.json, nên không chồng bàn khác, không xuyên tường.
//
// Draw call: cả khu 2 lệnh vẽ, không phụ thuộc số bàn. (1) Mọi mảnh đặc, gỗ, lưới ghế, màn hình chung một vật liệu
// atlas (src/env/deskAtlas.ts). (2) Bóng tiếp xúc (src/env/contactShadow.ts). Không đổ shadow map.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useOfficeEnvMap } from '../scene/officeEnv';
import { OFFICE_DAY_SCENE as REAL } from '../theme/tokens';
import { ShadowBatch, type ShadowSpot } from './contactShadow';
import { AtlasBatch, buildDeskAtlas, type ScreenCell } from './deskAtlas';
import { ACCESSORY_CHANCE, ACCESSORY_COLORS, DESK_CONFIG, SETUP_WEIGHTS, type SeatSetup } from './deskConfig';
import { deskGlbEnabled, useDeskGlb, type DeskGlbGeometries } from './deskGlb';
import { palettes } from './palette';
import {
  canvasTexture,
  fitFont,
  instanced,
  makeRng,
  pick,
  UNIT_BOX,
  UNIT_PLANE,
  UNIT_SPHERE,
  useDisposeOnChange,
  type DecorBase,
  type Disposable,
  type Inst,
} from './shared';

export type DeskVariant = 'dev' | 'design' | 'ops';

export interface DeskDetailProps extends DecorBase {
  /** Chiều ngang khối (m, trục x). Mặc định 1,2 (một chỗ). */
  width?: number;
  /** Chiều sâu khối (m, trục z). Mặc định 1,2 (một chỗ kèm ghế). */
  depth?: number;
  /** Độ cao mặt bàn (m). Mặc định 0,75. */
  height?: number;
  /** Hạt giống cho chi tiết ngẫu nhiên (kiểu chỗ ngồi, đồ dùng, góc ghế). */
  seed?: number;
  /** dev: thiên về hai màn mã nguồn. design: một màn rộng. ops: hai màn biểu đồ. */
  variant?: DeskVariant;
  /** Không còn vẽ thẻ tên. Giữ để tương thích, nhãn squad vẽ ở lớp Html của khu. */
  label?: string;
  /** Có ghế, hộc tủ, khung chân cho mỗi chỗ. Mặc định true. Quầy dịch vụ tắt. */
  chairs?: boolean;
  /** Có cây nhỏ trên một số bàn. Mặc định true. */
  plants?: boolean;
}

const CFG = DESK_CONFIG;

// Màu theo ảnh văn phòng thật (REAL_OFFICE_STYLE.md mục 2).
const WOOD = REAL.woodDesktop;
const PEDESTAL = REAL.woodPedestal;
const DRAWER = REAL.woodEdge;
const METAL = REAL.metalFrame;
const INK = palettes['office-day'].ink;
const BEZEL = '#16181c';
const DARK2 = '#24272d';
const KEYCAP = '#3a3e46';
const BLACK = '#1b1d21';
const CHROME = '#c9ccd1';
const DESKMAT = '#45494c';
const PAPER = '#f6f6f2';
const SOIL = '#3a2c22';
const PENS = ['#1f4fb4', '#1b1b1b', '#c0392b'];
const CHAIR_SEAT = REAL.chairSeat;
const CHAIR_MESH = REAL.chairMesh;
const STATUS = ['#2f855a', '#2f855a', '#2f855a', '#2f855a', '#2f855a', '#2f855a', '#d69e2e', '#d69e2e', '#e53e3e'];

// Hình học dùng chung của bộ bàn (tạo một lần khi nạp module, không dispose).
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const CYL12 = new THREE.CylinderGeometry(1, 1, 1, 12);
/** Nửa vòng xuyến bán kính 1 trong mặt XY (tay cầm cốc, quai tai nghe). */
const HALF_TORUS = new THREE.TorusGeometry(1, 0.11, 5, 12, Math.PI);

// Lưng ghế lưới: tấm cong theo phương ngang (hai mép ôm về phía người ngồi, -z local), đệm lưng dưới nhô nhẹ,
// mép trên vồng lên. Kích thước thật (m), dùng s = [1, 1, 1].
const BACK_W = 0.44;
const BACK_H = 0.46;
const BACK_ARCH = 0.03;

function backShape(x: number, y: number): [number, number] {
  const sx = Math.min(1, Math.abs(x) / (BACK_W / 2));
  const yy = y + BACK_ARCH * (1 - sx * sx) * Math.max(0, y / (BACK_H / 2));
  const z = -0.065 * sx * sx - 0.022 * Math.exp(-(((y + 0.06) / 0.12) ** 2));
  return [yy, z];
}

/** Tấm lưới hai mặt (mặt sau lật pháp tuyến), để vật liệu FrontSide vẫn thấy từ hai phía. */
function chairBackGeometry(): THREE.BufferGeometry {
  const front = new THREE.PlaneGeometry(BACK_W, BACK_H, 10, 8);
  const p = front.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const [y, z] = backShape(p.getX(i), p.getY(i));
    p.setY(i, y);
    p.setZ(i, z);
  }
  front.computeVertexNormals();
  const back = front.clone();
  const idx = back.getIndex();
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, a);
    }
  }
  const n = back.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  const merged = mergeGeometries([front, back], false);
  front.dispose();
  back.dispose();
  return merged ?? new THREE.PlaneGeometry(BACK_W, BACK_H);
}

/** Khung nhựa ống quanh mép tấm lưới, bám theo độ cong của tấm. */
function chairFrameGeometry(): THREE.BufferGeometry {
  const hw = BACK_W / 2 + 0.006;
  const hh = BACK_H / 2 + 0.006;
  const pts: THREE.Vector3[] = [];
  const at = (x: number, y: number): void => {
    const [yy, z] = backShape(Math.max(-BACK_W / 2, Math.min(BACK_W / 2, x)), Math.max(-BACK_H / 2, Math.min(BACK_H / 2, y)));
    pts.push(new THREE.Vector3(x, yy + (y > BACK_H / 2 ? 0.006 : y < -BACK_H / 2 ? -0.006 : 0), z));
  };
  const N = 6;
  for (let i = 0; i < N; i++) at(-hw + (2 * hw * i) / N, -hh);
  for (let i = 0; i < N; i++) at(hw, -hh + (2 * hh * i) / N);
  for (let i = 0; i < N; i++) at(hw - (2 * hw * i) / N, hh);
  for (let i = 0; i < N; i++) at(-hw, hh - (2 * hh * i) / N);
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.2);
  return new THREE.TubeGeometry(curve, 36, 0.011, 5, true);
}

const CHAIR_BACK = chairBackGeometry();
const CHAIR_FRAME = chairFrameGeometry();

type V3 = [number, number, number];

const tmpE = new THREE.Euler();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

/** Khung con: tịnh tiến (x, y, z), xoay yaw quanh Y rồi pitch quanh X local. parent * local. */
function sub(parent: THREE.Matrix4, x: number, y: number, z: number, yaw = 0, pitch = 0): THREE.Matrix4 {
  tmpE.set(pitch, yaw, 0, 'YXZ');
  tmpQ.setFromEuler(tmpE);
  return new THREE.Matrix4().compose(tmpV.set(x, y, z), tmpQ, ONE).premultiply(parent);
}

const jitter = (rng: () => number, amp: number): number => (rng() - 0.5) * 2 * amp;

/** Một khối bàn (hoặc quầy dịch vụ) của khu, toạ độ tuyệt đối trên sàn. Khối không xoay. */
export interface DeskSpec {
  /** id vật thể trong it.json. Chỉ để gắn với vật thể, không ảnh hưởng hình vẽ. */
  id: string;
  /** Tâm khối theo x và z (m, hệ three.js). */
  x: number;
  z: number;
  /** Kích thước footprint khối (m). Số chỗ tính theo DESK_CONFIG. */
  width: number;
  depth: number;
  /** Độ cao mặt bàn (m). */
  height: number;
  variant: DeskVariant;
  /** Hạt giống cho kiểu chỗ ngồi, đồ dùng, góc ghế. */
  seed: number;
  /** Bàn làm việc có ghế, hộc, khung chân. false: quầy, chỉ vẽ mặt bàn và thiết bị. */
  chairs: boolean;
  /** Có cây nhỏ trên một số bàn. */
  plants: boolean;
}

/** Một chỗ ngồi: tâm bàn (x, z) và hướng. yaw 0: người ngồi phía +z, màn hình phía -z. */
export interface DeskSeat {
  x: number;
  z: number;
  yaw: number;
}

/**
 * Xếp chỗ ngồi trong footprint khối bàn, theo đúng lưới ghế của hệ tương tác (src/scene/interact/geometry.ts):
 * floor(width / 1,2) cột và floor(depth / 1,2) hàng, bước 1,2 m, căn giữa khối; người ngồi phía +z, màn hình -z.
 * Kiểm footprint (it.json): khối sâu 4,6 m có 3 hàng, ghế hàng cuối tới tâm + 1,2 + 0,57 + 0,326 = 2,1 < 2,3 m;
 * khối sâu 3 m (desk_L3) có 2 hàng, tới 0,6 + 0,57 + 0,326 = 1,496 < 1,5 m. Bàn ngoài cùng của khối rộng 6 m
 * chạm đúng mép footprint (5 x 1,2 m).
 * Quầy (chairs false): một hàng ở tâm.
 */
export function seatsOf(d: DeskSpec): DeskSeat[] {
  const cols = Math.max(1, Math.floor((d.width + 1e-6) / CFG.pitch));
  const rows = d.chairs ? Math.max(1, Math.floor((d.depth + 1e-6) / CFG.pitch)) : 1;
  const out: DeskSeat[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ x: d.x + (c - (cols - 1) / 2) * CFG.pitch, z: d.z + (r - (rows - 1) / 2) * CFG.pitch, yaw: 0 });
    }
  }
  return out;
}

/** Ngữ cảnh dựng một khối bàn. */
interface Ctx {
  b: AtlasBatch;
  sh: ShadowBatch;
  rng: () => number;
  /** Độ cao mặt bàn. */
  t: number;
  variant: DeskVariant;
  plants: boolean;
  /**
   * Chế độ GLB: chỗ ngồi đầy đủ (bàn, hộc, ghế, thiết bị, đồ dùng) do InstancedMesh của GLB đảm nhiệm, nên ở đây
   * chỉ ghi lại khung chỗ ngồi theo biến thể, cộng bóng tiếp xúc và thùng rác (hình học nhỏ ở lại mesh atlas).
   */
  inst?: Record<DeskVariant, THREE.Matrix4[]>;
  /** Bake GLB: chỉ bàn, hộc, ghế (khung chỗ ngồi), không thiết bị và đồ dùng. */
  bare?: boolean;
  /** Nhận chữ ký cấu hình đồ dùng của từng chỗ (kiểm thử, hook e2e). */
  sigs?: string[];
}

function pickSetup(rng: () => number, variant: DeskVariant): SeatSetup {
  const w = SETUP_WEIGHTS[variant];
  let r = rng() * (w.single + w.dual + w.laptop);
  if ((r -= w.single) < 0) return 'single';
  if ((r -= w.dual) < 0) return 'dual';
  return 'laptop';
}

/** Mặt gỗ, khung chân chữ O hai đầu, xà sau, tấm chắn gỗ (tuỳ khối), lỗ đi dây. */
function addDeskFrame(c: Ctx, f: THREE.Matrix4, panel: boolean): void {
  const { b, t } = c;
  const W = CFG.width;
  const D = CFG.depth;
  const T = CFG.topThickness;
  b.wood(UNIT_BOX, f, [0, t - T / 2, 0], [W - 0.004, T, D], WOOD);
  const under = t - T;
  const postH = under - 0.05;
  for (const sx of [-1, 1]) {
    const lx = sx * (W / 2 - 0.045);
    for (const sz of [-1, 1]) b.add(UNIT_BOX, f, [lx, 0.025 + postH / 2, sz * (D / 2 - 0.07)], [0.045, postH, 0.025], METAL, 'metal');
    b.add(UNIT_BOX, f, [lx, under - 0.0125, 0], [0.045, 0.025, D - 0.1], METAL, 'metal');
    b.add(UNIT_BOX, f, [lx, 0.0125, 0], [0.045, 0.025, D - 0.1], METAL, 'metal');
  }
  b.add(UNIT_BOX, f, [0, under - 0.03, -(D / 2 - 0.07)], [W - 0.13, 0.04, 0.02], METAL, 'metal');
  if (panel) b.wood(UNIT_BOX, f, [0, under - 0.16, -(D / 2 - 0.035)], [W - 0.13, 0.3, 0.016], WOOD);
  b.add(CYL12, f, [0.12, t + 0.0006, -0.27], [0.03, 0.002, 0.03], BLACK, 'plastic');
}

/** Hộc tủ di động 3 ngăn dưới bàn, mặt ngăn kéo quay về phía người ngồi. side: +1 bên phải người ngồi. */
function addPedestal(c: Ctx, f: THREE.Matrix4, side: number): void {
  const { b } = c;
  const P = CFG.pedestal;
  // Mép trong cách chân bàn 0,03 m; mép kia chừa khoảng để chân khoảng 0,7 m.
  const px = side * (CFG.width / 2 - 0.07 - P.w / 2);
  // Lưng hộc cách tấm chắn gỗ 2 mm (tấm chắn ở z -0,29).
  const pz = -0.03;
  const y0 = 0.045;
  b.wood(UNIT_BOX, f, [px, y0 + P.h / 2, pz], [P.w, P.h, P.d], PEDESTAL);
  b.wood(UNIT_BOX, f, [px, y0 + P.h + 0.009, pz], [P.w + 0.004, 0.018, P.d + 0.004], PEDESTAL);
  const zf = pz + P.d / 2 + 0.006;
  let top = y0 + P.h - 0.008;
  [0.13, 0.13, P.h - 0.29].forEach((h, k) => {
    b.wood(UNIT_BOX, f, [px, top - h / 2, zf], [P.w - 0.014, h - 0.008, 0.012], DRAWER);
    b.add(UNIT_BOX, f, [px, top - 0.028, zf + 0.012], [0.1, 0.012, 0.012], CHROME, 'chrome');
    if (k === 0) b.add(CYL6, f, [px + side * 0.14, top - 0.05, zf + 0.008], [0.009, 0.012, 0.009], CHROME, 'chrome', [Math.PI / 2, 0, 0]);
    top -= h;
  });
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      b.add(CYL6, f, [px + dx * (P.w / 2 - 0.05), 0.021, pz + dz * (P.d / 2 - 0.06)], [0.021, 0.018, 0.021], BLACK, 'rubber', [0, 0, Math.PI / 2]);
    }
  }
  c.sh.addLocal(f, px, pz, P.w + 0.12, P.d + 0.12, 0.5);
}

/** Ghế xoay lưng lưới. Khung ghế quay về -z local (phía bàn). pedSide: phía hộc tủ (+1 bên +x local). */
function addChair(c: Ctx, f: THREE.Matrix4, pedSide: number): void {
  const { b, rng } = c;
  const cx = jitter(rng, CFG.chairShift);
  const cz = CFG.chairOffset + jitter(rng, CFG.chairPullJitter);
  // Xoay lệch hẳn thì quay góc trước của đệm về phía để chân (không có hộc tủ), tránh chạm mặt ngăn kéo.
  const wide = rng() < CFG.chairYawWideChance;
  const yaw = wide ? -pedSide * (0.6 + 0.4 * rng()) * CFG.chairYawWide : jitter(rng, CFG.chairYaw);
  const cf = sub(f, cx, 0, cz, yaw);
  const baseYaw = rng() * ((Math.PI * 2) / 5);
  for (let k = 0; k < 5; k++) {
    const a = baseYaw + (k * Math.PI * 2) / 5;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    b.add(UNIT_BOX, cf, [dx * 0.16, 0.075, dz * 0.16], [0.04, 0.03, 0.3], BLACK, 'gloss', [0, a, 0]);
    b.add(UNIT_BOX, cf, [dx * 0.3, 0.056, dz * 0.3], [0.02, 0.03, 0.03], BLACK, 'plastic', [0, a, 0]);
    b.add(CYL6, cf, [dx * 0.3, 0.027, dz * 0.3], [0.026, 0.024, 0.026], BLACK, 'rubber', [0, a, Math.PI / 2]);
  }
  b.add(CYL12, cf, [0, 0.085, 0], [0.045, 0.05, 0.045], BLACK, 'plastic');
  b.add(CYL12, cf, [0, 0.17, 0], [0.03, 0.14, 0.03], BLACK, 'plastic');
  b.add(CYL12, cf, [0, 0.29, 0], [0.02, 0.2, 0.02], CHROME, 'chrome');
  b.add(UNIT_BOX, cf, [0, 0.375, 0.02], [0.2, 0.05, 0.22], BLACK, 'plastic');
  b.add(UNIT_BOX, cf, [0, 0.41, 0], [0.48, 0.025, 0.46], BLACK, 'plastic');
  b.add(UNIT_BOX, cf, [0, 0.45, 0.005], [0.46, 0.055, 0.43], CHAIR_SEAT, 'fabric');
  b.add(CYL12, cf, [0, 0.447, -0.215], [0.028, 0.46, 0.028], CHAIR_SEAT, 'fabric', [0, 0, Math.PI / 2]);
  // Thanh đỡ lưng và lưng lưới khung cong, ngả sau 0,12 rad.
  b.add(UNIT_BOX, cf, [0, 0.47, 0.25], [0.07, 0.16, 0.025], BLACK, 'plastic', [0.12, 0, 0]);
  b.mesh(CHAIR_BACK, cf, [0, 0.76, 0.27], [1, 1, 1], CHAIR_MESH, [0.12, 0, 0]);
  b.add(CHAIR_FRAME, cf, [0, 0.76, 0.27], [1, 1, 1], BLACK, 'plastic', [0.12, 0, 0]);
  for (const s of [-1, 1]) {
    b.add(UNIT_BOX, cf, [s * 0.225, 0.415, 0.07], [0.06, 0.025, 0.045], BLACK, 'plastic');
    b.add(UNIT_BOX, cf, [s * 0.25, 0.53, 0.07], [0.028, 0.22, 0.045], BLACK, 'plastic');
    b.add(UNIT_BOX, cf, [s * 0.25, 0.65, 0.03], [0.065, 0.025, 0.25], BLACK, 'rubber');
  }
  c.sh.addLocal(f, cx, cz, 0.68, 0.68, 0.42, yaw);
}

/** Màn hình đen có độ dày, gù sau, chân đế hoặc tay đỡ kẹp mép bàn. Mặt hướng +z local. */
function addMonitor(c: Ctx, f: THREE.Matrix4, x: number, z: number, yaw: number, w: number, h: number, cell: ScreenCell | null, arm: boolean): void {
  const { b, t } = c;
  const mf = sub(f, x, t, z, yaw);
  const y = (arm ? 0.2 : 0.13) + h / 2;
  if (arm) {
    b.add(CYL8, mf, [0, 0.25, -0.13], [0.016, 0.5, 0.016], METAL, 'metal');
    b.add(UNIT_BOX, mf, [0, y, -0.085], [0.035, 0.03, 0.1], METAL, 'metal');
    b.add(UNIT_BOX, mf, [0, -0.04, -0.14], [0.05, 0.05, 0.06], METAL, 'metal');
  } else {
    b.add(UNIT_BOX, mf, [0, 0.007, 0.01], [0.23, 0.014, 0.18], DARK2, 'plastic');
    b.add(UNIT_BOX, mf, [0, 0.09, -0.04], [0.05, 0.17, 0.022], DARK2, 'plastic', [-0.08, 0, 0]);
  }
  b.add(UNIT_BOX, mf, [0, y, 0], [w, h, 0.022], BEZEL, 'gloss');
  b.add(UNIT_BOX, mf, [0, y - h * 0.08, -0.026], [w * 0.5, h * 0.55, 0.032], DARK2, 'plastic');
  const sp: V3 = [0, y + 0.007, 0.0115];
  if (cell) b.screen(mf, sp, w - 0.018, h - 0.034, cell);
  else b.add(UNIT_PLANE, mf, sp, [w - 0.018, h - 0.034, 1], '#ffffff', 'screenOff');
}

/** Laptop trên giá nhôm nghiêng, nắp mở. */
function addLaptop(c: Ctx, f: THREE.Matrix4, x: number, z: number, cell: ScreenCell | null): void {
  const { b, t, rng } = c;
  const lf = sub(f, x, t, z, jitter(rng, 0.08));
  const body = rng() < 0.5 ? '#c5c8cc' : '#2a2d33';
  b.add(UNIT_BOX, lf, [-0.1, 0.0475, -0.112], [0.012, 0.095, 0.012], METAL, 'metal');
  b.add(UNIT_BOX, lf, [0.1, 0.0475, -0.112], [0.012, 0.095, 0.012], METAL, 'metal');
  b.add(UNIT_BOX, lf, [0, 0.0125, 0.112], [0.24, 0.025, 0.015], METAL, 'metal');
  const tf = sub(lf, 0, 0.06, 0, 0, 0.3);
  b.add(UNIT_BOX, tf, [0, 0, 0], [0.25, 0.008, 0.24], METAL, 'metal');
  b.add(UNIT_BOX, tf, [0, 0.012, 0], [0.32, 0.016, 0.22], body, 'gloss');
  b.add(UNIT_BOX, tf, [0, 0.0205, 0.02], [0.28, 0.002, 0.1], DARK2, 'plastic');
  const lid = sub(tf, 0, 0.02, -0.11, 0, -0.5);
  b.add(UNIT_BOX, lid, [0, 0.105, -0.004], [0.32, 0.21, 0.007], body, 'gloss');
  const sp: V3 = [0, 0.11, 0.0001];
  if (cell) b.screen(lid, sp, 0.29, 0.18, cell);
  else b.add(UNIT_PLANE, lid, sp, [0.29, 0.18, 1], '#ffffff', 'screenOff');
}

/** Bàn phím rời (dải phím) và chuột. y0 là mặt đặt (mặt bàn hoặc tấm lót). */
function addKeyboardMouse(c: Ctx, f: THREE.Matrix4, x: number, z: number, y0: number): void {
  const { b, rng } = c;
  const kf = sub(f, x, y0, z, jitter(rng, 0.05));
  b.add(UNIT_BOX, kf, [0, 0.009, 0], [0.44, 0.018, 0.14], DARK2, 'plastic');
  for (let i = 0; i < 5; i++) b.add(UNIT_BOX, kf, [0, 0.0205, -0.05 + i * 0.025], [0.41, 0.005, 0.018], KEYCAP, 'plastic');
  b.add(UNIT_SPHERE, f, [x + 0.31 + jitter(rng, 0.02), y0 + 0.016, z + 0.02 + jitter(rng, 0.02)], [0.031, 0.017, 0.05], DARK2, 'gloss');
}

type Slot = 'LF' | 'RF' | 'LB' | 'RB';
const SLOT_POS: Record<Slot, [number, number]> = {
  LF: [-0.47, 0.2],
  RF: [0.5, 0.22],
  LB: [-0.47, -0.2],
  RB: [0.47, -0.2],
};

function addBottle(c: Ctx, f: THREE.Matrix4, x: number, z: number): void {
  const { b, t, rng } = c;
  b.add(CYL12, f, [x, t + 0.11, z], [0.034, 0.22, 0.034], pick(rng, ACCESSORY_COLORS.bottles), 'gloss');
  b.add(CYL12, f, [x, t + 0.24, z], [0.036, 0.04, 0.036], '#2a2d33', 'plastic');
}

function addMug(c: Ctx, f: THREE.Matrix4, x: number, z: number): void {
  const { b, t, rng } = c;
  const mf = sub(f, x, t, z, rng() * Math.PI * 2);
  b.add(CYL12, mf, [0, 0.0475, 0], [0.041, 0.095, 0.041], pick(rng, ACCESSORY_COLORS.mugs), 'ceramic');
  b.add(CYL12, mf, [0, 0.088, 0], [0.036, 0.002, 0.036], '#3b2a20', 'gloss');
  b.add(HALF_TORUS, mf, [0.041, 0.05, 0], [0.028, 0.03, 0.08], pick(rng, ACCESSORY_COLORS.mugs), 'ceramic', [0, 0, -Math.PI / 2]);
}

function addHeadphones(c: Ctx, f: THREE.Matrix4, x: number, z: number): void {
  const { b, t, rng } = c;
  const hf = sub(f, x, t, z, jitter(rng, 0.6));
  const col = pick(rng, ACCESSORY_COLORS.headphones);
  for (const s of [-1, 1]) b.add(CYL12, hf, [s * 0.075, 0.0175, 0], [0.042, 0.035, 0.042], col, 'plastic');
  b.add(HALF_TORUS, hf, [0, 0.03, 0], [0.075, 0.075, 0.075], col, 'plastic', [-Math.PI / 2, 0, 0]);
}

function addFan(c: Ctx, f: THREE.Matrix4, x: number, z: number): void {
  const { b, t, rng } = c;
  const ff = sub(f, x, t, z, -Math.sign(x) * 0.45 + jitter(rng, 0.15));
  const col = pick(rng, ACCESSORY_COLORS.fans);
  b.add(CYL12, ff, [0, 0.009, 0], [0.055, 0.018, 0.055], col, 'plastic');
  b.add(UNIT_BOX, ff, [0, 0.08, -0.01], [0.02, 0.13, 0.02], col, 'plastic');
  b.add(CYL12, ff, [0, 0.17, 0], [0.075, 0.03, 0.075], col, 'plastic', [Math.PI / 2, 0, 0]);
  b.add(CYL12, ff, [0, 0.17, 0], [0.064, 0.034, 0.064], '#c9ccd0', 'plastic', [Math.PI / 2, 0, 0]);
  b.add(CYL8, ff, [0, 0.17, 0.004], [0.02, 0.04, 0.02], col, 'plastic', [Math.PI / 2, 0, 0]);
}

function addSmallPlant(c: Ctx, f: THREE.Matrix4, x: number, z: number): void {
  const { b, t, rng } = c;
  const pf = sub(f, x, t, z, rng() * Math.PI * 2);
  b.add(CYL12, pf, [0, 0.0425, 0], [0.048, 0.085, 0.048], pick(rng, ACCESSORY_COLORS.pots), 'ceramic');
  b.add(CYL12, pf, [0, 0.086, 0], [0.043, 0.004, 0.043], SOIL, 'fabric');
  for (let k = 0; k < 6; k++) {
    const lf = sub(pf, 0, 0.1 + k * 0.012, 0, k * 2.4);
    b.add(UNIT_SPHERE, lf, [0, 0, 0.035], [0.028, 0.01, 0.055], k % 2 ? REAL.plantLeafLight : REAL.plantLeaf, 'leaf', [-0.45, 0, 0]);
  }
}

function addPenCup(c: Ctx, f: THREE.Matrix4, x: number, z: number): void {
  const { b, t, rng } = c;
  b.add(CYL12, f, [x, t + 0.05, z], [0.035, 0.1, 0.035], '#3b4a5e', 'plastic');
  for (let k = 0; k < 3; k++) {
    b.add(CYL6, f, [x + jitter(rng, 0.015), t + 0.09, z + jitter(rng, 0.015)], [0.004, 0.14, 0.004], pick(rng, PENS), 'plastic');
  }
}

function addPapers(c: Ctx, f: THREE.Matrix4, x: number, z: number): void {
  const { b, t, rng } = c;
  const n = 2 + Math.floor(rng() * 2);
  for (let k = 0; k < n; k++) {
    b.add(UNIT_BOX, f, [x + jitter(rng, 0.02), t + 0.001 + k * 0.0016, z + jitter(rng, 0.02)], [0.21, 0.0015, 0.297], PAPER, 'paper', [0, jitter(rng, 0.3), 0]);
  }
}

type Accessory = 'bottle' | 'mug' | 'headphones' | 'fan' | 'plant' | 'penCup';
/** Ô ưu tiên của từng món: đồ cao ở góc sau, đồ thấp ở góc trước. */
const PREFER: Record<Accessory, readonly Slot[]> = {
  bottle: ['LB', 'RB', 'LF', 'RF'],
  fan: ['LB', 'RB', 'LF'],
  plant: ['RB', 'LB', 'LF'],
  penCup: ['RB', 'LB', 'RF'],
  mug: ['RF', 'LF', 'RB', 'LB'],
  headphones: ['LF', 'RF'],
};
const ADDERS: Record<Accessory, (c: Ctx, f: THREE.Matrix4, x: number, z: number) => void> = {
  bottle: addBottle,
  mug: addMug,
  headphones: addHeadphones,
  fan: addFan,
  plant: addSmallPlant,
  penCup: addPenCup,
};

/** Một chỗ làm việc. f: khung chỗ ngồi (tâm bàn trên sàn, người ngồi phía +z local). */
function addWorkstation(c: Ctx, f: THREE.Matrix4, full: boolean, panel: boolean, bin: boolean): void {
  const { b, rng, t, variant } = c;
  const pedSide = rng() < CFG.pedestalRightChance ? 1 : -1;
  if (full && c.inst) {
    // Khung chỗ ngồi (bàn, hộc, ghế) do GLB đảm nhiệm. Thiết bị và đồ dùng vẫn rải theo seed ở dưới, gộp vào mesh atlas.
    c.inst[variant].push(f.clone());
    c.sh.addLocal(f, 0, 0, CFG.width + 0.14, CFG.depth + 0.14, 0.3);
    for (const sx of [-1, 1]) c.sh.addLocal(f, sx * (CFG.width / 2 - 0.045), 0, 0.14, CFG.depth, 0.3);
    if (bin) {
      const binSide = BAKED_PED_SIDE[variant];
      b.add(CYL12, f, [-binSide * 0.4, 0.14, -0.17], [0.11, 0.28, 0.11], REAL.binBody, 'plastic');
      b.add(CYL12, f, [-binSide * 0.4, 0.29, -0.17], [0.12, 0.025, 0.12], REAL.binBag, 'plastic');
      c.sh.addLocal(f, -binSide * 0.4, -0.17, 0.3, 0.3, 0.4);
    }
  } else if (full) {
    addDeskFrame(c, f, panel);
    addPedestal(c, f, pedSide);
    addChair(c, f, pedSide);
    c.sh.addLocal(f, 0, 0, CFG.width + 0.14, CFG.depth + 0.14, 0.3);
    for (const sx of [-1, 1]) c.sh.addLocal(f, sx * (CFG.width / 2 - 0.045), 0, 0.14, CFG.depth, 0.3);
    if (bin) {
      b.add(CYL12, f, [-pedSide * 0.4, 0.14, -0.17], [0.11, 0.28, 0.11], REAL.binBody, 'plastic');
      b.add(CYL12, f, [-pedSide * 0.4, 0.29, -0.17], [0.12, 0.025, 0.12], REAL.binBag, 'plastic');
      c.sh.addLocal(f, -pedSide * 0.4, -0.17, 0.3, 0.3, 0.4);
    }
  } else {
    b.wood(UNIT_BOX, f, [0, t - CFG.topThickness / 2, 0], [CFG.width - 0.004, CFG.topThickness, CFG.depth], WOOD);
  }

  if (c.bare) return;
  const setup = pickSetup(rng, variant);
  const free = new Set<Slot>(['LF', 'RF', 'LB', 'RB']);
  const cellOr = (cell: ScreenCell): ScreenCell | null => (rng() < ACCESSORY_CHANCE.screenOff ? null : cell);
  const mainCell: ScreenCell = variant;

  // Tấm lót bàn nỉ xám đậm dưới bàn phím (REAL_OFFICE_STYLE mục 2, real.deskmat).
  const mat = rng() < ACCESSORY_CHANCE.deskMat;
  const kx = -0.06;
  const kz = setup === 'laptop' ? 0.17 : 0.13;
  if (mat) b.add(UNIT_BOX, f, [kx + 0.04, t + 0.0015, kz - 0.02], [0.7, 0.003, 0.34], DESKMAT, 'fabric');
  const y0 = t + (mat ? 0.003 : 0);

  if (setup === 'single') {
    const wideScreen = variant === 'design';
    addMonitor(c, f, jitter(rng, 0.04), -0.17, jitter(rng, 0.06), wideScreen ? 0.62 : 0.54, wideScreen ? 0.36 : 0.32, cellOr(mainCell), false);
  } else if (setup === 'dual') {
    const arm = rng() < ACCESSORY_CHANCE.monitorArm;
    addMonitor(c, f, -0.275, -0.17, 0.12, 0.53, 0.31, cellOr(mainCell), arm);
    addMonitor(c, f, 0.275, -0.17, -0.12, 0.53, 0.31, cellOr('sheet'), arm);
    free.delete('LB');
    free.delete('RB');
  } else {
    addLaptop(c, f, -0.08, -0.1, cellOr('sheet'));
    addPapers(c, f, -0.44, -0.06);
    addMug(c, f, ...SLOT_POS.RB);
    free.delete('LF');
    free.delete('LB');
    free.delete('RB');
  }
  addKeyboardMouse(c, f, kx, kz, y0);

  const order: Accessory[] = ['bottle', 'mug', 'fan', 'headphones', 'plant', 'penCup'];
  const placed: Accessory[] = [];
  for (const a of order) {
    if (a === 'plant' && !c.plants) continue;
    if (rng() >= ACCESSORY_CHANCE[a]) continue;
    const slot = PREFER[a].find((s) => free.has(s));
    if (!slot) continue;
    free.delete(slot);
    placed.push(a);
    const [sx, sz] = SLOT_POS[slot];
    ADDERS[a](c, f, sx + jitter(rng, 0.02), sz + jitter(rng, 0.02));
  }
  c.sigs?.push(`${setup}${mat ? '+mat' : ''}:${placed.join(',')}`);
}

/** Hạt giống cố định của chỗ ngồi mẫu từng biến thể khi bake GLB (scripts/assets/bake-desk-variants.ts). */
export const BAKE_SEEDS: Record<DeskVariant, number> = { dev: 4, design: 2, ops: 5 };
export const DESK_VARIANTS: readonly DeskVariant[] = ['dev', 'design', 'ops'];
/** Độ cao mặt bàn mà GLB đã bake (CFG.height). Bàn có độ cao khác vẫn vẽ procedural. */
export const BAKED_DESK_HEIGHT = CFG.height;
/** Phía hộc tủ (1 phải, -1 trái) của chỗ ngồi mẫu đã bake, để đặt thùng rác ở phía đối diện. */
const BAKED_PED_SIDE: Record<DeskVariant, 1 | -1> = {
  dev: makeRng(BAKE_SEEDS.dev)() < CFG.pedestalRightChance ? 1 : -1,
  design: makeRng(BAKE_SEEDS.design)() < CFG.pedestalRightChance ? 1 : -1,
  ops: makeRng(BAKE_SEEDS.ops)() < CFG.pedestalRightChance ? 1 : -1,
};

/**
 * Hình học một chỗ làm việc đầy đủ của biến thể (bàn, hộc, ghế, màn hình, đồ dùng), gốc ở tâm bàn trên sàn,
 * ghế phía +z. Cùng mã với cảnh nên GLB bake ra giống hệt hình procedural (một chỗ, không vách chắn, không thùng rác).
 * Thuộc tính: position, normal, uv (trỏ vào atlas của buildDeskAtlas), color. Người gọi dispose.
 */
export function bakeWorkstationGeometry(variant: DeskVariant, seed: number = BAKE_SEEDS[variant]): THREE.BufferGeometry {
  const b = new AtlasBatch();
  const c: Ctx = { b, sh: new ShadowBatch(), rng: makeRng(seed), t: CFG.height, variant, plants: true, bare: true };
  addWorkstation(c, new THREE.Matrix4(), true, false, false);
  const geo = b.build();
  if (!geo) throw new Error('chỗ ngồi rỗng');
  return geo;
}

interface Built {
  meshes: THREE.Mesh[];
  owned: Disposable[];
  /** Vật liệu atlas, để gán env map phản chiếu (kim loại, nhựa bóng, màn hình tắt). */
  material: THREE.MeshStandardMaterial | null;
  /** Chữ ký đồ dùng từng chỗ ngồi. */
  sigs: string[];
}

/** Toàn bộ bàn của khu: một mesh atlas (bàn, hộc, ghế, thiết bị, đồ dùng) và một mesh bóng tiếp xúc. */
function populateDesks(
  desks: readonly DeskSpec[],
  b: AtlasBatch,
  sh: ShadowBatch,
  inst: Record<DeskVariant, THREE.Matrix4[]> | undefined,
  sigs?: string[],
): void {
  const origin = new THREE.Matrix4();
  for (const d of desks) {
    const rng = makeRng(d.seed);
    // Bàn có độ cao khác bản bake thì vẽ procedural như cũ.
    const useGlb = inst !== undefined && Math.abs(d.height - BAKED_DESK_HEIGHT) < 0.02;
    const c: Ctx = { b, sh, rng, t: d.height, variant: d.variant, plants: d.plants, inst: useGlb ? inst : undefined, sigs };
    const panel = rng() < CFG.modestyPanelChance;
    seatsOf(d).forEach((s, i) => {
      addWorkstation(c, sub(origin, s.x, 0, s.z, s.yaw), d.chairs, panel, d.chairs && i === 0);
    });
  }
}

/** Chữ ký cấu hình thiết bị và đồ dùng của từng chỗ ngồi (theo thứ tự bàn, chỗ). Xác định theo seed của bàn. */
export function deskSeatSignatures(desks: readonly DeskSpec[], glb = true): string[] {
  const sigs: string[] = [];
  populateDesks(desks, new AtlasBatch(), new ShadowBatch(), glb ? { dev: [], design: [], ops: [] } : undefined, sigs);
  return sigs;
}

function buildDeskField(desks: readonly DeskSpec[], extraShadows: readonly ShadowSpot[], glb: DeskGlbGeometries | null): Built {
  const b = new AtlasBatch();
  const sh = new ShadowBatch().addAll(extraShadows);
  const inst: Record<DeskVariant, THREE.Matrix4[]> | undefined = glb ? { dev: [], design: [], ops: [] } : undefined;
  const sigs: string[] = [];
  populateDesks(desks, b, sh, inst, sigs);

  const owned: Disposable[] = [];
  const meshes: THREE.Mesh[] = [];
  let material: THREE.MeshStandardMaterial | null = null;
  const geo = b.build();
  const instanced: Array<[DeskVariant, THREE.Matrix4[]]> = inst ? DESK_VARIANTS.map((v) => [v, inst[v]]) : [];
  const needAtlas = geo !== null || instanced.some(([, m]) => m.length > 0);
  const atlas = needAtlas ? buildDeskAtlas() : null;
  if (atlas) {
    material = atlas.material;
    owned.push(...atlas.owned);
  }
  if (geo && atlas) {
    owned.push(geo);
    const mesh = new THREE.Mesh(geo, atlas.material);
    mesh.name = 'desk-field';
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  if (glb && atlas) {
    for (const [v, mats] of instanced) {
      if (mats.length === 0) continue;
      const im = new THREE.InstancedMesh(glb[v], atlas.material, mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      // Các chỗ ngồi rải khắp khu, hình cầu bao của một bản sao ở gốc không đại diện: không cull theo hình cầu đó.
      im.frustumCulled = false;
      im.receiveShadow = true;
      im.name = `desk-glb-${v}`;
      meshes.push(im);
    }
  }
  const shadows = sh.build();
  if (shadows) {
    owned.push(...shadows.owned);
    meshes.push(shadows.mesh);
  }
  return { meshes, owned, material, sigs };
}

const NO_SHADOWS: readonly ShadowSpot[] = [];

/**
 * Mọi bàn làm việc và quầy dịch vụ của khu, vẽ chung trong 2 draw call.
 * extraShadows: bóng tiếp xúc của vật khác (tủ, cây, máy lọc nước của OfficeProps) gộp chung mesh bóng, đỡ 1 draw call.
 * Mảng desks và extraShadows phải ổn định (memo hoặc hằng), nếu không sẽ dựng lại mỗi lần render.
 */
export function DeskDecorField({
  desks,
  extraShadows = NO_SHADOWS,
}: {
  desks: readonly DeskSpec[];
  extraShadows?: readonly ShadowSpot[];
}) {
  const { source, geometries } = useDeskGlb();
  const built = useMemo(() => buildDeskField(desks, extraShadows, geometries), [desks, extraShadows, geometries]);
  useDisposeOnChange(built.owned);
  useEffect(() => {
    const instancedMeshes = built.meshes.filter((m) => (m as THREE.InstancedMesh).isInstancedMesh && m.name.startsWith('desk-glb-'));
    window.__gpbDeskGlb = {
      source,
      flag: deskGlbEnabled(location.search),
      instancedMeshes: instancedMeshes.length,
      instances: instancedMeshes.reduce((n, m) => n + (m as THREE.InstancedMesh).count, 0),
      signatures: built.sigs,
    };
  }, [built, source]);
  // Env map nướng từ trần đèn panel (dùng chung với sàn): khung thép, trụ ghế, viền màn hình có phản chiếu nhẹ.
  const env = useOfficeEnvMap();
  useEffect(() => {
    const m = built.material;
    if (!m) return;
    m.envMap = env;
    m.envMapIntensity = 0.7;
    m.needsUpdate = true;
  }, [built, env]);
  return (
    <>
      {built.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}

/** Một khối bàn đơn, dùng khi cần vẽ riêng. Khu có nhiều bàn nên dùng DeskDecorField để gom draw call. */
export function DeskDetail({
  position = [0, 0, 0],
  scale = 1,
  rotationY = 0,
  width = CFG.width,
  depth = CFG.pitch,
  height = CFG.height,
  seed = 1,
  variant = 'dev',
  chairs = true,
  plants = true,
}: DeskDetailProps) {
  const desks = useMemo<DeskSpec[]>(
    () => [{ id: '', x: 0, z: 0, width, depth, height, variant, seed, chairs, plants }],
    [width, depth, height, seed, variant, chairs, plants],
  );
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      <DeskDecorField desks={desks} />
    </group>
  );
}

export interface ServiceDeskDetailProps extends DecorBase {
  /** Chiều ngang quầy (m). Mặc định 4,5. */
  width?: number;
  /** Chiều sâu quầy (m). Mặc định 1,2. */
  depth?: number;
}

const SERVICE_TOP = 1.1;

/**
 * Thân quầy Service Desk (cao 1,1 m) và biển hiệu. Ba chỗ làm việc trên mặt quầy vẽ chung trong DeskDecorField,
 * xem deskSpecOf trong index.ts.
 */
export function ServiceDeskDetail({
  position = [0, 0, 0],
  scale = 1,
  rotationY = 0,
  width = 4.5,
  depth = 1.2,
}: ServiceDeskDetailProps) {
  const res = useMemo(() => {
    // Thân quầy gỗ sồi nhạt như tủ hồ sơ (REAL_OFFICE_STYLE.md mục 8).
    const bodyMat = new THREE.MeshStandardMaterial({ color: REAL.woodPedestal, roughness: 0.6 });
    const signTex = canvasTexture(512, 128, (ctx, w, h) => {
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fitFont(ctx, 'SERVICE DESK', w - 60, 64);
      ctx.fillText('SERVICE DESK', w / 2, h * 0.4);
      fitFont(ctx, 'Hỗ trợ IT · tạo ticket', w - 60, 34, 'normal');
      ctx.fillText('Hỗ trợ IT · tạo ticket', w / 2, h * 0.78);
    });
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    const owned: Disposable[] = [bodyMat, signTex, signMat];
    return { bodyMat, signMat, owned };
  }, []);
  useDisposeOnChange(res.owned);

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      <mesh
        geometry={UNIT_BOX}
        material={res.bodyMat}
        position={[0, (SERVICE_TOP - 0.03) / 2, 0]}
        scale={[width, SERVICE_TOP - 0.03, depth]}
      />
      <mesh geometry={UNIT_PLANE} material={res.signMat} position={[0, 0.6, depth / 2 + 0.005]} scale={[2.4, 0.6, 1]} />
    </group>
  );
}

export interface NocWallDetailProps extends DecorBase {
  /** Chiều dài tường (m, trục x). Mặc định 13,5. */
  width?: number;
  /** Hạt giống cho trạng thái ô (ảnh chụp tĩnh). */
  seed?: number;
}

const NOC_CY = 1.9; // tâm tường tính từ sàn (m)
const NOC_H = 2.4; // cao tường (m)
const NOC_COLS = 6;
const NOC_ROWS = 2;

/** Tường NOC: khung đen và 12 ô trạng thái (ảnh chụp tĩnh). Dữ liệu trực tiếp do lớp trên phủ lên. */
export function NocWallDetail({ position = [0, 0, 0], scale = 1, rotationY = 0, width = 13.5, seed = 7 }: NocWallDetailProps) {
  const res = useMemo(() => {
    const rng = makeRng(seed);
    const frameMat = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.5 });
    const titleTex = canvasTexture(1024, 80, (ctx, w, h) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      fitFont(ctx, 'NOC · Trạng thái dịch vụ', w - 40, 48);
      ctx.fillText('NOC · Trạng thái dịch vụ', 20, h / 2);
    });
    const titleMat = new THREE.MeshBasicMaterial({ map: titleTex });
    const tileMat = new THREE.MeshBasicMaterial();

    const innerW = width - 0.5;
    const tileW = innerW / NOC_COLS - 0.12;
    const tileH = 0.62;
    const rowY = [NOC_CY + 0.25, NOC_CY - 0.45];
    const tiles: Inst[] = [];
    for (let j = 0; j < NOC_ROWS; j++) {
      for (let i = 0; i < NOC_COLS; i++) {
        tiles.push({
          p: [-innerW / 2 + (i + 0.5) * (innerW / NOC_COLS), rowY[j], 0.105],
          s: [tileW, tileH, 1],
          c: pick(rng, STATUS),
        });
      }
    }
    const tileBatch = instanced(UNIT_PLANE, tileMat, tiles);
    const owned: Disposable[] = [frameMat, titleTex, titleMat, tileMat];
    return { frameMat, titleMat, tileBatch, owned };
  }, [width, seed]);
  useDisposeOnChange(res.owned);

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      <mesh geometry={UNIT_BOX} material={res.frameMat} position={[0, NOC_CY, 0]} scale={[width, NOC_H, 0.2]} />
      {res.tileBatch && <primitive object={res.tileBatch} />}
      <mesh
        geometry={UNIT_PLANE}
        material={res.titleMat}
        position={[-width / 2 + 2.3, NOC_CY + 0.95, 0.105]}
        scale={[4.2, 0.33, 1]}
      />
    </group>
  );
}
