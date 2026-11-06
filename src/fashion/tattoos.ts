/**
 * Thư viện hình xăm procedural (fashion.txt mục 3). Mọi mẫu là tham số tự định nghĩa để bộ dựng vẽ
 * thành decal/texture (SVG path sinh từ tham số), không phải ảnh có bản quyền.
 * Ảnh PNG người dùng tải lên chưa hỗ trợ ở đây: cần lưu asset và kiểm duyệt (xem báo cáo).
 */
import type { SkinRegion } from './types';

export type TattooKind = 'text' | 'geometric' | 'ornament' | 'symbol' | 'lineart';

export type TattooParams =
  | { kind: 'text'; font: 'script' | 'serif' | 'block' | 'mono'; tracking: number; defaultText: string }
  | { kind: 'geometric'; primitive: 'triangle' | 'circle' | 'hexagon' | 'square' | 'line-band' | 'dot-grid'; count: number; stroke: number; filled: boolean }
  | { kind: 'ornament'; motif: 'wave' | 'vine' | 'cloud-swirl' | 'knot-band' | 'lotus-band'; repeat: number; stroke: number; wrap: boolean }
  | { kind: 'symbol'; glyph: 'star' | 'arrow' | 'lightning' | 'crescent' | 'compass' | 'anchor'; stroke: number; filled: boolean }
  | { kind: 'lineart'; subject: 'mountain' | 'wave' | 'leaf' | 'paper-plane' | 'coffee-cup' | 'cat-outline' | 'rose-outline'; stroke: number };

export interface TattooTemplate {
  id: string;
  name: string;
  params: TattooParams;
  /** Vùng được phép đặt. */
  regions: readonly SkinRegion[];
  /** Mẫu bao quanh chi (vòng tay, vòng chân). */
  wraps: boolean;
}

/** Số ký tự tối đa cho hình xăm chữ. */
export const TATTOO_TEXT_MAX = 20;

const LIMBS: readonly SkinRegion[] = ['upperArm', 'forearm', 'thigh', 'calf'];
const ANYWHERE: readonly SkinRegion[] = [
  'face',
  'neck',
  'chest',
  'abdomen',
  'back',
  'upperArm',
  'forearm',
  'hand',
  'thigh',
  'calf',
  'foot',
];
const NO_FACE: readonly SkinRegion[] = ANYWHERE.filter((r) => r !== 'face');
const SMALL_SPOTS: readonly SkinRegion[] = ['face', 'neck', 'hand', 'forearm', 'foot'];

