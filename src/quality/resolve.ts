import { configFor, type QualityConfig, type QualityLevel } from './levels';
import { suggestInitialLevel, type DeviceHints } from './detect';
import type { QualitySettings } from './storage';

/** Gợi ý thiết bị đọc từ trình duyệt (chỉ tính năng, không UA). Thiếu API thì bỏ trường đó. */
export function readDeviceHints(): DeviceHints {
  if (typeof window === 'undefined') return {};
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mm = (q: string) => (typeof window.matchMedia === 'function' ? window.matchMedia(q).matches : false);
  let webgl2: boolean | undefined;
  try {
    webgl2 = !!document.createElement('canvas').getContext('webgl2');
  } catch {
    webgl2 = undefined;
  }
  return {
    deviceMemoryGb: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    devicePixelRatio: window.devicePixelRatio,
    webgl2,
    coarsePointer: mm('(pointer: coarse)'),
    prefersReducedData: mm('(prefers-reduced-data: reduce)'),
  };
}

/**
 * Mức khởi đầu và trần tự nâng theo cài đặt:
 * - auto: mức đề xuất từ thiết bị, trần = mức đề xuất, bật tự thích nghi nếu settings.adaptive.
 * - low/medium/high: khóa mức đó, tắt tự thích nghi.
 * - custom: mức medium + ghi đè, tắt tự thích nghi.
 */
export function resolveQuality(s: QualitySettings, hints: DeviceHints): { level: QualityLevel; ceiling: QualityLevel; adaptive: boolean } {
  if (s.mode === 'auto') {
    const l = suggestInitialLevel(hints);
    return { level: l, ceiling: l, adaptive: s.adaptive };
  }
  if (s.mode === 'custom') return { level: 'medium', ceiling: 'medium', adaptive: false };
  return { level: s.mode, ceiling: s.mode, adaptive: false };
}

/** Cấu hình áp dụng cho renderer ở mức hiện tại (custom thì gộp ghi đè). */
export function effectiveConfig(s: QualitySettings, level: QualityLevel): QualityConfig {
  // Ghim riêng (options) thắng cả mức lẫn custom; không ghim thì theo mức hiện tại.
  return configFor(level, { ...(s.mode === 'custom' ? s.custom : undefined), ...(s.options ?? {}) });
}
