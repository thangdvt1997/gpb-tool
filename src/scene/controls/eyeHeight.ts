/**
 * Chiều cao camera theo hình thể (TASK 05): mắt và điểm nhìn của camera tỷ lệ với chiều cao nhân vật,
 * để nhân vật chibi (85–130 cm) không bị camera nhìn từ tầm người lớn. Mốc 1,70 m cho giá trị cũ.
 */
export const REFERENCE_HEIGHT_M = 1.7;
const BASE = { eyeStand: 1.58, eyeSit: 1.18, target: 1.5, targetSit: 1.1 } as const;

export interface CameraHeights {
  eyeStand: number;
  eyeSit: number;
  target: number;
  targetSit: number;
}

/** Hệ số kẹp [0,45; 1,3] để dữ liệu hỏng không đưa camera xuống sàn hoặc lên trần. */
export function cameraHeightsFor(bodyHeightM: number | undefined): CameraHeights {
  const h = typeof bodyHeightM === 'number' && Number.isFinite(bodyHeightM) ? bodyHeightM : REFERENCE_HEIGHT_M;
  const k = Math.min(1.3, Math.max(0.45, h / REFERENCE_HEIGHT_M));
  return { eyeStand: BASE.eyeStand * k, eyeSit: BASE.eyeSit * k, target: BASE.target * k, targetSit: BASE.targetSit * k };
}
