// Nguồn dữ liệu của minimap: dựng từ CÙNG dữ liệu với cảnh 3D (it.json, officeBounds.ts, layout.ts,
// entryBlockers, decorBlockersOf). Không có tọa độ vẽ tay ở đây.
//
// Quy tắc lọc giống ITOffice.tsx: chỉ vật nằm trọn trong chữ L (isObjectInOffice); bàn kiểm duyệt chỉ hiện
// với vai trò có trong roles của nó. Vật cản giống ITOffice.tsx: collisionRects + decorBlockersOf + entryBlockers,
// cộng tường ngoài theo đúng quy tắc của Floorplan.tsx (chỉ trên cạnh L trùng mép tòa nhà).

import type { Role, ZoneDef, ZoneObject } from '../content/types';
import { decorBlockersOf } from '../env';
import { isMovable } from '../layout/movable';
import type { Pose } from '../layout/types';
import { MOD_DESK_ID, entryBlockers } from '../scene/entry/placement';
import { FLOOR, OUTER_WALL, PLAYER_RADIUS, collisionRects, footprint, toWorldX, toWorldZ, type Rect } from '../scene/layout';
import { OFFICE_L_PLAN, OFFICE_L_POLYGON, OFFICE_L_RECTS, isObjectInOffice } from '../scene/officeBounds';
import { categoryOfKind, type MapItem } from './core/index.js';

export interface MinimapSources {
  /** Vật thể được dựng trong cảnh (đã lọc theo L, vai trò, đã áp vị trí bố cục nếu bật). */
  objects: ZoneObject[];
  /** Mục hiển thị và tìm kiếm trên bản đồ. */
  items: MapItem[];
  polygon: ReadonlyArray<readonly [number, number]>;
  walkRects: readonly Rect[];
  walls: Rect[];
  obstacles: Rect[];
  radius: number;
  /** Chuỗi đại diện cho vật cản và vùng đi lại: đổi khi layout đổi, dùng để debounce dựng lại lưới. */
  signature: string;
}

/** Tường ngoài 0,3 m sát mép trong của sàn, chỉ trên cạnh L trùng mép tòa nhà (như Floorplan.tsx). */
export function outerWallRects(): Rect[] {
  const T = OUTER_WALL.thickness;
  const out: Rect[] = [];
  for (let i = 0; i < OFFICE_L_PLAN.length; i++) {
    const [ax, ay] = OFFICE_L_PLAN[i];
    const [bx, by] = OFFICE_L_PLAN[(i + 1) % OFFICE_L_PLAN.length];
    if (ay === by && (ay === 0 || ay === FLOOR.depth)) {
      const z = ay === 0 ? toWorldZ(0) : toWorldZ(FLOOR.depth) - T;
      out.push({ minX: toWorldX(Math.min(ax, bx)), maxX: toWorldX(Math.max(ax, bx)), minZ: z, maxZ: z + T });
    } else if (ax === bx && (ax === 0 || ax === FLOOR.width)) {
      const x = ax === 0 ? toWorldX(0) : toWorldX(FLOOR.width) - T;
      out.push({ minX: x, maxX: x + T, minZ: toWorldZ(Math.min(ay, by)), maxZ: toWorldZ(Math.max(ay, by)) });
    }
  }
  return out;
}

/** Áp vị trí bố cục cho vật di chuyển được: tâm theo pose, xoay 90/270 thì hoán đổi rộng và sâu. */
function withPose(o: ZoneObject, pose: Pose | undefined): ZoneObject {
  if (!pose || !isMovable(o.id)) return o;
  const swap = pose.rotation === 90 || pose.rotation === 270;
  const [w, h, d] = o.size;
  return { ...o, position: [pose.x, o.position[1], pose.z], size: swap ? [d, h, w] : [w, h, d] };
}

const round = (v: number) => Math.round(v * 1000) / 1000;
const rectKey = (r: Rect) => `${round(r.minX)},${round(r.maxX)},${round(r.minZ)},${round(r.maxZ)}`;

export interface SourceOptions {
  zone: ZoneDef;
  role: Role | undefined;
  /** Cây theo chủ đề (decorBlockersOf). Phải khớp tham số plants mà ITOffice dùng. */
  plants: boolean;
  /** Vị trí bố cục (useLayout().poseOf). undefined: dùng vị trí trong it.json, như cảnh hiện tại. */
  poseOf?: (id: string) => Pose | undefined;
}

export function buildMinimapSources({ zone, role, plants, poseOf }: SourceOptions): MinimapSources {
  const objects = zone.objects
    .map((o) => withPose(o, poseOf?.(o.id)))
    .filter((o) => isObjectInOffice(o) && (o.id !== MOD_DESK_ID || (role !== undefined && o.roles.includes(role))));
  const walls = outerWallRects();
  const obstacles: Rect[] = [
    ...collisionRects(objects),
    ...decorBlockersOf(objects, plants),
    ...entryBlockers(objects),
    ...walls,
  ];
  const items: MapItem[] = objects
    .filter((o) => o.kind !== 'reserved')
    .map((o) => ({
      id: o.id,
      label: o.label,
      kind: o.kind,
      category: categoryOfKind(o.kind),
      squad: o.squad,
      capacity: o.capacity,
      rect: footprint(o),
      center: { x: o.position[0], z: o.position[2] },
      isEntrance: o.id === 'entrance',
    }));
  const signature = [
    OFFICE_L_RECTS.map(rectKey).join(';'),
    obstacles.map(rectKey).join(';'),
    items.map((i) => `${i.id}@${rectKey(i.rect)}`).join(';'),
  ].join('|');
  return {
    objects,
    items,
    polygon: OFFICE_L_POLYGON,
    walkRects: OFFICE_L_RECTS,
    walls,
    obstacles,
    radius: PLAYER_RADIUS,
    signature,
  };
}
