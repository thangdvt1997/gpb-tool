import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Thư mục gốc của service (services/layout).
const SERVICE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
    port: parsePort(env.PORT, 3008),
    // Mặc định chỉ lắng nghe localhost. Gateway proxy tới 127.0.0.1 (network_mode: host).
    host: env.HOST || '127.0.0.1',
    dataDir: path.resolve(env.DATA_DIR || path.join(SERVICE_DIR, 'local-data')),
    authUrl: parseAuthUrl(env.AUTH_URL),
    // Bản sao có chọn lọc của bố cục văn phòng (đi kèm image, không phải dữ liệu runtime).
    zoneFile: path.join(SERVICE_DIR, 'data', 'zone.json'),
  };
}
