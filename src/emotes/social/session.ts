/**
 * Phiên xã hội của một người chơi: giữ lời mời đến/đi, cooldown, chọn mục tiêu, phát emote và căn hướng.
 * Mọi phụ thuộc ngoài (đồng hồ, vị trí người khác, phát emote, quay mặt) được tiêm vào nên test không cần scene.
 */
import {
  canStartSocial, createInvite, distance, facePair, getSocialAction, pickTarget, reduceInvite,
  yawToward,
} from './logic';
import type {
  Peer, SelfState, SocialActionId, SocialCheck, SocialContext, SocialInvite, SocialMessage,
} from './logic';
import type { SocialTransport } from './transport';
import type { EmoteId } from '../types';

export interface SocialDeps {
  transport: SocialTransport;
  now: () => number;
  /** Vị trí hiện tại của người chơi theo id, undefined nếu không còn thấy. */
  getPosition: (id: string) => { x: number; z: number } | undefined;
  /** Phát emote (nối tới playInternalEmote). */
  play: (emoteId: EmoteId) => void;
  /** Đặt yaw cho nhân vật của mình. */
  face: (yaw: number) => void;
  /** Tùy chọn: có người khác vẫy/chào/chỉ về phía mình, host phát emote trên avatar của họ. */
  onRemotePlay?: (fromId: string, emoteId: EmoteId) => void;
}

export type SocialStartResult =
  | { ok: true; mode: 'played' | 'invited'; targetId: string; inviteId?: string }
  | { ok: false; reason: Extract<SocialCheck, { ok: false }>['reason'] };

export class SocialSession {
  private cooldownUntil = new Map<SocialActionId, number>();
  private incoming: SocialInvite | null = null;
  private outgoing: SocialInvite | null = null;
  private listeners = new Set<() => void>();
  private unsub: () => void;
  private seq = 0;

  constructor(private readonly d: SocialDeps) {
    this.unsub = d.transport.subscribe((m) => this.onMessage(m));
  }

  dispose(): void { this.unsub(); this.listeners.clear(); }

  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(): void { for (const l of [...this.listeners]) l(); }

  getIncoming(): SocialInvite | null { return this.incoming; }
  getOutgoing(): SocialInvite | null { return this.outgoing; }

  /** Bắt đầu hành động xã hội hướng tới người gần nhất hợp lệ. */
  start(actionId: SocialActionId, ctx: SocialContext, self: SelfState, peers: readonly Peer[]): SocialStartResult {
    const action = getSocialAction(actionId);
    const now = this.d.now();
    const check = canStartSocial(action, ctx, now, this.cooldownUntil.get(actionId) ?? 0);
    if (!check.ok || !action) return { ok: false, reason: check.ok ? 'unknown_action' : check.reason };
    if (action.needsConsent && (this.outgoing !== null || this.incoming !== null)) return { ok: false, reason: 'busy' };
    const target = pickTarget(self, peers, action, this.d.transport.selfId);
    if (!target) {
      // Phân biệt "không ai" và "có người nhưng quá xa" để thông báo đúng.
      const near = peers.some((p) => p.id !== this.d.transport.selfId);
      return { ok: false, reason: near ? 'too_far' : 'no_target' };
    }
    this.cooldownUntil.set(actionId, now + action.cooldownSec * 1000);
    this.d.face(yawToward(self, target, self.yaw));
    if (!action.needsConsent) {
      this.d.play(action.emoteId);
      this.d.transport.send(target.id, { type: 'social_play', actionId, from: this.d.transport.selfId, to: target.id, startTime: now });
      return { ok: true, mode: 'played', targetId: target.id };
    }
    const inv = createInvite(`${this.d.transport.selfId}#${++this.seq}`, actionId, this.d.transport.selfId, target.id, now);
    this.outgoing = inv;
    this.d.transport.send(target.id, { type: 'social_invite', invite: inv });
    this.emit();
    return { ok: true, mode: 'invited', targetId: target.id, inviteId: inv.id };
  }

  /** Người được mời chấp nhận. */
  accept(): boolean { return this.respond('accept'); }
  decline(): boolean { return this.respond('decline'); }

