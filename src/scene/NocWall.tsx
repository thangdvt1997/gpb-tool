import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import type { ZoneObject } from '../content/types';
import { STATUS_TEXT, statusColor, type Service } from '../data/useServices';
import { InstancedBoxes, type BoxItem } from './InstancedBoxes';
import type { V3 } from './layout';

const COLS = 3;
const MAX_TILES = 6;

interface Tile {
  id: string;
  name: string;
  status: Service['status'];
  pos: V3;
  size: V3;
  labelPos: V3;
}

/** Ô trạng thái đặt trên mặt Nam của tường NOC: 3 cột × 2 hàng. */
function tileLayout(obj: ZoneObject, services: Service[]): Tile[] {
  const [cx, cy, cz] = obj.position;
  const [w, , d] = obj.size;
  const cell = w / COLS;
  return services.slice(0, MAX_TILES).map((s, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = cx + (col - 1) * cell;
    const y = cy + (row === 0 ? 0.42 : -0.42);
    const z = cz + d / 2 + 0.011;
    return {
      id: s.id,
      name: s.name,
      status: s.status,
      pos: [x, y, z],
      size: [cell - 0.25, 0.8, 0.02],
      labelPos: [x, y, z + 0.03],
    };
  });
}

/** Các ô trạng thái dịch vụ trên tường NOC. Màu đi kèm chữ, không chỉ dựa vào màu. */
export function NocTiles({ obj, services }: { obj: ZoneObject; services: Service[] }) {
  const tiles = useMemo(() => tileLayout(obj, services), [obj, services]);
  const items = useMemo<BoxItem[]>(
    () => tiles.map((t) => ({ pos: t.pos, size: t.size, color: statusColor[t.status], owner: obj.id })),
    [tiles, obj.id],
  );
  return (
    <>
      <InstancedBoxes items={items} />
      {tiles.map((t) => (
        <Html key={t.id} position={t.labelPos} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <div className="label" style={{ borderColor: statusColor[t.status] }}>
            {t.name} · {STATUS_TEXT[t.status]}
          </div>
        </Html>
      ))}
    </>
  );
}
