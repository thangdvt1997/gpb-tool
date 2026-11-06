// Lưới đi lại và tìm đường A* cho minimap. Hàm thuần, test bằng node:test.
//
// Một ô là "đi được" khi nhân vật (vòng tròn bán kính radius) đứng được ở điểm đại diện của ô:
// - vòng tròn nằm trọn trong vùng đi lại (walkRects, ví dụ OFFICE_L_RECTS), nên không ra ngoài chữ L;
// - khoảng cách từ tâm vòng tròn tới mọi vật cản (footprint va chạm) không nhỏ hơn radius (dung sai CLEAR_TOL),
//   nên khe đúng 2 x radius (0,7 m) vẫn đi được.
// Điểm đại diện thường là tâm ô. Ô bị chặn tại tâm nhưng có điểm đứng được ngay trong ô (khe hẹp không trùng
// tâm ô) được "neo" vào điểm đó (grid.anchors). Cạnh nối ô có neo được kiểm bằng segmentClear.
// Đi chéo chỉ khi hai ô kề thẳng cũng đi được (không cắt góc vật cản).

import {
  CLEAR_TOL,
  EPS,
  circleCovered,
  distPointRect,
  distSegmentRect,
  inflateRect,
  polylineLength,
  rectsBounds,
} from './geometry.js';

const SQRT2 = Math.SQRT2;

/**
 * Dựng lưới.
 * @param {{ walkRects: Rect[], obstacles?: Rect[], radius: number, cellSize?: number }} input
 * walkRects phải không chồng nhau.
 */
export function buildNavGrid({ walkRects, obstacles = [], radius, cellSize = 0.2 }) {
  if (!walkRects || walkRects.length === 0) throw new Error('buildNavGrid: thiếu vùng đi lại');
  if (!(radius >= 0)) throw new Error('buildNavGrid: radius không hợp lệ');
  if (!(cellSize > 0)) throw new Error('buildNavGrid: cellSize không hợp lệ');
  const b = rectsBounds(walkRects);
  const cols = Math.max(1, Math.ceil((b.maxX - b.minX) / cellSize - 1e-9));
  const rows = Math.max(1, Math.ceil((b.maxZ - b.minZ) / cellSize - 1e-9));
  const walk = new Uint8Array(cols * rows);
  const ox = b.minX;
  const oz = b.minZ;

  for (let j = 0; j < rows; j++) {
    const z = oz + (j + 0.5) * cellSize;
    for (let i = 0; i < cols; i++) {
      const x = ox + (i + 0.5) * cellSize;
      if (circleCovered(x, z, radius, walkRects)) walk[j * cols + i] = 1;
    }
  }

  for (const o of obstacles) {
    const inf = inflateRect(o, radius);
    const i0 = Math.max(0, Math.floor((inf.minX - ox) / cellSize));
    const i1 = Math.min(cols - 1, Math.floor((inf.maxX - ox) / cellSize));
    const j0 = Math.max(0, Math.floor((inf.minZ - oz) / cellSize));
    const j1 = Math.min(rows - 1, Math.floor((inf.maxZ - oz) / cellSize));
    for (let j = j0; j <= j1; j++) {
      const z = oz + (j + 0.5) * cellSize;
      for (let i = i0; i <= i1; i++) {
        const x = ox + (i + 0.5) * cellSize;
        if (distPointRect(x, z, o) < radius - CLEAR_TOL) walk[j * cols + i] = 0;
      }
    }
  }

  const anchors = new Map();
  const grid0 = { originX: ox, originZ: oz, cols, rows, cellSize, radius, walkRects, obstacles };
  anchorNarrowCells(grid0, walk, anchors);

  return {
    anchors,
    originX: ox,
    originZ: oz,
    cols,
    rows,
    cellSize,
    radius,
    walk,
    walkRects: walkRects.slice(),
    obstacles: obstacles.slice(),
    bounds: b,
  };
}

