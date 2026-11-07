import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as net from 'node:net';

// TASK 23-27 bằng HAI trình duyệt thật (hai browser context) với stack cục bộ:
//   world 127.0.0.1:3903 (scripts/e2e/world-local.sh) + auth TEST 127.0.0.1:3902 + vite preview có GPB_PREVIEW_WORLD_API.
// Tự bỏ qua khi thiếu .env (TEST_EMAIL/2, TEST_PASSWORD/2) hoặc world 3903 không chạy.
// Không dùng auth production.

function readEnv(): Record<string, string> {
  const file = '/home/cc/gpb-e2e/.env';
  const env: Record<string, string> = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  return env;
}
const env = readEnv();
const accA = env.TEST_EMAIL && env.TEST_PASSWORD ? { email: env.TEST_EMAIL, password: env.TEST_PASSWORD } : null;
const accB = env.TEST_EMAIL2 && env.TEST_PASSWORD2 ? { email: env.TEST_EMAIL2, password: env.TEST_PASSWORD2 } : null;

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

interface W {
  state: string; selfId: string | null; role: string;
  players: { id: string; name: string; x: number; z: number }[];
  chat: { from: string; text: string; channel: string; status: string }[];
  leases: { resource: string; ownerId: string | null }[];
  chairs: string[]; character: string;
  occupant(id: string): string; sit(id: string): boolean; stand(): boolean; dropSocket(): void;
}
const snap = (p: Page) =>
  p.evaluate(() => {
    const w = (window as unknown as { __gpbWorld: W }).__gpbWorld;
    return { state: w.state, selfId: w.selfId, role: w.role, players: w.players, chat: w.chat, leases: w.leases, chairs: w.chairs, character: w.character };
  });

