/**
 * Chủ đề ánh sáng và âm thanh, dùng chung cho src/lighting và src/audio.
 * Giá trị là điểm khởi đầu, cần chỉnh khi xem thử trên màn hình thật.
 */

export type ThemeName = 'office-day' | 'after-work' | 'tet' | 'midautumn' | 'party';

export interface LightPreset {
  /** Tên hiển thị tiếng Việt. */
  label: string;
  /** Màu nền scene (scene.background). */
  background: string;
  /** Cường độ AmbientLight gợi ý. ZoneLights không tự thêm ambient, scene đặt giá trị này. */
  ambientIntensity: number;
  ambientColor: string;
  /** Màu đèn chính, pha vào nhiệt độ màu của từng khu theo keyMix. */
  keyColor: string;
  /** 0 giữ nhiệt độ màu của khu, 1 chuyển hẳn sang keyColor. */
  keyMix: number;
  /** Màu nhấn: dải LED, vạch trạng thái. */
  accentColor: string;
  /** Màu nhấn phụ, xen kẽ với accentColor ở khu game. */
  accentColor2: string;
  /** Hệ số nhân cường độ đèn của chủ đề. */
  lightScale: number;
  /** Cường độ bloom gợi ý, truyền vào OptionalBloom. */
  bloomStrength: number;
}

/**
 * Nhiệt độ màu đèn trần khu làm việc (K), theo ảnh văn phòng thật (REAL_OFFICE_STYLE.md mục 4, room.txt mục 6):
 * trắng trung tính, không ám vàng. kelvinToRgb(6500) = (255, 254, 250). rigs.tsx dùng giá trị này cho khu office.
 * Trước đây 5200 K (#ffe8d5) làm bàn gỗ và tường trắng ngả vàng.
 */
export const OFFICE_KELVIN = 6500;

export const LIGHT_PRESETS: Record<ThemeName, LightPreset> = {
  'office-day': {
    label: 'Ban ngày',
    background: '#1b2232',
    // Ambient thấp hơn trước (0,6) vì khu office có thêm đèn bán cầu trắng trung tính (rigs.tsx): sáng đều nhưng
    // mặt trên sáng hơn mặt dưới, bàn ghế có khối, bóng tiếp xúc dưới gầm đọc rõ hơn.
    ambientIntensity: 0.5,
    // Trắng trung tính hơi lạnh như mặt đèn panel đo được (#f1f9ff), không ám vàng.
    ambientColor: '#f6f8fb',
    // keyMix 0: khu tự giữ nhiệt độ màu riêng. Khu office dùng OFFICE_KELVIN.
    keyColor: '#fffefa',
    keyMix: 0,
    accentColor: '#2fbf71',
    accentColor2: '#2a6fdb',
    lightScale: 1,
    bloomStrength: 0.25,
  },
  'after-work': {
    label: 'Sau giờ làm',
    background: '#110d1a',
    ambientIntensity: 0.22,
    ambientColor: '#ffb36b',
    keyColor: '#ffb36b',
    keyMix: 0.5,
    accentColor: '#ff7a59',
    accentColor2: '#8e5cff',
    lightScale: 0.8,
    bloomStrength: 0.5,
  },
  tet: {
    label: 'Tết',
    background: '#2a0b0b',
    ambientIntensity: 0.3,
    ambientColor: '#ffd9a0',
    keyColor: '#ffcf70',
    keyMix: 0.5,
    accentColor: '#d62828',
    accentColor2: '#ffcc33',
    lightScale: 0.95,
    bloomStrength: 0.7,
  },
  midautumn: {
    label: 'Trung thu',
    background: '#120c2a',
    ambientIntensity: 0.26,
    ambientColor: '#ffe0a3',
    keyColor: '#ffb347',
    keyMix: 0.45,
    accentColor: '#ffd166',
    accentColor2: '#ff9f1c',
    lightScale: 0.9,
    bloomStrength: 0.65,
  },
  party: {
    label: 'Tiệc',
    background: '#07040f',
    ambientIntensity: 0.18,
    ambientColor: '#c7a4ff',
    keyColor: '#ffffff',
    keyMix: 0.2,
    accentColor: '#ff3ea5',
    accentColor2: '#22d3ee',
    lightScale: 1.1,
    bloomStrength: 0.95,
  },
};