/** Dựng điểm đứng được cho ô bị chặn tại tâm: thử các tọa độ "mép vật cản + radius" nằm trong ô. */
function anchorNarrowCells(g, walk, anchors) {
  const { cols, rows, cellSize: cs, radius: r, walkRects, obstacles } = g;
  const half = cs / 2;
  // Tọa độ biên của vùng đi lại (cộng hoặc trừ radius) dùng chung cho mọi ô.
  const wx = [];
  const wz = [];
  for (const w of walkRects) {
    wx.push(w.minX + r, w.maxX - r);
    wz.push(w.minZ + r, w.maxZ - r);
  }
  for (let j = 0; j < rows; j++) {
    const cz = g.originZ + (j + 0.5) * cs;
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i;
      if (walk[idx]) continue;
      const cx = g.originX + (i + 0.5) * cs;
      const near = obstacles.filter((o) => distPointRect(cx, cz, o) < r + cs);
      const xs = [cx];
      const zs = [cz];
      const addX = (v) => {
        if (v >= cx - half && v <= cx + half) xs.push(v);
      };
      const addZ = (v) => {
        if (v >= cz - half && v <= cz + half) zs.push(v);
      };
      wx.forEach(addX);
      wz.forEach(addZ);
      for (const o of near) {
        addX(o.minX - r);
        addX(o.maxX + r);
        addZ(o.minZ - r);
        addZ(o.maxZ + r);
      }
      if (xs.length === 1 && zs.length === 1) continue;
      let best = null;
      let bestD = Infinity;
      for (const x of xs) {
        for (const z of zs) {
          if (!circleCovered(x, z, r, walkRects)) continue;
          let ok = true;
          for (const o of near) {
            if (distPointRect(x, z, o) < r - CLEAR_TOL) {
              ok = false;
              break;
            }
          }
          const d = Math.hypot(x - cx, z - cz);
          if (ok && d < bestD) {
            bestD = d;
            best = { x, z };
          }
        }
      }
      if (best) {
        walk[idx] = 1;
        anchors.set(idx, best);
      }
    }
  }
}

/** Chỉ số ô chứa điểm (x, z), -1 nếu ngoài lưới. */
export function cellIndexAt(grid, x, z) {
  const i = Math.floor((x - grid.originX) / grid.cellSize);
  const j = Math.floor((z - grid.originZ) / grid.cellSize);
  if (i < 0 || j < 0 || i >= grid.cols || j >= grid.rows) return -1;
  return j * grid.cols + i;
}

/** Điểm đại diện của ô theo tọa độ world: tâm ô, hoặc điểm neo nếu ô là khe hẹp. */
export function cellCenter(grid, idx) {
  const a = grid.anchors?.get(idx);
  if (a) return { x: a.x, z: a.z };
  const i = idx % grid.cols;
  const j = (idx - i) / grid.cols;
  return { x: grid.originX + (i + 0.5) * grid.cellSize, z: grid.originZ + (j + 0.5) * grid.cellSize };
}

/** Nhân vật (vòng tròn bán kính radius) đứng được tại đúng điểm (x, z) (không làm tròn theo ô). */
export function isPointClear(grid, x, z) {
  if (!circleCovered(x, z, grid.radius, grid.walkRects)) return false;
  for (const o of grid.obstacles) if (distPointRect(x, z, o) < grid.radius - CLEAR_TOL) return false;
  return true;
}

/**
 * Nhân vật (vòng tròn) đi thẳng được từ a tới b: khoảng cách từ đoạn tới mọi vật cản không nhỏ hơn radius
 * và các điểm lấy mẫu dọc đoạn (bước cellSize / 2) đều có vòng tròn nằm trong vùng đi lại.
 */
