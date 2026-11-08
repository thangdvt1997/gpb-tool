import { useAmbient } from '../audio/useAmbient';
import type { AmbientZone } from '../audio/engine';
import type { ZoneObject } from '../content/types';

interface AmbientAudioProps {
  /** Khu nơi người chơi đang đứng. */
  zone: AmbientZone;
  /** Bật âm nền. Âm chỉ thực sự phát sau thao tác đầu tiên của người dùng (xem useAmbient). */
  enabled: boolean;
  /** Vật thể của khu, để đặt nguồn có hướng (TV, loa, máy in). */
  objects: readonly ZoneObject[];
}

/**
 * Âm nền của khu người chơi đứng, qua bus ambient của bộ trộn không gian. Không có nút UI.
 * Đặt trong Canvas, nhưng không vẽ gì.
 */
export function AmbientAudio({ zone, enabled, objects }: AmbientAudioProps) {
  useAmbient(zone, enabled, objects);
  return null;
}
