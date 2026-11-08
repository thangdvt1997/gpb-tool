import { expect, test, type Page } from '@playwright/test';
import { collectErrors, mockSession, skipTour, waitForRenderedCanvas } from '/home/cc/gpb-e2e/tests/helpers.ts';

// Lỗi NVDA thật đợt 1-3 (07/11): đóng Phòng thay đồ/Cài đặt bằng Esc, NVDA vẫn đọc "expanded"; Sao lưu không đóng bằng Esc.
// Kiểm mỗi nút HUD: mở bằng chuột (như chủ dự án), đóng bằng Esc và bằng nút đóng; sau khi đóng aria-expanded="false",
// focus về nút, và tại thời điểm focus đến nút thì aria-expanded đã là "false" (NVDA đọc trạng thái lúc nhận focus).

async function enter(page: Page) {
  await mockSession(page);
  await page.goto('/');
  await waitForRenderedCanvas(page);
  await skipTour(page);
}

const tools = (page: Page) => page.getByRole('complementary', { name: 'Công cụ' });

const BUTTONS: { opener: string; panel: RegExp; close: RegExp; expanded: boolean }[] = [
  { opener: 'Thư viện', panel: /Thư viện/, close: /^Đóng thư viện/, expanded: true },
  { opener: 'Hồ sơ', panel: /Hồ sơ/, close: /^Đóng/, expanded: true },
  { opener: 'Sao lưu', panel: /sao lưu/i, close: /^Đóng bảng sao lưu/, expanded: true },
  { opener: 'Phòng thay đồ', panel: /Phòng thay đồ/, close: /^Hủy|^Đóng|Thoát/, expanded: true },
  { opener: 'Vẽ xăm', panel: /xăm/i, close: /^Đóng xưởng xăm/, expanded: true },
  { opener: 'Cài đặt', panel: /Cài đặt/, close: /^Đóng cài đặt/, expanded: true },
  { opener: 'Trợ giúp', panel: /Trợ giúp/, close: /^Đóng/, expanded: true },
];
// Hộp modal: bắt buộc focus vào trong khi mở bằng Enter (Trợ giúp thiếu bước này ở production 08/11).
// Panel không modal (aria-modal="false") giữ focus ở nút mở, kiểu disclosure.
const MODAL = new Set(['Phòng thay đồ', 'Cài đặt', 'Trợ giúp']);

async function watchFocus(page: Page, name: string) {
  await tools(page).getByRole('button', { name, exact: true }).evaluate((b) => {
    const w = window as unknown as { __focusExpanded: (string | null)[] };
    w.__focusExpanded = [];
    b.addEventListener('focus', () => w.__focusExpanded.push(b.getAttribute('aria-expanded')));
  });
}
const focusLog = (page: Page) => page.evaluate(() => (window as unknown as { __focusExpanded: (string | null)[] }).__focusExpanded);

for (const b of BUTTONS) {
  for (const how of ['Esc', 'nút đóng'] as const) {
    test(`HUD "${b.opener}": mở bằng chuột, đóng bằng ${how}, aria-expanded và focus`, async ({ page }) => {
      const errors = collectErrors(page);
      await enter(page);
      const opener = tools(page).getByRole('button', { name: b.opener, exact: true });
      await watchFocus(page, b.opener);
      await opener.click();
      const panel = page.getByRole('dialog', { name: b.panel }).or(page.getByRole('region', { name: b.panel })).first();
      await expect(panel).toBeVisible();
      if (b.expanded) await expect(opener).toHaveAttribute('aria-expanded', 'true');
      else await expect(opener).toHaveAttribute('aria-haspopup', 'dialog');
      if (how === 'Esc') await page.keyboard.press('Escape');
      else await panel.getByRole('button', { name: b.close }).first().click();
      await expect(panel).toBeHidden();
      if (b.expanded) await expect(opener).toHaveAttribute('aria-expanded', 'false');
      await expect(opener).toBeFocused();
      // Lần nhận focus cuối cùng của nút phải thấy trạng thái đã đóng.
      const log = await focusLog(page);
      expect(log.length, 'nút không nhận lại focus').toBeGreaterThan(0);
      if (b.expanded) expect(log[log.length - 1], `aria-expanded lúc nhận focus: ${JSON.stringify(log)}`).toBe('false');
      // Cây trợ năng của Chrome: nút không còn ở trạng thái expanded.
      const snap = await opener.ariaSnapshot();
      expect(snap).not.toMatch(/\[expanded(=true)?\]/);
      expect(errors, errors.join('\n')).toEqual([]);
    });
  }
}

// Kiểm độc lập 08/11 trên production: Trợ giúp thiếu aria-expanded và mở bằng Enter thì focus không vào hộp.
// Mọi nút HUD: Enter mở -> aria-expanded="true" (khác null), hộp modal nhận focus bên trong; Esc -> "false", focus về nút.
for (const b of BUTTONS) {
  test(`HUD "${b.opener}": mở bằng Enter, focus vào hộp, Esc trả focus và aria-expanded`, async ({ page }) => {
    const errors = collectErrors(page);
    await enter(page);
    const opener = tools(page).getByRole('button', { name: b.opener, exact: true });
    await expect(opener).toHaveAttribute('aria-expanded', 'false');
    await opener.focus();
    await page.keyboard.press('Enter');
    const panel = page.getByRole('dialog', { name: b.panel }).or(page.getByRole('region', { name: b.panel })).first();
    await expect(panel).toBeVisible();
    await expect(opener).toHaveAttribute('aria-expanded', 'true');
    const modal = MODAL.has(b.opener);
    await expect(panel).toHaveAttribute('aria-modal', modal ? 'true' : 'false');
    if (modal) await expect
      .poll(() => panel.evaluate((p) => document.activeElement !== document.body && p.contains(document.activeElement)), {
        message: 'focus phải nằm trong hộp sau khi mở bằng Enter',
      })
      .toBe(true);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(opener).toHaveAttribute('aria-expanded', 'false');
    await expect(opener).toBeFocused();
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
