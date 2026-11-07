import * as THREE from 'three';
import type { ZoneObject } from '../../content/types';

/**
 * Trạng thái dùng chung giữa nhân vật (MpfbAvatar) và vật cầm / bàn (scene), ghi mỗi khung.
 * Dữ liệu thuần, không phụ thuộc React.
 */

/** Điểm cầm cốc danh nghĩa trước-phải người chơi: 0,35 m phía trước, 0,18 m bên phải, tâm cốc cao 1,05 m. Cùng điểm với ItemMesh. */
export function cupHoldPoint(p: { x: number; z: number; yaw: number }, out: THREE.Vector3): THREE.Vector3 {
  const sy = Math.sin(p.yaw);
  const cy = Math.cos(p.yaw);
  return out.set(p.x + sy * 0.35 + cy * 0.18, 1.05, p.z + cy * 0.35 - sy * 0.18);
}

/** Socket hand_r đã hiệu chỉnh trong public/models/manifest.json (đơn vị cục bộ của xương hand_r), theo từng mô hình. Test đối chiếu manifest. */
export const HAND_SOCKET_R = {
  male_real: [-0.0024, 0.0595, -0.0064],
  female_real: [-0.001, 0.0444, -0.0051],
  chibi: [-0.0019, 0.0288, -0.0026],
} as const satisfies Record<string, readonly [number, number, number]>;

export function handSocketForUrl(url: string): readonly [number, number, number] {
  for (const k of Object.keys(HAND_SOCKET_R) as Array<keyof typeof HAND_SOCKET_R>) if (url.includes(k)) return HAND_SOCKET_R[k];
  return HAND_SOCKET_R.male_real;
}

/** Điểm tay với tới khi cầm cốc: tỉ lệ theo chiều dài tay (0,56 m = tay nam), trước vai 0,30, lệch phải 0,02, dưới vai 0,28. Luôn trong tầm. */
export function cupReachPoint(shoulder: THREE.Vector3, yaw: number, armLength: number, out: THREE.Vector3): THREE.Vector3 {
  const k = armLength / 0.56;
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  return out.set(shoulder.x + (sy * 0.3 + cy * 0.02) * k, shoulder.y - 0.28 * k, shoulder.z + (cy * 0.3 - sy * 0.02) * k);
}

export const ikHold = {
  /** Tay phải đang cầm vật bằng IK: vật nên bám `handSocket` (thế giới). */
  active: false,
  handSocket: new THREE.Vector3(),
  /** Tâm vật đang cầm (thế giới), do ItemMesh ghi mỗi khung; null nếu không cầm. */
  itemPos: null as THREE.Vector3 | null,
};

// ---- Mặt bàn ----
export interface DeskSurface {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Cao độ mặt bàn (m). */
  y: number;
}

const DEFAULT_DESK_HEIGHT = 0.75;
let surfaces: DeskSurface[] = [];

/** Mặt bàn từ khối bàn trong dữ liệu vùng: footprint = position/size, độ cao = size[1] (mặc định 0,75 m). */
export function deskSurfacesOf(objects: readonly ZoneObject[]): DeskSurface[] {
  return objects
    .filter((o) => o.kind === 'desk')
    .map((o) => ({
      minX: o.position[0] - o.size[0] / 2,
      maxX: o.position[0] + o.size[0] / 2,
      minZ: o.position[2] - o.size[2] / 2,
      maxZ: o.position[2] + o.size[2] / 2,
      y: o.size[1] > 0.4 && o.size[1] < 1.3 ? o.size[1] : DEFAULT_DESK_HEIGHT,
    }));
}

export function setDeskSurfaces(list: readonly DeskSurface[]): void {
  surfaces = [...list];
}

/** Độ cao mặt bàn ngay trước người ngồi (cách neo `ahead` m theo hướng nhìn), hoặc null nếu không có bàn. */
export function deskHeightAhead(x: number, z: number, yaw: number, ahead = 0.3): number | null {
  const px = x + Math.sin(yaw) * ahead;
  const pz = z + Math.cos(yaw) * ahead;
  for (const s of surfaces) if (px >= s.minX && px <= s.maxX && pz >= s.minZ && pz <= s.maxZ) return s.y;
  return null;
}
