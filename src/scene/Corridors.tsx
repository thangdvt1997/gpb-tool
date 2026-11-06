// Hành lang và lối nối giữa các khu, mỗi đoạn một phong cách. Vị trí theo docs/FLOORPLAN_IT.md, mục "Hành lang".
// Chỉ vẽ lớp sàn (mặt trên y = 0,032, trên khu dự phòng y = 0,02, dưới lớp phủ lounge) và trang trí sát tường,
// nên không chặn đi lại và không đè vật thể.
//
// Đoạn (tọa độ bản vẽ, mét):
//   lobby     Sảnh kính thang máy        x 20.5–30.5, y 15.5–18.9  sàn bóng sáng, viền đèn hắt màu nhấn
//   central   Hành lang giữa (đá)        x 18.6–29.9, y 12.9–13.9  đường ghi danh: cổng an ninh → điểm thả
//   link      Lối nối hành lang giữa → sảnh x 25.6–27.0, y 13.9–15.5
//   security  Khu an ninh (đá tối)       x 29.9–35.9, y  5.2–15.1  vạch dẫn từ cửa thang Đông tới cổng
//   east      Lối khu an ninh → hành lang Nam x 35.9–38.5, y 13.7–18.9
//   south     Hành lang gỗ phía Nam      x  2.5–46.5, y 18.9–19.9  nối các cụm bàn Nam, lối vào chính
//   gallery   Khu trưng bày (Đông)       x 45.1–46.5, y  3.5–18.9  tranh treo trên tường khối WC, đèn rọi
//   Hành lang phía Tây (gỗ sồi sáng, ván lát ngang, viền gỗ sẫm), vòng quanh cụm desk_L, util_quiet, mr1:
//   west        dọc tường Tây               x  0.4–2.5,  y  4.9–19.9  mặt Tây desk_L1..L3, nối hành lang Nam
//   west_north  phía Bắc desk_L1, util_quiet x  0.4–14.5, y  3.9–4.9   mặt Nam util_store, core_st1
//   west_inner  phía Đông util_quiet, mr1   x 13.5–14.5, y  4.9–18.9  mép khu dự phòng, nối hành lang Nam
//   west_mid    giữa desk_L2 và desk_L3     x  2.5–8.5,  y 14.6–15.8  nhánh từ west
//   Lối nối Tây → hành lang giữa (đá, cùng kiểu central), đi vòng phía Bắc util_print qua khu dự phòng:
//   west_link   x 14.5–19.6, y  9.9–10.9;  west_link2  x 18.6–19.6, y 10.9–12.9 (chạm central tại y 12.9)
//
// Draw call: sàn, khung tranh và mặt tranh 1 (gộp màu đỉnh), dải đèn 1. Tổng 2, không phụ thuộc số đoạn.
// Hành lang Bắc (corridors/NorthCorridor) và lối vào lounge (corridors/LoungeLink) gộp luôn vào hai mesh này
// (trước đây tốn thêm 3 draw call).
//
// Theme office-day theo văn phòng thật (REAL_OFFICE_STYLE.md, quyết định D1): mọi đoạn đá, gỗ và gỗ sồi đều lát
// đá xám bóng cùng màu sàn chính, mạch theo viên 0,8 m, vật liệu clearcoat dùng chung env map với sàn chính.
// Sảnh, khu an ninh, khu trưng bày giữ kiểu riêng để phân khu. Theme khác giữ nguyên như cũ.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { palettes } from '../env/palette';
import { UNIT_BOX, UNIT_PLANE } from '../env/shared';
import { OFFICE_DAY_SCENE, THEME_TOKENS, type ThemeName } from '../theme/tokens';
// Import thẳng file (không qua './corridors'): tránh trùng tên với chính file này trên ổ không phân biệt hoa thường.
import { buildLoungeLink } from './corridors/LoungeLink';
import { buildNorthCorridor } from './corridors/NorthCorridor';
import { LOUNGE_LINK_RECT } from './corridors/LoungeLink';
import { NORTH_CORRIDOR_RECT } from './corridors/NorthCorridor';
import { mix } from './entry/colors';
import { Batch } from './entry/merge';
import { STONE_FLOOR_GLOSS } from './Floorplan';
import { toWorldX, toWorldZ } from './layout';
import { clipPlanRectToOffice } from './officeBounds';
import { useOfficeEnvMap } from './officeEnv';

/** Mặt trên lớp sàn hành lang (m). Cao hơn khu dự phòng (0,02), thấp hơn lớp phủ lounge (0,025 ± 0,01). */
const TOP = 0.032;
const THICK = 0.012;

