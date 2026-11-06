// Trần thả tấm vuông 600 x 600 mm có khung T-bar mảnh, đèn LED panel vuông lắp âm theo lưới, cửa gió điều hoà vuông
// và khe gió chữ nhật, đầu báo khói, đầu phun (room.txt mục 2, REAL_OFFICE_STYLE.md mục 3 và 4, ảnh 19-01-02).
// Bố trí trong CEILING (officePropsLayout.ts), vẽ vào một texture lặp mỗi CEILING.periodTiles ô (mặc định 4,8 m).
// Đèn sáng nhờ emissiveMap của cùng texture, nên trần, đèn và miệng gió chỉ tốn 1 draw call.
//
// Chỉ một mặt (FrontSide, hướng xuống): khi camera ở dưới trần (đi tham quan, nhìn ngang tầm mắt) thì thấy trần đầy đủ;
// khi camera lên cao hơn trần (xem tổng thể từ trên) thì mặt sau bị loại, trần không che cảnh. Không đổ bóng,
// không nhận sự kiện chuột.

import { useMemo } from 'react';
import * as THREE from 'three';
import { canvasTexture, makeRng, useDisposeOnChange, type Disposable } from '../env/shared';
import { OFFICE_DAY_SCENE as R } from '../theme/tokens';
import { FLOOR } from './layout';
import { CEILING, CEILING_Y } from './officePropsLayout';

const PX = 1024;
const TILE = PX / CEILING.periodTiles;
const PERIOD = CEILING.tile * CEILING.periodTiles;

/** Màu từng thành phần ở bản màu và ở bản phát sáng (mask). */
const COL = {
  tile: [R.ceilingTile, '#8c8c8c'],
  speck: ['#d6d9dd', '#858585'],
  grid: [R.ceilingGrid, '#6a6a6a'],
  gridEdge: ['#b4b9bf', '#555555'],
  panelFrame: ['#e6e9ed', '#9a9a9a'],
  panel: [R.lightPanel, '#ffffff'],
  vent: [R.ceilingVent, '#707070'],
  ventDark: ['#8f949b', '#3c3c3c'],
  device: ['#f4f5f6', '#9a9a9a'],
} as const;

