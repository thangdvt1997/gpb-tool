/**
 * Âm nền (ambient) chạy trên bus 'ambient' của SpatialAudioManager (task 14), thay engine cũ.
 * - Lớp nền mọi khu: nhiễu hồng qua lowpass (tiếng văn phòng, điều hòa).
 * - Lớp theo khu: pad cho lounge, nhịp kick cho karaoke.
 * - Nguồn có hướng (TV, loa, máy in): PannerNode có cone, hướng theo hướng vật trong cảnh.
 * Bus, tôn trọng Cài đặt, mở khóa sau thao tác và tạm dừng khi tab ẩn đều do manager lo.
 */
import type { ZoneObject } from '../../content/types';
import { occlusionFor, type DistanceModel } from './pure';
import type { SpatialAudioManager } from './manager';

export type AmbientZone = 'office' | 'lounge' | 'game' | 'karaoke' | 'events' | 'meeting' | 'server' | 'soc';
export type AmbientSourceKind = 'tv' | 'speaker' | 'printer';

export interface ConeSpec {
  /** Góc đầy đủ (độ) trong đó âm không giảm. */
  inner: number;
  /** Góc đầy đủ (độ) ngoài đó âm xuống outerGain. */
  outer: number;
  outerGain: number;
}

export const CONE_BY_KIND: Record<AmbientSourceKind, ConeSpec> = {
  tv: { inner: 90, outer: 200, outerGain: 0.25 },
  speaker: { inner: 120, outer: 240, outerGain: 0.3 },
  printer: { inner: 150, outer: 270, outerGain: 0.5 },
};

const SOURCE_MODEL: DistanceModel = { refDistance: 1.5, maxDistance: 18, rolloff: 1.2, model: 'inverse' };

interface SourceVoice {
  filter: BiquadFilterType;
  hz: number;
  q: number;
  level: number;
}
const VOICE_BY_KIND: Record<AmbientSourceKind, SourceVoice> = {
  tv: { filter: 'bandpass', hz: 1400, q: 0.8, level: 0.5 },
  speaker: { filter: 'lowpass', hz: 500, q: 0.7, level: 0.7 },
  printer: { filter: 'bandpass', hz: 900, q: 2, level: 0.35 },
};

export interface AmbientSourceDef {
  id: string;
  kind: AmbientSourceKind;
  /** Vật thể trong it.json mà nguồn gắn vào. */
  objectId: string;
  /** Hướng nguồn quay về trên mặt sàn (x, z), không cần chuẩn hoá. */
  facing: [number, number];
  /** Độ cao (m). */
  y: number;
  /** Vùng âm thanh chứa nguồn (để lọc qua tường). */
  zone: AmbientZone;
}

/**
 * Nguồn có hướng. Vật thể chưa có trường xoay trong dữ liệu, nên hướng khai ở đây:
 * TV phòng họp áp tường sau quay vào phòng (theo meeting.tsx), loa karaoke áp tường Đông quay vào phòng.
 */
export const AMBIENT_SOURCE_DEFS: readonly AmbientSourceDef[] = [
  { id: 'tv_mr1', kind: 'tv', objectId: 'mr1', facing: [0, 1], y: 1.6, zone: 'meeting' },
  { id: 'tv_mr2', kind: 'tv', objectId: 'mr2', facing: [0, 1], y: 1.6, zone: 'meeting' },
  { id: 'tv_mr3', kind: 'tv', objectId: 'mr3', facing: [0, 1], y: 1.6, zone: 'meeting' },
  { id: 'tv_games', kind: 'tv', objectId: 'games_corner', facing: [0, 1], y: 1.4, zone: 'game' },
  { id: 'speaker_karaoke', kind: 'speaker', objectId: 'karaoke_room', facing: [-1, 0], y: 2, zone: 'karaoke' },
  { id: 'printer_print', kind: 'printer', objectId: 'util_print', facing: [0, 1], y: 1, zone: 'office' },
];

export interface ResolvedAmbientSource {
  id: string;
  kind: AmbientSourceKind;
  zone: AmbientZone;
  position: [number, number, number];
  /** Vector đơn vị hướng của nguồn (orientation của PannerNode). */
  orientation: [number, number, number];
  cone: ConeSpec;
}

const INSET = 0.3;

/** Đặt nguồn sát mép vật thể phía sau (ngược hướng), quay về `facing`. Vật thể không có trong cảnh thì bỏ qua. */
export function resolveAmbientSources(
  objects: readonly ZoneObject[],
  defs: readonly AmbientSourceDef[] = AMBIENT_SOURCE_DEFS,
): ResolvedAmbientSource[] {
  const out: ResolvedAmbientSource[] = [];
  for (const d of defs) {
    const o = objects.find((x) => x.id === d.objectId);
    if (!o) continue;
    const len = Math.hypot(d.facing[0], d.facing[1]) || 1;
    const fx = d.facing[0] / len;
    const fz = d.facing[1] / len;
    const half = (Math.abs(fx) * o.size[0] + Math.abs(fz) * o.size[2]) / 2;
    const back = Math.max(0, half - INSET);
    out.push({
      id: d.id,
      kind: d.kind,
      zone: d.zone,
      position: [o.position[0] - fx * back, d.y, o.position[2] - fz * back],
      orientation: [fx, 0, fz],
      cone: CONE_BY_KIND[d.kind],
    });
  }
  return out;
}

