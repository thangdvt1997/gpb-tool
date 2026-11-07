/**
 * Dựng hình học procedural cho phụ kiện và mũ (three.js, không có React). Mọi hình học nằm trong không gian cục bộ
 * của mesh thân ở tư thế bind, đã bám sát cơ thể thật (đo từ đỉnh thân: đầu, cổ, thân theo góc, cổ tay, ngón),
 * nên tự co theo chiều cao, chibi và các morph thân. Gắn vào xương bằng accessoryRig.ts.
 */
import * as THREE from 'three';
import { getGarment } from '../../fashion/catalog';
import type { CharacterLook } from '../../fashion/types';
import { fitHat, type HatFit } from './accessoryHat';
import {
  BodyProbe,
  earPoint,
  faceFrontZ,
  headSlice,
  limbSection,
  measureHead,
  torsoSlice,
  type HeadFrame,
  type V3,
} from './accessoryMeasure';
import { fingerBoneName, type AccessoryEntry, type HatKind } from './accessoryPlan';
import { LAYER_GAP, REFERENCE_HEIGHT } from './coverage';
import { Region, type BodyData, type Classification } from './regions';
import { FIT_LOOSENESS, FIT_THICKNESS, shellClassOf } from './shellClass';

export type PartRole = 'main' | 'metal' | 'dark' | 'lens' | 'accent' | 'white' | 'band' | 'trim' | 'button';

export interface AccessoryPart {
  geometry: THREE.BufferGeometry;
  role: PartRole;
  /** Ghi đè màu (hex) cho phần không theo màu chính. */
  color?: string;
  doubleSided?: boolean;
  /** Ghi đè chất liệu của phần. */
  metal?: boolean;
}

export interface BuiltAccessory {
  entry: AccessoryEntry;
  /** Xương mesh làm con (phải nằm trong skeleton). */
  bone: string;
  parts: AccessoryPart[];
}

/** Bối cảnh dựng: dữ liệu thân (đã áp morph nếu có), đo đạc dùng chung. */
export interface BuildContext {
  data: BodyData;
  cls: Classification;
  head: HeadFrame;
  torso: BodyProbe;
  face: BodyProbe;
  /** Cỡ tương đối so với người 1,8 m. */
  bu: number;
  /** Khoảng hở trên thân do quần áo (m). */
  torsoClear: number;
  /** Khoảng hở quanh cẳng tay do tay áo dài (m). */
  sleeveClear: number;
  /** Đỉnh cổ y (gốc cổ) và y xương chậu. */
  yNeck: number;
  yPelvis: number;
  span: number;
}

/** Khoảng hở thêm tại thân/cẳng tay do các lớp áo đang mặc (đủ để phụ kiện nằm ngoài vỏ trang phục). */
export function clothingClearance(look: CharacterLook | null, bodyHeight: number): { torso: number; sleeve: number } {
  if (!look) return { torso: 0.002, sleeve: 0.002 };
  const scale = bodyHeight / REFERENCE_HEIGHT;
  let torso = 0;
  let sleeve = 0;
  for (const slot of ['inner', 'outer', 'onePiece', 'bottom'] as const) {
    const w = look.outfit[slot];
    if (!w) continue;
    const def = getGarment(w.garmentId);
    const spec = def ? shellClassOf(def) : undefined;
    if (!spec || !spec.part) continue;
    const t = (spec.thickness * FIT_THICKNESS[w.fit] + FIT_LOOSENESS[w.fit] + LAYER_GAP) * scale;
    torso += t;
    if (spec.sleeveFore > 0 && slot !== 'bottom') sleeve += t;
  }
  return { torso: torso + 0.002 * scale, sleeve: sleeve + 0.001 * scale };
}

export function makeBuildContext(data: BodyData, cls: Classification, look: CharacterLook | null): BuildContext {
  const head = measureHead(data, cls);
  const clr = clothingClearance(look, cls.bodyHeight);
  const jawY = head.minY + 0.1 * head.height;
  const torso = new BodyProbe(data, cls, (v) => {
    const r = cls.region[v];
    return r === Region.torso || r === Region.pelvis || r === Region.neck || (r === Region.head && data.positions[v * 3 + 1] < jawY);
  });
  const face = new BodyProbe(data, cls, (v) => cls.region[v] === Region.head);
  return {
    data,
    cls,
    head,
    torso,
    face,
    bu: cls.bodyHeight / REFERENCE_HEIGHT,
    torsoClear: clr.torso,
    sleeveClear: clr.sleeve,
    yNeck: cls.yNeck,
    yPelvis: cls.yPelvis,
    span: Math.max(1e-6, cls.yNeck - cls.yPelvis),
  };
}

/* ------------------------------------------------------------------ */
/* Hình học cơ sở                                                      */
/* ------------------------------------------------------------------ */

const vec = (p: V3): THREE.Vector3 => new THREE.Vector3(p[0], p[1], p[2]);

function tubeGeo(points: V3[], radius: number, closed = false, radial = 6): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map(vec), closed, 'centripetal');
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 4), radius, radial, closed);
}

function sphereAt(p: V3, r: number, seg = 10): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2));
  g.translate(p[0], p[1], p[2]);
  return g;
}

/** Hệ trục từ gốc, trục Y và gợi ý Z: Y là trục chính, Z vuông góc gần gợi ý nhất. */
function basis(origin: V3, yAxis: V3, zHint: V3): THREE.Matrix4 {
  const y = vec(yAxis).normalize();
  const h = vec(zHint);
  let z = h.clone().sub(y.clone().multiplyScalar(h.dot(y)));
  if (z.lengthSq() < 1e-6) z = new THREE.Vector3(0, 0, 1).sub(y.clone().multiplyScalar(y.z));
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  m.setPosition(origin[0], origin[1], origin[2]);
  return m;
}

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + h - rr);
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  s.lineTo(x + rr, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - rr);
  s.lineTo(x, y + rr);
  s.quadraticCurveTo(x, y, x + rr, y);
  return s;
}

/** Tấm bo góc w x h x d, tâm ở gốc, mặt phẳng xy, độ dày theo z, mép vát nhẹ. */
function slab(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const bevel = Math.min(d * 0.3, 0.003);
  const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * bevel, h - 2 * bevel, r), {
    depth: Math.max(1e-5, d - 2 * bevel),
    bevelEnabled: bevel > 1e-5,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.translate(0, 0, -(d - 2 * bevel) / 2);
  return g;
}

function smoothNormals(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeVertexNormals();
  return g;
}

/** Lưới tứ giác từ các hàng điểm (rows x cols). */
function gridGeo(pts: V3[][]): THREE.BufferGeometry {
  const rows = pts.length;
  const cols = pts[0].length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (const row of pts) for (const p of row) pos.push(p[0], p[1], p[2]);
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Dải băng theo đường đi: mỗi điểm có bề rộng và pháp tuyến bề mặt; dải trải ngang theo (tiếp tuyến x pháp tuyến). */
function ribbon(points: V3[], widths: number[], normals: V3[], closed = false): THREE.BufferGeometry {
  const n = points.length;
  const rows: V3[][] = [];
  for (let i = 0; i < n; i++) {
    const p = vec(points[i]);
    const a = vec(points[Math.max(0, i - 1)] ?? points[i]);
    const b = vec(points[Math.min(n - 1, i + 1)] ?? points[i]);
    if (closed) {
      a.copy(vec(points[(i - 1 + n) % n]));
      b.copy(vec(points[(i + 1) % n]));
    }
    const t = b.sub(a).normalize();
    const nr = vec(normals[i]).normalize();
    let s = new THREE.Vector3().crossVectors(t, nr);
    if (s.lengthSq() < 1e-8) s = new THREE.Vector3(1, 0, 0);
    s.normalize().multiplyScalar(widths[i] / 2);
    rows.push([
      [p.x - s.x, p.y - s.y, p.z - s.z],
      [p.x, p.y, p.z],
      [p.x + s.x, p.y + s.y, p.z + s.z],
    ]);
  }
  if (closed) rows.push(rows[0]);
  return gridGeo(rows);
}

function circlePts(center: V3, rx: number, rz: number, n: number, y?: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([center[0] + Math.sin(a) * rx, y ?? center[1], center[2] + Math.cos(a) * rz]);
  }
  return out;
}

