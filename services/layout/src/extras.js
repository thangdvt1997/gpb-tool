// Vật thêm bằng trình biên tập bố trí (bàn, ghế, cây, tủ, tường ngăn) và thao tác batch nguyên tử.
// Danh mục và luật va chạm có bản sao phía client ở src/editor/props.ts + core.ts; sửa một nơi thì sửa cả hai.
import { distanceToRect, footprintOf, rectsOverlap } from './geometry.js';
import {
  FLOOR_DEPTH,
  FLOOR_EDGE_MARGIN,
  FLOOR_WIDTH,
  FORBIDDEN_RADIUS,
  MOVE_ROTATIONS,
  PLACEMENT_ERROR,
  SAFE_GAP,
  checkPlacement,
  isDeskId,
  isMovableId,
  placedPositions,
} from './movable.js';

const EPS = 1e-6;

// size = [w, h, d] chưa xoay.
export const PROP_CATALOG = Object.freeze({
  table: Object.freeze({ size: [1.6, 0.75, 0.9], wall: false }),
  chair: Object.freeze({ size: [0.5, 0.9, 0.5], wall: false }),
  plant: Object.freeze({ size: [0.6, 1.2, 0.6], wall: false }),
  cabinet: Object.freeze({ size: [1.2, 1.8, 0.5], wall: false }),
  wall2: Object.freeze({ size: [2, 2.6, 0.15], wall: true }),
  wall4: Object.freeze({ size: [4, 2.6, 0.15], wall: true }),
});
export const MAX_PROPS = 60;
export const MAX_BATCH_OPS = 100;
// Khoảng cách tối thiểu giữa hai vật thêm (không áp cho hai đoạn tường).
export const PROP_GAP = 0.1;

const PROP_ID = /^p_[a-z0-9]{4,24}$/;
export const isPropId = (id) => typeof id === 'string' && PROP_ID.test(id);
export const isPropKind = (kind) => typeof kind === 'string' && Object.hasOwn(PROP_CATALOG, kind);

// Chữ L theo bản vẽ (x0, x1, y0, y1), gốc trên-trái; đổi sang toạ độ thế giới: x - 29, z - 15 (src/scene/officeBounds.ts).
const L_PLAN_RECTS = [
  [0, 14.5, 0, 30],
  [14.5, 18.6, 15.2, 30],
  [18.6, 29.9, 12.4, 30],
  [29.9, 35.9, 8.1, 30],
  [35.9, 45.1, 18.5, 30],
].map(([x0, x1, y0, y1]) => ({
  minX: x0 - FLOOR_WIDTH / 2,
  maxX: x1 - FLOOR_WIDTH / 2,
  minZ: y0 - FLOOR_DEPTH / 2,
  maxZ: y1 - FLOOR_DEPTH / 2,
}));

function overlapArea(a, b) {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const d = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  return w > 0 && d > 0 ? w * d : 0;
}

/** Hình chữ nhật nằm trọn trong chữ L (các mảnh L không chồng nhau nên cộng diện tích là đúng). */
export function insideOffice(rect) {
  const area = (rect.maxX - rect.minX) * (rect.maxZ - rect.minZ);
  const inside = L_PLAN_RECTS.reduce((s, q) => s + overlapArea(rect, q), 0);
  return inside >= area - EPS;
}

export function propRect(prop) {
  return footprintOf({ x: prop.x, z: prop.z, rotation: prop.rotation, size: PROP_CATALOG[prop.kind].size });
}

/** Vật thêm `self` hợp lệ trong trạng thái cuối (placed: vật gốc, props: mọi vật thêm). */
export function checkPropPlacement(model, self, placed, props) {
  const rect = propRect(self);
  const limX = FLOOR_WIDTH / 2 - FLOOR_EDGE_MARGIN;
  const limZ = FLOOR_DEPTH / 2 - FLOOR_EDGE_MARGIN;
  if (rect.minX < -limX - EPS || rect.maxX > limX + EPS || rect.minZ < -limZ - EPS || rect.maxZ > limZ + EPS) {
    return { ok: false, reason: 'ngoài sàn' };
  }
  if (!insideOffice(rect)) return { ok: false, reason: 'ngoài phạm vi chữ L' };
  for (const core of model.cores) {
    if (distanceToRect(core.x, core.z, rect) < FORBIDDEN_RADIUS - EPS) return { ok: false, reason: `chặn lối ${core.id}` };
  }
  for (const f of model.fixed) {
    if (rectsOverlap(rect, f.rect, SAFE_GAP)) return { ok: false, reason: `vướng ${f.id}` };
  }
  for (const [oid, pos] of placed) {
    const other = model.objects.get(oid);
    if (rectsOverlap(rect, footprintOf({ x: pos.x, z: pos.z, rotation: pos.rotation, size: other.size }), SAFE_GAP)) {
      return { ok: false, reason: `vướng ${oid}` };
    }
  }
  const selfWall = PROP_CATALOG[self.kind].wall;
  for (const [oid, p] of Object.entries(props)) {
    if (oid === self.id) continue;
    if (selfWall && PROP_CATALOG[p.kind].wall) continue; // hai tường được chạm/nối nhau
    if (rectsOverlap(rect, propRect(p), PROP_GAP)) return { ok: false, reason: `vướng ${oid}` };
  }
  return { ok: true };
}

