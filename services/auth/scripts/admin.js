#!/usr/bin/env node
// Công cụ quản trị dòng lệnh. Đọc cùng DATA_DIR với server.
import { db } from '../db.js';

const ROLES = new Set(['employee', 'it', 'moderator', 'admin']);
const USAGE = [
  'Cách dùng:',
  '  node scripts/admin.js set-role <email> <employee|it|moderator|admin>',
  '  node scripts/admin.js set-dept <email> <phòng ban>            (dùng "-" để xóa)',
  '  node scripts/admin.js set-tenant <tenantId> <server> <tunnel>  (dùng "-" để xóa)',
  '  node scripts/admin.js list-tenants',
].join('\n');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const clean = (value) => (value === '-' ? null : value);
const normEmail = (value) => String(value ?? '').trim().toLowerCase();

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'set-role': {
    const [rawEmail, role] = args;
    if (!rawEmail || !ROLES.has(role)) fail(USAGE);
    const email = normEmail(rawEmail);
    const info = db.prepare('UPDATE users SET role = ? WHERE email = ?').run(role, email);
    if (info.changes === 0) fail(`Không tìm thấy người dùng: ${email}`);
    console.log(`Đã đặt vai trò "${role}" cho ${email}.`);
    break;
  }
  case 'set-dept': {
    const [rawEmail, ...rest] = args;
    const department = rest.join(' ').trim();
    if (!rawEmail || !department) fail(USAGE);
    const email = normEmail(rawEmail);
    const value = clean(department);
    const info = db.prepare('UPDATE users SET department = ? WHERE email = ?').run(value, email);
    if (info.changes === 0) fail(`Không tìm thấy người dùng: ${email}`);
    console.log(`Đã đặt phòng ban cho ${email}: ${value ?? '(trống)'}.`);
    break;
  }
  case 'set-tenant': {
    const [tenantId, server, tunnel] = args;
    if (!tenantId || server === undefined || tunnel === undefined) fail(USAGE);
    const info = db
      .prepare('UPDATE tenants SET server = ?, tunnel = ? WHERE id = ?')
      .run(clean(server), clean(tunnel), tenantId);
    if (info.changes === 0) fail(`Không tìm thấy tenant: ${tenantId}`);
    console.log(`Đã cập nhật tenant ${tenantId}.`);
    break;
  }
  case 'list-tenants': {
    const rows = db
      .prepare(
        `SELECT t.id, t.type, t.name, t.server, t.tunnel,
                (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS users
         FROM tenants t
         ORDER BY t.type, t.id`,
      )
      .all();
    console.table(rows);
    break;
  }
  default:
    fail(USAGE);
}
