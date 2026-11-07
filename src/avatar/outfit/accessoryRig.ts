/**
 * Gắn phụ kiện và mũ vào xương của rig MPFB (three.js, không có React): đo thân (đã áp morph thân của look),
 * dựng hình học procedural trong không gian bind rồi đổi sang không gian cục bộ của xương (boneInverse x bindMatrix)
 * và làm con của xương, nên đi theo xương khi chạy, ngồi, tương tác và không trôi.
 */
import * as THREE from 'three';
import type { CharacterLook } from '../../fashion/types';
import { buildAccessory, makeBuildContext, type AccessoryPart, type BuiltAccessory, type PartRole } from './accessoryBuild';
import { planAccessories, type AccessoryEntry } from './accessoryPlan';
import { BODY_MORPH_NAMES, deriveBodyMorphWeights, type BodyMorphName } from './bodyMorphs';
import { bodyDataFromMesh, MATERIAL_PARAMS } from './threeShell';
import { classifyBody, type BodyData } from './regions';

/** Dữ liệu thân với morph thân đã cộng vào vị trí đỉnh (đo phụ kiện theo hình thể thật của look). */
export function morphedBodyData(mesh: THREE.SkinnedMesh, weights: Readonly<Record<BodyMorphName, number>> | null): BodyData {
  const data = bodyDataFromMesh(mesh);
  const geo = mesh.geometry;
  const dict = mesh.morphTargetDictionary;
  const targets = geo.morphAttributes.position;
  if (!weights || !dict || !targets) return data;
  const pos = Float32Array.from(data.positions as ArrayLike<number>);
  const relative = geo.morphTargetsRelative;
  const base = Float32Array.from(pos);
  for (const name of BODY_MORPH_NAMES) {
    const w = weights[name];
    const i = dict[name];
    if (!w || i === undefined || !targets[i]) continue;
    const t = targets[i];
    for (let v = 0; v < pos.length / 3; v++) {
      const dx = t.getX(v) - (relative ? 0 : base[v * 3]);
      const dy = t.getY(v) - (relative ? 0 : base[v * 3 + 1]);
      const dz = t.getZ(v) - (relative ? 0 : base[v * 3 + 2]);
      pos[v * 3] += w * dx;
      pos[v * 3 + 1] += w * dy;
      pos[v * 3 + 2] += w * dz;
    }
  }
  return { ...data, positions: pos };
}

const ROLE_COLOR: Readonly<Record<PartRole, string | null>> = {
  main: null,
  metal: '#b8bec8',
  dark: '#1b1d21',
  lens: '#12161c',
  accent: '#2f5fa8',
  white: '#f4f4f2',
  band: null,
  trim: null,
  button: null,
};

function materialFor(entry: AccessoryEntry, part: AccessoryPart): THREE.MeshStandardMaterial {
  const mat = part.role === 'metal' ? 'metal' : part.role === 'lens' ? 'plastic' : part.role === 'dark' ? 'rubber' : entry.material;
  const p = MATERIAL_PARAMS[mat];
  let color = part.color ?? ROLE_COLOR[part.role] ?? entry.color;
  if (part.role === 'metal' && entry.material === 'metal' && entry.slot !== 'watch') color = entry.color;
  const m = new THREE.MeshStandardMaterial({ color, roughness: p.roughness, metalness: p.metalness });
  if (part.doubleSided) m.side = THREE.DoubleSide;
  if (part.role === 'lens') {
    m.roughness = 0.08;
    m.metalness = 0.2;
    if (entry.slot === 'eyewear') {
      m.transparent = true;
      m.opacity = 0.82;
    }
  }
  if (entry.slot === 'hat' || entry.material === 'knit') m.side = THREE.DoubleSide;
  return m;
}

export interface AttachedAccessories {
  /** Số mesh đã gắn. */
  meshes: THREE.Mesh[];
  built: BuiltAccessory[];
  skipped: { slot: string; itemId: string; reason: string }[];
  dispose(): void;
}

/** Khoá phụ thuộc vào hình thể: đổi thì dựng lại để phụ kiện ôm đúng cơ thể mới. */
export function morphKey(look: CharacterLook | null): string {
  if (!look) return 'none';
  const w = deriveBodyMorphWeights(look);
  return BODY_MORPH_NAMES.map((n) => w[n].toFixed(2)).join(',');
}

export function attachAccessories(body: THREE.SkinnedMesh, look: CharacterLook): AttachedAccessories {
  const plan = planAccessories(look);
  const meshes: THREE.Mesh[] = [];
  const built: BuiltAccessory[] = [];
  const skipped = [...plan.skipped];
  if (plan.entries.length === 0) return { meshes, built, skipped, dispose: () => undefined };
  const data = morphedBodyData(body, deriveBodyMorphWeights(look));
  const cls = classifyBody(data);
  const ctx = makeBuildContext(data, cls, look);
  const bones = body.skeleton.bones;
  const bind = body.bindMatrix;
  const mats: THREE.Material[] = [];
  const m4 = new THREE.Matrix4();
  for (const entry of plan.entries) {
    const idx = bones.findIndex((b) => b.name === entry.bone);
    if (idx < 0) {
      skipped.push({ slot: entry.slot, itemId: entry.itemId, reason: `Rig không có xương ${entry.bone}.` });
      continue;
    }
    let b: BuiltAccessory;
    try {
      b = buildAccessory(entry, ctx);
    } catch (err) {
      skipped.push({ slot: entry.slot, itemId: entry.itemId, reason: `Lỗi dựng: ${(err as Error).message}` });
      continue;
    }
    built.push(b);
    m4.multiplyMatrices(body.skeleton.boneInverses[idx], bind);
    for (const part of b.parts) {
      part.geometry.applyMatrix4(m4);
      part.geometry.computeBoundingSphere();
      const material = materialFor(entry, part);
      mats.push(material);
      const mesh = new THREE.Mesh(part.geometry, material);
      mesh.name = `acc:${entry.key}`;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      bones[idx].add(mesh);
      meshes.push(mesh);
    }
  }
  return {
    meshes,
    built,
    skipped,
    dispose() {
      for (const m of meshes) {
        m.parent?.remove(m);
        m.geometry.dispose();
      }
      for (const m of mats) m.dispose();
      meshes.length = 0;
    },
  };
}
