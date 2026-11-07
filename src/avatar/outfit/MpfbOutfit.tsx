import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CharacterLook, GarmentPattern, OutfitSlot } from '../../fashion/types';
import { deriveBodyMorphWeights, writeBodyMorphs } from './bodyMorphs';
import { hiddenSkinTriangles, resolveLayers, visibleSkinIndex } from './coverage';
import { bodyPatterns, drawPatterns, patternSignature, PATTERN_CANVAS_SIZE } from './patternTexture';
import { MpfbAccessories } from './MpfbAccessories';
import { planOutfit, type PiecePlan } from './plan';
import {
  analyzeBody,
  createShellMaterial,
  createShellShadowMaterials,
  deriveGeometry,
  geometryPool,
  setShellMaterialParams,
  setShellPattern,
  setShellZoneColors,
  shellGeometryKey,
  skinGeometryKey,
} from './threeShell';
import { vertexZoneBlend, ZONE_LIST, resolveZoneColor } from './zones';

/** Phần của rig MpfbAvatar mà MpfbOutfit cần (cấu trúc, không import kiểu nội bộ của MpfbAvatar). */
export interface OutfitRigLike {
  root: THREE.Object3D;
  morphMesh: THREE.Mesh | null;
}

export interface MpfbOutfitProps {
  rig: OutfitRigLike;
  look: CharacterLook | null;
  /**
   * Ghi trọng số morph thân (kể cả thanh tổng hợp cân nặng/mỡ/cơ) mỗi khung, sau MpfbAvatar.
   * Mặc định bật; tắt nếu nơi khác đã tự ghi.
   */
  driveBodyMorphs?: boolean;
}

/** Chữ ký phần ảnh hưởng hình học: đổi thì dựng lại vỏ. Màu và chất liệu không nằm ở đây. */
export function structureSignature(look: CharacterLook | null): string {
  if (!look) return 'none';
  const parts: string[] = [look.bodyStyle];
  for (const slot of Object.keys(look.outfit) as OutfitSlot[]) {
    const w = look.outfit[slot];
    parts.push(w ? `${slot}:${w.garmentId}:${w.fit}:${w.tucked ? 1 : 0}` : `${slot}:-`);
  }
  return parts.join('|');
}

/** Chữ ký màu và chất liệu: đổi thì chỉ cập nhật uniform. */
export function colorSignature(look: CharacterLook | null): string {
  if (!look) return 'none';
  const parts: string[] = [];
  for (const slot of Object.keys(look.outfit) as OutfitSlot[]) {
    const w = look.outfit[slot];
    if (w) parts.push(`${slot}:${JSON.stringify(w.colors)}:${JSON.stringify(w.materials)}:${patternSignature(w.patterns)}`);
  }
  return parts.join('|');
}

interface Shell {
  slot: OutfitSlot;
  mesh: THREE.SkinnedMesh;
  material: THREE.MeshStandardMaterial;
  geoKey: string;
  plan: PiecePlan;
  /** Hình vuông in họa tiết trên thân: [tâm x, tâm y, cạnh, cạnh] ở toạ độ bind. */
  rect: [number, number, number, number];
  patternTex: THREE.CanvasTexture | null;
}

function applyColors(shell: Shell, look: CharacterLook): void {
  const worn = look.outfit[shell.slot];
  if (!worn) return;
  setShellZoneColors(shell.material, ZONE_LIST.map((z) => resolveZoneColor(worn.colors, z)));
  const main = worn.materials.body ?? worn.materials.upper ?? worn.materials.leg ?? Object.values(worn.materials)[0] ?? 'cotton';
  setShellMaterialParams(shell.material, main);
  applyPatterns(shell, worn.patterns);
}

/** Vẽ lại canvas họa tiết cho áo/bộ liền (chỉ họa tiết vùng thân, in mặt trước). */
function applyPatterns(shell: Shell, patterns: GarmentPattern[]): void {
  const part = shell.plan.spec.part;
  const list = part === 'top' || part === 'full' ? bodyPatterns(patterns) : [];
  if (list.length === 0 || typeof document === 'undefined') {
    shell.patternTex?.dispose();
    shell.patternTex = null;
    setShellPattern(shell.material, null, shell.rect);
    return;
  }
  if (!shell.patternTex) {
    const canvas = document.createElement('canvas');
    canvas.width = PATTERN_CANVAS_SIZE;
    canvas.height = PATTERN_CANVAS_SIZE;
    shell.patternTex = new THREE.CanvasTexture(canvas);
    shell.patternTex.colorSpace = THREE.SRGBColorSpace;
  }
  const canvas = shell.patternTex.image as HTMLCanvasElement;
  const g = canvas.getContext('2d');
  if (g) drawPatterns(g, list);
  shell.patternTex.needsUpdate = true;
  setShellPattern(shell.material, shell.patternTex, shell.rect);
}

/**
 * Gắn trang phục lên nhân vật MPFB. Dựng "vỏ" từ chính SkinnedMesh thân: chọn tam giác theo vùng skin của từng món,
 * đẩy đỉnh theo pháp tuyến theo độ dày lớp, dùng chung skeleton, bindMatrix và morphTargetInfluences của thân.
 * Tam giác da nằm trọn dưới vỏ bị ẩn bằng index riêng của geometry da (geometry gốc không bị sửa).
 *
 * Gắn bên trong MpfbModel của MpfbAvatar (cần nằm trong Canvas):
 *   <MpfbOutfit rig={rig} look={look} />
 * Component không render gì vào cây React; nó thêm mesh vào cha của mesh thân và gỡ khi unmount.
 */
