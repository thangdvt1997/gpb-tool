export type QualityLevel = 'low' | 'medium' | 'high';
export type QualityMode = QualityLevel | 'auto' | 'custom';
export const LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];

export interface QualityConfig {
  dprCap: number;
  shadows: boolean;
  shadowMapSize: number;
  antialias: boolean;
  textureTier: 0 | 1 | 2; // 0 = nhỏ nhất
  lodDistanceScale: number;
  ambientOcclusion: boolean;
  reflections: boolean;
  postFx: boolean;
  /** 0 = không giới hạn. */
  fpsCap: number;
}

export const QUALITY_TABLE: Record<QualityLevel, QualityConfig> = {
  low: { dprCap: 1, shadows: false, shadowMapSize: 512, antialias: false, textureTier: 0, lodDistanceScale: 0.6,
    ambientOcclusion: false, reflections: false, postFx: false, fpsCap: 30 },
  medium: { dprCap: 1.5, shadows: true, shadowMapSize: 1024, antialias: true, textureTier: 1, lodDistanceScale: 1,
    ambientOcclusion: false, reflections: false, postFx: false, fpsCap: 60 },
  high: { dprCap: 2, shadows: true, shadowMapSize: 2048, antialias: true, textureTier: 2, lodDistanceScale: 1.5,
    ambientOcclusion: true, reflections: true, postFx: true, fpsCap: 0 },
};

/**
 * Tùy chọn mà engine hiện tại thực sự áp dụng được. Chỉ hiển thị trong UI các tùy chọn = true
 * (yêu cầu spec: không hiện tùy chọn không đổi renderer). Cập nhật khi nối vào renderer.
 */
export const ENGINE_SUPPORT: Record<keyof QualityConfig, boolean> = {
  dprCap: true, shadows: true, shadowMapSize: false, antialias: false /* cần remount Canvas */, textureTier: true,
  lodDistanceScale: true, ambientOcclusion: true, reflections: false, postFx: true, fpsCap: false,
};
/** Tùy chọn cần reload/remount mới có hiệu lực. */
export const REQUIRES_REMOUNT: ReadonlyArray<keyof QualityConfig> = ['antialias'];

export function configFor(level: QualityLevel, overrides?: Partial<QualityConfig>): QualityConfig {
  return { ...QUALITY_TABLE[level], ...(overrides ?? {}) };
}

export function levelIndex(l: QualityLevel) { return LEVELS.indexOf(l); }
export const clampDpr = (deviceDpr: number, cap: number) => Math.max(1, Math.min(deviceDpr || 1, cap));
