import { expect, test } from '@playwright/test';
import { ctl, openScene } from './camera-helpers';

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

test.setTimeout(280_000);
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

test('tự đi chạy hết tuyến tới đích (cách đích < 1,5 m hoặc báo tới nơi)', async ({ page }) => {
  await openScene(page);
  await pickDestination(page);
  const dlg = page.getByRole('dialog');
  const auto = dlg.getByLabel(/Tự đi theo tuyến/);
  await expect(auto).toBeEnabled({ timeout: 10_000 });
  await auto.check();
  await page.keyboard.press('Escape');
  const nav = () => page.evaluate(() => (window as unknown as { __gpbNav: { goal: { x: number; z: number } | null; dest: { x: number; z: number } | null; autoWalk: boolean; autoWalkStopped: string | null; arrived: boolean; remaining: number | null } }).__gpbNav);
  // Chờ tự đi tắt (tới nơi thì tắt không kèm lý do lỗi). Máy chậm nên cho tối đa 4 phút.
  await expect.poll(async () => (await nav()).autoWalk, { timeout: 230_000, intervals: [1000] }).toBe(false);
  const n = await nav();
  const c = await ctl(page);
  const goal = n.goal!;
  const d = dist(c, goal);
  console.log('dừng tại', c.x.toFixed(2), c.z.toFixed(2), 'điểm đứng đích', goal.x, goal.z, 'cách', d.toFixed(2), 'còn', n.remaining, 'lý do', n.autoWalkStopped);
  expect(n.autoWalkStopped, 'không bị tắt vì kẹt').toBeNull();
  expect(n.arrived || d < 1.5, 'tới nơi hoặc cách đích < 1,5 m').toBe(true);
});