async function login(page: Page, acc: { email: string; password: string }) {
  await page.goto('/?world=1&debug=controls');
  await page.getByLabel('Email').fill(acc.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(acc.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __gpbWorld?: unknown }).__gpbWorld), { timeout: 120_000 }).toBe('object');
  const skip = page.getByRole('button', { name: 'Bỏ qua' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect.poll(async () => (await snap(page)).state, { timeout: 60_000 }).toBe('connected');
}

test.describe.serial('nhiều người (TASK 23-27), hai trình duyệt', () => {
  let ctxA: BrowserContext, ctxB: BrowserContext, A: Page, B: Page;
  let idA = '', idB = '';

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    test.setTimeout(300_000);
    test.skip(!accA || !accB, 'chưa kiểm chứng: thiếu TEST_EMAIL/TEST_PASSWORD hoặc TEST_EMAIL2/TEST_PASSWORD2 trong /home/cc/gpb-e2e/.env');
    test.skip(!(await portOpen(3903)), 'chưa kiểm chứng: world 127.0.0.1:3903 không chạy (scripts/e2e/world-local.sh start)');
    const opt = { viewport: { width: 1000, height: 700 }, locale: 'vi-VN' };
    ctxA = await browser.newContext(opt);
    ctxB = await browser.newContext(opt);
    A = await ctxA.newPage();
    B = await ctxB.newPage();
    await login(A, accA!);
    await login(B, accB!);
    idA = (await snap(A)).selfId!;
    idB = (await snap(B)).selfId!;
  });
  test.afterAll(async () => {
    await ctxA?.close();
    await ctxB?.close();
  });

  test('presence: A và B thấy nhau, B di chuyển thì A thấy vị trí đổi', async () => {
    expect(idA).not.toBe(idB);
    await expect.poll(async () => (await snap(A)).players.map((p) => p.id)).toContain(idB);
    await expect.poll(async () => (await snap(B)).players.map((p) => p.id)).toContain(idA);
    const posOf = async () => (await snap(A)).players.find((p) => p.id === idB)!;
    const before = await posOf();
    // Di chuyển B theo bước nhỏ (0.4 m mỗi 250 ms, dưới giới hạn tốc độ server) bằng teleport debug của controls.
    const start = await B.evaluate(() => { const c = (window as unknown as { __gpbControls: { x: number; z: number } }).__gpbControls; return { x: c.x, z: c.z }; });
    for (let i = 1; i <= 12; i++) {
      await B.evaluate(([x, z]) => { (window as unknown as { __gpbControls: { teleport: unknown } }).__gpbControls.teleport = { x, z, yaw: 0 }; }, [start.x + 0.4 * i, start.z]);
      await B.waitForTimeout(250);
    }
    await expect.poll(async () => { const p = await posOf(); return Math.hypot(p.x - before.x, p.z - before.z); }, { timeout: 15_000 }).toBeGreaterThan(0.5);
  });

  test('chat chữ A -> B, B trả lời, tin hiển thị như chữ thuần', async () => {
    const msg = `xin chao <b>${Date.now()}</b>`;
    await A.getByLabel('Nội dung tin nhắn').fill(msg);
    await A.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(B.getByText(msg, { exact: true })).toBeVisible({ timeout: 15_000 });
    expect(await B.locator('section[aria-label="Trò chuyện"] b').count()).toBe(0);
    const reply = `tra loi ${Date.now()}`;
    await B.getByLabel('Nội dung tin nhắn').fill(reply);
    await B.getByLabel('Nội dung tin nhắn').press('Enter');
    await expect(A.getByText(reply, { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('lease ghế: B chiếm ghế thì A không chiếm được; B đứng dậy thì A chiếm được', async () => {
    const chairs = (await snap(B)).chairs;
    expect(chairs.length, 'cảnh phải có ghế').toBeGreaterThan(0);
    const chair = chairs[0]!;
    expect(await B.evaluate((c) => (window as unknown as { __gpbWorld: W }).__gpbWorld.sit(c), chair)).toBe(true);
    await expect.poll(async () => (await snap(B)).leases.find((l) => l.resource.startsWith('seat:'))?.ownerId, { timeout: 15_000 }).toBe(idB);
    // A thấy ghế có chủ là B.
    await expect.poll(async () => (await snap(A)).leases.find((l) => l.resource.startsWith('seat:'))?.ownerId, { timeout: 15_000 }).toBe(idB);
    await A.evaluate((c) => (window as unknown as { __gpbWorld: W }).__gpbWorld.sit(c), chair);
    await expect(A.getByText('Ghế đã có người').first()).toBeVisible({ timeout: 10_000 });
    expect((await snap(A)).leases.find((l) => l.resource.startsWith('seat:'))?.ownerId).toBe(idB);
    expect(await A.evaluate(() => (window as unknown as { __gpbWorld: W }).__gpbWorld.character)).not.toBe('seated');
    // B đứng dậy -> lease nhả, A chiếm được.
    await B.evaluate(() => (window as unknown as { __gpbWorld: W }).__gpbWorld.stand());
    await expect.poll(async () => (await snap(A)).leases.find((l) => l.resource.startsWith('seat:'))?.ownerId ?? null, { timeout: 15_000 }).toBeNull();
    await A.evaluate((c) => (window as unknown as { __gpbWorld: W }).__gpbWorld.sit(c), chair);
    await expect.poll(async () => (await snap(B)).leases.find((l) => l.resource.startsWith('seat:'))?.ownerId, { timeout: 15_000 }).toBe(idA);
    await A.evaluate(() => (window as unknown as { __gpbWorld: W }).__gpbWorld.stand());
  });

  test('vai trò phòng: hai tài khoản employee đều là member, không có bảng quản lý thành viên', async () => {
    expect((await snap(A)).role).toBe('member');
    expect((await snap(B)).role).toBe('member');
    // Chỉ owner mới thấy nút quản lý; đổi vai trò/can() phủ bằng node --test của services/world (cần tài khoản admin để kiểm bằng UI).
    await expect(A.getByRole('button', { name: /thành viên/i })).toHaveCount(0);
  });

  test('rớt kết nối rồi resume: A vẫn thấy B, tin nhắn tiếp tục chạy', async () => {
    await A.evaluate(() => (window as unknown as { __gpbWorld: W }).__gpbWorld.dropSocket());
    await expect.poll(async () => (await snap(A)).state, { timeout: 10_000 }).not.toBe('connected');
    await expect.poll(async () => (await snap(A)).state, { timeout: 60_000 }).toBe('connected');
    await expect.poll(async () => (await snap(A)).players.map((p) => p.id), { timeout: 15_000 }).toContain(idB);
    expect((await snap(A)).selfId).toBe(idA);
    // Mất mạng thật (offline) rồi có lại.
    await ctxA.setOffline(true);
    await A.evaluate(() => (window as unknown as { __gpbWorld: W }).__gpbWorld.dropSocket());
    await expect.poll(async () => (await snap(A)).state, { timeout: 15_000 }).not.toBe('connected');
    await ctxA.setOffline(false);
    await expect.poll(async () => (await snap(A)).state, { timeout: 90_000 }).toBe('connected');
    await expect.poll(async () => (await snap(A)).players.map((p) => p.id), { timeout: 15_000 }).toContain(idB);
    const msg = `sau resume ${Date.now()}`;
    await A.getByLabel('Nội dung tin nhắn').fill(msg);
    await A.getByLabel('Nội dung tin nhắn').press('Enter');
    await expect(B.getByText(msg, { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});
