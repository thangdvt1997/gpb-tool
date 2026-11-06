// Atlas vật liệu dùng chung cho cả khu bàn: một MeshStandardMaterial, một lần vẽ cho mọi bàn, hộc tủ, ghế,
// màn hình và đồ dùng. Mỗi mảnh trỏ UV vào một vùng của atlas:
//   - Ô mẫu PBR (swatch): UV hằng ở tâm ô. Ô quy định độ nhám và độ kim loại (roughnessMap kênh G,
//     metalnessMap kênh B), màu lấy từ màu đỉnh. UV hằng nên đạo hàm bằng 0, luôn lấy mip 0, không loang màu.
//   - Vân gỗ: UV mặt hộp ánh xạ vào vùng vân gỗ (gỗ nhám 0,6, không clearcoat).
//   - Lưới ghế: vùng có lỗ trong kênh alpha, vật liệu dùng alphaTest để lưng ghế nhìn xuyên được.
//   - Màn hình: bốn ô giao diện giả lập chung (không dữ liệu thật), sáng nhờ emissiveMap.
//
// Atlas 1024 x 1024: hàng màn hình y 0–160, vân gỗ và lưới y 192–448, ô mẫu y 512–544.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture, makeRng, pick, UNIT_PLANE, type Disposable } from './shared';

const S = 1024;

/** Ô giao diện màn hình. dev: dòng mã, design: khối màu, ops: biểu đồ, sheet: bảng dữ liệu. */
export type ScreenCell = 'dev' | 'design' | 'ops' | 'sheet';
export const SCREEN_CELLS: readonly ScreenCell[] = ['dev', 'design', 'ops', 'sheet'];
const SCREEN_W = 256;
const SCREEN_H = 160;

/** Vật liệu PBR của ô mẫu: [độ nhám, độ kim loại]. */
export const SWATCHES = {
  /** Nhựa đen mờ: chân đế, bàn phím, khung ghế. */
  plastic: [0.5, 0],
  /** Nhựa bóng: viền màn hình, laptop, bình giữ nhiệt. */
  gloss: [0.26, 0],
  /** Thép sơn tĩnh điện bạc xám: khung chân bàn, tay đỡ màn hình. */
  metal: [0.42, 0.6],
  /** Kim loại sáng: trụ ghế, ổ khoá. */
  chrome: [0.2, 0.9],
  /** Nỉ đệm ghế, tấm lót bàn. */
  fabric: [0.92, 0],
  /** Sứ: cốc, chậu cây. */
  ceramic: [0.32, 0],
  /** Giấy. */
  paper: [0.95, 0],
  /** Lá cây. */
  leaf: [0.6, 0],
  /** Màn hình tắt: đen bóng, phản chiếu đèn trần. */
  screenOff: [0.12, 0],
  /** Cao su bánh xe. */
  rubber: [0.8, 0],
} as const;
export type Swatch = keyof typeof SWATCHES;
const SWATCH_LIST = Object.keys(SWATCHES) as Swatch[];
const SWATCH_PX = 32;
const SWATCH_Y = 512;

interface Px {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const WOOD_PX: Px = { x0: 0, y0: 192, x1: 512, y1: 448 };
const MESH_PX: Px = { x0: 576, y0: 192, x1: 832, y1: 448 };
const screenPx = (cell: ScreenCell): Px => {
  const i = SCREEN_CELLS.indexOf(cell);
  return { x0: i * SCREEN_W + 2, y0: 2, x1: (i + 1) * SCREEN_W - 2, y1: SCREEN_H - 2 };
};
const swatchPx = (s: Swatch): Px => {
  const i = SWATCH_LIST.indexOf(s);
  return { x0: i * SWATCH_PX, y0: SWATCH_Y, x1: (i + 1) * SWATCH_PX, y1: SWATCH_Y + SWATCH_PX };
};

/** Vùng UV (texture flipY: v = 1 ở mép trên canvas). */
interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}
const uvRect = (p: Px): UvRect => ({ u0: p.x0 / S, u1: p.x1 / S, v0: 1 - p.y1 / S, v1: 1 - p.y0 / S });
const uvCenter = (p: Px): [number, number] => [(p.x0 + p.x1) / 2 / S, 1 - (p.y0 + p.y1) / 2 / S];

