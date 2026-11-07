// TASK 25b: tín hiệu WebRTC (offer/answer/ICE/bye) chuyển giữa hai người cùng phòng (tenant).
// Server KHÔNG xử lý âm thanh: media đi P2P (hoặc qua TURN). Ở đây chỉ kiểm: quyền (can 'voice.use', người bị mute không phát),
// khoảng cách theo vị trí pose, chặn nhau (chat.block), kích thước và tần suất. Người nhận do server chọn theo `to`, `from` do server gán.

import { createRateLimiter } from './rateLimit.js';

export const VOICE = {
  signalRadius: 40, // mét: xa hơn thì không cho dựng kết nối mới (client chỉ nối tối đa vài người gần nhất)
  rate: { capacity: 20, refillPerSec: 5 }, // mỗi người: burst 20, bền vững 5 tin tín hiệu / giây
  maxSdp: 6000,
  maxCandidate: 600,
  maxId: 64,
};

const KINDS = new Set(['offer', 'answer', 'ice', 'bye']);
const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

export function createVoice({ now = Date.now, config = VOICE } = {}) {
  const limiter = createRateLimiter(config.rate);

  /**
   * Kiểm cấu trúc và tần suất. Trả {ok, out} với out là tin gửi cho người nhận (chưa có `from`), hoặc {ok:false, error}.
   * Quyền, tenant và khoảng cách kiểm ở world.js.
   */
  function prepare(user, m) {
    if (!KINDS.has(m.kind)) return { ok: false, error: 'invalid_message' };
    if (!str(m.to, config.maxId) || m.to === user.id) return { ok: false, error: 'invalid_target' };
    if (!str(m.callId, 40)) return { ok: false, error: 'invalid_message' };
    const out = { type: 'voice.signal', kind: m.kind, callId: m.callId };
    if (m.kind === 'offer' || m.kind === 'answer') {
      if (!str(m.sdp, config.maxSdp)) return { ok: false, error: 'invalid_message' };
      out.sdp = m.sdp;
    } else if (m.kind === 'ice') {
      if (!str(m.candidate, config.maxCandidate)) return { ok: false, error: 'invalid_message' };
      out.candidate = m.candidate;
      if (m.sdpMid != null) {
        if (!str(m.sdpMid, 32)) return { ok: false, error: 'invalid_message' };
        out.sdpMid = m.sdpMid;
      }
      if (m.sdpMLineIndex != null) {
        if (!Number.isInteger(m.sdpMLineIndex) || m.sdpMLineIndex < 0 || m.sdpMLineIndex > 8) return { ok: false, error: 'invalid_message' };
        out.sdpMLineIndex = m.sdpMLineIndex;
      }
    }
    const rl = limiter.take(`${user.tenantId}:${user.id}`, now());
    if (!rl.ok) return { ok: false, error: 'rate_limited', retryAfterMs: rl.retryAfterMs };
    return { ok: true, out };
  }

  return { prepare, prune: () => limiter.prune(now()), signalRadius: config.signalRadius };
}
