import { createApp } from './app.js';
import { createAuthClient } from './auth.js';
import {
  MAX_CONNECTIONS,
  MAX_CONNECTIONS_PER_USER,
  MAX_PRESENCE_PER_TENANT,
  KICK_COOLDOWN_MS,
  MAX_SEND_BUFFER_BYTES,
  POSE_RATE,
  PRESENCE_TTL_MS,
  loadConfig,
} from './config.js';
import { createHub } from './hub.js';
import { createPresenceStore } from './presence.js';
import { createRateLimiter } from './rateLimit.js';
import { createRoleStore } from './roles.js';
import { createWorld } from './world.js';
import { attachWorldSocket } from './wsServer.js';

const config = loadConfig();
const authClient = createAuthClient({ authUrl: config.authUrl });
const presence = createPresenceStore({ ttlMs: PRESENCE_TTL_MS, maxPerTenant: MAX_PRESENCE_PER_TENANT });
const limiter = createRateLimiter(POSE_RATE);
const hub = createHub({
  maxClients: MAX_CONNECTIONS,
  maxPerUser: MAX_CONNECTIONS_PER_USER,
  maxBufferBytes: MAX_SEND_BUFFER_BYTES,
});
// Vai trò phòng lưu bền khi đặt WORLD_DATA_DIR (thư mục ghi được); không đặt thì chỉ giữ trong bộ nhớ.
const roles = createRoleStore({
  kickMs: KICK_COOLDOWN_MS,
  dataDir: process.env.WORLD_DATA_DIR || null,
  onError: (err) => console.error(`[world] lỗi lưu/đọc vai trò: ${err && err.message ? err.message : 'unknown'}`),
});
if (!process.env.WORLD_DATA_DIR) console.warn('[world] WORLD_DATA_DIR chưa đặt: vai trò phòng không được lưu bền');
const world = createWorld({ presence, limiter, hub, roles });
const app = createApp({ world, hub, presence, authClient });

world.start();
const server = app.listen(config.port, config.host, () => {
  console.log(`World service nghe tại ${config.host}:${config.port}`);
});
const socket = attachWorldSocket({ server, config, world, hub, authClient });

function shutdown(signal) {
  console.log(`Nhận ${signal}, đang dừng World service`);
  world.stop();
  // Đóng WebSocket trước, nếu không server.close() chờ tới timeout.
  socket.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
