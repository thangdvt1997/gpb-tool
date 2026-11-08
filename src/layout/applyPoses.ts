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
    const next: ZoneObject = { ...o, position: [o.position[0] + d.dx, o.position[1], o.position[2] + d.dz] as ZoneObject['position'], size: (swap ? [dep, h, w] : [w, h, dep]) as ZoneObject['size'] };
    if (d.rot !== 0) next.layoutRot = d.rot;
    return next;
  });
  return changed ? out : objects;
}

/** Vật chưa xoay: size gốc (hoán đổi lại nếu 90/270), bỏ layoutRot. Vị trí tâm giữ nguyên. Hình ghép dựng từ vật này rồi quay. */
export function unrotatedOf(o: ZoneObject): ZoneObject {
  if (!o.layoutRot) return o;
  const { layoutRot, ...rest } = o;
  const [w, h, d] = o.size;
  return layoutRot === 180 ? rest : { ...rest, size: [d, h, w] };
}

/** Góc quay quanh trục y (rad) của hình ghép, cùng chiều với fixtureTransform. */
export function layoutRotationY(o: { layoutRot?: number }): number {
  return ((o.layoutRot ?? 0) * Math.PI) / 180;
}

/** Hộp chữ nhật trên sàn (hệ thế giới). */
export interface FloorBox { minX: number; maxX: number; minZ: number; maxZ: number }

/**
 * Quay các hộp quanh tâm (cx, cz) theo rotationY = rot độ (three.js: (dx,dz) -> (dx cos + dz sin, -dx sin + dz cos)).
 * Bội 90 nên kết quả vẫn là hộp thẳng trục. Giữ nguyên các trường khác của hộp.
 */
export function rotateBoxesAbout<T extends FloorBox>(boxes: readonly T[], cx: number, cz: number, rot: number): T[] {
  const r = ((rot % 360) + 360) % 360;
  if (r === 0) return boxes.map((b) => ({ ...b }));
  const map = (x: number, z: number): [number, number] => {
    const dx = x - cx;
    const dz = z - cz;
    if (r === 90) return [cx + dz, cz - dx];
    if (r === 180) return [cx - dx, cz - dz];
    return [cx - dz, cz + dx];
  };
  return boxes.map((b) => {
    const [x1, z1] = map(b.minX, b.minZ);
    const [x2, z2] = map(b.maxX, b.maxZ);
    return { ...b, minX: Math.min(x1, x2), maxX: Math.max(x1, x2), minZ: Math.min(z1, z2), maxZ: Math.max(z1, z2) };
  });
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