type Style = 'lobby' | 'stone' | 'wood' | 'oak' | 'security' | 'gallery';

interface Segment {
  id: string;
  style: Style;
  /** Tọa độ bản vẽ (m): x0, x1, y0, y1. */
  rect: [number, number, number, number];
}

export const CORRIDORS: readonly Segment[] = [
  { id: 'lobby', style: 'lobby', rect: [20.5, 30.5, 15.5, 18.9] },
  { id: 'central', style: 'stone', rect: [18.6, 29.9, 12.9, 13.9] },
  { id: 'link', style: 'stone', rect: [25.6, 27.0, 13.9, 15.5] },
  { id: 'security', style: 'security', rect: [29.9, 35.9, 5.2, 15.1] },
  { id: 'east', style: 'stone', rect: [35.9, 38.5, 13.7, 18.9] },
  { id: 'south', style: 'wood', rect: [2.5, 46.5, 18.9, 19.9] },
  { id: 'gallery', style: 'gallery', rect: [45.1, 46.5, 3.5, 18.9] },
  // Hành lang phía Tây. Các đoạn chỉ chạm cạnh, không chồng nhau (tránh z-fighting).
  { id: 'west', style: 'oak', rect: [0.4, 2.5, 4.9, 19.9] },
  { id: 'west_north', style: 'oak', rect: [0.4, 14.5, 3.9, 4.9] },
  { id: 'west_inner', style: 'oak', rect: [13.5, 14.5, 4.9, 18.9] },
  { id: 'west_mid', style: 'oak', rect: [2.5, 8.5, 14.6, 15.8] },
  { id: 'west_link', style: 'stone', rect: [14.5, 19.6, 9.9, 10.9] },
  { id: 'west_link2', style: 'stone', rect: [18.6, 19.6, 10.9, 12.9] },
];

interface World {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  cx: number;
  cz: number;
  w: number;
  d: number;
}

function toWorld([x0, x1, y0, y1]: Readonly<Segment['rect']>): World {
  const wx0 = toWorldX(x0);
  const wx1 = toWorldX(x1);
  const wz0 = toWorldZ(y0);
  const wz1 = toWorldZ(y1);
  return { x0: wx0, x1: wx1, z0: wz0, z1: wz1, cx: (wx0 + wx1) / 2, cz: (wz0 + wz1) / 2, w: wx1 - wx0, d: wz1 - wz0 };
}

interface CorridorColors {
  lobby: string;
  lobbyBorder: string;
  stone: string;
  stoneJoint: string;
  wood: string;
  woodSeam: string;
  oak: string;
  oakSeam: string;
  oakEdge: string;
  security: string;
  securityJoint: string;
  guide: string;
  gallery: string;
  frame: string;
  spot: string;
  art: string[];
}

function corridorColors(theme: ThemeName): CorridorColors {
  const t = THEME_TOKENS[theme];
  const p = palettes[theme];
  const real = theme === 'office-day';
  const stone = real ? OFFICE_DAY_SCENE.floorStone : mix(t.sceneWall, t.sceneFloor, 0.5);
  const security = mix(t.sceneFloor, THEME_TOKENS['office-day'].text, 0.55);
  const oak = mix(p.wood, t.panel, 0.45);
  return {
    lobby: mix(t.sceneFloor, t.panel, 0.4),
    lobbyBorder: mix(t.sceneAccent, t.panel, 0.3),
    stone,
    stoneJoint: real ? OFFICE_DAY_SCENE.floorGrout : mix(stone, t.text, 0.22),
    wood: p.wood,
    woodSeam: mix(p.wood, p.ink, 0.35),
    oak,
    oakSeam: mix(oak, p.ink, 0.22),
    oakEdge: mix(p.wood, p.ink, 0.5),
    security,
    securityJoint: mix(security, t.line, 0.35),
    guide: mix(t.sceneAccent, t.panel, 0.2),
    gallery: mix(p.wall, p.wood, 0.25),
    frame: p.ink,
    spot: mix(THEME_TOKENS['office-day'].panel, THEME_TOKENS.tet.text, 0.5),
    art: [p.accent, p.accent2, p.accent3, t.sceneAccent, p.fabric],
  };
}

const Y = TOP - THICK / 2;

function slab(b: Batch, r: World, color: string): void {
  b.add(UNIT_BOX, null, [r.cx, Y, r.cz], [r.w, THICK, r.d], color);
}

