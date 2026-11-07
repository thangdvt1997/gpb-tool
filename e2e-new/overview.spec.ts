import { expect, test } from '@playwright/test';
import { ctl, openScene } from './camera-helpers';

// Chế độ "Xem tổng thể" (control.txt, room.txt mục 7): phím O (đổi được trong Cài đặt) đưa camera lên cao nhìn xuống,
// trần ẩn (body[data-camera-mode=overview] -> Floorplan ẩn nhóm trần), thoát bằng O hoặc Esc thì trả camera cũ.
const CEILING_Y = 2.97;
const mode = (page: import('@playwright/test').Page) => page.evaluate(() => document.body.dataset.cameraMode ?? '');

test('O bật xem tổng thể từ trên cao, O hoặc Esc trả camera cũ', async ({ page }) => {
  await openScene(page);
  await expect.poll(() => mode(page)).toBe('thirdPerson');
  const before = (await ctl(page)).cam.y;
  expect(before).toBeLessThan(CEILING_Y + 2);

  await page.keyboard.press('KeyO');
  await expect.poll(() => mode(page)).toBe('overview');
  // Camera cao hơn trần nhiều (nhìn xuống toàn văn phòng), không nằm trong trần.
  await expect.poll(async () => (await ctl(page)).cam.y, { timeout: 20_000 }).toBeGreaterThan(CEILING_Y + 6);
  await page.screenshot({ path: '/tmp/overview-on.png' });

  await page.keyboard.press('KeyO');
  await expect.poll(() => mode(page)).toBe('thirdPerson');
  await expect.poll(async () => (await ctl(page)).cam.y, { timeout: 20_000 }).toBeLessThan(CEILING_Y + 3);

  await page.keyboard.press('KeyO');
  await expect.poll(() => mode(page)).toBe('overview');
  await page.keyboard.press('Escape');
  await expect.poll(() => mode(page)).toBe('thirdPerson');
});

test('giảm chuyển động: vẫn vào được xem tổng thể', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openScene(page);
  await page.keyboard.press('KeyO');
  await expect.poll(() => mode(page)).toBe('overview');
  await expect.poll(async () => (await ctl(page)).cam.y, { timeout: 20_000 }).toBeGreaterThan(CEILING_Y + 6);
  await page.keyboard.press('KeyO');
  await expect.poll(() => mode(page)).toBe('thirdPerson');
});

test('Cài đặt có dòng Xem tổng thể và HelpCenter có chủ đề', async ({ page }) => {
  await openScene(page);
  await page.getByRole('complementary', { name: 'Công cụ' }).getByRole('button', { name: 'Cài đặt', exact: true }).click();
  const sp = page.getByRole('dialog', { name: 'Cài đặt' });
  await expect(sp.getByText('Xem tổng thể', { exact: false }).first()).toBeVisible();
  await sp.getByRole('button', { name: 'Đóng cài đặt' }).click();
  await page.keyboard.press('F1');
  const help = page.getByRole('dialog', { name: 'Trợ giúp' });
  await help.getByRole('searchbox').fill('tong the');
  await expect(help.getByRole('heading', { name: 'Xem tổng thể văn phòng' })).toBeVisible();
  await expect(help.getByText('Nhấn O')).toBeVisible();
});