/** Lathe elip từ các vòng (y, tâm, bán kính); vòng cuối có bán kính 0 thì khép đỉnh. */
function ringsGeo(rings: { y: number; cx: number; cz: number; rx: number; rz: number }[], segs = 28): THREE.BufferGeometry {
  const pts: V3[][] = rings.map((r) => {
    const row: V3[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      row.push([r.cx + Math.sin(a) * r.rx, r.y, r.cz + Math.cos(a) * r.rz]);
    }
    return row;
  });
  return gridGeo(pts);
}

/** Vòng dải quanh trục đứng: mặt cắt chữ nhật (cao h, dày th) bám theo đường viền bán kính r(theta). */
function bandAround(cx: number, cz: number, y: number, radii: number[], h: number, th: number): THREE.BufferGeometry {
  const n = radii.length;
  const rows: V3[][] = [];
  const at = (i: number, r: number, yy: number): V3 => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.sin(a) * r, yy, cz + Math.cos(a) * r];
  };
  for (let i = 0; i <= n; i++) {
    const k = i % n;
    const r = radii[k];
    // Chu vi mặt cắt: trong-dưới, ngoài-dưới, ngoài-trên, trong-trên, trong-dưới.
    rows.push([at(k, r, y - h / 2), at(k, r + th, y - h / 2), at(k, r + th, y + h / 2), at(k, r, y + h / 2), at(k, r, y - h / 2)]);
  }
  const cols = 5;
  const pos: number[] = [];
  const idx: number[] = [];
  for (const row of rows) for (const p of row) pos.push(p[0], p[1], p[2]);
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function smoothRadii(r: number[], passes = 2): number[] {
  let cur = r.slice();
  for (let p = 0; p < passes; p++) {
    cur = cur.map((_, i) => (cur[(i + cur.length - 1) % cur.length] + 2 * cur[i] + cur[(i + 1) % cur.length]) / 4);
  }
  return cur;
}

/** Đường viền bán kính của thân tại độ cao y (có làm mượt). */
function contour(ctx: BuildContext, cx: number, cz: number, y: number, n = 32, band = 0.012): number[] {
  const raw: number[] = [];
  for (let i = 0; i < n; i++) raw.push(ctx.torso.polar(cx, cz, y, (i / n) * Math.PI * 2, band, Math.PI / n + 0.1));
  return smoothRadii(raw, 3);
}

function xform(g: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  g.applyMatrix4(m);
  return g;
}

/* ------------------------------------------------------------------ */
/* Đầu và mặt                                                          */
/* ------------------------------------------------------------------ */

/** Tỉ lệ độ cao mắt trong vùng đầu (vùng đầu gồm cả đoạn cổ phía dưới). */
const EYE_FRAC = 0.54;

function buildEyewear(e: AccessoryEntry, ctx: BuildContext): AccessoryPart[] {
  const { head, data, cls } = ctx;
  const H = head.height;
  const k = e.size;
  const eyeY = head.minY + EYE_FRAC * H;
  const sl = headSlice(data, cls, eyeY, H * 0.03);
  const rx = sl.rx || head.rx;
  const unit = rx / 0.09;
  const ex = 0.4 * rx;
  const tr = 0.0014 * unit * k;
  const sun = e.shape === 'sun-square' || e.shape === 'sun-pilot';
  const round = e.shape === 'glasses-round';
  const lw = (round ? 0.05 : e.shape === 'sun-pilot' ? 0.056 : 0.052) * unit * k;
  const lh = (round ? 0.05 : e.shape === 'sun-pilot' ? 0.05 : e.shape === 'glasses-browline' ? 0.034 : 0.038) * unit * k;
  const parts: AccessoryPart[] = [];
  const frameRole: PartRole = e.material === 'metal' ? 'metal' : 'main';
  let zL = -Infinity;
  for (const s of [-1, 1]) zL = Math.max(zL, faceFrontZ(data, cls, eyeY, H * 0.03, 0.012, s * ex));
  const zNose = faceFrontZ(data, cls, eyeY, H * 0.03, 0.01, 0);
  const z = Math.max(zL, zNose - 0.012 * unit) + 0.009 * unit;
  const lensCenterY = eyeY;
  const lensPoint = (a: number, s: number): V3 => {
    // Đường viền thấu kính theo hình dạng, a trong [0, 2pi).
    const c = Math.cos(a);
    const sn = Math.sin(a);
    if (round) return [s * ex + (lw / 2) * c, lensCenterY + (lh / 2) * sn, z];
    if (e.shape === 'sun-pilot') {
      // Giọt nước: rộng ở trên, thu nhọn xuống phía mũi.
      const top = sn > 0 ? 1 : 0.8;
      return [s * ex + (lw / 2) * c * (1 + 0.1 * sn) , lensCenterY + (lh / 2) * sn * top - (sn < 0 ? 0 : 0), z];
    }
    // Chữ nhật bo góc (siêu elip bậc 4).
    const p = 4;
    const cx2 = Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
    const sy2 = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p);
    return [s * ex + (lw / 2) * cx2, lensCenterY + (lh / 2) * sy2, z];
  };
  const N = 28;
  for (const s of [-1, 1]) {
    const loop: V3[] = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      if (e.shape === 'glasses-browline') {
        // Nửa gọng: chỉ nửa trên đậm; nửa dưới là dây mảnh (vẽ riêng).
        loop.push(lensPoint(a, s));
        continue;
      }
      loop.push(lensPoint(a, s));
    }
    if (e.shape === 'glasses-browline') {
      const upper = loop.filter((_, i) => i <= N / 2 && i >= 0);
      parts.push({ geometry: tubeGeo([...upper, upper[0]].slice(0, upper.length), tr * 2.4, false), role: frameRole });
      const lower: V3[] = [];
      for (let i = N / 2; i <= N; i++) lower.push(lensPoint((i / N) * Math.PI * 2, s));
      parts.push({ geometry: tubeGeo(lower, tr * 0.5, false, 4), role: 'metal' });
    } else {
      parts.push({ geometry: tubeGeo(loop, sun ? tr * 1.6 : tr, true), role: frameRole });
    }
    if (sun) {
      const shape = new THREE.Shape(loop.map((p) => new THREE.Vector2(p[0], p[1])));
      const g = new THREE.ShapeGeometry(shape, 1);
      g.translate(0, 0, z - 0.0004);
      parts.push({ geometry: g, role: 'lens', doubleSided: true });
    }
    // Gọng càng: đi dọc hông đầu về phía tai.
    const mrg = 0.003 * unit;
    const aS = Math.asin(Math.min(0.97, (Math.abs(lensPoint(0, s)[0]) + 0.002) / (rx + mrg)));
    const path: V3[] = [[lensPoint(0, s)[0], lensCenterY + lh * 0.18, z]];
    for (let a = aS + 0.18; a <= Math.PI / 2 + 0.45; a += 0.3) {
      const px = sl.cx + s * Math.sin(a) * (rx + mrg);
      const pz = Math.min(z - 0.004 * unit, sl.cz + Math.cos(a) * (sl.rz + mrg));
      path.push([px, lensCenterY + lh * 0.18, pz]);
    }
    parts.push({ geometry: tubeGeo(path, tr * 0.9, false, 5), role: frameRole });
  }
  // Cầu mũi.
  parts.push({ geometry: tubeGeo([lensPoint(Math.PI, 1), [0, lensCenterY + lh * 0.12, z + 0.002 * unit], lensPoint(0, -1)], tr * 0.9, false, 5), role: frameRole });
  return parts;
}

