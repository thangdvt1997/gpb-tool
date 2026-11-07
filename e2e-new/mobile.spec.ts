import { expect, test, devices, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import { collectErrors, mockSession, skipTour, waitForRenderedCanvas } from '/home/cc/gpb-e2e/tests/helpers.ts';

// Giả lập điện thoại (Playwright devices, hasTouch) ở hai chiều màn hình. Đây là giả lập trên Chromium,
// KHÔNG thay cho máy thật (cảm ứng đa điểm, bàn phím ảo, WebGL thật của iOS chưa kiểm chứng).
const SHOTS = '/tmp/mobile-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const PROFILES = [
  { name: 'pixel7', dev: devices['Pixel 7'] },
  { name: 'iphone13', dev: devices['iPhone 13'] },
];
const ORIENT = [
  { o: 'doc', swap: false },
  { o: 'ngang', swap: true },
];

async function noHScroll(page: Page, sel = 'html') {
  const r = await page.evaluate((s) => {
    const e = document.querySelector(s) as HTMLElement;
    return { sw: e.scrollWidth, cw: e.clientWidth };
  }, sel);
  expect(r.sw, `${sel} tràn ngang`).toBeLessThanOrEqual(r.cw);
}

async function smallTargets(page: Page, scope: string) {
  return page.evaluate((s) => {
    const out: string[] = [];
    document.querySelectorAll(`${s} button, ${s} [role=tab], ${s} input:not([type=hidden])`).forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const type = (el as HTMLInputElement).type;
      if (type === 'checkbox' || type === 'range' || type === 'radio') {
        // Nhãn bao quanh là vùng chạm thật.
        const l = el.closest('label')?.getBoundingClientRect();
        if (l && l.height >= 44) return;
      }
      if (r.height < 44 || r.width < 44) out.push(`${el.tagName} "${(el.textContent || (el as HTMLInputElement).placeholder || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out;
  }, scope);
}

for (const p of PROFILES) {
  for (const or of ORIENT) {
    test(`điện thoại ${p.name} ${or.o}: vào văn phòng, joystick, Trợ giúp, Cài đặt`, async ({ browser }) => {
      const vp = or.swap ? { width: p.dev.viewport.height, height: p.dev.viewport.width } : p.dev.viewport;
      const ctx = await browser.newContext({ ...p.dev, viewport: vp });
      const page = await ctx.newPage();
      const errors = collectErrors(page);
      await mockSession(page);
      await page.goto('/');
      await waitForRenderedCanvas(page);
      // Tour lần đầu hiện hơi trễ và tạm dừng điều khiển (không có joystick) cho tới khi bỏ qua.
      const skip = page.getByRole('button', { name: 'Bỏ qua' });
      await skip.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
      await skipTour(page);
      await noHScroll(page);
      await page.screenshot({ path: `${SHOTS}/${p.name}-${or.o}-1-canh.png` });

      // Trợ giúp: mở bằng chạm, là dialog modal.
      const tools = page.getByRole('complementary', { name: 'Công cụ' });
      await tools.getByRole('button', { name: 'Trợ giúp', exact: true }).tap();
      const help = page.getByRole('dialog', { name: 'Trợ giúp' });
      await expect(help).toBeVisible();
      await expect(help).toHaveAttribute('aria-modal', 'true');
      await noHScroll(page);
      await noHScroll(page, '.help-center');
      expect(await smallTargets(page, '.help-center'), 'nút Trợ giúp < 44px').toEqual([]);
      await page.screenshot({ path: `${SHOTS}/${p.name}-${or.o}-2-troGiup.png` });
      await help.getByRole('button', { name: 'Đóng' }).tap();
      await expect(help).toBeHidden();

      // Cài đặt dùng được: mở, đổi tab, bật một checkbox, đóng.
      await tools.getByRole('button', { name: 'Cài đặt', exact: true }).tap();
      const sp = page.getByRole('dialog', { name: 'Cài đặt' });
      await expect(sp).toBeVisible();
      await noHScroll(page);
      await noHScroll(page, '.sp-dialog');
      const tabs = sp.getByRole('tab');
      const n = await tabs.count();
      expect(n).toBeGreaterThan(1);
      await tabs.nth(1).tap();
      await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
      const small = await smallTargets(page, '.sp-dialog');
      expect(small, 'mục Cài đặt < 44px').toEqual([]);
      await page.screenshot({ path: `${SHOTS}/${p.name}-${or.o}-3-caiDat.png` });
      await sp.getByRole('button', { name: 'Đóng cài đặt' }).tap();
      await expect(sp).toBeHidden();
      expect(errors, errors.join('\n')).toEqual([]);
      await ctx.close();
    });
  }
}

// Joystick cảm ứng: kéo thì nhân vật di chuyển (đọc vị trí qua ?debug=controls). Dùng chuột Playwright sinh
// pointer events (joystick lắng nghe PointerEvent, không phân biệt loại con trỏ).
test('joystick cảm ứng hiện và kéo thì nhân vật di chuyển', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await mockSession(page);
  await page.goto('/?debug=controls');
  await waitForRenderedCanvas(page);
  const skip = page.getByRole('button', { name: 'Bỏ qua' });
  await skip.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
  await skipTour(page);
  const joy = page.locator('.ctl-joystick');
  await expect(joy).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nhảy', exact: true })).toBeVisible();
  const pos = () => page.evaluate(() => {
    const h = (window as unknown as { __gpbControls: { x: number; z: number } }).__gpbControls;
    return { x: h.x, z: h.z };
  });
  await expect.poll(async () => (await pos()).x !== 0 || (await pos()).z !== 0, { timeout: 30_000 }).toBe(true);
  const a = await pos();
  const box = (await joy.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - box.width / 2 + 2, { steps: 5 });
  await page.waitForTimeout(2500);
  const b = await pos();
  await page.mouse.up();
  const moved = Math.hypot(b.x - a.x, b.z - a.z);
  expect(moved, `nhân vật phải di chuyển khi kéo joystick (${moved.toFixed(2)} m)`).toBeGreaterThan(0.2);
  await page.screenshot({ path: `${SHOTS}/joystick.png` });
  expect(errors, errors.join('\n')).toEqual([]);
  await ctx.close();
});
