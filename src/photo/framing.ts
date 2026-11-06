/**
 * Tính toán thuần cho khung và tỷ lệ ảnh chụp. Không import gì để test bằng node trực tiếp.
 */

export type AspectId = 'viewport' | '1:1' | '4:3' | '3:2' | '16:9' | '9:16' | '4:5';

export const ASPECT_IDS: readonly AspectId[] = ['viewport', '1:1', '4:3', '3:2', '16:9', '9:16', '4:5'];

const FIXED: Record<Exclude<AspectId, 'viewport'>, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '4:5': 4 / 5,
};

/** Cạnh dài (px) của các mức độ phân giải định sẵn. */
export const LONG_EDGE_PRESETS = [1080, 1440, 2160, 3840] as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tỷ lệ rộng/cao. 'viewport' theo khung nhìn hiện tại. Trả NaN nếu đầu vào không hợp lệ. */
export function aspectRatio(id: AspectId, viewW: number, viewH: number): number {
  if (id === 'viewport') return viewW > 0 && viewH > 0 ? viewW / viewH : Number.NaN;
  return FIXED[id] ?? Number.NaN;
}

/**
 * Hình chữ nhật lớn nhất đúng tỷ lệ `ratio`, đặt giữa khung nguồn srcW x srcH. Số nguyên.
 * Dùng cho cả khung phủ lên màn hình (css px) lẫn vùng cắt từ buffer WebGL (device px).
 */
export function computeCropRect(srcW: number, srcH: number, ratio: number): Rect | null {
  if (!(srcW >= 1) || !(srcH >= 1) || !(ratio > 0) || !Number.isFinite(ratio)) return null;
  let w = srcW;
  let h = Math.round(w / ratio);
  if (h > srcH) {
    h = srcH;
    w = Math.round(h * ratio);
  }
  w = Math.max(1, Math.min(srcW, Math.floor(w)));
  h = Math.max(1, Math.min(srcH, Math.floor(h)));
  return { x: Math.floor((srcW - w) / 2), y: Math.floor((srcH - h) / 2), w, h };
}

export interface SizeLimits {
  /** Cạnh tối đa của texture/renderbuffer (gl.capabilities.maxTextureSize). */
  maxTexture: number;
  /** Tổng pixel tối đa chấp nhận (bộ nhớ thiết bị). */
  maxPixels: number;
  /** Cạnh dài tối đa của vùng nguồn thực có (vùng cắt từ canvas); không phóng to quá mức này. */
  maxLongEdge?: number;
}

export interface OutputSize {
  width: number;
  height: number;
  /** true nếu kích thước nhận được nhỏ hơn kích thước yêu cầu. */
  reduced: boolean;
  /** Lý do giảm, để báo người dùng. */
  reason: 'none' | 'source' | 'texture' | 'pixels';
}

/** Kích thước ảnh ra theo tỷ lệ và cạnh dài yêu cầu, bị chặn bởi giới hạn. Không bao giờ trả 0. */
export function computeOutputSize(ratio: number, longEdge: number, limits: SizeLimits): OutputSize | null {
  if (!(ratio > 0) || !Number.isFinite(ratio) || !(longEdge >= 1)) return null;
  const landscape = ratio >= 1;
  const scaleFor = (long: number): { w: number; h: number } =>
    landscape
      ? { w: Math.round(long), h: Math.max(1, Math.round(long / ratio)) }
      : { w: Math.max(1, Math.round(long * ratio)), h: Math.round(long) };

  let long = Math.floor(longEdge);
  let reason: OutputSize['reason'] = 'none';
  const cap = (limit: number | undefined, why: OutputSize['reason']): void => {
    if (limit !== undefined && limit >= 1 && long > limit) {
      long = Math.floor(limit);
      reason = why;
    }
  };
  cap(limits.maxLongEdge, 'source');
  cap(limits.maxTexture, 'texture');
  let s = scaleFor(long);
  if (limits.maxPixels >= 1 && s.w * s.h > limits.maxPixels) {
    const k = Math.sqrt(limits.maxPixels / (s.w * s.h));
    long = Math.max(1, Math.floor(long * k));
    s = scaleFor(long);
    while (s.w * s.h > limits.maxPixels && long > 1) {
      long -= 1;
      s = scaleFor(long);
    }
    reason = 'pixels';
  }
  return { width: s.w, height: s.h, reduced: reason !== 'none', reason };
}

export type GridKind = 'none' | 'thirds' | 'golden' | 'center';

export interface GridLine {
  /** Tọa độ chuẩn hóa 0..1 trong khung. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const PHI = 0.381966011250105; // 1 - 1/φ

export function gridLines(kind: GridKind): GridLine[] {
  const v = (x: number): GridLine => ({ x1: x, y1: 0, x2: x, y2: 1 });
  const h = (y: number): GridLine => ({ x1: 0, y1: y, x2: 1, y2: y });
  switch (kind) {
    case 'thirds':
      return [v(1 / 3), v(2 / 3), h(1 / 3), h(2 / 3)];
    case 'golden':
      return [v(PHI), v(1 - PHI), h(PHI), h(1 - PHI)];
    case 'center':
      return [v(0.5), h(0.5)];
    default:
      return [];
  }
}

/** Tiêu cự tương đương (mm, khổ 36x24) -> FOV dọc (độ). Chiều cao cảm biến mặc định 24 mm. */
export function focalToFov(focalMm: number, sensorHeightMm = 24): number {
  if (!(focalMm > 0) || !(sensorHeightMm > 0)) return Number.NaN;
  return (2 * Math.atan(sensorHeightMm / (2 * focalMm)) * 180) / Math.PI;
}

export function fovToFocal(fovDeg: number, sensorHeightMm = 24): number {
  if (!(fovDeg > 0) || fovDeg >= 180 || !(sensorHeightMm > 0)) return Number.NaN;
  return sensorHeightMm / (2 * Math.tan((fovDeg * Math.PI) / 360));
}

/** Kẹp FOV vào khoảng cho phép (độ). */
export function clampFov(fovDeg: number, min = 20, max = 100): number {
  if (!Number.isFinite(fovDeg)) return min;
  return Math.min(max, Math.max(min, fovDeg));
}

/**
 * True nếu mẫu toàn trong suốt hoặc toàn đen (ảnh hỏng do canvas bị clear).
 * `data` là RGBA từ getImageData; chỉ duyệt tối đa `maxSamples` điểm đều nhau.
 */
export function isBlankPixels(data: ArrayLike<number>, maxSamples = 4096): boolean {
  const n = Math.floor(data.length / 4);
  if (n === 0) return true;
  const step = Math.max(1, Math.floor(n / maxSamples));
  for (let i = 0; i < n; i += step) {
    const o = i * 4;
    const a = data[o + 3]!;
    if (a !== 0 && (data[o]! !== 0 || data[o + 1]! !== 0 || data[o + 2]! !== 0)) return false;
  }
  return true;
}
