import type { AmbientEngine } from './engine';

export type SfxName = 'click' | 'pin' | 'notify' | 'clap' | 'success' | 'error';

/** Bộ đệm nhiễu của tiếng vỗ tay, tạo một lần cho mỗi AudioContext. */
const clapBuffers = new WeakMap<AudioContext, AudioBuffer>();

function clapBuffer(ctx: AudioContext): AudioBuffer {
  const cached = clapBuffers.get(ctx);
  if (cached) return cached;
  const length = Math.round(ctx.sampleRate * 0.15);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  clapBuffers.set(ctx, buffer);
  return buffer;
}

/** Đường bao tuyến tính: lên đỉnh sau attack giây, về 0 sau dur giây. */
function envelope(gain: GainNode, when: number, peak: number, attack: number, dur: number): void {
  const param = gain.gain;
  param.setValueAtTime(0, when);
  param.linearRampToValueAtTime(peak, when + attack);
  param.linearRampToValueAtTime(0, when + dur);
}

/** Một dao động có đường bao. Tự ngắt kết nối khi kết thúc. */
function tone(
  ctx: AudioContext,
  out: AudioNode,
  when: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  peak: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  envelope(gain, when, peak, 0.005, dur);
  osc.connect(gain).connect(out);
  osc.start(when);
  osc.stop(when + dur + 0.01);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/** Lỗi: sóng răng cưa trượt xuống, qua lowpass. */
function errorTone(ctx: AudioContext, out: AudioNode, when: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, when);
  osc.frequency.linearRampToValueAtTime(150, when + 0.25);
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 900;
  const gain = ctx.createGain();
  envelope(gain, when, 0.2, 0.01, 0.28);
  osc.connect(lowpass).connect(gain).connect(out);
  osc.start(when);
  osc.stop(when + 0.3);
  osc.onended = () => {
    osc.disconnect();
    lowpass.disconnect();
    gain.disconnect();
  };
}

/**
 * Phát một âm ngắn (dưới 0,5 giây) qua bus hiệu ứng của engine.
 * Nếu chưa có AudioContext (chưa có thao tác người dùng) hoặc context đang tạm dừng thì bỏ qua, không phát.
 */
export function playSfx(name: SfxName, engine: AmbientEngine): void {
  const ctx = engine.getContext();
  const out = engine.getFxBus();
  if (!ctx || !out || ctx.state !== 'running') return;

  const t = ctx.currentTime + 0.005;
  switch (name) {
    case 'click':
      tone(ctx, out, t, 1800, 0.03, 'sine', 0.25);
      break;
    case 'pin':
      tone(ctx, out, t, 660, 0.12, 'triangle', 0.25);
      tone(ctx, out, t + 0.09, 990, 0.14, 'triangle', 0.25);
      break;
    case 'notify':
      tone(ctx, out, t, 880, 0.14, 'sine', 0.3);
      tone(ctx, out, t + 0.14, 1320, 0.2, 'sine', 0.3);
      break;
    case 'clap': {
      const src = ctx.createBufferSource();
      src.buffer = clapBuffer(ctx);
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 1500;
      bandpass.Q.value = 0.8;
      const gain = ctx.createGain();
      envelope(gain, t, 0.8, 0.003, 0.15);
      src.connect(bandpass).connect(gain).connect(out);
      src.start(t);
      src.stop(t + 0.15);
      src.onended = () => {
        src.disconnect();
        bandpass.disconnect();
        gain.disconnect();
      };
      break;
    }
    case 'success':
      tone(ctx, out, t, 523.25, 0.1, 'triangle', 0.25);
      tone(ctx, out, t + 0.08, 659.25, 0.1, 'triangle', 0.25);
      tone(ctx, out, t + 0.16, 783.99, 0.18, 'triangle', 0.25);
      break;
    case 'error':
      errorTone(ctx, out, t);
      break;
  }
}
