// Benchmark tất định: camera đi theo đường cố định theo THỜI GIAN mô phỏng (t giây), không phụ thuộc FPS thật.
import { summarize, type FrameSummary } from './stats';

export interface Waypoint { pos: [number, number, number]; look: [number, number, number] }
/**
 * Đường mặc định, TỌA ĐỘ GIẢ ĐỊNH (chưa đối chiếu với bản đồ cảnh thật): toàn cảnh -> hành lang bàn -> cận nhân vật -> phòng thay đồ.
 * Phải chỉnh theo scene thực qua tham số `path` khi đo thật.
 */
export const DEFAULT_BENCH_PATH: Waypoint[] = [
  { pos: [0, 6, 12], look: [0, 1, 0] },
  { pos: [-6, 1.7, 4], look: [-6, 1.2, -4] },
  { pos: [2, 1.6, 2], look: [2, 1.4, 0] },
  { pos: [8, 1.7, -4], look: [10, 1.4, -6] },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
  [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Nội suy tuyến tính theo u in [0,1] dọc đường (kẹp). Hai điểm ở cùng u cho cùng kết quả (tất định). */
export function sampleBenchPath(path: readonly Waypoint[], u: number): Waypoint {
  if (path.length === 0) throw new Error('path rỗng');
  if (path.length === 1) return path[0];
  const x = Math.min(1, Math.max(0, u)) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(x));
  const f = x - i;
  return { pos: lerp3(path[i].pos, path[i + 1].pos, f), look: lerp3(path[i].look, path[i + 1].look, f) };
}

export interface BenchEnv {
  userAgent?: string; viewport?: [number, number]; dpr?: number; quality?: string;
  avatars?: number; cache?: string; note?: string;
}
export interface BenchResult {
  schema: 1;
  durationSec: number;
  env: BenchEnv;
  frame: FrameSummary;
  /** CPU/JS timeline đo bằng rAF; KHÔNG phải thời gian GPU. */
  timing: 'rAF-wall-clock';
  renderer: { drawCallsMax: number; drawCallsAvg: number; trianglesMax: number; geometries: number; textures: number; programs: number };
  jsHeapMB: number | null;
  warnings: string[];
  /** Thời gian GPU đo bằng EXT_disjoint_timer_query_webgl2; null khi trình duyệt không hỗ trợ. Chưa có mẫu thì số đo là null (NaN trong JSON). */
  gpu: { samples: number; avgMs: number; p50Ms: number; p95Ms: number; p99Ms: number; maxMs: number; discarded: number } | null;
}

export interface RendererSnap { drawCalls: number; triangles: number; geometries: number; textures: number; programs: number }

/** Bộ thu cho một lần bench. */
export function createBenchRecorder(durationSec: number, env: BenchEnv = {}) {
  const ms: number[] = [];
  const snaps: RendererSnap[] = [];
  const gpuMs: number[] = [];
  return {
    durationSec,
    /** elapsed < 0 hoặc vượt thời lượng không được ghi. */
    done: (elapsedSec: number) => elapsedSec >= durationSec,
    progress: (elapsedSec: number) => Math.min(1, Math.max(0, elapsedSec / durationSec)),
    record(frameMs: number, snap?: RendererSnap) { ms.push(frameMs); if (snap) snaps.push(snap); },
    recordGpu(v: number) { gpuMs.push(v); },
    result(extra: { jsHeapMB?: number | null; warnings?: string[]; gpuSupported?: boolean; gpuDiscarded?: number } = {}): BenchResult {
      const n = snaps.length || 1;
      const g = summarize(gpuMs);
      const last = snaps[snaps.length - 1];
      return {
        schema: 1, durationSec, env, frame: summarize(ms), timing: 'rAF-wall-clock',
        renderer: {
          drawCallsMax: Math.max(0, ...snaps.map((s) => s.drawCalls)),
          drawCallsAvg: snaps.reduce((a, s) => a + s.drawCalls, 0) / n,
          trianglesMax: Math.max(0, ...snaps.map((s) => s.triangles)),
          geometries: last?.geometries ?? 0, textures: last?.textures ?? 0, programs: last?.programs ?? 0,
        },
        jsHeapMB: extra.jsHeapMB ?? null,
        warnings: extra.warnings ?? [],
        gpu: !(extra.gpuSupported ?? g.frames > 0) ? null : {
          samples: g.frames, avgMs: g.avgMs, p50Ms: g.p50Ms, p95Ms: g.p95Ms, p99Ms: g.p99Ms, maxMs: g.maxMs,
          discarded: extra.gpuDiscarded ?? 0,
        },
      };
    },
  };
}

/** Đọc cờ ?perf=1 / ?bench=1[&benchSec=N] từ chuỗi query. */
export function parsePerfParams(search: string): { perf: boolean; bench: boolean; benchSec: number } {
  const q = new URLSearchParams(search);
  const sec = Number(q.get('benchSec'));
  return { perf: q.get('perf') === '1', bench: q.get('bench') === '1', benchSec: sec > 0 && sec <= 600 ? sec : 30 };
}
