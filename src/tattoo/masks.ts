/** Nạp và nhớ đệm mask vùng da theo URL GLB (fetch -> arrayBuffer -> buildRegionMasks). */
import { buildRegionMasks } from './glbUv';
import type { RegionMask } from './regions';
import type { ModelId } from './store';

/** Trùng MPFB_MODEL_URLS ở src/avatar/MpfbAvatar.tsx (không import để tránh vòng phụ thuộc avatar <-> tattoo). */
export const TATTOO_MODEL_URLS: Readonly<Record<ModelId, string>> = {
  male_real: '/models/male_real.glb',
  female_real: '/models/female_real.glb',
  chibi: '/models/chibi.glb',
};

const cache = new Map<string, Promise<RegionMask[]>>();

/**
 * Trả Promise mask; cùng url dùng chung một lần tải. Lỗi thì xoá khỏi cache để lần sau thử lại.
 * signal: huỷ chỉ làm Promise trả về từ chối với AbortError, lần tải chung vẫn hoàn tất cho người khác.
 */
export function loadRegionMasks(url: string, signal?: AbortSignal): Promise<RegionMask[]> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`Tải ${url} lỗi ${r.status}`); return r.arrayBuffer(); })
      .then((buf) => buildRegionMasks(buf));
    cache.set(url, p);
    p.catch(() => { if (cache.get(url) === p) cache.delete(url); });
  }
  if (!signal) return p;
  const shared = p;
  return new Promise<RegionMask[]>((res, rej) => {
    const abort = () => rej(new DOMException('Đã huỷ', 'AbortError'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    shared.then((v) => { signal.removeEventListener('abort', abort); res(v); }, (e) => { signal.removeEventListener('abort', abort); rej(e); });
  });
}

export function clearMaskCacheForTest(): void { cache.clear(); }
