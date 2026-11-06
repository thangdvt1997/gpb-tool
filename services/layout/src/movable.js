import fs from 'node:fs';
import { EPS, distanceToRect, footprintOf, rectsOverlap } from './geometry.js';

// Vật được phép di chuyển. Danh sách cố định trong code, API không nhận thêm id.
// Mọi id khác (bàn làm việc desk_*, tường, thang, phòng kín, cây và tivi không có trong danh sách) là chướng ngại cố định.
export const MOVABLE_IDS = Object.freeze([
  'service_desk',
  'games_corner',
  'karaoke_room',
  'kudos_board',
  'util_coffee',
  'pantry',
  'lounge',
  'tv_lobby',
  'tv_lounge',
  'tv_meeting',
  'whiteboard_mr1',
  'design_board',
  'plant_lobby',
  'plant_lounge_a',
  'plant_lounge_b',
  'plant_meeting',
  'plant_north',
]);
const MOVABLE = new Set(MOVABLE_IDS);

// Sàn 58 x 30 m, gốc toạ độ ở giữa sàn. Tâm vật phải cách mép sàn tối thiểu 0,8 m.
export const FLOOR_WIDTH = 58;
export const FLOOR_DEPTH = 30;
export const FLOOR_EDGE_MARGIN = 0.8;
// Khoảng cách an toàn tối thiểu giữa footprint của vật di chuyển và mọi chướng ngại khác.
export const SAFE_GAP = 0.6;
// Vùng cấm bán kính 1,5 m quanh tâm thang máy, thang bộ và lối vào.
export const FORBIDDEN_RADIUS = 1.5;
export const MOVE_ROTATIONS = Object.freeze([0, 90, 180, 270]);
export const PLACEMENT_ERROR = 'Vị trí này bị vướng vật khác hoặc chặn lối đi.';

export function isMovableId(id) {
  return MOVABLE.has(id);
}

export function isDeskId(id) {
  return typeof id === 'string' && id.startsWith('desk_');
}

function isFiniteTriple(value) {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function isPositiveSize(value) {
  return isFiniteTriple(value) && value.every((n) => n > 0);
}

// Đọc zone.json và dựng mô hình dùng để kiểm tra. Lỗi cấu trúc thì dừng khi khởi động, không chạy với dữ liệu hỏng.
export function loadZone(zoneFile) {
  const raw = JSON.parse(fs.readFileSync(zoneFile, 'utf8'));
  if (!raw || !Array.isArray(raw.objects)) {
    throw new Error('zone.json không hợp lệ: thiếu mảng objects');
  }

  const objects = new Map();
  for (const o of raw.objects) {
    if (!o || typeof o.id !== 'string' || o.id === '') {
      throw new Error('zone.json: có vật thiếu id');
    }
    if (objects.has(o.id)) {
      throw new Error(`zone.json: trùng id ${o.id}`);
    }
    if (!isPositiveSize(o.size)) {
      throw new Error(`zone.json: size không hợp lệ cho ${o.id}`);
    }
    const position = o.position === null || o.position === undefined ? null : o.position;
    if (position !== null && !isFiniteTriple(position)) {
      throw new Error(`zone.json: position không hợp lệ cho ${o.id}`);
    }
    objects.set(o.id, {
      id: o.id,
      kind: typeof o.kind === 'string' ? o.kind : '',
      size: [o.size[0], o.size[1], o.size[2]],
      position,
    });
  }

  for (const id of MOVABLE_IDS) {
    if (!objects.has(id)) {
      throw new Error(`zone.json thiếu vật di chuyển được: ${id}`);
    }
  }

  const fixed = [];
  const cores = [];
  const defaults = {};
  for (const obj of objects.values()) {
    if (MOVABLE.has(obj.id)) {
      // Vật chưa có toạ độ mặc định (position null) không xuất hiện trong defaults và không chắn chỗ cho tới khi được di chuyển.
      if (obj.position) {
        defaults[obj.id] = { x: obj.position[0], z: obj.position[2], rotation: 0 };
      }
      continue;
    }
    if (!obj.position) {
      throw new Error(`zone.json: vật cố định ${obj.id} thiếu position`);
    }
    const x = obj.position[0];
    const z = obj.position[2];
    fixed.push({ id: obj.id, rect: footprintOf({ x, z, rotation: 0, size: obj.size }) });
    if (obj.id.startsWith('core_') || obj.id === 'entrance') {
      cores.push({ id: obj.id, x, z });
    }
  }

  return { objects, fixed, cores, defaults };
}

// Vị trí hiện tại của mọi vật di chuyển được đã có toạ độ: theo bản ghi đã di chuyển, nếu không thì theo mặc định.
export function placedPositions(model, items) {
  const placed = new Map();
  for (const id of MOVABLE_IDS) {
    const pos = Object.hasOwn(items, id) ? items[id] : model.defaults[id];
    if (pos) {
      placed.set(id, { x: pos.x, z: pos.z, rotation: pos.rotation });
    }
  }
  return placed;
}

// Kiểm tra một vị trí ứng viên cho vật `id`. `placed` là vị trí các vật di chuyển khác (bỏ qua chính vật này).
// Trả { ok: true } hoặc { ok: false, reason } (reason chỉ dùng nội bộ, không trả cho client).
export function checkPlacement(model, { id, x, z, rotation }, placed) {
  const obj = model.objects.get(id);
  if (!obj) {
    return { ok: false, reason: 'vật không tồn tại' };
  }
  const rect = footprintOf({ x, z, rotation, size: obj.size });

  // 1. Tâm nằm trong sàn, trừ biên 0,8 m.
  const limX = FLOOR_WIDTH / 2 - FLOOR_EDGE_MARGIN;
  const limZ = FLOOR_DEPTH / 2 - FLOOR_EDGE_MARGIN;
  if (Math.abs(x) > limX + EPS || Math.abs(z) > limZ + EPS) {
    return { ok: false, reason: 'ngoài sàn' };
  }

  // 2. Không chặn lối đi: không có điểm nào của footprint nằm trong vùng 1,5 m quanh tâm thang máy, thang bộ, lối vào.
  for (const core of model.cores) {
    if (distanceToRect(core.x, core.z, rect) < FORBIDDEN_RADIUS - EPS) {
      return { ok: false, reason: `chặn lối ${core.id}` };
    }
  }

  // 3. Không vướng chướng ngại cố định, giữ khoảng cách an toàn 0,6 m.
  for (const f of model.fixed) {
    if (rectsOverlap(rect, f.rect, SAFE_GAP)) {
      return { ok: false, reason: `vướng ${f.id}` };
    }
  }

  // 4. Không vướng vật di chuyển khác, giữ khoảng cách an toàn 0,6 m.
  for (const [otherId, pos] of placed) {
    if (otherId === id) continue;
    const other = model.objects.get(otherId);
    const otherRect = footprintOf({ x: pos.x, z: pos.z, rotation: pos.rotation, size: other.size });
    if (rectsOverlap(rect, otherRect, SAFE_GAP)) {
      return { ok: false, reason: `vướng ${otherId}` };
    }
  }

  return { ok: true };
}
