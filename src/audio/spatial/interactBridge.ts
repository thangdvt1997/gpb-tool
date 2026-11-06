import type { InteractEvent, InteractEventType } from '../../scene/interact/objects/interactEvents';
import type { SfxEvent } from './pure';

/**
 * Sự kiện tương tác vật (src/scene/interact/objects/interactEvents.ts) -> âm tổng hợp (TASK 14).
 * Sự kiện không có âm (đăng nhập máy tính, chuyển kênh TV...) trả null. Chỉ phát khi hành động đã xảy ra.
 */
const BY_PREFIX: Readonly<Record<string, SfxEvent>> = {
  door: 'door',
  drawer: 'drawer',
  light: 'switch',
  chair: 'chair',
  printer: 'printer',
  water: 'waterCooler',
  tv: 'tv',
  curtain: 'drawer',
  item: 'uiClick',
};
const SILENT: ReadonlySet<InteractEventType> = new Set<InteractEventType>([
  'door.blocked', 'computer.login', 'computer.logout', 'tv.volume', 'printer.queue', 'water.done', 'item.return',
]);

export function sfxForInteract(type: InteractEventType): SfxEvent | null {
  if (SILENT.has(type)) return null;
  const prefix = type.slice(0, type.indexOf('.'));
  if (prefix === 'computer') return 'uiClick';
  return BY_PREFIX[prefix] ?? null;
}

/** Vị trí phát âm: mặt sàn + 1 m (ngang tầm tay), hoặc không định vị nếu sự kiện không có tọa độ. */
export function positionForInteract(e: InteractEvent): [number, number, number] | undefined {
  return e.x !== undefined && e.z !== undefined ? [e.x, 1, e.z] : undefined;
}

export interface SfxSink {
  play(ev: SfxEvent, o?: { position?: [number, number, number]; zone?: string }): boolean;
}

/** Nghe bus tương tác và phát âm. Trả hàm hủy. */
export function bridgeInteractAudio(
  subscribe: (cb: (e: InteractEvent) => void) => () => void,
  sink: SfxSink,
  zoneAt?: (x: number, z: number) => string,
): () => void {
  return subscribe((e) => {
    const sfx = sfxForInteract(e.type);
    if (sfx === null) return;
    const position = positionForInteract(e);
    const zone = position && zoneAt ? zoneAt(position[0], position[2]) : undefined;
    sink.play(sfx, { position, zone });
  });
}
