import { describe, expect, it } from 'vitest';
import { SpatialAudioManager } from './manager';
import { AmbientScape, applyCone, resolveAmbientSources, CONE_BY_KIND } from './ambient';
import type { ZoneObject } from '../../content/types';

function param(v = 0) {
  return { value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
    setTargetAtTime() {}, cancelScheduledValues() {} };
}
/** AudioContext giả: nút ghi lại các nút mà nó connect tới. */
function mockCtx() {
  const all: any[] = [];
  const node = (kind: string, extra: object = {}) => {
    const n: any = { kind, targets: [] as unknown[], connect(t: unknown) { n.targets.push(t); return t; }, disconnect() {}, start() {}, stop() {}, ...extra };
    all.push(n);
    return n;
  };
  const ctx: any = {
    currentTime: 0, sampleRate: 8000, state: 'suspended', destination: node('destination'),
    listener: { positionX: param(), positionY: param(), positionZ: param(), forwardX: param(), forwardY: param(),
      forwardZ: param(), upX: param(), upY: param(), upZ: param() },
    resume() { ctx.state = 'running'; return Promise.resolve(); },
    suspend() { ctx.state = 'suspended'; return Promise.resolve(); },
    close() { return Promise.resolve(); },
    createGain: () => node('gain', { gain: param(1) }),
    createOscillator: () => node('osc', { frequency: param(), type: '' }),
    createBufferSource: () => node('src', { buffer: null, loop: false }),
    createBiquadFilter: () => node('filter', { frequency: param(), Q: param(), type: '' }),
    createPanner: () => node('panner', { positionX: param(), positionY: param(), positionZ: param(),
      orientationX: param(), orientationY: param(), orientationZ: param() }),
    createBuffer: (_c: number, len: number) => ({ copyToChannel() {}, getChannelData: () => new Float32Array(len) }),
  };
  return { ctx, all };
}
const store = () => ({ getItem: () => null, setItem: () => undefined });
const obj = (id: string, position: [number, number, number], size: [number, number, number]): ZoneObject =>
  ({ id, kind: 'meeting', label: id, position, size, action: 'none', roles: [] });

async function setup() {
  const { ctx, all } = mockCtx();
  const m = new SpatialAudioManager({ createContext: () => ctx as AudioContext, storage: store() });
  const scape = new AmbientScape(m);
  return { m, ctx, all, scape };
}

describe('ambient trên bus ambient', () => {
  it('chưa unlock thì không dựng gì; sau unlock thì lớp nền nối vào bus ambient', async () => {
    const { m, all, scape } = await setup();
    expect(all.filter((n) => n.kind !== 'destination').length).toBe(0);
    expect(scape.debugState().bus).toBeNull();
    await m.unlock();
    const bus = m.getBus('ambient')!.node as any;
    const base = all.filter((n) => n.kind === 'gain' && n.targets.includes(bus));
    expect(base.length).toBeGreaterThan(0);
    expect(scape.debugState()).toMatchObject({ running: true, bus: 'ambient', layers: ['base'] });
    // Không nối thẳng vào destination (bỏ qua bộ trộn) và không nối vào bus khác.
    const dest = all.find((n) => n.kind === 'destination');
    const others = ['sfx', 'ui', 'voice'].map((b) => m.getBus(b as 'sfx')!.node);
    expect(all.some((n) => n.kind !== 'gain' || n === m.getBus('master')!.node ? false : n.targets.includes(dest))).toBe(false);
    expect(all.some((n) => others.some((o) => n.targets.includes(o)))).toBe(false);
  });

  it('tôn trọng bus ambient: tắt tiếng bus ambient đưa gain về 0', async () => {
    const { m } = await setup();
    await m.unlock();
    m.setMuted('ambient', true);
    expect(m.getSettings().ambient.muted).toBe(true);
  });

  it('theo khu: lounge có pad, karaoke có kick, về office thì bỏ', async () => {
    const { m, scape } = await setup();
    await m.unlock();
    scape.setZone('lounge');
    expect(scape.debugState().layers).toEqual(['base', 'pad']);
    scape.setZone('karaoke');
    expect(scape.debugState().layers).toEqual(['base', 'kick']);
    scape.setZone('office');
    expect(scape.debugState().layers).toEqual(['base']);
    scape.dispose();
  });

  it('tắt enabled thì dỡ đồ thị; context mới (sau dispose) dựng lại, không phát trùng', async () => {
    const { m, scape } = await setup();
    await m.unlock();
    scape.setEnabled(false);
    expect(scape.debugState().layers).toEqual([]);
    scape.setEnabled(true);
    expect(scape.debugState().layers).toEqual(['base']);
    scape.setEnabled(true);
    expect(scape.debugState().layers).toEqual(['base']);
  });

  it('không còn đường phát ambient cũ: engine cũ không có lớp nền', async () => {
    const { AmbientEngine } = await import('../engine');
    const proto = AmbientEngine.prototype as unknown as Record<string, unknown>;
    expect(proto.setZone).toBeUndefined();
    expect(proto.ensureLayers).toBeUndefined();
    expect(proto.startBase).toBeUndefined();
  });
});

