import type { ZoneObject } from '../../content/types';
import type { Rect } from '../layout';
import { PLAYER_RADIUS } from '../layout';

/**
 * Thông số tương tác với vật thể.
 * - range: khoảng cách tối đa (m) từ tâm nhân vật tới mép gần nhất của vật.
 * - maxAngle: độ lệch tối đa (rad) giữa hướng nhìn và hướng tới vật.
 * - standOff: khoảng cách (m) từ mép vật tới điểm đứng khi tự đi tới.
 */
export const INTERACT = {
  range: 1.8,
  maxAngle: (40 * Math.PI) / 180,
  standOff: 0.8,
} as const;

/** Loại tương tác, quyết định chữ trên thẻ gợi ý. */
export type InteractKind = 'door' | 'chair' | 'room' | 'use';

/** Động từ hiện trên thẻ gợi ý theo loại: "E — Mở cửa", "E — Ngồi xuống", ... */
export const INTERACT_VERB: Record<InteractKind, string> = {
  door: 'Mở cửa',
  chair: 'Ngồi xuống',
  room: 'Xem thông tin phòng',
  use: 'Sử dụng',
};

/** Vật thể có tương tác: footprint trên sàn (hình chữ nhật thẳng trục) và tên hiển thị. */
export interface InteractTarget {
  id: string;
  label: string;
  kind: InteractKind;
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  /** Tầm với riêng (m). Bỏ trống: INTERACT.range. */
  range?: number;
  /** Ưu tiên khi nhiều vật cùng đủ điều kiện (trừ vào điểm, lớn hơn là ưu tiên hơn). */
  priority?: number;
  /** Chỉ có ở ghế: vị trí khớp hông khi ngồi và hướng mặt (quy ước playerPose). */
  seat?: { x: number; z: number; yaw: number };
}

/** Loại tương tác của vật trong it.json. */
export function kindOf(o: ZoneObject): InteractKind {
  if (o.kind === 'elevator' || /(^|\s)cửa(\s|$)/i.test(o.label)) return 'door';
  if (o.kind === 'meeting' || o.kind === 'room' || o.kind === 'server') return 'room';
  // Phòng tiện ích đặt chỗ (y tế, nghỉ yên tĩnh) cũng là phòng có thông tin.
  if (o.kind === 'amenity' && o.action === 'booking') return 'room';
  return 'use';
}

/**
 * Ghế ở khối bàn làm việc. Cùng lưới với decor bàn (src/env/desk.tsx, chỉ đọc): ô cách nhau 1,2 m,
 * căn giữa khối; ghế ở phía +z của mỗi ô, cách tâm ô 0,55 m, đệm 0,46 m; người ngồi quay mặt vào bàn (-z).
 * Ghế nằm trong footprint khối bàn (vật cản), nên chỉ ghế ở mép khối với tới được. Ngồi thì nhân vật
 * được đặt thẳng vào ghế; đứng dậy trả về chỗ đứng trước khi ngồi.
 */
const SEAT = { pitch: 1.2, chairOffset: 0.55, halfSize: 0.23, hipBack: 0.06, range: 1.3 } as const;

function chairsOf(o: ZoneObject): InteractTarget[] {
  const cols = Math.max(0, Math.floor(o.size[0] / SEAT.pitch + 1e-6));
  const rows = Math.max(0, Math.floor(o.size[2] / SEAT.pitch + 1e-6));
  const out: InteractTarget[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = o.position[0] + (c - (cols - 1) / 2) * SEAT.pitch;
      const z = o.position[2] + (r - (rows - 1) / 2) * SEAT.pitch + SEAT.chairOffset;
      out.push({
        id: `seat:${o.id}:${r}:${c}`,
        label: 'Ghế',
        kind: 'chair',
        cx: x,
        cz: z,
        hx: SEAT.halfSize,
        hz: SEAT.halfSize,
        range: SEAT.range,
        priority: 0.6,
        seat: { x, z: z + SEAT.hipBack, yaw: Math.PI },
      });
    }
  }
  return out;
}

/** Tư thế nhân vật theo quy ước của playerPose: hướng nhìn = (sin yaw, cos yaw). */
export interface Pose {
  x: number;
  z: number;
  yaw: number;
}

/** Điểm đứng trước vật và hướng quay mặt vào vật. */
export interface Approach {
  x: number;
  z: number;
  yaw: number;
}

/** Vật phẳng sát sàn (sảnh, khu dự phòng, vạch lối vào) là vùng sàn, không phải vật để dùng. */
const FLAT_MAX_HEIGHT = 0.05;