/** Mạch nối (đường mảnh nổi 1 mm trên mặt sàn) theo lưới step, dọc cả hai trục. */
function joints(b: Batch, r: World, step: number, color: string): void {
  const y = TOP + 0.0005;
  for (let x = r.x0 + step; x < r.x1 - 0.05; x += step) b.add(UNIT_BOX, null, [x, y, r.cz], [0.012, 0.001, r.d], color);
  for (let z = r.z0 + step; z < r.z1 - 0.05; z += step) b.add(UNIT_BOX, null, [r.cx, y, z], [r.w, 0.001, 0.012], color);
}

/** Ván gỗ chạy dọc cạnh dài, mạch ngang so le. */
function planks(b: Batch, r: World, color: string): void {
  const y = TOP + 0.0005;
  const alongX = r.w >= r.d;
  const len = alongX ? r.w : r.d;
  const wid = alongX ? r.d : r.w;
  const plank = 0.2;
  const rows = Math.max(1, Math.round(wid / plank));
  const pw = wid / rows;
  for (let i = 1; i < rows; i++) {
    const o = (alongX ? r.z0 : r.x0) + i * pw;
    if (alongX) b.add(UNIT_BOX, null, [r.cx, y, o], [r.w, 0.001, 0.008], color);
    else b.add(UNIT_BOX, null, [o, y, r.cz], [0.008, 0.001, r.d], color);
  }
  for (let i = 0; i < rows; i++) {
    const off = (i % 3) * 0.4;
    for (let s = off + 1.2; s < len - 0.1; s += 1.2) {
      const a = (alongX ? r.x0 : r.z0) + s;
      const o = (alongX ? r.z0 : r.x0) + (i + 0.5) * pw;
      if (alongX) b.add(UNIT_BOX, null, [a, y, o], [0.008, 0.001, pw], color);
      else b.add(UNIT_BOX, null, [o, y, a], [pw, 0.001, 0.008], color);
    }
  }
}

/** Gỗ sồi: ván ngắn lát ngang (vuông góc cạnh dài), viền gỗ sẫm chạy dọc hai mép dài. */
function oakPlanks(b: Batch, r: World, seam: string, edge: string): void {
  const y = TOP + 0.0005;
  const alongX = r.w >= r.d;
  const len = alongX ? r.w : r.d;
  const step = 0.18;
  for (let s = step; s < len - 0.05; s += step) {
    const a = (alongX ? r.x0 : r.z0) + s;
    if (alongX) b.add(UNIT_BOX, null, [a, y, r.cz], [0.008, 0.001, r.d - 0.16], seam);
    else b.add(UNIT_BOX, null, [r.cx, y, a], [r.w - 0.16, 0.001, 0.008], seam);
  }
  for (const side of [-1, 1]) {
    if (alongX) b.add(UNIT_BOX, null, [r.cx, y, r.cz + side * (r.d / 2 - 0.04)], [r.w, 0.001, 0.06], edge);
    else b.add(UNIT_BOX, null, [r.cx + side * (r.w / 2 - 0.04), y, r.cz], [0.06, 0.001, r.d], edge);
  }
}