export function segmentClear(grid, a, b) {
  const r = grid.radius;
  for (const o of grid.obstacles) {
    if (distSegmentRect(a.x, a.z, b.x, b.z, o) < r - CLEAR_TOL) return false;
  }
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(len / (grid.cellSize / 2)));
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    if (!circleCovered(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, r - CLEAR_TOL, grid.walkRects)) return false;
  }
  return true;
}

// 8 hướng: [di, dj, cost]
const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

function forEachNeighbor(grid, idx, fn) {
  const { cols, rows, walk } = grid;
  const i = idx % cols;
  const j = (idx - i) / cols;
  for (const [di, dj, c] of DIRS) {
    const ni = i + di;
    const nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
    const n = nj * cols + ni;
    if (!walk[n]) continue;
    if (di !== 0 && dj !== 0) {
      // Không cắt góc: cả hai ô kề thẳng phải đi được.
      if (!walk[j * cols + ni] || !walk[nj * cols + i]) continue;
    }
    let cost = c * grid.cellSize;
    if (grid.anchors && (grid.anchors.has(n) || grid.anchors.has(idx))) {
      // Ô có neo: tâm thật lệch khỏi tâm ô, phải kiểm cạnh nối và tính độ dài thật.
      const a = cellCenter(grid, idx);
      const b = cellCenter(grid, n);
      if (!segmentClear(grid, a, b)) continue;
      cost = Math.hypot(b.x - a.x, b.z - a.z);
    }
    fn(n, cost);
  }
}

/** Hàng đợi ưu tiên nhỏ nhất (binary heap) cho (khóa, giá trị). */
class MinHeap {
  constructor() {
    this.keys = [];
    this.vals = [];
  }
  get size() {
    return this.keys.length;
  }
  push(key, val) {
    const k = this.keys;
    const v = this.vals;
    let n = k.length;
    k.push(key);
    v.push(val);
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (k[p] <= key) break;
      k[n] = k[p];
      v[n] = v[p];
      n = p;
    }
    k[n] = key;
    v[n] = val;
  }
  pop() {
    const k = this.keys;
    const v = this.vals;
    const top = v[0];
    const lastK = k.pop();
    const lastV = v.pop();
    const len = k.length;
    if (len > 0) {
      let n = 0;
      for (;;) {
        const l = 2 * n + 1;
        if (l >= len) break;
        const r = l + 1;
        const m = r < len && k[r] < k[l] ? r : l;
        if (k[m] >= lastK) break;
        k[n] = k[m];
        v[n] = v[m];
        n = m;
      }
      k[n] = lastK;
      v[n] = lastV;
    }
    return top;
  }
}

function octile(grid, a, b) {
  const ai = a % grid.cols;
  const aj = (a - ai) / grid.cols;
  const bi = b % grid.cols;
  const bj = (b - bi) / grid.cols;
  const dx = Math.abs(ai - bi);
  const dz = Math.abs(aj - bj);
  return (Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz)) * grid.cellSize;
}

/**
 * A* 8 hướng, heuristic octile (chấp nhận được, nên đường ngắn nhất trên lưới).
 * Trả về mảng chỉ số ô từ start tới goal, hoặc null nếu không có đường / ô đầu cuối không đi được.
 */
export function astar(grid, start, goal) {
  const n = grid.cols * grid.rows;
  if (start < 0 || goal < 0 || start >= n || goal >= n) return null;
  if (!grid.walk[start] || !grid.walk[goal]) return null;
  if (start === goal) return [start];
  const g = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap();
  g[start] = 0;
  heap.push(octile(grid, start, goal), start);
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    if (cur === goal) break;
    closed[cur] = 1;
    const gc = g[cur];
    forEachNeighbor(grid, cur, (nb, cost) => {
      if (closed[nb]) return;
      const ng = gc + cost;
      if (ng < g[nb] - 1e-12) {
        g[nb] = ng;
        parent[nb] = cur;
        heap.push(ng + octile(grid, nb, goal), nb);
      }
    });
  }
  if (!Number.isFinite(g[goal])) return null;
  const out = [];
  for (let c = goal; c !== -1; c = parent[c]) out.push(c);
  return out.reverse();
}

