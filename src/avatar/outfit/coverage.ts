/**
 * Chọn đỉnh/tam giác mà một món che (theo vùng skin), xếp lớp và tính độ đẩy theo pháp tuyến để chống xuyên.
 * Toàn bộ thuần: nhận Classification (regions.ts) và mảng thô, trả mảng thô. Test bằng dữ liệu đỉnh giả.
 */
import { Region, type Classification } from './regions';
import { FIT_LOOSENESS, FIT_THICKNESS, type ShellClass } from './shellClass';
import type { Fit } from '../../fashion/types';

/** Biến thể của một món ảnh hưởng tới vùng che. */
export interface CoverageVariant {
  fit: Fit;
  tucked: boolean;
}

/** Phom rộng kéo dài gấu và tay áo thêm một chút. */
const OVERSIZED_HEM_EXTRA = 0.05;
const OVERSIZED_SLEEVE_EXTRA = 0.08;

/** Biên độ kẹp của lề cắt (m, cỡ 1,8 m): đỉnh xa biên không cần giá trị chính xác, chỉ cần đúng dấu. */
export const CUT_CAP = 0.05;

/**
 * Lề cắt liên tục theo từng đỉnh (m, theo cỡ mesh): dương là nằm trong vùng món che, âm là ngoài, 0 đúng tại biên
 * (gấu áo, đầu tay áo, cổ áo, cạp, gấu quần). Đo theo khoảng cách dọc trục liên quan (độ cao cho thân, trục xương cho chi)
 * nên đường đẳng trị 0 là đường cắt thẳng/cong nhẹ, không phụ thuộc lưới tam giác. Kẹp trong [-CUT_CAP, CUT_CAP] (nhân theo cỡ mesh).
 * Vùng không bao giờ được che (đầu, bàn tay, other) có lề -CUT_CAP.
 */
export function coverMargin(cls: Classification, spec: ShellClass, variant: CoverageVariant): Float32Array {
  const out = new Float32Array(cls.vertexCount);
  const cap = CUT_CAP * (cls.bodyHeight / REFERENCE_HEIGHT);
  out.fill(-cap);
  if (!spec.part) return out;
  const { region, t, tLen, u } = cls;
  const span = Math.max(1e-6, cls.yNeck - cls.yPelvis);
  const oversized = variant.fit === 'oversized';
  const hemBase = variant.tucked ? spec.hemTuckedU : spec.hemU;
  const hem = oversized && !variant.tucked ? hemBase - OVERSIZED_HEM_EXTRA : hemBase;
  const sleeveExtra = oversized ? OVERSIZED_SLEEVE_EXTRA : 0;
  // Giá trị >= 1 nghĩa là tới hết đoạn (đỉnh gần khớp có thể vượt t = 1 một chút nên không kẹp bằng 1).
  const sUp = spec.sleeveUpper <= 0 ? 0 : spec.sleeveUpper + sleeveExtra >= 1 ? Infinity : spec.sleeveUpper + sleeveExtra;
  const sFo = spec.sleeveFore > 0 ? Math.min(0.97, spec.sleeveFore) : 0;
  const thighEnd = spec.thigh >= 1 ? Infinity : spec.thigh;

  const hasTop = spec.part === 'top' || spec.part === 'full';
  const hasBottom = spec.part === 'bottom' || spec.part === 'full';
  const eps = 1e-6;
  const fin = (x: number) => (x === Infinity ? cap : x);

  for (let v = 0; v < cls.vertexCount; v++) {
    const r = region[v];
    const tv = t[v];
    const len = tLen[v];
    const uv = u[v];
    let m = -cap;
    switch (spec.part) {
      case 'socks':
      case 'shoes':
        if (r === Region.foot) m = cap;
        else if (r === Region.calf) m = (tv - spec.calfFrom) * len;
        break;
      default:
        if (r === Region.torso) {
          m = hasTop ? (spec.neckU - uv) * span : (spec.waistU - uv) * span;
          if (spec.part === 'top') m = Math.min(m, (uv - hem) * span);
        } else if (r === Region.neck) {
          if (hasTop) m = (spec.neckU - uv) * span;
        } else if (r === Region.pelvis) {
          if (spec.part === 'top') m = (uv - hem) * span;
          else if (spec.part === 'bottom') m = (spec.waistU - uv) * span;
          else m = cap;
        } else if (r === Region.thigh) {
          if (spec.part === 'top') m = (uv - hem) * span;
          else if (hasBottom && spec.thigh > 0) {
            m = fin(thighEnd - tv) * (thighEnd === Infinity ? 1 : len);
            // Liên tục với cạp: đỉnh đùi sát hông cũng chịu lề theo độ cao, nên đường cạp không bị kéo lệch ở hai bên hông.
            if (spec.part === 'bottom') m = Math.min(m, (spec.waistU - uv) * span);
          } else m = -cap;
        } else if (r === Region.calf) {
          if (hasBottom && spec.calf > 0) m = (spec.calf - tv) * len;
          else if (hasBottom && spec.thigh > 0) m = Math.min((Math.min(thighEnd, 1) - 1 - tv) * len, -eps);
        } else if (r === Region.upperArm) {
          if (hasTop && sUp > 0) m = sUp === Infinity ? cap : (sUp - tv) * len;
        } else if (r === Region.foreArm) {
          if (hasTop && sFo > 0) m = (sFo - tv) * len;
          else if (hasTop && sUp > 0) m = Math.min((Math.min(sUp, 1) - 1 - tv) * len, -eps);
        }
    }
    // Đầu: lề âm nhưng nhỏ dần về biên cổ áo, để đường cắt cổ không bị kéo lên đầu ở tam giác vắt qua biên.
    if (r === Region.head && hasTop) m = Math.min(m, Math.min(-1e-4, (spec.neckU - uv) * span));
    out[v] = Math.max(-cap, Math.min(cap, m));
  }
  return out;
}

