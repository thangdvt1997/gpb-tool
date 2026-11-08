// Vật thêm bằng trình biên tập (TASK 17): danh mục nhỏ, tường ngăn và cửa. Thuần dữ liệu, không React/three.
// Danh mục và luật va chạm có bản sao phía máy chủ ở services/layout/src/extras.js; sửa một nơi thì sửa cả hai.
import type { Rect } from '../scene/layout';
import type { Pose } from '../layout/types';
import { rectOfPose } from '../layout/placement';

export type PropKind = 'table' | 'chair' | 'plant' | 'cabinet' | 'wall2' | 'wall4';

export interface PropDef {
  kind: PropKind;
  label: string;
  /** [w, h, d] chưa xoay: w theo trục x, d theo trục z. */
  size: readonly [number, number, number];
  color: string;
  wall: boolean;
}

export const PROP_CATALOG: Record<PropKind, PropDef> = {
  table: { kind: 'table', label: 'Bàn họp nhỏ', size: [1.6, 0.75, 0.9], color: '#b08968', wall: false },
  chair: { kind: 'chair', label: 'Ghế', size: [0.5, 0.9, 0.5], color: '#4a6fa5', wall: false },
  plant: { kind: 'plant', label: 'Cây', size: [0.6, 1.2, 0.6], color: '#4c9a62', wall: false },
  cabinet: { kind: 'cabinet', label: 'Tủ', size: [1.2, 1.8, 0.5], color: '#8d99ae', wall: false },
  wall2: { kind: 'wall2', label: 'Tường ngăn 2 m', size: [2, 2.6, 0.15], color: '#d9d4c7', wall: true },
  wall4: { kind: 'wall4', label: 'Tường ngăn 4 m', size: [4, 2.6, 0.15], color: '#d9d4c7', wall: true },
};

export const PROP_KINDS = Object.keys(PROP_CATALOG) as PropKind[];
/** Bề rộng khoảng hở của cửa trong tường ngăn, mét; cửa nằm giữa đoạn tường. */
export const DOOR_WIDTH = 1;
/** Khoảng cách tối thiểu giữa hai vật thêm (không áp cho hai đoạn tường). */
export const PROP_GAP = 0.1;
/** Tối đa số vật thêm trong bố cục (khớp máy chủ). */
export const MAX_PROPS = 60;

export const isPropId = (id: string): boolean => /^p_[a-z0-9]{4,24}$/.test(id);

export function isPropKind(v: unknown): v is PropKind {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PROP_CATALOG, v);
}

/** Id mới cho vật thêm. Gọi ở nơi phát hành hành động (không gọi trong reducer, để reducer thuần). */
export function newPropId(): string {
  const r = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
  return `p_${Date.now().toString(36).slice(-6)}${r}`;
}

/** Vật chuẩn để nhân bản một vật gốc (cây gốc nhân bản thành cây thêm). */
export function duplicateKindOf(id: string): PropKind | null {
  return id.startsWith('plant_') ? 'plant' : null;
}

/**
 * Hộp va chạm của một vật thêm. Tường có cửa tách thành hai hộp, chừa khoảng hở DOOR_WIDTH ở giữa
 * (nhân vật và camera đi qua được); các vật khác một hộp.
 */
export function propRects(kind: PropKind, pose: Pose & { door?: boolean }): Rect[] {
  const def = PROP_CATALOG[kind];
  const [w, , d] = def.size;
  const whole = rectOfPose(pose, w, d);
  if (!def.wall || !pose.door || w <= DOOR_WIDTH + 0.2) return [whole];
  const half = (w - DOOR_WIDTH) / 2;
  const swap = pose.rotation === 90 || pose.rotation === 270;
  // Đoạn tường chạy theo trục x (không xoay) hoặc trục z (xoay 90/270).
  const along = (lo: number, hi: number): Rect =>
    swap
      ? { minX: whole.minX, maxX: whole.maxX, minZ: pose.z + lo, maxZ: pose.z + hi }
      : { minX: pose.x + lo, maxX: pose.x + hi, minZ: whole.minZ, maxZ: whole.maxZ };
  return [along(-w / 2, -DOOR_WIDTH / 2), along(DOOR_WIDTH / 2, w / 2)].filter((r) => half > 0 && r.maxX > r.minX && r.maxZ > r.minZ);
}

/**
 * Hộp va chạm của mọi vật thêm trong một bộ vị trí (thường là bản ĐÃ LƯU). Nguồn chung cho nhân vật
 * (ITOffice.extraBlockers) và camera chụp ảnh: vật mới thêm chặn, vật đã xóa không còn trong poses nên không chặn,
 * vật đã di chuyển chặn ở vị trí mới.
 */
export function propBlockers(poses: Readonly<Record<string, Pose & { door?: boolean }>>, kinds: Readonly<Record<string, PropKind>> | undefined): Rect[] {
  const out: Rect[] = [];
  for (const [id, pose] of Object.entries(poses)) {
    const kind = kinds?.[id];
    if (kind) out.push(...propRects(kind, pose));
  }
  return out;
}
