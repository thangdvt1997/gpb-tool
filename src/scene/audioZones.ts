import type { ZoneObject } from '../content/types';
import type { AmbientZone } from '../audio/engine';
import { footprint, type Rect } from './layout';

/**
 * Khu âm thanh và vật thể định vị khu (theo id trong it.json), kèm lề mở rộng quanh footprint (m).
 * Thứ tự quan trọng: khu nhỏ nằm trong lounge phải đứng trước lounge.
 */
const AUDIO_ZONES: ReadonlyArray<{ zone: AmbientZone; ids: readonly string[]; margin: number }> = [
  { zone: 'karaoke', ids: ['karaoke_room'], margin: 0.5 },
  { zone: 'game', ids: ['games_corner'], margin: 1 },
  { zone: 'events', ids: ['events_board'], margin: 2.5 },
  { zone: 'meeting', ids: ['mr1', 'mr2', 'mr3'], margin: 0.5 },
  { zone: 'server', ids: ['server_room'], margin: 0.5 },
  { zone: 'soc', ids: ['soc_room'], margin: 0.5 },
  { zone: 'lounge', ids: ['lounge'], margin: 0 },
];

export interface AudioZoneRect extends Rect {
  zone: AmbientZone;
}

/** Hình chữ nhật (mặt sàn, mét three.js) của từng khu âm thanh. Khu không có vật thể trong dữ liệu thì bỏ qua. */
export function audioZoneRects(objects: ZoneObject[]): AudioZoneRect[] {
  const out: AudioZoneRect[] = [];
  for (const def of AUDIO_ZONES) {
    for (const id of def.ids) {
      const obj = objects.find((o) => o.id === id);
      if (!obj) continue;
      const r = footprint(obj);
      out.push({
        zone: def.zone,
        minX: r.minX - def.margin,
        maxX: r.maxX + def.margin,
        minZ: r.minZ - def.margin,
        maxZ: r.maxZ + def.margin,
      });
    }
  }
  return out;
}

/** Khu âm thanh tại điểm (x, z). Ngoài mọi hình chữ nhật thì là văn phòng chung. */
export function audioZoneAt(rects: readonly AudioZoneRect[], x: number, z: number): AmbientZone {
  const hit = rects.find((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
  return hit ? hit.zone : 'office';
}