/**
 * Mặt nạ đỉnh được che (Uint8Array 0/1) = lề cắt >= 0. Không bao giờ che đầu, bàn tay, 'other'. Cổ chỉ được che phần có u <= neckU (cổ áo/cổ lọ).
 */
export function coverVertices(cls: Classification, spec: ShellClass, variant: CoverageVariant): Uint8Array {
  const margin = coverMargin(cls, spec, variant);
  const out = new Uint8Array(cls.vertexCount);
  for (let v = 0; v < out.length; v++) out[v] = margin[v] >= 0 ? 1 : 0;
  return out;
}

/**
 * Tam giác của vỏ: có ít nhất một đỉnh được che. Tam giác nằm vắt qua biên được giữ để shader cắt đúng đường đẳng trị
 * của lề cắt. Trả thêm mặt nạ đỉnh của các tam giác giữ lại (để cấp độ đẩy cho đỉnh ngoài biên).
 */
export function selectShellTriangles(
  index: ArrayLike<number>,
  vertexMask: ArrayLike<number>,
  vertexCount: number,
): { index: Uint32Array; shellVerts: Uint8Array } {
  const triCount = Math.floor(index.length / 3);
  const shellVerts = new Uint8Array(vertexCount);
  const keep = new Uint8Array(triCount);
  let kept = 0;
  for (let f = 0; f < triCount; f++) {
    const a = index[f * 3];
    const b = index[f * 3 + 1];
    const c = index[f * 3 + 2];
    if (vertexMask[a] || vertexMask[b] || vertexMask[c]) {
      keep[f] = 1;
      kept++;
      shellVerts[a] = 1;
      shellVerts[b] = 1;
      shellVerts[c] = 1;
    }
  }
  const out = new Uint32Array(kept * 3);
  let w = 0;
  for (let f = 0; f < triCount; f++) {
    if (!keep[f]) continue;
    out[w++] = index[f * 3];
    out[w++] = index[f * 3 + 1];
    out[w++] = index[f * 3 + 2];
  }
  return { index: out, shellVerts };
}

