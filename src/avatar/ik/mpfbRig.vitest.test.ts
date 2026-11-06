// @ts-ignore tsconfig không có kiểu node; vitest chạy trong node.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { LimbIKController, LIMB_IDS, type GroundSampler } from './index';

const FILES = ['male_real', 'female_real', 'chibi'] as const;
// Chibi ~0,874 m gốc: thêm hệ số scale khác nhau để kiểm tra bất biến theo tỷ lệ.
const SCALES: Record<string, number> = { male_real: 1, female_real: 1, chibi: 1.4 };
const FLAT: GroundSampler = (_x, _z, o) => {
  o.y = 0; o.nx = 0; o.ny = 1; o.nz = 0;
  return true;
};

async function loadRig(name: string): Promise<THREE.Object3D> {
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

const wp = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);

function allFinite(root: THREE.Object3D): boolean {
  let ok = true;
  root.traverse((o) => {
    const v = [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray(), ...o.matrixWorld.elements];
    if (v.some((x) => !Number.isFinite(x))) ok = false;
  });
  return ok;
}

function snapshot(root: THREE.Object3D): Map<THREE.Object3D, string> {
  const m = new Map<THREE.Object3D, string>();
  root.traverse((o) => m.set(o, [...o.position.toArray(), ...o.quaternion.toArray()].join(',')));
  return m;
}

describe.each(FILES)('IK trên rig thật %s', (name) => {
  let scene: THREE.Object3D;
  let holder: THREE.Group;
  const scale = SCALES[name];

  beforeAll(async () => {
    scene = await loadRig(name);
    holder = new THREE.Group();
    holder.scale.setScalar(scale);
    holder.add(scene);
    holder.updateMatrixWorld(true);
  });

  const fresh = async () => {
    const s = await loadRig(name);
    const h = new THREE.Group();
    h.scale.setScalar(scale);
    h.add(s);
    h.updateMatrixWorld(true);
    return { s, h };
  };

  it('tìm đủ 4 chuỗi chi, không thiếu xương', () => {
    const ctrl = new LimbIKController(holder);
    for (const id of LIMB_IDS) expect(ctrl.hasLimb(id), id).toBe(true);
    expect(ctrl.bones.missing).toEqual([]);
    expect(ctrl.bones.pelvis).toBeTruthy();
    let bones = 0;
    holder.traverse((o) => { if ((o as THREE.Bone).isBone) bones++; });
    expect(bones).toBe(53);
    for (const id of LIMB_IDS) expect(ctrl.limbLength(id)).toBeGreaterThan(0.1 * scale);
  });

  it('sàn phẳng, tư thế gốc: mắt cá lệch < 2 cm, hông < 5 cm, không NaN', async () => {
    const { s, h } = await fresh();
    const ctrl = new LimbIKController(h);
    const feet = [ctrl.chain('legL')!.bones.end, ctrl.chain('legR')!.bones.end];
    const pelvis = ctrl.bones.pelvis!;
    h.updateMatrixWorld(true);
    const f0 = feet.map(wp);
    const p0 = wp(pelvis);
    ctrl.ground = { sampler: FLAT, maxPelvisDrop: 0.15, maxPelvisRaise: 0.05, maxFootTilt: 0, smoothRate: 12 };
    let maxFoot = 0;
    let maxPelvis = 0;
    for (let i = 0; i < 60; i++) {
      ctrl.update(1 / 60);
      h.updateMatrixWorld(true);
      feet.forEach((f, k) => { maxFoot = Math.max(maxFoot, wp(f).distanceTo(f0[k])); });
      maxPelvis = Math.max(maxPelvis, wp(pelvis).distanceTo(p0));
      expect(allFinite(h)).toBe(true);
    }
    console.log(`[${name}] scale=${scale} lệch mắt cá tối đa=${(maxFoot * 100).toFixed(3)} cm, hông=${(maxPelvis * 100).toFixed(3)} cm`);
    expect(maxFoot).toBeLessThan(0.02);
    expect(maxPelvis).toBeLessThan(0.05);
    void s;
  });

  it('tay phải tới điểm trong tầm: sai số < 5 mm; ngoài tầm: duỗi thẳng, không NaN', async () => {
    const { h } = await fresh();
    const ctrl = new LimbIKController(h);
    const chain = ctrl.chain('armR')!;
    h.updateMatrixWorld(true);
    const sh = ctrl.limbRootPosition('armR', new THREE.Vector3())!.clone();
    const len = ctrl.limbLength('armR');
    // Trước ngực 30 cm về phía trước (+Z), nhưng không quá 0,55 tầm với (chibi tay ngắn).
    const chest = wp(ctrl.bones.limbs.armL!.root).add(sh).multiplyScalar(0.5);
    const target = chest.clone().add(new THREE.Vector3(0, -0.05 * scale, Math.min(0.3, 0.55 * len)));
    expect(ctrl.canReach('armR', target)).toBe(true);
    const t = ctrl.targets.armR;
    t.active = true; t.weight = 1; t.position.copy(target);
    for (let i = 0; i < 120; i++) ctrl.update(1 / 60);
    h.updateMatrixWorld(true);
    const err = wp(chain.bones.end).distanceTo(target);
    console.log(`[${name}] sai số tay trong tầm=${(err * 1000).toFixed(3)} mm (tầm với ${len.toFixed(3)} m)`);
    expect(err).toBeLessThan(0.005);
    expect(allFinite(h)).toBe(true);

    // Ngoài tầm: gấp đôi chiều dài chi.
    const dir = new THREE.Vector3(0.2, -0.2, 1).normalize();
    t.position.copy(sh).addScaledVector(dir, len * 2);
    for (let i = 0; i < 120; i++) ctrl.update(1 / 60);
    h.updateMatrixWorld(true);
    expect(allFinite(h)).toBe(true);
    expect(ctrl.lastReachable('armR')).toBe(false);
    const reach = wp(chain.bones.end).distanceTo(sh);
    console.log(`[${name}] ngoài tầm: khoảng cách vai-tay=${reach.toFixed(3)} / ${len.toFixed(3)} m`);
    expect(reach).toBeGreaterThan(len * 0.97);
    expect(reach).toBeLessThanOrEqual(len + 1e-3);
  });

  it('trọng số 0 hoặc không active: xương không đổi', async () => {
    const { h } = await fresh();
    const ctrl = new LimbIKController(h);
    const before = snapshot(h);
    for (const id of LIMB_IDS) {
      const t = ctrl.targets[id];
      t.active = true; t.weight = 0;
      t.position.copy(wp(ctrl.chain(id)!.bones.end)).add(new THREE.Vector3(0.1, 0.1, 0.1));
    }
    for (let i = 0; i < 30; i++) ctrl.update(1 / 60);
    ctrl.globalWeight = 0;
    for (const id of LIMB_IDS) ctrl.targets[id].weight = 1;
    for (let i = 0; i < 30; i++) ctrl.update(1 / 60);
    const after = snapshot(h);
    for (const [o, v] of before) {
      const a = after.get(o)!.split(',').map(Number);
      const b = v.split(',').map(Number);
      a.forEach((x, i) => expect(Math.abs(x - b[i]), o.name).toBeLessThan(1e-6));
    }
  });
});
