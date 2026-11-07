import { expect, test } from '@playwright/test';
import { ctl, openScene, teleport } from './helpers';

// Task 05: camera lùi sát tường / vào góc không xuyên tường; phục hồi khi ra ngoài vùng sàn.
// Sàn 58 x 30 m, gốc giữa sàn; tường ngoài dày 0,3 m => trong nhà |x| < 28,7, |z| < 14,7.
const HALF_X = 29;
const HALF_Z = 15;

test('lùi camera sát tường và vào góc: camera không ra ngoài tường ngoài', async ({ page }) => {
  await openScene(page);
  // Góc Tây-Nam (x=-28, z=14) và vài hướng nhìn: camera nằm sau lưng nhân vật theo yaw.
  const spots = [
    [-28, 14],
    [-28, -14],
    [-5, 14.3],
    [-27.5, 0],
  ];
  for (const [x, z] of spots) {
    for (let k = 0; k < 8; k++) {
      const yaw = (k * Math.PI) / 4;
      await teleport(page, x!, z!, yaw);
      // Đợi camera theo kịp (khung hình chậm trên swiftshader): cách nhân vật dưới 12 m.
      await expect.poll(async () => { const q = await ctl(page); return Math.hypot(q.cam.eyeX - x!, q.cam.eyeZ - z!); }, { timeout: 10_000 }).toBeLessThan(1.5);
      await page.waitForTimeout(400);
      const c = await ctl(page);
      expect(Number.isFinite(c.cam.x) && Number.isFinite(c.cam.z), 'camera hữu hạn').toBe(true);
      // Không xuyên tường ngoài: camera trong hộp sàn (cho sai số nhỏ).
      expect(Math.abs(c.cam.x), `cam.x tại (${x},${z}) yaw ${k}`).toBeLessThanOrEqual(HALF_X + 0.05);
      expect(Math.abs(c.cam.z), `cam.z tại (${x},${z}) yaw ${k}`).toBeLessThanOrEqual(HALF_Z + 0.05);
      // Camera vẫn gần nhân vật (không bay mất).
      expect(Math.hypot(c.cam.x - c.x, c.cam.z - c.z)).toBeLessThan(12);
    }
  }
});

test('nhân vật bị đặt ra ngoài vùng có sàn thì được khôi phục về chỗ an toàn', async ({ page }) => {
  await openScene(page);
  await teleport(page, 80, 80, 0);
  // Ra ngoài quá 1 s thì phục hồi.
  await expect
    .poll(async () => {
      const c = await ctl(page);
      return Math.abs(c.x) < HALF_X && Math.abs(c.z) < HALF_Z;
    }, { timeout: 15_000 })
    .toBe(true);
  const c = await ctl(page);
  expect(Math.hypot(c.cam.x - c.x, c.cam.z - c.z), 'camera nhảy theo nhân vật').toBeLessThan(12);
});

test('dịch chuyển rồi camera theo kịp tới vị trí mới', async ({ page }) => {
  await openScene(page);
  await teleport(page, -10, 3, 0);
  await expect.poll(async () => { const q = await ctl(page); return Math.hypot(q.x + 10, q.z - 3); }, { timeout: 15_000 }).toBeLessThan(1.5);
  await expect.poll(async () => { const q = await ctl(page); return Math.hypot(q.cam.eyeX - q.x, q.cam.eyeZ - q.z); }, { timeout: 10_000 }).toBeLessThan(1.5);
  const c = await ctl(page);
  expect(Math.hypot(c.x + 10, c.z - 3)).toBeLessThan(1.5);
});