/** Dijkstra từ một ô: chi phí đường đi tới mọi ô (Infinity nếu không tới được). */
export function costField(grid, start) {
  const n = grid.cols * grid.rows;
  const dist = new Float64Array(n).fill(Infinity);
  if (start < 0 || start >= n || !grid.walk[start]) return dist;
  const heap = new MinHeap();
  dist[start] = 0;
  heap.push(0, start);
  while (heap.size > 0) {
    const cur = heap.pop();
    const dc = dist[cur];
    forEachNeighbor(grid, cur, (nb, cost) => {
      const nd = dc + cost;
      if (nd < dist[nb] - 1e-12) {
        dist[nb] = nd;
        heap.push(nd, nb);
      }
    });
  }
  return dist;
}

/** Ô đi được gần điểm (x, z) nhất trong bán kính maxDist (m). -1 nếu không có. */
export function nearestWalkable(grid, x, z, maxDist) {
  const own = cellIndexAt(grid, x, z);
  if (own >= 0 && grid.walk[own]) return own;
  const cs = grid.cellSize;
  const i0 = Math.max(0, Math.floor((x - maxDist - grid.originX) / cs));
  const i1 = Math.min(grid.cols - 1, Math.floor((x + maxDist - grid.originX) / cs));
  const j0 = Math.max(0, Math.floor((z - maxDist - grid.originZ) / cs));
  const j1 = Math.min(grid.rows - 1, Math.floor((z + maxDist - grid.originZ) / cs));
  let best = -1;
  let bestD = Infinity;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const idx = j * grid.cols + i;
      if (!grid.walk[idx]) continue;
      const c = cellCenter(grid, idx);
      const d = Math.hypot(c.x - x, c.z - z);
      if (d <= maxDist + EPS && d < bestD) {
        bestD = d;
        best = idx;
      }
    }
  }
  return best;
}