/** Tam giác có đủ ba đỉnh được che. Trả về chỉ số đỉnh (3 số mỗi tam giác) và cờ theo tam giác. */
export function selectTriangles(
  index: ArrayLike<number>,
  vertexMask: ArrayLike<number>,
): { index: Uint32Array; triMask: Uint8Array } {
  const triCount = Math.floor(index.length / 3);
  const triMask = new Uint8Array(triCount);
  let kept = 0;
  for (let f = 0; f < triCount; f++) {
    if (vertexMask[index[f * 3]] && vertexMask[index[f * 3 + 1]] && vertexMask[index[f * 3 + 2]]) {
      triMask[f] = 1;
      kept++;
    }
  }
  const out = new Uint32Array(kept * 3);
  let w = 0;
  for (let f = 0; f < triCount; f++) {
    if (!triMask[f]) continue;
    out[w++] = index[f * 3];
    out[w++] = index[f * 3 + 1];
    out[w++] = index[f * 3 + 2];
  }
  return { index: out, triMask };
}

/** Một món sẵn sàng xếp lớp. */
export interface PieceInput {
  /** Khoá ổn định (slot hoặc garmentId) để tra kết quả. */
  key: string;
  spec: ShellClass;
  variant: CoverageVariant;
  /** Thứ tự ngoài cùng của món: số lớn nằm ngoài. Thường là spec.order, sơ vin hạ áo xuống dưới quần. */
  order: number;
}

export interface PieceResult {
  key: string;
  /** Đỉnh được che. */
  vertexMask: Uint8Array;
  /** Chỉ số tam giác của vỏ (gồm cả tam giác vắt qua biên, shader sẽ cắt theo cut). */
  index: Uint32Array;
  /** Lề cắt từng đỉnh (xem coverMargin); shader bỏ các mảnh có nội suy < 0. */
  cut: Float32Array;
  /** Cờ tam giác nằm trọn trong vùng che (cả ba đỉnh lề >= 0) trên chỉ số tam giác của thân: chỉ các tam giác này làm ẩn da. */
  triMask: Uint8Array;
  /** Độ đẩy theo pháp tuyến, mỗi đỉnh một giá trị (m, theo cỡ mesh thật). Giá trị 0 ở đỉnh không che. */
  offset: Float32Array;
}

/** Khoảng hở tối thiểu giữa hai lớp liền nhau tại cùng một đỉnh (m, cỡ 1,8 m). */
export const LAYER_GAP = 0.0006;

/** Độ cao mesh người lớn mà các số đo trong bảng dựa vào. */
export const REFERENCE_HEIGHT = 1.8;

function smoothstep(a: number, b: number, x: number): number {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}

/**
 * Độ đẩy riêng của món tại đỉnh (chưa cộng lớp bên dưới): độ dày theo phom + độ rộng phom (co lại ở cổ tay/ống/gấu)
 * + độ loe váy. Giày và tất không có độ rộng phom.
 */
export function ownOffset(cls: Classification, spec: ShellClass, variant: CoverageVariant, v: number): number {
  const scale = cls.bodyHeight / REFERENCE_HEIGHT;
  const thick = spec.thickness * FIT_THICKNESS[variant.fit];
  if (spec.part === 'socks' || spec.part === 'shoes') return thick * scale;
  let loose = FIT_LOOSENESS[variant.fit];
  const r = cls.region[v];
  const tv = cls.t[v];
  // Co độ rộng phom ở đầu tay áo/ống quần để cổ tay và gấu không phình ra. Trục liên tục: tay trên 0..1, cẳng tay 1..2.
  if (r === Region.upperArm || r === Region.foreArm) {
    const along = r === Region.upperArm ? tv : 1 + tv;
    const end = spec.sleeveFore > 0 ? 1 + spec.sleeveFore : Math.max(0.1, spec.sleeveUpper);
    loose *= 1 - 0.6 * smoothstep(0.6 * end, end, along);
  } else if (r === Region.thigh || r === Region.calf) {
    const along = r === Region.thigh ? tv : 1 + tv;
    const end = spec.calf > 0 ? 1 + spec.calf : Math.max(0.1, spec.thigh);
    loose *= 1 - 0.6 * smoothstep(0.6 * end, end, along);
  }
  // Loe váy theo độ sâu dưới xương chậu (u âm), chỉ ở phần chân.
  let flare = 0;
  if (spec.flare > 0 && (r === Region.thigh || r === Region.calf || r === Region.pelvis)) {
    flare = spec.flare * smoothstep(0, 0.6, -cls.u[v] + 0.1);
  }
  return (thick + loose + flare) * scale;
}

