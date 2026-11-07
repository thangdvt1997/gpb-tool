import { expect, type Page } from '@playwright/test';

export interface Ctl {
  x: number;
  z: number;
  speed: number;
  seated: boolean;
  teleport: { x: number; z: number; yaw: number } | null;
  cam: { x: number; y: number; z: number; eyeX: number; eyeZ: number };
}

export const ctl = (page: Page): Promise<Ctl> =>
  page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __gpbControls: unknown }).__gpbControls)) as never);

export async function openScene(page: Page): Promise<void> {
  await mockSession(page);
  await page.goto('/?debug=controls');
  await waitForRenderedCanvas(page);
  await skipTour(page);
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __gpbControls?: unknown }).__gpbControls)).toBe('object');
  await page.waitForTimeout(2500);
}

export const teleport = (page: Page, x: number, z: number, yaw: number): Promise<void> =>
  page.evaluate(([a, b, c]) => {
    (window as unknown as { __gpbControls: { teleport: unknown } }).__gpbControls.teleport = { x: a, z: b, yaw: c };
  }, [x, z, yaw] as const);

/** Phiên giả lập (xem /home/cc/gpb-e2e/tests/helpers.ts). */
async function mockSession(page: Page): Promise<void> {
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({
      json: {
        ok: true,
        user: { id: 'e2e-user', email: 'e2e@example.test', name: 'E2E', department: 'IT', role: 'employee', tenant: { id: 't-e2e', type: 'business', name: 'GP' } },
        onboardingStep: 'done',
        appearance: null,
      },
    }),
  );
}

async function waitForRenderedCanvas(page: Page, timeoutMs = 90_000): Promise<void> {
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: timeoutMs });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if ((await canvas.screenshot()).length > 30_000) return;
    if (Date.now() > deadline) throw new Error('canvas vẫn trống');
    await page.waitForTimeout(2000);
  }
}

async function skipTour(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: 'Bỏ qua' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}
