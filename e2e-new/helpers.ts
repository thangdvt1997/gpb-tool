import type { ConsoleMessage, Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const SHOTS = '/tmp/pw-ik-shots';
fs.mkdirSync(SHOTS, { recursive: true });

/** Lỗi console nghiêm trọng: lỗi JS chưa bắt và console.error, trừ lỗi tải tài nguyên mạng (401 khi API chưa đăng nhập). */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return;
    errors.push(`console.error: ${t.slice(0, 300)}`);
  });
  return errors;
}

/** Đọc TEST_EMAIL, TEST_PASSWORD từ /home/cc/gpb-e2e/.env. Không có thì trả null (không tự tạo tài khoản). */
export function testAccount(): { email: string; password: string } | null {
  const file = '/home/cc/gpb-e2e/.env';
  if (!fs.existsSync(file)) return null;
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  return env.TEST_EMAIL && env.TEST_PASSWORD ? { email: env.TEST_EMAIL, password: env.TEST_PASSWORD } : null;
}

/**
 * Phiên giả lập: chặn GET /api/auth/me trả người dùng đã xong onboarding. Chỉ để kiểm giao diện và cảnh 3D
 * khi chưa có tài khoản test; các API khác vẫn đi tới gateway thật (trả 401).
 */
export async function mockSession(page: Page, role: 'employee' | 'it' = 'employee') {
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({
      json: {
        ok: true,
        user: { id: 'e2e-user', email: 'e2e@example.test', name: 'E2E', department: 'IT', role, tenant: { id: 't-e2e', type: 'business', name: 'GP' } },
        onboardingStep: 'done',
        appearance: null,
      },
    }),
  );
}

/**
 * Chờ canvas WebGL có nội dung. Ảnh PNG một màu (màn trống) nén còn vài KB; cảnh 3D thật lớn hơn 30 KB.
 * Trả kích thước PNG cuối cùng để ghi vào báo cáo.
 */
export async function waitForRenderedCanvas(page: Page, timeoutMs = 90_000): Promise<number> {
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: timeoutMs });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const shot = await canvas.screenshot();
    if (shot.length > 30_000) return shot.length;
    if (Date.now() > deadline) throw new Error(`canvas vẫn trống (PNG ${shot.length} byte)`);
    await page.waitForTimeout(2000);
  }
}

/** Đóng tour hướng dẫn lần đầu nếu đang mở. */
export async function skipTour(page: Page) {
  const skip = page.getByRole('button', { name: 'Bỏ qua' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}
