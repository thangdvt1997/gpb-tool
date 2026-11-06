import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Thư mục gốc của service (services/display).
const SERVICE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Danh sách cố định: tivi, bảng vẽ và kênh tivi hợp lệ. Id ngoài danh sách bị từ chối (404 hoặc 400).
export const TV_IDS = ['tv_lobby', 'tv_lounge', 'tv_meeting'];
export const BOARD_IDS = ['whiteboard_mr1', 'design_board'];
export const CHANNELS = [
  { id: 1, name: 'Thông báo IT' },
  { id: 2, name: 'Trạng thái dịch vụ' },
  { id: 3, name: 'Lịch sự kiện' },
  { id: 4, name: 'Bảng vinh danh' },
  { id: 5, name: 'Bảng xếp hạng' },
  { id: 6, name: 'Chào mừng' },
];

export const MAX_STROKES_PER_BOARD = 5000;
export const MAX_STROKES_PER_USER_PER_MINUTE = 120;

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
    port: parsePort(env.PORT, 3006),
    // Mặc định chỉ lắng nghe localhost. Gateway truy cập qua 127.0.0.1 vì network_mode: host.
    host: env.HOST || '127.0.0.1',
    dataDir: path.resolve(env.DATA_DIR || path.join(SERVICE_DIR, 'data')),
    authUrl: parseAuthUrl(env.AUTH_URL),
  };
}
