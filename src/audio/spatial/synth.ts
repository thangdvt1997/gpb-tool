/**
 * Tổng hợp âm phản hồi bằng Web Audio, không dùng file mẫu. Mỗi hàm nối nguồn vào `out`
 * và trả về danh sách nguồn để có thể dừng sớm khi bị cướp voice.
 */
import { jitter, surfaceParams, type SfxEvent, type Surface } from './pure';

export interface SynthOptions {
  surface: Surface;
  /** 0..1 */
  intensity: number;
  rng: () => number;
}

type Stoppable = { stop(when?: number): void };

let noiseCache: WeakMap<BaseAudioContext, AudioBuffer> = new WeakMap();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    const len = Math.round(ctx.sampleRate * 1);
    buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

/** Xung nhiễu qua bộ lọc, bao biên độ tấn công nhanh và tắt mũ. */
function noise(
  ctx: BaseAudioContext, out: AudioNode, t: number, dur: number, peak: number,
  type: BiquadFilterType, freq: number, q = 0.7,
): Stoppable {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t);
  src.stop(t + dur + 0.02);
  return src;
}

/** Âm đơn, tần số trượt từ f0 sang f1. */
function tone(
  ctx: BaseAudioContext, out: AudioNode, t: number, dur: number, peak: number,
  type: OscillatorType, f0: number, f1 = f0,
): Stoppable {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
  return o;
}

export function synthesize(
  ctx: BaseAudioContext, out: AudioNode, ev: SfxEvent, t: number, o: SynthOptions,
): Stoppable[] {
  const j = (a: number) => jitter(o.rng, a);
  const k = o.intensity;
  switch (ev) {
    case 'footstep': {
      const s = surfaceParams(o.surface);
      const list: Stoppable[] = [
        noise(ctx, out, t, 0.08, 0.5 * k * s.thump, 'lowpass', s.cutoffHz * j(0.2)),
        tone(ctx, out, t, 0.09, 0.35 * k * s.thump, 'sine', 110 * j(0.15), 55),
      ];
      if (s.click > 0) list.push(noise(ctx, out, t, 0.025, 0.25 * k * s.click, 'highpass', 2500 * j(0.2)));
      return list;
    }
    case 'door':
      // Bản lề kẹt nhẹ rồi tiếng chốt
      return [
        tone(ctx, out, t, 0.35, 0.08, 'sawtooth', 180 * j(0.1), 120),
        noise(ctx, out, t, 0.4, 0.15, 'bandpass', 500, 1.2),
        tone(ctx, out, t + 0.4, 0.1, 0.3, 'square', 150, 90),
        noise(ctx, out, t + 0.4, 0.06, 0.3, 'lowpass', 1200),
      ];
    case 'drawer':
      return [
        noise(ctx, out, t, 0.3, 0.2, 'bandpass', 700 * j(0.1), 0.8),
        tone(ctx, out, t + 0.3, 0.08, 0.25, 'triangle', 200, 120),
      ];
    case 'switch':
      return [tone(ctx, out, t, 0.03, 0.35, 'square', 1800 * j(0.05), 900), noise(ctx, out, t + 0.03, 0.03, 0.2, 'highpass', 3000)];
    case 'chair':
      return [
        noise(ctx, out, t, 0.35, 0.12, 'bandpass', 900 * j(0.15), 1),
        tone(ctx, out, t + 0.05, 0.25, 0.08, 'sine', 90, 70),
      ];
    case 'printer': {
      // Động cơ giấy: các xung nhiễu lặp
      const list: Stoppable[] = [tone(ctx, out, t, 0.3, 0.12, 'sawtooth', 90, 140)];
      for (let i = 0; i < 8; i++) list.push(noise(ctx, out, t + 0.3 + i * 0.2, 0.15, 0.14, 'bandpass', 1800, 1.5));
      list.push(tone(ctx, out, t + 2.1, 0.2, 0.15, 'sine', 900, 700));
      return list;
    }
    case 'waterCooler':
      // Bong bóng nổi lên
      return [0, 0.2, 0.45, 0.7].map((d) =>
        tone(ctx, out, t + d, 0.12, 0.18, 'sine', (350 + o.rng() * 200), 900),
      );
    case 'tv':
      return [
        noise(ctx, out, t, 3, 0.05, 'bandpass', 1500, 0.5),
        tone(ctx, out, t, 3, 0.03, 'sine', 220 * j(0.05)),
      ];
    case 'uiClick':
      return [tone(ctx, out, t, 0.05, 0.3, 'sine', 1200, 800)];
  }
}