/** Gán cone và hướng cho PannerNode. */
export function applyCone(p: PannerNode, cone: ConeSpec, orientation: [number, number, number]): void {
  p.coneInnerAngle = cone.inner;
  p.coneOuterAngle = cone.outer;
  p.coneOuterGain = cone.outerGain;
  p.orientationX.value = orientation[0];
  p.orientationY.value = orientation[1];
  p.orientationZ.value = orientation[2];
}

const PAD_CHORD_HZ = [261.63, 329.63, 392.0];
const BEAT_SECONDS = 0.5;
const SCHEDULER_MS = 100;
const LOOKAHEAD_SECONDS = 0.2;
const RETIRE_MS = 1500;
const NOISE_SECONDS = 4;

/** Nhiễu hồng (bộ lọc Paul Kellet), chuẩn hoá đỉnh 0.8. Vòng lặp 4 s, đủ êm cho nền. */
function makePinkNoise(ctx: AudioContext): AudioBuffer {
  const length = Math.round(ctx.sampleRate * NOISE_SECONDS);
  const data = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
    peak = Math.max(peak, Math.abs(data[i]));
  }
  const scale = peak > 0 ? 0.8 / peak : 1;
  for (let i = 0; i < length; i++) data[i] *= scale;
  // Làm mờ hai đầu để chỗ nối vòng lặp không click.
  const fadeLen = Math.min(length >> 2, Math.round(ctx.sampleRate * 0.05));
  for (let i = 0; i < fadeLen; i++) {
    const w = i / fadeLen;
    data[i] *= w;
    data[length - 1 - i] *= w;
  }
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  buffer.copyToChannel(data, 0);
  return buffer;
}

interface Layer {
  out: GainNode;
  stop: () => void;
}
interface LiveSource {
  def: ResolvedAmbientSource;
  panner: PannerNode;
  lowpass: BiquadFilterNode;
  occ: GainNode;
  layer: Layer;
}

export interface AmbientDebugState {
  running: boolean;
  bus: 'ambient' | null;
  zone: AmbientZone;
  layers: string[];
  sources: { id: string; kind: AmbientSourceKind; cone: ConeSpec; orientation: [number, number, number] }[];
}

export class AmbientScape {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private base: Layer | null = null;
  private zoneLayer: Layer | null = null;
  private zoneLayerName = '';
  private live: LiveSource[] = [];
  private defs: ResolvedAmbientSource[] = [];
  private zone: AmbientZone = 'office';
  private enabled = true;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private unsub: () => void;

  constructor(private readonly manager: SpatialAudioManager) {
    this.unsub = manager.subscribe(() => this.sync());
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.sync();
  }

  setZone(zone: AmbientZone): void {
    if (zone === this.zone) return;
    this.zone = zone;
    if (this.ctx) {
      if (this.zoneLayer) this.retire(this.zoneLayer);
      this.zoneLayer = this.startZoneLayer();
      this.updateOcclusion();
    }
  }

  setSources(sources: ResolvedAmbientSource[]): void {
    this.defs = sources;
    if (this.ctx) {
      this.stopSources();
      this.startSources();
    }
  }

  /** Trạng thái cho hook e2e. */
  debugState(): AmbientDebugState {
    return {
      running: !!this.ctx && this.manager.status === 'running',
      bus: this.bus ? 'ambient' : null,
      zone: this.zone,
      layers: [this.base ? 'base' : '', this.zoneLayer ? this.zoneLayerName : ''].filter(Boolean),
      sources: this.live.map((s) => ({
        id: s.def.id, kind: s.def.kind, cone: s.def.cone, orientation: s.def.orientation,
      })),
    };
  }

  dispose(): void {
    this.unsub();
    this.teardown();
  }

  /** Dựng hoặc dỡ đồ thị theo trạng thái manager (đã unlock hay chưa, context còn không, bật hay tắt). */
  private sync(): void {
    const bus = this.enabled ? this.manager.getBus('ambient') : null;
    if (!bus) {
      if (this.ctx) this.teardown();
      return;
    }
    if (this.ctx === bus.ctx && this.bus === bus.node) return;
    this.teardown();
    this.ctx = bus.ctx;
    this.bus = bus.node;
    this.noise = makePinkNoise(bus.ctx);
    this.base = this.startBase();
    this.zoneLayer = this.startZoneLayer();
    this.startSources();
  }

  private teardown(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.base?.stop();
    this.zoneLayer?.stop();
    this.stopSources();
    this.base = null;
    this.zoneLayer = null;
    this.ctx = null;
    this.bus = null;
    this.noise = null;
  }

  private fade(param: AudioParam, value: number, tc: number): void {
    if (this.ctx) param.setTargetAtTime(value, this.ctx.currentTime, tc);
  }

