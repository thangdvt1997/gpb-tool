/**
 * Vùng da cho phép vẽ xăm, tính trên UV của mô hình MPFB (TEXCOORD_0 của mesh 'base').
 * Dùng lại SkinRegion của src/fashion để khớp CharacterLook. Mọi toạ độ UV theo quy ước glTF
 * (gốc ở góc trên trái, v hướng xuống), cũng là quy ước của canvas khi texture.flipY = false.
 */
import type { Side, SkinRegion } from '../fashion/types';

export type { Side, SkinRegion };

export const SKIN_REGIONS: readonly SkinRegion[] = [
  'face', 'neck', 'chest', 'abdomen', 'back', 'upperArm', 'forearm', 'hand', 'thigh', 'calf', 'foot',
];

/** Vùng cho phép vẽ xăm. Mặt và bàn chân bị loại có chủ đích (chốt: không xăm mặt). */
export const TATTOO_REGIONS: readonly SkinRegion[] = [
  'neck', 'chest', 'abdomen', 'back', 'upperArm', 'forearm', 'hand', 'thigh', 'calf',
];

export const MASK_RES = 64;

export interface UvBox { u0: number; v0: number; u1: number; v1: number }

/** Một vùng: hộp UV bao và (nếu có) lưới bit MASK_RES x MASK_RES các ô UV thuộc vùng. */
export interface RegionMask {
  region: SkinRegion;
  /** 'left' | 'right' cho vùng hai bên, null cho vùng giữa. */
  side: Side | null;
  box: UvBox;
  /** Lưới theo hàng (v) rồi cột (u), 1 = cho phép vẽ. Vắng thì dùng cả hộp. */
  grid?: Uint8Array;
}

export function regionKey(region: SkinRegion, side: Side | null): string {
  return side ? `${region}.${side}` : region;
}

export function boxContains(b: UvBox, u: number, v: number): boolean {
  return u >= b.u0 && u <= b.u1 && v >= b.v0 && v <= b.v1;
}

/** Điểm UV có nằm trong vùng không (lưới nếu có, ngược lại hộp). */
export function maskContains(m: RegionMask, u: number, v: number): boolean {
  if (!boxContains(m.box, u, v)) return false;
  if (!m.grid) return true;
  const x = Math.min(MASK_RES - 1, Math.max(0, Math.floor(u * MASK_RES)));
  const y = Math.min(MASK_RES - 1, Math.max(0, Math.floor(v * MASK_RES)));
  return m.grid[y * MASK_RES + x] === 1;
}

/** Hợp nhiều mask (vùng đặt xăm cho phép). */
export function masksContain(ms: readonly RegionMask[], u: number, v: number): boolean {
  for (const m of ms) if (maskContains(m, u, v)) return true;
  return false;
}
