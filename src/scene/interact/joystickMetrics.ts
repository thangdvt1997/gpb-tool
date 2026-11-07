/** Kích thước joystick cảm ứng theo cài đặt touch.joystickSize (px). Hàm thuần. */
import { RANGES } from '../../settings/schema';

export interface JoystickMetrics {
  /** Đường kính đế. */
  size: number;
  /** Đường kính núm. */
  knob: number;
  /** Quãng kéo tối đa của núm tính từ tâm. */
  radius: number;
}

export function joystickMetrics(size: number): JoystickMetrics {
  const s = Number.isFinite(size) ? Math.min(RANGES.joystickSize.max, Math.max(RANGES.joystickSize.min, size)) : 120;
  return { size: s, knob: s * 0.4375, radius: s * 0.375 };
}