  private respond(answer: 'accept' | 'decline'): boolean {
    const inv = this.incoming;
    if (!inv) return false;
    const me = this.d.transport.selfId;
    const next = reduceInvite(inv, { type: answer, by: me, now: this.d.now() });
    this.incoming = null;
    if (next.status === 'pending') { this.incoming = inv; return false; }
    if (next.status === 'expired') { this.emit(); return false; }
    this.d.transport.send(inv.from, { type: 'social_respond', inviteId: inv.id, by: me, answer });
    if (next.status === 'accepted') this.runAccepted(next);
    this.emit();
    return next.status === 'accepted';
  }

  /** Người mời tự hủy lời mời đang chờ. */
  cancelOutgoing(): void {
    const inv = this.outgoing;
    if (!inv) return;
    const me = this.d.transport.selfId;
    this.outgoing = null;
    this.d.transport.send(inv.to, { type: 'social_cancel', inviteId: inv.id, by: me });
    this.emit();
  }

  /** Gọi mỗi khung hoặc mỗi nhịp: hết hạn, hoặc đi xa thì hủy. */
  tick(): void {
    const me = this.d.transport.selfId;
    const now = this.d.now();
    const mine = this.d.getPosition(me);
    for (const key of ['incoming', 'outgoing'] as const) {
      const inv = this[key];
      if (!inv) continue;
      const other = this.d.getPosition(inv.from === me ? inv.to : inv.from);
      // Mất vị trí của người kia coi như đã đi xa vô hạn.
      const dist = mine && other ? distance(mine, other) : Infinity;
      const next = reduceInvite(inv, { type: 'tick', now, dist });
      if (next.status === 'pending') continue;
      this[key] = null;
      if (next.status === 'cancelled' && key === 'outgoing') {
        this.d.transport.send(inv.to, { type: 'social_cancel', inviteId: inv.id, by: me });
      }
      this.emit();
    }
  }

  private runAccepted(inv: SocialInvite): void {
    const action = getSocialAction(inv.actionId);
    if (!action) return;
    const me = this.d.transport.selfId;
    const a = this.d.getPosition(me);
    const b = this.d.getPosition(me === inv.from ? inv.to : inv.from);
    if (a && b) this.d.face(facePair(a, b).a);
    this.d.play(action.emoteId);
    // Hành động hai người: người kia cũng đang làm, host phát trên avatar của họ.
    this.d.onRemotePlay?.(me === inv.from ? inv.to : inv.from, action.emoteId);
  }

  private onMessage(m: SocialMessage): void {
    const me = this.d.transport.selfId;
    const now = this.d.now();
    switch (m.type) {
      case 'social_invite': {
        if (m.invite.to !== me || m.invite.status !== 'pending') return;
        // Đang có lời mời đến khác: tự từ chối lời mới để không chồng.
        if (this.incoming !== null) {
          this.d.transport.send(m.invite.from, { type: 'social_respond', inviteId: m.invite.id, by: me, answer: 'decline' });
          return;
        }
        this.incoming = m.invite;
        this.emit();
        return;
      }
      case 'social_respond': {
        const inv = this.outgoing;
        if (!inv || inv.id !== m.inviteId) return;
        const next = reduceInvite(inv, { type: m.answer, by: m.by, now });
        if (next.status === 'pending') return;
        this.outgoing = null;
        if (next.status === 'accepted') this.runAccepted(next);
        this.emit();
        return;
      }
      case 'social_cancel': {
        const inv = this.incoming;
        if (!inv || inv.id !== m.inviteId) return;
        if (reduceInvite(inv, { type: 'cancel', by: m.by, now }).status === 'pending') return;
        this.incoming = null;
        this.emit();
        return;
      }
      case 'social_play':
        // Emote thuộc về avatar người gửi: báo host phát trên avatar từ xa, không phát lên nhân vật của mình.
        if (m.to === me) {
          const a = getSocialAction(m.actionId);
          if (a) this.d.onRemotePlay?.(m.from, a.emoteId);
        }
        return;
    }
  }
}
