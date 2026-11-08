/** Nạp và nhớ đệm mask vùng da theo URL GLB (fetch -> arrayBuffer -> buildRegionMasks). */
import { buildRegionMasks } from './glbUv';
import { unpackMasks, validPacked, type PackedMasks } from './maskPack';
import type { RegionMask } from './regions';
import type { ModelId } from './store';

/** Trùng MPFB_MODEL_URLS ở src/avatar/MpfbAvatar.tsx (không import để tránh vòng phụ thuộc avatar <-> tattoo). */
export const TATTOO_MODEL_URLS: Readonly<Record<ModelId, string>> = {
  male_real: '/models/male_real.glb',
  female_real: '/models/female_real.glb',
  chibi: '/models/chibi.glb',
};

export const PACKED_MASKS_URL = '/models/tattoo-masks.json';

const cache = new Map<string, Promise<RegionMask[]>>();
let packedP: Promise<PackedMasks | null> | null = null;

/** Mask 256x256 đóng gói sẵn (scripts/gen-tattoo-masks.mjs). Lỗi/hỏng thì null để dùng dự phòng 64x64 từ GLB. */
function loadPacked(): Promise<PackedMasks | null> {
  if (!packedP) {
    packedP = fetch(PACKED_MASKS_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (validPacked(j) ? j : null), () => null);
  }
  return packedP;
}

async function loadMasksFor(url: string): Promise<RegionMask[]> {
  const id = Object.keys(TATTOO_MODEL_URLS).find((k) => TATTOO_MODEL_URLS[k as ModelId] === url);
  if (id) {
    const pk = await loadPacked();
    const list = pk?.models[id];
    if (pk && Array.isArray(list) && list.length > 0) {
      try { return unpackMasks(list, pk.res); } catch { /* hỏng: dùng dự phòng */ }
    }
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Tải ${url} lỗi ${r.status}`);
  return buildRegionMasks(await r.arrayBuffer());
}

/**
 * Trả Promise mask; cùng url dùng chung một lần tải. Lỗi thì xoá khỏi cache để lần sau thử lại.
 * signal: huỷ chỉ làm Promise trả về từ chối với AbortError, lần tải chung vẫn hoàn tất cho người khác.
 */
export function loadRegionMasks(url: string, signal?: AbortSignal): Promise<RegionMask[]> {
  let p = cache.get(url);
  if (!p) {
    p = loadMasksFor(url);
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

export function clearMaskCacheForTest(): void { cache.clear(); packedP = null; }
