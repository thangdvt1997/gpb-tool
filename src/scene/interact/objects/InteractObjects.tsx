import { useEffect, useMemo } from 'react';
import { PROP_SPOTS, propSize, faceRotation, TV } from '../../officePropsLayout';
import { toWorldX, toWorldZ } from '../../layout';
import { requestSit, requestStand } from '../../controls/session';
import { playerPose } from '../../controls/playerPose';
import type { ZoneObject } from '../../../content/types';
import { chairInteractables } from '../chairs';
import { registerObjects, type ObjectsConfig } from './index';
import { ObjectsTicker, DoorMesh, DrawerCabinetMesh, GroupLight, SwitchMesh, WaterCoolerMesh, PrinterMesh, ItemMesh, ComputerMesh } from './components';
import type { Footprint } from '../registry';

/**
 * Khu mẫu dựng từ dữ liệu sẵn có (PROP_SPOTS, ghế của khối bàn). Không đổi dữ liệu nguồn.
 * Chọn vị trí bằng cách lấy phần tử đầu tiên của từng loại; xem docs/design/INTERACT_OBJECTS.md.
 */
export function buildSampleConfig(objects: readonly ZoneObject[], blocked: (x: number, z: number) => boolean): ObjectsConfig & { geo: SampleGeometry } {
  const spot = (kind: string, i = 0) => PROP_SPOTS.filter((s) => s.kind === kind)[i];
  const place = (s: NonNullable<ReturnType<typeof spot>>) => {
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
  const cab = place(spot('cabinet', 0));
  const water = place(spot('water', 0));
  const tvS = spot('tv');
  const tv = place(tvS);
  const low = place(spot('lowcab', 0));
  const sw = { x: water.x - 0.9, z: water.z - 0.3 };
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
    items: [{ id: 'sample_cup', label: 'Cốc', home: { x: low.x + 0.25, y: 0.8, z: low.z }, radius: 0.04, footprint: { cx: low.x + 0.25, cz: low.z, hx: 0.05, hz: 0.05 } }],
    surfaces: [
      {
        id: 'sample_lowcab_top',
        label: 'Mặt tủ thấp',
        surface: { id: 'lowcab', minX: low.x - low.w / 2, maxX: low.x + low.w / 2, minZ: low.z - low.d / 2, maxZ: low.z + low.d / 2, y: 0.8 },
        footprint: low.fp,
        getPlayer: player,
        itemInfo: (id) => (id === 'sample_cup' ? { r: 0.04, home: { x: low.x + 0.25, y: 0.8, z: low.z } } : null),
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
export interface SampleGeometry {
  cab: PlaceInfo;
  water: PlaceInfo;
  low: PlaceInfo;
  tv: PlaceInfo;
}

/** Điều phối viên chèn <InteractObjects objects={...} blocked={...} /> trong ITOffice (trong Canvas). */
export function InteractObjects(p: { objects: readonly ZoneObject[]; blocked: (x: number, z: number) => boolean }) {
  const built = useMemo(() => buildSampleConfig(p.objects, p.blocked), [p.objects, p.blocked]);
  useEffect(() => registerObjects(built), [built]);
  const g = built.geo;
  return (
    <group>
      <ObjectsTicker />
      <DrawerCabinetMesh id="sample_cabinet" position={[g.cab.x, 0, g.cab.z + 0.0]} yaw={g.cab.yaw} count={3} size={[g.cab.w, 0.9, g.cab.d]} />
      <WaterCoolerMesh id="sample_cooler" position={[g.water.x, 0, g.water.z]} yaw={g.water.yaw} />
      <PrinterMesh id="sample_printer" position={[g.low.x, 0.8, g.low.z]} yaw={g.low.yaw} />
      <SwitchMesh group="sample_zone" position={[g.water.x - 0.9, 1.2, g.water.z - 0.3]} yaw={g.water.yaw} />
      <GroupLight group="sample_zone" position={[g.water.x, 2.6, g.water.z + 1]} />
      <ItemMesh id="sample_cup" home={{ x: g.low.x + 0.25, y: 0.8, z: g.low.z }} radius={0.04} height={0.1} />
    </group>
  );
}

export { DoorMesh, ComputerMesh };
