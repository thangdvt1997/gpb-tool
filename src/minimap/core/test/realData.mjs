// Nạp dữ liệu thật của cảnh (it.json, officeBounds.ts, layout.ts, chặn của lối vào và đạo cụ) cho test.
// Dựng vật cản giống ITOffice.tsx: collisionRects + entryBlockers + OFFICE_PROP_BLOCKERS (phần decor của
// lounge/pantry/coffee nằm ngoài chữ L nên không dựng), cộng tường ngoài theo đúng quy tắc Floorplan.tsx.
// Không gồm cây theo chủ đề (decorBlockersOf với plants = true): test chạy với theme 'none' (mặc định).
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('./ts-hooks.mjs', import.meta.url);

const root = new URL('../../../', import.meta.url); // src/
const layout = await import(new URL('scene/layout.ts', root).href);
const bounds = await import(new URL('scene/officeBounds.ts', root).href);
const props = await import(new URL('scene/officePropsLayout.ts', root).href);
const entry = await import(new URL('scene/entry/placement.ts', root).href);
const zone = JSON.parse(readFileSync(new URL('content/zones/it.json', root), 'utf8'));

// Như ITOffice.tsx: chỉ vật thể nằm trọn trong L; moderation_desk chỉ hiện với vai trò có trong roles.
const ROLE = 'admin';
const objects = zone.objects.filter(
  (o) => bounds.isObjectInOffice(o) && (o.id !== entry.MOD_DESK_ID || o.roles.includes(ROLE)),
);

// Như Floorplan.tsx: tường 0,3 m sát mép trong của sàn, chỉ trên cạnh L trùng mép tòa nhà.
const T = layout.OUTER_WALL.thickness;
const outerWalls = [];
const P = bounds.OFFICE_L_PLAN;
for (let i = 0; i < P.length; i++) {
  const [ax, ay] = P[i];
  const [bx, by] = P[(i + 1) % P.length];
  if (ay === by && (ay === 0 || ay === layout.FLOOR.depth)) {
    const z = ay === 0 ? layout.toWorldZ(0) : layout.toWorldZ(layout.FLOOR.depth) - T;
    outerWalls.push({ minX: layout.toWorldX(Math.min(ax, bx)), maxX: layout.toWorldX(Math.max(ax, bx)), minZ: z, maxZ: z + T });
  } else if (ax === bx && (ax === 0 || ax === layout.FLOOR.width)) {
    const x = ax === 0 ? layout.toWorldX(0) : layout.toWorldX(layout.FLOOR.width) - T;
    outerWalls.push({ minX: x, maxX: x + T, minZ: layout.toWorldZ(Math.min(ay, by)), maxZ: layout.toWorldZ(Math.max(ay, by)) });
  }
}

const obstacles = [
  ...layout.collisionRects(objects),
  ...entry.entryBlockers(objects),
  ...props.OFFICE_PROP_BLOCKERS,
  ...outerWalls,
];

export const real = {
  layout,
  bounds,
  entry,
  zone,
  objects,
  obstacles,
  outerWalls,
  walkRects: bounds.OFFICE_L_RECTS,
  polygon: bounds.OFFICE_L_POLYGON,
  radius: layout.PLAYER_RADIUS,
  byId: (id) => zone.objects.find((o) => o.id === id),
};