function drawCeiling(mask: boolean) {
  const c = (k: keyof typeof COL): string => COL[k][mask ? 1 : 0];
  return (ctx: CanvasRenderingContext2D): void => {
    // Tấm sợi khoáng trắng mờ, lốm đốm rất nhẹ.
    ctx.fillStyle = c('tile');
    ctx.fillRect(0, 0, PX, PX);
    const rng = makeRng(6060);
    ctx.fillStyle = c('speck');
    for (let k = 0; k < 2600; k++) ctx.fillRect(rng() * PX, rng() * PX, 1.5, 1.5);

    // Cửa gió vuông 600 x 600: khung, 4 lớp lá đồng tâm, 4 đường chéo góc, tấm giữa.
    for (const [i, j] of CEILING.squareVents) {
      const x0 = i * TILE;
      const y0 = j * TILE;
      ctx.fillStyle = c('vent');
      ctx.fillRect(x0 + 6, y0 + 6, TILE - 12, TILE - 12);
      ctx.strokeStyle = c('ventDark');
      ctx.lineWidth = 3;
      for (let k = 0; k < 4; k++) {
        const o = 14 + k * 11;
        ctx.strokeRect(x0 + o, y0 + o, TILE - 2 * o, TILE - 2 * o);
      }
      ctx.beginPath();
      ctx.moveTo(x0 + 14, y0 + 14);
      ctx.lineTo(x0 + 58, y0 + 58);
      ctx.moveTo(x0 + TILE - 14, y0 + 14);
      ctx.lineTo(x0 + TILE - 58, y0 + 58);
      ctx.moveTo(x0 + 14, y0 + TILE - 14);
      ctx.lineTo(x0 + 58, y0 + TILE - 58);
      ctx.moveTo(x0 + TILE - 14, y0 + TILE - 14);
      ctx.lineTo(x0 + TILE - 58, y0 + TILE - 58);
      ctx.stroke();
      ctx.fillStyle = c('vent');
      ctx.fillRect(x0 + 58, y0 + 58, TILE - 116, TILE - 116);
    }

    // Khe gió chữ nhật dài (len ô), rộng khoảng 0,15 m, 3 khe tối.
    for (const [i, j, len] of CEILING.slotVents) {
      const x0 = i * TILE + 8;
      const w = len * TILE - 16;
      const y0 = j * TILE + TILE / 2 - 16;
      ctx.fillStyle = c('vent');
      ctx.fillRect(x0, y0, w, 32);
      ctx.fillStyle = c('ventDark');
      for (let k = 0; k < 3; k++) ctx.fillRect(x0 + 6, y0 + 6 + k * 8, w - 12, 4);
    }

    // Đầu báo khói (tròn trắng) và đầu phun (chấm nhỏ) ở tâm ô.
    ctx.fillStyle = c('device');
    for (const [i, j] of CEILING.smoke) {
      ctx.beginPath();
      ctx.arc((i + 0.5) * TILE, (j + 0.5) * TILE, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = c('ventDark');
    for (const [i, j] of CEILING.sprinklers) {
      ctx.beginPath();
      ctx.arc((i + 0.5) * TILE, (j + 0.5) * TILE, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Khung xương T-bar: vạch sáng 4 px (khoảng 19 mm) có viền tối 1 px để lưới nét khi nhìn xiên.
    for (let k = 0; k <= CEILING.periodTiles; k++) {
      const p = k * TILE;
      ctx.fillStyle = c('gridEdge');
      ctx.fillRect(p - 3, 0, 6, PX);
      ctx.fillRect(0, p - 3, PX, 6);
    }
    for (let k = 0; k <= CEILING.periodTiles; k++) {
      const p = k * TILE;
      ctx.fillStyle = c('grid');
      ctx.fillRect(p - 2, 0, 4, PX);
      ctx.fillRect(0, p - 2, PX, 4);
    }

    // Đèn LED panel vuông 600 x 600 lắp âm chiếm trọn ô: viền nhôm, mặt tán quang.
    for (const [i, j] of CEILING.lights) {
      const x0 = i * TILE;
      const y0 = j * TILE;
      ctx.fillStyle = c('panelFrame');
      ctx.fillRect(x0 + 2, y0 + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = c('panel');
      ctx.fillRect(x0 + 9, y0 + 9, TILE - 18, TILE - 18);
    }
  };
}

function makeTex(mask: boolean): THREE.CanvasTexture {
  const tex = canvasTexture(PX, PX, drawCeiling(mask));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(FLOOR.width / PERIOD, FLOOR.depth / PERIOD);
  tex.anisotropy = 8;
  return tex;
}

const NO_RAYCAST = (): void => undefined;

export function OfficeCeiling() {
  const res = useMemo(() => {
    const map = makeTex(false);
    const emissiveMap = makeTex(true);
    const mat = new THREE.MeshStandardMaterial({
      map,
      emissiveMap,
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: CEILING.emissive,
      roughness: 0.9,
      metalness: 0,
      side: THREE.FrontSide,
    });
    const owned: Disposable[] = [map, emissiveMap, mat];
    return { mat, owned };
  }, []);
  useDisposeOnChange(res.owned);
  // Mặt phẳng mặc định hướng +z; quay +90° quanh x để pháp tuyến hướng xuống (-y).
  return (
    <mesh
      name="office-ceiling"
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, CEILING_Y, 0]}
      material={res.mat}
      raycast={NO_RAYCAST}
    >
      <planeGeometry args={[FLOOR.width, FLOOR.depth]} />
    </mesh>
  );
}
