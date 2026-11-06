import type { ObjectKind, ZoneObject } from '../content/types';

export type V3 = [number, number, number];

/** Sàn 58 × 30 m, gốc three.js ở giữa sàn (xem docs/FLOORPLAN_IT.md). */
export const FLOOR = { width: 58, depth: 30 };
export const OUTER_WALL = { thickness: 0.3, height: 3.2 };
export const GLASS = { thickness: 0.15, height: 2.8 };
export const PLAYER_RADIUS = 0.35;

/** Độ cao lớp phủ sàn (lounge, pantry), đặt trên mặt sàn để không chồng lên nhau. */
export const DECAL_Y = 0.025;

/** Đổi tọa độ bản vẽ (gốc trên-trái, mét) sang three.js: worldX = x - 29, worldZ = y - 15. */
export const toWorldX = (x: number) => x - FLOOR.width / 2;
export const toWorldZ = (y: number) => y - FLOOR.depth / 2;

/**
 * Nhân vật xuất hiện tại (25.0, 18.0) theo bản vẽ, tức (-4, 3) theo thế giới: sảnh trước quầy Service Desk, sát lối vào.
 * Điểm cũ (25.0, 17.0) = (-4, 2) nằm trong footprint của service_desk.
 */
export const SPAWN = { x: toWorldX(25), z: toWorldZ(18) };

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Mảnh hình hộp của vật thể (chỉ dùng để vẽ, không dùng để va chạm).
 * - box: tô màu theo trạng thái, bấm được (owner là id vật thể).
 * - glass: kính trong suốt, bấm được.
 * - decor: trang trí bên trong phòng, không bấm.
 */
export interface Part {
  layer: 'box' | 'glass' | 'decor';
  owner?: string;
  pos: V3;
  size: V3;
  color: string;
}

/** Lõi có bậc thang. full: toàn bộ footprint. half: nửa phía Tây, nửa Đông là thang máy. */
const STAIR_CORES: Record<string, 'full' | 'half'> = {
  core_st1: 'full',
  core_st2: 'full',
  core_st3: 'full',
  core_lift1: 'half',
};
const STEP_COUNT = 10;
const STEP_RISE = 0.16;

const COLOR = {
  lift: '#3b4660',
  stair: '#56627f',
  wc: '#4a5a78',
  door: ['#2f6fd1', '#d46ab3', '#2fbf71'],
  pantryFloor: '#2f4a4a',
  loungeFloor: '#2b2f4a',
  glass: '#9cc9ff',
  desk: '#8a6e4b',
  chair: '#2b3550',
  rack: '#1a2232',
  led: '#2fbf71',
  ledWarn: '#f2b632',
  screen: '#2a6fdb',
  amenity: '#4f5d7a',
  noticeBoard: '#7f9cc9',
  kudosBoard: '#c9a227',
  nocWall: '#1d2638',
  serviceCounter: '#5b6b8c',
};

/** Loại nào là khối đặc (chặn đi lại theo footprint). Amenity chỉ đặc khi cao từ 0.5 m. */
const SOLID_KINDS: ReadonlySet<ObjectKind> = new Set<ObjectKind>([
  'core',
  'wc',
  'meeting',
  'server',
  'room',
  'counter',
  'board',
  'wall',
  'screen',
  'desk',
  // Khung cửa thang và bảng ghi danh sát tường. Bàn an ninh không ở đây: nó chặn theo từng mảnh
  // (entryBlockers trong src/scene/entry), để làn qua cổng xoay vẫn đi được.
  'elevator',
  'checkin_board',
]);

export function isSolidObject(o: ZoneObject): boolean {
  if (o.kind === 'amenity') return o.size[1] >= 0.5;
  return SOLID_KINDS.has(o.kind);
}

export function footprint(o: ZoneObject): Rect {
  const [cx, , cz] = o.position;
  const [w, , d] = o.size;
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
}

