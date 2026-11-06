import type { AmbientEngine } from './engine';

export type ThemeMusicName = 'party' | 'tet' | 'midautumn';

const DEFAULT_SAMPLE_RATE = 24000;
const BPM = 120;
const BEAT = 60 / BPM; // 0,5 giây mỗi nốt
const BAR = 4 * BEAT; // 2 giây
const NOTE_COUNT = 8;
const LOOP_SECONDS = NOTE_COUNT * BEAT; // 4 giây, tức 2 ô nhịp

interface ThemeScale {
  /** 6 nốt của thang pentatonic. melody trỏ vào đây. */
  notes: number[];
  /** Chỉ số nốt của 8 nốt giai điệu. */
  melody: number[];
  /** Tần số bè trầm cho ô nhịp 1 và 2. */
  bass: [number, number];
}

const SCALES: Record<ThemeMusicName, ThemeScale> = {
  // La thứ pentatonic: A C D E G A
  party: {
    notes: [220, 261.63, 293.66, 329.63, 392, 440],
    melody: [0, 2, 3, 5, 4, 3, 2, 1],
    bass: [110, 98],
  },
  // Rê trưởng pentatonic: D E F# A B D
  tet: {
    notes: [293.66, 329.63, 369.99, 440, 493.88, 587.33],
    melody: [0, 2, 3, 4, 5, 4, 3, 1],
    bass: [146.83, 110],
  },
  // Đô trưởng pentatonic: C D E G A C
  midautumn: {
    notes: [261.63, 293.66, 329.63, 392, 440, 523.25],
    melody: [0, 2, 4, 5, 4, 2, 1, 0],
    bass: [130.81, 98],
  },
};

/**
 * Cộng một nốt vào bộ đệm: sóng sin và hoà âm bậc hai, đường bao giảm dần và về 0 ở cuối nốt.
 * Chỉ số ghi được bọc vòng để đuôi nốt không bị cắt khi lặp.
 */
function addTone(data: Float32Array, sr: number, freq: number, start: number, dur: number, amp: number): void {
  const first = Math.round(start * sr);
  const count = Math.round(dur * sr);
  const decay = Math.log(100) / dur;
  for (let i = 0; i < count; i++) {
    const t = i / sr;
    const attack = Math.min(1, t / 0.01);
    const release = Math.min(1, (dur - t) / 0.02);
    const env = attack * release * Math.exp(-decay * t);
    const s = Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(4 * Math.PI * freq * t);
    data[(first + i) % data.length] += amp * env * s;
  }
}

/** Bè trầm: sóng sin giữ nguyên trong một ô nhịp, có fade vào và ra. */
function addBass(data: Float32Array, sr: number, freq: number, start: number, dur: number, amp: number): void {
  const first = Math.round(start * sr);
  const count = Math.round(dur * sr);
  for (let i = 0; i < count; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.03) * Math.min(1, (dur - t) / 0.05);
    data[(first + i) % data.length] += amp * env * Math.sin(2 * Math.PI * freq * t);
  }
}

function normalize(data: Float32Array, peak: number): void {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  if (max === 0) return;
  const k = peak / max;
  for (let i = 0; i < data.length; i++) data[i] *= k;
}

/**
 * Tạo một vòng nhạc 4 giây (8 nốt, 120 BPM, 2 ô nhịp) bằng code, không dùng bài hát có sẵn.
 * Vòng lặp được thiết kế để nối êm: mọi nốt kết thúc trước khi hết vòng.
 */
export function generateThemeLoop(theme: ThemeMusicName, sampleRate = DEFAULT_SAMPLE_RATE): AudioBuffer {
  const scale = SCALES[theme];
  const length = Math.round(LOOP_SECONDS * sampleRate);
  const data = new Float32Array(length);

  scale.melody.forEach((degree, i) => {
    addTone(data, sampleRate, scale.notes[degree], i * BEAT, BEAT * 0.9, 0.5);
  });
  scale.bass.forEach((freq, bar) => {
    addBass(data, sampleRate, freq, bar * BAR, BAR, 0.2);
  });

  normalize(data, 0.8);
  const buffer = new AudioBuffer({ length, numberOfChannels: 1, sampleRate });
  buffer.copyToChannel(data, 0);
  return buffer;
}

/**
 * Phát vòng nhạc lặp vào bus hiệu ứng của engine. Trả về hàm dừng.
 * Như SFX, không phát nếu engine chưa có AudioContext đang chạy.
 */
export function playThemeLoop(engine: AmbientEngine, theme: ThemeMusicName, volume = 0.5): () => void {
  const ctx = engine.getContext();
  const out = engine.getFxBus();
  if (!ctx || !out || ctx.state !== 'running') return () => undefined;

  const src = ctx.createBufferSource();
  src.buffer = generateThemeLoop(theme);
  src.loop = true;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.connect(gain).connect(out);
  src.start();

  return () => {
    src.stop();
    src.disconnect();
    gain.disconnect();
  };
}
