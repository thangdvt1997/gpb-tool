import path from 'node:path';

// Đọc toàn bộ cấu hình từ biến môi trường. Không có giá trị nào được hard-code.

function intEnv(name, fallback) {
  const raw = (process.env[name] ?? '').trim();
  if (raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`${name} phải là số cổng hợp lệ, nhận được "${raw}".`);
  }
  return n;
}

const mailMode = (process.env.MAIL_MODE ?? '').trim() || 'log';
if (mailMode !== 'log' && mailMode !== 'smtp') {
  throw new Error('MAIL_MODE chỉ nhận "log" hoặc "smtp".');
}

// common (cả tài khoản work lẫn personal), organizations, consumers, hoặc GUID của một tenant cụ thể.
const microsoftTenant = (process.env.MICROSOFT_TENANT ?? '').trim() || 'common';
const MS_TENANT_RE =
  /^(common|organizations|consumers|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
if (!MS_TENANT_RE.test(microsoftTenant)) {
  throw new Error('MICROSOFT_TENANT phải là common, organizations, consumers hoặc GUID của tenant.');
}

export const config = {
  port: intEnv('PORT', 3001),
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  mailMode,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, ''),
  smtp: {
    host: (process.env.SMTP_HOST ?? '').trim(),
    port: intEnv('SMTP_PORT', 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: (process.env.MAIL_FROM ?? '').trim(),
  },
  google: {
    clientId: (process.env.GOOGLE_CLIENT_ID ?? '').trim(),
    clientSecret: (process.env.GOOGLE_CLIENT_SECRET ?? '').trim(),
  },
  microsoft: {
    clientId: (process.env.MICROSOFT_CLIENT_ID ?? '').trim(),
    clientSecret: (process.env.MICROSOFT_CLIENT_SECRET ?? '').trim(),
    tenant: microsoftTenant,
  },
};