function buildEarrings(e: AccessoryEntry, ctx: BuildContext): AccessoryPart[] {
  const side = e.side === 'r' ? 'r' : 'l';
  const ep = earPoint(ctx.data, ctx.cls, ctx.head, side);
  const sign = side === 'l' ? 1 : -1;
  const unit = ctx.head.height / 0.255;
  const k = e.size;
  // Dái tai nằm dưới cạnh ngoài của tai một chút, lệch vào trong.
  const lobe: V3 = [ep.x - sign * 0.0035 * unit, ep.lobeY + 0.004 * unit, ep.z + 0.004 * unit];
  if (e.shape === 'earring-stud') {
    return [{ geometry: sphereAt([lobe[0] + sign * 0.003 * unit, lobe[1], lobe[2]], 0.0042 * unit * k, 12), role: 'metal' }];
  }
  const R = 0.0105 * unit * k;
  const g = new THREE.TorusGeometry(R, 0.0014 * unit, 8, 22);
  // Vòng nằm trong mặt phẳng yz (đi qua dái tai), hơi xoay ra ngoài.
  g.rotateY(Math.PI / 2);
  g.translate(lobe[0] + sign * 0.002 * unit, lobe[1] - R, lobe[2]);
  return [{ geometry: g, role: 'metal' }];
}

function buildMask(e: AccessoryEntry, ctx: BuildContext): AccessoryPart[] {
  const { head, data, cls } = ctx;
  const H = head.height;
  const unit = H / 0.255;
  const noseY = head.minY + 0.5 * H;
  const chinY = head.minY + 0.14 * H;
  const mouth = headSlice(data, cls, head.minY + 0.3 * H, H * 0.03);
  const hw = (mouth.rx || head.rx) * 0.8;
  const rows = 10;
  const cols = 13;
  const pleats = e.shape === 'mask-pleated';
  const grid: V3[][] = [];
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const y = noseY + (chinY - noseY) * t;
    const row: V3[] = [];
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1) - 0.5;
      // Mép trên và dưới hơi thu vào hai bên.
      const edge = 1 - 0.18 * Math.pow(Math.abs(t - 0.5) * 2, 2);
      const x = u * 2 * hw * edge;
      let z = ctx.face.surfaceZ(x, y, true, 0.012 * unit);
      if (Number.isNaN(z)) z = head.frontZ - 0.02 * unit;
      const bump = pleats ? 0.0035 * unit * Math.sin(t * Math.PI * 3.2) : 0.002 * unit;
      row.push([x, y, z + 0.0025 * unit + bump * (1 - Math.pow(Math.abs(u) * 2, 4))]);
    }
    grid.push(row);
  }
  const parts: AccessoryPart[] = [{ geometry: gridGeo(grid), role: 'main', doubleSided: true }];
  for (const side of ['l', 'r'] as const) {
    const ep = earPoint(data, cls, head, side);
    const c = side === 'l' ? cols - 1 : 0;
    for (const t of [0.15, 0.85]) {
      const r = Math.round(t * (rows - 1));
      const a = grid[r][c];
      const sign = side === 'l' ? 1 : -1;
      const mid: V3 = [(a[0] + ep.x) / 2 + sign * 0.006 * unit, (a[1] + ep.y) / 2, (a[2] + ep.z) / 2];
      parts.push({ geometry: tubeGeo([a, mid, [ep.x + sign * 0.002 * unit, ep.y + (t < 0.5 ? 0.012 : -0.014) * unit, ep.z]], 0.0013 * unit, false, 4), role: 'main' });
    }
  }
  return parts;
}

function buildHeadphones(e: AccessoryEntry, ctx: BuildContext): AccessoryPart[] {
  const { head, data, cls } = ctx;
  const unit = head.height / 0.255;
  const studio = e.shape === 'headphones-studio';
  const k = e.size;
  const cupR = (studio ? 0.037 : 0.033) * unit * k;
  const cupW = (studio ? 0.026 : 0.022) * unit * k;
  const parts: AccessoryPart[] = [];
  const band = 0.0058 * unit;
  const eL = earPoint(data, cls, head, 'l');
  const eR = earPoint(data, cls, head, 'r');
  const earY = (eL.y + eR.y) / 2;
  const earZ = (eL.z + eR.z) / 2;
  const cupAt = (sx: number, cx: number, cy: number, cz: number, rotY: number): void => {
    const g = new THREE.CylinderGeometry(cupR, cupR, cupW, 24);
    g.rotateZ(Math.PI / 2);
    g.translate(sx * cupW * 0.5, 0, 0);
    parts.push({ geometry: xform(g, new THREE.Matrix4().makeRotationY(rotY).setPosition(cx, cy, cz)), role: 'main' });
    const pad = new THREE.CylinderGeometry(cupR * 0.86, cupR * 0.86, cupW * 0.35, 24);
    pad.rotateZ(Math.PI / 2);
    pad.translate(-sx * cupW * 0.1, 0, 0);
    parts.push({ geometry: xform(pad, new THREE.Matrix4().makeRotationY(rotY).setPosition(cx, cy, cz)), role: 'dark' });
    const cap = new THREE.CylinderGeometry(cupR * 0.62, cupR * 0.62, 0.0015 * unit, 20);
    cap.rotateZ(Math.PI / 2);
    cap.translate(sx * (cupW * 0.5 + 0.0008 * unit), 0, 0);
    parts.push({ geometry: xform(cap, new THREE.Matrix4().makeRotationY(rotY).setPosition(cx, cy, cz)), role: 'metal' });
  };
  if (e.state === 'around-neck') {
    // Đeo quanh cổ: băng đi sau gáy, hai chén phía trước xương đòn.
    const sec = limbSection(data, 'neck_01', 'head', 0.25);
    const cy = ctx.yNeck + 0.004;
    const ctr = sec.center;
    const r = ctx.torso.polar(ctr[0], ctr[2], cy, Math.PI, 0.02) + 0.01 * unit;
    const pts: V3[] = [];
    for (let a = -1.9; a <= 1.9; a += 0.2) {
      const aa = Math.PI + a;
      const rr = ctx.torso.polar(ctr[0], ctr[2], cy - 0.012 * unit * Math.abs(Math.sin(a)) * 3, aa, 0.02) + 0.01 * unit;
      pts.push([ctr[0] + Math.sin(aa) * rr, cy - 0.01 * unit * Math.abs(a), ctr[2] + Math.cos(aa) * rr]);
    }
    void r;
    parts.push({ geometry: tubeGeo(pts, band, false, 6), role: 'main' });
    for (const s of [-1, 1]) {
      const end = pts[s > 0 ? pts.length - 1 : 0];
      cupAt(0, end[0], end[1] - 0.012 * unit, end[2] + 0.004 * unit, s > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    return parts;
  }
  // Chén ôm tai: ngoài cạnh tai một chút.
  const gap = 0.004 * unit;
  cupAt(1, eL.x + gap, earY, earZ, 0);
  cupAt(-1, eR.x - gap, earY, earZ, 0);
  // Băng qua đỉnh đầu: elip trong mặt phẳng xy tại z của tai, đi qua đỉnh đầu cộng lề.
  const topSl = headSlice(data, cls, head.maxY - 0.04 * head.height, head.height * 0.05);
  const ax = Math.abs(eL.x - head.cx) + gap + cupW * 0.5;
  const ay = head.maxY + 0.012 * unit - earY;
  const pts: V3[] = [];
  const cz0 = topSl.count ? Math.min(earZ, topSl.cz) : earZ;
  for (let a = 0; a <= Math.PI + 1e-6; a += Math.PI / 16) {
    pts.push([head.cx + Math.cos(a) * ax, earY + Math.sin(a) * ay, cz0 + (earZ - cz0) * (1 - Math.sin(a))]);
  }
  pts.reverse();
  parts.push({ geometry: tubeGeo(pts, band, false, 6), role: 'main' });
  const pad = pts.slice(6, 11);
  parts.push({ geometry: tubeGeo(pad.map((p) => [p[0], p[1] - band * 1.1, p[2]] as V3), band * 0.8, false, 5), role: 'dark' });
  return parts;
}

/* ------------------------------------------------------------------ */
/* Mũ                                                                  */
/* ------------------------------------------------------------------ */

export function buildHat(e: AccessoryEntry, ctx: BuildContext): { parts: AccessoryPart[]; fit: HatFit } {
  const kind = (e.shape.replace('hat-', '') as HatKind);
  const fit = fitHat(kind, ctx.head, ctx.data, ctx.cls);
  const H = ctx.head.height;
  const hc = e.hatColors ?? {};
  const rings = fit.rings;
  const parts: AccessoryPart[] = [];
  const crownRole: PartRole = 'main';
  const ring0 = rings[0];
  parts.push({ geometry: ringsGeo(rings), role: crownRole, doubleSided: true });
  const thin = fit.thickness;
  switch (kind) {
    case 'cap': {
      // Lưỡi trai: nửa elip phía trước, hơi chúc xuống.
      const a = ring0.rx * 0.95;
      const rootZ = ring0.cz + ring0.rz * 0.35;
      const len = 0.42 * H;
      const sh = new THREE.Shape();
      sh.moveTo(-a, 0);
      const n = 18;
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * Math.PI;
        sh.lineTo(-a * Math.cos(t), (ring0.rz * 0.65 + len) * Math.sin(t) * 0.999 + 0.0);
      }
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012 * H, bevelEnabled: false, curveSegments: 4 });
      g.rotateX(Math.PI / 2); // y của hình thành +z (về phía trước), độ dày thành -y
      g.translate(ring0.cx, ring0.y + 0.002 * H, rootZ - ring0.rz * 0.35);
      const tilt = new THREE.Matrix4()
        .makeTranslation(0, ring0.y, ring0.cz + ring0.rz * 0.4)
        .multiply(new THREE.Matrix4().makeRotationX(0.12))
        .multiply(new THREE.Matrix4().makeTranslation(0, -ring0.y, -(ring0.cz + ring0.rz * 0.4)));
      parts.push({ geometry: xform(g, tilt), role: 'main', color: hc.brim, doubleSided: true });
      parts.push({ geometry: sphereAt([rings[rings.length - 2].cx, rings[rings.length - 2].y + 0.002 * H, rings[rings.length - 2].cz], 0.018 * H, 10), role: 'button', color: hc.button });
      break;
    }
    case 'beanie': {
      // Mép gập: dải dày hơn ở phần dưới.
      const bandRings = rings
        .filter((r) => r.y <= ring0.y + 0.2 * H)
        .map((r) => ({ ...r, rx: r.rx + thin * 0.55, rz: r.rz + thin * 0.55 }));
      if (bandRings.length >= 2) parts.push({ geometry: ringsGeo(bandRings), role: 'band', color: hc.band, doubleSided: true });
      break;
    }
    case 'bucket': {
      const edge = 0.5 * Math.min(ring0.rx, ring0.rz) + 0.12 * H;
      const droop = 0.12 * H;
      const brim = [
        { ...ring0, y: ring0.y + 0.01 * H },
        { ...ring0, y: ring0.y - 0.02 * H, rx: ring0.rx + edge * 0.5, rz: ring0.rz + edge * 0.5 },
        { ...ring0, y: ring0.y - droop, rx: ring0.rx + edge, rz: ring0.rz + edge },
        { ...ring0, y: ring0.y - droop - 0.008 * H, rx: ring0.rx + edge, rz: ring0.rz + edge },
        { ...ring0, y: ring0.y - 0.03 * H, rx: ring0.rx + edge * 0.5, rz: ring0.rz + edge * 0.5 },
      ];
      parts.push({ geometry: ringsGeo(brim), role: 'main', color: hc.brim, doubleSided: true });
      break;
    }
    case 'beret': {
      const top = rings[rings.length - 2];
      parts.push({ geometry: sphereAt([top.cx, top.y + 0.01 * H, top.cz], 0.014 * H, 8), role: 'button', color: hc.button });
      break;
    }
    case 'party': {
      const trimRings = rings
        .filter((r) => r.y <= ring0.y + 0.14 * H)
        .map((r) => ({ ...r, rx: r.rx + thin * 0.35, rz: r.rz + thin * 0.35 }));
      if (trimRings.length >= 2) parts.push({ geometry: ringsGeo(trimRings), role: 'trim', color: hc.trim, doubleSided: true });
      const apex = rings[rings.length - 2];
      parts.push({ geometry: sphereAt([apex.cx, apex.y, apex.cz], 0.026 * H, 10), role: 'trim', color: hc.trim });
      break;
    }
  }
  return { parts, fit };
}

