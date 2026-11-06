// Mô hình bản đồ 2D dựng từ cùng dữ liệu với cảnh 3D: đa giác chữ L, vật thể it.json (đã lọc trong L),
// vật cản va chạm và lưới đi lại. Không có hình vẽ tay nào ở đây.

import { polygonBounds } from './geometry.js';

/** Nhóm hiển thị theo kind của it.json (src/content/types.ts). */
export function categoryOfKind(kind) {
  switch (kind) {
    case 'meeting':
    case 'server':
    case 'room':
    case 'wc':
      return 'room';
    case 'desk':
      return 'desk';
    case 'core':
      return 'core';
    case 'elevator':
      return 'door';
    case 'security_gate':
      return 'gate';
    case 'lounge':
    case 'pantry':
    case 'amenity':
      return 'amenity';
    case 'reserved':
      return 'reserved';
    default:
      return 'fixture';
  }
}

/**
 * Vùng đi được của lưới, gộp thành hình chữ nhật: gộp các ô liền nhau trên cùng hàng,
 * rồi gộp các hàng liền nhau có cùng đoạn. Tổng diện tích = số ô đi được × cellSize².
 */
export function walkableRects(grid) {
  const { cols, rows, walk, cellSize: cs, originX: ox, originZ: oz } = grid;
  const open = new Map(); // "i0:i1" -> rect đang kéo dài xuống
  const out = [];
  for (let j = 0; j < rows; j++) {
    const seen = new Set();
    let i = 0;
    while (i < cols) {
      if (!walk[j * cols + i]) {
        i++;
        continue;
      }
      const i0 = i;
      while (i < cols && walk[j * cols + i]) i++;
      const key = `${i0}:${i}`;
      seen.add(key);
      const r = open.get(key);
      if (r) r.maxZ = oz + (j + 1) * cs;
      else open.set(key, { minX: ox + i0 * cs, maxX: ox + i * cs, minZ: oz + j * cs, maxZ: oz + (j + 1) * cs });
    }
    for (const [key, r] of open) {
      if (!seen.has(key)) {
        out.push(r);
        open.delete(key);
      }
    }
  }
  for (const r of open.values()) out.push(r);
  return out;
}

/**
 * @param input {
 *   polygon: [x, z][]           đa giác chữ L (OFFICE_L_POLYGON)
 *   floor: Rect[]               OFFICE_L_RECTS
 *   walls: Rect[]               tường ngoài thật (chỉ trên cạnh L trùng mép tòa nhà)
 *   items: { id, label, kind, rect, center, squad?, capacity? }[]  vật thể đã lọc trong L
 *   grid?: lưới đi lại (buildNavGrid)
 * }
 */
export function buildMapModel({ polygon, floor, walls = [], items = [], grid = null }) {
  const withCat = items.map((it) => ({ ...it, category: it.category ?? categoryOfKind(it.kind) }));
  return {
    bounds: polygonBounds(polygon),
    polygon,
    floor,
    walls,
    items: withCat,
    doors: withCat.filter((it) => it.category === 'door' || it.category === 'gate' || it.isEntrance === true),
    walkable: grid ? walkableRects(grid) : [],
  };
}
