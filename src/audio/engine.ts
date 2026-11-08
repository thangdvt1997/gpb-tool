/**
 * Bus hiệu ứng cũ cho sfx.ts và theme-music.ts (SFX tổng hợp và nhạc chủ đề).
 * Âm nền (ambient) KHÔNG còn ở đây: đã chuyển sang bus 'ambient' của SpatialAudioManager
 * (xem spatial/ambient.ts). Engine này không còn lớp nền nào, nên không có đường phát ambient thứ hai.
 * AudioContext chỉ được tạo trong resume(), và resume() phải gọi từ thao tác người dùng.
 */

export type { AmbientZone } from './spatial/ambient';

/** Âm lượng tổng mặc định, thấp để không làm phiền. */
const DEFAULT_VOLUME = 0.15;
/** Mức của bus hiệu ứng (SFX và nhạc chủ đề) so với master. */
const FX_BUS_LEVEL = 0.6;

export class AmbientEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private fxBus: GainNode | null = null;
  private volume = DEFAULT_VOLUME;
  private muted = false;

  async resume(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.buildGraph(new Ctor());
    }
    const ctx = this.ctx;
    if (ctx && ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        // Trình duyệt chưa cho phát: lần thao tác sau sẽ thử lại.
      }
    }
  }

  async suspend(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    try {
      await ctx.suspend();
    } catch {
      // Bỏ qua lỗi tạm dừng.
    }
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
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

  dispose(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.fxBus = null;
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
  }

  private applyMaster(): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    master.gain.setTargetAtTime(this.muted ? 0 : this.volume, ctx.currentTime, 0.05);
  }
}
