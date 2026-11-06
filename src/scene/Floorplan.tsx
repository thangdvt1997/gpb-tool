import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ZoneObject } from '../content/types';
import { canvasTexture, makeRng } from '../env/shared';
import { OFFICE_DAY_SCENE as R } from '../theme/tokens';
import { stateOf, useScene, type ObjState } from './context';
import { InstancedBoxes, type BoxItem } from './InstancedBoxes';
import { FLOOR, OUTER_WALL, toWorldX, toWorldZ } from './layout';
import { OfficeCeiling } from './OfficeCeiling';
import { OFFICE_L_PLAN, OFFICE_L_POLYGON } from './officeBounds';
import { useOfficeEnvMap } from './officeEnv';
import { OfficeProps } from './OfficeProps';

/** Tường sơn trắng mờ như ảnh văn phòng thật (REAL_OFFICE_STYLE.md mục 3). */
const WALL_COLOR = R.wallPaint;
const T = OUTER_WALL.thickness;
const H = OUTER_WALL.height;

/**
 * Tường ngoài 0.3 m, cao 3.2 m, đặt sát mép trong của sàn, chỉ trên các cạnh chữ L trùng mép tòa nhà
 * (Bắc x 0–14.5, Tây, Nam x 0–45.1). Cạnh trong của L là đường khoanh phạm vi, không dựng tường.
 */
const OUTER_WALLS: BoxItem[] = OFFICE_L_PLAN.flatMap(([ax, ay], i): BoxItem[] => {
  const [bx, by] = OFFICE_L_PLAN[(i + 1) % OFFICE_L_PLAN.length];
  if (ay === by && (ay === 0 || ay === FLOOR.depth)) {
    const z = ay === 0 ? toWorldZ(0) + T / 2 : toWorldZ(FLOOR.depth) - T / 2;
    const len = Math.abs(bx - ax);
    return [{ pos: [toWorldX((ax + bx) / 2), H / 2, z], size: [len, H, T], color: WALL_COLOR }];
  }
  if (ax === bx && (ax === 0 || ax === FLOOR.width)) {
    const x = ax === 0 ? toWorldX(0) + T / 2 : toWorldX(FLOOR.width) - T / 2;
    const len = Math.abs(by - ay);
    return [{ pos: [x, H / 2, toWorldZ((ay + by) / 2)], size: [T, H, len], color: WALL_COLOR }];
  }
  return [];
});

/**
 * Mặt phẳng chữ L (OFFICE_L_POLYGON) trong mặt phẳng local XY, UV chuẩn hóa theo cả sàn 58 x 30 m
 * như planeGeometry(FLOOR.width, FLOOR.depth), nên texture lặp giữ đúng cỡ viên.
 * flipZ: local y = -worldZ (mesh quay -90° quanh x, mặt hướng lên). Không flip: local y = worldZ (mặt hướng xuống).
 */
