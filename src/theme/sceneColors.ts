import { THEME_TOKENS } from './tokens';
import type { ThemeName } from './tokens';

// Lấy màu cảnh 3D từ cùng bảng token với UI, để hai phần khớp nhau.
export function sceneColorsFor(name: ThemeName): { floor: string; wall: string; accent: string } {
  const t = THEME_TOKENS[name];
  return { floor: t.sceneFloor, wall: t.sceneWall, accent: t.sceneAccent };
}
