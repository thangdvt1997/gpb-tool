import { describe, expect, it } from 'vitest';
import { EMOTES } from '../library';
import {
  CANCEL_DISTANCE_FACTOR, INVITE_TTL_MS, SOCIAL_ACTIONS, angleDiff, canStartSocial, createInvite,
  facePair, getSocialAction, pickTarget, reduceInvite, remainingSec, yawToward,
} from './logic';
import type { SocialContext } from './logic';
import { SocialSession } from './session';
import { createLocalBus } from './transport';
import type { EmoteId } from '../types';

const okCtx: SocialContext = { speed: 0, airborne: false, sitting: false, editorOpen: false, interacting: false, inMatch: false };
const hs = getSocialAction('handshake')!;
const wave = getSocialAction('wave_at')!;

describe('thư viện emote xã hội', () => {
  it('mỗi hành động có emote thật, internal, có khung', () => {
    for (const a of SOCIAL_ACTIONS) {
      const e = EMOTES[a.emoteId];
      expect(e).toBeDefined();
      expect(e.internal).toBe(true);
      expect(e.frames.length).toBeGreaterThan(0);
    }
  });
});

describe('hình học', () => {
  it('yawToward và angleDiff', () => {
    expect(yawToward({ x: 0, z: 0 }, { x: 0, z: 1 })).toBeCloseTo(0);
    expect(yawToward({ x: 0, z: 0 }, { x: 1, z: 0 })).toBeCloseTo(Math.PI / 2);
    expect(angleDiff(3, -3)).toBeCloseTo(2 * Math.PI - 6);
  });
  it('facePair quay hai người về nhau (lệch pi)', () => {
    const f = facePair({ x: 0, z: 0 }, { x: 2, z: 2 });
    expect(Math.abs(angleDiff(f.a, f.b))).toBeCloseTo(Math.PI);
  });
});

describe('pickTarget', () => {
  const self = { x: 0, z: 0, yaw: 0 };
  it('chọn người gần nhất trong tầm nhìn', () => {
    const t = pickTarget(self, [{ id: 'far', x: 0, z: 2 }, { id: 'near', x: 0.5, z: 1 }], wave);
    expect(t?.id).toBe('near');
  });
  it('bỏ người sau lưng', () => {
    expect(pickTarget(self, [{ id: 'back', x: 0, z: -1 }], wave)).toBeNull();
  });
  it('bỏ người ngoài bán kính', () => {
    expect(pickTarget(self, [{ id: 'x', x: 0, z: 3 }], hs)).toBeNull();
  });
  it('bỏ chính mình và người chồng lên', () => {
    expect(pickTarget(self, [{ id: 'me', x: 0, z: 1 }, { id: 'o', x: 0, z: 0.05 }], wave, 'me')).toBeNull();
  });
});

describe('canStartSocial', () => {
  it('cho phép khi đứng yên', () => expect(canStartSocial(wave, okCtx, 0, 0).ok).toBe(true));
  it.each([
    ['sitting', 'sitting'], ['airborne', 'airborne'], ['inMatch', 'in_match'],
    ['editorOpen', 'editor_open'], ['interacting', 'interacting'],
  ] as const)('chặn khi %s', (k, reason) => {
    expect(canStartSocial(wave, { ...okCtx, [k]: true }, 0, 0)).toEqual({ ok: false, reason });
  });
  it('chặn khi đang chạy và khi cooldown', () => {
    expect(canStartSocial(wave, { ...okCtx, speed: 3 }, 0, 0)).toEqual({ ok: false, reason: 'moving' });
    expect(canStartSocial(wave, okCtx, 100, 500)).toEqual({ ok: false, reason: 'cooldown' });
  });
});

describe('máy trạng thái lời mời', () => {
  const inv = () => createInvite('i1', 'handshake', 'A', 'B', 1000);
  it('B chấp nhận', () => expect(reduceInvite(inv(), { type: 'accept', by: 'B', now: 2000 }).status).toBe('accepted'));
  it('A không tự chấp nhận được', () => expect(reduceInvite(inv(), { type: 'accept', by: 'A', now: 2000 }).status).toBe('pending'));
  it('B từ chối', () => expect(reduceInvite(inv(), { type: 'decline', by: 'B', now: 2000 }).status).toBe('declined'));
  it('chỉ A hủy được', () => {
    expect(reduceInvite(inv(), { type: 'cancel', by: 'B', now: 2000 }).status).toBe('pending');
    expect(reduceInvite(inv(), { type: 'cancel', by: 'A', now: 2000 }).status).toBe('cancelled');
  });
  it('hết hạn, không chấp nhận muộn', () => {
    const late = 1000 + INVITE_TTL_MS;
    expect(reduceInvite(inv(), { type: 'tick', now: late }).status).toBe('expired');
    expect(reduceInvite(inv(), { type: 'accept', by: 'B', now: late }).status).toBe('expired');
  });
  it('đi xa thì hủy, ở gần thì giữ', () => {
    expect(reduceInvite(inv(), { type: 'tick', now: 2000, dist: hs.maxRange * CANCEL_DISTANCE_FACTOR + 0.1 }).status).toBe('cancelled');
    expect(reduceInvite(inv(), { type: 'tick', now: 2000, dist: 2 }).status).toBe('pending');
  });
  it('trạng thái cuối bất biến', () => {
    const done = reduceInvite(inv(), { type: 'decline', by: 'B', now: 2000 });
    expect(reduceInvite(done, { type: 'accept', by: 'B', now: 2100 })).toBe(done);
  });
  it('remainingSec', () => expect(remainingSec(inv(), 1000 + 4500)).toBe(Math.ceil((INVITE_TTL_MS - 4500) / 1000)));
});

