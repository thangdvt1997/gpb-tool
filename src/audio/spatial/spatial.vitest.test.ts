import { describe, expect, it } from 'vitest';
import {
  CooldownGate, SFX_SPECS, coneGain, defaultBusSettings, distanceGain, newFootstepState, occlusionFor,
  parseBusSettings, pickVoiceToSteal, serializeBusSettings, spatialGain, stepFootsteps, strideFor, busGain,
  type DistanceModel,
} from './pure';
import { SpatialAudioManager } from './manager';

const M: DistanceModel = { refDistance: 1, maxDistance: 10, rolloff: 1, model: 'inverse' };

function param(v = 0) {
  return { value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
    setTargetAtTime() {}, cancelScheduledValues() {} };
}
/** AudioContext giả tối thiểu: đếm nút được tạo. */
function mockCtx() {
  const created = { gain: 0, osc: 0, src: 0, panner: 0 };
  const node = (extra: object = {}) => ({ connect() {}, disconnect() {}, start() {}, stop() {}, ...extra });
  const ctx = {
    currentTime: 0, sampleRate: 8000, state: 'suspended', destination: {},
    listener: { positionX: param(), positionY: param(), positionZ: param(), forwardX: param(), forwardY: param(),
      forwardZ: param(), upX: param(), upY: param(), upZ: param() },
    resume() { ctx.state = 'running'; return Promise.resolve(); },
    suspend() { ctx.state = 'suspended'; return Promise.resolve(); },
    close() { return Promise.resolve(); },
    createGain() { created.gain++; return node({ gain: param(1) }); },
    createOscillator() { created.osc++; return node({ frequency: param(), type: '' }); },
    createBufferSource() { created.src++; return node({ buffer: null, loop: false }); },
    createBiquadFilter() { return node({ frequency: param(), Q: param(), type: '' }); },
    createPanner() { created.panner++; return node({ positionX: param(), positionY: param(), positionZ: param() }); },
    createBuffer(_c: number, len: number) { return { getChannelData: () => new Float32Array(len) }; },
  };
  return { ctx, created };
}
const memStore = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
async function mk(opts: { max?: number; store?: ReturnType<typeof memStore> } = {}) {
  const { ctx, created } = mockCtx();
  const m = new SpatialAudioManager({ createContext: () => ctx as unknown as AudioContext, storage: opts.store ?? memStore(), maxVoices: opts.max, rng: () => 0.5 });
  return { m, ctx, created };
}

describe('logic thuần', () => {
  it('gain giảm theo khoảng cách và bằng 0 ngoài maxDistance', () => {
    expect(distanceGain(0.5, M)).toBe(1);
    expect(distanceGain(2, M)).toBeGreaterThan(distanceGain(5, M));
    expect(distanceGain(10, M)).toBe(0);
    expect(distanceGain(-1, M)).toBe(0);
  });
  it('các mô hình linear/exponential hợp lệ', () => {
    expect(distanceGain(5.5, { ...M, model: 'linear' })).toBeCloseTo(0.5);
    expect(distanceGain(2, { ...M, model: 'exponential', rolloff: 2 })).toBeCloseTo(0.25);
  });
  it('cone: trong góc trong = 1, ngoài = outerGain', () => {
    expect(coneGain(10, 60, 180, 0.2)).toBe(1);
    expect(coneGain(120, 60, 180, 0.2)).toBe(0.2);
    expect(coneGain(60, 60, 180, 0.2)).toBeGreaterThan(0.2);
  });
  it('vùng khác nhau thì lọc thấp và giảm gain', () => {
    const same = occlusionFor('meeting', 'meeting');
    const other = occlusionFor('meeting', 'office');
    expect(other.cutoffHz).toBeLessThan(same.cutoffHz);
    expect(spatialGain(3, M, 'a', 'b')).toBeLessThan(spatialGain(3, M, 'a', 'a'));
  });
  it('voice stealing: cướp ưu tiên thấp, xa nhất; từ chối voice kém hơn', () => {
    const act = [
      { id: 1, priority: 3, distance: 1, startedAt: 0 },
      { id: 2, priority: 1, distance: 2, startedAt: 1 },
      { id: 3, priority: 1, distance: 8, startedAt: 2 },
    ];
    expect(pickVoiceToSteal(act, { priority: 2, distance: 1 }, 4)).toBeNull();
    expect(pickVoiceToSteal(act, { priority: 2, distance: 1 }, 3)).toEqual(act[2]);
    expect(pickVoiceToSteal(act, { priority: 1, distance: 9 }, 3)).toBe('reject');
  });
  it('bước chân: đứng yên và trên không không phát', () => {
    expect(stepFootsteps(newFootstepState(), { speed: 0, dt: 0.016, grounded: true }).step).toBe(false);
    expect(stepFootsteps(newFootstepState(), { speed: 5, dt: 0.016, grounded: false }).step).toBe(false);
  });
  it('bước chân: chạy bước dài hơn và cường độ lớn hơn đi', () => {
    expect(strideFor(4)).toBeGreaterThan(strideFor(1.5));
    const count = (speed: number) => {
      let s = newFootstepState(), n = 0;
      for (let i = 0; i < 600; i++) { const r = stepFootsteps(s, { speed, dt: 1 / 60, grounded: true }); s = r.state; if (r.step) n++; }
      return n;
    };
    // 10 giây: số bước ~ quãng đường / stride
    expect(count(1.5)).toBe(Math.floor(15 / strideFor(1.5)));
    expect(count(4)).toBeGreaterThan(count(1.5));
    const walk = stepFootsteps({ accumulated: 10, foot: 0 }, { speed: 1.5, dt: 0.016, grounded: true });
    const run = stepFootsteps({ accumulated: 10, foot: 0 }, { speed: 4, dt: 0.016, grounded: true });
    expect(run.intensity).toBeGreaterThan(walk.intensity);
  });
  it('bước chân luân phiên hai chân', () => {
    const a = stepFootsteps({ accumulated: 5, foot: 0 }, { speed: 2, dt: 0.016, grounded: true });
    expect(a.foot).toBe(0);
    expect(a.state.foot).toBe(1);
  });
  it('cooldown chặn spam', () => {
    const g = new CooldownGate();
    expect(g.allow('x', 0, 1)).toBe(true);
    expect(g.allow('x', 0.5, 1)).toBe(false);
    expect(g.allow('x', 1.1, 1)).toBe(true);
  });
  it('cấu hình bus: lưu, đọc lại, chịu được JSON hỏng', () => {
    const s = defaultBusSettings();
    s.sfx.volume = 0.3; s.ui.muted = true;
    const back = parseBusSettings(serializeBusSettings(s));
    expect(back.sfx.volume).toBe(0.3);
    expect(busGain(back.ui)).toBe(0);
    expect(parseBusSettings('{not json')).toEqual(defaultBusSettings());
    expect(parseBusSettings('{"sfx":{"volume":9}}').sfx.volume).toBe(1);
  });
  it('đủ 9 sự kiện phản hồi, UI không spatial', () => {
    expect(Object.keys(SFX_SPECS).sort()).toEqual(
      ['chair', 'door', 'drawer', 'footstep', 'printer', 'switch', 'tv', 'uiClick', 'waterCooler'].sort());
    expect(SFX_SPECS.uiClick.spatial).toBe(false);
    expect(SFX_SPECS.uiClick.bus).toBe('ui');
  });
});

