import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new Database(path.join(config.dataDir, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

// password_hash để NULL với tài khoản chưa đặt mật khẩu: đăng nhập Google/Microsoft, hoặc đã xác minh email
// nhưng chưa đặt mật khẩu (xem docs/design/ONBOARDING_API.md mục 1 và 2.1).
// onboarding_step: 'password' | 'appearance' | 'tour' | 'done'. Cột mới phải có trong danh sách này để DB mới
// và DB đã migrate giống nhau.
const USERS_COLUMNS = `
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'it', 'moderator', 'admin')),
  department TEXT,
  email_verified_at INTEGER,
  created_at INTEGER NOT NULL,
  onboarding_step TEXT CHECK (onboarding_step IS NULL OR onboarding_step IN ('password', 'appearance', 'tour', 'done')),
  appearance TEXT CHECK (appearance IS NULL OR json_valid(appearance)),
  tour_done_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'banned')),
  ban_reason TEXT,
  ban_until TEXT,
  banned_by INTEGER,
  banned_at TEXT,
  react_bump INTEGER NOT NULL DEFAULT 1 CHECK (react_bump IN (0, 1))
`;

// Các cột của users theo USERS_COLUMNS. Khi dựng lại bảng chỉ copy những cột thực sự có trong bảng cũ.
const USER_COLUMN_NAMES = [
  'id',
  'email',
  'name',
  'password_hash',
  'tenant_id',
  'role',
  'department',
  'email_verified_at',
  'created_at',
  'onboarding_step',
  'appearance',
  'tour_done_at',
  'status',
  'ban_reason',
  'ban_until',
  'banned_by',
  'banned_at',
  'react_bump',
];

db.exec(`
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('personal', 'business')),
  name TEXT NOT NULL,
  server TEXT,
  tunnel TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (${USERS_COLUMNS});

CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS otp_codes_email_idx ON otp_codes (email, purpose);

-- scope 'full': phiên đầy đủ (cookie sid). scope 'onboarding': phiên tạm đăng ký (cookie osid), chỉ dùng cho bước đặt mật khẩu.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  scope TEXT NOT NULL DEFAULT 'full' CHECK (scope IN ('full', 'onboarding')),
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Kiểm duyệt (docs/design/MODERATION.md). Thời điểm lưu dạng ISO. Không đặt FOREIGN KEY để nhật ký không chặn việc xóa user.
CREATE TABLE IF NOT EXISTS moderation_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  reporter_id INTEGER NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('kudos', 'program', 'event', 'user')),
  content_id TEXT,
  target_user_id INTEGER,
  reason TEXT NOT NULL,
  snapshot TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by INTEGER,
  resolved_at TEXT,
  resolution TEXT CHECK (resolution IS NULL OR resolution IN ('dismiss', 'warn', 'ban')),
  resolution_reason TEXT
);
CREATE INDEX IF NOT EXISTS moderation_reports_status_idx ON moderation_reports (status, id);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_id INTEGER,
  action TEXT NOT NULL CHECK (action IN ('ban', 'unban', 'warn', 'dismiss', 'auto_unban')),
  target_user_id INTEGER,
  report_id INTEGER,
  reason TEXT,
  ban_until TEXT
);
-- Nhật ký chỉ thêm, không sửa, không xóa.
CREATE TRIGGER IF NOT EXISTS moderation_actions_no_update BEFORE UPDATE ON moderation_actions
BEGIN SELECT RAISE(ABORT, 'moderation_actions là nhật ký chỉ thêm'); END;
CREATE TRIGGER IF NOT EXISTS moderation_actions_no_delete BEFORE DELETE ON moderation_actions
BEGIN SELECT RAISE(ABORT, 'moderation_actions là nhật ký chỉ thêm'); END;
`);

// Migration đơn giản cho DB cũ: thêm cột còn thiếu, dựng lại bảng users nếu password_hash đang NOT NULL.
function columnsOf(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

function addColumnIfMissing(table, name, ddl) {
  if (!columnsOf(table).some((c) => c.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
  }
}

function rebuildUsersWithNullablePassword() {
  // Chỉ copy các cột đang có trong bảng cũ, để không làm mất cột nào.
  const cols = columnsOf('users')
    .map((c) => c.name)
    .filter((name) => USER_COLUMN_NAMES.includes(name))
    .join(', ');
  // Phải tắt foreign_keys trước khi DROP, nếu không bảng sessions bị xóa theo (ON DELETE CASCADE).
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`CREATE TABLE users_new (${USERS_COLUMNS})`);
      db.exec(`INSERT INTO users_new (${cols}) SELECT ${cols} FROM users`);
      db.exec('DROP TABLE users');
      db.exec('ALTER TABLE users_new RENAME TO users');
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

// Gán bước onboarding cho dữ liệu cũ (chỉ tác động dòng chưa có onboarding_step, nên chạy lại vẫn an toàn).
function backfillOnboarding() {
  const now = Date.now();
  // Chưa xác minh: xóa mật khẩu đặt trước khi xác minh (lỗ hổng pre-hijack). Người này phải đăng ký lại.
  db.prepare(
    "UPDATE users SET password_hash = NULL, onboarding_step = 'password' WHERE email_verified_at IS NULL AND onboarding_step IS NULL",
  ).run();
  // Đã xác minh (có hoặc không có mật khẩu, kể cả OAuth cũ): coi như đã xong onboarding (D7).
  db.prepare(
    "UPDATE users SET onboarding_step = 'done', tour_done_at = ? WHERE email_verified_at IS NOT NULL AND onboarding_step IS NULL",
  ).run(now);
}

addColumnIfMissing('tenants', 'server', 'TEXT');
addColumnIfMissing('tenants', 'tunnel', 'TEXT');
addColumnIfMissing('users', 'role', "TEXT NOT NULL DEFAULT 'employee'");
addColumnIfMissing('users', 'department', 'TEXT');
addColumnIfMissing('users', 'email_verified_at', 'INTEGER');
addColumnIfMissing('users', 'created_at', 'INTEGER NOT NULL DEFAULT 0');

const passwordColumn = columnsOf('users').find((c) => c.name === 'password_hash');
// DB cũ có CHECK vai trò chưa có 'moderator': SQLite không sửa được CHECK, nên dựng lại bảng.
const usersSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()?.sql ?? '';
const roleCheckOutdated = /CHECK\s*\(\s*role\s+IN/i.test(usersSql) && !usersSql.includes("'moderator'");
if ((passwordColumn && passwordColumn.notnull === 1) || roleCheckOutdated) {
  rebuildUsersWithNullablePassword();
}

// Cột onboarding thêm sau khi dựng lại bảng, để không bị bỏ khỏi bảng mới (ONBOARDING_API mục 9.3).
db.transaction(() => {
  addColumnIfMissing(
    'users',
    'onboarding_step',
    "TEXT CHECK (onboarding_step IS NULL OR onboarding_step IN ('password', 'appearance', 'tour', 'done'))",
  );
  addColumnIfMissing('users', 'appearance', 'TEXT CHECK (appearance IS NULL OR json_valid(appearance))');
  addColumnIfMissing('users', 'tour_done_at', 'INTEGER');
  addColumnIfMissing('users', 'status', "TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'banned'))");
  addColumnIfMissing('users', 'ban_reason', 'TEXT');
  addColumnIfMissing('users', 'ban_until', 'TEXT');
  addColumnIfMissing('users', 'banned_by', 'INTEGER');
  addColumnIfMissing('users', 'banned_at', 'TEXT');
  addColumnIfMissing('users', 'react_bump', 'INTEGER NOT NULL DEFAULT 1 CHECK (react_bump IN (0, 1))');
  addColumnIfMissing('sessions', 'scope', "TEXT NOT NULL DEFAULT 'full' CHECK (scope IN ('full', 'onboarding'))");
  addColumnIfMissing('sessions', 'attempts', 'INTEGER NOT NULL DEFAULT 0');
  backfillOnboarding();
})();

// Hồ sơ và nhân vật cá nhân (docs/design/PROFILE.md). Chỉ thêm bảng mới, không đổi bảng users.
// Tạo sau khối dựng lại users ở trên. CREATE TABLE IF NOT EXISTS nên chạy lại an toàn; DB cũ chỉ được thêm bảng.
// Khóa sở hữu là users.id (ổn định), không phải tên hay email. Xóa user thì xóa theo (ON DELETE CASCADE).
// Khi dựng lại users (foreign_keys = OFF), dòng ở hai bảng này được giữ nguyên vì id được copy sang bảng mới.
db.exec(`
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_ref TEXT CHECK (avatar_ref IS NULL OR length(avatar_ref) <= 64),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_characters (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL CHECK (schema_version >= 0),
  data TEXT NOT NULL CHECK (json_valid(data) AND length(data) <= 262144),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at INTEGER NOT NULL
);
`);

// Tạo tenant nếu chưa có. Không ghi đè server/tunnel đã cấu hình.
export function ensureTenant(t) {
  db.prepare('INSERT OR IGNORE INTO tenants (id, type, name) VALUES (?, ?, ?)').run(t.id, t.type, t.name);
}

// Dọn session (kể cả phiên tạm đã hết hạn), state OAuth và OTP đã hết hạn.
export function purgeExpired(now = Date.now()) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').run(now);
  db.prepare('DELETE FROM otp_codes WHERE expires_at <= ?').run(now);
}
