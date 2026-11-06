// Phòng họp kính: bàn họp dài, ghế có lưng và tay, màn hình trình chiếu, đồng hồ treo tường,
// bảng trắng, cây cảnh góc phòng và đèn trần dạng dải.
// Gốc = tâm phòng trên sàn. Bàn dựng theo trục dài (x). Nếu phòng dài theo z thì xoay cả nhóm 90 độ.
// 3 draw call cố định, không phụ thuộc sức chứa: đồ đạc gộp một mesh màu đỉnh, màn chiếu, đèn dải.

import { useMemo } from 'react';
import * as THREE from 'three';
import { palettes } from './palette';
import {
  canvasTexture,
  DecorBase,
  Disposable,
  fitFont,
  Inst,
  instanced,
  mergedMesh,
  UNIT_BOX,
  UNIT_CYL,
  UNIT_PLANE,
  UNIT_SPHERE,
  useDisposeOnChange,
} from './shared';

export interface MeetingRoomDetailProps extends DecorBase {
  /** Chiều x của phòng (m). Mặc định 5. */
  width?: number;
  /** Chiều z của phòng (m). Mặc định 4,7. */
  depth?: number;
  /** Sức chứa (số chỗ ngồi). Mặc định 8. */
  capacity?: number;
  /** Chữ trên màn hình trình chiếu. */
  title?: string;
  /** Có cây cảnh góc phòng. Mặc định true. */
  plants?: boolean;
}

const PAL = palettes['office-day'];
const WALL_OFFSET = 0.12; // khoảng cách từ tường tới mặt sau màn hình TV (m)
const TABLE_TOP = 0.74; // độ cao mặt bàn họp (m)
const SIGNS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/** Nội dung màn hình trình chiếu: nền xanh đậm, tiêu đề và thanh minh họa. */
function drawSlide(title: string) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
    ctx.fillStyle = '#0b1f3a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    fitFont(ctx, title, w - 80, 60);
    ctx.fillText(title, 40, h * 0.28);
    const bars = ['#38bdf8', '#34d399', '#fbbf24'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = bars[i];
      ctx.fillRect(40, h * 0.5 + i * 36, (w - 80) * (0.9 - i * 0.22), 22);
    }
  };
}

interface Batches {
  box: Inst[];
  cyl: Inst[];
  sph: Inst[];
}

