import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMyAbout } from '../auth/api';

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

afterEach(() => vi.unstubAllGlobals());

describe('getMyAbout', () => {
  it('máy chủ cũ trả 404: trả null, không ném lỗi', async () => {
    vi.stubGlobal('fetch', reply(404, { ok: false, code: 'not_found' }));
    await expect(getMyAbout()).resolves.toBeNull();
  });
  it('404 không phải JSON (HTML) cũng là null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>404</html>', { status: 404 })));
    await expect(getMyAbout()).resolves.toBeNull();
  });
  it('200: chuẩn hóa dữ liệu, giá trị lạ về mặc định', async () => {
    vi.stubGlobal('fetch', reply(200, { ok: true, about: { bio: 'hi', presence: 'zzz', profileVisibility: 'self', revision: 2 } }));
    const a = await getMyAbout();
    expect(a).toMatchObject({ bio: 'hi', presence: 'free', profileVisibility: 'self', characterVisibility: 'colleagues', revision: 2 });
  });
  it('401 vẫn ném lỗi', async () => {
    vi.stubGlobal('fetch', reply(401, { ok: false, code: 'unauthenticated' }));
    await expect(getMyAbout()).rejects.toMatchObject({ status: 401 });
  });
});
