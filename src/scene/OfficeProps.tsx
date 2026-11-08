// Đạo cụ văn phòng thật (docs/design/REAL_OFFICE_STYLE.md mục 5, room.txt mục 4): bình chữa cháy đôi trên giá đỏ,
// máy lọc nước kèm bình 19 L xanh, tủ hồ sơ cao gỗ sáng (trên cửa kính, dưới cánh kín), tủ thấp hai cánh, máy in phòng In ấn, TV đen treo
// tường, cây lá lớn chậu trắng, thùng rác túi đỏ, băng rôn khẩu hiệu và bảng tên bộ phận treo trần.
// Vị trí, footprint, nội dung bảng tên trong officePropsLayout.ts. Ô chặn đi lại gộp vào decorBlockersOf (src/env/index.ts).
//
// Draw call: 3 cố định, không phụ thuộc số đạo cụ.
//   1. Khối đặc (mọi đạo cụ, dây treo băng rôn và bảng tên): một mesh màu đỉnh.
//   2. Kính tủ, bình nước, mặt TV: một mesh màu đỉnh trong suốt, bóng (roughness 0,08).
//   3. Băng rôn và bảng tên: một mesh, một texture atlas cho mọi chữ, hai mặt quay lưng nhau để đọc được từ hai phía.
// Bóng tiếp xúc dưới tủ, cây, máy lọc nước, bình chữa cháy: OFFICE_PROP_SHADOWS (officePropsLayout.ts), vẽ chung mesh
// bóng của khu bàn (DeskDecorField), không tốn draw call riêng.
// Không đổ shadow map (giữ số lượt vẽ của shadow map), chỉ nhận bóng.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  canvasTexture,
  fitFont,
  makeRng,
  pick,
  UNIT_BOX,
  UNIT_CYL,
  UNIT_PLANE,
  UNIT_SPHERE,
  useDisposeOnChange,
  type Disposable,
} from '../env/shared';
import { LOD_BASE } from '../quality/graphics';
import { OFFICE_DAY_SCENE as R } from '../theme/tokens';
import { Batch, type V3 } from './entry/merge';
import { toWorldX, toWorldZ } from './layout';
import { useOfficeEnvMap } from './officeEnv';
import {
  BANNER,
  BANNER_SPOTS,
  BANNER_TEXTS,
  CEILING_Y,
  faceRotation,
  PROP_SPOTS,
  propSize,
  PRINTER_SIZE,
  TV,
  ZONE_SIGN,
  ZONE_SIGNS,
  type PropSpot,
  type ZoneSign,
} from './officePropsLayout';

const BLACK = '#1b1d21';
const STEEL = '#9aa0a6';
const LABEL = '#f2f2ee';
const TAP_HOT = '#c8262c';
const TAP_COLD = '#2a6fdb';
const SOIL = '#3a2c22';
const STEM = '#4a5a32';
const TV_BODY = '#1e2126';
const PRINTER_BODY = '#d8dbdf';
const PRINTER_UPPER = '#c4c8cd';
const PRINTER_LID = '#2d3036';
const BINDERS = ['#2b5797', '#1f2937', '#c0392b', '#e6b422', '#f4f4f2', '#2d9c6e', '#7a8796'];

/** Ma trận khung của đạo cụ: tâm footprint trên sàn, mặt trước local +z quay theo face. */
function frameOf(s: PropSpot): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), faceRotation(s.face));
  return new THREE.Matrix4().compose(new THREE.Vector3(toWorldX(s.x), 0, toWorldZ(s.y)), q, new THREE.Vector3(1, 1, 1));
}

/** Giá đỏ 0,5 x 0,25 m và hai bình chữa cháy cao 0,5 m. */
function addFire(solid: Batch, f: THREE.Matrix4): void {
  solid.add(UNIT_BOX, f, [0, 0.35, -0.11], [0.5, 0.7, 0.03], R.fireRed); // tấm lưng
  solid.add(UNIT_BOX, f, [0, 0.03, 0], [0.5, 0.06, 0.25], R.fireRed); // khay đáy
  solid.add(UNIT_BOX, f, [0, 0.1, 0.115], [0.5, 0.12, 0.02], R.fireRed); // gờ trước
  for (const x of [-0.12, 0.12]) {
    solid.add(UNIT_CYL, f, [x, 0.3, 0], [0.075, 0.48, 0.075], R.fireRed);
    solid.add(UNIT_CYL, f, [x, 0.56, 0], [0.03, 0.06, 0.03], BLACK); // van
    solid.add(UNIT_BOX, f, [x, 0.6, 0.01], [0.09, 0.02, 0.03], BLACK); // tay bóp
    solid.add(UNIT_BOX, f, [x + 0.065, 0.38, 0.05], [0.015, 0.34, 0.015], BLACK); // vòi
    solid.add(UNIT_BOX, f, [x, 0.3, 0.076], [0.08, 0.11, 0.004], LABEL); // nhãn
  }
}