/**
 * Vùng va chạm: footprint của mọi vật thể đặc (xem isSolidObject), lấy đúng position và size trong it.json.
 * Vật thể không đặc có decor (lounge, pantry, khu cà phê) do decorBlockersOf trong src/env cung cấp,
 * nên đồ đạc được chặn đúng chỗ decor vẽ.
 */
export function collisionRects(objects: ZoneObject[]): Rect[] {
  return objects.filter(isSolidObject).map((o) => footprint(o));
}

/** Độ cao đặt nhãn 3D. Bàn đặt nhãn cao hơn để không bị khuất trong khối bàn. */
export function labelY(o: ZoneObject): number {
  if (o.kind === 'desk') return 1.6;
  return Math.min(o.position[1] + o.size[1] / 2 + 0.3, 2.6);
}

function baseColor(o: ZoneObject): string {
  if (o.kind === 'board') return o.action === 'kudos' ? COLOR.kudosBoard : COLOR.noticeBoard;
  switch (o.kind) {
    case 'core':
      return COLOR.lift;
    case 'wc':
      return COLOR.wc;
    case 'counter':
      return COLOR.serviceCounter;
    case 'wall':
      return COLOR.nocWall;
    case 'screen':
      return COLOR.screen;
    default:
      return COLOR.amenity;
  }
}

function box(owner: string | undefined, layer: Part['layer'], pos: V3, size: V3, color: string): Part {
  return { layer, owner, pos, size, color };
}

/** Bậc thang: hộp lặp tăng dần chiều cao, chạy theo cạnh dài của vùng. */
function stepParts(owner: string, x0: number, x1: number, z0: number, z1: number): Part[] {
  const out: Part[] = [];
  const alongX = x1 - x0 >= z1 - z0;
  for (let i = 0; i < STEP_COUNT; i++) {
    const h = STEP_RISE * (i + 1);
    if (alongX) {
      const len = (x1 - x0) / STEP_COUNT;
      out.push(box(owner, 'box', [x0 + (i + 0.5) * len, h / 2, (z0 + z1) / 2], [len, h, z1 - z0], COLOR.stair));
    } else {
      const len = (z1 - z0) / STEP_COUNT;
      out.push(box(owner, 'box', [(x0 + x1) / 2, h / 2, z0 + (i + 0.5) * len], [x1 - x0, h, len], COLOR.stair));
    }
  }
  return out;
}

/** Bốn vách kính của phòng, đặt sát mép footprint bên trong. */
function glassWalls(o: ZoneObject): Part[] {
  const [cx, , cz] = o.position;
  const [w, , d] = o.size;
  const T = GLASS.thickness;
  const H = GLASS.height;
  const y = H / 2;
  return [
    box(o.id, 'glass', [cx, y, cz - d / 2 + T / 2], [w, H, T], COLOR.glass),
    box(o.id, 'glass', [cx, y, cz + d / 2 - T / 2], [w, H, T], COLOR.glass),
    box(o.id, 'glass', [cx - w / 2 + T / 2, y, cz], [T, H, d - 2 * T], COLOR.glass),
    box(o.id, 'glass', [cx + w / 2 - T / 2, y, cz], [T, H, d - 2 * T], COLOR.glass),
  ];
}