describe('nguồn có hướng (cone)', () => {
  const objects = [obj('mr1', [-18, 1.4, -2.15], [5, 2.8, 4.7]), obj('karaoke_room', [20, 1.4, -7.7], [4.4, 2.8, 3.2])];

  it('resolve: đặt sát mép sau, hướng đơn vị, cone theo loại; vật thiếu thì bỏ qua', () => {
    const src = resolveAmbientSources(objects);
    expect(src.map((s) => s.id)).toEqual(['tv_mr1', 'speaker_karaoke']);
    const tv = src[0];
    expect(tv.orientation).toEqual([0, 0, 1]);
    expect(tv.position[2]).toBeCloseTo(-2.15 - (4.7 / 2 - 0.3));
    expect(tv.cone).toEqual(CONE_BY_KIND.tv);
    const sp = src[1];
    expect(sp.orientation).toEqual([-1, 0, 0]);
    expect(sp.position[0]).toBeCloseTo(20 + (4.4 / 2 - 0.3));
  });

  it('applyCone gán góc, outerGain và orientation', () => {
    const p: any = { orientationX: param(), orientationY: param(), orientationZ: param() };
    applyCone(p, { inner: 90, outer: 200, outerGain: 0.25 }, [0, 0, 1]);
    expect(p).toMatchObject({ coneInnerAngle: 90, coneOuterAngle: 200, coneOuterGain: 0.25 });
    expect([p.orientationX.value, p.orientationY.value, p.orientationZ.value]).toEqual([0, 0, 1]);
  });

  it('nguồn trong cảnh tạo panner có cone, hướng và vị trí đúng, nối ra bus ambient', async () => {
    const { m, all, scape } = await setup();
    scape.setSources(resolveAmbientSources(objects));
    await m.unlock();
    const panners = all.filter((n) => n.kind === 'panner');
    expect(panners.length).toBe(2);
    const tv = panners[0];
    expect(tv.coneInnerAngle).toBe(CONE_BY_KIND.tv.inner);
    expect(tv.coneOuterAngle).toBe(CONE_BY_KIND.tv.outer);
    expect(tv.coneOuterGain).toBe(CONE_BY_KIND.tv.outerGain);
    expect([tv.orientationX.value, tv.orientationY.value, tv.orientationZ.value]).toEqual([0, 0, 1]);
    const bus = m.getBus('ambient')!.node;
    const outGain = all.find((n) => n.kind === 'gain' && tv.targets.includes(n))!;
    expect(outGain.targets).toContain(bus);
    expect(scape.debugState().sources.map((s) => s.id)).toEqual(['tv_mr1', 'speaker_karaoke']);
  });
});
