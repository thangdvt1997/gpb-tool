/**
 * Âm thanh nền theo khu, không phụ thuộc React.
 * Mọi âm được tạo bằng Web Audio API, không dùng file ngoài.
 * AudioContext chỉ được tạo trong resume(), và resume() phải gọi từ thao tác người dùng (click, phím).
 */

export type AmbientZone = 'office' | 'lounge' | 'game' | 'karaoke' | 'events' | 'meeting' | 'server' | 'soc';

/** Âm lượng tổng mặc định, thấp để không làm phiền. */
const DEFAULT_VOLUME = 0.15;
/** Mức của bus hiệu ứng (SFX và nhạc chủ đề) so với master. */
const FX_BUS_LEVEL = 0.6;
const BEAT_SECONDS = 0.5; // 120 BPM
const SCHEDULER_MS = 100;
const LOOKAHEAD_SECONDS = 0.2;
const NOISE_SECONDS = 4;
const NOISE_FADE_SECONDS = 0.05;
/** Hợp âm C major cho lớp pad khu lounge: C4, E4, G4. */
const PAD_CHORD_HZ = [261.63, 329.63, 392.0];
/** Thời gian mờ dần khi chuyển lớp của khu. */
const RETIRE_MS = 1500;

interface Layer {
  output: GainNode;
  stop: () => void;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Đổi tham số về giá trị đích theo đường cong mũ, tránh tiếng click khi đổi đột ngột. */
function fade(ctx: BaseAudioContext, param: AudioParam, value: number, timeConstant: number): void {
  param.setTargetAtTime(value, ctx.currentTime, timeConstant);
}

/**
 * Nhiễu hồng tạo bằng code (bộ lọc của Paul Kellet) và nối đuôi bằng crossfade để vòng lặp êm.
 * Biên độ đỉnh chuẩn hoá về 0.8.
 */
function makePinkNoise(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.round(sr * NOISE_SECONDS);
  const fadeLength = Math.round(sr * NOISE_FADE_SECONDS);
  const raw = new Float32Array(length + fadeLength);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < raw.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }

  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    if (i < fadeLength) {
      const w = i / fadeLength;
      data[i] = raw[i] * w + raw[length + i] * (1 - w);
    } else {
      data[i] = raw[i];
    }
  }

  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const scale = peak > 0 ? 0.8 / peak : 1;
  for (let i = 0; i < length; i++) data[i] *= scale;

  const buffer = ctx.createBuffer(1, length, sr);
  buffer.copyToChannel(data, 0);
  return buffer;
}

