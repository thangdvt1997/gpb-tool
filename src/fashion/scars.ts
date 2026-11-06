/**
 * Kiểu sẹo đã lành, tự nhiên và kín đáo (fashion.txt mục 3, user.txt mục 4). Không vết thương hở,
 * không máu. Màu nằm trong SCAR_PALETTE (palette.ts), gần màu da.
 */
import type { SkinRegion } from './types';

export type ScarShape = 'line' | 'curve' | 'cross' | 'nick' | 'dotted' | 'patch';

export interface ScarStyle {
  id: string;
  name: string;
  shape: ScarShape;
  /** Độ rộng vệt, đơn vị tương đối. */
  width: number;
  regions: readonly SkinRegion[];
}

const ALL: readonly SkinRegion[] = [
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

export const SCAR_STYLES: readonly ScarStyle[] = [
  { id: 'sc-line-thin', name: 'Vệt mảnh', shape: 'line', width: 0.02, regions: ALL },
  { id: 'sc-line', name: 'Vệt thẳng', shape: 'line', width: 0.04, regions: ALL },
  { id: 'sc-curve', name: 'Vệt cong', shape: 'curve', width: 0.035, regions: ALL },
  { id: 'sc-brow-nick', name: 'Vết khuyết lông mày', shape: 'nick', width: 0.03, regions: ['face'] },
  { id: 'sc-cross', name: 'Vệt chéo', shape: 'cross', width: 0.03, regions: ALL.filter((r) => r !== 'face') },
  { id: 'sc-dotted', name: 'Vệt chấm khâu đã lành', shape: 'dotted', width: 0.025, regions: ALL.filter((r) => r !== 'face') },
  { id: 'sc-patch', name: 'Mảng da sáng', shape: 'patch', width: 0.08, regions: ALL },
];

const BY_ID: ReadonlyMap<string, ScarStyle> = new Map(SCAR_STYLES.map((s) => [s.id, s]));

export function getScarStyle(id: string): ScarStyle | undefined {
  return BY_ID.get(id);
}

export const SCAR_LIMITS = {
  maxLayers: 12,
  length: { min: 0.3, max: 2 },
  relief: { min: 0, max: 0.3 },
} as const;

export const MOLE_LIMITS = {
  maxMarks: 12,
  size: { min: 0.5, max: 1.5 },
} as const;
