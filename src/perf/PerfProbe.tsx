// <PerfProbe /> đặt TRONG <Canvas>. Đo thời gian khung, đọc renderer.info, kiểm ngân sách, cấp mẫu cho adaptive quality,
// và chạy benchmark ?bench=1. Không setState mỗi khung. Thời gian GPU đo qua gpuTimer (EXT_disjoint_timer_query_webgl2), chưa kiểm chứng trên GPU thật.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { AdaptiveController, Change } from '../quality';
import { perfStore, type PerfStore } from './store';
import { checkBudget, createWarnThrottle, estimateTextureBytes, type Budget } from './budget';
import { createGpuTimer, type GpuTimer, type TimerGL } from './gpuTimer';
import { createBenchRecorder, DEFAULT_BENCH_PATH, parsePerfParams, sampleBenchPath, type BenchResult, type Waypoint } from './bench';

export interface PerfProbeProps {
  store?: PerfStore;
  /** Bộ điều khiển adaptive của src/quality; probe gọi push({ms, drawCalls}, now). */
  adaptive?: AdaptiveController;
  onQualityChange?: (c: Change) => void;
  budget?: Partial<Budget>;
  onWarn?: (message: string) => void;
  /** Đọc cờ bench từ URL. Mặc định true. */
  enableBench?: boolean;
  benchPath?: Waypoint[];
  /** Gọi khi bench xong (ngoài việc tải JSON + console). */
  onBenchDone?: (r: BenchResult) => void;
  /** Chu kỳ tính texture MB/heap (ms) — đắt hơn nên thưa. */
  slowStatsEveryMs?: number;
}

function heapMB(): number | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory; // chỉ Chromium
  return m ? m.usedJSHeapSize / 1048576 : null;
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // thu hồi object URL
}

export function PerfProbe({
  store = perfStore, adaptive, onQualityChange, budget, onWarn, enableBench = true,
  benchPath = DEFAULT_BENCH_PATH, onBenchDone, slowStatsEveryMs = 1000,
}: PerfProbeProps) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const params = useMemo(() => parsePerfParams(typeof location === 'undefined' ? '' : location.search), []);
  const throttle = useMemo(() => createWarnThrottle(), []);
  const last = useRef(0), lastSlow = useRef(0), lastEmit = useRef(0);
  const rec = useRef<ReturnType<typeof createBenchRecorder> | null>(null);
  const benchStart = useRef(0);
  const gpuTimer = useRef<GpuTimer | null>(null);

  // Thời gian GPU: bọc gl.render bằng truy vấn TIME_ELAPSED (chỉ WebGL2 có extension). Trả lại render gốc khi gỡ.
  useEffect(() => {
    const ctx = gl.getContext() as unknown as Partial<TimerGL>;
    const timer = createGpuTimer(typeof ctx.createQuery === 'function' ? (ctx as TimerGL) : null);
    gpuTimer.current = timer;
    store.setGpuSupported(timer.supported);
    if (!timer.supported) return () => { gpuTimer.current = null; };
    const orig = gl.render;
    gl.render = function (this: typeof gl, ...args: Parameters<typeof orig>) {
      const on = timer.begin();
      try { return orig.apply(this, args); } finally { if (on) timer.end(); }
    } as typeof orig;
    return () => { gl.render = orig; timer.dispose(); gpuTimer.current = null; store.setGpuSupported(null); };
  }, [gl, store]);

  // Khởi tạo bench. info.render.* là số của khung vừa render xong (autoReset mặc định).
  useEffect(() => {
    if (!(enableBench && params.bench)) return;
    rec.current = createBenchRecorder(params.benchSec, {
      userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
      note: 'quality/avatars/cache: điền tay khi báo cáo',
    });
    benchStart.current = 0;
    store.setBench({ running: true, progress: 0 });
    return () => { rec.current = null; store.setBench(null); };
  }, [enableBench, params.bench, params.benchSec, store]);

  useEffect(() => {
    const onVis = () => { last.current = 0; adaptive?.resetWindow(); }; // tab ẩn/hiện: bỏ mẫu cũ
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [adaptive]);

  useFrame(() => {
    const now = performance.now();
    if (last.current === 0) { last.current = now; return; }
    const ms = now - last.current;
    last.current = now;
    const info = gl.info;
    const snap = {
      drawCalls: info.render.calls, triangles: info.render.triangles,
      geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0,
    };
    store.pushFrame(ms);
    store.setRenderer(snap);
    const gpuMs = gpuTimer.current?.poll() ?? [];
    for (const g of gpuMs) store.pushGpu(g);

    if (adaptive) {
      const ch = adaptive.push({ ms, drawCalls: snap.drawCalls }, now);
      if (ch) onQualityChange?.(ch);
    }

    // Benchmark: camera theo thời gian trôi, tất định.
    const r = rec.current;
    if (r) {
      if (benchStart.current === 0) benchStart.current = now;
      const el = (now - benchStart.current) / 1000;
      if (!r.done(el)) {
        const w = sampleBenchPath(benchPath, r.progress(el));
        camera.position.set(...w.pos); camera.lookAt(...w.look);
        r.record(ms, snap);
        for (const g of gpuMs) r.recordGpu(g);
        store.setBench({ running: true, progress: r.progress(el) });
      } else {
        const res = r.result({ jsHeapMB: heapMB(), warnings: store.snapshot().warnings.map((w) => w.message), gpuDiscarded: gpuTimer.current?.discarded ?? 0 });
        rec.current = null;
        store.setBench({ running: false, progress: 1 });
        console.info('[perf] bench', res);
        try { download(`bench-${Date.now()}.json`, res); } catch { /* không có DOM */ }
        onBenchDone?.(res);
      }
    }

    if (now - lastSlow.current >= slowStatsEveryMs) {
      lastSlow.current = now;
      // Ước lượng texture MB bằng cách duyệt vật liệu trong scene (đắt nên chạy thưa). Chỉ là ước lượng, không phải GPU thật.
      const seen = new Set<unknown>();
      let bytes = 0;
      scene.traverse((o) => {
        const mat = (o as unknown as { material?: unknown }).material;
        for (const m of Array.isArray(mat) ? mat : [mat]) {
          if (!m || typeof m !== 'object') continue;
          for (const v of Object.values(m as Record<string, unknown>)) {
            const t = v as { isTexture?: boolean };
            if (t && t.isTexture && !seen.has(t)) { seen.add(t); bytes += estimateTextureBytes(t as never); }
          }
        }
      });
      store.setExtras({ jsHeapMB: heapMB(), textureMB: bytes / 1048576 });
      const sum = store.snapshot();
      const ws = checkBudget({ drawCalls: snap.drawCalls, triangles: snap.triangles, geometries: snap.geometries, p95Ms: sum.frame.p95Ms, textureMB: sum.textureMB ?? undefined }, budget);
      store.setWarnings(ws);
      for (const w of ws) if (throttle(w.key, now)) (onWarn ?? ((m) => console.warn('[perf] ' + m)))(w.message);
    }
    if (now - lastEmit.current >= 250) { lastEmit.current = now; store.emit(); }
  });
  return null;
}
