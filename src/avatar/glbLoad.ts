import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createLoadingCoordinator, type LoadingCoordinator } from '../loading/coordinator';
import type { AssetRequest, FetchContext } from '../loading/types';

/** Lỗi HTTP có status để bộ điều phối phân loại (5xx/408/429 retry, 4xx thì không). */
export class HttpStatusError extends Error {
  constructor(public status: number) { super(`HTTP ${status}`); this.name = 'HttpStatusError'; }
}

export type ParseGlb = (buf: ArrayBuffer, url: string) => Promise<GLTF>;

const parseWithGltfLoader: ParseGlb = (buf, url) => {
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  return new Promise<GLTF>((res, rej) => new GLTFLoader().parse(buf, base, res, (e) => rej(e instanceof Error ? e : new Error(String(e)))));
};

export interface GlbResourceOptions {
  coordinator?: LoadingCoordinator;
  fetchImpl?: typeof fetch;
  parse?: ParseGlb;
  /** Sau bao lâu (ms) một lỗi hẳn được quên để lần mount sau thử lại. */
  failTtlMs?: number;
  now?: () => number;
}

type Slot =
  | { s: 'pending'; promise: Promise<void> }
  | { s: 'ok'; value: GLTF }
  | { s: 'err'; error: Error; at: number };

/**
 * Tài nguyên GLB tương thích Suspense, tải qua bộ điều phối (retry, backoff, hủy, ưu tiên).
 * read(url) ném Promise khi đang tải, ném Error khi lỗi hẳn (ErrorBoundary lo FallbackAvatar).
 * Không đụng cache của useLoader/useGLTF.
 */
export function createGlbResource(o: GlbResourceOptions = {}) {
  const doFetch = o.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const parse = o.parse ?? parseWithGltfLoader;
  const now = o.now ?? (() => Date.now());
  const failTtl = o.failTtlMs ?? 15000;
  const coordinator = o.coordinator ?? createLoadingCoordinator({
    maxConcurrent: 4,
    fetcher: async (req: AssetRequest, ctx: FetchContext) => {
      const r = await doFetch(req.url, { signal: ctx.signal });
      if (!r.ok) throw new HttpStatusError(r.status);
      return parse(await r.arrayBuffer(), req.url);
    },
  });
  const slots = new Map<string, Slot>();

  function start(url: string): Slot {
    const h = coordinator.request<GLTF>({ key: `avatar-glb:${url}`, url, priority: 'high', critical: true });
    const promise = h.result.then((r) => {
      if (r.status === 'loaded') slots.set(url, { s: 'ok', value: r.value });
      else if (r.status === 'cancelled') slots.delete(url);
      else if (r.status === 'failed') slots.set(url, { s: 'err', error: new Error(`GLB lỗi: ${r.error.message}`), at: now() });
      else slots.set(url, { s: 'err', error: new Error('GLB lỗi'), at: now() });
    });
    const slot: Slot = { s: 'pending', promise };
    slots.set(url, slot);
    return slot;
  }

  function read(url: string): GLTF {
    let slot = slots.get(url);
    if (slot?.s === 'err' && now() - slot.at > failTtl) { slots.delete(url); slot = undefined; }
    slot ??= start(url);
    if (slot.s === 'ok') return slot.value;
    if (slot.s === 'err') throw slot.error;
    throw slot.promise;
  }

  return { read, coordinator, peek: (url: string) => slots.get(url)?.s };
}

let shared: ReturnType<typeof createGlbResource> | null = null;
/** Tài nguyên dùng chung cho GLB nhân vật. */
export function avatarGlb() { return (shared ??= createGlbResource()); }
export function useAvatarGltf(url: string): GLTF { return avatarGlb().read(url); }