/** Bỏ các điểm thẳng hàng liên tiếp. */
function dropCollinear(points) {
  if (points.length <= 2) return points.slice();
  const out = [points[0]];
  for (let k = 1; k < points.length - 1; k++) {
    const a = out[out.length - 1];
    const b = points[k];
    const c = points[k + 1];
    const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    if (Math.abs(cross) > 1e-9) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Rút gọn đường: từ mỗi điểm neo, đi thẳng tới điểm xa nhất còn thông (segmentClear). */
export function smoothPath(grid, points) {
  const pts = dropCollinear(points);
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = i + 1;
    while (j + 1 < pts.length && segmentClear(grid, pts[i], pts[j + 1])) j++;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/**
 * Tìm tuyến từ start tới đích.
 * @param grid lưới từ buildNavGrid
 * @param start {x, z} vị trí nhân vật
 * @param dest {x, z, rect?} điểm đích; rect là footprint của phòng/bàn đích (có thể là vật cản).
 *   Nếu đích không đứng được (trong vật cản, ngoài chữ L), chọn ô đi được gần đích nhất trong goalSnap mét,
 *   ưu tiên ô có tuyến ngắn nhất từ start.
 * @returns {{ status: 'ok'|'start_blocked'|'goal_blocked'|'unreachable', points: {x,z}[], length: number,
 *   startSnapped: boolean, goalSnapped: boolean, goal: {x,z}|null }}
 *   - start_blocked: quanh vị trí nhân vật (startSnap mét) không có ô đi được.
 *   - goal_blocked: quanh đích (goalSnap mét) không có ô đi được (đích nằm sâu trong vật cản hoặc ngoài chữ L).
 *   - unreachable: có ô đi được quanh đích nhưng không ô nào nối được tới nhân vật.
 */
export function findRoute(grid, start, dest, { startSnap = 1.0, goalSnap = 1.5 } = {}) {
  const fail = (status) => ({ status, points: [], length: 0, startSnapped: false, goalSnapped: false, goal: null });
  const s = nearestWalkable(grid, start.x, start.z, startSnap);
  if (s < 0) return fail('start_blocked');

  const target = dest.rect ?? { minX: dest.x, maxX: dest.x, minZ: dest.z, maxZ: dest.z };
  const dist = costField(grid, s);
  const cs = grid.cellSize;
  const win = inflateRect(target, goalSnap);
  const i0 = Math.max(0, Math.floor((win.minX - grid.originX) / cs));
  const i1 = Math.min(grid.cols - 1, Math.floor((win.maxX - grid.originX) / cs));
  const j0 = Math.max(0, Math.floor((win.minZ - grid.originZ) / cs));
  const j1 = Math.min(grid.rows - 1, Math.floor((win.maxZ - grid.originZ) / cs));
  let anyWalkable = false;
  let best = -1;
  let bestBand = Infinity;
  let bestCost = Infinity;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const idx = j * grid.cols + i;
      if (!grid.walk[idx]) continue;
      const c = cellCenter(grid, idx);
      const d = distPointRect(c.x, c.z, target);
      if (d > goalSnap + EPS) continue;
      anyWalkable = true;
      if (!Number.isFinite(dist[idx])) continue;
      // Gom theo dải 1 ô: các ô sát đích ngang nhau, chọn ô có tuyến ngắn nhất.
      const band = Math.floor(d / cs + EPS);
      if (band < bestBand || (band === bestBand && dist[idx] < bestCost)) {
        bestBand = band;
        bestCost = dist[idx];
        best = idx;
      }
    }
  }
  if (!anyWalkable) return fail('goal_blocked');
  if (best < 0) return fail('unreachable');

  const cells = astar(grid, s, best);
  if (!cells) return fail('unreachable');
  const pts = cells.map((c) => cellCenter(grid, c));

  let startSnapped = true;
  if (isPointClear(grid, start.x, start.z) && segmentClear(grid, start, pts[0])) {
    pts.unshift({ x: start.x, z: start.z });
    startSnapped = false;
  }
  const last = pts[pts.length - 1];
  if (!dest.rect && (dest.x !== last.x || dest.z !== last.z) && isPointClear(grid, dest.x, dest.z)) {
    if (segmentClear(grid, last, dest)) pts.push({ x: dest.x, z: dest.z });
  }
  const points = smoothPath(grid, pts);
  const end = points[points.length - 1];
  const goalSnapped = distPointRect(end.x, end.z, target) > EPS;
  return { status: 'ok', points, length: polylineLength(points), startSnapped, goalSnapped, goal: end };
}

/**
 * Tiến độ trên tuyến: chiếu vị trí nhân vật lên đường gấp khúc.
 * @returns {{ remaining: number, offRoute: number, segment: number }}
 *   remaining: quãng đường còn lại tính theo tuyến (m). offRoute: khoảng cách tới tuyến (m).
 */
export function routeProgress(points, x, z) {
  if (points.length === 0) return { remaining: 0, offRoute: Infinity, segment: -1 };
  if (points.length === 1) return { remaining: 0, offRoute: Math.hypot(points[0].x - x, points[0].z - z), segment: 0 };
  let bestD = Infinity;
  let bestSeg = 0;
  let bestT = 0;
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k];
    const b = points[k + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
    const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
    if (d < bestD - 1e-12) {
      bestD = d;
      bestSeg = k;
      bestT = t;
    }
  }
  const a = points[bestSeg];
  const b = points[bestSeg + 1];
  let remaining = Math.hypot(b.x - a.x, b.z - a.z) * (1 - bestT);
  for (let k = bestSeg + 1; k < points.length - 1; k++) {
    remaining += Math.hypot(points[k + 1].x - points[k].x, points[k + 1].z - points[k].z);
  }
  return { remaining, offRoute: bestD, segment: bestSeg };
}