/** Máy lọc nước 0,32 x 0,32 x 1,05 m có bình úp, cạnh đó hai bình 19 L dự phòng. */
function addWater(solid: Batch, glass: Batch, f: THREE.Matrix4): void {
  const mx = -0.33;
  solid.add(UNIT_BOX, f, [mx, 0.5, 0], [0.32, 1.0, 0.32], R.dispenser);
  solid.add(UNIT_BOX, f, [mx, 0.78, 0.161], [0.2, 0.2, 0.004], STEEL); // hốc vòi
  solid.add(UNIT_BOX, f, [mx - 0.05, 0.85, 0.17], [0.03, 0.04, 0.03], TAP_HOT);
  solid.add(UNIT_BOX, f, [mx + 0.05, 0.85, 0.17], [0.03, 0.04, 0.03], TAP_COLD);
  solid.add(UNIT_BOX, f, [mx, 0.69, 0.16], [0.2, 0.02, 0.06], STEEL); // khay hứng
  solid.add(UNIT_CYL, f, [mx, 1.025, 0], [0.1, 0.05, 0.1], R.dispenser); // cổ đỡ bình
  glass.add(UNIT_CYL, f, [mx, 1.08, 0], [0.03, 0.06, 0.03], R.waterBottle); // cổ bình úp
  glass.add(UNIT_CYL, f, [mx, 1.29, 0], [0.135, 0.36, 0.135], R.waterBottle);
  for (const x of [0.07, 0.37]) {
    glass.add(UNIT_CYL, f, [x, 0.2, 0], [0.135, 0.4, 0.135], R.waterBottle);
    glass.add(UNIT_CYL, f, [x, 0.44, 0], [0.03, 0.08, 0.03], R.waterBottle);
    solid.add(UNIT_CYL, f, [x, 0.49, 0], [0.033, 0.02, 0.033], TAP_COLD); // nắp
  }
}

/** Tủ hồ sơ cao 2,0 m, mỗi khoang 0,9 x 0,45 m: nửa dưới cánh gỗ đặc có khoá, nửa trên cửa kính khung gỗ. */
function addCabinet(solid: Batch, glass: Batch, f: THREE.Matrix4, bays: number, rng: () => number): void {
  const W = 0.9 * bays;
  const D = 0.45;
  const zf = D / 2 - 0.01; // mặt cánh
  solid.add(UNIT_BOX, f, [0, 1.0, -D / 2 + 0.01], [W, 2.0, 0.02], R.woodPedestal); // lưng
  solid.add(UNIT_BOX, f, [0, 1.985, 0], [W, 0.03, D], R.woodEdge); // nóc
  solid.add(UNIT_BOX, f, [0, 0.04, 0], [W - 0.02, 0.08, D - 0.02], R.woodEdge); // chân
  solid.add(UNIT_BOX, f, [0, 0.965, 0], [W, 0.03, D], R.woodPedestal); // đợt giữa
  for (let i = 0; i <= bays; i++) {
    solid.add(UNIT_BOX, f, [-W / 2 + 0.9 * i, 1.0, 0], [0.02, 2.0, D], R.woodPedestal); // vách
  }
  for (let i = 0; i < bays; i++) {
    const x0 = -W / 2 + 0.9 * (i + 0.5);
    for (const side of [-1, 1]) {
      const dx = x0 + side * 0.222;
      // Cánh dưới gỗ đặc, tay nắm, ổ khoá.
      solid.add(UNIT_BOX, f, [dx, 0.52, zf], [0.43, 0.86, 0.02], R.woodPedestal);
      solid.add(UNIT_BOX, f, [x0 + side * 0.03, 0.78, zf + 0.015], [0.015, 0.12, 0.012], STEEL);
      // Cánh trên: kính, khung gỗ bốn cạnh.
      glass.add(UNIT_BOX, f, [dx, 1.47, zf], [0.37, 0.9, 0.006], R.glassCabinet);
      solid.add(UNIT_BOX, f, [dx, 1.95, zf], [0.43, 0.03, 0.022], R.woodEdge);
      solid.add(UNIT_BOX, f, [dx, 1.0, zf], [0.43, 0.04, 0.022], R.woodEdge);
      solid.add(UNIT_BOX, f, [dx - 0.2, 1.47, zf], [0.03, 0.94, 0.022], R.woodEdge);
      solid.add(UNIT_BOX, f, [dx + 0.2, 1.47, zf], [0.03, 0.94, 0.022], R.woodEdge);
    }
    solid.add(UNIT_BOX, f, [x0, 0.88, zf + 0.012], [0.03, 0.03, 0.006], BLACK); // ổ khoá
    // Hai đợt bên trong và bìa hồ sơ trên mỗi đợt (nhìn qua kính).
    for (const y of [1.33, 1.67]) solid.add(UNIT_BOX, f, [x0, y, 0], [0.86, 0.02, D - 0.06], R.woodEdge);
    for (const y of [0.98, 1.34, 1.68]) {
      const n = 5 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) {
        const h = 0.24 + rng() * 0.05;
        solid.add(UNIT_BOX, f, [x0 - 0.36 + k * 0.085, y + h / 2, -0.02], [0.06, h, 0.3], pick(rng, BINDERS));
      }
    }
  }
}

