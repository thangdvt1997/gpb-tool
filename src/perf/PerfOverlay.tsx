// <PerfOverlay /> HUD DOM (đặt NGOÀI Canvas). Bật bằng ?perf=1 hoặc phím F3. Cập nhật ~4 Hz qua subscribe của store.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { perfStore, type PerfStore, type PerfSnapshot } from './store';
import { parsePerfParams } from './bench';

let cache: { v: PerfSnapshot } | null = null;
function useSnap(store: PerfStore): PerfSnapshot {
  // snapshot() tạo object mới mỗi lần: giữ bản cache, chỉ làm mới trong lần subscribe (emit) để tránh vòng render.
  return useSyncExternalStore(
    (cb) => store.subscribe(() => { cache = { v: store.snapshot() }; cb(); }),
    () => (cache ??= { v: store.snapshot() }).v,
  );
}

const f = (x: number | null | undefined, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? '–' : x.toFixed(d));

export function PerfOverlay({ store = perfStore }: { store?: PerfStore }) {
  const [on, setOn] = useState(() => typeof location !== 'undefined' && parsePerfParams(location.search).perf);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'F3') { e.preventDefault(); setOn((v) => !v); } };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, []);
  const s = useSnap(store);
  if (!on) return null;
  const r = s.renderer;
  return (
    <div role="status" aria-label="Hiệu năng" style={{ position: 'fixed', top: 8, left: 8, zIndex: 9999, pointerEvents: 'none',
      font: '12px/1.4 monospace', color: '#cfe', background: 'rgba(0,0,0,.65)', padding: '6px 8px', borderRadius: 4, whiteSpace: 'pre' }}>
      {`FPS ${f(s.frame.fps)} (thấp nhất/1s ${f(s.frame.minFps1s)})  p50 ${f(s.frame.p50Ms)}  p95 ${f(s.frame.p95Ms)}  p99 ${f(s.frame.p99Ms)} ms\n` +
        `giật>50ms ${s.frame.hitches}  max ${f(s.frame.maxMs)} ms\n` +
        `draw ${r?.drawCalls ?? '–'}  tri ${r?.triangles ?? '–'}  geo ${r?.geometries ?? '–'}  tex ${r?.textures ?? '–'}  prog ${r?.programs ?? '–'}\n` +
        (s.gpu.supported === false ? 'GPU: trình duyệt không hỗ trợ đo\n'
          : s.gpu.supported ? `GPU ${f(s.gpu.avgMs, 2)} ms  p50 ${f(s.gpu.p50Ms, 2)}  p95 ${f(s.gpu.p95Ms, 2)} ms (${s.gpu.samples} mẫu)\n` : '') +
        `tex~${f(s.textureMB)} MB (ước lượng)  heap ${f(s.jsHeapMB)} MB${s.jsHeapMB === null ? ' (không hỗ trợ)' : ''}` +
        (s.bench ? `\nbench ${s.bench.running ? 'đang chạy' : 'xong'} ${Math.round(s.bench.progress * 100)}%` : '')}
      {s.warnings.map((w) => <div key={w.key} style={{ color: '#fb6' }}>! {w.message}</div>)}
    </div>
  );
}
