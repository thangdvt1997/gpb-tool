/**
 * Bảng màu và cường độ ánh sáng cho cảnh ngoài cửa kính.
 * Bốn khung giờ: sáng sớm (morning), trưa (noon), chiều (evening), đêm (night).
 * Không phụ thuộc React, có thể dùng trong bất kỳ module nào.
 */

export type TimeOfDay = 'morning' | 'noon' | 'evening' | 'night';

export interface SkyStops {
  /** Màu đỉnh trời (zenith). */
  top: string;
  /** Màu chân trời (horizon). */
  horizon: string;
  /** Màu quầng sáng quanh mặt trời. */
  sunGlow: string;
}

export interface TimePreset {
  key: TimeOfDay;
  sky: SkyStops;
  /** Màu sương mù gần chân trời, hòa các toà nhà xa. */
  fog: string;
  /** Mật độ sương mù (THREE.Fog dùng exp2 hoặc tuyến tính tuỳ nơi gọi). */
  fogNear: number;
  fogFar: number;
  /** Màu ánh sáng mặt trời (DirectionalLight). */
  sunColor: string;
  /** Cường độ mặt trời, 0 là không có. */
  sunIntensity: number;
  /** Màu ánh sáng bầu trời (HemisphereLight sky). */
  hemiSky: string;
  /** Màu phản xạ từ mặt đất (HemisphereLight ground). */
  hemiGround: string;
  /** Cường độ HemisphereLight. */
  hemiIntensity: number;
  /** Vị trí mặt trời tương đối (hướng từ cảnh tới mặt trời, chưa chuẩn hoá). */
  sunDirection: [number, number, number];
  /** Màu nền kính khi nhìn từ trong phòng (điều chỉnh tông phản chiếu). */
  glassTint: string;
  /** Cường độ đèn cửa sổ và đèn xe bật (0 đến 1). Dùng để bật đèn xe vào buổi tối. */
  headlightAmount: number;
  /** Độ sáng cửa sổ của các toà nhà xa (0 đến 1), dùng cho lưới cửa đang bật đèn. */
  buildingLitAmount: number;
  /** Có dùng đèn đường hay không. */
  streetLights: boolean;
}

export const TIME_PRESETS: Record<TimeOfDay, TimePreset> = {
  morning: {
    key: 'morning',
    sky: { top: '#7fa9d6', horizon: '#f2dcc0', sunGlow: '#ffd9a0' },
    fog: '#e9d7c4',
    fogNear: 60,
    fogFar: 420,
    sunColor: '#ffd7a6',
    sunIntensity: 2.2,
    hemiSky: '#bcd4ee',
    hemiGround: '#6f6a62',
    hemiIntensity: 0.9,
    sunDirection: [-0.55, 0.42, 0.72],
    glassTint: '#7b8f9c',
    headlightAmount: 0,
    buildingLitAmount: 0.05,
    streetLights: false,
  },
  noon: {
    key: 'noon',
    sky: { top: '#4a86c8', horizon: '#c9dcea', sunGlow: '#fff4dc' },
    fog: '#c4d6e4',
    fogNear: 80,
    fogFar: 500,
    sunColor: '#fff6e8',
    sunIntensity: 2.8,
    hemiSky: '#cfe2f5',
    hemiGround: '#7d7a72',
    hemiIntensity: 1.0,
    sunDirection: [0.2, 0.9, 0.35],
    glassTint: '#6f8594',
    headlightAmount: 0,
    buildingLitAmount: 0,
    streetLights: false,
  },
  evening: {
    key: 'evening',
    sky: { top: '#2d3f74', horizon: '#f08a5a', sunGlow: '#ffb070' },
    fog: '#c98a6a',
    fogNear: 50,
    fogFar: 380,
    sunColor: '#ff9a5c',
    sunIntensity: 1.6,
    hemiSky: '#7f8fc0',
    hemiGround: '#4b4138',
    hemiIntensity: 0.6,
    sunDirection: [0.7, 0.22, -0.4],
    glassTint: '#4d5c72',
    headlightAmount: 0.85,
    buildingLitAmount: 0.45,
    streetLights: true,
  },
  night: {
    key: 'night',
    sky: { top: '#060b1e', horizon: '#1d2a4a', sunGlow: '#2b3a66' },
    fog: '#1a2440',
    fogNear: 40,
    fogFar: 320,
    sunColor: '#8fa6dd',
    sunIntensity: 0.18,
    hemiSky: '#2a3a66',
    hemiGround: '#14161c',
    hemiIntensity: 0.35,
    sunDirection: [0.3, 0.6, 0.6],
    glassTint: '#24304a',
    headlightAmount: 1,
    buildingLitAmount: 0.7,
    streetLights: true,
  },
};

/** Trả về preset cho khung giờ. Giá trị lạ được coi là 'noon'. */
export function presetFor(timeOfDay: TimeOfDay | undefined): TimePreset {
  if (timeOfDay && Object.prototype.hasOwnProperty.call(TIME_PRESETS, timeOfDay)) {
    return TIME_PRESETS[timeOfDay];
  }
  return TIME_PRESETS.noon;
}