/** Cây lá lớn: chậu sứ trắng Ø 0,44 m cao 0,42 m, 14 lá to bóng xoè từ 0,7 tới 1,45 m. */
function addPlant(solid: Batch, f: THREE.Matrix4, rng: () => number): void {
  solid.add(UNIT_CYL, f, [0, 0.21, 0], [0.22, 0.42, 0.22], R.potWhite);
  solid.add(UNIT_CYL, f, [0, 0.42, 0], [0.235, 0.04, 0.235], R.potWhite);
  solid.add(UNIT_CYL, f, [0, 0.435, 0], [0.2, 0.02, 0.2], SOIL);
  const leaves = 14;
  const yaw = new THREE.Matrix4();
  for (let k = 0; k < leaves; k++) {
    const a = k * 2.39996 + rng() * 0.3; // góc vàng: lá xoè đều quanh thân
    const t = k / (leaves - 1);
    const h = 0.72 + t * 0.7;
    const lf = f.clone().multiply(yaw.makeRotationY(a));
    // Cuống mảnh nghiêng ra ngoài, lá hình bầu dục dẹt nối ở đầu cuống.
    solid.add(UNIT_CYL, lf, [0, (0.44 + h) / 2, 0.04], [0.009, h - 0.44, 0.009], STEM, [0.12, 0, 0]);
    const tilt = -0.55 + t * 0.25 + (1 - t) * 0.6; // lá dưới rủ, lá trên vươn lên
    const color = k % 3 === 0 ? R.plantLeafLight : R.plantLeaf;
    solid.add(UNIT_SPHERE, lf, [0, h, 0.16], [0.11, 0.018, 0.17], color, [tilt, 0, 0]);
  }
}

/** Thùng rác nhựa Ø 0,28 m cao 0,32 m, túi đỏ lộn ra miệng. */
function addBin(solid: Batch, f: THREE.Matrix4): void {
  solid.add(UNIT_CYL, f, [0, 0.16, 0], [0.13, 0.32, 0.13], R.binBody);
  solid.add(UNIT_CYL, f, [0, 0.325, 0], [0.14, 0.03, 0.14], R.binBag);
}

/** TV 75 inch đen treo tường: thân đen mờ, mặt kính tối bóng (lô kính) phản chiếu đèn trần. Màn tắt. */
function addTv(solid: Batch, glass: Batch, f: THREE.Matrix4): void {
  solid.add(UNIT_BOX, f, [0, TV.centerY, -0.005], [TV.width, TV.height, TV.depth - 0.01], TV_BODY);
  solid.add(UNIT_BOX, f, [0, TV.centerY, -0.028], [0.4, 0.3, 0.004], STEEL); // giá treo
  glass.add(UNIT_BOX, f, [0, TV.centerY + 0.008, TV.depth / 2 - 0.004], [TV.width - 0.03, TV.height - 0.046, 0.004], '#0d0f12');
}

