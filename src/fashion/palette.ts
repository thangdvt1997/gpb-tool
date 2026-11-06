/**
 * Bảng màu cho phép. Màu ngoài bảng được rules.ts kéo về màu gần nhất trong bảng.
 * Đã gồm mọi màu swatch cũ trong src/onboarding/creatorOptions.ts và màu REAL_OFFICE_STYLE mục 6
 * để dữ liệu cũ giữ nguyên màu khi chuyển đổi.
 */
import type { HexColor } from './types';

export interface Swatch {
  hex: HexColor;
  label: string;
}

/** Màu vải, da, kim loại cho trang phục và phụ kiện. */
export const GARMENT_PALETTE: readonly Swatch[] = [
  // Trắng, kem, be
  { hex: '#ffffff', label: 'Trắng tinh' },
  { hex: '#f4f4f2', label: 'Trắng ngà' },
  { hex: '#e8edf3', label: 'Trắng xám' },
  { hex: '#efe6d6', label: 'Kem' },
  { hex: '#e9dcc4', label: 'Be' },
  { hex: '#b8a88a', label: 'Be đậm' },
  { hex: '#c9b48f', label: 'Kaki' },
  // Xám, đen
  { hex: '#d3d6db', label: 'Xám nhạt' },
  { hex: '#9aa1ab', label: 'Xám vừa' },
  { hex: '#6e7480', label: 'Xám chì' },
  { hex: '#5c6b7a', label: 'Xám xanh' },
  { hex: '#4a4f57', label: 'Xám than' },
  { hex: '#33373d', label: 'Xám đậm' },
  { hex: '#22272e', label: 'Xám than đậm' },
  { hex: '#1f2328', label: 'Đen' },
  { hex: '#17191d', label: 'Đen bóng' },
  { hex: '#0f1013', label: 'Đen tuyền' },
  // Xanh dương
  { hex: '#cfe3ec', label: 'Xanh trời nhạt' },
  { hex: '#bcd4e6', label: 'Xanh nhạt' },
  { hex: '#7fa7c9', label: 'Xanh da trời' },
  { hex: '#3f6fa3', label: 'Xanh dương' },
  { hex: '#2e3a4f', label: 'Xanh navy đậm' },
  { hex: '#1e2636', label: 'Xanh đen' },
  { hex: '#5b7fa6', label: 'Denim nhạt' },
  { hex: '#34507a', label: 'Denim vừa' },
  { hex: '#22314d', label: 'Denim đậm' },
  // Xanh lá, xanh ngọc
  { hex: '#4a7c59', label: 'Xanh lá' },
  { hex: '#3d6b4f', label: 'Xanh lục' },
  { hex: '#5d6b3f', label: 'Xanh rêu' },
  { hex: '#4a5236', label: 'Ô liu' },
  { hex: '#2f7f7a', label: 'Xanh ngọc' },
  { hex: '#9fd3c7', label: 'Xanh bạc hà' },
  // Đỏ, cam, vàng
  { hex: '#8c2f39', label: 'Đỏ đô' },
  { hex: '#c23b3b', label: 'Đỏ' },
  { hex: '#e8502e', label: 'Đỏ cam' },
  { hex: '#ef8a3c', label: 'Cam' },
  { hex: '#c97b63', label: 'Hồng đất' },
  { hex: '#e6b3a8', label: 'Hồng phấn' },
  { hex: '#d9a93f', label: 'Vàng mù tạt' },
  { hex: '#f2d36b', label: 'Vàng chanh nhạt' },
  // Tím, nâu
  { hex: '#b9a7d6', label: 'Tím oải hương' },
  { hex: '#5e4a7a', label: 'Tím than' },
  { hex: '#5b4636', label: 'Nâu' },
  { hex: '#7a5232', label: 'Nâu bò' },
  { hex: '#3e2a1d', label: 'Nâu sô cô la' },
  // Kim loại
  { hex: '#aeb8c4', label: 'Bạc' },
  { hex: '#8b939e', label: 'Thép' },
  { hex: '#c9a85a', label: 'Vàng đồng' },
  { hex: '#a8714a', label: 'Đồng đỏ' },
  { hex: '#3a3d42', label: 'Kim loại đen' },
];

