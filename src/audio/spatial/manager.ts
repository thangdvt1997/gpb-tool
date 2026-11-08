/**
 * Bộ quản lý âm thanh không gian: bus, nguồn 3D, voice stealing, autoplay, tab ẩn.
 * AudioContext chỉ được tạo trong unlock() (gọi từ thao tác người dùng).
 */
import {
  BUS_NAMES, SETTINGS_KEY, SFX_SPECS, CooldownGate, busGain, distanceGain, newFootstepState,
  occlusionFor, parseBusSettings, pickVoiceToSteal, serializeBusSettings, stepFootsteps,
  type BusName, type BusSettings, type FootstepState, type SfxEvent, type Surface, type Voice,
} from './pure';
import { synthesize } from './synth';

export type AudioStatus = 'locked' | 'running' | 'suspended' | 'unsupported';

export interface PlayOptions {
  position?: [number, number, number];
  /** Vùng chứa nguồn (so với vùng listener để lọc qua tường). */
  zone?: string;
  surface?: Surface;
  intensity?: number;
}

export interface ManagerOptions {
  createContext?: () => AudioContext;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  rng?: () => number;
  maxVoices?: number;
  panning?: PanningModelType;
  /** boolean cố định, hoặc hàm đọc mỗi lần phát (theo kịp cài đặt người dùng). */
  reducedMotion?: boolean | (() => boolean);
}

interface LiveVoice extends Voice {
  gain: GainNode;
  nodes: { stop(when?: number): void }[];
  endsAt: number;
}

export const DEFAULT_MAX_VOICES = 12;
const STEAL_FADE = 0.03;

export class SpatialAudioManager {
  private ctx: AudioContext | null = null;
  private buses: Partial<Record<BusName, GainNode>> = {};
  private settings: BusSettings;
  private voices: LiveVoice[] = [];
  private nextId = 1;
  private gate = new CooldownGate();
  private foot: FootstepState = newFootstepState();
  private hidden = false;
  private listenerPos: [number, number, number] = [0, 0, 0];
  private listenerZone = 'office';
  private listeners = new Set<() => void>();
  private readonly opts: Required<Omit<ManagerOptions, 'createContext' | 'storage'>> &
    Pick<ManagerOptions, 'createContext' | 'storage'>;
  status: AudioStatus = 'locked';
  /** Chú thích chữ gần nhất cho tín hiệu quan trọng (trợ năng). */
  lastCaption = '';

  constructor(options: ManagerOptions = {}) {
    this.opts = {
      rng: Math.random,
      maxVoices: DEFAULT_MAX_VOICES,
      panning: 'HRTF',
      reducedMotion: false,
      ...options,
    };
    const storage = options.storage === undefined ? safeLocalStorage() : options.storage;
    this.opts.storage = storage;
    this.settings = parseBusSettings(storage?.getItem(SETTINGS_KEY));
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    this.listeners.forEach((f) => f());
  }

  getSettings(): BusSettings {
    return this.settings;
  }
  get activeVoices(): number {
    return this.voices.length;
  }

  /** Tạo hoặc resume context. Phải gọi từ cử chỉ người dùng; nếu trình duyệt chặn thì status không phải 'running'. */
  async unlock(): Promise<AudioStatus> {
    if (!this.ctx) {
      try {
        const make = this.opts.createContext ?? (typeof AudioContext !== 'undefined' ? () => new AudioContext() : null);
        if (!make) return (this.status = 'unsupported');
        this.ctx = make();
        this.buildBuses(this.ctx);
      } catch {
        this.ctx = null;
        this.status = 'unsupported';
        this.emit();
        return this.status;
      }
    }
    try {
      await this.ctx.resume();
    } catch {
      /* bị chặn: giữ trạng thái thật bên dưới */
    }
    this.status = this.ctx.state === 'running' ? 'running' : 'suspended';
    this.emit();
    return this.status;
  }

  /** Cho nguồn ngoài (thoại WebRTC) nối vào một bus: trả context và nút bus, null khi chưa unlock(). */
  getBus(name: BusName): { ctx: AudioContext; node: GainNode } | null {
    const node = this.buses[name];
    return this.ctx && node ? { ctx: this.ctx, node } : null;
  }

  private buildBuses(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.connect(ctx.destination);
    this.buses.master = master;
    for (const n of BUS_NAMES) {
      if (n === 'master') continue;
      const g = ctx.createGain();
      g.connect(master);
      this.buses[n] = g;
    }
    this.applyBusGains();
  }

  private applyBusGains(): void {
    if (!this.ctx) return;
    for (const n of BUS_NAMES) {
      const node = this.buses[n];
      if (node) node.gain.setTargetAtTime(busGain(this.settings[n]), this.ctx.currentTime, 0.02);
    }
  }

  private persist(): void {
    try {
      this.opts.storage?.setItem(SETTINGS_KEY, serializeBusSettings(this.settings));
    } catch {
      /* hết quota hoặc bị chặn: bỏ qua */
    }
  }

  setVolume(bus: BusName, volume: number): void {
    this.settings = { ...this.settings, [bus]: { ...this.settings[bus], volume: Math.min(1, Math.max(0, volume)) } };
    this.applyBusGains();
    this.persist();
    this.emit();
  }
  setMuted(bus: BusName, muted: boolean): void {
    this.settings = { ...this.settings, [bus]: { ...this.settings[bus], muted } };
    this.applyBusGains();
    this.persist();
    this.emit();
  }

