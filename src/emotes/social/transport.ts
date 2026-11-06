/** Adapter vận chuyển thông điệp xã hội. Có bản local trong bộ nhớ; nối world (src/net) làm sau. */
import type { SocialMessage } from './logic';

export interface SocialTransport {
  /** Id người chơi của đầu này. */
  readonly selfId: string;
  /** Gửi tới người nhận `to`. */
  send(to: string, msg: SocialMessage): void;
  /** Đăng ký nhận; trả hàm hủy đăng ký. */
  subscribe(handler: (msg: SocialMessage) => void): () => void;
}

/** Bus cục bộ: tạo nhiều đầu cuối cùng một bộ nhớ, dùng cho test và chế độ một máy. */
export function createLocalBus(): { endpoint(selfId: string): SocialTransport } {
  const handlers = new Map<string, Set<(m: SocialMessage) => void>>();
  return {
    endpoint(selfId: string): SocialTransport {
      return {
        selfId,
        send(to, msg) {
          // Sao chép để bên nhận không sửa chung đối tượng với bên gửi.
          const copy = structuredClone(msg);
          for (const h of [...(handlers.get(to) ?? [])]) h(copy);
        },
        subscribe(handler) {
          let set = handlers.get(selfId);
          if (!set) { set = new Set(); handlers.set(selfId, set); }
          set.add(handler);
          return () => { set?.delete(handler); };
        },
      };
    },
  };
}