/** Vật gốc đã di chuyển phải cách mọi vật thêm tối thiểu SAFE_GAP. */
export function checkMovableAgainstProps(model, { id, x, z, rotation }, props) {
  const obj = model.objects.get(id);
  const rect = footprintOf({ x, z, rotation, size: obj.size });
  for (const [oid, p] of Object.entries(props)) {
    if (rectsOverlap(rect, propRect(p), SAFE_GAP)) return { ok: false, reason: `vướng ${oid}` };
  }
  return { ok: true };
}

const fail = (status, error, index) => ({ ok: false, status, error, index });
const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);
const roundTenth = (v) => Math.round(v * 10) / 10 + 0;

/**
 * Áp một lô thao tác lên (items, props) rồi kiểm tra TRẠNG THÁI CUỐI: hoặc cả lô hợp lệ, hoặc không gì thay đổi.
 * Kiểm theo trạng thái cuối nên thứ tự thao tác không gây xung đột giả (vật A chờ vật B nhường chỗ).
 * ops: move {id,x,z,rotation} | reset {id} | put {id,kind,x,z,rotation,door?} | remove {id}.
 * Trả { ok: true, items, props, touched } hoặc { ok: false, status, error, index? }; không sửa đối số.
 */
export function applyBatch(model, items0, props0, ops) {
  if (!Array.isArray(ops) || ops.length === 0) return fail(400, 'Lô thao tác trống.');
  if (ops.length > MAX_BATCH_OPS) return fail(400, `Tối đa ${MAX_BATCH_OPS} thao tác mỗi lô.`);
  const items = { ...items0 };
  const props = { ...props0 };
  const movedIds = new Set();
  const putIds = new Set();

  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (!o || typeof o !== 'object' || typeof o.id !== 'string' || o.id === '') return fail(400, 'Thao tác thiếu id.', i);
    if (o.op === 'move' || o.op === 'reset') {
      if (isDeskId(o.id)) return fail(403, 'Không được di chuyển bàn làm việc.', i);
      if (!isMovableId(o.id)) return fail(404, 'Vật này không di chuyển được.', i);
      if (o.op === 'reset') {
        delete items[o.id];
        movedIds.delete(o.id);
        continue;
      }
      if (!isFiniteNumber(o.x) || !isFiniteNumber(o.z)) return fail(400, 'Toạ độ x, z phải là số.', i);
      if (!MOVE_ROTATIONS.includes(o.rotation)) return fail(400, 'Góc xoay phải là 0, 90, 180 hoặc 270.', i);
      items[o.id] = { x: roundTenth(o.x), z: roundTenth(o.z), rotation: o.rotation };
      movedIds.add(o.id);
    } else if (o.op === 'put') {
      if (!isPropId(o.id)) return fail(400, 'Mã vật thêm không hợp lệ.', i);
      if (!isPropKind(o.kind)) return fail(400, 'Loại vật không có trong danh mục.', i);
      if (props[o.id] && props[o.id].kind !== o.kind) return fail(400, 'Không đổi được loại của vật đã thêm.', i);
      if (!isFiniteNumber(o.x) || !isFiniteNumber(o.z)) return fail(400, 'Toạ độ x, z phải là số.', i);
      if (!MOVE_ROTATIONS.includes(o.rotation)) return fail(400, 'Góc xoay phải là 0, 90, 180 hoặc 270.', i);
      props[o.id] = {
        kind: o.kind,
        x: roundTenth(o.x),
        z: roundTenth(o.z),
        rotation: o.rotation,
        door: PROP_CATALOG[o.kind].wall && o.door === true,
      };
      putIds.add(o.id);
    } else if (o.op === 'remove') {
      if (!isPropId(o.id)) return fail(400, 'Mã vật thêm không hợp lệ.', i);
      if (!props[o.id]) return fail(404, 'Vật cần xóa không tồn tại.', i);
      delete props[o.id];
      putIds.delete(o.id);
    } else {
      return fail(400, 'Thao tác không hợp lệ.', i);
    }
  }

  if (Object.keys(props).length > MAX_PROPS) return fail(400, `Tối đa ${MAX_PROPS} vật thêm.`);

  const placed = placedPositions(model, items);
  for (const id of movedIds) {
    const pose = items[id];
    const r1 = checkPlacement(model, { id, ...pose }, placed);
    const r2 = r1.ok ? checkMovableAgainstProps(model, { id, ...pose }, props) : r1;
    if (!r2.ok) return { ok: false, status: 409, error: PLACEMENT_ERROR, id };
  }
  for (const id of putIds) {
    const r = checkPropPlacement(model, { id, ...props[id] }, placed, props);
    if (!r.ok) return { ok: false, status: 409, error: PLACEMENT_ERROR, id };
  }
  return { ok: true, items, props, touched: ops.length };
}