export class AmbientEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private fxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private baseLayer: Layer | null = null;
  private zoneLayer: Layer | null = null;
  private zone: AmbientZone = 'office';
  private volume = DEFAULT_VOLUME;
  private muted = false;
  private timers: ReturnType<typeof setTimeout>[] = [];

  /**
   * Tạo AudioContext (nếu chưa có), bật các lớp âm và chạy context.
   * CHỈ gọi từ trình xử lý sự kiện do người dùng kích hoạt, nếu không trình duyệt sẽ chặn.
   */
  async resume(): Promise<void> {
    if (typeof window === 'undefined') return;

    if (!this.ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.buildGraph(new Ctor());
    }

    const ctx = this.ctx;
    if (!ctx) return;
    this.ensureLayers();
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        // Trình duyệt chưa cho phát: bỏ qua, lần thao tác sau sẽ thử lại.
      }
    }
  }

  /** Tạm dừng context, giữ nguyên trạng thái. Gọi resume() để chạy lại. */
  async suspend(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    try {
      await ctx.suspend();
    } catch {
      // Bỏ qua lỗi tạm dừng.
    }
  }

  /** Chuyển lớp âm của khu. Trước khi có AudioContext thì chỉ lưu khu, lớp được dựng khi resume(). */
  setZone(zone: AmbientZone): void {
    if (zone === this.zone) return;
    this.zone = zone;
    if (!this.ctx) return;
    if (this.zoneLayer) this.retire(this.zoneLayer);
    this.zoneLayer = this.startZoneLayer(zone);
  }

  /** Âm lượng tổng, 0 đến 1. Mặc định 0.15. */
  setVolume(value: number): void {
    this.volume = clamp01(value);
    this.applyMaster();
  }

  mute(): void {
    this.muted = true;
    this.applyMaster();
  }

  unmute(): void {
    this.muted = false;
    this.applyMaster();
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Đã có AudioContext hay chưa (đã có thao tác người dùng). */
  isStarted(): boolean {
    return this.ctx !== null;
  }

  getContext(): AudioContext | null {
    return this.ctx;
  }

  /** Bus hiệu ứng: SFX và nhạc chủ đề nối vào đây, nên mute và âm lượng tổng vẫn áp dụng. */
  getFxBus(): GainNode | null {
    return this.fxBus;
  }

  /** Đóng AudioContext và dừng mọi lớp. Engine vẫn dùng lại được: resume() sẽ tạo context mới. */
  dispose(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    this.baseLayer?.stop();
    this.zoneLayer?.stop();
    this.baseLayer = null;
    this.zoneLayer = null;

    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.fxBus = null;
    this.noise = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }

  private buildGraph(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    master.connect(ctx.destination);

    const fxBus = ctx.createGain();
    fxBus.gain.value = FX_BUS_LEVEL;
    fxBus.connect(master);

    this.ctx = ctx;
    this.master = master;
    this.fxBus = fxBus;
    this.noise = makePinkNoise(ctx);
  }

  private ensureLayers(): void {
    if (!this.ctx) return;
    if (!this.baseLayer) this.baseLayer = this.startBase();
    if (!this.zoneLayer) this.zoneLayer = this.startZoneLayer(this.zone);
  }

  private applyMaster(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    fade(ctx, master.gain, this.muted ? 0 : this.volume, 0.05);
  }

  private startZoneLayer(zone: AmbientZone): Layer | null {
    switch (zone) {
      case 'lounge':
        return this.startPad();
      case 'karaoke':
        return this.startKick();
      default:
        return null;
    }
  }

  /** Mờ dần lớp cũ rồi dừng hẳn sau một lúc. */
  private retire(layer: Layer): void {
    const ctx = this.ctx;
    if (!ctx) {
      layer.stop();
      return;
    }
    fade(ctx, layer.output.gain, 0, 0.2);
    const timer = setTimeout(() => {
      layer.stop();
      this.timers = this.timers.filter((t) => t !== timer);
    }, RETIRE_MS);
    this.timers.push(timer);
  }

  /** Lớp nền mọi khu: tiếng văn phòng, nhiễu hồng qua lowpass. */
  private startBase(): Layer | null {
    const ctx = this.ctx;
    const master = this.master;
    const noise = this.noise;
    if (!ctx || !master || !noise) return null;

    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(master);

    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 700;
    lowpass.Q.value = 0.5;

    const level = ctx.createGain();
    level.gain.value = 0.6;

    src.connect(lowpass).connect(level).connect(out);
    src.start();
    fade(ctx, out.gain, 1, 1.0);

    return {
      output: out,
      stop: () => {
        src.stop();
        src.disconnect();
        lowpass.disconnect();
        level.disconnect();
        out.disconnect();
      },
    };
  }

  /** Khu lounge: pad C major (ba sóng sin), biên độ dao động chậm bằng LFO 0,07 Hz. */
  private startPad(): Layer | null {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return null;

    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(master);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1100;

    const level = ctx.createGain();
    level.gain.value = 0.5;
    lowpass.connect(level).connect(out);

    const voices = PAD_CHORD_HZ.map((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const voiceGain = ctx.createGain();
      voiceGain.gain.value = 0.12;
      osc.connect(voiceGain).connect(lowpass);
      osc.start();
      return { osc, voiceGain };
    });

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.2;
    lfo.connect(lfoDepth).connect(level.gain);
    lfo.start();

    fade(ctx, out.gain, 1, 1.0);

    return {
      output: out,
      stop: () => {
        for (const { osc, voiceGain } of voices) {
          osc.stop();
          osc.disconnect();
          voiceGain.disconnect();
        }
        lfo.stop();
        lfo.disconnect();
        lfoDepth.disconnect();
        lowpass.disconnect();
        level.disconnect();
        out.disconnect();
      },
    };
  }

  /**
   * Khu karaoke: trống kick đơn giản, 120 BPM (một nhịp mỗi 0,5 giây).
   * Lập lịch bằng setInterval, đặt trước 0,2 giây trên đồng hồ âm thanh. KHÔNG dùng requestAnimationFrame.
   */
  private startKick(): Layer | null {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return null;

    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(master);

    const bus = ctx.createGain();
    bus.gain.value = 0.35;
    bus.connect(out);

    const scheduleKick = (when: number): void => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, when);
      osc.frequency.exponentialRampToValueAtTime(40, when + 0.12);
      env.gain.setValueAtTime(0.0001, when);
      env.gain.exponentialRampToValueAtTime(1, when + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
      osc.connect(env).connect(bus);
      osc.start(when);
      osc.stop(when + 0.32);
      osc.onended = () => {
        osc.disconnect();
        env.disconnect();
      };
    };

    let nextBeat = ctx.currentTime + 0.05;
    const timer = setInterval(() => {
      if (nextBeat < ctx.currentTime) nextBeat = ctx.currentTime + 0.02;
      while (nextBeat < ctx.currentTime + LOOKAHEAD_SECONDS) {
        scheduleKick(nextBeat);
        nextBeat += BEAT_SECONDS;
      }
    }, SCHEDULER_MS);

    fade(ctx, out.gain, 1, 0.5);

    return {
      output: out,
      stop: () => {
        clearInterval(timer);
        bus.disconnect();
        out.disconnect();
      },
    };
  }
}