  private retire(layer: Layer): void {
    this.fade(layer.out.gain, 0, 0.2);
    const t = setTimeout(() => {
      layer.stop();
      this.timers = this.timers.filter((x) => x !== t);
    }, RETIRE_MS);
    this.timers.push(t);
  }

  private startBase(): Layer | null {
    const { ctx, bus, noise } = this;
    if (!ctx || !bus || !noise) return null;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(bus);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.Q.value = 0.5;
    const level = ctx.createGain();
    level.gain.value = 0.25;
    src.connect(lp); lp.connect(level); level.connect(out);
    src.start();
    this.fade(out.gain, 1, 1.0);
    return { out, stop: () => stopNodes([src], [src, lp, level, out]) };
  }

  private startZoneLayer(): Layer | null {
    if (this.zone === 'lounge') { this.zoneLayerName = 'pad'; return this.startPad(); }
    if (this.zone === 'karaoke') { this.zoneLayerName = 'kick'; return this.startKick(); }
    this.zoneLayerName = '';
    return null;
  }

  private startPad(): Layer | null {
    const { ctx, bus } = this;
    if (!ctx || !bus) return null;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(bus);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    const level = ctx.createGain();
    level.gain.value = 0.5;
    lp.connect(level); level.connect(out);
    const oscs: OscillatorNode[] = [];
    const nodes: AudioNode[] = [lp, level, out];
    for (const hz of PAD_CHORD_HZ) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = 0.3;
      osc.connect(g); g.connect(lp);
      osc.start();
      oscs.push(osc);
      nodes.push(osc, g);
    }
    this.fade(out.gain, 1, 1.0);
    return { out, stop: () => stopNodes(oscs, nodes) };
  }

  private startKick(): Layer | null {
    const { ctx, bus } = this;
    if (!ctx || !bus) return null;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(bus);
    const kb = ctx.createGain();
    kb.gain.value = 0.5;
    kb.connect(out);
    const kick = (when: number): void => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, when);
      osc.frequency.exponentialRampToValueAtTime(40, when + 0.12);
      env.gain.setValueAtTime(0.0001, when);
      env.gain.exponentialRampToValueAtTime(1, when + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
      osc.connect(env); env.connect(kb);
      osc.start(when);
      osc.stop(when + 0.32);
      osc.onended = () => { osc.disconnect(); env.disconnect(); };
    };
    let next = ctx.currentTime + 0.05;
    const timer = setInterval(() => {
      // Context đang tạm dừng (tab ẩn) thì currentTime đứng yên, không xếp thêm nhịp.
      if (next < ctx.currentTime) next = ctx.currentTime + 0.02;
      while (next < ctx.currentTime + LOOKAHEAD_SECONDS) {
        kick(next);
        next += BEAT_SECONDS;
      }
    }, SCHEDULER_MS);
    this.fade(out.gain, 1, 0.5);
    return { out, stop: () => { clearInterval(timer); stopNodes([], [kb, out]); } };
  }

  private startSources(): void {
    const { ctx, bus, noise } = this;
    if (!ctx || !bus || !noise) return;
    for (const def of this.defs) {
      const v = VOICE_BY_KIND[def.kind];
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = v.filter;
      filt.frequency.value = v.hz;
      filt.Q.value = v.q;
      const level = ctx.createGain();
      level.gain.value = v.level;
      // Lọc qua tường: vùng nguồn khác vùng người nghe thì lowpass và giảm gain.
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      const occ = ctx.createGain();
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = SOURCE_MODEL.model;
      p.refDistance = SOURCE_MODEL.refDistance;
      p.maxDistance = SOURCE_MODEL.maxDistance;
      p.rolloffFactor = SOURCE_MODEL.rolloff;
      p.positionX.value = def.position[0];
      p.positionY.value = def.position[1];
      p.positionZ.value = def.position[2];
      applyCone(p, def.cone, def.orientation);
      const out = ctx.createGain();
      out.gain.value = 0;
      src.connect(filt); filt.connect(level); level.connect(lowpass);
      lowpass.connect(occ); occ.connect(p); p.connect(out); out.connect(bus);
      src.start();
      this.fade(out.gain, 1, 0.5);
      const layer: Layer = { out, stop: () => stopNodes([src], [src, filt, level, lowpass, occ, p, out]) };
      this.live.push({ def, panner: p, lowpass, occ, layer });
    }
    this.updateOcclusion();
  }

  private stopSources(): void {
    for (const s of this.live) s.layer.stop();
    this.live = [];
  }

  /** Người nghe ở vùng khác vùng nguồn thì nghe như qua tường. */
  private updateOcclusion(): void {
    for (const s of this.live) {
      const r = occlusionFor(s.def.zone, this.zone);
      s.lowpass.frequency.value = r.cutoffHz;
      s.occ.gain.value = r.gain;
    }
  }
}


function stopNodes(sources: { stop(when?: number): void }[], nodes: AudioNode[]): void {
  for (const s of sources) { try { s.stop(); } catch { /* đã dừng */ } }
  for (const n of nodes) { try { n.disconnect(); } catch { /* đã ngắt */ } }
}
