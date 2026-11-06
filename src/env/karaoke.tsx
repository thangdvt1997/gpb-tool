// Phòng karaoke kính: micro trên chân đứng, màn hình LED nhỏ với ba khối phát sáng,
// dải đèn LED dưới trần, sofa dài, bàn nhỏ, gương mờ trên tường trái và bóng đèn quả cầu.
// Gốc = tâm phòng trên sàn. Tường sau (z âm) có màn hình. Khoảng 7 draw call cố định.

import { useMemo } from 'react';
import * as THREE from 'three';
import {
  canvasTexture,
  DecorBase,
  Disposable,
  fitFont,
  Inst,
  instanced,
  makeRng,
  UNIT_BOX,
  UNIT_CYL,
  UNIT_PLANE,
  UNIT_SPHERE,
  useDisposeOnChange,
} from './shared';

export interface KaraokeRoomDetailProps extends DecorBase {
  /** Chiều x của phòng (m). Mặc định 4,4. */
  width?: number;
  /** Chiều z của phòng (m). Mặc định 3,2. */
  depth?: number;
  seed?: number;
}

const SOFA_C = '#4c1d95';
const WOOD = '#8a5a3c';
const METAL_DARK = '#2d3748';
const LED_COLS = ['#a855f7', '#22d3ee', '#ec4899', '#a855f7'];
const BAR_COLS = ['#ef4444', '#22c55e', '#3b82f6'];

/** Màn hình LED: nền tối, dòng lời hát nổi bật và thanh cao độ. */
function drawKaraoke(seed: number) {
  const rng = makeRng(seed + 7);
  return (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
    ctx.fillStyle = '#0b0f1a';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#facc15';
    fitFont(ctx, 'Hát theo nhịp', w - 60, 52);
    ctx.fillText('Hát theo nhịp', w / 2, h * 0.32);
    ctx.fillStyle = '#64748b';
    fitFont(ctx, 'Dòng tiếp theo...', w - 60, 30, 'normal');
    ctx.fillText('Dòng tiếp theo...', w / 2, h * 0.56);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 3 === 0 ? '#f472b6' : '#22d3ee';
      const bh = 10 + rng() * 60;
      ctx.fillRect(30 + i * 28, h * 0.92 - bh, 16, bh);
    }
  };
}

interface Built {
  meshes: THREE.InstancedMesh[];
  owned: Disposable[];
  screenMat: THREE.MeshBasicMaterial;
  mirrorMat: THREE.MeshStandardMaterial;
}

