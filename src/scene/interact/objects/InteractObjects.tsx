import { useEffect, useMemo } from 'react';
import { PROP_SPOTS, propSize, faceRotation, TV } from '../../officePropsLayout';
import { toWorldX, toWorldZ } from '../../layout';
import { isInsideOffice } from '../../officeBounds';
import { requestSit, requestStand } from '../../controls/session';
import { playerPose } from '../../controls/playerPose';
import type { ZoneObject } from '../../../content/types';
import { chairInteractables } from '../chairs';
import { registerObjects, type ObjectsConfig } from './index';
import { ObjectsTicker, DoorMesh, DrawerCabinetMesh, GroupLight, SwitchMesh, WaterCoolerMesh, PrinterMesh, ItemMesh, ComputerMesh } from './components';
import type { Footprint } from '../registry';

/**
 * Khu mẫu dựng từ dữ liệu sẵn có (PROP_SPOTS, ghế của khối bàn). Không đổi dữ liệu nguồn.
 * Chọn vị trí đầu tiên của từng loại mà thân vật và điểm đứng đều nằm trong chữ L; xem docs/design/INTERACT_OBJECTS.md.
 */
export function buildSampleConfig(objects: readonly ZoneObject[], blocked: (x: number, z: number) => boolean): ObjectsConfig & { geo: SampleGeometry } {
  const place = (s: (typeof PROP_SPOTS)[number]) => {
    const { w, d } = propSize(s);
    const yaw = faceRotation(s.face);
    const x = toWorldX(s.x);
    const z = toWorldZ(s.y);
    const alongX = s.face === 'N' || s.face === 'S';
    const fp: Footprint = { cx: x, cz: z, hx: (alongX ? w : d) / 2, hz: (alongX ? d : w) / 2 };
    // Mặt trước = local +z quay theo yaw: điểm đứng cách mép 0,6 m.
    const front = { x: x + Math.sin(yaw) * (d / 2 + 0.6), z: z + Math.cos(yaw) * (d / 2 + 0.6), yaw: yaw + Math.PI };
    return { x, z, yaw, fp, front, w, d };
  };
  // Chỉ lấy vị trí mà thân vật và điểm đứng trước mặt đều nằm trong chữ L (người chơi tới được).
  const reachable = (pl: ReturnType<typeof place>) => isInsideOffice(pl.x, pl.z) && isInsideOffice(pl.front.x, pl.front.z);
  const pick = (kind: string) => {
    const all = PROP_SPOTS.filter((s) => s.kind === kind).map(place);
    return all.find(reachable) ?? all[0]!;
  };
  const cab = pick('cabinet');
  const water = pick('water');
  const tv = pick('tv');
  // Tủ thấp: không có chỗ nào trong L thì máy in và cốc đặt ở đầu tủ hồ sơ mẫu (mặt tủ cao 0,9 m).
  const lowSpot = PROP_SPOTS.filter((s) => s.kind === 'lowcab').map(place).find(reachable);
  const low: SampleLow = lowSpot
    ? { ...lowSpot, top: 0.8 }
    : (() => {
        const t = tangentOf(cab.yaw);
        const w = 0.8;
        const off = cab.w / 2 - w / 2;
        const x = cab.x + t.x * off;
        const z = cab.z + t.z * off;
        const front = { x: cab.front.x + t.x * off, z: cab.front.z + t.z * off, yaw: cab.front.yaw };
        const fp: Footprint = { cx: x, cz: z, hx: Math.abs(t.x) * w / 2 + Math.abs(t.z) * cab.d / 2, hz: Math.abs(t.z) * w / 2 + Math.abs(t.x) * cab.d / 2 };
        return { x, z, yaw: cab.yaw, fp, front, w, d: cab.d, top: 0.9 };
      })();
  const sw = switchPos(water);
  const geo: SampleGeometry = { cab, water, low, tv };
  const player = () => playerPose;
  const cfg: ObjectsConfig = {
    chairs: {
      defs: chairInteractables(objects),
      seatOf: (d) => (d.footprint ? { x: d.footprint.cx, z: d.footprint.cz + 0.06, yaw: Math.PI } : null),
      hooks: { sit: requestSit, stand: () => requestStand(), isFree: (x, z) => !blocked(x, z) },
    },
    cabinets: [{ id: 'sample_cabinet', count: 3, footprint: cab.fp, at: cab.front, yaw: cab.front.yaw, locked: [2] }],
    switches: [{ id: 'sample_switch', groups: ['sample_zone'], footprint: { cx: sw.x, cz: sw.z, hx: 0.1, hz: 0.1 } }],
    coolers: [{ id: 'sample_cooler', footprint: water.fp, point: water.front }],
    printers: [{ id: 'sample_printer', footprint: { cx: low.x, cz: low.z, hx: 0.25, hz: 0.25 }, point: low.front }],
    tvs: [{ id: 'sample_tv', footprint: tv.fp, baseY: TV.centerY - TV.height / 2, height: TV.height }],
    items: [{ id: 'sample_cup', label: 'Cốc', home: cupHome(low), radius: 0.04, footprint: { cx: cupHome(low).x, cz: cupHome(low).z, hx: 0.05, hz: 0.05 } }],
    surfaces: [
      {
        id: 'sample_lowcab_top',
        label: 'Mặt tủ thấp',
        surface: { id: 'lowcab', minX: low.fp.cx - low.fp.hx, maxX: low.fp.cx + low.fp.hx, minZ: low.fp.cz - low.fp.hz, maxZ: low.fp.cz + low.fp.hz, y: low.top },
        footprint: low.fp,
        getPlayer: player,
        itemInfo: (id) => (id === 'sample_cup' ? { r: 0.04, home: cupHome(low) } : null),
      },
    ],
  };
  return { ...cfg, geo };
}

