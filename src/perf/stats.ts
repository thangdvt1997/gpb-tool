// Thống kê thuần (không phụ thuộc DOM/three) cho số đo khung hình. Task 08.

/** Phân vị theo cách "nearest-rank" trên mảng đã sắp xếp tăng dần. p thuộc [0,1]. */
export function percentileSorted(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

export function percentile(values: readonly number[], p: number): number {
  return percentileSorted([...values].sort((a, b) => a - b), p);
}

export interface FrameSummary {
  frames: number;
  avgMs: number;
  fps: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  /** Số khung giật (> hitchMs). */
  hitches: number;
}

export const HITCH_MS = 50;

export function summarize(ms: readonly number[], hitchMs = HITCH_MS): FrameSummary {
  const n = ms.length;
  if (n === 0) return { frames: 0, avgMs: NaN, fps: NaN, p50Ms: NaN, p95Ms: NaN, p99Ms: NaN, maxMs: NaN, hitches: 0 };
  const s = [...ms].sort((a, b) => a - b);
  const avg = s.reduce((a, b) => a + b, 0) / n;
  return {
    frames: n, avgMs: avg, fps: avg > 0 ? 1000 / avg : NaN,
    p50Ms: percentileSorted(s, 0.5), p95Ms: percentileSorted(s, 0.95), p99Ms: percentileSorted(s, 0.99),
    maxMs: s[n - 1], hitches: s.filter((x) => x > hitchMs).length,
  };
}

/** Cửa sổ trượt kích thước cố định (vòng), tổng hợp theo yêu cầu. */
export function createRollingWindow(size: number) {
  if (!(size >= 1)) throw new Error('size phải >= 1');
  const buf: number[] = [];
  let head = 0;
  return {
    push(v: number) { if (buf.length < size) buf.push(v); else { buf[head] = v; head = (head + 1) % size; } },
    get length() { return buf.length; },
    values(): number[] { return buf.length < size ? [...buf] : [...buf.slice(head), ...buf.slice(0, head)]; },
    summary(hitchMs = HITCH_MS): FrameSummary { return summarize(buf, hitchMs); },
    clear() { buf.length = 0; head = 0; },
  };
}
export type RollingWindow = ReturnType<typeof createRollingWindow>;
