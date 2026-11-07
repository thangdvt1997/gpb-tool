import { keyLabel } from '../settings/rebindFlow';
import type { Bindings, ControlMode } from '../settings/schema';

/**
 * Tên phím hiển thị trong hướng dẫn, suy ra từ cài đặt (bindings + controlMode), không viết cứng.
 * Hàm thuần: nhận bindings làm tham số để test được; HelpLayer truyền cài đặt hiện tại nên đổi phím
 * thì chữ đổi theo ngay.
 */
export interface KeyNames {
  move: string;
  run: string;
  jump: string;
  interact: string;
  view: string;
  overview: string;
  cameraPreset: string;
  map: string;
  editor: string;
  pause: string;
  look: string;
}

export function keyNamesFrom(b: Bindings, mode: ControlMode = 'rightMouse'): KeyNames {
  return {
    move: [b.moveForward, b.moveLeft, b.moveBack, b.moveRight].map(keyLabel).join(' '),
    run: keyLabel(b.run),
    jump: keyLabel(b.jump),
    interact: keyLabel(b.interact),
    view: keyLabel(b.firstPerson),
    overview: keyLabel(b.overview),
    cameraPreset: keyLabel(b.cameraPreset),
    map: keyLabel(b.map),
    editor: keyLabel(b.editor),
    pause: keyLabel(b.cancel),
    look: mode === 'leftMouse' ? 'chuột trái' : 'chuột phải',
  };
}

/** Bỏ dấu tiếng Việt, hạ chữ thường, gộp khoảng trắng: dùng cho ô tìm kiếm. */
export function foldVi(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
