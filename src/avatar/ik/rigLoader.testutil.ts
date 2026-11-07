// @ts-ignore tsconfig không có kiểu node; vitest chạy trong node.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export async function loadRig(name: string): Promise<THREE.Object3D> {
  // @ts-ignore process/Buffer là của node
  const buf: Buffer = readFileSync(`${process.cwd()}/public/models/${name}.glb`);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  // Node không có ImageBitmap/DOM: bỏ vật liệu và texture khỏi JSON chunk, chỉ giữ cây xương và hình học.
  const dv = new DataView(ab);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 20, jsonLen)));
  delete json.materials; delete json.textures; delete json.images; delete json.samplers;
  for (const m of json.meshes ?? []) for (const p of m.primitives) delete p.material;
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const jb = new TextEncoder().encode(text);
  const rest = new Uint8Array(ab, 20 + jsonLen);
  const out = new Uint8Array(20 + jb.length + rest.length);
  const ov = new DataView(out.buffer);
  out.set(new Uint8Array(ab, 0, 12), 0);
  ov.setUint32(8, out.length, true);
  ov.setUint32(12, jb.length, true);
  ov.setUint32(16, 0x4e4f534a, true);
  out.set(jb, 20);
  out.set(rest, 20 + jb.length);
  const loader = new GLTFLoader();
  const gltf: { scene: THREE.Object3D } = await new Promise((res, rej) => {
    loader.parse(out.buffer as ArrayBuffer, '', res as never, rej);
  });
  return gltf.scene;
}