  setListener(pos: [number, number, number], forward: [number, number, number], zone?: string): void {
    this.listenerPos = pos;
    if (zone) this.listenerZone = zone;
    const l = this.ctx?.listener;
    if (!l) return;
    if (l.positionX) {
      l.positionX.value = pos[0]; l.positionY.value = pos[1]; l.positionZ.value = pos[2];
      l.forwardX.value = forward[0]; l.forwardY.value = forward[1]; l.forwardZ.value = forward[2];
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    }
  }

  /** Tab ẩn: tạm dừng context và bỏ qua yêu cầu phát, nên khi quay lại không bị phát dồn. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    const ctx = this.ctx;
    if (!ctx || this.status === 'locked') return;
    if (hidden) {
      this.stopAll();
      void ctx.suspend?.();
    } else {
      void ctx.resume().then(() => {
        this.status = ctx.state === 'running' ? 'running' : 'suspended';
        this.emit();
      });
    }
  }

  private prune(now: number): void {
    this.voices = this.voices.filter((v) => {
      if (v.endsAt > now) return true;
      this.release(v, false);
      return false;
    });
  }

  private release(v: LiveVoice, fadeOut: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (fadeOut) {
      v.gain.gain.cancelScheduledValues?.(ctx.currentTime);
      v.gain.gain.setTargetAtTime(0, ctx.currentTime, STEAL_FADE / 3);
      v.nodes.forEach((n) => { try { n.stop(ctx.currentTime + STEAL_FADE); } catch { /* đã dừng */ } });
    }
    setTimeout(() => { try { v.gain.disconnect(); } catch { /* đã ngắt */ } }, fadeOut ? STEAL_FADE * 1000 + 20 : 0);
  }

  stopAll(): void {
    for (const v of this.voices) this.release(v, true);
    this.voices = [];
  }

  /** Phát một sự kiện. Trả true nếu thật sự bắt đầu phát. Chỉ gọi khi hành động thành công. */
  play(ev: SfxEvent, o: PlayOptions = {}): boolean {
    const ctx = this.ctx;
    if (!ctx || this.status !== 'running' || this.hidden) return false;
    const spec = SFX_SPECS[ev];
    const bus = this.buses[spec.bus];
    if (!bus || busGain(this.settings[spec.bus]) === 0 || busGain(this.settings.master) === 0) return false;
    const now = ctx.currentTime;
    const key = o.position ? `${ev}@${o.position.map((n) => n.toFixed(1)).join(',')}` : ev;
    if (!this.gate.allow(key, now, spec.cooldown)) return false;

    let distance = 0;
    if (spec.spatial && o.position) {
      distance = Math.hypot(
        o.position[0] - this.listenerPos[0], o.position[1] - this.listenerPos[1], o.position[2] - this.listenerPos[2],
      );
      if (distanceGain(distance, spec.model) <= 0.002) return false; // ngoài giới hạn nghe
    }
    this.prune(now);
    const steal = pickVoiceToSteal(this.voices, { priority: spec.priority, distance }, this.opts.maxVoices);
    if (steal === 'reject') return false;
    if (steal) {
      this.release(steal as LiveVoice, true);
      this.voices = this.voices.filter((v) => v.id !== steal.id);
    }

    const gain = ctx.createGain();
    // Giảm chuyển động: hạ nhẹ âm không thiết yếu (bước chân, ghế)
    gain.gain.value = (typeof this.opts.reducedMotion === 'function' ? this.opts.reducedMotion() : this.opts.reducedMotion) && spec.priority <= 1 ? 0.6 : 1;
    let tail: AudioNode = gain;
    if (spec.spatial && o.position) {
      const occ = occlusionFor(o.zone ?? this.listenerZone, this.listenerZone);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = occ.cutoffHz;
      const occGain = ctx.createGain();
      occGain.gain.value = occ.gain;
      const p = ctx.createPanner();
      p.panningModel = this.opts.panning;
      p.distanceModel = spec.model.model;
      p.refDistance = spec.model.refDistance;
      p.maxDistance = spec.model.maxDistance;
      p.rolloffFactor = spec.model.rolloff;
      p.positionX.value = o.position[0]; p.positionY.value = o.position[1]; p.positionZ.value = o.position[2];
      gain.connect(lp); lp.connect(occGain); occGain.connect(p); p.connect(bus);
      tail = gain;
    } else {
      gain.connect(bus);
    }

    const nodes = synthesize(ctx, tail, ev, now, {
      surface: o.surface ?? 'tile', intensity: o.intensity ?? 1, rng: this.opts.rng,
    });
    this.voices.push({
      id: this.nextId++, priority: spec.priority, distance, startedAt: now, gain, nodes, endsAt: now + spec.duration,
    });
    if (spec.caption) { this.lastCaption = spec.caption; this.emit(); }
    return true;
  }

  /** Gọi mỗi frame với vận tốc người chơi; phát bước chân khi tới quãng bước. */
  updateFootsteps(speed: number, dt: number, grounded: boolean, surface: Surface = 'tile'): boolean {
    const r = stepFootsteps(this.foot, { speed, dt, grounded });
    this.foot = r.state;
    return r.step ? this.play('footstep', { surface, intensity: r.intensity }) : false;
  }

  playUi(): boolean {
    return this.play('uiClick');
  }

  /** Dọn khi tháo scene: dừng mọi voice và đóng context. */
  dispose(): void {
    this.stopAll();
    this.gate.clear();
    const ctx = this.ctx;
    this.ctx = null;
    this.buses = {};
    this.status = 'locked';
    void ctx?.close?.();
    this.listeners.clear();
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