/** Nội dung màn hình giả lập. Không chữ đọc được, không dữ liệu cá nhân. */
function drawScreen(ctx: CanvasRenderingContext2D, cell: ScreenCell, w: number, h: number, seed: number): void {
  const rng = makeRng(seed);
  // Thanh tiêu đề cửa sổ chung.
  const bar = (color: string): void => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, 12);
    ctx.fillStyle = '#ffffff88';
    for (let k = 0; k < 3; k++) ctx.fillRect(w - 14 - k * 10, 4, 6, 4);
  };
  if (cell === 'design') {
    ctx.fillStyle = '#fbf7f2';
    ctx.fillRect(0, 0, w, h);
    bar('#3a3f4b');
    const cols = ['#2b6cb0', '#dd6b20', '#2f855a', '#805ad5'];
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = pick(rng, cols);
      ctx.fillRect(12 + rng() * (w - 110), 20 + rng() * (h - 80), 40 + rng() * 50, 24 + rng() * 26);
    }
    ctx.fillStyle = '#dd6b20';
    ctx.beginPath();
    ctx.arc(w * 0.8, h * 0.6, 22, 0, Math.PI * 2);
    ctx.fill();
  } else if (cell === 'ops') {
    ctx.fillStyle = '#eef4f0';
    ctx.fillRect(0, 0, w, h);
    bar('#1f4f3a');
    ctx.strokeStyle = '#cbd5e0';
    ctx.lineWidth = 1;
    for (let g = 1; g < 4; g++) {
      ctx.beginPath();
      ctx.moveTo(0, 12 + ((h - 12) * g) / 4);
      ctx.lineTo(w, 12 + ((h - 12) * g) / 4);
      ctx.stroke();
    }
    ctx.strokeStyle = '#2f855a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    let y = h * 0.6;
    for (let x = 0; x <= w; x += 8) {
      y = Math.min(h - 14, Math.max(26, y + (rng() - 0.5) * 24));
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#2f855a';
    ctx.fillRect(w - 52, 20, 34, 12);
  } else if (cell === 'sheet') {
    ctx.fillStyle = '#f5f7fa';
    ctx.fillRect(0, 0, w, h);
    bar('#2f3b4f');
    ctx.fillStyle = '#e3e8ef';
    ctx.fillRect(0, 12, 40, h - 12);
    for (let r = 0; r < 6; r++) {
      ctx.fillStyle = '#a7b3c2';
      ctx.fillRect(8, 22 + r * 14, 24, 5);
    }
    for (let r = 0; r < 10; r++) {
      const y = 22 + r * 13;
      ctx.fillStyle = r % 2 === 0 ? '#ffffff' : '#eef2f6';
      ctx.fillRect(46, y - 3, w - 52, 13);
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = r === 0 ? '#5b6b80' : '#b6c0cc';
        ctx.fillRect(52 + c * 50, y + 1, 18 + rng() * 22, 4);
      }
    }
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(w - 50, h - 18, 40, 10);
  } else {
    ctx.fillStyle = '#f7f9fc';
    ctx.fillRect(0, 0, w, h);
    bar('#2d3748');
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 12, 28, h - 12);
    const cols = ['#2b6cb0', '#805ad5', '#2f855a', '#718096', '#c05621'];
    for (let row = 0; row < 11; row++) {
      const y = 20 + row * 12;
      let x = 40 + Math.floor(rng() * 3) * 12;
      ctx.fillStyle = '#a0aec0';
      ctx.fillRect(6, y, 12, 5);
      const parts = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < parts; k++) {
        const len = 16 + rng() * 40;
        ctx.fillStyle = pick(rng, cols);
        ctx.fillRect(x, y, len, 5);
        x += len + 6;
      }
    }
  }
}

/** Vân gỗ melamine sồi nhạt: nền gần trắng (nhân với màu đỉnh), vân thẳng mảnh, rất nhẹ. */
function drawWood(ctx: CanvasRenderingContext2D, p: Px): void {
  const rng = makeRng(424242);
  const w = p.x1 - p.x0;
  const h = p.y1 - p.y0;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(p.x0, p.y0, w, h);
  // Dải sáng tối rộng, rất mờ, để mặt bàn không phẳng lì.
  for (let k = 0; k < 14; k++) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(170,140,95,0.05)' : 'rgba(255,255,255,0.35)';
    ctx.fillRect(p.x0, p.y0 + rng() * h, w, 4 + rng() * 14);
  }
  // Vân mảnh lượn nhẹ chạy theo chiều dài (trục u).
  for (let k = 0; k < 70; k++) {
    const y0 = p.y0 + rng() * h;
    const amp = 1 + rng() * 3;
    const freq = 0.004 + rng() * 0.01;
    const ph = rng() * 6.28;
    ctx.strokeStyle = `rgba(150,118,78,${(0.05 + rng() * 0.09).toFixed(3)})`;
    ctx.lineWidth = 0.6 + rng() * 1.1;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = y0 + Math.sin(x * freq + ph) * amp;
      if (x === 0) ctx.moveTo(p.x0 + x, y);
      else ctx.lineTo(p.x0 + x, y);
    }
    ctx.stroke();
  }
}