/** Vật có action (không rỗng) và không phải vùng sàn phẳng, cộng ghế của các khối bàn làm việc. */
export function targetsOf(objects: readonly ZoneObject[]): InteractTarget[] {
  const items: InteractTarget[] = objects
    .filter((o) => typeof o.action === 'string' && o.action.trim() !== '')
    .filter((o) => o.kind !== 'reserved' && o.size[1] > FLAT_MAX_HEIGHT)
    .map((o) => ({
      id: o.id,
      label: o.label,
      kind: kindOf(o),
      cx: o.position[0],
      cz: o.position[2],
      hx: o.size[0] / 2,
      hz: o.size[2] / 2,
    }));
  for (const o of objects) if (o.kind === 'desk') items.push(...chairsOf(o));
  return items;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrap(a: number): number {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  else if (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

/** Tia từ (x, z) theo hướng (fx, fz) có chạm footprint trong khoảng maxT không (phép thử slab). */
function rayHits(t: InteractTarget, x: number, z: number, fx: number, fz: number, maxT: number): boolean {
  let t0 = 0;
  let t1 = maxT;
  const axes: Array<[number, number, number, number]> = [
    [x, fx, t.cx - t.hx, t.cx + t.hx],
    [z, fz, t.cz - t.hz, t.cz + t.hz],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
      continue;
    }
    let a = (lo - o) / d;
    let b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}

export interface Evaluation {
  /** Khoảng cách (m) từ nhân vật tới mép gần nhất của vật. 0 nếu đang đứng trong footprint. */
  dist: number;
  /** Độ lệch (rad) giữa hướng nhìn và hướng tới điểm gần nhất. */
  angle: number;
  ready: boolean;
}

/**
 * Đủ điều kiện dùng ngay: gần hơn INTERACT.range VÀ hướng nhìn lệch không quá INTERACT.maxAngle.
 * Vật dài (tường NOC, khối bàn): hướng nhìn chạm thân vật trong tầm cũng tính là đang nhìn vào vật.
 */
export function evaluate(t: InteractTarget, pose: Pose): Evaluation {
  const qx = clamp(pose.x, t.cx - t.hx, t.cx + t.hx);
  const qz = clamp(pose.z, t.cz - t.hz, t.cz + t.hz);
  const dx = qx - pose.x;
  const dz = qz - pose.z;
  const dist = Math.hypot(dx, dz);
  const range = t.range ?? INTERACT.range;
  if (dist >= range) return { dist, angle: Math.PI, ready: false };
  if (dist < 1e-3) return { dist: 0, angle: 0, ready: true };
  const angle = Math.abs(wrap(Math.atan2(dx, dz) - pose.yaw));
  if (angle <= INTERACT.maxAngle) return { dist, angle, ready: true };
  const fx = Math.sin(pose.yaw);
  const fz = Math.cos(pose.yaw);
  return { dist, angle, ready: rayHits(t, pose.x, pose.z, fx, fz, range) };
}

/** Vật đủ điều kiện và gần, thẳng hướng nhìn nhất. null nếu không có vật nào. */
export function pickFocus(targets: readonly InteractTarget[], pose: Pose): InteractTarget | null {
  let best: InteractTarget | null = null;
  let bestScore = Infinity;
  for (const t of targets) {
    const e = evaluate(t, pose);
    if (!e.ready) continue;
    const score = e.dist + 0.5 * Math.min(e.angle, INTERACT.maxAngle) - (t.priority ?? 0);
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

export function isReady(t: InteractTarget, pose: Pose): boolean {
  return evaluate(t, pose).ready;
}

function blocked(x: number, z: number, obstacles: readonly Rect[], bounds: Rect | undefined): boolean {
  const r = PLAYER_RADIUS;
  if (bounds && (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r)) return true;
  return obstacles.some((o) => x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r);
}

/**
 * Điểm đứng trước vật: trên cạnh gần nhân vật nhất, cách mép INTERACT.standOff, quay mặt vào vật.
 * Thử bốn cạnh theo thứ tự gần nhân vật; bỏ cạnh mà điểm đứng nằm trong vật cản hoặc ngoài sàn.
 * Không cạnh nào trống thì dùng cạnh gần nhất (Player tự bỏ đích nếu kẹt).
 */
export function approachOf(
  t: InteractTarget,
  pose: Pose,
  obstacles: readonly Rect[] = [],
  bounds?: Rect,
): Approach {
  const s = INTERACT.standOff;
  // Giữ điểm đứng trong đoạn cạnh, lùi vào khỏi góc một chút để nhìn thẳng vào thân vật.
  const along = (v: number, c: number, h: number) => clamp(v, c - Math.max(0, h - 0.3), c + Math.max(0, h - 0.3));
  const ax = along(pose.x, t.cx, t.hx);
  const az = along(pose.z, t.cz, t.hz);
  const candidates: Approach[] = [
    // Cạnh +x: quay mặt về -x (yaw = -π/2). Cạnh -x: quay về +x (π/2).
    { x: t.cx + t.hx + s, z: az, yaw: -Math.PI / 2 },
    { x: t.cx - t.hx - s, z: az, yaw: Math.PI / 2 },
    // Cạnh +z: quay về -z (yaw = π). Cạnh -z: quay về +z (0).
    { x: ax, z: t.cz + t.hz + s, yaw: Math.PI },
    { x: ax, z: t.cz - t.hz - s, yaw: 0 },
  ];
  candidates.sort((a, b) => Math.hypot(a.x - pose.x, a.z - pose.z) - Math.hypot(b.x - pose.x, b.z - pose.z));
  const free = candidates.find((c) => !blocked(c.x, c.z, obstacles, bounds));
  return free ?? (candidates[0] as Approach);
}
