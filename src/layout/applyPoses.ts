import type { ZoneDef, ZoneObject } from '../content/types';
import { isMovable } from './movable';
import type { Pose } from './types';

/** Bố cục đã lưu (items đè lên defaults) và vị trí gốc, cùng dạng với EditorState.saved / defaults. */
export interface LayoutPoses {
  saved: Readonly<Record<string, Pose>>;
  defaults: Readonly<Record<string, Pose>>;
}

/** Độ lệch của một vật so với vị trí gốc: dịch tâm (mét) và góc xoay thêm (độ, 0/90/180/270). null: không đổi. */
export interface PoseDelta {
  dx: number;
  dz: number;
  rot: 0 | 90 | 180 | 270;
}

const EPS = 1e-6;

/**
 * Độ lệch của id theo bố cục. Dùng độ lệch (không dùng toạ độ tuyệt đối) để vật chưa từng di chuyển giữ NGUYÊN
 * vị trí trong it.json / itFixtures.ts, kể cả khi defaults của máy chủ làm tròn khác chút.
 */
export function poseDelta(id: string, poses: LayoutPoses | undefined): PoseDelta | null {
  if (!poses || !isMovable(id)) return null;
  const to = poses.saved[id];
  const from = poses.defaults[id];
  if (!to || !from) return null;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const rot = ((((to.rotation - from.rotation) % 360) + 360) % 360) as PoseDelta['rot'];
  if (Math.abs(dx) < EPS && Math.abs(dz) < EPS && rot === 0) return null;
  return { dx, dz, rot };
}

/**
 * Áp bố cục đã lưu cho vật thể của khu: tâm dịch theo độ lệch (x, z là tâm thế giới, cùng hệ với position),
 * xoay 90/270 thì hoán đổi rộng và sâu như footprint của trình biên tập (placement.ts). y giữ nguyên.
 * Không có gì đổi thì trả đúng mảng đầu vào.
 */
export function applyLayoutPoses(objects: readonly ZoneObject[], poses: LayoutPoses | undefined): readonly ZoneObject[] {
  if (!poses) return objects;
  let changed = false;
  const out = objects.map((o) => {
    const d = poseDelta(o.id, poses);
    if (!d) return o;
    changed = true;
    const [w, h, dep] = o.size;
    const swap = d.rot === 90 || d.rot === 270;
    return { ...o, position: [o.position[0] + d.dx, o.position[1], o.position[2] + d.dz] as ZoneObject['position'], size: (swap ? [dep, h, w] : [w, h, dep]) as ZoneObject['size'] };
  });
  return changed ? out : objects;
}

let lastZone: ZoneDef | null = null;
let lastPoses: LayoutPoses | undefined;
let lastOut: ZoneDef | null = null;

/** Như applyLayoutPoses nhưng cho ZoneDef và giữ tham chiếu ổn định khi saved/defaults không đổi (tránh dựng lại cảnh). */
export function effectiveZone(zone: ZoneDef, poses: LayoutPoses | undefined): ZoneDef {
  if (lastOut && lastZone === zone && lastPoses?.saved === poses?.saved && lastPoses?.defaults === poses?.defaults) return lastOut;
  const objects = applyLayoutPoses(zone.objects, poses);
  const out = objects === zone.objects ? zone : { ...zone, objects: objects as ZoneObject[] };
  lastZone = zone;
  lastPoses = poses;
  lastOut = out;
  return out;
}

/** Vị trí và góc quay (rad) của vật gắn cố định theo itFixtures (tivi, bảng, cây) sau khi áp bố cục. */
export function fixtureTransform(
  id: string,
  position: readonly [number, number, number],
  rotationY: number,
  poses: LayoutPoses | undefined,
): { position: [number, number, number]; rotationY: number } {
  const d = poseDelta(id, poses);
  if (!d) return { position: [position[0], position[1], position[2]], rotationY };
  return { position: [position[0] + d.dx, position[1], position[2] + d.dz], rotationY: rotationY + (d.rot * Math.PI) / 180 };
}