function setup() {
  const bus = createLocalBus();
  let t = 0;
  const pos: Record<string, { x: number; z: number }> = { A: { x: 0, z: 0 }, B: { x: 0, z: 1.5 } };
  const log: string[] = [];
  const mk = (id: string) => new SocialSession({
    transport: bus.endpoint(id), now: () => t, getPosition: (o) => pos[o],
    play: (e: EmoteId) => log.push(`${id}:play:${e}`),
    face: (y) => log.push(`${id}:face:${y.toFixed(2)}`),
    onRemotePlay: (f, e) => log.push(`${id}:remote:${f}:${e}`),
  });
  return { a: mk('A'), b: mk('B'), pos, log, adv: (ms: number) => { t += ms; } };
}
const selfA = { x: 0, z: 0, yaw: 0 };
const peersA = [{ id: 'B', x: 0, z: 1.5 }];

describe('SocialSession', () => {
  it('bắt tay: mời, chấp nhận, cả hai phát emote', () => {
    const s = setup();
    const r = s.a.start('handshake', okCtx, selfA, peersA);
    expect(r).toMatchObject({ ok: true, mode: 'invited', targetId: 'B' });
    expect(s.b.getIncoming()?.from).toBe('A');
    expect(s.log.some((l) => l.includes('play'))).toBe(false);
    expect(s.b.accept()).toBe(true);
    expect(s.log).toContain('A:play:handshake');
    expect(s.log).toContain('B:play:handshake');
    expect(s.a.getOutgoing()).toBeNull();
    expect(s.b.getIncoming()).toBeNull();
  });
  it('từ chối thì không phát gì', () => {
    const s = setup();
    s.a.start('high_five', okCtx, selfA, peersA);
    expect(s.b.decline()).toBe(false);
    expect(s.log.filter((l) => l.includes('play'))).toHaveLength(0);
    expect(s.a.getOutgoing()).toBeNull();
  });
  it('chấp nhận quá hạn bị từ chối', () => {
    const s = setup();
    s.a.start('handshake', okCtx, selfA, peersA);
    s.adv(INVITE_TTL_MS + 1);
    expect(s.b.accept()).toBe(false);
    expect(s.log.filter((l) => l.includes('play'))).toHaveLength(0);
  });
  it('A đi xa thì cả hai bên hủy', () => {
    const s = setup();
    s.a.start('handshake', okCtx, selfA, peersA);
    s.pos.A = { x: 0, z: -20 };
    s.a.tick();
    expect(s.a.getOutgoing()).toBeNull();
    expect(s.b.getIncoming()).toBeNull();
  });
  it('A hủy lời mời', () => {
    const s = setup();
    s.a.start('handshake', okCtx, selfA, peersA);
    s.a.cancelOutgoing();
    expect(s.b.getIncoming()).toBeNull();
  });
  it('cooldown chống spam và busy khi đang chờ', () => {
    const s = setup();
    s.a.start('handshake', okCtx, selfA, peersA);
    expect(s.a.start('high_five', okCtx, selfA, peersA)).toEqual({ ok: false, reason: 'busy' });
    s.a.cancelOutgoing();
    expect(s.a.start('handshake', okCtx, selfA, peersA)).toEqual({ ok: false, reason: 'cooldown' });
    s.adv(9000);
    expect(s.a.start('handshake', okCtx, selfA, peersA).ok).toBe(true);
  });
  it('vẫy tay không cần đồng ý, người kia được báo', () => {
    const s = setup();
    const r = s.a.start('wave_at', okCtx, selfA, peersA);
    expect(r).toMatchObject({ ok: true, mode: 'played' });
    expect(s.log).toContain('A:play:wave_at');
    expect(s.log).toContain('B:remote:A:wave_at');
    expect(s.b.getIncoming()).toBeNull();
  });
  it('chặn khi ngồi hoặc trong trận, báo no_target/too_far', () => {
    const s = setup();
    expect(s.a.start('wave_at', { ...okCtx, sitting: true }, selfA, peersA)).toEqual({ ok: false, reason: 'sitting' });
    expect(s.a.start('wave_at', { ...okCtx, inMatch: true }, selfA, peersA)).toEqual({ ok: false, reason: 'in_match' });
    expect(s.a.start('wave_at', okCtx, selfA, [])).toEqual({ ok: false, reason: 'no_target' });
    expect(s.a.start('handshake', okCtx, selfA, [{ id: 'B', x: 0, z: 6 }])).toEqual({ ok: false, reason: 'too_far' });
  });
  it('căn hướng: B quay về A khi chấp nhận', () => {
    const s = setup();
    s.a.start('handshake', okCtx, selfA, peersA);
    s.b.accept();
    expect(s.log).toContain(`B:face:${Math.PI.toFixed(2)}`);
  });
});
