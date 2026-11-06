// Bảng giao lưu văn nghệ: khung bảng lớn có chân đứng, bảng lịch chương trình (CanvasTexture),
// lịch treo tháng (khối mỏng có CanvasTexture), băng rôn treo trên thanh ngang và hai đèn sân khấu nhỏ trên giá.
// Gốc = điểm trên sàn ở tâm bảng. Bảng có tâm cao 1,1 m (khớp với toạ độ vật thể), quay về +z trước khi áp rotationY.
// Khoảng 6 draw call cố định.

import { useMemo } from 'react';
import * as THREE from 'three';
import {
  canvasTexture,
  DecorBase,
  Disposable,
  fitFont,
  Inst,
  instanced,
  UNIT_BOX,
  UNIT_CYL,
  UNIT_PLANE,
  useDisposeOnChange,
} from './shared';

export interface EventsBoardDetailProps extends DecorBase {
  /** Chiều rộng bảng (m). Mặc định 2,0. */
  width?: number;
  /** Chiều cao bảng (m). Mặc định 2,2. */
  height?: number;
}

const BOARD_CY = 1.1; // tâm bảng tính từ sàn (m)
const FRAME = '#3f2d1e';
const METAL = '#2d3748';
const LAMP_COLS = ['#fde68a', '#93c5fd'];
const PROGRAM: ReadonlyArray<readonly [string, string]> = [
  ['18:30', 'Khai mạc'],
  ['18:45', 'Tiết mục 1 · Ca khúc'],
  ['19:15', 'Tiết mục 2 · Múa'],
  ['19:45', 'Bình chọn khán giả'],
  ['20:00', 'Bế mạc'],
];
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/** Mặt bảng: tiêu đề tím, lịch chương trình và ô đăng ký tiết mục. */
function drawBoardFace(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#fff7ed';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#7c3aed';
  ctx.fillRect(0, 0, w, h * 0.16);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, 'Lịch chương trình', w - 60, 46);
  ctx.fillText('Lịch chương trình', w / 2, h * 0.08);

  ctx.textAlign = 'left';
  PROGRAM.forEach(([time, what], i) => {
    const y = h * 0.26 + i * h * 0.1;
    ctx.fillStyle = '#7c3aed';
    fitFont(ctx, time, 110, 30);
    ctx.fillText(time, 40, y);
    ctx.fillStyle = '#1f2937';
    fitFont(ctx, what, w - 220, 30, 'normal');
    ctx.fillText(what, 170, y);
  });

  ctx.fillStyle = '#ede9fe';
  ctx.fillRect(30, h * 0.8, w - 60, h * 0.16);
  ctx.fillStyle = '#5b21b6';
  ctx.textAlign = 'center';
  fitFont(ctx, 'Đăng ký tiết mục: 3 chỗ trống', w - 100, 28, 'normal');
  ctx.fillText('Đăng ký tiết mục: 3 chỗ trống', w / 2, h * 0.88);
}

