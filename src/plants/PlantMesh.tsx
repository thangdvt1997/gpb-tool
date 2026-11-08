import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Batch } from '../scene/entry/merge';
import { useReducedMotion } from '../settings/reducedMotion';
import { PlantLabel } from './PlantLabel';
import { PLANT_LIMITS, clamp, safeCount } from './types';
import type { Plant, PlantStage } from './types';
import { LOD_BASE } from '../quality/graphics';

export interface PlantMeshProps {
  plant: Plant;
  /** Vị trí chân chậu trong hệ thế giới (mét). */
  position: [number, number, number];
  /** Hệ số phóng to thêm, nhân với hệ số theo tuổi. Mặc định 1. */
  scale?: number;
  selected?: boolean;
  hovered?: boolean;
  /** Gọi với mã cây khi bấm vào cây. */
  onClick?: (id: string) => void;
}

type V3 = [number, number, number];
interface LeafSlot {
  pos: V3;
  rot: V3;
}

// Kích thước chung cho mọi cây (mét).
const POT_H = 0.2;
const POT_TOP_R = 0.17;
const POT_BOTTOM_R = 0.13;
const SOIL_H = 0.02;
const LEAF_SCALE: V3 = [0.14, 0.02, 0.07];
const GOLDEN_ANGLE = 2.399963;

/** Chiều cao thân theo giai đoạn (mét). */
const STAGE_STEM: Record<PlantStage, number> = {
  seedling: 0.12,
  growing: 0.28,
  flowering: 0.36,
  mature: 0.44,
  wilted: 0.3,
};

/** Tuổi (ngày) để cây đạt kích thước tối đa. Cây mới nhỏ hơn, tối thiểu 0.6 lần. */
const AGE_FULL_DAYS = 90;

const COLOR = {
  pot: '#b86b4b',
  soil: '#3b2a20',
  stem: '#5f7f4a',
  leafHealthy: new THREE.Color('#3f8f4e'),
  leafStressed: new THREE.Color('#a08a3e'),
  flower: '#e58fb0',
  pest: '#141414',
  select: '#4f8cff',
  hover: '#ffffff',
};

/** Hình học dùng chung cho mọi cây, tạo một lần khi nạp module. */
const GEO = {
  pot: new THREE.CylinderGeometry(POT_TOP_R, POT_BOTTOM_R, POT_H, 16),
  soil: new THREE.CylinderGeometry(POT_TOP_R - 0.01, POT_TOP_R - 0.01, SOIL_H, 16),
  stem: new THREE.CylinderGeometry(0.012, 0.018, 1, 6),
  leaf: new THREE.SphereGeometry(0.5, 8, 6),
  flower: new THREE.SphereGeometry(0.03, 8, 6),
  pest: new THREE.SphereGeometry(0.012, 6, 4),
};

interface PlantMaterials {
  /** Riêng từng cây: phát sáng khi chọn hoặc rê chuột. */
  pot: THREE.MeshStandardMaterial;
  /** Riêng từng cây: màu theo sức khỏe. */
  leaf: THREE.MeshStandardMaterial;
}

/** Vật liệu riêng cho mỗi cây. Được giải phóng khi cây unmount. */
function createMaterials(): PlantMaterials {
  return {
    pot: new THREE.MeshStandardMaterial({ color: COLOR.pot, roughness: 0.85 }),
    leaf: new THREE.MeshStandardMaterial({ color: COLOR.leafHealthy, roughness: 0.6, side: THREE.DoubleSide }),
  };
}

/** Đất, thân, hoa, sâu: màu đỉnh, dùng chung cho mọi cây (không dispose). */
const REST_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });

/** Đất, thân, hoa và sâu gộp một hình học tĩnh (một draw call). Người gọi dispose. */
function buildRest(stemH: number, flowers: readonly V3[], pests: readonly V3[]): THREE.BufferGeometry | null {
  const b = new Batch();
  b.add(GEO.soil, null, [0, POT_H - SOIL_H / 2, 0], [1, 1, 1], COLOR.soil);
  b.add(GEO.stem, null, [0, POT_H + stemH / 2, 0], [1, stemH, 1], COLOR.stem);
  for (const p of flowers) b.add(GEO.flower, null, p, [1, 1, 1], COLOR.flower);
  for (const p of pests) b.add(GEO.pest, null, p, [1, 1, 1], COLOR.pest);
  return b.build();
}