/** Tủ thấp hai cánh 0,8 x 0,45 x 0,8 m gỗ sáng, chân đế lùi, tay nắm thép đứng, ổ khoá. */
function addLowCab(solid: Batch, f: THREE.Matrix4): void {
  const W = 0.8;
  const D = 0.45;
  const H = 0.8;
  solid.add(UNIT_BOX, f, [0, 0.03, -0.01], [W - 0.04, 0.06, D - 0.04], R.woodEdge);
  solid.add(UNIT_BOX, f, [0, 0.06 + (H - 0.085) / 2, 0], [W, H - 0.085, D], R.woodPedestal);
  solid.add(UNIT_BOX, f, [0, H - 0.0125, 0], [W + 0.01, 0.025, D + 0.01], R.woodPedestal);
  for (const side of [-1, 1]) {
    solid.add(UNIT_BOX, f, [side * (W / 4), 0.06 + (H - 0.085) / 2, D / 2 + 0.009], [W / 2 - 0.012, H - 0.1, 0.018], R.woodEdge);
    solid.add(UNIT_BOX, f, [side * 0.035, H - 0.2, D / 2 + 0.025], [0.012, 0.12, 0.014], STEEL);
  }
  solid.add(UNIT_BOX, f, [0.09, H - 0.08, D / 2 + 0.019], [0.02, 0.02, 0.004], BLACK);
}

/** Máy in đa năng 0,7 x 0,55 x 0,83 m: thân tủ, khối quét có nắp, khay giấy và màn hình nhỏ ở mặt trước (+z). */
function addPrinter(solid: Batch, glass: Batch, f: THREE.Matrix4): void {
  const { d } = PRINTER_SIZE;
  const front = d / 2 - 0.1; // mặt trước của thân, chừa chỗ khay ló ra
  solid.add(UNIT_BOX, f, [0, 0.29, -0.05], [0.64, 0.58, d - 0.1], PRINTER_BODY); // thân tủ
  solid.add(UNIT_BOX, f, [0, 0.68, -0.05], [0.7, 0.2, d - 0.1], PRINTER_UPPER); // khối quét và in
  solid.add(UNIT_BOX, f, [0, 0.805, -0.05], [0.7, 0.03, d - 0.1], PRINTER_LID); // nắp
  solid.add(UNIT_BOX, f, [0, 0.45, front + 0.002], [0.5, 0.02, 0.004], BLACK); // khe ra giấy
  solid.add(UNIT_BOX, f, [0, 0.36, front + 0.075], [0.5, 0.03, 0.15], PRINTER_LID); // khay giấy
  solid.add(UNIT_BOX, f, [0, 0.385, front + 0.075], [0.4, 0.02, 0.11], LABEL); // xấp giấy
  solid.add(UNIT_BOX, f, [0.18, 0.7, front + 0.035], [0.2, 0.09, 0.07], PRINTER_LID); // bảng điều khiển
  glass.add(UNIT_BOX, f, [0.18, 0.705, front + 0.072], [0.13, 0.06, 0.004], '#16324a'); // màn hình
}

/** Một dòng của atlas chữ: băng rôn (640 x 128, tỉ lệ 5:1 như băng 3 x 0,6 m) hoặc bảng tên (640 x 240, 1,2 x 0,45 m). */
type AtlasRow = { kind: 'banner'; text: string; h: number } | { kind: 'sign'; sign: ZoneSign; h: number };

const ATLAS_W = 640;
const ATLAS_ROWS: readonly AtlasRow[] = [
  ...BANNER_TEXTS.map((text): AtlasRow => ({ kind: 'banner', text, h: 128 })),
  ...ZONE_SIGNS.map((sign): AtlasRow => ({ kind: 'sign', sign, h: 240 })),
];
/** Toạ độ y (px) mép trên của từng dòng. */
const ATLAS_Y0: readonly number[] = (() => {
  const out: number[] = [];
  let y = 0;
  for (const r of ATLAS_ROWS) {
    out.push(y);
    y += r.h;
  }
  return out;
})();
const ATLAS_H = ATLAS_ROWS.reduce((sum, r) => sum + r.h, 0);