/** Lịch treo tháng 11 (bắt đầu thứ Hai, ngày 1 là Chủ nhật), đánh dấu ngày 6. */
function drawCalendar(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(0, 0, w, h * 0.22);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, 'Tháng 11', w - 30, 46);
  ctx.fillText('Tháng 11', w / 2, h * 0.11);

  const cw = w / 7;
  ctx.fillStyle = '#6b7280';
  ctx.font = 'bold 22px sans-serif';
  WEEKDAYS.forEach((d, i) => {
    ctx.fillText(d, cw * (i + 0.5), h * 0.3);
  });

  const rowH = h * 0.1;
  for (let day = 1; day <= 30; day++) {
    const slot = day - 1 + 6;
    const col = slot % 7;
    const row = Math.floor(slot / 7);
    const cx = cw * (col + 0.5);
    const cy = h * 0.36 + (row + 0.5) * rowH;
    if (day === 6) {
      ctx.fillStyle = '#fee2e2';
      ctx.beginPath();
      ctx.arc(cx, cy, rowH * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#111827';
    ctx.font = '24px sans-serif';
    ctx.fillText(String(day), cx, cy);
  }
}

/** Băng rôn đỏ có viền vàng và dòng chữ tiêu đề. */
function drawBanner(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#fde68a';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = '#fde68a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, 'GIAO LƯU VĂN NGHỆ', w - 80, 88);
  ctx.fillText('GIAO LƯU VĂN NGHỆ', w / 2, h / 2);
}

/** Bảng giao lưu văn nghệ kèm lịch treo, băng rôn và đèn sân khấu. */
export function EventsBoardDetail({
  position = [0, 0, 0],
  scale = 1,
  rotationY = 0,
  width = 2.0,
  height = 2.2,
}: EventsBoardDetailProps) {
  const res = useMemo(() => {
    const boxMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    const cylMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.3 });
    const lampMat = new THREE.MeshBasicMaterial();

    // Khung gỗ, chân đứng, khung lịch treo, thanh treo băng rôn.
    const box: Inst[] = [
      { p: [0, BOARD_CY, -0.02], s: [width + 0.12, height + 0.12, 0.06], c: FRAME },
      { p: [-0.8, 0.025, 0], s: [0.06, 0.05, 0.5], c: FRAME },
      { p: [0.8, 0.025, 0], s: [0.06, 0.05, 0.5], c: FRAME },
      { p: [-1.35, 1.5, 0.02], s: [0.62, 0.82, 0.02], c: '#7f1d1d' },
      { p: [0, 2.62, 0.04], s: [width + 0.6, 0.03, 0.03], c: FRAME },
    ];

    // Hai đèn sân khấu: giá Ø 0,03 m cao 1,3 m, đế Ø 0,4 m, đầu đèn Ø 0,18 m cao 0,16 m (phát sáng).
    const cyl: Inst[] = [];
    const lamps: Inst[] = [];
    [-1.1, 1.1].forEach((x, i) => {
      cyl.push({ p: [x, 0.01, 1.0], s: [0.2, 0.02, 0.2], c: METAL });
      cyl.push({ p: [x, 0.65, 1.0], s: [0.015, 1.3, 0.015], c: METAL });
      lamps.push({ p: [x, 1.38, 1.0], s: [0.09, 0.16, 0.09], c: LAMP_COLS[i] });
    });

    const boardTex = canvasTexture(512, 560, drawBoardFace);
    const boardMat = new THREE.MeshBasicMaterial({ map: boardTex });
    const calTex = canvasTexture(280, 380, drawCalendar);
    const calMat = new THREE.MeshBasicMaterial({ map: calTex });
    const banTex = canvasTexture(1024, 128, drawBanner);
    const banMat = new THREE.MeshBasicMaterial({ map: banTex });

    const meshes = [
      instanced(UNIT_BOX, boxMat, box),
      instanced(UNIT_CYL, cylMat, cyl),
      instanced(UNIT_CYL, lampMat, lamps),
    ].filter((m): m is THREE.InstancedMesh => m !== null);

    const owned: Disposable[] = [boxMat, cylMat, lampMat, boardTex, boardMat, calTex, calMat, banTex, banMat];
    return { meshes, owned, boardMat, calMat, banMat };
  }, [width, height]);
  useDisposeOnChange(res.owned);

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      {res.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      <mesh geometry={UNIT_PLANE} material={res.boardMat} position={[0, BOARD_CY, 0.035]} scale={[width, height, 1]} />
      <mesh geometry={UNIT_PLANE} material={res.calMat} position={[-1.35, 1.5, 0.033]} scale={[0.56, 0.76, 1]} />
      <mesh
        geometry={UNIT_PLANE}
        material={res.banMat}
        position={[0, 2.45, 0.05]}
        scale={[width + 0.6, (width + 0.6) / 8, 1]}
      />
    </group>
  );
}
