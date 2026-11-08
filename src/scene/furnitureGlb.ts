// Chuyển GLB nội thất tự sinh (public/models/furn_desk.glb, furn_chair.glb) thành dữ liệu cho InstancedMesh.
// Toàn hàm thuần (không DOM, không WebGL) để kiểm bằng vitest.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { V3 } from './layout';

/** Một cặp geometry + vật liệu: một InstancedMesh, một draw call. */
export interface InstanceSource {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/**
 * Gom mọi mesh của cây GLB theo vật liệu, áp ma trận thế giới của từng mesh vào đỉnh rồi gộp (mergeGeometries).
 * Số nguồn trả về = số vật liệu khác nhau, nên GLB một vật liệu cho đúng một draw call.
 * Bỏ qua node không phải mesh (empty socket như interact.use). Geometry không đồng nhất thuộc tính bị bỏ qua.
 */
export function sourcesFromScene(root: THREE.Object3D): InstanceSource[] {
  root.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    // mergeGeometries yêu cầu cùng kiểu chỉ mục và cùng tập thuộc tính.
    const flat = g.index ? g.toNonIndexed() : g;
    const list = groups.get(m.material) ?? [];
    list.push(flat);
    groups.set(m.material, list);
  });
  const out: InstanceSource[] = [];
  for (const [material, list] of groups) {
    const geometry = list.length === 1 ? list[0]! : mergeGeometries(list, false);
    if (geometry) out.push({ geometry, material });
  }
  return out;
}

/** Một chỗ đặt: vị trí trên sàn, xoay quanh Y, chủ sở hữu (id khối bàn trong it.json). */
export interface Placement {
  pos: V3;
  yaw: number;
  owner: string;
}

const tmpQ = new THREE.Quaternion();
const tmpAxis = new THREE.Vector3(0, 1, 0);
const tmpP = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

export function placementMatrix(p: Placement, out: THREE.Matrix4 = new THREE.Matrix4()): THREE.Matrix4 {
  tmpQ.setFromAxisAngle(tmpAxis, p.yaw);
  return out.compose(tmpP.set(p.pos[0], p.pos[1], p.pos[2]), tmpQ, ONE);
}

/** Khoảng ghế so với tâm bàn theo +z, khớp SEAT.chairOffset của src/scene/interact/geometry.ts. */
export const CHAIR_OFFSET_Z = 0.55;

/**
 * Chỗ đặt bàn và ghế từ danh sách chỗ ngồi. Bàn không xoay (màn hình ở -z). Ghế cách bàn CHAIR_OFFSET_Z về +z và
 * xoay pi: lưng ghế (-z local của GLB) quay ra xa bàn, người ngồi nhìn về -z như hệ tương tác giả định.
 */
export function furniturePlacements(seats: ReadonlyArray<{ owner: string; x: number; z: number }>): {
  desks: Placement[];
  chairs: Placement[];
} {
  return {
    desks: seats.map((s) => ({ pos: [s.x, 0, s.z] as V3, yaw: 0, owner: s.owner })),
    chairs: seats.map((s) => ({ pos: [s.x, 0, s.z + CHAIR_OFFSET_Z] as V3, yaw: Math.PI, owner: s.owner })),
  };
}

/** ?glbFurniture=0 tắt GLB (về InstancedBoxes). Mặc định bật. */
export function glbFurnitureEnabled(search: string): boolean {
  return new URLSearchParams(search).get('glbFurniture') !== '0';
}

export type FurnitureSource = 'glb' | 'boxes' | 'loading';
