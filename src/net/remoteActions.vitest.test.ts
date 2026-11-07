import { describe, expect, it } from 'vitest';
import { EMOTES } from '../emotes/library';
import { emoteDurationSec, samplePoseOf } from '../emotes/player';
import type { Pose } from '../emotes/types';
import { createWorldSocialTransport } from './socialTransport';
import { SocialSession } from '../emotes/social/session';
import type { ServerMessage } from './protocol';
import { MAX_REMOTE_ACTION_MS, RemoteActions, actionYaw, canShowAction } from './remoteActions';
import { RemoteStore } from './remoteState';

const pose = (): Pose => ({ rootY: 0, rootRotY: 0, headRotZ: 0, armLX: 0, armLZ: 0, armRX: 0, armRZ: 0, legLX: 0, legRX: 0 });

describe('RemoteActions', () => {
  it('phát rồi hết hạn đúng theo thời lượng emote', () => {
    const a = new RemoteActions();
    expect(a.play('b', 'wave_at', 1000)).toBe(true);
    const dur = emoteDurationSec(EMOTES.wave_at) * 1000;
    expect(a.get('b', 1000 + dur - 1)?.emoteId).toBe('wave_at');
    expect(a.get('b', 1000 + dur)).toBeNull();
    expect(a.get('b', 1000)).toBeNull(); // đã dọn
  });

  it.each(['wave_at', 'bow', 'point_at', 'handshake', 'high_five'] as const)('%s có thời lượng hữu hạn và pose hợp lệ', (id) => {
    const a = new RemoteActions();
    expect(a.play('b', id, 0)).toBe(true);
    const act = a.get('b', 10)!;
    expect(act.endsAt - act.startedAt).toBeLessThanOrEqual(MAX_REMOTE_ACTION_MS);
    const out = pose();
    expect(samplePoseOf(out, EMOTES[id], 0.8, false)).toBe(true);
    expect(samplePoseOf(out, EMOTES[id], emoteDurationSec(EMOTES[id]) + 0.01, false)).toBe(false);
  });

  it('emote lạ bị từ chối; emote mới thay emote cũ; clear dừng ngay', () => {
    const a = new RemoteActions();
    expect(a.play('b', 'nope' as never, 0)).toBe(false);
    a.play('b', 'wave_at', 0);
    a.play('b', 'bow', 100);
    expect(a.get('b', 200)?.emoteId).toBe('bow');
    a.clear('b');
    expect(a.get('b', 200)).toBeNull();
  });

  it('quay mặt về mục tiêu; không có mục tiêu giữ yaw mạng', () => {
    const a = new RemoteActions();
    a.play('b', 'wave_at', 0, { x: 5, z: 0 });
    expect(actionYaw(a.get('b', 1), { x: 0, z: 0 }, 3)).toBeCloseTo(Math.PI / 2);
    expect(actionYaw(null, { x: 0, z: 0 }, 3)).toBe(3);
    a.play('c', 'bow', 0);
    expect(actionYaw(a.get('c', 1), { x: 0, z: 0 }, 1.5)).toBe(1.5);
  });

  it('chỉ hiện khi đứng yên (không đang ngồi/đi)', () => {
    expect(canShowAction('idle')).toBe(true);
    expect(canShowAction('sit')).toBe(false);
    expect(canShowAction('walk')).toBe(false);
  });
});

describe('RemoteStore: hành động, ngoại hình, ngồi', () => {
  const P = (id: string, extra: object = {}) => ({ id, name: id, x: 0, z: 0, yaw: 0, anim: 'idle', seq: 1, t: 1000, ...extra });

  it('rời phòng hoặc snapshot mới xóa hành động', () => {
    const s = new RemoteStore();
    s.push(P('b'));
    s.actions.play('b', 'bow', 0);
    s.remove('b');
    expect(s.actions.get('b', 1)).toBeNull();
    s.push(P('c'));
    s.actions.play('c', 'bow', 0);
    s.reset([P('c')]);
    expect(s.actions.get('c', 1)).toBeNull();
  });

  it('ngoại hình từ world được chuẩn hóa; không gửi thì undefined; rác không làm hỏng', () => {
    const s = new RemoteStore();
    s.push(P('a'));
    expect(s.appearanceOf('a')).toBeUndefined();
    s.push(P('b', { appearance: { bodyType: 'broad', hairStyle: 'xxx' } }));
    const ap = s.appearanceOf('b')!;
    expect(ap.bodyType).toBe('broad');
    expect(ap.hairStyle).not.toBe('xxx');
    s.push(P('c', { appearance: 42 }));
    expect(s.appearanceOf('c')).toBeDefined();
  });

  it('trạng thái ngồi (anim sit) đi qua nội suy', () => {
    const s = new RemoteStore();
    s.push(P('a', { anim: 'sit', t: 1000 }));
    expect(s.sample('a', 1000)?.anim).toBe('sit');
  });
});

describe('social_play qua world -> onRemotePlay', () => {
  function setup() {
    const subs = new Set<(m: ServerMessage) => void>();
    const sent: Record<string, unknown>[] = [];
    const t = createWorldSocialTransport({ selfId: 'me', send: (m) => (sent.push(m), true), subscribe: (f) => (subs.add(f), () => subs.delete(f)), now: () => 0 });
    const log: string[] = [];
    const s = new SocialSession({
      transport: t, now: () => 0, getPosition: () => ({ x: 0, z: 0 }), play: (e) => log.push(`self:${e}`), face: () => {},
      onRemotePlay: (from, e) => log.push(`${from}:${e}`),
    });
    const push = (m: unknown) => subs.forEach((f) => f(m as ServerMessage));
    return { s, push, log, sent };
  }

  it('nhận social_play gửi cho mình thì phát emote trên người gửi; gửi cho người khác thì bỏ qua', () => {
    const { push, log } = setup();
    push({ type: 'social_play', actionId: 'bow', from: 'b', to: 'me', startTime: 1 });
    push({ type: 'social_play', actionId: 'wave_at', from: 'b', to: 'zzz', startTime: 1 });
    push({ type: 'social_play', actionId: 'khong_co', from: 'b', to: 'me', startTime: 1 });
    expect(log).toEqual(['b:bow']);
  });

  it('lời mời được chấp nhận: cả hai phía thấy đối phương làm hành động', () => {
    const { s, push, log } = setup();
    push({ type: 'social_invite', invite: { id: 'i1', actionId: 'handshake', from: 'b', to: 'me', createdAt: 0, expiresAt: 15000, status: 'pending' } });
    expect(s.accept()).toBe(true);
    expect(log).toEqual(['self:handshake', 'b:handshake']);
  });
});
