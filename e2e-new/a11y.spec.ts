import { expect, test, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import { collectErrors, mockSession, skipTour, waitForRenderedCanvas } from '/home/cc/gpb-e2e/tests/helpers.ts';

// axe-core cài ngoài repo (/tmp/axe-dir) để không đụng node_modules dùng chung.
const AXE = process.env.AXE_PATH || '/tmp/axe-dir/node_modules/axe-core/axe.min.js';
const SHOTS = '/tmp/mobile-shots';

async function axe(page: Page, include?: string) {
  await page.addScriptTag({ content: fs.readFileSync(AXE, 'utf8') });
  const res = await page.evaluate(async (inc) => {
    // @ts-expect-error axe do script nạp
    const r = await window.axe.run(inc ? { include: [[inc]] } : document, { resultTypes: ['violations'] });
    return r.violations.map((v: { id: string; impact: string; nodes: { target: string[]; html: string }[] }) => ({
      id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' :: ' + n.html.slice(0, 120)),
    }));
  }, include ?? null);
  return (res as { id: string; impact: string; nodes: string[] }[]).filter((v) => v.impact === 'critical' || v.impact === 'serious');
}

test('axe: màn đăng nhập không có lỗi critical/serious', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=email], input[type=password]').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/axe-login.png` });
  const v = await axe(page);
  expect(v, JSON.stringify(v, null, 1)).toEqual([]);
});

test('axe + cây truy cập: panel chính (Trợ giúp, Cài đặt, Thư viện)', async ({ page }) => {
  const errors = collectErrors(page);
  await mockSession(page);
  await page.goto('/');
  await waitForRenderedCanvas(page);
  await skipTour(page);
  const tools = page.getByRole('complementary', { name: 'Công cụ' });
  const found: unknown[] = [];

  for (const [btn, dlgName, close] of [
    ['Trợ giúp', 'Trợ giúp', 'Đóng'],
    ['Cài đặt', 'Cài đặt', 'Đóng cài đặt'],
    ['Thư viện', 'Thư viện asset', 'Đóng thư viện'],
  ] as const) {
    const opener = tools.getByRole('button', { name: btn, exact: true });
    await opener.click();
    const dlg = page.getByRole('dialog', { name: dlgName });
    await expect(dlg).toBeVisible();
    // Dialog phải có tên truy cập (qua getByRole name) và aria-modal.
    // Thư viện là hộp thoại không modal theo thiết kế (aria-modal=false); Trợ giúp và Cài đặt là modal.
    if (btn !== 'Thư viện') {
      await expect(dlg).toHaveAttribute('aria-modal', 'true');
      await expect.poll(() => dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    const snap = await page.accessibility?.snapshot?.({ root: await dlg.elementHandle() as never }).catch(() => null);
    if (snap) expect(snap.role).toBe('dialog');
    const v = await axe(page, '[role=dialog]');
    if (v.length) found.push({ dlg: dlgName, v });
    await page.screenshot({ path: `${SHOTS}/axe-${btn}.png` });
    await dlg.getByRole('button', { name: close }).click();
    await expect(dlg).toBeHidden();
  }
  expect(found, JSON.stringify(found, null, 1)).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('HelpCenter modal: focus trap, Esc đóng, trả focus về nút mở', async ({ page }) => {
  await mockSession(page);
  await page.goto('/');
  await waitForRenderedCanvas(page);
  await skipTour(page);
  const opener = page.getByRole('complementary', { name: 'Công cụ' }).getByRole('button', { name: 'Trợ giúp', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dlg = page.getByRole('dialog', { name: 'Trợ giúp' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('searchbox')).toBeFocused();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await dlg.evaluate((d) => d.contains(document.activeElement)), `Tab lần ${i + 1} ra ngoài`).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await expect(opener).toBeFocused();
});