/* ------------------------------------------------------------------ */
/* Cổ và thân                                                          */
/* ------------------------------------------------------------------ */

function torsoAxis(ctx: BuildContext, y: number): { cx: number; cz: number } {
  const s = torsoSlice(ctx.data, ctx.cls, y, 0.02);
  return { cx: s.cx, cz: s.cz };
}

function neckInfo(ctx: BuildContext): { cx: number; cz: number; y: number; r: number } {
  const sec = limbSection(ctx.data, 'neck_01', 'head', 0.3, 0.2, 'head');
  return { cx: sec.center[0], cz: sec.center[2], y: sec.center[1], r: sec.radius };
}

/** Bán kính cổ-thân tại góc và độ cao, ít nhất bằng bán kính cổ. */
function neckRadius(ctx: BuildContext, nk: { cx: number; cz: number; r: number }, theta: number, y: number): number {
  return Math.max(nk.r * 0.98, ctx.torso.polar(nk.cx, nk.cz, y, theta, 0.012, 0.3));
}

function buildNecklace(e: AccessoryEntry, ctx: BuildContext): AccessoryPart[] {
  const nk = neckInfo(ctx);
  const k = e.size;
  const bu = ctx.bu;
  const r = (e.shape === 'necklace-bold' ? 0.0036 : e.shape === 'necklace-tag' ? 0.0022 : 0.0017) * bu * k;
  const drop = (e.shape === 'necklace-thin' ? 0.04 : e.shape === 'necklace-tag' ? 0.07 : 0.05) * bu * k;
  const baseY = ctx.yNeck + 0.012 * bu;
  const n = 36;
  const pts: V3[] = [];
  let front: V3 = [0, baseY, 0];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const f = Math.pow(Math.max(0, Math.cos(th)), 2.5);
    const y = baseY - drop * f;
    const rr = neckRadius(ctx, nk, th, y) + ctx.torsoClear * 0.6 + r * 1.2;
    const p: V3 = [nk.cx + Math.sin(th) * rr, y, nk.cz + Math.cos(th) * rr];
    pts.push(p);
    if (i === 0) front = p;
  }
  const parts: AccessoryPart[] = [{ geometry: tubeGeo(pts, r, true, 6), role: 'metal' }];
  if (e.shape === 'necklace-bold') {
    // Mắt xích: các hạt nhỏ dọc dây.
    for (let i = 0; i < n; i += 2) parts.push({ geometry: sphereAt(pts[i], r * 1.35, 6), role: 'metal' });
  }
  if (e.shape === 'necklace-tag') {
    const g = slab(0.018 * bu * k, 0.03 * bu * k, 0.0025 * bu, 0.004);
    xform(g, new THREE.Matrix4().makeTranslation(front[0], front[1] - 0.016 * bu * k, front[2] + 0.005 * bu));
    parts.push({ geometry: g, role: 'metal' });
  }
  return parts;
}

function buildScarf(e: AccessoryEntry, ctx: BuildContext): AccessoryPart[] {
  const nk = neckInfo(ctx);
  const bu = ctx.bu;
  const k = e.size;
  const knit = e.shape === 'scarf-knit';
  const tr = (knit ? 0.017 : 0.011) * bu * k;
  const y0 = ctx.yNeck + 0.022 * bu;
  const n = 32;
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const rr = neckRadius(ctx, nk, th, y0) + tr * 0.9 + ctx.torsoClear * 0.5;
    pts.push([nk.cx + Math.sin(th) * rr, y0 + Math.sin(th * 2) * 0.004 * bu, nk.cz + Math.cos(th) * rr]);
  }
  const parts: AccessoryPart[] = [{ geometry: tubeGeo(pts, tr, true, 10), role: 'main' }];
  // Đuôi khăn rủ phía trước, bám bề mặt ngực.
  const len = (knit ? 0.2 : 0.3) * bu * k;
  const w = (knit ? 0.075 : 0.055) * bu * k;
  const px: V3[] = [];
  const ws: number[] = [];
  const ns: V3[] = [];
  const x0 = 0.03 * bu;
  const rows = 12;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const y = y0 - 0.01 * bu - len * t;
    const x = x0 + 0.01 * bu * t;
    let z = ctx.torso.surfaceZ(x, y, true, 0.014);
    if (Number.isNaN(z)) z = nk.cz + 0.1 * bu;
    px.push([x, y, z + ctx.torsoClear + tr * 0.9 + 0.003 * bu * (1 - t)]);
    ws.push(w * (1 - 0.1 * t));
    ns.push([0, 0.15, 1]);
  }
  parts.push({ geometry: ribbon(px, ws, ns), role: 'main', doubleSided: true });
  return parts;
}

