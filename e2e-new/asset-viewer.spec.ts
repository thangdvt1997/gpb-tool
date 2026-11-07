import { expect, test } from '@playwright/test';
import { collectErrors, mockSession, skipTour, waitForRenderedCanvas } from '/home/cc/gpb-e2e/tests/helpers.ts';

// AssetViewer: mở Thư viện, chọn nhân vật có GLB, canvas xem 3D render (có pixel khác nền), không lỗi console.
test('AssetViewer: mở thư viện, xem một GLB, canvas render, không lỗi console', async ({ page }) => {
  const errors = collectErrors(page);
  await mockSession(page);
  await page.goto('/');
  await waitForRenderedCanvas(page);
  await skipTour(page);
  await page.getByRole('complementary', { name: 'Công cụ' }).getByRole('button', { name: 'Thư viện', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Thư viện asset' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('searchbox', { name: 'Tìm asset' }).fill('nhan vat');
  const card = dlg.locator('[data-card]').first();
  await expect(card).toBeVisible();
  await card.click();
  const detail = dlg.locator('article[aria-label^="Chi tiết"]');
  await expect(detail).toBeVisible();
  const view = detail.locator('[aria-label^="Xem 3D"]');
  await expect(view).toBeVisible();
  const canvas = view.locator('canvas');
  await expect(canvas).toBeVisible();
  // Thống kê chỉ xuất hiện sau khi GLB nạp xong.
  await expect(detail.locator('dt', { hasText: /^Tam giác$/ })).toBeVisible({ timeout: 90_000 });
  await expect(detail.locator('dt', { hasText: /^Xương$/ })).toBeVisible();
  await page.waitForTimeout(1500);
  const png = await view.screenshot();
  // Ảnh không đơn sắc: có nhiều hơn một nhóm màu (nền #0b1020 + mô hình/lưới).
  const distinct = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const s = new Set<number>();
    for (let i = 0; i < d.length; i += 16) s.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
    return s.size;
  }, png.toString('base64'));
  expect(distinct, 'canvas phải có nhiều màu (đã vẽ mô hình)').toBeGreaterThan(8);
  await expect(detail.getByRole('alert').filter({ hasText: 'Không nạp được' })).toHaveCount(0);
  await dlg.getByRole('button', { name: 'Đóng thư viện' }).click();
  await expect(dlg).toBeHidden();
  expect(errors, errors.join('\n')).toEqual([]);
});
