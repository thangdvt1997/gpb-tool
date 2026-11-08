import { expect, test, type Page } from '@playwright/test';
import { collectErrors, mockSession, skipTour, waitForRenderedCanvas } from './helpers';

// Task 02: emote của người chơi phát clip bake Emote_<id> (public/models/anim_*.glb) qua AnimationMixer.
// Đọc window.__gpbControls (?debug=controls): clipName, clipSource ('baked' | 'procedural').
// Phím 5 = tấn (hold), phím 1 = nhảy 1 (loop). Emote once (vẫy tay...) được vitest kiểm khớp từng khung với procedural. ?baked=0 -> emote vẫn chạy nhưng procedural.

interface Ctl { loco: string; clipName: string | null; clipSource: 'baked' | 'procedural' }
const read = (page: Page): Promise<Ctl> =>
  page.evaluate(() => ({ ...(window as unknown as { __gpbControls: Ctl }).__gpbControls }));

async function boot(page: Page, query: string): Promise<void> {
  await mockSession(page);
  await page.goto(`/?debug=controls${query}`);
  await waitForRenderedCanvas(page);
  await skipTour(page);
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __gpbControls?: unknown }).__gpbControls)).toBe('object');
  await page.evaluate(() => {
    (window as unknown as { __gpbControls: { teleport: unknown } }).__gpbControls.teleport = { x: -10, z: 3, yaw: 0 };
  });
  await page.waitForTimeout(1500);
}

test('emote tấn (hold) và nhảy (loop) phát clip bake rồi về Idle', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await boot(page, '');
  await expect.poll(async () => (await read(page)).clipName, { timeout: 60_000 }).toBe('Idle');

  // Tấn (phím 5) là emote hold: giữ tới khi bấm lại. Dùng hold và loop thay vì once (vẫy tay chỉ 2 s, swiftshader
  // dưới tải có thể không vẽ khung nào trong thời gian đó nên không quan sát được).
  await page.keyboard.press('5');
  await expect.poll(async () => (await read(page)).clipName, { timeout: 30_000 }).toBe('Emote_stance');
  expect((await read(page)).clipSource).toBe('baked');
  await page.keyboard.press('5');
  await expect.poll(async () => (await read(page)).clipName, { timeout: 30_000 }).toBe('Idle');

  await page.keyboard.press('1');
  await expect.poll(async () => (await read(page)).clipName, { timeout: 30_000 }).toBe('Emote_dance_1');
  expect((await read(page)).clipSource).toBe('baked');
  // emote lặp vẫn chạy sau nhiều chu kỳ (1,6 s mỗi chu kỳ).
  await page.waitForTimeout(6000);
  expect((await read(page)).clipName).toBe('Emote_dance_1');
  // đi thì hủy emote, về clip di chuyển bake.
  await page.keyboard.down('w');
  await expect.poll(async () => (await read(page)).clipName, { timeout: 30_000 }).toMatch(/^(Walk|Run)$/);
  await page.keyboard.up('w');
  expect(errors.filter((e) => !/favicon|WebSocket|ws:/i.test(e))).toEqual([]);
});

test('?baked=0 emote dùng procedural (không có clip)', async ({ page }) => {
  test.setTimeout(300_000);
  await boot(page, '&baked=0');
  await page.waitForTimeout(4000);
  await page.keyboard.press('5');
  await expect.poll(async () => (await read(page)).loco, { timeout: 30_000 }).toBe('emote');
  const c = await read(page);
  expect(c.clipSource).toBe('procedural');
  expect(c.clipName).toBeNull();
});
