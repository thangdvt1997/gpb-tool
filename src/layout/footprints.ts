import type { ZoneObject } from '../content/types';
import { footprint, type Rect } from '../scene/layout';
import { isMovable } from './movable';

/**
 * Footprint cố định cho useMoveMode: mọi vật thể KHÔNG di chuyển được (bàn, phòng họp, tường, khu dự phòng...).
 * Giống máy chủ (services/layout/src/movable.js, loadZone): chướng ngại cố định là mọi vật không nằm trong danh sách
 * di chuyển, kể cả loại không đặc đối với người đi bộ (reserved, lối vào). Lọc theo isSolidObject làm client
 * chấp nhận vị trí mà máy chủ từ chối 409.
 * Vật di chuyển được bị loại khỏi danh sách để không tự chặn chính nó.
 */
export function fixedRectsOf(objects: readonly ZoneObject[]): Rect[] {
  return objects.filter((o) => !isMovable(o.id)).map((o) => footprint(o));
}

/**
 * Footprint thang máy, thang bộ và lối vào, đưa vào keepOut của useMoveMode.
 * checkPlacement dùng tâm của chúng (bán kính KEEP_OUT 1,5 m, như server).
 */
export function keepOutRectsOf(objects: readonly ZoneObject[]): Rect[] {
  return objects.filter((o) => o.kind === 'core' || o.id === 'entrance').map((o) => footprint(o));
}
