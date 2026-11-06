// @ts-ignore tsconfig không có kiểu node; vitest chạy trong node.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { REST_POSE } from './animation';
import { applyMpfbPose, buildRig, createPoseWork } from './MpfbAvatar';

// Đầu và cổ nhìn theo camera (phản hồi người dùng): góc neckRotY + headRotY phải quay hướng mặt của xương đầu
// đúng chừng ấy quanh trục đứng, đúng chiều, trên cả 3 GLB MPFB thật.

async function loadGltf(name: string): Promise<GLTF> {
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
  const gltf: GLTF = await new Promise((res, rej) => {
    loader.parse(out.buffer as ArrayBuffer, '', res as never, rej);
  });
  return gltf;
}

describe('đầu và cổ quay theo camera trên GLB MPFB thật', () => {
  for (const name of ['male_real', 'female_real', 'chibi'] as const) {
    it(`${name}: 50 độ chia cổ/đầu quay mặt sang trái 50 độ, -50 sang phải`, async () => {
      const rig = buildRig(await loadGltf(name));
      const work = createPoseWork();
      const neck = rig.root.getObjectByName('neck_01');
      const head = rig.root.getObjectByName('head');
      expect(neck).toBeTruthy();
      expect(head?.parent).toBe(neck);
      applyMpfbPose(rig, { ...REST_POSE }, work);
      rig.root.updateMatrixWorld(true);
      const q0 = head!.getWorldQuaternion(new THREE.Quaternion());
      for (const deg of [50, -50]) {
        const a = (deg * Math.PI) / 180;
        applyMpfbPose(rig, { ...REST_POSE, neckRotY: a * 0.4, headRotY: a * 0.6 }, work);
        rig.root.updateMatrixWorld(true);
        const q = head!.getWorldQuaternion(new THREE.Quaternion());
        // Phép quay tương đối so với tư thế nghỉ, trong hệ mô hình: phải là quay quanh Y đúng góc a.
        const rel = q.clone().multiply(q0.clone().invert());
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rel);
        const yaw = Math.atan2(fwd.x, fwd.z);
        expect(yaw).toBeCloseTo(a, 2);
        expect(Math.abs(fwd.y)).toBeLessThan(0.01);
        // Cổ cũng quay (không dồn hết vào đầu).
        const nq = neck!.getWorldQuaternion(new THREE.Quaternion());
        applyMpfbPose(rig, { ...REST_POSE }, work);
        rig.root.updateMatrixWorld(true);
        const nq0 = neck!.getWorldQuaternion(new THREE.Quaternion());
        const nf = new THREE.Vector3(0, 0, 1).applyQuaternion(nq.clone().multiply(nq0.clone().invert()));
        expect(Math.atan2(nf.x, nf.z)).toBeCloseTo(a * 0.4, 2);
      }
    });
  }
});
