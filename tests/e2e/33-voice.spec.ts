import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as net from 'node:net';

// TASK 25b: thoại WebRTC giữa HAI trình duyệt Chromium (micro giả: --use-fake-device-for-media-stream).
// Stack cục bộ: world (mặc định cổng 3903, đổi bằng VOICE_WORLD_PORT) có TURN_SECRET/TURN_URLS + auth TEST 127.0.0.1:3902 + vite preview
// (GPB_PREVIEW_WORLD_API trỏ về world đó). Không dùng auth production. Tự bỏ qua khi thiếu .env hoặc world không chạy.
// Kiểm: getUserMedia chỉ chạy sau khi bấm nút; RTCPeerConnection connected ở cả hai phía; getStats inbound-rtp audio bytesReceived > 0.

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
const WORLD_PORT = Number(process.env.VOICE_WORLD_PORT || 3903);

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

interface PeerStat { id: string; state: string; connectionState: string; bytesReceived: number; packetsReceived: number; audioTracks: number }
interface V { status: string; peers: { id: string; state: string }[]; stats(): Promise<PeerStat[]>; gains(): Record<string, number> }
const voice = (p: Page) => p.evaluate(() => { const v = (window as unknown as { __gpbVoice: V }).__gpbVoice; return { status: v.status, peers: v.peers }; });
const stats = (p: Page) => p.evaluate(() => (window as unknown as { __gpbVoice: V }).__gpbVoice.stats());
const gums = (p: Page) => p.evaluate(() => (window as unknown as { __gumCalls: number }).__gumCalls);

async function login(page: Page, acc: { email: string; password: string }) {
  await page.addInitScript(() => {
    (window as unknown as { __gumCalls: number }).__gumCalls = 0;
    const md = navigator.mediaDevices;
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = (c) => { (window as unknown as { __gumCalls: number }).__gumCalls += 1; return orig(c); };
  });
  await page.goto('/?world=1&debug=controls');
  await page.getByLabel('Email').fill(acc.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(acc.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __gpbWorld?: unknown }).__gpbWorld), { timeout: 120_000 }).toBe('object');
  const skip = page.getByRole('button', { name: 'Bỏ qua' });
  if (await skip.isVisible().catch(() => false)) await skip.click({ force: true, timeout: 10_000 }).catch(() => undefined);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __gpbWorld: { state: string } }).__gpbWorld.state), { timeout: 150_000 }).toBe('connected');
}

test.describe.serial('thoại WebRTC (TASK 25b), hai trình duyệt', () => {
  let ctxA: BrowserContext, ctxB: BrowserContext, A: Page, B: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    test.setTimeout(560_000);
    test.skip(!accA || !accB, 'chưa kiểm chứng: thiếu TEST_EMAIL/TEST_PASSWORD hoặc TEST_EMAIL2/TEST_PASSWORD2 trong /home/cc/gpb-e2e/.env');
    test.skip(!(await portOpen(WORLD_PORT)), `chưa kiểm chứng: world 127.0.0.1:${WORLD_PORT} không chạy`);
    const opt = { viewport: { width: 1000, height: 700 }, locale: 'vi-VN', permissions: ['microphone'] };
    ctxA = await browser.newContext(opt);
    ctxB = await browser.newContext(opt);
    A = await ctxA.newPage();
    B = await ctxB.newPage();
    await login(A, accA!);
    await login(B, accB!);
  });
  test.afterAll(async () => {
    await ctxA?.close();
    await ctxB?.close();
  });

  test('mic chỉ xin khi bấm; nút có aria-pressed và nhãn tiếng Việt', async () => {
    await expect.poll(async () => (await A.evaluate(() => (window as unknown as { __gpbWorld: { players: unknown[] } }).__gpbWorld.players.length)), { timeout: 60_000 }).toBeGreaterThan(0);
    expect(await gums(A)).toBe(0);
    expect(await gums(B)).toBe(0);
    const btn = A.getByRole('button', { name: 'Bật mic', exact: true });
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await expect(btn).toBeEnabled();
  });

  test('bật mic hai bên: PeerConnection connected và nhận audio (getStats bytesReceived > 0)', async () => {
    await A.getByRole('button', { name: 'Bật mic', exact: true }).click();
    await B.getByRole('button', { name: 'Bật mic', exact: true }).click();
    for (const P of [A, B]) {
      await expect(P.getByRole('button', { name: 'Tắt mic', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
      await expect(P.locator('[role="status"][aria-live="polite"]').filter({ hasText: 'Đã bật mic' })).toHaveCount(1);
      expect(await gums(P)).toBe(1);
    }
    for (const P of [A, B]) {
      await expect.poll(async () => (await voice(P)).peers.map((p) => p.state), { timeout: 90_000, message: 'peer connected' }).toEqual(['connected']);
      await expect.poll(async () => (await stats(P))[0]?.connectionState, { timeout: 30_000 }).toBe('connected');
      await expect.poll(async () => (await stats(P))[0]?.bytesReceived ?? 0, { timeout: 30_000, message: 'bytesReceived > 0' }).toBeGreaterThan(0);
    }
    const sa = (await stats(A))[0]!, sb = (await stats(B))[0]!;
    expect(sa.audioTracks).toBeGreaterThan(0);
    expect(sb.audioTracks).toBeGreaterThan(0);
    console.log(`VOICE_STATS A.recv bytes=${sa.bytesReceived} packets=${sa.packetsReceived} | B.recv bytes=${sb.bytesReceived} packets=${sb.packetsReceived}`);
    // Tiếp tục nhận thêm dữ liệu theo thời gian (luồng sống, không phải gói đơn lẻ).
    await A.waitForTimeout(2000);
    expect((await stats(A))[0]!.bytesReceived).toBeGreaterThan(sa.bytesReceived);
  });

  test('âm lượng theo khoảng cách: gần thì nghe được (gain > 0)', async () => {
    const g = await A.evaluate(() => (window as unknown as { __gpbVoice: V }).__gpbVoice.gains());
    const vals = Object.values(g);
    console.log(`VOICE_GAIN A=${JSON.stringify(vals)}`);
    expect(vals.length).toBe(1);
    expect(vals[0]).toBeGreaterThan(0);
  });

  test('tắt mic: nút aria-pressed=false, thông báo, bên kia đóng kết nối', async () => {
    await A.getByRole('button', { name: 'Tắt mic', exact: true }).click();
    await expect(A.getByRole('button', { name: 'Bật mic', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(A.locator('[role="status"][aria-live="polite"]').filter({ hasText: 'Đã tắt mic' })).toHaveCount(1);
    expect((await voice(A)).peers).toHaveLength(0);
    await expect.poll(async () => (await voice(B)).peers.length, { timeout: 30_000 }).toBe(0);
  });
});
