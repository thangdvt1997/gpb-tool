// Transport mạng cho hành động xã hội (TASK 15): nối SocialSession (src/emotes/social) với world WebSocket.
// Giao thức: social_invite / social_respond / social_cancel / social_play (xem docs/design/EMOTES_SOCIAL.md).
// Server kiểm quyền, tần suất, khoảng cách và đặt `from`; client chỉ chuyển tiếp.
import type { SocialMessage } from '../emotes/social/logic';
import type { SocialTransport } from '../emotes/social/transport';
import type { ServerMessage } from './protocol';

export interface SocialNetDeps {
  selfId: string;
  /** Gửi một tin lên world; false nếu chưa gửi được. */
  send: (msg: Record<string, unknown>) => boolean;
  /** Đăng ký nhận mọi tin từ server; trả hàm hủy. */
  subscribe: (fn: (msg: ServerMessage) => void) => () => void;
  /** Đồng hồ cục bộ, cùng đồng hồ với SocialSession (mặc định performance.now). */
  now?: () => number;
}

const SOCIAL_TYPES = new Set(['social_invite', 'social_respond', 'social_cancel', 'social_play']);

export function createWorldSocialTransport(d: SocialNetDeps): SocialTransport {
  const now = d.now ?? (() => performance.now());
  // Lời mời đã gửi đi: để biến lỗi từ server (xa quá, bận, hết tần suất...) thành "bị từ chối" cho SocialSession.
  const sent = new Map<string, string>(); // inviteId -> to
  const remember = (id: string, to: string) => {
    sent.set(id, to);
    if (sent.size > 32) sent.delete(sent.keys().next().value as string);
  };

  return {
    selfId: d.selfId,
    send(to, msg) {
      if (msg.type === 'social_invite') remember(msg.invite.id, to);
      d.send({ ...msg });
    },
    subscribe(handler) {
      return d.subscribe((m) => {
        if (m.type === 'social.denied') {
          const id = typeof m.inviteId === 'string' ? m.inviteId : '';
          const to = sent.get(id);
          if (to) {
            sent.delete(id);
            handler({ type: 'social_respond', inviteId: id, by: to, answer: 'decline' });
          }
          return;
        }
        if (!SOCIAL_TYPES.has(m.type)) return;
        const msg = m as SocialMessage;
        if (msg.type === 'social_invite') {
          // Thời điểm trong tin là đồng hồ server: quy về đồng hồ cục bộ, giữ nguyên thời lượng.
          const ttl = Math.max(0, msg.invite.expiresAt - msg.invite.createdAt);
          const t = now();
          handler({ type: 'social_invite', invite: { ...msg.invite, createdAt: t, expiresAt: t + ttl } });
          return;
        }
        if (msg.type === 'social_respond') sent.delete(msg.inviteId);
        handler(msg);
      });
    },
  };
}
