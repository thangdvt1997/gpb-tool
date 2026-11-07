// Xử lý tin nhắn của một kết nối đã xác thực. Thuần: không import `ws`, test bằng kết nối giả.

import { CLOSE, MAX_FRAME_BYTES, MSG_RATE, VOICE_MAX_FRAME_BYTES } from './config.js';
import { createRateLimiter } from './rateLimit.js';

/**
 * Tạo bộ xử lý cho một client trong hub. Trả {onMessage(data, isBinary), onClose()}.
 * onMessage tự đóng kết nối khi vi phạm (khung nhị phân, quá lớn, flood).
 */
export function createConnectionHandler({ world, hub, client, now = Date.now }) {
  const msgLimiter = createRateLimiter(MSG_RATE);
  const { user, conn } = client;

  function closeWith(code, reason) {
    try {
      conn.close(code, reason);
    } catch {
      // Bỏ qua.
    }
  }

  function onMessage(data, isBinary) {
    if (!client.open || client.replaced) return;
    if (isBinary) return closeWith(CLOSE.UNSUPPORTED, 'binary_not_supported');
    const size = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
    // `ws` đã chặn bằng maxPayload (đóng 1009); kiểm thêm ở đây để không phụ thuộc cấu hình transport.
    if (size > VOICE_MAX_FRAME_BYTES) return closeWith(1009, 'frame_too_large');
    if (!msgLimiter.take('c', now()).ok) return closeWith(CLOSE.POLICY, 'flood');

    let msg;
    try {
      msg = JSON.parse(typeof data === 'string' ? data : data.toString('utf8'));
    } catch {
      if (size > MAX_FRAME_BYTES) return closeWith(1009, 'frame_too_large');
      return hub.send(client, { type: 'error', code: 'invalid_json' });
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
      if (size > MAX_FRAME_BYTES) return closeWith(1009, 'frame_too_large');
      return hub.send(client, { type: 'error', code: 'invalid_message' });
    }

    // Khung 1-8 KB chỉ hợp lệ với tin tín hiệu thoại; mọi loại khác giữ trần 1 KB.
    if (size > MAX_FRAME_BYTES && msg.type !== 'voice.signal') return closeWith(1009, 'frame_too_large');

    switch (msg.type) {
      case 'pose':
        return hub.send(client, world.submitPose(user, msg));
      case 'leave':
        return world.leave(user, 'left');
      case 'ping': {
        // Client đo RTT: gửi t (đồng hồ client), nhận lại nguyên t kèm giờ server.
        const t = typeof msg.t === 'number' && Number.isFinite(msg.t) ? msg.t : null;
        return hub.send(client, { type: 'pong', t, serverTime: now(), tick: world.getTick() });
      }
      default:
        if (world.handle(user, client, msg)) return undefined;
        return hub.send(client, { type: 'error', code: 'unknown_type' });
    }
  }

  // Kết nối cuối của người đó đóng thì rời ngay, không chờ TTL.
  function onClose() {
    if (hub.remove(client)) world.leave(user, 'disconnect');
  }

  return { onMessage, onClose };
}
