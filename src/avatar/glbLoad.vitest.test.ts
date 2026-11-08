import { describe, expect, it } from 'vitest';
import { createLoadingCoordinator } from '../loading/coordinator';
import { createGlbResource, HttpStatusError } from './glbLoad';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const fakeGltf = { scene: {} } as unknown as GLTF;
const fastBackoff = { baseMs: 1, maxMs: 2, factor: 1 };

function mk(statuses: number[]) {
  let calls = 0;
  const fetchImpl = (async () => {
    const st = statuses[calls++] ?? 200;
    return { ok: st < 400, status: st, arrayBuffer: async () => new ArrayBuffer(4) } as Response;
  }) as typeof fetch;
  const res = createGlbResource({ fetchImpl, parse: async () => fakeGltf, failTtlMs: 50 });
  // dựng lại coordinator với backoff nhanh nhưng cùng fetcher
  return { calls: () => calls, fetchImpl, res };
}

async function settle(read: () => unknown) {
  for (let i = 0; i < 200; i++) {
    try { return read(); } catch (e) {
      if (e instanceof Promise) await e; else throw e;
    }
  }
  throw new Error('không dừng');
}

describe('glbLoad (qua bộ điều phối)', () => {
  it('retry khi 500 hai lần rồi thành công', async () => {
    let calls = 0;
    const coordinator = createLoadingCoordinator({
      backoff: fastBackoff,
      fetcher: async (req) => {
        const st = [500, 500, 200][calls++] ?? 200;
        if (st >= 400) throw new HttpStatusError(st);
        return fakeGltf;
      },
    });
    const res = createGlbResource({ coordinator });
    const g = await settle(() => res.read('/models/x.glb'));
    expect(g).toBe(fakeGltf);
    expect(calls).toBe(3);
    expect(res.read('/models/x.glb')).toBe(fakeGltf);
  });

  it('lỗi hẳn thì ném Error (ErrorBoundary dùng FallbackAvatar), 404 không retry', async () => {
    const m = mk([404, 404, 404, 404]);
    await expect(settle(() => m.res.read('/models/y.glb'))).rejects.toThrow(/HTTP 404/);
    expect(m.calls()).toBe(1);
  });

  it('lỗi hẳn được quên sau TTL để lần sau thử lại', async () => {
    const m = mk([404]);
    await expect(settle(() => m.res.read('/models/z.glb'))).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 70));
    expect(await settle(() => m.res.read('/models/z.glb'))).toBe(fakeGltf);
  });

  it('dùng chung một lần tải cho nhiều read đồng thời', async () => {
    const m = mk([200]);
    const [a, b] = await Promise.all([settle(() => m.res.read('/m/a.glb')), settle(() => m.res.read('/m/a.glb'))]);
    expect(a).toBe(b);
    expect(m.calls()).toBe(1);
  });
});
