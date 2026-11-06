import type { ZoneObject } from '../../content/types';
import { requestSit } from '../controls/session';
import { targetsOf } from './geometry';
import type { InteractableDef } from './registry';

/**
 * Ghế ở khối bàn làm việc dưới dạng vật của khung tương tác (thay hành vi ghế của InteractTracker cũ):
 * một hành động "Ngồi xuống" gọi requestSit tới chỗ ngồi đã tính ở geometry.targetsOf.
 * Đứng dậy: InteractionSystem bắt phím E khi session.seated.
 */
export function chairInteractables(objects: readonly ZoneObject[]): InteractableDef[] {
  const out: InteractableDef[] = [];
  for (const t of targetsOf(objects)) {
    const seat = t.seat;
    if (t.kind !== 'chair' || !seat) continue;
    out.push({
      id: t.id,
      kind: 'chair',
      label: t.label,
      footprint: { cx: t.cx, cz: t.cz, hx: t.hx, hz: t.hz },
      height: 0.9,
      maxDistance: t.range,
      priority: t.priority,
      actions: [{ id: 'sit', label: 'Ngồi xuống', run: () => requestSit({ id: t.id, x: seat.x, z: seat.z, yaw: seat.yaw }) }],
    });
  }
  return out;
}
