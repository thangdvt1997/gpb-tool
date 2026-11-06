import type { ZoneObject } from '../content/types';
import { collisionRects, footprint, type Rect } from '../scene/layout';
import { isMovable } from './movable';

/**
 * Footprint cố định cho useMoveMode: mọi vật thể đặc KHÔNG di chuyển được (bàn, phòng họp, tường...).
 * Vật di chuyển được bị loại khỏi danh sách để không tự chặn chính nó.
 */
export function fixedRectsOf(objects: readonly ZoneObject[]): Rect[] {
  return collisionRects(objects.filter((o) => !isMovable(o.id)));
}

/**
 * Footprint thang máy, thang bộ và lối vào, đưa vào keepOut của useMoveMode.
 * Không nới ở đây: hook tự nới KEEP_OUT (1,5 m).
 */
export function keepOutRectsOf(objects: readonly ZoneObject[]): Rect[] {
  return objects.filter((o) => o.kind === 'core' || o.id === 'entrance').map((o) => footprint(o));
}