function buildTie(e: AccessoryEntry, ctx: BuildContext): AccessoryPart[] {
  const bu = ctx.bu;
  const k = e.size;
  const nk = neckInfo(ctx);
  const topY = ctx.yNeck - 0.004 * bu;
  const front = (x: number, y: number): number => {
    const z = ctx.torso.surfaceZ(x, y, true, 0.014);
    return Number.isNaN(z) ? nk.cz + 0.1 * bu : z;
  };
  const cl = ctx.torsoClear + 0.002 * bu;
  if (e.shape === 'tie-bow') {
    const parts: AccessoryPart[] = [];
    const y = ctx.yNeck + 0.006 * bu;
    const z = front(0, y - 0.01 * bu) + cl + 0.006 * bu;
    const w = 0.034 * bu * k;
    const h = 0.024 * bu * k;
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.lineTo(s * w, h);
      sh.quadraticCurveTo(s * w * 1.1, 0, s * w, -h);
      sh.lineTo(0, 0);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.008 * bu, bevelEnabled: true, bevelSize: 0.002 * bu, bevelThickness: 0.002 * bu, bevelSegments: 1, curveSegments: 6 });
      g.translate(0, y, z - 0.004 * bu);
      parts.push({ geometry: g, role: 'main', doubleSided: true });
    }
    parts.push({ geometry: sphereAt([0, y, z + 0.004 * bu], 0.011 * bu * k, 10), role: 'main' });
    return parts;
  }
  const slim = e.shape === 'tie-slim';
  const knit = e.shape === 'tie-knit';
  const w0 = (slim ? 0.046 : knit ? 0.062 : 0.058) * bu * k;
  const len = (slim ? 0.27 : 0.3) * ctx.span * k;
  const rows = 16;
  const pts: V3[] = [];
  const ws: number[] = [];
  const ns: V3[] = [];
  const yKnot = topY - 0.022 * bu;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const y = yKnot - len * t;
    const z = front(0, y) + cl;
    pts.push([0, y, z]);
    let w = w0 * (0.5 + 0.5 * Math.min(1, t * 3.5)) * (1 + 0.55 * t * (knit ? 0 : 1));
    if (!knit && t > 0.9) w *= Math.max(0.05, 1 - (t - 0.9) * 9);
    ws.push(w);
    ns.push([0, 0.12, 1]);
  }
  const parts: AccessoryPart[] = [{ geometry: ribbon(pts, ws, ns), role: 'main', doubleSided: true }];
  // Nút thắt.
  const kz = front(0, yKnot + 0.01 * bu) + cl + 0.004 * bu;
  const knot = new THREE.SphereGeometry(1, 12, 10);
  knot.scale(w0 * 0.62, 0.02 * bu * k, 0.011 * bu);
  knot.translate(0, yKnot + 0.006 * bu, kz);
  parts.push({ geometry: knot, role: 'main' });
  return parts;
}

function buildBadge(e: AccessoryEntry, ctx: BuildContext): AccessoryPart[] {
  const bu = ctx.bu;
  const k = e.size;
  const nk = neckInfo(ctx);
  const front = (x: number, y: number): number => {
    const z = ctx.torso.surfaceZ(x, y, true, 0.014);
    return Number.isNaN(z) ? nk.cz + 0.1 * bu : z;
  };
  const cl = ctx.torsoClear + 0.002 * bu;
  const cw = 0.055 * bu * k;
  const ch = 0.085 * bu * k;
  const parts: AccessoryPart[] = [];
  const card = (cx: number, cy: number, tilt = 0): void => {
    const z = front(cx, cy) + cl;
    const g = slab(cw, ch, 0.003 * bu, 0.004 * bu);
    const m = new THREE.Matrix4().makeRotationZ(tilt).setPosition(cx, cy, z + 0.002 * bu);
    parts.push({ geometry: xform(g, m), role: 'white' });
    const stripe = slab(cw * 0.92, ch * 0.2, 0.0012 * bu, 0.002);
    parts.push({ geometry: xform(stripe, new THREE.Matrix4().makeRotationZ(tilt).setPosition(cx, cy + ch * 0.36, z + 0.0042 * bu)), role: 'accent' });
    const photo = slab(cw * 0.42, cw * 0.42, 0.0012 * bu, 0.002);
    parts.push({ geometry: xform(photo, new THREE.Matrix4().makeRotationZ(tilt).setPosition(cx - cw * 0.12, cy + ch * 0.02, z + 0.0042 * bu)), role: 'dark' });
  };
  if (e.shape === 'badge-lanyard') {
    const yc = ctx.yNeck - 0.2 * ctx.span;
    const wStrap = 0.014 * bu;
    for (const s of [-1, 1]) {
      const pts: V3[] = [];
      const ws: number[] = [];
      const ns: V3[] = [];
      const topX = s * (nk.r * 1.05);
      const rows = 10;
      for (let i = 0; i <= rows; i++) {
        const t = i / rows;
        const y = ctx.yNeck + 0.012 * bu - (ctx.yNeck + 0.012 * bu - (yc + ch * 0.55)) * t;
        const x = topX * (1 - t * 0.97);
        const zNear = front(x, y) + cl;
        pts.push([x, y, zNear + 0.003 * bu]);
        ws.push(wStrap);
        ns.push([0, 0.2, 1]);
      }
      parts.push({ geometry: ribbon(pts, ws, ns), role: 'main', doubleSided: true });
    }
    parts.push({ geometry: xform(slab(0.018 * bu, 0.008 * bu, 0.003 * bu, 0.002), new THREE.Matrix4().makeTranslation(0, yc + ch * 0.55, front(0, yc + ch * 0.55) + cl + 0.005 * bu)), role: 'metal' });
    card(0, yc);
  } else if (e.shape === 'badge-clip') {
    card(-0.085 * bu, ctx.yNeck - 0.16 * ctx.span, 0.04);
    const z = front(-0.085 * bu, ctx.yNeck - 0.16 * ctx.span + ch * 0.45) + cl;
    parts.push({ geometry: xform(slab(0.02 * bu, 0.012 * bu, 0.003 * bu, 0.002), new THREE.Matrix4().makeTranslation(-0.085 * bu, ctx.yNeck - 0.16 * ctx.span + ch * 0.5, z + 0.005 * bu)), role: 'metal' });
  } else {
    const x = 0.085 * bu;
    const y = ctx.yNeck - 0.1 * ctx.span;
    const z = front(x, y) + cl;
    const d = new THREE.CylinderGeometry(0.012 * bu * k, 0.012 * bu * k, 0.003 * bu, 20);
    d.rotateX(Math.PI / 2);
    d.translate(x, y, z + 0.0025 * bu);
    parts.push({ geometry: d, role: 'metal' });
    const star = new THREE.CylinderGeometry(0.006 * bu * k, 0.006 * bu * k, 0.0022 * bu, 5);
    star.rotateX(Math.PI / 2);
    star.translate(x, y, z + 0.0045 * bu);
    parts.push({ geometry: star, role: 'accent' });
  }
  return parts;
}

