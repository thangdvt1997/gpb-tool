// Vị trí cụm lối vào tầng 7, suy ra từ src/content/zones/it.json. Sửa it.json thì mọi chi tiết đi theo.
//
// Theo bản vẽ người dùng khoanh (docs/FLOORPLAN_IT.md, mục "Lối vào tầng 7"):
// - lift7_east: cửa mặt Bắc lõi thang máy 2, mở ra hành lang giữa. Cụm dùng cho chuỗi cảnh.
// - lift7_west: cửa mặt Đông lõi thang máy 1, mở ra sảnh. Chỉ mở kèm chuông khi có đồng nghiệp vào tầng.
// - security_gate: giao lộ hành lang ngay sau cửa thang Đông. Bàn và cổng xoay quay mặt về phía Đông (cửa thang).
// - Đường đi: ra cửa thang, rẽ trái qua cổng, đi dọc hành lang giữa về phía Tây, tới điểm thả ENTRY_DROP.

import * as THREE from 'three';
import type { ZoneObject } from '../../content/types';
import { toWorldX, toWorldZ, type Rect } from '../layout';

export const LIFT_EAST_ID = 'lift7_east';
export const LIFT_WEST_ID = 'lift7_west';
export const GATE_ID = 'security_gate';
export const MOD_DESK_ID = 'moderation_desk';

/** Id vật thể do EntryFixtures vẽ. ITOffice bỏ khối hộp của chúng và gắn lớp chọn vô hình. */
export const ENTRY_FIXTURE_IDS: ReadonlySet<string> = new Set([LIFT_EAST_ID, LIFT_WEST_ID, GATE_ID, MOD_DESK_ID]);

/**
 * Hướng mặt ngoài của cửa thang (rad quanh trục y). Hệ local: +z hướng ra hành lang, x theo bề ngang cửa.
 * lift7_east: mặt Bắc (π, local +z thành world -z). lift7_west: mặt Đông (π/2, local +z thành world +x).
 */
const LIFT_FACING: Record<string, number> = {
  [LIFT_EAST_ID]: Math.PI,
  [LIFT_WEST_ID]: Math.PI / 2,
};

/** Kích thước cửa thang (m), hệ local. */
export const LIFT = {
  portalW: 2.4,
  depth: 0.3,
  openW: 1.2,
  openH: 2.15,
  jambW: 0.6,
  leafW: 0.6,
  leafT: 0.04,
  leafZ: -0.05,
  cabinW: 1.5,
  cabinD: 1.6,
  cabinH: 2.4,
} as const;

export interface LiftFrame {
  id: string;
  /** Có cabin thật bên trong (chỉ thang Đông, nơi bắt đầu chuỗi cảnh). */
  cabin: boolean;
  rotY: number;
  /** Ma trận local → world, gốc tại tâm cửa trên mặt sàn. */
  matrix: THREE.Matrix4;
}

const UP = new THREE.Vector3(0, 1, 0);

function frameMatrix(x: number, z: number, rotY: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, 0, z),
    new THREE.Quaternion().setFromAxisAngle(UP, rotY),
    new THREE.Vector3(1, 1, 1),
  );
}

export function liftFrames(objects: readonly ZoneObject[]): LiftFrame[] {
  const out: LiftFrame[] = [];
  for (const o of objects) {
    const rotY = LIFT_FACING[o.id];
    if (o.kind !== 'elevator' || rotY === undefined) continue;
    out.push({ id: o.id, cabin: o.id === LIFT_EAST_ID, rotY, matrix: frameMatrix(o.position[0], o.position[2], rotY) });
  }
  return out;
}

/** Đổi điểm local của cửa thang sang world (x, z). */
export function liftPoint(frame: LiftFrame, lx: number, lz: number): THREE.Vector3 {
  return new THREE.Vector3(lx, 0, lz).applyMatrix4(frame.matrix);
}

/**
 * Bố cục bàn an ninh, độ lệch (m) so với tâm security_gate, trục world (không xoay).
 * Mặt trước hướng +x (về cửa thang Đông). Làn qua cổng chạy theo trục x tại z = laneZ.
 */
export const GATE = {
  laneZ: 0.825,
  /** Tâm z của hai bệ cổng xoay (Bắc, Nam). */
  pedestalZ: [0.225, 1.425] as const,
  pedestalX0: -0.55,
  pedestalX1: 0.75,
  pedestalW: 0.18,
  pedestalH: 1.0,
  /** Bản lề cánh cổng (x), giữa bệ. */
  hingeX: 0.1,
  desk: { x0: -1.15, x1: 0.85, z0: -0.6, z1: 0.05, h: 1.05 },
  guard: { x: -0.1, z: -1.05 },
  stool: { x: -0.1, z: -1.3 },
  /** Chỗ nhân vật đứng chờ quét, trước làn. */
  stop: { x: 1.15, z: 0.825 },
  /** Ra khỏi làn, phía Tây cổng. */
  laneExitX: -1.6,
} as const;

export interface GateFrame {
  x: number;
  z: number;
}

export function gateFrame(objects: readonly ZoneObject[]): GateFrame | null {
  const o = objects.find((it) => it.id === GATE_ID);
  return o ? { x: o.position[0], z: o.position[2] } : null;
}

/** Bàn kiểm duyệt (moderation_desk): tâm và kích thước lấy từ it.json. */
export function modDeskOf(objects: readonly ZoneObject[]): ZoneObject | null {
  return objects.find((it) => it.id === MOD_DESK_ID) ?? null;
}

/**
 * Điểm thả nhân vật vào tầng sau chuỗi cảnh: cuối hành lang giữa phía Tây.
 * Bản vẽ (20.2, 13.4) m. Bản vẽ khoanh ở pixel (285, 275), tức khoảng x 17; dời sang x 20.2 vì x 15.5–18.5
 * là phòng In ấn (util_print). Mặt hướng Tây.
 */
export const ENTRY_DROP = { x: toWorldX(20.2), z: toWorldZ(13.4), rotY: -Math.PI / 2 };

/**
 * Ô chặn đi lại của bàn an ninh: khối bàn và chỗ bảo vệ ngồi, hai bệ cổng xoay.
 * Làn giữa hai bệ để trống (rộng 1,02 m) nên người chơi vẫn đi qua cổng được.
 */
export function entryBlockers(objects: readonly ZoneObject[]): Rect[] {
  const g = gateFrame(objects);
  if (!g) return [];
  const { desk, pedestalZ, pedestalX0, pedestalX1, pedestalW } = GATE;
  const out: Rect[] = [{ minX: g.x + desk.x0, maxX: g.x + desk.x1, minZ: g.z - 1.45, maxZ: g.z + desk.z1 }];
  for (const pz of pedestalZ) {
    out.push({
      minX: g.x + pedestalX0,
      maxX: g.x + pedestalX1,
      minZ: g.z + pz - pedestalW / 2,
      maxZ: g.z + pz + pedestalW / 2,
    });
  }
  return out;
}