/** Lưới ghế: sợi đặc (alpha 1) xen lỗ trong suốt (alpha 0). 16 ô mỗi cạnh, ô khoảng 2,8 cm trên lưng ghế. */
function drawMesh(ctx: CanvasRenderingContext2D, p: Px): void {
  const n = 16;
  const cw = (p.x1 - p.x0) / n;
  const ch = (p.y1 - p.y0) / n;
  ctx.clearRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i <= n; i++) {
    ctx.fillRect(p.x0 + i * cw - 3, p.y0, 6, p.y1 - p.y0);
    ctx.fillRect(p.x0, p.y0 + i * ch - 3, p.x1 - p.x0, 6);
  }
}

export interface DeskAtlas {
  material: THREE.MeshStandardMaterial;
  owned: Disposable[];
}

/** Tạo ba texture (màu, phát sáng, nhám/kim loại) và vật liệu chung. Người gọi dispose qua owned. */
export function buildDeskAtlas(): DeskAtlas {
  const map = canvasTexture(S, S, (ctx) => {
    // Nền trắng đặc: mip xa của vùng gỗ và ô mẫu không loang alpha 0 (alphaTest sẽ đục lỗ mép bàn).
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, S, S);
    // Màn hình bật: mặt kính tối, nội dung đi qua emissiveMap.
    ctx.fillStyle = '#121418';
    ctx.fillRect(0, 0, S, SCREEN_H);
    drawWood(ctx, WOOD_PX);
    drawMesh(ctx, MESH_PX);
    for (const s of SWATCH_LIST) {
      const p = swatchPx(s);
      ctx.fillStyle = s === 'screenOff' ? '#15171b' : '#ffffff';
      ctx.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
    }
  });
  const emissiveMap = canvasTexture(S, S, (ctx) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, S, S);
    SCREEN_CELLS.forEach((cell, i) => {
      ctx.save();
      ctx.translate(i * SCREEN_W, 0);
      ctx.beginPath();
      ctx.rect(0, 0, SCREEN_W, SCREEN_H);
      ctx.clip();
      drawScreen(ctx, cell, SCREEN_W, SCREEN_H, 17 + i);
      ctx.restore();
    });
  });
  const orm = canvasTexture(S, S, (ctx) => {
    const fill = (p: Px, rough: number, metal: number): void => {
      ctx.fillStyle = `rgb(255,${Math.round(rough * 255)},${Math.round(metal * 255)})`;
      ctx.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
    };
    fill({ x0: 0, y0: 0, x1: S, y1: S }, 0.6, 0);
    fill({ x0: 0, y0: 0, x1: S, y1: SCREEN_H }, 0.18, 0);
    fill(WOOD_PX, 0.6, 0);
    fill(MESH_PX, 0.8, 0);
    for (const s of SWATCH_LIST) fill(swatchPx(s), SWATCHES[s][0], SWATCHES[s][1]);
  });
  // Độ nhám và kim loại là dữ liệu tuyến tính.
  orm.colorSpace = THREE.NoColorSpace;
  for (const t of [map, emissiveMap, orm]) t.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map,
    emissiveMap,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.85,
    roughnessMap: orm,
    metalnessMap: orm,
    roughness: 1,
    metalness: 1,
    alphaTest: 0.5,
  });
  return { material, owned: [map, emissiveMap, orm, material] };
}

type UvMode = { kind: 'pt'; u: number; v: number } | { kind: 'rect'; r: UvRect };

interface Piece {
  geo: THREE.BufferGeometry;
  m: THREE.Matrix4;
  c: THREE.Color;
  uv: UvMode;
}

const tmpE = new THREE.Euler();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

export type V3 = [number, number, number];