function officeSurface(flipZ: boolean): THREE.ShapeGeometry {
  const sign = flipZ ? -1 : 1;
  const shape = new THREE.Shape(OFFICE_L_POLYGON.map(([x, z]) => new THREE.Vector2(x, sign * z)));
  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[2 * i] = (pos.getX(i) + FLOOR.width / 2) / FLOOR.width;
    uv[2 * i + 1] = (pos.getY(i) + FLOOR.depth / 2) / FLOOR.depth;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/**
 * Độ bóng gạch xám (room.txt mục 2): bóng vừa đủ thấy phản chiếu mờ của đèn trần, không như gương.
 * Dùng chung cho sàn chính và lớp sàn hành lang (Corridors.tsx) ở theme office-day.
 */
export const STONE_FLOOR_GLOSS = {
  roughness: 0.4,
  metalness: 0,
  clearcoat: 0.8,
  clearcoatRoughness: 0.16,
  envMapIntensity: 0.75,
} as const;

const HATCH_TINT: Record<ObjState, string> = {
  idle: '#ffffff',
  hover: '#d5e0f7',
  active: '#8fb4ff',
};

/**
 * Gạch vuông khổ lớn 0,8 x 0,8 m. Một ô texture chứa 5 x 5 viên (4 m), lặp trên sàn: chu kỳ lặp dài hơn
 * để mắt khó nhận ra (room.txt mục 6, tránh texture lặp quá rõ).
 */
const TILE_M = 0.8;
const TILES_PER_TEX = 5;
const FLOOR_TEX_PX = 1280;

/**
 * Texture sàn đá xám: nền đá có hạt mịn, vân trắng mảnh chạy chéo (thưa), mạch lát 1–2 mm màu xám đậm hơn nền
 * chạy thẳng theo hai trục (trùng trục lối đi). Mạch nằm đúng mép ô nên lặp liền.
 */
function makeStoneTexture(): THREE.CanvasTexture {
  const rng = makeRng(80080);
  const tex = canvasTexture(FLOOR_TEX_PX, FLOOR_TEX_PX, (ctx, w, h) => {
    const tile = w / TILES_PER_TEX;
    ctx.fillStyle = R.floorStone;
    ctx.fillRect(0, 0, w, h);
    // Mỗi viên lệch sáng tối rất nhẹ, như gạch thật khác lô.
    for (let i = 0; i < TILES_PER_TEX; i++) {
      for (let j = 0; j < TILES_PER_TEX; j++) {
        const a = (rng() - 0.5) * 0.06;
        ctx.fillStyle = a > 0 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${-a})`;
        ctx.fillRect(i * tile, j * tile, tile, tile);
      }
    }
    // Hạt đá mịn.
    for (let k = 0; k < 25000; k++) {
      const v = rng() < 0.5 ? 255 : 60;
      ctx.fillStyle = `rgba(${v},${v},${v},${0.04 + rng() * 0.05})`;
      ctx.fillRect(rng() * w, rng() * h, 1.5, 1.5);
    }
    // Vân trắng mảnh chạy chéo, mỗi viên 1–2 vân, cắt theo mép viên.
    ctx.strokeStyle = R.floorVein;
    ctx.lineCap = 'round';
    for (let i = 0; i < TILES_PER_TEX; i++) {
      for (let j = 0; j < TILES_PER_TEX; j++) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(i * tile, j * tile, tile, tile);
        ctx.clip();
        const veins = 1 + Math.floor(rng() * 2);
        for (let v = 0; v < veins; v++) {
          let x = i * tile + rng() * tile;
          let y = j * tile;
          ctx.globalAlpha = 0.35 + rng() * 0.35;
          ctx.lineWidth = 0.8 + rng() * 1.6;
          ctx.beginPath();
          ctx.moveTo(x, y);
          const dir = rng() < 0.5 ? 1 : -1;
          for (let s = 0; s < 12; s++) {
            x += dir * (tile / 14) * (0.6 + rng() * 0.8);
            y += (tile / 12) * (0.7 + rng() * 0.6);
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    // Mạch lát: 2 px trên 256 px của viên 0,8 m, khoảng 3 mm hiển thị (mạch ở mép ô chia đôi qua hai mép texture).
    ctx.fillStyle = R.floorGrout;
    for (let k = 0; k <= TILES_PER_TEX; k++) {
      const o = Math.round(k * tile);
      ctx.fillRect(o - 1, 0, 2, h);
      ctx.fillRect(0, o - 1, w, 2);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const cell = TILE_M * TILES_PER_TEX;
  tex.repeat.set(FLOOR.width / cell, FLOOR.depth / cell);
  tex.anisotropy = 8;
  return tex;
}

/**
 * Sàn gạch xám bóng (porcelain giả đá) chỉ trong chữ L: MeshPhysicalMaterial có clearcoat, phản chiếu lấy từ env map
 * nướng sẵn có lưới đèn panel (officeEnv.ts), nên ô đèn trần hiện thành các vệt sáng mờ trên sàn, không vẽ vào
 * texture. Không dùng Reflector.
 */
function StoneFloor() {
  const env = useOfficeEnvMap();
  const res = useMemo(() => {
    const map = makeStoneTexture();
    const mat = new THREE.MeshPhysicalMaterial({ map, ...STONE_FLOOR_GLOSS });
    const geo = officeSurface(true);
    return { map, mat, geo };
  }, []);
  useEffect(() => {
    res.mat.envMap = env;
    res.mat.needsUpdate = true;
  }, [res, env]);
  useEffect(
    () => () => {
      res.map.dispose();
      res.mat.dispose();
      res.geo.dispose();
    },
    [res],
  );
  return <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={res.mat} geometry={res.geo} />;
}

/**
 * Trần thả chỉ trong chữ L. OfficeCeiling vẽ một mặt phẳng phủ cả sàn; ở đây thay hình học của mesh
 * "office-ceiling" bằng mặt chữ L cùng cách đặt UV, giữ nguyên vật liệu và texture của OfficeCeiling.
 */
function OfficeCeilingL() {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const mesh = ref.current?.getObjectByName('office-ceiling');
    if (!(mesh instanceof THREE.Mesh)) return undefined;
    const original = mesh.geometry;
    const geo = officeSurface(false);
    mesh.geometry = geo;
    return () => {
      if (mesh.geometry === geo) mesh.geometry = original;
      geo.dispose();
    };
  }, []);
  return (
    <group ref={ref}>
      <OfficeCeiling />
    </group>
  );
}

/**
 * Sàn gạch xám, tường ngoài sơn trắng, trần lưới có đèn panel, chỉ trong chữ L (officeBounds.ts).
 * Kèm đạo cụ văn phòng và khu dự phòng có hoa văn (ITOffice đã lọc: khu dự phòng nằm ngoài L nên thường rỗng).
 */
export function Floorplan({ reserved }: { reserved: ZoneObject[] }) {
  return (
    <>
      <StoneFloor />
      <InstancedBoxes items={OUTER_WALLS} interactive={false} castShadow receiveShadow />
      <OfficeCeilingL />
      <OfficeProps />
      {reserved.map((o) => (
        <ReservedField key={o.id} obj={o} />
      ))}
    </>
  );
}

/** Tạo texture sọc chéo một lần cho khu dự phòng. Trả về null nếu không có canvas 2D. */
function makeHatch(w: number, d: number): THREE.CanvasTexture | null {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#243049';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#3a4a6b';
  g.lineWidth = 10;
  for (let x = -64; x <= 64; x += 32) {
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x + 64, 0);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(w / 3, d / 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ReservedField({ obj }: { obj: ZoneObject }) {
  const { selected, hovered, select, hover, unhover } = useScene();
  const [w, , d] = obj.size;
  const texture = useMemo(() => makeHatch(w, d), [w, d]);
  const state = stateOf(obj.id, selected, hovered);
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={obj.position}
      onClick={(e) => {
        e.stopPropagation();
        select(obj.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        hover(obj.id);
      }}
      onPointerOut={() => unhover(obj.id)}
    >
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={texture ?? undefined} color={HATCH_TINT[state]} />
    </mesh>
  );
}