describe('SpatialAudioManager (mock AudioContext)', () => {
  it('không tạo context và không phát trước khi unlock', async () => {
    const { m, created } = await mk();
    expect(m.status).toBe('locked');
    expect(m.play('uiClick')).toBe(false);
    expect(created.gain).toBe(0);
  });
  it('unlock chuyển sang running và phát được', async () => {
    const { m } = await mk();
    expect(await m.unlock()).toBe('running');
    expect(m.play('uiClick')).toBe(true);
  });
  it('mute bus ngăn phát; bus khác vẫn phát', async () => {
    const { m } = await mk();
    await m.unlock();
    m.setMuted('ui', true);
    expect(m.play('uiClick')).toBe(false);
    expect(m.play('door', { position: [1, 0, 0], zone: 'office' })).toBe(true);
    m.setMuted('master', true);
    expect(m.play('door', { position: [2, 0, 0] })).toBe(false);
  });
  it('âm lượng được lưu vào storage', async () => {
    const store = memStore();
    const { m } = await mk({ store });
    m.setVolume('sfx', 0.2);
    expect(new SpatialAudioManager({ storage: store }).getSettings().sfx.volume).toBe(0.2);
  });
  it('nguồn ngoài giới hạn nghe không phát', async () => {
    const { m } = await mk();
    await m.unlock();
    m.setListener([0, 0, 0], [0, 0, -1]);
    expect(m.play('switch', { position: [50, 0, 0] })).toBe(false);
    expect(m.play('switch', { position: [2, 0, 0] })).toBe(true);
  });
  it('spam cùng nguồn bị cooldown chặn', async () => {
    const { m } = await mk();
    await m.unlock();
    let ok = 0;
    for (let i = 0; i < 100; i++) if (m.play('door', { position: [1, 0, 0] })) ok++;
    expect(ok).toBe(1);
  });
  it('giới hạn voice đồng thời', async () => {
    const { m } = await mk({ max: 3 });
    await m.unlock();
    for (let i = 0; i < 30; i++) m.play('printer', { position: [1 + i * 0.1, 0, 0] });
    expect(m.activeVoices).toBeLessThanOrEqual(3);
  });
  it('tab ẩn: dừng voice, không phát; quay lại phát tiếp', async () => {
    const { m, ctx } = await mk();
    await m.unlock();
    m.play('uiClick');
    m.setHidden(true);
    expect(m.activeVoices).toBe(0);
    expect(ctx.state).toBe('suspended');
    expect(m.play('uiClick')).toBe(false);
    m.setHidden(false);
    await Promise.resolve(); await Promise.resolve();
    expect(m.status).toBe('running');
    ctx.currentTime = 5;
    expect(m.play('uiClick')).toBe(true);
  });
  it('bước chân qua manager chỉ phát khi di chuyển trên mặt đất', async () => {
    const { m } = await mk();
    await m.unlock();
    let n = 0;
    for (let i = 0; i < 120; i++) { if (m.updateFootsteps(0, 1 / 60, true)) n++; }
    expect(n).toBe(0);
    for (let i = 0; i < 300; i++) if (m.updateFootsteps(2, 1 / 60, false)) n++;
    expect(n).toBe(0);
  });
  it('dispose dọn voice và trở về locked', async () => {
    const { m } = await mk();
    await m.unlock();
    m.play('uiClick');
    m.dispose();
    expect(m.activeVoices).toBe(0);
    expect(m.status).toBe('locked');
  });
});
