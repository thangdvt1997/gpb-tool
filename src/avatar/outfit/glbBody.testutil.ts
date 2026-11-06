/**
 * Công cụ test: đọc mesh thân từ tệp GLB trong public/models bằng bộ phân tích tối thiểu (không cần DOM/texture),
 * trả BodyData thật (vị trí, pháp tuyến, skin, vị trí xương ở tư thế bind). Chỉ dùng trong test.
 */
import * as THREE from 'three';
import type { BodyData } from './regions';

interface Gltf {
  nodes: { name?: string; mesh?: number; translation?: number[]; rotation?: number[]; scale?: number[]; children?: number[] }[];
  skins: { joints: number[] }[];
  meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[];
  accessors: { bufferView: number; byteOffset?: number; count: number; type: string; componentType: number }[];
  bufferViews: { byteOffset?: number }[];
}

const COMP: Record<number, { new (b: ArrayBuffer): ArrayLike<number> }> = {
  5126: Float32Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5121: Uint8Array,
};
const NUM: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** Node có sẵn nhưng dự án không cài @types/node: lấy fs qua process.getBuiltinModule (Node 22 trở lên). */
interface NodeProc {
  cwd(): string;
  getBuiltinModule(name: string): unknown;
}
function nodeFs(): { readFileSync(p: string): Uint8Array & { readUInt32LE(o: number): number; subarray(a: number, b: number): { toString(): string }; buffer: ArrayBuffer; byteOffset: number } } {
  const proc = (globalThis as unknown as { process: NodeProc }).process;
  return proc.getBuiltinModule('fs') as ReturnType<typeof nodeFs>;
}

export function loadBodyData(model: 'male_real' | 'female_real' | 'chibi'): BodyData {
  const proc = (globalThis as unknown as { process: NodeProc }).process;
  const file = nodeFs().readFileSync(`${proc.cwd()}/public/models/${model}.glb`);
  const jsonLen = file.readUInt32LE(12);
  const j = JSON.parse(file.subarray(20, 20 + jsonLen).toString()) as Gltf;
  const binStart = 20 + jsonLen + 8;
  const read = (i: number): ArrayLike<number> => {
    const a = j.accessors[i];
    const view = j.bufferViews[a.bufferView];
    const Ctor = COMP[a.componentType] as unknown as { new (b: ArrayBuffer): ArrayLike<number>; BYTES_PER_ELEMENT: number };
    const n = a.count * NUM[a.type];
    const off = file.byteOffset + binStart + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return new Ctor(file.buffer.slice(off, off + n * Ctor.BYTES_PER_ELEMENT) as ArrayBuffer);
  };
  const prim = j.meshes[0].primitives[0];
  // Ma trận thế giới của node.
  const parent: Record<number, number> = {};
  j.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => (parent[c] = i)));
  const world: THREE.Matrix4[] = [];
  const getWorld = (i: number): THREE.Matrix4 => {
    if (world[i]) return world[i];
    const n = j.nodes[i];
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...((n.translation ?? [0, 0, 0]) as [number, number, number])),
      new THREE.Quaternion(...((n.rotation ?? [0, 0, 0, 1]) as [number, number, number, number])),
      new THREE.Vector3(...((n.scale ?? [1, 1, 1]) as [number, number, number])),
    );
    world[i] = parent[i] === undefined ? m : getWorld(parent[i]).clone().multiply(m);
    return world[i];
  };
  const joints = j.skins[0].joints;
  const bonePos: Record<string, [number, number, number]> = {};
  const v = new THREE.Vector3();
  for (const ji of joints) {
    v.setFromMatrixPosition(getWorld(ji));
    bonePos[j.nodes[ji].name ?? `n${ji}`] = [v.x, v.y, v.z];
  }
  return {
    positions: read(prim.attributes.POSITION),
    normals: read(prim.attributes.NORMAL),
    index: read(prim.indices),
    skinIndex: read(prim.attributes.JOINTS_0),
    skinWeight: read(prim.attributes.WEIGHTS_0),
    boneNames: joints.map((ji) => j.nodes[ji].name ?? `n${ji}`),
    bonePos,
  };
}
