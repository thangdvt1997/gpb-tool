import { describe, expect, it } from 'vitest';
import { SocialSession } from '../emotes/social/session';
import { createInvite } from '../emotes/social/logic';
import type { SocialMessage } from '../emotes/social/logic';
import type { ServerMessage } from './protocol';
import { createWorldSocialTransport } from './socialTransport';

/** Mô phỏng server tối thiểu: chuyển tiếp giữa hai đầu, ghi nhận tin gửi lên. */
function link() {
  const subs = new Map<string, Set<(m: ServerMessage) => void>>();
  const sentBy = new Map<string, Record<string, unknown>[]>();
  const mk = (id: string, now: () => number) => {
    sentBy.set(id, []);
    return createWorldSocialTransport({
      selfId: id,
      now,
      send: (m) => { sentBy.get(id)!.push(m); return true; },
      subscribe: (fn) => {
        const set = subs.get(id) ?? new Set();
        subs.set(id, set);
        set.add(fn);
        return () => set.delete(fn);
      },
    });
  };
  const deliver = (to: string, m: unknown) => { for (const f of subs.get(to) ?? []) f(m as ServerMessage); };
  return { mk, deliver, sentBy };
}

describe('transport xã hội qua world', () => {
  it('gửi nguyên thông điệp lên world; chỉ chuyển tin xã hội cho người nghe', () => {
    const { mk, deliver, sentBy } = link();
    const t = mk('a', () => 0);
    const got: SocialMessage[] = [];
    t.subscribe((m) => got.push(m));
    t.send('b', { type: 'social_cancel', inviteId: 'x', by: 'a' });
    expect(sentBy.get('a')).toEqual([{ type: 'social_cancel', inviteId: 'x', by: 'a' }]);
    deliver('a', { type: 'poses', tick: 1, serverTime: 1, poses: [] });
    deliver('a', { type: 'social_play', actionId: 'wave_at', from: 'b', to: 'a', startTime: 5 });
    expect(got.map((m) => m.type)).toEqual(['social_play']);
  });

  it('lời mời đến được quy về đồng hồ cục bộ, giữ nguyên thời lượng', () => {
    const { mk, deliver } = link();
    const t = mk('b', () => 1000);
    const got: SocialMessage[] = [];
    t.subscribe((m) => got.push(m));
    deliver('b', { type: 'social_invite', invite: createInvite('a#1', 'handshake', 'a', 'b', 9_000_000, 15_000) });
    const m = got[0];
    expect(m.type === 'social_invite' && [m.invite.createdAt, m.invite.expiresAt]).toEqual([1000, 16_000]);
  });

  it('social.denied cho lời mời đã gửi thành "bị từ chối"; id lạ bị bỏ qua; hủy đăng ký thì ngừng nhận', () => {
    const { mk, deliver } = link();
    const t = mk('a', () => 0);
    const got: SocialMessage[] = [];
    const off = t.subscribe((m) => got.push(m));
    t.send('b', { type: 'social_invite', invite: createInvite('a#1', 'handshake', 'a', 'b', 0) });
    deliver('a', { type: 'social.denied', code: 'too_far', inviteId: 'zzz' });
    expect(got).toEqual([]);
    deliver('a', { type: 'social.denied', code: 'too_far', inviteId: 'a#1' });
    expect(got).toEqual([{ type: 'social_respond', inviteId: 'a#1', by: 'b', answer: 'decline' }]);
    off();
    deliver('a', { type: 'social_cancel', inviteId: 'q', by: 'b' });
    expect(got.length).toBe(1);
  });

  it('hai SocialSession qua transport: mời, chấp nhận, cả hai phát emote; bị server từ chối thì bên mời được giải phóng', () => {
    const { mk, deliver, sentBy } = link();
    let clock = 0;
    const plays: string[] = [];
    const pos = { a: { x: 0, z: 0 }, b: { x: 1, z: 0 } };
    const session = (id: 'a' | 'b') =>
      new SocialSession({
        transport: mk(id, () => clock),
        now: () => clock,
        getPosition: (p) => pos[p as 'a' | 'b'],
        play: (e) => plays.push(`${id}:${e}`),
        face: () => undefined,
      });
    const a = session('a');
    const b = session('b');
    const relay = () => {
      // "Server": chuyển tin gửi lên tới người nhận (chỉ đủ cho các kiểu dùng trong test).
      for (const [from, list] of sentBy) {
        for (const m of list.splice(0)) {
          if (m.type === 'social_invite') deliver((m.invite as { to: string }).to, m);
          else if (m.type === 'social_respond') deliver(from === 'a' ? 'b' : 'a', m);
        }
      }
    };
    const ctx = { speed: 0, airborne: false, sitting: false, editorOpen: false, interacting: false, inMatch: false };
    const r = a.start('handshake', ctx, { x: 0, z: 0, yaw: Math.PI / 2 }, [{ id: 'b', x: 1, z: 0 }]);
    expect(r.ok && r.mode).toBe('invited');
    relay();
    expect(b.getIncoming()?.from).toBe('a');
    expect(b.accept()).toBe(true);
    relay();
    expect(plays.sort()).toEqual(['a:handshake', 'b:handshake']);
    expect(a.getOutgoing()).toBeNull();

    // Lần hai: server từ chối (xa quá) -> bên mời không bị kẹt "đang chờ".
    clock += 20_000;
    const r2 = a.start('high_five', ctx, { x: 0, z: 0, yaw: Math.PI / 2 }, [{ id: 'b', x: 1, z: 0 }]);
    expect(r2.ok).toBe(true);
    expect(a.getOutgoing()).not.toBeNull();
    const inviteId = (sentBy.get('a')!.slice(-1)[0] as { invite: { id: string } }).invite.id;
    deliver('a', { type: 'social.denied', code: 'too_far', inviteId });
    expect(a.getOutgoing()).toBeNull();
  });
});
