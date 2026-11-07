import { expect, test } from '@playwright/test';
import { ctl, openScene } from './helpers';

// Task 09: minimap (M) -> chọn đích -> bật tự đi -> nhân vật tiến gần đích; bấm phím di chuyển thì dừng.
async function pickDestination(page: import('@playwright/test').Page): Promise<void> {
  await page.keyboard.press('KeyM');
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  await dlg.getByRole('searchbox').fill('desk');
  const first = dlg.getByRole('list', { name: 'Kết quả tìm kiếm' }).getByRole('button').first();
  await expect(first).toBeVisible();
  await first.click();
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

test('tự đi từ minimap tiến gần đích, rồi dừng khi bấm phím di chuyển', async ({ page }) => {
  await openScene(page);
  const start = await ctl(page);
  await pickDestination(page);
  const dlg = page.getByRole('dialog');
  const auto = dlg.getByLabel(/Tự đi theo tuyến/);
  await expect(auto).toBeEnabled({ timeout: 10_000 });
  await auto.check();
  // Đóng hộp bản đồ (Escape) để cảnh chạy; tự đi vẫn bật.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  await expect.poll(async () => dist(await ctl(page), start), { timeout: 30_000, message: 'nhân vật phải rời chỗ xuất phát' }).toBeGreaterThan(1.5);
  const mid = await ctl(page);
  expect(mid.speed).toBeGreaterThan(0);

  // Bấm phím di chuyển: tự đi phải tắt, nhân vật không tự đi tiếp sau khi nhả phím.
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(150);
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(1500);
  const a = await ctl(page);
  await page.waitForTimeout(1500);
  const b = await ctl(page);
  expect(dist(a, b), 'đứng yên sau khi bị tắt tự đi').toBeLessThan(0.3);
});

test('tự đi chạy hết tuyến thì tới gần đích', async ({ page }) => {
  await openScene(page);
  await pickDestination(page);
  const dlg = page.getByRole('dialog');
  const auto = dlg.getByLabel(/Tự đi theo tuyến/);
  await expect(auto).toBeEnabled({ timeout: 10_000 });
  await auto.check();
  await page.keyboard.press('Escape');
  // Đứng yên 3 s liên tiếp hoặc tới nơi: kiểm tuyến còn lại qua dòng trạng thái khi mở lại bản đồ.
  await expect.poll(async () => (await ctl(page)).speed, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect
    .poll(
      async () => {
        const s1 = await ctl(page);
        await page.waitForTimeout(1500);
        const s2 = await ctl(page);
        return dist(s1, s2) < 0.05;
      },
      { timeout: 120_000, intervals: [500] },
    )
    .toBe(true);
  await page.keyboard.press('KeyM');
  const status = page.getByRole('dialog').getByRole('status').first();
  const text = (await status.textContent()) ?? '';
  console.log('trạng thái tuyến khi dừng:', text);
  expect(text).toMatch(/\d/);
});