export function MpfbOutfit({ rig, look, driveBodyMorphs = true }: MpfbOutfitProps) {
  const body = rig.morphMesh && (rig.morphMesh as THREE.SkinnedMesh).isSkinnedMesh ? (rig.morphMesh as THREE.SkinnedMesh) : null;
  const lookRef = useRef(look);
  lookRef.current = look;
  const shellsRef = useRef<Shell[]>([]);
  const structSig = structureSignature(look);
  const colorSig = colorSignature(look);
  const weights = useMemo(() => (look ? deriveBodyMorphWeights(look) : null), [look]);
  const weightsRef = useRef(weights);
  weightsRef.current = weights;

  // Dựng/dọn vỏ khi cấu trúc bộ đồ đổi.
  useEffect(() => {
    const current = lookRef.current;
    const parent = body?.parent;
    if (!body || !parent || !current) return;
    const baseGeo = body.geometry;
    const { data, cls } = analyzeBody(body, baseGeo);
    const plan = planOutfit(current);
    for (const s of plan.skipped) console.warn(`Trang phục chưa dựng được (${s.slot}/${s.garmentId}): ${s.reason}`);
    const results = resolveLayers(cls, data.index, plan.pieces);

    // Da: ẩn tam giác nằm kín dưới vỏ.
    const triCount = Math.floor(data.index.length / 3);
    const hidden = hiddenSkinTriangles(triCount, results);
    const skinIndex = visibleSkinIndex(data.index, hidden);
    const acquired: string[] = [];
    let skinKey: string | null = null;
    if (skinIndex.length < data.index.length) {
      skinKey = skinGeometryKey(baseGeo.uuid, skinIndex);
      body.geometry = geometryPool.acquire(skinKey, () => deriveGeometry(baseGeo, skinIndex));
    }

    const order = plan.pieces.map((p, i) => ({ p, i })).sort((a, b) => a.p.order - b.p.order);
    const shells: Shell[] = [];
    order.forEach(({ p, i }, rank) => {
      const r = results[i];
      if (r.index.length === 0) return;
      const zb = vertexZoneBlend(cls, p.spec, data.normals);
      const key = shellGeometryKey(baseGeo.uuid, `${p.garmentId}|${p.variant.fit}|${p.variant.tucked ? 1 : 0}`, r.index, r.offset, r.cut);
      const geo = geometryPool.acquire(key, () => deriveGeometry(baseGeo, r.index, { offset: r.offset, zone: zb.zone, zoneB: zb.zoneB, band: zb.band, cut: r.cut }));
      acquired.push(key);
      const material = createShellMaterial(rank);
      const mesh = new THREE.SkinnedMesh(geo, material);
      mesh.name = `outfit:${p.slot}`;
      mesh.frustumCulled = false;
      const shadow = createShellShadowMaterials();
      mesh.customDepthMaterial = shadow.depth;
      mesh.customDistanceMaterial = shadow.distance;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
      mesh.scale.copy(body.scale);
      mesh.bindMode = body.bindMode;
      mesh.bind(body.skeleton, body.bindMatrix);
      // Dùng chung mảng influence với thân: morph thân, mặt và thanh hình thể tự áp lên vỏ.
      mesh.updateMorphTargets();
      if (body.morphTargetInfluences) mesh.morphTargetInfluences = body.morphTargetInfluences;
      parent.add(mesh);
      const span = Math.max(1e-6, cls.yNeck - cls.yPelvis);
      const shell: Shell = { slot: p.slot, mesh, material, geoKey: key, plan: p, rect: [0, cls.yPelvis + 0.6 * span, span * 0.95, span * 0.95], patternTex: null };
      applyColors(shell, current);
      shells.push(shell);
    });
    shellsRef.current = shells;

    return () => {
      shellsRef.current = [];
      for (const s of shells) {
        parent.remove(s.mesh);
        s.material.dispose();
        s.patternTex?.dispose();
        (s.mesh.customDepthMaterial as THREE.Material | undefined)?.dispose();
        (s.mesh.customDistanceMaterial as THREE.Material | undefined)?.dispose();
      }
      for (const k of acquired) geometryPool.release(k);
      body.geometry = baseGeo;
      if (skinKey) geometryPool.release(skinKey);
    };
  }, [body, structSig]);

  // Màu và chất liệu: chỉ cập nhật uniform, không dựng lại.
  useEffect(() => {
    const current = lookRef.current;
    if (!current) return;
    for (const s of shellsRef.current) applyColors(s, current);
  }, [colorSig, structSig]);

  // Morph thân từ thanh hình thể, ghi mỗi khung sau MpfbAvatar.
  useFrame(() => {
    if (!driveBodyMorphs || !body) return;
    const w = weightsRef.current;
    if (!w) return;
    writeBodyMorphs(body.morphTargetInfluences, body.morphTargetDictionary, w);
  });

  return <MpfbAccessories body={body} look={look} />;
}