function buildBelt(e: AccessoryEntry, ctx: BuildContext): AccessoryPart[] {
  const bu = ctx.bu;
  const k = e.size;
  const y = ctx.yPelvis + 0.1 * ctx.span;
  const ax = torsoAxis(ctx, y);
  const h = (e.shape === 'belt-webbing' ? 0.03 : 0.033) * bu * k;
  const th = 0.0045 * bu;
  const radii = contour(ctx, ax.cx, ax.cz, y, 40, h * 0.5).map((r) => r + ctx.torsoClear);
  const parts: AccessoryPart[] = [{ geometry: bandAround(ax.cx, ax.cz, y, radii, h, th), role: 'main' }];
  const rFront = radii[0] + th;
  const bw = 0.042 * bu * k;
  const bh = 0.034 * bu * k;
  const outer = roundedRect(bw, bh, 0.004);
  const hole = new THREE.Path();
  const iw = bw * 0.66;
  const ih = bh * 0.62;
  hole.moveTo(-iw / 2, -ih / 2);
  hole.lineTo(-iw / 2, ih / 2);
  hole.lineTo(iw / 2, ih / 2);
  hole.lineTo(iw / 2, -ih / 2);
  hole.closePath();
  outer.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(outer, { depth: 0.003 * bu, bevelEnabled: false });
  g.translate(ax.cx, y, ax.cz + rFront);
  parts.push({ geometry: g, role: 'metal' });
  // Lưỡi gài.
  parts.push({ geometry: xform(slab(0.004 * bu, bh * 0.8, 0.002 * bu, 0.001), new THREE.Matrix4().makeTranslation(ax.cx, y, ax.cz + rFront + 0.0035 * bu)), role: 'metal' });
  return parts;
}

function buildKeychain(e: AccessoryEntry, ctx: BuildContext): AccessoryPart[] {
  const bu = ctx.bu;
  const k = e.size;
  const y = ctx.yPelvis + 0.06 * ctx.span;
  const ax = torsoAxis(ctx, y);
  const th = (100 / 180) * Math.PI;
  const r = ctx.torso.polar(ax.cx, ax.cz, y, th, 0.02) + ctx.torsoClear + 0.004 * bu;
  const px = ax.cx + Math.sin(th) * r;
  const pz = ax.cz + Math.cos(th) * r;
  const parts: AccessoryPart[] = [];
  const rot = new THREE.Matrix4().makeRotationY(th).setPosition(px, y, pz);
  const loop = new THREE.TorusGeometry(0.011 * bu * k, 0.0017 * bu, 8, 20);
  parts.push({ geometry: xform(loop, rot.clone()), role: 'metal' });
  const chain = tubeGeo([[0, -0.011 * bu * k, 0.001 * bu], [0, -0.03 * bu * k, 0.004 * bu], [0, -0.05 * bu * k, 0.004 * bu]], 0.0013 * bu, false, 5);
  parts.push({ geometry: xform(chain, rot.clone()), role: 'metal' });
  if (e.shape === 'keychain-carabiner') {
    const sh: V3[] = [];
    const w = 0.011 * bu * k;
    const h = 0.032 * bu * k;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      // Hình "D".
      sh.push([Math.cos(a) * w * (Math.sin(a) > 0 ? 1 : 0.8), -0.052 * bu * k - h / 2 + Math.sin(a) * h / 2, 0.004 * bu]);
    }
    parts.push({ geometry: xform(tubeGeo(sh, 0.0018 * bu, true, 6), rot.clone()), role: 'metal' });
    parts.push({ geometry: xform(sphereAt([0, -0.052 * bu * k, 0.004 * bu], 0.0026 * bu, 6), rot.clone()), role: 'accent' });
  } else {
    const g = new THREE.TorusGeometry(0.014 * bu * k, 0.0017 * bu, 8, 20);
    g.translate(0, -0.052 * bu * k - 0.014 * bu * k, 0.004 * bu);
    parts.push({ geometry: xform(g, rot.clone()), role: 'metal' });
  }
  return parts;
}

function buildCrossBody(e: AccessoryEntry, ctx: BuildContext): AccessoryPart[] {
  const bu = ctx.bu;
  const k = e.size;
  const messenger = e.shape === 'bag-messenger';
  const yTop = ctx.yNeck - 0.035 * bu;
  const yBot = ctx.yPelvis - 0.01 * bu;
  const ax = torsoAxis(ctx, (yTop + yBot) / 2);
  const yMid = (yTop + yBot) / 2;
  const amp = (yTop - yBot) / 2;
  const phase = -Math.PI * 0.42; // đỉnh quai ở vai phải của nhân vật (x âm, hơi ra trước)
  const n = 44;
  const pts: V3[] = [];
  const ws: number[] = [];
  const ns: V3[] = [];
  const cl = ctx.torsoClear + 0.003 * bu;
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const y = yMid + amp * Math.cos(th - phase);
    const r = ctx.torso.polar(ax.cx, ax.cz, y, th, 0.02, 0.3) + cl;
    const p: V3 = [ax.cx + Math.sin(th) * r, y, ax.cz + Math.cos(th) * r];
    pts.push(p);
    ws.push((messenger ? 0.04 : 0.032) * bu);
    ns.push([p[0] - ax.cx, (p[1] - yMid) * 0.8 + 0.05, p[2] - ax.cz]);
  }
  const parts: AccessoryPart[] = [{ geometry: ribbon(pts, ws, ns, true), role: 'main', doubleSided: true }];
  // Thân túi ở hông trái.
  const bw = (messenger ? 0.26 : 0.17) * bu * k;
  const bh = (messenger ? 0.19 : 0.12) * bu * k;
  const bd = (messenger ? 0.07 : 0.05) * bu * k;
  const thB = Math.PI * 0.5 + 0.12;
  const yB = ctx.yPelvis - 0.035 * bu - bh / 2 + 0.02 * bu;
  const rB = ctx.torso.polar(ax.cx, ax.cz, yB, thB, 0.04, 0.35) + cl + bd / 2;
  const m = new THREE.Matrix4().makeRotationY(thB).setPosition(ax.cx + Math.sin(thB) * rB, yB, ax.cz + Math.cos(thB) * rB);
  parts.push({ geometry: xform(slab(bw, bh, bd, 0.02 * bu), m.clone()), role: 'main' });
  const flap = slab(bw * 1.02, bh * 0.5, 0.008 * bu, 0.02 * bu);
  flap.translate(0, bh * 0.25, bd / 2 + 0.002 * bu);
  parts.push({ geometry: xform(flap, m.clone()), role: 'main', color: undefined });
  const clasp = slab(bw * 0.12, bh * 0.1, 0.004 * bu, 0.002);
  clasp.translate(0, bh * 0.02, bd / 2 + 0.008 * bu);
  parts.push({ geometry: xform(clasp, m.clone()), role: 'metal' });
  return parts;
}

