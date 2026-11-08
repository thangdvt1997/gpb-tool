import { useMemo } from 'react';
import type { ZoneObject } from '../content/types';
import { stateOf, toneFor, useScene } from './context';
import { InstancedBoxes, type BoxItem } from './InstancedBoxes';
import type { V3 } from './layout';
import { GlbInstances, useFurnitureFlag, useFurnitureSources } from './GlbFurniture';
import { furniturePlacements } from './furnitureGlb';

/** Lưới bàn: bàn rộng 1.0 m, sâu 0.6 m, bước giữa các cột và các hàng 1.2 m. */
const DESK_W = 1.0;
const DESK_D = 0.6;
const PITCH = 1.2;
const TOP_Y = 0.725;
const SCREEN_Y = 0.935;
const WOOD = '#8a6e4b';
const SCREEN = '#1d2a44';

/** Vị trí tâm các bàn trong một khối, căn giữa khối. Số hàng và cột tính theo kích thước khối. */
export function deskSeats(o: ZoneObject): Array<{ x: number; z: number }> {
  const cols = Math.max(1, Math.floor((o.size[0] - DESK_W) / PITCH) + 1);
  const rows = Math.max(1, Math.floor((o.size[2] - DESK_D) / PITCH) + 1);
  const spanX = (cols - 1) * PITCH;
  const spanZ = (rows - 1) * PITCH;
  const seats: Array<{ x: number; z: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      seats.push({ x: o.position[0] - spanX / 2 + c * PITCH, z: o.position[2] - spanZ / 2 + r * PITCH });
    }
  }
  return seats;
}

interface Slot {
  owner: string;
  pos: V3;
  size: V3;
}

/**
 * Bàn làm việc không có decor. Nguồn GLB (furn_desk, furn_chair): mỗi cặp geometry+vật liệu một InstancedMesh, bàn và ghế
 * tổng cộng 2 lệnh vẽ. GLB chưa tải xong, tải lỗi hoặc ?glbFurniture=0 thì dùng hộp (BoxDeskField) như cũ.
 */
export function DeskField({ objects }: { objects: ZoneObject[] }) {
  const { source, sources } = useFurnitureSources();
  const seats = useMemo(
    () => objects.flatMap((o) => deskSeats(o).map((s) => ({ owner: o.id, x: s.x, z: s.z }))),
    [objects],
  );
  const placements = useMemo(() => furniturePlacements(seats), [seats]);
  useFurnitureFlag(source, sources, seats.length);
  if (source === 'glb' && sources) {
    return (
      <>
        <GlbInstances sources={sources.desk} placements={placements.desks} />
        <GlbInstances sources={sources.chair} placements={placements.chairs} />
      </>
    );
  }
  return <BoxDeskField objects={objects} />;
}

/** Toàn bộ bàn làm việc trong hai lệnh vẽ: mặt bàn và màn hình. Bấm hoặc rê vào bàn tác động tới khối bàn. */
export function BoxDeskField({ objects }: { objects: ZoneObject[] }) {
  const { selected, hovered } = useScene();

  const slots = useMemo(() => {
    const tops: Slot[] = [];
    const screens: Slot[] = [];
    for (const o of objects) {
      for (const s of deskSeats(o)) {
        tops.push({ owner: o.id, pos: [s.x, TOP_Y, s.z], size: [DESK_W, 0.05, DESK_D] });
        screens.push({ owner: o.id, pos: [s.x, SCREEN_Y, s.z - 0.22], size: [0.5, 0.32, 0.03] });
      }
    }
    return { tops, screens };
  }, [objects]);

  const topItems = useMemo<BoxItem[]>(
    () =>
      slots.tops.map((t) => ({
        pos: t.pos,
        size: t.size,
        owner: t.owner,
        color: toneFor(WOOD, stateOf(t.owner, selected, hovered)),
      })),
    [slots, selected, hovered],
  );

  const screenItems = useMemo<BoxItem[]>(
    () =>
      slots.screens.map((s) => ({
        pos: s.pos,
        size: s.size,
        owner: s.owner,
        color: toneFor(SCREEN, stateOf(s.owner, selected, hovered)),
      })),
    [slots, selected, hovered],
  );

  return (
    <>
      <InstancedBoxes items={topItems} castShadow receiveShadow />
      <InstancedBoxes items={screenItems} castShadow />
    </>
  );
}