const SWATCH_UV: Record<Swatch, UvMode> = Object.fromEntries(
  SWATCH_LIST.map((s) => {
    const [u, v] = uvCenter(swatchPx(s));
    return [s, { kind: 'pt', u, v } as UvMode];
  }),
) as Record<Swatch, UvMode>;
const WOOD_UV: UvMode = { kind: 'rect', r: uvRect(WOOD_PX) };
const MESH_UV: UvMode = { kind: 'rect', r: uvRect(MESH_PX) };
const SCREEN_UV: Record<ScreenCell, UvMode> = Object.fromEntries(
  SCREEN_CELLS.map((c) => [c, { kind: 'rect', r: uvRect(screenPx(c)) } as UvMode]),
) as Record<ScreenCell, UvMode>;

/**
 * Danh sách mảnh tĩnh của một khu bàn. Mỗi mảnh: hình học đơn vị, khung (local → thế giới), tâm p, kích thước s,
 * góc Euler XYZ r, màu đỉnh và vùng atlas. build() gộp tất cả thành một hình học (một draw call).
 */
export class AtlasBatch {
  private pieces: Piece[] = [];

  private push(geo: THREE.BufferGeometry, frame: THREE.Matrix4 | null, p: V3, s: V3, color: THREE.ColorRepresentation, uv: UvMode, r?: V3): void {
    tmpE.set(r?.[0] ?? 0, r?.[1] ?? 0, r?.[2] ?? 0);
    tmpQ.setFromEuler(tmpE);
    const m = new THREE.Matrix4().compose(tmpP.set(p[0], p[1], p[2]), tmpQ, tmpS.set(s[0], s[1], s[2]));
    if (frame) m.premultiply(frame);
    this.pieces.push({ geo, m, c: new THREE.Color(color), uv });
  }

  /** Mảnh một màu với vật liệu PBR của ô mẫu. */
  add(geo: THREE.BufferGeometry, frame: THREE.Matrix4 | null, p: V3, s: V3, color: THREE.ColorRepresentation, sw: Swatch, r?: V3): this {
    this.push(geo, frame, p, s, color, SWATCH_UV[sw], r);
    return this;
  }

  /** Mảnh gỗ có vân (UV mặt ánh xạ vào vùng vân gỗ, nhân với màu đỉnh). */
  wood(geo: THREE.BufferGeometry, frame: THREE.Matrix4 | null, p: V3, s: V3, color: THREE.ColorRepresentation, r?: V3): this {
    this.push(geo, frame, p, s, color, WOOD_UV, r);
    return this;
  }

  /** Mảnh lưới (lưng ghế), có lỗ qua alphaTest. */
  mesh(geo: THREE.BufferGeometry, frame: THREE.Matrix4 | null, p: V3, s: V3, color: THREE.ColorRepresentation, r?: V3): this {
    this.push(geo, frame, p, s, color, MESH_UV, r);
    return this;
  }

  /** Mặt màn hình bật (mặt phẳng hướng +z local), nội dung theo ô. */
  screen(frame: THREE.Matrix4 | null, p: V3, w: number, h: number, cell: ScreenCell, r?: V3): this {
    this.push(UNIT_PLANE, frame, p, [w, h, 1], '#ffffff', SCREEN_UV[cell], r);
    return this;
  }

  get size(): number {
    return this.pieces.length;
  }

  /** Gộp mọi mảnh thành một hình học (position, normal, uv, color). Trả null nếu rỗng. Người gọi dispose. */
  build(): THREE.BufferGeometry | null {
    if (this.pieces.length === 0) return null;
    const parts = this.pieces.map(({ geo, m, c, uv }) => {
      const g = geo.clone();
      g.applyMatrix4(m);
      const n = g.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const src = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
      const out = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        if (uv.kind === 'pt') {
          out[i * 2] = uv.u;
          out[i * 2 + 1] = uv.v;
        } else {
          const u = src ? src.getX(i) : 0;
          const v = src ? src.getY(i) : 0;
          out[i * 2] = uv.r.u0 + u * (uv.r.u1 - uv.r.u0);
          out[i * 2 + 1] = uv.r.v0 + v * (uv.r.v1 - uv.r.v0);
        }
      }
      g.setAttribute('uv', new THREE.BufferAttribute(out, 2));
      // Chỉ giữ thuộc tính chung để mergeGeometries không từ chối (ví dụ uv1 của vài hình học).
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name);
      }
      g.clearGroups();
      return g;
    });
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    if (merged) merged.computeBoundingSphere();
    return merged;
  }
}