function buildMeeting(width: number, depth: number, capacity: number, title: string, plants: boolean): Built {
  // Trục dài là x. Mọi tọa độ dưới đây nằm trong khung đã xoay này.
  const L = Math.max(width, depth);
  const W = Math.min(width, depth);
  const perSide = Math.max(1, Math.ceil(capacity / 2));
  const tableLen = Math.max(1, Math.min(L - 1.4, perSide * 0.8));
  const tableW = Math.max(0.8, Math.min(1.2, W - 2.0));
  const seatGap = tableLen / perSide;
  const b: Batches = { box: [], cyl: [], sph: [] };

  // Bàn họp: mặt gỗ dày 0,04 m và 4 chân kim loại.
  b.box.push({ p: [0, TABLE_TOP - 0.02, 0], s: [tableLen, 0.04, tableW], c: PAL.wood });
  for (const [sx, sz] of SIGNS) {
    b.cyl.push({
      p: [sx * (tableLen / 2 - 0.15), (TABLE_TOP - 0.04) / 2, sz * (tableW / 2 - 0.12)],
      s: [0.025, TABLE_TOP - 0.04, 0.025],
      c: PAL.metal,
    });
  }

  // Ghế: đệm 0,46 m, lưng cao 0,50 m, hai tay, trụ và đế tròn. Ghế nằm hai bên bàn, lưng quay ra ngoài.
  for (const side of [-1, 1]) {
    const zc = side * (tableW / 2 + 0.36);
    for (let k = 0; k < perSide; k++) {
      const x = -tableLen / 2 + (k + 0.5) * seatGap;
      b.box.push({ p: [x, 0.43, zc], s: [0.46, 0.06, 0.46], c: PAL.fabric });
      b.box.push({ p: [x, 0.71, zc + side * 0.205], s: [0.46, 0.5, 0.05], c: PAL.fabric });
      b.box.push({ p: [x - 0.235, 0.57, zc], s: [0.05, 0.22, 0.4], c: PAL.fabric });
      b.box.push({ p: [x + 0.235, 0.57, zc], s: [0.05, 0.22, 0.4], c: PAL.fabric });
      b.cyl.push({ p: [x, 0.215, zc], s: [0.03, 0.39, 0.03], c: PAL.metal });
      b.cyl.push({ p: [x, 0.01, zc], s: [0.22, 0.02, 0.22], c: PAL.metal });
    }
  }

  // Màn hình trình chiếu: khung đen 2,2 x 1,25 m trên tường trong (z âm), mặt hướng +z.
  const backZ = -W / 2 + WALL_OFFSET;
  b.box.push({ p: [0, 1.5, backZ], s: [2.2, 1.25, 0.05], c: '#111317' });

  // Đồng hồ treo tường bên trái màn hình: đĩa Ø 0,4 m, dày 0,03 m, kim giờ và kim phút.
  const clockX = -L / 2 + 0.7;
  const clockZ = -W / 2 + 0.1;
  b.cyl.push({ p: [clockX, 1.5, clockZ], s: [0.2, 0.03, 0.2], r: [Math.PI / 2, 0, 0], c: '#f8fafc' });
  const hand = (theta: number, len: number, thick: number, color: string): void => {
    b.box.push({
      p: [clockX + (Math.sin(theta) * len) / 2, 1.5 + (Math.cos(theta) * len) / 2, clockZ + 0.025],
      s: [thick, len, 0.006],
      r: [0, 0, -theta],
      c: color,
    });
  };
  hand((Math.PI * 5) / 3, 0.11, 0.014, '#111827'); // kim giờ, 10 giờ
  hand(Math.PI / 3, 0.16, 0.008, '#111827'); // kim phút, 2 phút

  // Bảng trắng trên tường đối diện (z dương): khung nhôm 1,9 x 1,2 m và mặt trắng.
  const boardZ = W / 2 - 0.06;
  b.box.push({ p: [0, 1.5, boardZ], s: [1.9, 1.2, 0.03], c: PAL.metal });
  b.box.push({ p: [0, 1.5, boardZ - 0.02], s: [1.8, 1.1, 0.01], c: '#f8fafc' });

  // Cây cảnh góc phòng (+x, -z): chậu Ø 0,36 m cao 0,35 m và tán lá là các khối cầu.
  if (plants) {
    const px = L / 2 - 0.35;
    const pz = -W / 2 + 0.35;
    b.cyl.push({ p: [px, 0.175, pz], s: [0.18, 0.35, 0.18], c: '#e9e4da' });
    b.sph.push({ p: [px, 0.62, pz], s: [0.22, 0.24, 0.22], c: PAL.plant });
    b.sph.push({ p: [px + 0.12, 0.84, pz - 0.06], s: [0.17, 0.19, 0.17], c: '#4caf62' });
    b.sph.push({ p: [px - 0.12, 0.82, pz + 0.08], s: [0.16, 0.18, 0.16], c: '#2f8a48' });
  }

  // Đèn trần dạng dải: hai dải dài dọc bàn, cách trần 0,08 m.
  const lights: Inst[] = [
    { p: [0, 2.72, -W / 4], s: [L - 1.0, 0.03, 0.12] },
    { p: [0, 2.72, W / 4], s: [L - 1.0, 0.03, 0.12] },
  ];

  // Khối, trụ, cầu gộp chung một mesh màu đỉnh (một draw call), vật liệu dùng chung.
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.08 });
  const screenTex = canvasTexture(512, 300, drawSlide(title));
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
  const lightMat = new THREE.MeshBasicMaterial({ color: '#fff4d6' });

  const solid = mergedMesh(solidMat, [
    [UNIT_BOX, b.box],
    [UNIT_CYL, b.cyl],
    [UNIT_SPHERE, b.sph],
  ]);
  const meshes = [
    solid,
    // Mặt trình chiếu: một bản sao, đặt trước khung TV 0,0275 m.
    instanced(UNIT_PLANE, screenMat, [{ p: [0, 1.5, backZ + 0.0275], s: [2.12, 1.17, 1] }]),
    instanced(UNIT_BOX, lightMat, lights),
  ].filter((m): m is THREE.Mesh => m !== null);

  const owned: Disposable[] = [solidMat, screenTex, screenMat, lightMat];
  if (solid) owned.push(solid.geometry);
  return { meshes, owned, rotated: width < depth };
}

interface Built {
  meshes: THREE.Mesh[];
  owned: Disposable[];
  rotated: boolean;
}

/** Phòng họp kính. Dùng cho mr1, mr2, mr3, và cũng dùng cho phòng đặt được như phòng họp. */
export function MeetingRoomDetail({
  position = [0, 0, 0],
  scale = 1,
  rotationY = 0,
  width = 5,
  depth = 4.7,
  capacity = 8,
  title = 'Trình chiếu',
  plants = true,
}: MeetingRoomDetailProps) {
  const built = useMemo(
    () => buildMeeting(width, depth, capacity, title, plants),
    [width, depth, capacity, title, plants],
  );
  useDisposeOnChange(built.owned);
  // Phòng dài theo z thì xoay 90 độ để trục dài của nội dung trùng với trục dài của phòng.
  const turn = built.rotated ? Math.PI / 2 : 0;
  return (
    <group position={position} rotation={[0, rotationY + turn, 0]} scale={[scale, scale, scale]}>
      {built.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}