function buildBackpack(e: AccessoryEntry, ctx: BuildContext): AccessoryPart[] {
  const bu = ctx.bu;
  const k = e.size;
  const roll = e.shape === 'backpack-rolltop';
  const cl = ctx.torsoClear + 0.003 * bu;
  const yTop = ctx.yNeck - 0.02 * bu;
  const ax = torsoAxis(ctx, yTop - 0.15 * ctx.span);
  const chest = torsoSlice(ctx.data, ctx.cls, yTop - 0.12 * ctx.span, 0.03);
  const bw = Math.min(0.34 * bu, chest.rx * 1.7) * k;
  const bh = (roll ? 0.4 : 0.37) * bu * k;
  const bd = (roll ? 0.15 : 0.13) * bu * k;
  const yC = yTop - bh / 2 - 0.01 * bu;
  const rBack = ctx.torso.polar(ax.cx, ax.cz, yC, Math.PI, 0.05, 0.35) + cl;
  const zC = ax.cz - rBack - bd / 2;
  const parts: AccessoryPart[] = [];
  parts.push({ geometry: xform(slab(bw, bh, bd, 0.05 * bu), new THREE.Matrix4().makeRotationY(Math.PI).setPosition(ax.cx, yC, zC)), role: 'main' });
  // Túi ngoài.
  const pk = slab(bw * 0.78, bh * 0.38, 0.03 * bu, 0.03 * bu);
  pk.translate(0, -bh * 0.22, -bd / 2 - 0.012 * bu);
  parts.push({ geometry: xform(pk, new THREE.Matrix4().makeRotationY(Math.PI).setPosition(ax.cx, yC, zC)), role: 'main' });
  if (roll) {
    const g = new THREE.CylinderGeometry(bd * 0.46, bd * 0.46, bw * 0.96, 18);
    g.rotateZ(Math.PI / 2);
    g.translate(ax.cx, yC + bh / 2 + 0.01 * bu, zC);
    parts.push({ geometry: g, role: 'main' });
    parts.push({ geometry: tubeGeo([[ax.cx - bw * 0.3, yC + bh * 0.1, zC - bd / 2 - 0.026 * bu], [ax.cx, yC + bh * 0.1, zC - bd / 2 - 0.03 * bu], [ax.cx + bw * 0.3, yC + bh * 0.1, zC - bd / 2 - 0.026 * bu]], 0.002 * bu, false, 4), role: 'metal' });
  } else {
    parts.push({ geometry: tubeGeo([[ax.cx - 0.03 * bu, yC + bh / 2 + 0.002 * bu, zC], [ax.cx, yC + bh / 2 + 0.03 * bu, zC], [ax.cx + 0.03 * bu, yC + bh / 2 + 0.002 * bu, zC]], 0.004 * bu, false, 6), role: 'main' });
    const zip = slab(bw * 0.7, 0.003 * bu, 0.002 * bu, 0.001);
    zip.translate(ax.cx, yC - bh * 0.03, zC - bd / 2 - 0.026 * bu);
    parts.push({ geometry: zip, role: 'metal' });
  }
  // Hai quai qua vai, vòng xuống dưới nách ra sau.
  const nk = neckInfo(ctx);
  for (const s of [-1, 1]) {
    const x = s * Math.max(0.06 * bu, nk.r * 1.5);
    const yBack = yTop - 0.02 * bu;
    const yFrontLow = yTop - 0.3 * ctx.span;
    const zBack = (y: number) => {
      const z = ctx.torso.surfaceZ(x, y, false, 0.016);
      return (Number.isNaN(z) ? ax.cz - 0.09 * bu : z) - cl;
    };
    const zFront = (y: number) => {
      const z = ctx.torso.surfaceZ(x, y, true, 0.016);
      return (Number.isNaN(z) ? ax.cz + 0.1 * bu : z) + cl;
    };
    const shoulderY = ctx.torso.topY(x, ax.cz, 0.025);
    const yS = (Number.isNaN(shoulderY) ? ctx.yNeck : shoulderY) + cl;
    const sideX = s * (ctx.torso.polar(ax.cx, ax.cz, yFrontLow, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0.02, 0.3) + cl);
    const path: V3[] = [
      [x, yBack, zBack(yBack)],
      [x, yS - 0.012 * bu, zBack(yS - 0.03 * bu) + 0.012 * bu],
      [x, yS, ax.cz],
      [x, yS - 0.04 * bu, zFront(yS - 0.04 * bu)],
      [x * 1.12, yTop - 0.17 * ctx.span, zFront(yTop - 0.17 * ctx.span)],
      [sideX * 0.96, yFrontLow, ax.cz + 0.02 * bu],
      [x * 1.5, yFrontLow + 0.01 * bu, zBack(yFrontLow)],
    ];
    const smooth = new THREE.CatmullRomCurve3(path.map(vec), false, 'centripetal').getPoints(36).map((p): V3 => [p.x, p.y, p.z]);
    const ns: V3[] = smooth.map((p) => [p[0] - ax.cx, (p[1] - (yTop - 0.2 * ctx.span)) * 0.9, p[2] - ax.cz]);
    parts.push({ geometry: ribbon(smooth, smooth.map(() => 0.034 * bu), ns), role: 'main', doubleSided: true });
  }
  return parts;
}

/* ------------------------------------------------------------------ */
/* Tay                                                                 */
/* ------------------------------------------------------------------ */

function armSide(e: AccessoryEntry): 'l' | 'r' {
  return e.side === 'r' ? 'r' : 'l';
}

function ringBand(R: number, w: number, th: number): THREE.BufferGeometry {
  const prof = [new THREE.Vector2(R, -w / 2), new THREE.Vector2(R + th, -w / 2), new THREE.Vector2(R + th, w / 2), new THREE.Vector2(R, w / 2), new THREE.Vector2(R, -w / 2)];
  return new THREE.LatheGeometry(prof, 28);
}

function buildWristItem(e: AccessoryEntry, ctx: BuildContext): AccessoryPart[] {
  const s = armSide(e);
  const k = e.size;
  const isCuff = e.shape === 'cufflinks';
  const t = isCuff ? 0.93 : e.slot === 'watch' ? 0.84 : 0.7;
  const sec = limbSection(ctx.data, `lowerarm_${s}`, `hand_${s}`, t);
  const R = sec.radius + ctx.sleeveClear + 0.0008;
  const M = basis(sec.center, sec.axis, [0, 1, 0]);
  const parts: AccessoryPart[] = [];
  const bu = Math.max(ctx.bu, sec.radius / 0.028);
  const u = sec.radius / 0.028; // 1 ở cổ tay người lớn
  const put = (g: THREE.BufferGeometry, role: PartRole, extra: Partial<AccessoryPart> = {}) => parts.push({ geometry: xform(g, M.clone()), role, ...extra });
  void bu;
  switch (e.shape) {
    case 'watch-metal':
    case 'watch-leather':
    case 'watch-digital': {
      const digital = e.shape === 'watch-digital';
      const w = (digital ? 0.024 : 0.019) * u * k;
      const th = (e.shape === 'watch-metal' ? 0.0028 : 0.0036) * u;
      put(ringBand(R, w, th), e.shape === 'watch-metal' ? 'metal' : 'main', { doubleSided: true });
      if (digital) {
        const body = slab(0.04 * u * k, 0.034 * u * k, 0.011 * u * k, 0.006 * u);
        body.translate(0, 0, R + th + 0.004 * u);
        put(body, 'dark');
        const scr = slab(0.03 * u * k, 0.022 * u * k, 0.001 * u, 0.003 * u);
        scr.translate(0, 0, R + th + 0.01 * u);
        put(scr, 'lens', { color: '#6fb3a0' });
      } else {
        const fr = 0.0185 * u * k;
        const cs = new THREE.CylinderGeometry(fr, fr, 0.0085 * u, 28);
        cs.rotateX(Math.PI / 2);
        cs.translate(0, 0, R + th + 0.002 * u);
        put(cs, 'metal');
        const dial = new THREE.CylinderGeometry(fr * 0.86, fr * 0.86, 0.001 * u, 28);
        dial.rotateX(Math.PI / 2);
        dial.translate(0, 0, R + th + 0.0067 * u);
        put(dial, 'white', { color: e.shape === 'watch-metal' ? '#1b2431' : '#efe9dc' });
        const hand1 = slab(0.0012 * u, fr * 1.2, 0.0007 * u, 0.0004);
        hand1.translate(0, fr * 0.3, R + th + 0.0076 * u);
        put(hand1, 'metal');
        const hand2 = slab(0.0012 * u, fr * 0.8, 0.0007 * u, 0.0004);
        hand2.rotateZ(1.9);
        hand2.translate(fr * 0.2, 0, R + th + 0.0078 * u);
        put(hand2, 'metal');
      }
      break;
    }
    case 'bracelet-bead': {
      const n = 15;
      const rb = 0.0042 * u * k;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const g = new THREE.SphereGeometry(rb, 10, 8);
        g.translate(Math.sin(a) * (R + rb * 0.8), 0, Math.cos(a) * (R + rb * 0.8));
        put(g, 'main');
      }
      put(new THREE.TorusGeometry(R + rb * 0.8, 0.0006 * u, 5, 28).rotateX(Math.PI / 2), 'dark');
      break;
    }
    case 'bracelet-chain': {
      const g = new THREE.TorusGeometry(R + 0.0025 * u, 0.0017 * u * k, 8, 36);
      g.rotateX(Math.PI / 2);
      put(g, 'metal');
      const g2 = new THREE.TorusGeometry(R + 0.0035 * u, 0.0012 * u * k, 8, 36);
      g2.rotateX(Math.PI / 2);
      g2.translate(0, 0.007 * u, 0);
      put(g2, 'metal');
      put(sphereAt([0, 0, R + 0.004 * u], 0.0035 * u * k, 8), 'metal');
      break;
    }
    case 'bracelet-cord': {
      const g = new THREE.TorusGeometry(R + 0.002 * u, 0.0028 * u * k, 8, 36);
      g.rotateX(Math.PI / 2);
      put(g, 'main');
      const knot = new THREE.SphereGeometry(0.0045 * u * k, 8, 6);
      knot.translate(0, 0, R + 0.002 * u);
      put(knot, 'main');
      break;
    }
    case 'cufflinks': {
      for (const a of [0.9, -0.9]) {
        put(sphereAt([Math.sin(a) * (R + 0.004 * u), 0, Math.cos(a) * (R + 0.004 * u)], 0.0048 * u * k, 10), 'metal');
      }
      break;
    }
    default:
      break;
  }
  return parts;
}

