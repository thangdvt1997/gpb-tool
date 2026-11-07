import { expect, test, type Page } from '@playwright/test';
import { SHOTS, collectErrors, mockSession, skipTour, waitForRenderedCanvas } from './helpers';

// IK mặc định bật (TASK 03): ngồi ghế với IK, không lỗi console, không NaN trong xương, hông khớp mặt ghế.
// Hook debug: ?debug=ik -> window.__gpbIK. Tắt IK: ?ik=0.
const CHAIR = { x: -25.9, z: 4.4, yaw: Math.PI };

type Pos = { x: number; z: number; yaw: number };
interface IkDebug { frames: number; sitFrames: number; nanBones: number; pelvisY: number; floorY: number; footY: [number, number] }
const readIk = (page: Page) => page.evaluate(() => (window as unknown as { __gpbIK?: IkDebug }).__gpbIK ?? null);

/** Ghi vị trí nhân vật vào bản lưu IndexedDB (gpb-office/snapshots) rồi lần tải sau đặt nhân vật ở đó (TASK 06). */
async function seedPosition(page: Page, pos: Pos) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const req = indexedDB.open('gpb-office', 1);
              req.onsuccess = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('snapshots')) return resolve(0);
                const r = db.transaction('snapshots').objectStore('snapshots').count();
                r.onsuccess = () => resolve(r.result);
                r.onerror = () => resolve(0);
              };
              req.onerror = () => resolve(0);
            }),
        ),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  await page.evaluate(
    (p) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('gpb-office', 1);
        req.onsuccess = () => {
          const tx = req.result.transaction('snapshots', 'readwrite');
          const store = tx.objectStore('snapshots');
          const all = store.getAll();
          all.onsuccess = () => {
            for (const row of all.result as { raw: { character: { position: unknown } } }[]) {
              row.raw.character.position = p;
              store.put(row);
            }
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    pos,
  );
}

/** Mở app, đặt nhân vật ở pos (qua bản lưu), tải lại và chờ gợi ý E. */
async function openAt(page: Page, pos: Pos, query: string) {
  await page.goto(`/${query}`);
  await waitForRenderedCanvas(page);
  await skipTour(page);
  await seedPosition(page, pos);
  await page.goto(`/${query}`);
  await waitForRenderedCanvas(page);
  await skipTour(page);
  await expect(page.locator('.ix-prompt')).toBeVisible({ timeout: 60_000 });
}

const promptText = async (page: Page) => ((await page.locator('.ix-prompt').innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

async function sit(page: Page) {
  await page.keyboard.press('e');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem').filter({ hasText: 'Ngồi xuống' }).click();
  await expect.poll(() => promptText(page), { timeout: 20_000 }).toMatch(/Đứng dậy/);
}

test('IK mặc định: ngồi ghế, chụp ảnh, không lỗi console, không NaN, hông ở mặt ghế', async ({ page }) => {
  const errors = collectErrors(page);
  await mockSession(page);
  await openAt(page, CHAIR, '?debug=ik');
  await sit(page);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/23-ik-seated.png` });
  const d = await readIk(page);
  expect(d, 'hook __gpbIK').not.toBeNull();
  console.log('IK debug', JSON.stringify(d));
  expect(d!.frames, 'IK chạy mặc định (không cần ?ik=1)').toBeGreaterThan(10);
  expect(d!.sitFrames).toBeGreaterThan(10);
  expect(d!.nanBones).toBe(0);
  for (const v of [d!.pelvisY, d!.floorY, ...d!.footY]) expect(Number.isFinite(v)).toBe(true);
  // Hông: mặt ghế 0,46 + 0,10 so với sàn (sai số 6 cm); mắt cá không chui xuống sàn.
  expect(Math.abs(d!.pelvisY - d!.floorY - 0.56)).toBeLessThan(0.06);
  for (const y of d!.footY) expect(y - d!.floorY).toBeGreaterThan(-0.02);
  await page.keyboard.press('e');
  await expect.poll(() => promptText(page), { timeout: 20_000 }).not.toMatch(/Đứng dậy/);
  await page.waitForTimeout(1000);
  expect((await readIk(page))!.nanBones).toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('?ik=0 tắt IK', async ({ page }) => {
  const errors = collectErrors(page);
  await mockSession(page);
  await page.goto('/?ik=0&debug=ik');
  await waitForRenderedCanvas(page);
  await skipTour(page);
  await page.waitForTimeout(2500);
  const d = await readIk(page);
  expect(d === null || d.frames === 0).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});