export const TATTOO_TEMPLATES: readonly TattooTemplate[] = [
  { id: 'tt-text-script', name: 'Chữ viết tay', params: { kind: 'text', font: 'script', tracking: 0.02, defaultText: 'Bình an' }, regions: NO_FACE, wraps: false },
  { id: 'tt-text-serif', name: 'Chữ có chân', params: { kind: 'text', font: 'serif', tracking: 0.05, defaultText: 'Kiên trì' }, regions: NO_FACE, wraps: false },
  { id: 'tt-text-block', name: 'Chữ khối', params: { kind: 'text', font: 'block', tracking: 0.08, defaultText: 'TEAM' }, regions: NO_FACE, wraps: false },
  { id: 'tt-text-mono', name: 'Chữ mã', params: { kind: 'text', font: 'mono', tracking: 0.1, defaultText: '1001' }, regions: NO_FACE, wraps: false },
  { id: 'tt-geo-triangle', name: 'Tam giác lồng', params: { kind: 'geometric', primitive: 'triangle', count: 3, stroke: 0.05, filled: false }, regions: ANYWHERE, wraps: false },
  { id: 'tt-geo-circle', name: 'Vòng tròn đồng tâm', params: { kind: 'geometric', primitive: 'circle', count: 3, stroke: 0.04, filled: false }, regions: ANYWHERE, wraps: false },
  { id: 'tt-geo-hex', name: 'Lục giác', params: { kind: 'geometric', primitive: 'hexagon', count: 1, stroke: 0.06, filled: false }, regions: ANYWHERE, wraps: false },
  { id: 'tt-geo-band', name: 'Vòng sọc', params: { kind: 'geometric', primitive: 'line-band', count: 2, stroke: 0.08, filled: true }, regions: LIMBS, wraps: true },
  { id: 'tt-geo-dots', name: 'Lưới chấm', params: { kind: 'geometric', primitive: 'dot-grid', count: 9, stroke: 0.03, filled: true }, regions: NO_FACE, wraps: false },
  { id: 'tt-orn-wave', name: 'Hoa văn sóng', params: { kind: 'ornament', motif: 'wave', repeat: 6, stroke: 0.05, wrap: true }, regions: LIMBS, wraps: true },
  { id: 'tt-orn-vine', name: 'Dây leo', params: { kind: 'ornament', motif: 'vine', repeat: 4, stroke: 0.04, wrap: false }, regions: NO_FACE, wraps: false },
  { id: 'tt-orn-cloud', name: 'Mây cuộn', params: { kind: 'ornament', motif: 'cloud-swirl', repeat: 3, stroke: 0.05, wrap: false }, regions: NO_FACE, wraps: false },
  { id: 'tt-orn-knot', name: 'Vòng nút thắt', params: { kind: 'ornament', motif: 'knot-band', repeat: 8, stroke: 0.06, wrap: true }, regions: LIMBS, wraps: true },
  { id: 'tt-orn-lotus', name: 'Dải sen', params: { kind: 'ornament', motif: 'lotus-band', repeat: 5, stroke: 0.04, wrap: true }, regions: LIMBS, wraps: true },
  { id: 'tt-sym-star', name: 'Ngôi sao', params: { kind: 'symbol', glyph: 'star', stroke: 0.06, filled: false }, regions: ANYWHERE, wraps: false },
  { id: 'tt-sym-arrow', name: 'Mũi tên', params: { kind: 'symbol', glyph: 'arrow', stroke: 0.05, filled: true }, regions: ANYWHERE, wraps: false },
  { id: 'tt-sym-bolt', name: 'Tia chớp', params: { kind: 'symbol', glyph: 'lightning', stroke: 0.05, filled: true }, regions: SMALL_SPOTS, wraps: false },
  { id: 'tt-sym-moon', name: 'Trăng khuyết', params: { kind: 'symbol', glyph: 'crescent', stroke: 0.05, filled: true }, regions: ANYWHERE, wraps: false },
  { id: 'tt-sym-compass', name: 'La bàn', params: { kind: 'symbol', glyph: 'compass', stroke: 0.04, filled: false }, regions: NO_FACE, wraps: false },
  { id: 'tt-sym-anchor', name: 'Mỏ neo', params: { kind: 'symbol', glyph: 'anchor', stroke: 0.05, filled: false }, regions: NO_FACE, wraps: false },
  { id: 'tt-line-mountain', name: 'Núi nét mảnh', params: { kind: 'lineart', subject: 'mountain', stroke: 0.03 }, regions: NO_FACE, wraps: false },
  { id: 'tt-line-wave', name: 'Con sóng nét mảnh', params: { kind: 'lineart', subject: 'wave', stroke: 0.03 }, regions: NO_FACE, wraps: false },
  { id: 'tt-line-leaf', name: 'Chiếc lá', params: { kind: 'lineart', subject: 'leaf', stroke: 0.03 }, regions: ANYWHERE, wraps: false },
  { id: 'tt-line-plane', name: 'Máy bay giấy', params: { kind: 'lineart', subject: 'paper-plane', stroke: 0.03 }, regions: NO_FACE, wraps: false },
  { id: 'tt-line-coffee', name: 'Cốc cà phê', params: { kind: 'lineart', subject: 'coffee-cup', stroke: 0.03 }, regions: NO_FACE, wraps: false },
  { id: 'tt-line-cat', name: 'Mèo nét liền', params: { kind: 'lineart', subject: 'cat-outline', stroke: 0.03 }, regions: NO_FACE, wraps: false },
  { id: 'tt-line-rose', name: 'Hoa hồng nét mảnh', params: { kind: 'lineart', subject: 'rose-outline', stroke: 0.03 }, regions: NO_FACE, wraps: false },
];

const BY_ID: ReadonlyMap<string, TattooTemplate> = new Map(TATTOO_TEMPLATES.map((t) => [t.id, t]));

export function getTattooTemplate(id: string): TattooTemplate | undefined {
  return BY_ID.get(id);
}

/** Giới hạn tham số lớp hình xăm. */
export const TATTOO_LIMITS = {
  maxLayers: 12,
  scale: { min: 0.2, max: 2.5 },
  opacity: { min: 0.15, max: 1 },
} as const;
