import { useAmbient } from '../audio/useAmbient';
import type { AmbientZone } from '../audio/engine';

interface AmbientAudioProps {
  /** Khu nơi người chơi đang đứng. */
  zone: AmbientZone;
  /** Bật âm nền. Âm chỉ thực sự phát sau thao tác đầu tiên của người dùng (xem useAmbient). */
  enabled: boolean;
}

/**
 * Âm nền của khu người chơi đứng. Không có nút UI: App quyết định bật, tắt và tắt tiếng.
 * Đặt trong Canvas, nhưng không vẽ gì.
 */
export function AmbientAudio({ zone, enabled }: AmbientAudioProps) {
  useAmbient(zone, enabled);
  return null;
}