function buildRing(e: AccessoryEntry, ctx: BuildContext): AccessoryPart[] {
  const s = armSide(e);
  const f = fingerBoneName(e.finger ?? 'ring');
  const a = `${f}_01_${s}`;
  const b = `${f}_02_${s}`;
  const sec = limbSection(ctx.data, a, b, 0.45, 0.3);
  const R = sec.radius + 0.0007;
  const M = basis(sec.center, sec.axis, [0, 1, 0]);
  const u = sec.radius / 0.0125;
  const parts: AccessoryPart[] = [];
  const band = ringBand(R, 0.0055 * u, 0.0017 * u);
  parts.push({ geometry: xform(band, M.clone()), role: 'metal', doubleSided: true });
  if (e.shape === 'ring-signet') {
    const top = slab(0.012 * u, 0.009 * u, 0.0022 * u, 0.0018 * u);
    top.translate(0, 0, R + 0.0026 * u);
    parts.push({ geometry: xform(top, M.clone()), role: 'metal' });
  }
  return parts;
}

/**
 * Điện thoại cất: nhô khỏi túi sau của quần ở hông bên `side`. Dựng miệng túi (mảnh mỏng viền tối) áp lên mông và
 * điện thoại cắm chếch, nhô khoảng một phần ba thân máy khỏi miệng túi, màn hình quay vào người.
 */
function buildStowedPhone(e: AccessoryEntry, ctx: BuildContext): AccessoryPart[] {
  const bu = ctx.bu;
  const k = e.size;
  const y = ctx.yPelvis - 0.035 * ctx.span;
  const ax = torsoAxis(ctx, y);
  const sign = e.side === 'r' ? -1 : 1;
  const th = Math.PI + sign * -0.55; // lưng, lệch về phía hông của bên đeo
  const cl = ctx.torsoClear + 0.002 * bu;
  const r = ctx.torso.polar(ax.cx, ax.cz, y, th, 0.025, 0.25) + cl;
  const px = ax.cx + Math.sin(th) * r;
  const pz = ax.cz + Math.cos(th) * r;
  const w = 0.07 * bu * k;
  const h = 0.145 * bu * k;
  const d = 0.0085 * bu;
  const M = new THREE.Matrix4().makeRotationY(th).setPosition(px, y, pz);
  const parts: AccessoryPart[] = [];
  // Miệng túi: dải ngang mỏng, tối màu.
  const mouth = slab(0.115 * bu, 0.012 * bu, 0.004 * bu, 0.003 * bu);
  mouth.translate(0, 0.012 * bu, 0.002 * bu);
  parts.push({ geometry: xform(mouth, M.clone()), role: 'dark' });
  // Điện thoại: tâm cao hơn miệng túi để chỉ phần trên nhô ra; nghiêng nhẹ ra ngoài.
  const tilt = new THREE.Matrix4().makeRotationX(-0.12);
  const body = slab(w, h, d, 0.012 * bu);
  body.translate(0, 0.012 * bu + h * 0.5 - h * 0.34, d / 2 + 0.004 * bu);
  body.applyMatrix4(tilt);
  parts.push({ geometry: xform(body, M.clone()), role: 'main' });
  const screen = slab(w * 0.9, h * 0.94, 0.0007 * bu, 0.01 * bu);
  screen.translate(0, 0.012 * bu + h * 0.5 - h * 0.34, 0.0015 * bu);
  screen.applyMatrix4(tilt);
  parts.push({ geometry: xform(screen, M.clone()), role: 'lens', color: '#0c0f14' });
  return parts;
}

function buildPhone(e: AccessoryEntry, ctx: BuildContext): AccessoryPart[] {
  if (e.state === 'stowed') return buildStowedPhone(e, ctx);
  const s = armSide(e);
  const h = ctx.data.bonePos[`hand_${s}`];
  const m1 = ctx.data.bonePos[`middle_01_${s}`];
  if (!h || !m1) return [];
  const handLen = Math.hypot(m1[0] - h[0], m1[1] - h[1], m1[2] - h[2]);
  const u = handLen / 0.118;
  const axis: V3 = [m1[0] - h[0], m1[1] - h[1], m1[2] - h[2]];
  const center: V3 = [(h[0] + m1[0]) / 2, (h[1] + m1[1]) / 2, (h[2] + m1[2]) / 2];
  const M = basis(center, axis, [0, 1, 0]);
  const k = e.size;
  const w = 0.07 * u * k;
  const hh = 0.147 * u * k;
  const d = 0.0085 * u;
  const palm = 0.02 * u;
  const parts: AccessoryPart[] = [];
  const tilt = e.state === 'using' ? new THREE.Matrix4().makeRotationX(-0.6) : new THREE.Matrix4();
  const place = (g: THREE.BufferGeometry, off: V3): THREE.BufferGeometry => {
    g.translate(off[0], off[1], off[2]);
    g.applyMatrix4(tilt);
    return xform(g, M.clone());
  };
  // Lưng điện thoại áp vào lòng bàn tay (phía -Z), màn hình quay ra ngoài lòng bàn tay.
  parts.push({ geometry: place(slab(w, hh, d, 0.012 * u), [0, hh * 0.1, -palm - d / 2]), role: 'main' });
  parts.push({ geometry: place(slab(w * 0.9, hh * 0.94, 0.0007 * u, 0.01 * u), [0, hh * 0.1, -palm - d - 0.0002 * u]), role: 'lens', color: e.state === 'using' ? '#7fb2e8' : '#0c0f14' });
  const cam = new THREE.CylinderGeometry(0.006 * u, 0.006 * u, 0.002 * u, 14);
  cam.rotateX(Math.PI / 2);
  parts.push({ geometry: place(cam, [-w * 0.25, hh * 0.1 + hh * 0.38, -palm + 0.0008 * u]), role: 'dark' });
  return parts;
}

/* ------------------------------------------------------------------ */
/* Điểm vào                                                            */
/* ------------------------------------------------------------------ */

/** Dựng một mục. Trả mảng rỗng (không ném lỗi) nếu thiếu dữ liệu đo, để một món lỗi không làm mất cả bộ. */
export function buildAccessory(e: AccessoryEntry, ctx: BuildContext): BuiltAccessory {
  let parts: AccessoryPart[] = [];
  switch (e.slot) {
    case 'hat':
      parts = buildHat(e, ctx).parts;
      break;
    case 'eyewear':
      parts = buildEyewear(e, ctx);
      break;
    case 'earrings':
      parts = buildEarrings(e, ctx);
      break;
    case 'mask':
      parts = buildMask(e, ctx);
      break;
    case 'headphones':
      parts = buildHeadphones(e, ctx);
      break;
    case 'necklace':
      parts = buildNecklace(e, ctx);
      break;
    case 'scarf':
      parts = buildScarf(e, ctx);
      break;
    case 'tie':
      parts = buildTie(e, ctx);
      break;
    case 'badge':
      parts = buildBadge(e, ctx);
      break;
    case 'belt':
      parts = buildBelt(e, ctx);
      break;
    case 'keychain':
      parts = buildKeychain(e, ctx);
      break;
    case 'crossbodyBag':
      parts = buildCrossBody(e, ctx);
      break;
    case 'backpack':
      parts = buildBackpack(e, ctx);
      break;
    case 'watch':
    case 'bracelet':
    case 'cufflinks':
      parts = buildWristItem(e, ctx);
      break;
    case 'ring':
      parts = buildRing(e, ctx);
      break;
    case 'phone':
      parts = buildPhone(e, ctx);
      break;
  }
  return { entry: e, bone: e.bone, parts };
}
