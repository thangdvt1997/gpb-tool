// Góc trò chơi: bàn cờ caro 15x15 (lưới trên mặt bàn, quân X và O), bàn đố vui 4 ghế,
// bảng điểm trên tường, thẻ bài tròn trên bàn và đèn bàn.
// Gốc = tâm góc trên sàn. Khu khoảng 3,2 x 2,2 m, mặt bàn cao 0,75 m.
// Lưới caro là CanvasTexture trên một mặt phẳng. Quân cờ, ghế và thẻ bài là InstancedMesh.

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
  pick,
  UNIT_BOX,
  UNIT_CYL,
  UNIT_PLANE,
  UNIT_SPHERE,
  useDisposeOnChange,
} from './shared';

export interface GameCornerDetailProps extends DecorBase {
  /** Hạt giống cho vị trí quân cờ và màu thẻ bài. */
  seed?: number;
}

const WOOD = '#8a5a3c';
const METAL = '#2d3748';
const FABRIC = '#3b5b7a';
const TOP = 0.75; // độ cao mặt bàn (m)
const CARO_X = -0.9; // tâm bàn caro (x)
const QUIZ_X = 0.65; // tâm bàn đố vui (x)
const CARO_SIZE = 0.92; // cạnh lưới caro (m), 15 ô
const CELL = CARO_SIZE / 15;
const CARD_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];
const STOOLS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const CARDS: ReadonlyArray<readonly [number, number]> = [
  [-0.2, -0.1],
  [0.05, 0.12],
  [0.18, -0.15],
  [-0.05, 0.25],
];

/** Lưới caro 15 x 15: nền kem, 16 đường kẻ tại biên các ô. */
function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#f3e6c8';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#6b4f2a';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 15; i++) {
    const p = (i * w) / 15;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(w, p);
    ctx.stroke();
  }
}

/** Bảng điểm: tiêu đề, tỉ số và số lượt. */
function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#facc15';
  fitFont(ctx, 'ĐỐ VUI', w - 60, 52);
  ctx.fillText('ĐỐ VUI', w / 2, h * 0.2);
  ctx.fillStyle = '#f8fafc';
  fitFont(ctx, 'X  2 : 1  O', w - 60, 110);
  ctx.fillText('X  2 : 1  O', w / 2, h * 0.55);
  ctx.fillStyle = '#94a3b8';
  fitFont(ctx, 'Lượt 3 / 10', w - 60, 34, 'normal');
  ctx.fillText('Lượt 3 / 10', w / 2, h * 0.85);
}

/** Ghế có lưng cho bàn caro. Lưng quay ra xa bàn theo dấu facing. */
function addChair(box: Inst[], cyl: Inst[], x: number, z: number, facing: number): void {
  box.push({ p: [x, 0.45, z], s: [0.4, 0.05, 0.4], c: FABRIC });
  box.push({ p: [x, 0.675, z + facing * 0.2], s: [0.4, 0.4, 0.05], c: FABRIC });
  cyl.push({ p: [x, 0.2125, z], s: [0.03, 0.425, 0.03], c: METAL });
  cyl.push({ p: [x, 0.01, z], s: [0.2, 0.02, 0.2], c: METAL });
}

interface Built {
  meshes: THREE.InstancedMesh[];
  owned: Disposable[];
}

