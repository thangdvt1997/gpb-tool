/**
 * Đóng gói mask vùng da độ phân giải cao thành JSON nhỏ (run-length). Sinh offline bởi scripts/gen-tattoo-masks.mjs
 * từ UV + trọng số xương của GLB, nạp lúc chạy bởi masks.ts (không phải tải GLB ~6MB).
 * Mỗi vùng: run = độ dài xen kẽ (0, 1, 0, 1...) trên lưới res x res duyệt theo hàng, bắt đầu bằng chuỗi 0 (có thể dài 0).
 */
import type { RegionMask, Side, SkinRegion, UvBox } from './regions';

export interface PackedRegion { r: SkinRegion; s: Side | null; b: [number, number, number, number]; rl: number[] }
export interface PackedMasks { v: 1; res: number; models: Record<string, PackedRegion[]> }

export function rleEncode(grid: Uint8Array): number[] {
  const out: number[] = [];
  let cur = 0, run = 0;
  for (let i = 0; i < grid.length; i++) {
    const bit = grid[i] ? 1 : 0;
    if (bit === cur) run++;
    else { out.push(run); cur = bit; run = 1; }
  }
  out.push(run);
  return out;
}

export function rleDecode(rl: readonly number[], size: number): Uint8Array {
  const g = new Uint8Array(size);
  let pos = 0, bit = 0;
  for (const n of rl) {
    if (!Number.isInteger(n) || n < 0 || pos + n > size) throw new Error('Mask đóng gói hỏng');
    if (bit) g.fill(1, pos, pos + n);
    pos += n;
    bit ^= 1;
  }
  return g;
}

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

export function packMasks(ms: readonly RegionMask[], res: number): PackedRegion[] {
  return ms
    .filter((m) => m.grid && (m.res ?? 64) === res)
    .map((m) => ({ r: m.region, s: m.side, b: [r6(m.box.u0), r6(m.box.v0), r6(m.box.u1), r6(m.box.v1)] as [number, number, number, number], rl: rleEncode(m.grid!) }))
    .sort((a, b) => (a.r + '.' + a.s < b.r + '.' + b.s ? -1 : 1));
}

export function unpackMasks(list: readonly PackedRegion[], res: number): RegionMask[] {
  return list.map((p) => {
    const box: UvBox = { u0: p.b[0], v0: p.b[1], u1: p.b[2], v1: p.b[3] };
    return { region: p.r, side: p.s, box, grid: rleDecode(p.rl, res * res), res };
  });
}

export function validPacked(x: unknown): x is PackedMasks {
  const o = x as PackedMasks | null;
  return !!o && o.v === 1 && Number.isInteger(o.res) && o.res >= 64 && o.res <= 1024 && typeof o.models === 'object' && o.models !== null;
}