/** Nội thất trong phòng kính: bàn họp và ghế theo sức chứa, rack máy chủ, màn hình SOC. */
function roomInterior(o: ZoneObject): Part[] {
  const [cx, , cz] = o.position;
  const [w, , d] = o.size;
  const decor = (pos: V3, size: V3, color: string) => box(undefined, 'decor', pos, size, color);
  const out: Part[] = [];

  if (o.kind === 'meeting') {
    const tw = w * 0.55;
    const td = d * 0.4;
    out.push(decor([cx, 0.73, cz], [tw, 0.05, td], COLOR.desk));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        out.push(decor([cx + sx * (tw / 2 - 0.15), 0.35, cz + sz * (td / 2 - 0.15)], [0.06, 0.7, 0.06], COLOR.desk));
      }
    }
    const n = o.capacity ?? 0;
    const perSide = [Math.ceil(n / 2), Math.floor(n / 2)];
    [-1, 1].forEach((side, si) => {
      const count = perSide[si];
      for (let k = 0; k < count; k++) {
        const x = cx - tw / 2 + (k + 0.5) * (tw / count);
        const z = cz + side * (td / 2 + 0.55);
        out.push(decor([x, 0.25, z], [0.38, 0.5, 0.38], COLOR.chair));
      }
    });
  }

  if (o.kind === 'server') {
    for (const dx of [-0.8, 0, 0.8]) {
      const x = cx + dx;
      const z = cz - d / 2 + 0.45;
      out.push(decor([x, 1.0, z], [0.6, 2.0, 0.6], COLOR.rack));
      out.push(decor([x, 1.5, z + 0.31], [0.4, 0.04, 0.02], COLOR.led));
      out.push(decor([x, 0.7, z + 0.31], [0.4, 0.04, 0.02], COLOR.ledWarn));
    }
  }

  if (o.kind === 'room') {
    for (const dx of [-1.2, 0, 1.2]) {
      out.push(decor([cx + dx, 1.5, cz - d / 2 + 0.2], [1.0, 0.65, 0.04], COLOR.screen));
    }
    out.push(decor([cx, 0.75, cz + 0.4], [3.6, 0.05, 0.8], COLOR.desk));
    out.push(decor([cx - 1.6, 0.37, cz + 0.4], [0.06, 0.74, 0.7], COLOR.desk));
    out.push(decor([cx + 1.6, 0.37, cz + 0.4], [0.06, 0.74, 0.7], COLOR.desk));
  }

  return out;
}

/** Mọi mảnh hình hộp của một vật thể (trừ bàn làm việc và khu dự phòng, vẽ riêng). Dùng để vẽ. */
export function partsOf(o: ZoneObject): Part[] {
  const [cx, cy, cz] = o.position;
  const [w, h, d] = o.size;
  const minX = cx - w / 2;
  const maxX = cx + w / 2;
  const minZ = cz - d / 2;
  const maxZ = cz + d / 2;
  const id = o.id;

  switch (o.kind) {
    case 'desk':
    case 'reserved':
    // Lối vào tầng 7: thang, bàn an ninh vẽ trong src/scene/entry, bảng ghi danh vẽ trong src/env/checkin.tsx.
    case 'elevator':
    case 'security_gate':
    case 'checkin_board':
      return [];

    case 'core': {
      const mode = STAIR_CORES[id];
      if (!mode) return [box(id, 'box', [cx, cy, cz], [w, h, d], COLOR.lift)];
      const parts: Part[] = [box(id, 'box', [cx, 0.1, cz], [w, 0.2, d], COLOR.lift)];
      if (mode === 'half') {
        parts.push(box(id, 'box', [cx + w / 4, cy, cz], [w / 2, h, d], COLOR.lift));
        parts.push(...stepParts(id, minX, cx, minZ, maxZ));
      } else {
        parts.push(...stepParts(id, minX, maxX, minZ, maxZ));
      }
      return parts;
    }

    case 'wc': {
      const doors = [-2.5, 0, 2.5].map((dx, i) =>
        box(undefined, 'decor', [cx + dx, 1.0, minZ - 0.03], [0.9, 2.0, 0.06], COLOR.door[i]),
      );
      return [box(id, 'box', [cx, cy, cz], [w, h, d], COLOR.wc), ...doors];
    }

    // Pantry và lounge: chỉ lớp phủ sàn. Quầy, bàn, ghế do decor vẽ và chặn đi lại theo decorBlockersOf.
    case 'pantry':
      return [box(id, 'box', [cx, DECAL_Y, cz], [w, 0.02, d], COLOR.pantryFloor)];

    case 'lounge':
      return [box(id, 'box', [cx, DECAL_Y, cz], [w, 0.02, d], COLOR.loungeFloor)];

    case 'meeting':
    case 'server':
    case 'room':
      return [...glassWalls(o), ...roomInterior(o)];

    default:
      return [box(id, 'box', [cx, cy, cz], [w, h, d], baseColor(o))];
  }
}
