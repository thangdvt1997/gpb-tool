import type { QualityLevel } from './levels';

export interface DeviceHints {
  deviceMemoryGb?: number;
  hardwareConcurrency?: number;
  devicePixelRatio?: number;
  webgl2?: boolean;
  coarsePointer?: boolean;
  prefersReducedData?: boolean;
  /** Frame time trung vị từ benchmark ngắn (ms), nếu có. */
  benchMedianMs?: number;
}

/**
 * Đề xuất mức ban đầu chỉ từ tính năng/khả năng, không dùng UA hay tên GPU.
 * Ngưỡng là heuristic chưa hiệu chỉnh trên máy thật.
 */
export function suggestInitialLevel(h: DeviceHints): QualityLevel {
  if (h.webgl2 === false || h.prefersReducedData) return 'low';
  if (h.benchMedianMs !== undefined) {
    if (h.benchMedianMs > 24) return 'low';
    if (h.benchMedianMs > 14) return 'medium';
  }
  let score = 2;
  if (h.deviceMemoryGb !== undefined && h.deviceMemoryGb <= 2) score -= 2;
  else if (h.deviceMemoryGb !== undefined && h.deviceMemoryGb <= 4) score -= 1;
  if (h.hardwareConcurrency !== undefined && h.hardwareConcurrency <= 4) score -= 1;
  if (h.coarsePointer) score -= 1;
  return score >= 2 ? 'high' : score === 1 ? 'medium' : 'low';
}
