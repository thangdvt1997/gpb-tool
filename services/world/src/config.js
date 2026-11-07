// Cấu hình world service. Mọi giá trị đọc từ biến môi trường, không có bí mật.

export const PROTOCOL_VERSION = 1;

// Tick phát của server: gom mọi pose thay đổi trong 100 ms thành một sự kiện `poses` cho mỗi tenant.
export const TICK_MS = 100;

// Giới hạn tần suất gửi pose của mỗi người (gộp mọi tab): token bucket 10 token, nạp 10 token mỗi giây.
export const POSE_RATE = { capacity: 10, refillPerSec: 10 };

// Presence tự hết khi không có pose trong khoảng này. Client đứng yên nên gửi lại pose mỗi 5 giây.
export const PRESENCE_TTL_MS = 15_000;
export const MAX_PRESENCE_PER_TENANT = 200;

// Tốc độ tối đa server chấp nhận (m/s). Client chạy 7 m/s (src/scene/controls/gtaMotion.ts), cộng lề.
export const MAX_SPEED = 9;
// Lề quãng đường cho mỗi cập nhật (m), bù sai lệch đồng hồ và mạng.
export const STEP_SLACK = 0.3;
// Khoảng thời gian tối đa dùng để tính quãng đường cho phép (ms). Tránh nghỉ lâu rồi "nhảy" xa.
export const MAX_STEP_DT_MS = 1_000;

// Trạng thái animation hợp lệ. Server chỉ chuyển tiếp nhãn, không gửi xương.
export const ANIM_STATES = ['idle', 'walk', 'run', 'jump', 'fall', 'sit', 'emote'];

// WebSocket: đường dẫn, kích thước khung tối đa (pose hợp lệ dưới 200 byte), số kết nối.
export const WS_PATH = '/api/world/ws';
export const MAX_FRAME_BYTES = 1024;
// Riêng tin 'voice.signal' (SDP offer/answer có thể vượt 1 KB): trần khung lớn hơn, chỉ chấp nhận đúng loại tin này.
export const VOICE_MAX_FRAME_BYTES = 8192;
export const MAX_CONNECTIONS = 2000;
export const MAX_CONNECTIONS_PER_USER = 2;
// Bắt tay đang chờ auth cùng lúc. Vượt thì từ chối, để flood không cookie không dồn request vào auth.
export const MAX_PENDING_HANDSHAKES = 100;
// Kết nối có bộ đệm gửi vượt ngưỡng này bị ngắt (client chậm hoặc treo), để không giữ bộ nhớ vô hạn.
export const MAX_SEND_BUFFER_BYTES = 256 * 1024;
// Mọi loại tin nhắn từ một kết nối: 20 token, nạp 20 mỗi giây. Vượt thì đóng 1008 (flood).
export const MSG_RATE = { capacity: 20, refillPerSec: 20 };
// Ping giao thức mỗi 25 giây; không có pong tới lần sau thì ngắt.
export const WS_PING_MS = 25_000;
// Kiểm tra lại phiên định kỳ để đăng xuất hoặc khóa tài khoản có hiệu lực với kết nối đang mở.
export const REVALIDATE_MS = 60_000;

// Mã đóng kết nối riêng của world (4000-4999 dành cho ứng dụng).
export const CLOSE = {
  UNAUTHENTICATED: 4401,
  TOO_MANY_CONNECTIONS: 4429,
  SERVER_FULL: 1013,
  POLICY: 1008,
  UNSUPPORTED: 1003,
  SHUTDOWN: 1001,
  KICKED: 4403, // bị chủ phòng đuổi: không tự kết nối lại
  REPLACED: 4409, // tab/thiết bị mới thay phiên này: không tự kết nối lại
};

// TASK 24: lease. Tim đập mỗi ~5 s; lease hết hạn sau LEASE_TTL_MS không có tim đập.
export const LEASE_TTL_MS = Number(process.env.WORLD_LEASE_TTL_MS) || 15_000;
// Mất kết nối: giữ lease thêm khoảng ân hạn này (khớp resume để kịp quay lại).
export const LEASE_GRACE_MS = Number(process.env.WORLD_LEASE_GRACE_MS) || 30_000;
// TASK 27: resume token sống tới đó kể từ lúc mất kết nối cuối.
export const RESUME_TTL_MS = Number(process.env.WORLD_RESUME_TTL_MS) || 120_000;
// Số sự kiện tin cậy giữ lại mỗi phòng để bù cho client quay lại. Khoảng trống lớn hơn thì gửi full.
export const EVENT_LOG_MAX = 500;
// TASK 26: thời gian chặn kết nối lại sau khi bị kick.
export const KICK_COOLDOWN_MS = Number(process.env.WORLD_KICK_COOLDOWN_MS) || 300_000;
// TASK 25: bán kính chat gần (mét).
export const CHAT_NEAR_RADIUS = Number(process.env.WORLD_CHAT_NEAR_RADIUS) || 10;

// Origin luôn được phép. Thêm qua ALLOWED_ORIGINS (phân cách bằng dấu phẩy).
export const DEFAULT_ORIGINS = ['https://gp.daisoncoop.com'];

function parseOrigins(value) {
  const extra = String(value || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...extra])];
}

function parsePort(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT không hợp lệ: ${value}`);
  }
  return port;
}

function parseAuthUrl(value) {
  const raw = String(value || 'http://127.0.0.1:3001').replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('AUTH_URL không hợp lệ');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('AUTH_URL phải dùng http hoặc https');
  }
  return raw;
}

export function loadConfig(env = process.env) {
  return {
    port: parsePort(env.PORT, 3011),
    // Chỉ lắng nghe localhost. Gateway truy cập qua 127.0.0.1 vì network_mode: host.
    host: env.HOST || '127.0.0.1',
    authUrl: parseAuthUrl(env.AUTH_URL),
    allowedOrigins: parseOrigins(env.ALLOWED_ORIGINS),
    // localhost/127.0.0.1 (mọi cổng) chỉ được phép khi không phải production, hoặc bật rõ bằng biến.
    allowLocalhostOrigin: env.WORLD_ALLOW_LOCALHOST === '1' || env.NODE_ENV !== 'production',
  };
}