interface PlaceInfo {
  x: number;
  z: number;
  yaw: number;
  w: number;
  d: number;
}
interface SampleLow extends PlaceInfo {
  fp: Footprint;
  front: { x: number; z: number; yaw: number };
  /** Độ cao mặt trên (m): tủ thấp 0,8, đầu tủ hồ sơ 0,9. */
  top: number;
}
export interface SampleGeometry {
  cab: PlaceInfo;
  water: PlaceInfo;
  low: SampleLow;
  tv: PlaceInfo;
}

/** Hướng dọc tường (vuông góc hướng mặt). yaw = π (mặt N) cho (1, 0). */
function tangentOf(yaw: number) {
  return { x: -Math.cos(yaw), z: Math.sin(yaw) };
}

/** Công tắc cạnh cây nước: lùi 0,9 m dọc tường, ra phía trước 0,3 m. */
function switchPos(w: PlaceInfo) {
  const t = tangentOf(w.yaw);
  return { x: w.x - t.x * 0.9 + Math.sin(w.yaw) * 0.3, z: w.z - t.z * 0.9 + Math.cos(w.yaw) * 0.3 };
}

/** Cốc trên mặt tủ, lệch 0,25 m dọc tường so với máy in. */
function cupHome(l: SampleLow) {
  const t = tangentOf(l.yaw);
  return { x: l.x - t.x * 0.25, y: l.top, z: l.z - t.z * 0.25 };
}

/** Điều phối viên chèn <InteractObjects objects={...} blocked={...} /> trong ITOffice (trong Canvas). */
export function InteractObjects(p: { objects: readonly ZoneObject[]; blocked: (x: number, z: number) => boolean }) {
  const built = useMemo(() => buildSampleConfig(p.objects, p.blocked), [p.objects, p.blocked]);
  useEffect(() => registerObjects(built), [built]);
  const g = built.geo;
  const sw = switchPos(g.water);
  return (
    <group>
      <ObjectsTicker />
      <DrawerCabinetMesh id="sample_cabinet" position={[g.cab.x, 0, g.cab.z + 0.0]} yaw={g.cab.yaw} count={3} size={[g.cab.w, 0.9, g.cab.d]} />
      <WaterCoolerMesh id="sample_cooler" position={[g.water.x, 0, g.water.z]} yaw={g.water.yaw} />
      <PrinterMesh id="sample_printer" position={[g.low.x, g.low.top, g.low.z]} yaw={g.low.yaw} />
      <SwitchMesh group="sample_zone" position={[sw.x, 1.2, sw.z]} yaw={g.water.yaw} />
      <GroupLight group="sample_zone" position={[g.water.x + Math.sin(g.water.yaw), 2.6, g.water.z + Math.cos(g.water.yaw)]} />
      <ItemMesh id="sample_cup" home={cupHome(g.low)} radius={0.04} height={0.1} />
    </group>
  );
}

export { DoorMesh, ComputerMesh };