/** Mọi lá của một cây trong một InstancedMesh (một draw call). */
function buildLeaves(slots: readonly LeafSlot[], mat: THREE.Material): THREE.InstancedMesh | null {
  if (slots.length === 0) return null;
  const mesh = new THREE.InstancedMesh(GEO.leaf, mat, slots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(...LEAF_SCALE);
  slots.forEach((l, i) => {
    q.setFromEuler(e.set(l.rot[0], l.rot[1], l.rot[2]));
    mesh.setMatrixAt(i, m.compose(p.set(l.pos[0], l.pos[1], l.pos[2]), q, s));
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Lá xếp xoắn ốc quanh thân. Lá rũ thì nghiêng xuống. */
function leafSlots(n: number, stemH: number, droop: boolean): LeafSlot[] {
  const out: LeafSlot[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * GOLDEN_ANGLE;
    const along = 0.3 + (0.65 * (i + 0.5)) / n;
    const r = 0.06 + 0.015 * (i % 2);
    out.push({
      pos: [Math.cos(a) * r, POT_H + stemH * along, Math.sin(a) * r],
      rot: [0, -a, droop ? -0.7 : 0.35],
    });
  }
  return out;
}

/** Hoa cụm trên đỉnh thân. */
function flowerSlots(n: number, stemH: number): V3[] {
  return Array.from({ length: n }, (_, i): V3 => {
    const a = i * 2.1 + 0.4;
    return [Math.cos(a) * 0.035, POT_H + stemH + 0.03 + (i % 2) * 0.025, Math.sin(a) * 0.035];
  });
}

/** Sâu nằm rải trên tán lá. */
function pestSlots(n: number, stemH: number): V3[] {
  return Array.from({ length: n }, (_, i): V3 => {
    const a = i * 1.7 + 1.1;
    return [Math.cos(a) * 0.11, POT_H + stemH * (0.4 + 0.12 * (i % 4)), Math.sin(a) * 0.11];
  });
}

function ageScale(ageDays: number): number {
  const t = Number.isFinite(ageDays) ? clamp(ageDays / AGE_FULL_DAYS, 0, 1) : 0;
  return 0.6 + 0.5 * t;
}

/**
 * Chỉ có khi cây đang héo: lá xoay nhẹ quanh thân. Không mount khi cây khỏe,
 * nên các cây khác không có vòng lặp khung hình.
 */
function LeafSway({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (g) g.rotation.y = Math.sin(state.clock.elapsedTime * 0.9) * 0.08;
  });
  return <group ref={ref}>{children}</group>;
}

function PlantMeshBase({ plant, position, scale = 1, selected = false, hovered = false, onClick }: PlantMeshProps) {
  const mats = useMemo(createMaterials, []);

  useEffect(() => {
    return () => {
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [mats]);

  const health = Number.isFinite(plant.health) ? clamp(plant.health, 0, 100) : 0;
  const stemH = STAGE_STEM[plant.stage] ?? STAGE_STEM.growing;
  const droop = plant.status === 'wilting';
  // Dữ liệu có tới 24 lá, nhưng chỉ vẽ tối đa 12.
  const leafN = Math.min(safeCount(plant.leaves, PLANT_LIMITS.maxLeaves), PLANT_LIMITS.maxLeavesDrawn);
  const flowerN = safeCount(plant.flowers, PLANT_LIMITS.maxFlowers);
  const pestN = safeCount(plant.pests, PLANT_LIMITS.maxPests);

  const leaves = useMemo(() => leafSlots(leafN, stemH, droop), [leafN, stemH, droop]);
  const flowers = useMemo(() => flowerSlots(flowerN, stemH), [flowerN, stemH]);
  const pests = useMemo(() => pestSlots(pestN, stemH), [pestN, stemH]);

  // Đổi màu lá theo sức khỏe, chỉ chạy khi dữ liệu đổi.
  useLayoutEffect(() => {
    mats.leaf.color.copy(COLOR.leafHealthy).lerp(COLOR.leafStressed, 1 - health / 100);
  }, [mats, health]);

  // Viền sáng khi đang chọn hoặc rê chuột, làm bằng phát sáng của chậu.
  useLayoutEffect(() => {
    const pot = mats.pot;
    if (selected) {
      pot.emissive.set(COLOR.select);
      pot.emissiveIntensity = 0.35;
    } else if (hovered) {
      pot.emissive.set(COLOR.hover);
      pot.emissiveIntensity = 0.18;
    } else {
      pot.emissive.set(0x000000);
      pot.emissiveIntensity = 0;
    }
  }, [mats, selected, hovered]);

  const reduceMotion = useReducedMotion();
  const sway = droop && !reduceMotion;
  const groupScale = ageScale(plant.ageDays) * scale;

  const leafMesh = useMemo(() => buildLeaves(leaves, mats.leaf), [leaves, mats]);
  useEffect(() => () => { leafMesh?.dispose(); }, [leafMesh]);
  const rest = useMemo(() => buildRest(stemH, flowers, pests), [stemH, flowers, pests]);
  useEffect(() => () => rest?.dispose(), [rest]);
  const leafMeshes = leafMesh ? <primitive object={leafMesh} /> : null;

  const handleClick = onClick
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick(plant.id);
      }
    : undefined;

  return (
    <group position={position} scale={groupScale} onClick={handleClick} userData={{ lodDetail: LOD_BASE.plant }}>
      <mesh geometry={GEO.pot} material={mats.pot} position={[0, POT_H / 2, 0]} />
      {rest && <mesh geometry={rest} material={REST_MAT} />}
      {sway ? <LeafSway>{leafMeshes}</LeafSway> : <group>{leafMeshes}</group>}
      <PlantLabel plant={plant} y={POT_H + stemH + 0.14} visible={hovered || selected} />
    </group>
  );
}

/**
 * Một cây trong scene. Tối đa 3 draw call mỗi cây: chậu, lá (InstancedMesh, tối đa 12 lá),
 * phần còn lại gộp một mesh màu đỉnh (đất, thân, tối đa 8 hoa, 5 sâu).
 * Hình học đơn vị dùng chung giữa các cây; vật liệu chậu và lá riêng, giải phóng khi unmount.
 */
export const PlantMesh = memo(PlantMeshBase, (a, b) =>
  a.plant === b.plant &&
  a.position[0] === b.position[0] &&
  a.position[1] === b.position[1] &&
  a.position[2] === b.position[2] &&
  a.scale === b.scale &&
  a.selected === b.selected &&
  a.hovered === b.hovered &&
  a.onClick === b.onClick,
);
