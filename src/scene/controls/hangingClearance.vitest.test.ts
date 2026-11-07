import { describe, expect, it } from 'vitest';
import { BANNER, BANNER_SPOTS } from '../officePropsLayout';
import { toWorldX, toWorldZ } from '../layout';
import { hangingCameraScale } from './hangingClearance';

// Băng rôn đầu tiên: tâm (x, z) trên thế giới, mặt phẳng vuông góc trục z, dài 3 m theo x, cao 2,35–2,95 m.
const spot = BANNER_SPOTS[0];
const bx = toWorldX(spot.x);
const bz = toWorldZ(spot.y);

// Điểm nhìn ở mắt nhân vật (z = bz - 2, phía trước băng rôn) và camera ở phía bên kia (z = bz + 0,1).
// Điểm cắt nằm gần camera (t ≈ 0,95), nên độ cao điểm cắt gần bằng độ cao camera.
const EYE_Y = 1.6;
const CAM_NEAR_Z = bz + 0.1;
const FAR_SIDE_Z = bz - 2;

describe('hangingCameraScale', () => {
  it('không chặn khi điểm nhìn và camera cùng phía của băng rôn', () => {
    expect(hangingCameraScale(bx, EYE_Y, bz + 1, bx, 2.6, bz + 3)).toBe(1);
  });

  it('kéo camera lại trước băng rôn khi đoạn nhìn cắt mặt phẳng trong dải độ cao biển', () => {
    const s = hangingCameraScale(bx, EYE_Y, FAR_SIDE_Z, bx, 2.7, CAM_NEAR_Z);
    expect(s).toBeLessThan(1);
    expect(s).toBeGreaterThan(0.85);
  });

  it('không chặn khi đoạn cắt mặt phẳng phía trên đỉnh biển', () => {
    expect(hangingCameraScale(bx, 3.2, FAR_SIDE_Z, bx, 3.4, CAM_NEAR_Z)).toBe(1);
  });

  it('không chặn khi đoạn cắt mặt phẳng phía dưới đáy biển', () => {
    expect(hangingCameraScale(bx, EYE_Y, FAR_SIDE_Z, bx, 1.9, CAM_NEAR_Z)).toBe(1);
  });

  it('không chặn khi đoạn cắt mặt phẳng ngoài chiều dài biển', () => {
    // Băng kế bên cách 3,6 m (bx + 3,6 ± 1,5). Điểm bx + 1,8 nằm ngoài cả hai băng.
    const farX = bx + BANNER.width * 0.6;
    expect(hangingCameraScale(farX, EYE_Y, FAR_SIDE_Z, farX, 2.7, CAM_NEAR_Z)).toBe(1);
  });

  it('bỏ qua biển khi nhân vật đứng sát mặt phẳng (đi dưới băng rôn)', () => {
    // Điểm nhìn cách mặt phẳng 0,05 m; nếu không bỏ qua, camera co về sát nhân vật.
    expect(hangingCameraScale(bx, EYE_Y, bz + 0.05, bx, 2.7, bz - 2)).toBe(1);
  });

  it('luôn trả giá trị trong (0, 1]', () => {
    const s = hangingCameraScale(bx, EYE_Y, FAR_SIDE_Z, bx, 2.7, CAM_NEAR_Z);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});