function buildKaraoke(width: number, depth: number, seed: number): Built {
  const backZ = -depth / 2;
  const leftX = -width / 2;
  const sofaLen = Math.min(2.6, width - 1.6);
  const micZ = depth / 2 - 0.9;
  const tableZ = backZ + 1.4;
  const ceilY = 2.72;
  const box: Inst[] = [];
  const cyl: Inst[] = [];
  const sph: Inst[] = [];
  const bulb: Inst[] = [];
  const basic: Inst[] = [];

  // Sofa dài sát tường sau: đệm, lưng và hai tay.
  box.push({ p: [0, 0.21, backZ + 0.55], s: [sofaLen, 0.42, 0.85], c: SOFA_C });
  box.push({ p: [0, 0.67, backZ + 0.09], s: [sofaLen, 0.5, 0.18], c: SOFA_C });
  box.push({ p: [-(sofaLen / 2 - 0.08), 0.545, backZ + 0.55], s: [0.16, 0.25, 0.85], c: SOFA_C });
  box.push({ p: [sofaLen / 2 - 0.08, 0.545, backZ + 0.55], s: [0.16, 0.25, 0.85], c: SOFA_C });

  // Bàn nhỏ Ø 0,6 m cao 0,45 m và một chai nước.
  cyl.push({ p: [0, 0.435, tableZ], s: [0.3, 0.03, 0.3], c: WOOD });
  cyl.push({ p: [0, 0.21, tableZ], s: [0.04, 0.42, 0.04], c: METAL_DARK });
  cyl.push({ p: [0.08, 0.5, tableZ], s: [0.03, 0.1, 0.03], c: '#0ea5e9' });

  // Hai micro trên chân đứng: đế Ø 0,24 m, cần cao 1,1 m, đầu micro Ø 0,06 m.
  for (const mx of [-0.9, 0.9]) {
    cyl.push({ p: [mx, 0.01, micZ], s: [0.12, 0.02, 0.12], c: METAL_DARK });
    cyl.push({ p: [mx, 0.55, micZ], s: [0.01, 1.1, 0.01], c: METAL_DARK });
    sph.push({ p: [mx, 1.12, micZ], s: [0.03, 0.03, 0.03], c: '#cbd5e1' });
  }

  // Khung màn hình LED trên tường sau: khung đen 2,0 x 1,1 m, cao từ 1,05 m.
  box.push({ p: [0, 1.6, backZ + 0.03], s: [2.0, 1.1, 0.06], c: '#111827' });
  // Ba khối phát sáng phía trên màn hình (đỏ, xanh lá, xanh dương).
  for (let i = 0; i < BAR_COLS.length; i++) {
    basic.push({ p: [(i - 1) * 0.6, 2.22, backZ + 0.07], s: [0.4, 0.06, 0.04], c: BAR_COLS[i] });
  }

  // Dải đèn LED dưới trần chạy quanh bốn cạnh phòng, cách trần 0,05 m.
  basic.push({ p: [0, ceilY, backZ + 0.05], s: [width - 0.1, 0.04, 0.05], c: LED_COLS[0] });
  basic.push({ p: [0, ceilY, depth / 2 - 0.05], s: [width - 0.1, 0.04, 0.05], c: LED_COLS[1] });
  basic.push({ p: [leftX + 0.05, ceilY, 0], s: [0.05, 0.04, depth - 0.1], c: LED_COLS[2] });
  basic.push({ p: [-leftX - 0.05, ceilY, 0], s: [0.05, 0.04, depth - 0.1], c: LED_COLS[3] });

  // Ba bóng đèn quả cầu treo trên dây (Ø 0,12 m, dây dài 0,5 m).
  for (const bx of [-1.0, 0, 1.0]) {
    cyl.push({ p: [bx, 2.45, 0.2], s: [0.003, 0.5, 0.003], c: '#111111' });
    bulb.push({ p: [bx, 2.14, 0.2], s: [0.06, 0.06, 0.06] });
  }

  // Khung gương trên tường trái (x âm), mặt gương nằm trước khung.
  box.push({ p: [leftX + 0.02, 1.3, 0.2], s: [0.04, 1.5, 1.1], c: '#111827' });

  const boxMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  const cylMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2 });
  const sphMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 });
  const bulbMat = new THREE.MeshStandardMaterial({
    color: '#fff7e0',
    emissive: '#ffe9b0',
    emissiveIntensity: 1.2,
  });
  const basicMat = new THREE.MeshBasicMaterial();
  const screenTex = canvasTexture(512, 256, drawKaraoke(seed));
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
  const mirrorMat = new THREE.MeshStandardMaterial({ color: '#c9d1dc', roughness: 0.45, metalness: 0.5 });

  const meshes = [
    instanced(UNIT_BOX, boxMat, box),
    instanced(UNIT_CYL, cylMat, cyl),
    instanced(UNIT_SPHERE, sphMat, sph),
    instanced(UNIT_SPHERE, bulbMat, bulb),
    instanced(UNIT_BOX, basicMat, basic),
  ].filter((m): m is THREE.InstancedMesh => m !== null);

  const owned: Disposable[] = [boxMat, cylMat, sphMat, bulbMat, basicMat, screenTex, screenMat, mirrorMat];
  return { meshes, owned, screenMat, mirrorMat };
}

/** Phòng karaoke: sofa, màn hình LED, hai micro, dải đèn LED, bóng đèn quả cầu và gương mờ. */
export function KaraokeRoomDetail({
  position = [0, 0, 0],
  scale = 1,
  rotationY = 0,
  width = 4.4,
  depth = 3.2,
  seed = 21,
}: KaraokeRoomDetailProps) {
  const built = useMemo(() => buildKaraoke(width, depth, seed), [width, depth, seed]);
  useDisposeOnChange(built.owned);
  const backZ = -depth / 2;
  const leftX = -width / 2;
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      {built.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      <mesh geometry={UNIT_PLANE} material={built.screenMat} position={[0, 1.6, backZ + 0.065]} scale={[1.9, 0.98, 1]} />
      <mesh
        geometry={UNIT_PLANE}
        material={built.mirrorMat}
        position={[leftX + 0.045, 1.3, 0.2]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[1.0, 1.4, 1]}
      />
    </group>
  );
}