/** Băng rôn: nền đỏ chuyển cam, chữ trắng, viền trắng mảnh. */
function drawBanner(ctx: CanvasRenderingContext2D, text: string, y0: number, h: number): void {
  const cw = ATLAS_W;
  const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, R.bannerRed);
  g.addColorStop(1, R.bannerOrange);
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, cw, h);
  ctx.strokeStyle = R.bannerText;
  ctx.lineWidth = 4;
  ctx.strokeRect(10, y0 + 10, cw - 20, h - 20);
  ctx.fillStyle = R.bannerText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, text, cw - 70, 64);
  ctx.fillText(text, cw / 2, y0 + h / 2);
}

/** Bảng tên bộ phận: nửa trên đỏ chuyển cam chữ trắng đậm, dải trắng dưới chữ xám (ảnh 19-01-02). Không logo. */
function drawSign(ctx: CanvasRenderingContext2D, sign: ZoneSign, y0: number, h: number): void {
  const cw = ATLAS_W;
  const top = Math.round(h * 0.68);
  const g = ctx.createLinearGradient(0, y0, cw, y0 + top);
  g.addColorStop(0, R.bannerRed);
  g.addColorStop(1, R.bannerOrange);
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, cw, top);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, y0 + top, cw, h - top);
  ctx.fillStyle = '#d9dcdf';
  ctx.fillRect(0, y0 + top, cw, 3);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = R.bannerText;
  fitFont(ctx, sign.title, cw - 60, 78);
  ctx.fillText(sign.title, 30, y0 + top / 2 + 4);
  ctx.fillStyle = '#4a4f57';
  fitFont(ctx, sign.subtitle, cw - 60, 40, 'normal');
  ctx.fillText(sign.subtitle, 30, y0 + top + (h - top) / 2 + 2);
}

function bannerTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(ATLAS_W, ATLAS_H, (ctx) => {
    ATLAS_ROWS.forEach((r, i) => {
      const y0 = ATLAS_Y0[i] ?? 0;
      if (r.kind === 'banner') drawBanner(ctx, r.text, y0, r.h);
      else drawSign(ctx, r.sign, y0, r.h);
    });
  });
  tex.anisotropy = 4;
  return tex;
}

/** Một tấm treo trần (băng rôn hoặc bảng tên): tâm thế giới, góc quay quanh Y, kích thước, dòng atlas. */
interface Hanging {
  x: number;
  y: number;
  z: number;
  yaw: number;
  w: number;
  h: number;
  row: number;
}

function hangings(): Hanging[] {
  const out: Hanging[] = [];
  for (const b of BANNER_SPOTS) {
    out.push({
      x: toWorldX(b.x),
      y: BANNER.bottom + BANNER.height / 2,
      z: toWorldZ(b.y),
      yaw: 0,
      w: BANNER.width,
      h: BANNER.height,
      row: b.text,
    });
  }
  ZONE_SIGNS.forEach((sg, i) => {
    out.push({
      x: toWorldX(sg.x),
      y: ZONE_SIGN.bottom + ZONE_SIGN.height / 2,
      z: toWorldZ(sg.y),
      yaw: sg.axis === 'x' ? Math.PI / 2 : 0,
      w: ZONE_SIGN.width,
      h: ZONE_SIGN.height,
      row: BANNER_TEXTS.length + i,
    });
  });
  return out;
}

/** Hình học tấm treo: mỗi tấm hai mặt quay lưng nhau, UV trỏ vào dòng của atlas. */
function bannerGeometry(): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const hg of hangings()) {
    const y0 = ATLAS_Y0[hg.row] ?? 0;
    const rowH = ATLAS_ROWS[hg.row]?.h ?? 0;
    const vTop = 1 - y0 / ATLAS_H;
    const vBottom = 1 - (y0 + rowH) / ATLAS_H;
    for (const side of [1, -1]) {
      const g = UNIT_PLANE.clone();
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, vBottom + uv.getY(i) * (vTop - vBottom));
      const yaw = hg.yaw + (side > 0 ? 0 : Math.PI);
      q.setFromAxisAngle(up, yaw);
      const off = 0.003;
      m.compose(
        new THREE.Vector3(hg.x + Math.sin(yaw) * off, hg.y, hg.z + Math.cos(yaw) * off),
        q,
        new THREE.Vector3(hg.w, hg.h, 1),
      );
      g.applyMatrix4(m);
      parts.push(g);
    }
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

