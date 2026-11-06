// Bộ đếm rò rỉ: sau mỗi chu kỳ đổi cảnh/trang phục, ghi geometry/texture; tăng liên tục = nghi rò.
// Phân biệt cache có giới hạn (tăng rồi phẳng) với rò (tăng đều) bằng độ dốc phần đuôi.

export interface LeakSample { cycle: number; geometries: number; textures: number; programs?: number }
export type LeakVerdict = 'ok' | 'bounded-growth' | 'suspect-leak' | 'insufficient-data';

export interface LeakOptions {
  /** Số chu kỳ tối thiểu để kết luận. */
  minCycles?: number;
  /** Phần đuôi (tỷ lệ) dùng đo độ dốc. */
  tailFraction?: number;
  /** Tăng/chu kỳ ở đuôi vượt giá trị này => nghi rò. */
  slopeThreshold?: number;
}

export interface LeakReport {
  verdict: LeakVerdict;
  geometrySlope: number;
  textureSlope: number;
  geometryDelta: number;
  textureDelta: number;
}

/** Độ dốc hồi quy bình phương tối thiểu theo chỉ số mẫu. */
export function slope(ys: readonly number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  ys.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; });
  return num / den;
}

export function analyzeLeak(samples: readonly LeakSample[], o: LeakOptions = {}): LeakReport {
  const minCycles = o.minCycles ?? 8, tail = o.tailFraction ?? 0.5, thr = o.slopeThreshold ?? 0.2;
  const empty = { geometrySlope: 0, textureSlope: 0, geometryDelta: 0, textureDelta: 0 };
  if (samples.length < minCycles) return { verdict: 'insufficient-data', ...empty };
  const from = Math.floor(samples.length * (1 - tail));
  const t = samples.slice(from);
  const gs = slope(t.map((s) => s.geometries)), ts = slope(t.map((s) => s.textures));
  const gd = samples[samples.length - 1].geometries - samples[0].geometries;
  const td = samples[samples.length - 1].textures - samples[0].textures;
  let verdict: LeakVerdict = 'ok';
  if (gs > thr || ts > thr) verdict = 'suspect-leak';
  else if (gd > 0 || td > 0) verdict = 'bounded-growth';
  return { verdict, geometrySlope: gs, textureSlope: ts, geometryDelta: gd, textureDelta: td };
}

export function createLeakCounter(o: LeakOptions = {}) {
  const samples: LeakSample[] = [];
  return {
    /** Gọi sau mỗi lần đổi cảnh/trang phục (đã dispose xong). */
    record(s: Omit<LeakSample, 'cycle'>) { samples.push({ cycle: samples.length + 1, ...s }); },
    samples: () => [...samples],
    report: () => analyzeLeak(samples, o),
    reset() { samples.length = 0; },
  };
}
export type LeakCounter = ReturnType<typeof createLeakCounter>;
