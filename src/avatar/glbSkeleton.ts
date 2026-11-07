import * as THREE from 'three';

/** Đọc phần JSON của tệp GLB (glTF 2.0 binary). Ném lỗi nếu sai định dạng. */
export function readGlbJson(buf: ArrayBuffer | Uint8Array): GlbJson {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) throw new Error('Không phải GLB 2.0');
  const len = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error('Thiếu chunk JSON');
  return JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + len))) as GlbJson;
}

export interface GlbNode {
  name?: string;
  children?: number[];
  mesh?: number;
  skin?: number;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}

export interface GlbJson {
  scene?: number;
  scenes: Array<{ nodes: number[] }>;
  nodes: GlbNode[];
  skins?: Array<{ joints: number[] }>;
  animations?: Array<{ name?: string; channels: unknown[] }>;
}

/** Tên xương theo thứ tự skin.joints đầu tiên. */
export function jointNames(json: GlbJson): string[] {
  return (json.skins?.[0]?.joints ?? []).map((i) => json.nodes[i]?.name ?? `#${i}`);
}

/**
 * Dựng cây xương rỗng (không mesh, không skin) từ GLB nhân vật, giữ nguyên tên và biến đổi nghỉ của từng node.
 * Dùng để bake/kiểm clip mà không cần giải mã texture (chạy được trong Node).
 */
export function buildSkeletonScene(json: GlbJson): THREE.Group {
  const joints = new Set(json.skins?.[0]?.joints ?? []);
  const hasJoint = (i: number): boolean => joints.has(i) || (json.nodes[i].children ?? []).some(hasJoint);
  const make = (i: number): THREE.Object3D | null => {
    const n = json.nodes[i];
    if (n.mesh != null || !hasJoint(i)) return null;
    const o = joints.has(i) ? new THREE.Bone() : new THREE.Group();
    o.name = n.name ?? `node${i}`;
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    for (const c of n.children ?? []) {
      const k = make(c);
      if (k) o.add(k);
    }
    return o;
  };
  const scene = new THREE.Group();
  for (const r of json.scenes[json.scene ?? 0].nodes) {
    const k = make(r);
    if (k) scene.add(k);
  }
  scene.updateMatrixWorld(true);
  return scene;
}