/** Thanh treo và hai dây thép lên trần của mọi băng rôn và bảng tên, gộp vào lô khối đặc. */
function addBannerRigging(solid: Batch): void {
  const up = new THREE.Vector3(0, 1, 0);
  for (const hg of hangings()) {
    const top = hg.y + hg.h / 2;
    const len = CEILING_Y - top;
    const f = new THREE.Matrix4().compose(
      new THREE.Vector3(hg.x, 0, hg.z),
      new THREE.Quaternion().setFromAxisAngle(up, hg.yaw),
      new THREE.Vector3(1, 1, 1),
    );
    solid.add(UNIT_BOX, f, [0, top + 0.008, 0], [hg.w, 0.016, 0.014], LABEL);
    const dx = hg.w / 2 - 0.1;
    for (const ox of [-dx, dx]) {
      solid.add(UNIT_BOX, f, [ox, top + len / 2, 0] as V3, [0.004, len, 0.004], STEEL);
    }
  }
}

/**
 * Đạo cụ có bản tương tác riêng (src/scene/interact/objects/InteractObjects.tsx: tủ hồ sơ có ngăn kéo,
 * cây nước) thì không vẽ bản tĩnh ở đây, tránh hai mesh chồng nhau. Là phần tử đầu tiên của từng loại.
 */
export const INTERACTIVE_PROP_SPOTS: ReadonlySet<PropSpot> = new Set(
  (['cabinet', 'water'] as const).map((k) => PROP_SPOTS.find((s) => s.kind === k)).filter((s): s is PropSpot => s !== undefined),
);

function build() {
  const solid = new Batch();
  const glass = new Batch();
  const rng = makeRng(20261106);
  for (const s of PROP_SPOTS) {
    if (INTERACTIVE_PROP_SPOTS.has(s)) continue;
    const f = frameOf(s);
    switch (s.kind) {
      case 'fire':
        addFire(solid, f);
        break;
      case 'water':
        addWater(solid, glass, f);
        break;
      case 'cabinet':
        addCabinet(solid, glass, f, s.bays ?? propSize(s).w / 0.9, rng);
        break;
      case 'plant':
        addPlant(solid, f, rng);
        break;
      case 'bin':
        addBin(solid, f);
        break;
      case 'tv':
        addTv(solid, glass, f);
        break;
      case 'lowcab':
        addLowCab(solid, f);
        break;
      case 'printer':
        addPrinter(solid, glass, f);
        break;
    }
  }
  addBannerRigging(solid);

  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.04 });
  const glassMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.08,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const bannerTex = bannerTexture();
  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.85 });
  const geo = { solid: solid.build(), glass: glass.build(), banner: bannerGeometry() };
  const owned: Disposable[] = [solidMat, glassMat, bannerTex, bannerMat];
  for (const g of Object.values(geo)) if (g) owned.push(g);
  return { geo, solidMat, glassMat, bannerMat, owned };
}

/** Mọi đạo cụ văn phòng thật trong 3 draw call. Dựng một lần, dispose khi unmount. */
export function OfficeProps() {
  const res = useMemo(build, []);
  useDisposeOnChange(res.owned);
  // Kính tủ, bình nước, mặt TV phản chiếu lưới đèn trần (env map dùng chung với sàn), gỗ và nhựa thì không.
  const env = useOfficeEnvMap();
  useEffect(() => {
    res.glassMat.envMap = env;
    res.glassMat.envMapIntensity = 1;
    res.glassMat.needsUpdate = true;
  }, [res, env]);
  return (
    <group name="office-props">
      {res.geo.solid && <mesh geometry={res.geo.solid} material={res.solidMat} receiveShadow />}
      {res.geo.banner && <mesh geometry={res.geo.banner} material={res.bannerMat} userData={{ lodDetail: LOD_BASE.banner }} />}
      {res.geo.glass && <mesh geometry={res.geo.glass} material={res.glassMat} renderOrder={1} />}
    </group>
  );
}
