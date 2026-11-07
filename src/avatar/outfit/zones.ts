/**
 * Gán vùng màu (GarmentZone) cho từng đỉnh của vỏ, để tô màu thân áo, tay, cổ, cạp, gấu, đế giày theo
 * WornGarment.colors. Thuần: nhận Classification và pháp tuyến.
 */
import { Region, type Classification } from './regions';
import type { ShellClass } from './shellClass';
import type { GarmentZone, ZoneColors } from '../../fashion/types';

/** Bảng vùng dùng làm chỉ số trong Uint8Array. */
export const ZONE_LIST: readonly GarmentZone[] = [
  'body',
  'sleeve',
  'collar',
  'cuff',
  'waistband',
  'leg',
  'hem',
  'upper',
  'toe',
  'sole',
  'band',
];

const IDX = Object.fromEntries(ZONE_LIST.map((z, i) => [z, i])) as Record<string, number>;

/** Mức vùng của đỉnh v; chuỗi tên vùng ưa thích (món không có vùng đó thì chọn vùng thay thế khi tô màu). */
export function zoneOfVertex(cls: Classification, spec: ShellClass, normalY: number, v: number): GarmentZone {
  const r = cls.region[v];
  const t = cls.t[v];
  const u = cls.u[v];
  if (spec.part === 'shoes') {
    if (normalY < -0.7 && r === Region.foot) return 'sole';
    if (r === Region.foot && t > 0.75) return 'toe';
    return 'upper';
  }
  if (spec.part === 'socks') {
    return r === Region.calf && t > 0.85 ? 'band' : 'body';
  }
  if (spec.part === 'bottom') {
    if (r === Region.torso || r === Region.pelvis) return u > spec.waistU - 0.05 ? 'waistband' : 'leg';
    if (r === Region.calf && t > 0.9 * spec.calf) return 'hem';
    if (r === Region.thigh && spec.calf === 0 && t > spec.thigh - 0.08) return 'hem';
    return 'leg';
  }
  // top hoặc full
  if (r === Region.upperArm) return 'sleeve';
  if (r === Region.foreArm) return t > 0.88 * spec.sleeveFore ? 'cuff' : 'sleeve';
  if ((r === Region.torso || r === Region.neck) && u > spec.neckU - 0.06) return 'collar';
  if (spec.part === 'top' && (r === Region.pelvis || r === Region.thigh) && u < spec.hemU + 0.06) return 'hem';
  if (spec.part === 'full' && (r === Region.thigh || r === Region.calf)) return 'leg';
  return 'body';
}

/**
 * Vùng màu có biên mượt: mỗi đỉnh có vùng chính (zone), vùng phụ (zoneB: cổ áo hoặc gấu) và lề band (m, theo độ cao).
 * Shader chọn màu vùng phụ ở mảnh có band >= 0, nên biên cổ/gấu là đường đẳng trị thẳng chứ không bậc thang theo tam giác.
 * Đỉnh không thuộc dải cổ/gấu: zoneB = zone, band = -1.
 */
export function vertexZoneBlend(
  cls: Classification,
  spec: ShellClass,
  normals: ArrayLike<number>,
): { zone: Uint8Array; zoneB: Uint8Array; band: Float32Array } {
  const n = cls.vertexCount;
  const zone = vertexZones(cls, spec, normals);
  const zoneB = Uint8Array.from(zone);
  const band = new Float32Array(n).fill(-1);
  const span = Math.max(1e-6, cls.yNeck - cls.yPelvis);
  if (spec.part !== 'top' && spec.part !== 'full') return { zone, zoneB, band };
  const BODY = IDX.body;
  for (let v = 0; v < n; v++) {
    const r = cls.region[v];
    const u = cls.u[v];
    if ((r === Region.torso || r === Region.neck) && u > spec.neckU - 0.06 - 0.02) {
      zone[v] = BODY;
      zoneB[v] = IDX.collar;
      band[v] = (u - (spec.neckU - 0.06)) * span;
    } else if (spec.part === 'top' && (r === Region.pelvis || r === Region.thigh) && u < spec.hemU + 0.06 + 0.02) {
      zone[v] = BODY;
      zoneB[v] = IDX.hem;
      band[v] = (spec.hemU + 0.06 - u) * span;
    }
  }
  return { zone, zoneB, band };
}

/** Chỉ số vùng cho mọi đỉnh. normals có thể rỗng (đế giày khi đó không nhận ra). */
export function vertexZones(cls: Classification, spec: ShellClass, normals: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(cls.vertexCount);
  for (let v = 0; v < cls.vertexCount; v++) {
    const ny = normals.length >= (v + 1) * 3 ? normals[v * 3 + 1] : 0;
    out[v] = IDX[zoneOfVertex(cls, spec, ny, v)] ?? 0;
  }
  return out;
}

/** Thứ tự vùng thay thế khi món không có vùng được yêu cầu (ví dụ quần không có 'waistband'). */
const FALLBACK: Readonly<Record<string, readonly GarmentZone[]>> = {
  body: ['body', 'upper', 'leg'],
  sleeve: ['sleeve', 'body'],
  collar: ['collar', 'trim', 'body'],
  cuff: ['cuff', 'sleeve', 'body'],
  waistband: ['waistband', 'leg', 'body'],
  leg: ['leg', 'body'],
  hem: ['hem', 'leg', 'body'],
  upper: ['upper', 'body'],
  toe: ['toe', 'upper'],
  sole: ['sole', 'upper'],
  band: ['band', 'body'],
};

/** Màu cho vùng đã gán, có thay thế. Không tìm được thì trả màu đầu tiên của món, rồi xám trung tính. */
export function resolveZoneColor(colors: ZoneColors, zone: GarmentZone): string {
  for (const z of FALLBACK[zone] ?? [zone]) {
    const c = colors[z];
    if (c) return c;
  }
  const first = Object.values(colors)[0];
  return first ?? '#9aa1ab';
}