function buildGame(seed: number): Built & { gridMat: THREE.MeshBasicMaterial; boardMat: THREE.MeshBasicMaterial } {
  const rng = makeRng(seed);
  const box: Inst[] = [];
  const cyl: Inst[] = [];
  const glow: Inst[] = [];

  // Bàn caro vuông 1,0 m, chân trụ và đế tròn. Mặt bàn ở độ cao TOP.
  box.push({ p: [CARO_X, TOP - 0.02, 0], s: [1.0, 0.04, 1.0], c: WOOD });
  cyl.push({ p: [CARO_X, (TOP - 0.04) / 2, 0], s: [0.05, TOP - 0.04, 0.05], c: METAL });
  cyl.push({ p: [CARO_X, 0.01, 0], s: [0.3, 0.02, 0.3], c: METAL });
  addChair(box, cyl, CARO_X, -0.8, -1);
  addChair(box, cyl, CARO_X, 0.8, 1);

  // Quân X (hai thanh chéo) và O (đĩa tròn) đặt ở ô ngẫu nhiên, không trùng ô.
  const used = new Set<number>();
  for (let k = 0; k < 7; k++) {
    let idx = Math.floor(rng() * 225);
    while (used.has(idx)) idx = (idx + 1) % 225;
    used.add(idx);
    const gx = idx % 15;
    const gy = Math.floor(idx / 15);
    const x = CARO_X + (gx - 7) * CELL;
    const z = (gy - 7) * CELL;
    if (k % 2 === 0) {
      box.push({ p: [x, TOP + 0.008, z], s: [0.04, 0.004, 0.008], r: [0, Math.PI / 4, 0], c: '#2563eb' });
      box.push({ p: [x, TOP + 0.008, z], s: [0.04, 0.004, 0.008], r: [0, -Math.PI / 4, 0], c: '#2563eb' });
    } else {
      cyl.push({ p: [x, TOP + 0.008, z], s: [0.024, 0.004, 0.024], c: '#dc2626' });
    }
  }

  // Bàn đố vui tròn Ø 1,0 m, bốn ghế đẩu, và thẻ bài tròn Ø 0,12 m trên mặt bàn.
  cyl.push({ p: [QUIZ_X, TOP - 0.02, 0], s: [0.5, 0.04, 0.5], c: WOOD });
  cyl.push({ p: [QUIZ_X, (TOP - 0.04) / 2, 0], s: [0.05, TOP - 0.04, 0.05], c: METAL });
  cyl.push({ p: [QUIZ_X, 0.01, 0], s: [0.3, 0.02, 0.3], c: METAL });
  for (const [sx, sz] of STOOLS) {
    const x = QUIZ_X + sx * 0.75;
    const z = sz * 0.75;
    cyl.push({ p: [x, 0.45, z], s: [0.18, 0.05, 0.18], c: FABRIC });
    cyl.push({ p: [x, 0.2125, z], s: [0.03, 0.425, 0.03], c: METAL });
    cyl.push({ p: [x, 0.01, z], s: [0.2, 0.02, 0.2], c: METAL });
  }
  for (const [dx, dz] of CARDS) {
    cyl.push({ p: [QUIZ_X + dx, TOP + 0.002, dz], s: [0.06, 0.004, 0.06], c: pick(rng, CARD_COLORS) });
  }

  // Bảng điểm trên tường sau (z âm): khung đen 1,6 x 0,9 m. Màn hình là mặt phẳng ở phía trước khung.
  box.push({ p: [0.2, 1.7, -1.05], s: [1.6, 0.9, 0.05], c: '#111827' });

  // Đèn bàn trên góc bàn caro: đế, cần và chụp sáng ấm (khối cầu phát sáng).
  const lampX = CARO_X - 0.35;
  const lampZ = -0.35;
  cyl.push({ p: [lampX, TOP + 0.01, lampZ], s: [0.04, 0.02, 0.04], c: METAL });
  cyl.push({ p: [lampX, TOP + 0.17, lampZ], s: [0.008, 0.3, 0.008], c: METAL });
  glow.push({ p: [lampX, TOP + 0.36, lampZ], s: [0.07, 0.05, 0.07] });

  const boxMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const cylMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2 });
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffd08a' });
  const gridTex = canvasTexture(512, 512, drawGrid);
  const gridMat = new THREE.MeshBasicMaterial({ map: gridTex });
  const boardTex = canvasTexture(512, 256, drawBoard);
  const boardMat = new THREE.MeshBasicMaterial({ map: boardTex });

  const meshes = [
    instanced(UNIT_BOX, boxMat, box),
    instanced(UNIT_CYL, cylMat, cyl),
    instanced(UNIT_SPHERE, glowMat, glow),
  ].filter((m): m is THREE.InstancedMesh => m !== null);

  const owned: Disposable[] = [boxMat, cylMat, glowMat, gridTex, gridMat, boardTex, boardMat];
  return { meshes, owned, gridMat, boardMat };
}

/** Góc trò chơi: bàn cờ caro, bàn đố vui, bảng điểm và đèn bàn. */
export function GameCornerDetail({ position = [0, 0, 0], scale = 1, rotationY = 0, seed = 13 }: GameCornerDetailProps) {
  const built = useMemo(() => buildGame(seed), [seed]);
  useDisposeOnChange(built.owned);
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      {built.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      <mesh
        geometry={UNIT_PLANE}
        material={built.gridMat}
        position={[CARO_X, TOP + 0.005, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[CARO_SIZE, CARO_SIZE, 1]}
      />
      <mesh geometry={UNIT_PLANE} material={built.boardMat} position={[0.2, 1.7, -1.0]} scale={[1.5, 0.8, 1]} />
    </group>
  );
}