function build(theme: ThemeName) {
  const c = corridorColors(theme);
  const floor = new Batch();
  const glow = new Batch();

  const real = theme === 'office-day';
  // Chỉ vẽ phần hành lang nằm trong chữ L (officeBounds.ts). Đoạn nằm ngoài (gallery, west_link) bị bỏ;
  // đoạn cắt ngang chỉ giữ mảnh trong L: security (y 8.1–15.1), east (y 18.5–18.9), south (x 2.5–45.1),
  // west_link2 (mẩu y 12.4–12.9 chạm central). central, link, lobby nằm trọn trong L.
  const pieces = CORRIDORS.flatMap((seg) => clipPlanRectToOffice(seg.rect).map((rect) => ({ ...seg, rect })));
  for (const seg of pieces) {
    const r = toWorld(seg.rect);
    // office-day: hành lang gỗ và gỗ sồi đổi sang đá xám như sàn chính (D1).
    const style: Style = real && (seg.style === 'wood' || seg.style === 'oak') ? 'stone' : seg.style;
    switch (style) {
      case 'lobby': {
        slab(floor, r, c.lobby);
        joints(floor, r, 1.2, mix(c.lobby, c.stoneJoint, 0.35));
        // Viền đèn hắt sát mép sảnh kính.
        const y = TOP + 0.002;
        glow.add(UNIT_BOX, null, [r.cx, y, r.z0 + 0.06], [r.w - 0.1, 0.002, 0.03], c.lobbyBorder);
        glow.add(UNIT_BOX, null, [r.cx, y, r.z1 - 0.06], [r.w - 0.1, 0.002, 0.03], c.lobbyBorder);
        break;
      }
      case 'stone':
        slab(floor, r, c.stone);
        joints(floor, r, real ? 0.8 : 0.6, c.stoneJoint);
        break;
      case 'wood':
        slab(floor, r, c.wood);
        planks(floor, r, c.woodSeam);
        break;
      case 'oak':
        slab(floor, r, c.oak);
        oakPlanks(floor, r, c.oakSeam, c.oakEdge);
        break;
      case 'security': {
        slab(floor, r, c.security);
        joints(floor, r, 0.9, c.securityJoint);
        // Vạch dẫn: từ cửa thang Đông (x 34.6, y 15.1) lên Bắc tới làn cổng (y 13.4), rẽ Tây ra hành lang giữa.
        const y = TOP + 0.002;
        const doorX = toWorldX(34.6);
        const laneZ = toWorldZ(13.4);
        const edgeZ = toWorldZ(15.1);
        glow.add(UNIT_BOX, null, [doorX, y, (laneZ + edgeZ) / 2], [0.05, 0.002, edgeZ - laneZ], c.guide);
        glow.add(UNIT_BOX, null, [(r.x0 + doorX) / 2, y, laneZ], [doorX - r.x0, 0.002, 0.05], c.guide);
        break;
      }
      case 'gallery': {
        slab(floor, r, c.gallery);
        joints(floor, r, 0.7, mix(c.gallery, c.frame, 0.2));
        // Tranh treo trên tường Đông của khối WC (x 45.1), mặt hướng Đông, kèm đèn rọi dưới trần.
        const wallX = r.x0 + 0.02;
        [-8.4, -6.6, -4.8].forEach((z, i) => {
          floor.add(UNIT_BOX, null, [wallX + 0.015, 1.55, z], [0.03, 0.9, 1.2], c.frame);
          // Mặt tranh gộp luôn vào lô sàn (màu đỉnh), không cần InstancedMesh riêng.
          floor.add(UNIT_PLANE, null, [wallX + 0.032, 1.55, z], [1.08, 0.78, 1], c.art[i % c.art.length], [0, Math.PI / 2, 0]);
          glow.add(UNIT_BOX, null, [wallX + 0.04, 2.15, z], [0.06, 0.02, 0.9], c.spot);
        });
        break;
      }
    }
  }
  // Hành lang Bắc và lối vào lounge nằm hoàn toàn ngoài chữ L: không dựng.
  const north = clipPlanRectToOffice(NORTH_CORRIDOR_RECT).length > 0 ? buildNorthCorridor(theme) : null;
  const loungeLink = clipPlanRectToOffice(LOUNGE_LINK_RECT).length > 0 ? buildLoungeLink(theme) : null;
  return {
    floor: mergeAll([floor.build(), north?.floor ?? null, loungeLink]),
    glow: mergeAll([glow.build(), north?.glow ?? null]),
  };
}

/** Gộp các hình học màu đỉnh (cùng thuộc tính) thành một, dispose bản lẻ. */
function mergeAll(list: Array<THREE.BufferGeometry | null>): THREE.BufferGeometry | null {
  const geos = list.filter((g): g is THREE.BufferGeometry => g !== null);
  if (geos.length <= 1) return geos[0] ?? null;
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (merged) merged.computeBoundingSphere();
  return merged;
}

export function Corridors({ theme }: { theme: ThemeName }) {
  const env = useOfficeEnvMap();
  const res = useMemo(() => {
    const geo = build(theme);
    // office-day: đá bóng clearcoat như sàn chính. Theme khác: vật liệu mờ như cũ.
    const floorMat: THREE.MeshStandardMaterial =
      theme === 'office-day'
        ? new THREE.MeshPhysicalMaterial({ vertexColors: true, ...STONE_FLOOR_GLOSS })
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.02 });
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    return { geo, floorMat, glowMat };
  }, [theme]);
  useEffect(() => {
    if (theme !== 'office-day') return;
    res.floorMat.envMap = env;
    res.floorMat.needsUpdate = true;
  }, [res, env, theme]);
  useEffect(
    () => () => {
      res.geo.floor?.dispose();
      res.geo.glow?.dispose();
      res.floorMat.dispose();
      res.glowMat.dispose();
    },
    [res],
  );

  return (
    <group>
      {res.geo.floor && <mesh geometry={res.geo.floor} material={res.floorMat} receiveShadow />}
      {res.geo.glow && <mesh geometry={res.geo.glow} material={res.glowMat} />}
    </group>
  );
}