/** Màu tóc tự nhiên và màu nhuộm nhẹ. Gồm 6 màu cũ của creatorOptions. */
export const HAIR_PALETTE: readonly Swatch[] = [
  { hex: '#111111', label: 'Đen' },
  { hex: '#1b1410', label: 'Đen nâu' },
  { hex: '#2b1d14', label: 'Nâu rất đậm' },
  { hex: '#3b2a1f', label: 'Nâu đậm' },
  { hex: '#6b4a2b', label: 'Nâu hạt dẻ' },
  { hex: '#9c6b3c', label: 'Nâu vàng' },
  { hex: '#d8b77a', label: 'Vàng nhạt' },
  { hex: '#e7d7b4', label: 'Vàng tro' },
  { hex: '#b8bcc4', label: 'Xám bạc' },
  { hex: '#e4e6ea', label: 'Bạch kim' },
  { hex: '#7a2e2e', label: 'Đỏ rượu' },
  { hex: '#b2502d', label: 'Cam đồng' },
  { hex: '#34445e', label: 'Xanh khói' },
  { hex: '#4f3f66', label: 'Tím khói' },
  { hex: '#6d8f86', label: 'Xanh rêu nhạt' },
];

/** Màu mắt. Gồm 4 màu cũ của creatorOptions. */
export const EYE_PALETTE: readonly Swatch[] = [
  { hex: '#3b2a1e', label: 'Nâu' },
  { hex: '#1b1410', label: 'Nâu đen' },
  { hex: '#6e7a86', label: 'Xám' },
  { hex: '#3d6b4f', label: 'Xanh lục' },
  { hex: '#7a5a2e', label: 'Hổ phách' },
  { hex: '#3f6fa3', label: 'Xanh dương' },
  { hex: '#2f7f7a', label: 'Xanh ngọc' },
  { hex: '#5e4a7a', label: 'Tím khói' },
];

/** Màu mực xăm: tông trầm, không neon. */
export const INK_PALETTE: readonly Swatch[] = [
  { hex: '#1a1c20', label: 'Đen mực' },
  { hex: '#33373d', label: 'Xám mực' },
  { hex: '#2e3a4f', label: 'Xanh mực' },
  { hex: '#2f5e57', label: 'Xanh rêu' },
  { hex: '#7a2e2e', label: 'Đỏ trầm' },
  { hex: '#8a6a2e', label: 'Vàng đất' },
  { hex: '#4f3f66', label: 'Tím trầm' },
  { hex: '#f4f4f2', label: 'Trắng' },
];

/** Màu sẹo: hồng nhạt đến nâu nhạt, gần màu da; không có đỏ tươi. */
export const SCAR_PALETTE: readonly Swatch[] = [
  { hex: '#e8c4b4', label: 'Hồng nhạt' },
  { hex: '#d8a994', label: 'Hồng đất' },
  { hex: '#c79a7e', label: 'Nâu hồng' },
  { hex: '#b08268', label: 'Nâu nhạt' },
  { hex: '#8d6550', label: 'Nâu trầm' },
  { hex: '#f0dccf', label: 'Trắng sẹo' },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Khoảng cách màu có trọng số cảm nhận đơn giản (redmean). */
function distance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

export function inPalette(hex: string, palette: readonly Swatch[]): boolean {
  const h = hex.toLowerCase();
  return palette.some((s) => s.hex === h);
}

/**
 * Trả về màu trong bảng: đúng màu nếu đã có trong bảng, nếu không thì màu gần nhất.
 * Giá trị không phải hex thì trả về fallback.
 */
export function snapToPalette(value: unknown, palette: readonly Swatch[], fallback: HexColor): HexColor {
  if (!isHex(value)) return fallback;
  const h = value.toLowerCase();
  if (inPalette(h, palette)) return h;
  let best = fallback;
  let bestD = Number.POSITIVE_INFINITY;
  for (const s of palette) {
    const d = distance(h, s.hex);
    if (d < bestD) {
      bestD = d;
      best = s.hex;
    }
  }
  return best;
}
