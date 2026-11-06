/** Tên file và metadata ảnh chụp. Thuần, không import. Không chứa thông tin cá nhân. */

export type PhotoFormat = 'png' | 'jpeg';
export type PhotoCameraKind = 'fixed' | 'follow' | 'free';

const FORMATS: Record<PhotoFormat, { ext: string; mime: string }> = {
  png: { ext: 'png', mime: 'image/png' },
  jpeg: { ext: 'jpg', mime: 'image/jpeg' },
};
const MODES: readonly PhotoCameraKind[] = ['fixed', 'follow', 'free'];

export function formatInfo(f: PhotoFormat): { ext: string; mime: string } {
  return FORMATS[f] ?? FORMATS.png;
}

const p2 = (n: number): string => String(n).padStart(2, '0');

/** Ví dụ: gpb-photo-follow-20261106-153045-1920x1080.png (giờ theo múi giờ máy). */
export function buildPhotoFileName(o: {
  mode: PhotoCameraKind;
  width: number;
  height: number;
  format: PhotoFormat;
  date: Date;
  /** Số thứ tự khi chụp nhiều ảnh trong cùng một giây. */
  seq?: number;
}): string {
  const mode = MODES.includes(o.mode) ? o.mode : 'free';
  const d = Number.isNaN(o.date.getTime()) ? new Date(0) : o.date;
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  const w = Math.max(0, Math.floor(o.width));
  const h = Math.max(0, Math.floor(o.height));
  const seq = o.seq && o.seq > 1 ? `-${Math.floor(o.seq)}` : '';
  return `gpb-photo-${mode}-${stamp}-${w}x${h}${seq}.${formatInfo(o.format).ext}`;
}

export interface PhotoMetadata {
  capturedAt: string;
  cameraMode: PhotoCameraKind;
  width: number;
  height: number;
  format: PhotoFormat;
  aspect: string;
  hudHidden: boolean;
}

/** Chỉ các trường cơ bản; không tên người dùng, id, vị trí hay watermark. */
export function buildPhotoMetadata(o: {
  date: Date;
  mode: PhotoCameraKind;
  width: number;
  height: number;
  format: PhotoFormat;
  aspect: string;
  hudHidden: boolean;
}): PhotoMetadata {
  return {
    capturedAt: Number.isNaN(o.date.getTime()) ? '' : o.date.toISOString(),
    cameraMode: MODES.includes(o.mode) ? o.mode : 'free',
    width: Math.floor(o.width),
    height: Math.floor(o.height),
    format: o.format in FORMATS ? o.format : 'png',
    aspect: o.aspect,
    hudHidden: o.hudHidden,
  };
}
