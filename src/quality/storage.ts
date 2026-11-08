import type { QualityConfig, QualityMode } from './levels';

export const QUALITY_STORAGE_KEY = 'gp.quality.v1';
/** Ba tùy chọn người dùng có thể ghim riêng; thiếu trường = theo mức đang chạy (kể cả khi tự thích nghi đổi mức). */
export type GfxOptions = Partial<Pick<QualityConfig, 'textureTier' | 'lodDistanceScale' | 'ambientOcclusion'>>;
export const LOD_SCALES = [0.6, 1, 1.5] as const;
export interface QualitySettings { mode: QualityMode; custom?: Partial<QualityConfig>; adaptive: boolean; options?: GfxOptions }

/** Lọc `options` đọc từ bộ nhớ: chỉ giữ giá trị hợp lệ. */
export function sanitizeOptions(o: unknown): GfxOptions | undefined {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined;
  const r = o as Record<string, unknown>;
  const out: GfxOptions = {};
  if (r.textureTier === 0 || r.textureTier === 1 || r.textureTier === 2) out.textureTier = r.textureTier;
  if (typeof r.lodDistanceScale === 'number' && (LOD_SCALES as readonly number[]).includes(r.lodDistanceScale)) out.lodDistanceScale = r.lodDistanceScale;
  if (typeof r.ambientOcclusion === 'boolean') out.ambientOcclusion = r.ambientOcclusion;
  return Object.keys(out).length ? out : undefined;
}
export const DEFAULT_QUALITY_SETTINGS: QualitySettings = { mode: 'auto', adaptive: true };

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const MODES = ['low', 'medium', 'high', 'auto', 'custom'];
const getLs = (): KV | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export function parseSettings(raw: string | null): QualitySettings {
  if (!raw) return { ...DEFAULT_QUALITY_SETTINGS };
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object' || !MODES.includes(o.mode)) return { ...DEFAULT_QUALITY_SETTINGS };
    const custom = o.custom && typeof o.custom === 'object' && !Array.isArray(o.custom) ? o.custom : undefined;
    const options = sanitizeOptions(o.options);
    return { mode: o.mode, custom, adaptive: typeof o.adaptive === 'boolean' ? o.adaptive : true, ...(options ? { options } : {}) };
  } catch { return { ...DEFAULT_QUALITY_SETTINGS }; }
}

export function loadQualitySettings(kv: KV | null = getLs()): QualitySettings {
  try { return parseSettings(kv ? kv.getItem(QUALITY_STORAGE_KEY) : null); } catch { return { ...DEFAULT_QUALITY_SETTINGS }; }
}
export function saveQualitySettings(s: QualitySettings, kv: KV | null = getLs()): boolean {
  try { if (!kv) return false; kv.setItem(QUALITY_STORAGE_KEY, JSON.stringify(s)); return true; } catch { return false; }
}
export function resetQualitySettings(kv: KV | null = getLs()): QualitySettings {
  try { kv?.removeItem(QUALITY_STORAGE_KEY); } catch { /* bỏ qua */ }
  return { ...DEFAULT_QUALITY_SETTINGS };
}
