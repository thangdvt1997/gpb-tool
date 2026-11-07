import { describe, expect, it } from 'vitest';
import { fetchIceServers } from './iceServers';

const json = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

describe('fetchIceServers', () => {
  it('trả iceServers và thời điểm làm mới 80% TTL', async () => {
    const r = await fetchIceServers(
      json(200, { ok: true, ttlSec: 100, iceServers: [{ urls: ['turn:a:3478'], username: '1:u', credential: 'c' }] }) as typeof fetch,
      () => 1000,
    );
    expect(r?.iceServers[0].username).toBe('1:u');
    expect(r?.refreshAt).toBe(1000 + 80_000);
  });
  it('null khi 401, 503, lỗi mạng hoặc thiếu credential', async () => {
    expect(await fetchIceServers(json(401, { ok: false }) as typeof fetch)).toBeNull();
    expect(await fetchIceServers(json(503, { ok: false }) as typeof fetch)).toBeNull();
    expect(await fetchIceServers((async () => { throw new Error('x'); }) as typeof fetch)).toBeNull();
    expect(await fetchIceServers(json(200, { ok: true, iceServers: [{ urls: 'stun:x' }] }) as typeof fetch)).toBeNull();
  });
});
