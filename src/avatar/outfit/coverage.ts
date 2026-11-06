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

/**
 * Mặt nạ đỉnh được che (Uint8Array 0/1). Không bao giờ che đầu, bàn tay, 'other'. Cổ chỉ được che phần có u <= neckU (cổ áo/cổ lọ).
 */
export function coverVertices(cls: Classification, spec: ShellClass, variant: CoverageVariant): Uint8Array {
  const out = new Uint8Array(cls.vertexCount);
  if (!spec.part) return out;
  const { region, t, u } = cls;
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

  for (let v = 0; v < cls.vertexCount; v++) {
    const r = region[v];
    const tv = t[v];
    const uv = u[v];
    let on = false;
    switch (spec.part) {
      case 'socks':
      case 'shoes':
        on = r === Region.foot || (r === Region.calf && tv >= spec.calfFrom);
        break;
      default:
        if (r === Region.torso) {
          on = hasTop ? uv <= spec.neckU : uv <= spec.waistU;
        } else if (r === Region.neck) {
          on = hasTop && uv <= spec.neckU;
        } else if (r === Region.pelvis) {
          if (spec.part === 'top') on = uv >= hem;
          else if (spec.part === 'bottom') on = uv <= spec.waistU;
          else on = true;
        } else if (r === Region.thigh) {
          if (spec.part === 'top') on = uv >= hem;
          else on = hasBottom && spec.thigh > 0 && tv <= thighEnd;
        } else if (r === Region.calf) {
          on = hasBottom && spec.calf > 0 && tv <= spec.calf;
        } else if (r === Region.upperArm) {
          on = hasTop && sUp > 0 && tv <= sUp;
        } else if (r === Region.foreArm) {
          on = hasTop && sFo > 0 && tv <= sFo;
        }
    }
    out[v] = on ? 1 : 0;
  }
  return out;
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
  /** Chỉ số tam giác của vỏ. */
  index: Uint32Array;
  /** Cờ tam giác của vỏ trên chỉ số tam giác của thân. */
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
    const vertexMask = coverVertices(cls, p.spec, p.variant);
    masks.set(p.key, vertexMask);
    const offset = new Float32Array(cls.vertexCount);
    for (let v = 0; v < cls.vertexCount; v++) {
      if (!vertexMask[v]) continue;
      const below = top[v];
      offset[v] = (below > 0 ? below + LAYER_GAP * gapScale : 0) + ownOffset(cls, p.spec, p.variant, v);
      if (offset[v] > top[v]) top[v] = offset[v];
    }
    const sel = selectTriangles(index, vertexMask);
    results.set(p.key, { key: p.key, vertexMask, index: sel.index, triMask: sel.triMask, offset });
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