/**
 * Xếp lớp nhiều món: tại mỗi đỉnh các món được che xếp theo order tăng dần, độ đẩy của món trên = max độ đẩy của
 * lớp dưới + LAYER_GAP + độ đẩy riêng của nó, nên luôn nằm ngoài lớp dưới. Kết quả chỉ phụ thuộc tập món
 * (không phụ thuộc thứ tự mặc/cởi trước đó), nên đổi đồ nhiều lần không làm sai lớp.
 */
export function resolveLayers(cls: Classification, index: ArrayLike<number>, pieces: readonly PieceInput[]): PieceResult[] {
  const sorted = pieces
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.order - b.p.order || a.i - b.i);
  const masks = new Map<string, Uint8Array>();
  const results = new Map<string, PieceResult>();
  const top = new Float32Array(cls.vertexCount); // độ đẩy ngoài cùng hiện tại tại mỗi đỉnh
  const gapScale = cls.bodyHeight / REFERENCE_HEIGHT;
  for (const { p } of sorted) {
    const cut = coverMargin(cls, p.spec, p.variant);
    const vertexMask = new Uint8Array(cls.vertexCount);
    for (let v = 0; v < vertexMask.length; v++) vertexMask[v] = cut[v] >= 0 ? 1 : 0;
    masks.set(p.key, vertexMask);
    const shellSel = selectShellTriangles(index, vertexMask, cls.vertexCount);
    const offset = new Float32Array(cls.vertexCount);
    // Đỉnh ngoài biên của tam giác vắt qua biên cũng được đẩy như đỉnh che để phần còn lại của tam giác không chìm vào da.
    for (let v = 0; v < cls.vertexCount; v++) {
      if (!shellSel.shellVerts[v]) continue;
      const below = top[v];
      offset[v] = (below > 0 ? below + LAYER_GAP * gapScale : 0) + ownOffset(cls, p.spec, p.variant, v);
      if (offset[v] > top[v]) top[v] = offset[v];
    }
    const sel = selectTriangles(index, vertexMask);
    results.set(p.key, { key: p.key, vertexMask, index: shellSel.index, cut, triMask: sel.triMask, offset });
  }
  // Giữ thứ tự đầu vào.
  return pieces.map((p) => results.get(p.key) as PieceResult);
}

/**
 * Tam giác da bị ẩn: tam giác nằm trọn dưới ít nhất một món kín. Da ở cổ, đầu, bàn tay không bao giờ ẩn vì
 * các vùng đó không nằm trong mặt nạ. Hợp của các triMask.
 */
export function hiddenSkinTriangles(triCount: number, results: readonly PieceResult[]): Uint8Array {
  const hidden = new Uint8Array(triCount);
  for (const r of results) {
    for (let f = 0; f < triCount; f++) if (r.triMask[f]) hidden[f] = 1;
  }
  return hidden;
}

/** Chỉ số tam giác da còn hiển thị sau khi ẩn. */
export function visibleSkinIndex(index: ArrayLike<number>, hidden: ArrayLike<number>): Uint32Array {
  const triCount = Math.floor(index.length / 3);
  let kept = 0;
  for (let f = 0; f < triCount; f++) if (!hidden[f]) kept++;
  const out = new Uint32Array(kept * 3);
  let w = 0;
  for (let f = 0; f < triCount; f++) {
    if (hidden[f]) continue;
    out[w++] = index[f * 3];
    out[w++] = index[f * 3 + 1];
    out[w++] = index[f * 3 + 2];
  }
  return out;
}
