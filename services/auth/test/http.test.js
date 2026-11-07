// Test HTTP thật cho API hồ sơ/nhân vật: chạy index.js như tiến trình con trên 127.0.0.1 với DB tạm.
// Chạy: node --test test/http.test.js (trong services/auth). Không gửi mail, không dùng secret.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// node:sqlite (Node >= 22.5) thay better-sqlite3 trong tiến trình test: better-sqlite3 11.7 abort lúc thoát trên Node 24.
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Giới hạn ghi là 2 giây mỗi người; chờ hơi quá để chắc chắn.
const WRITE_GAP = 2100;

let tmp;
let child;
let base;
let dbh;
let logs = '';
const sid = {};

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function sampleLook(name = 'Đi làm') {
  return {
    version: 1,
    meta: { name, presetId: null, legacyOutfit: null },
    bodyStyle: 'realistic',
    body: { base: 'male', height: 170, weight: 0.5, torso: { chest: 0.4, waist: 0.5 } },
    face: { eyes: { color: '#3b2a1e', size: 0.5 } },
    hair: { style: 'hair-short-01', color: '#2b1d14' },
    skin: { tone: 1, moles: [] },
    tattoos: [],
    scars: [],
    outfit: { top: { itemId: 'top-polo', color: '#f4f4f2', patterns: [] } },
    accessories: { rings: [], glasses: null },
  };
}

// Chèn user + phiên trực tiếp vào DB (token gốc chỉ có ở test; DB lưu SHA-256 như createSession).
function makeUser(email, name) {
  dbh.prepare("INSERT OR IGNORE INTO tenants (id, type, name) VALUES ('t-test', 'business', 'Test')").run();
  const now = Date.now();
  const info = dbh
    .prepare("INSERT INTO users (email, name, tenant_id, created_at, onboarding_step) VALUES (?, ?, 't-test', ?, 'done')")
    .run(email, name, now);
  const token = crypto.randomBytes(32).toString('base64url');
  dbh
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, scope) VALUES (?, ?, ?, ?, 'full')")
    .run(crypto.createHash('sha256').update(token).digest('hex'), info.lastInsertRowid, now + 3600e3, now);
  return { id: Number(info.lastInsertRowid), token };
}

async function call(method, route, { token, body, raw, type = 'application/json', headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Cookie = `sid=${token}`;
  let payload;
  if (raw !== undefined) {
    payload = raw;
    h['Content-Type'] = type;
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    h['Content-Type'] = type;
  }
  const res = await fetch(base + route, { method, headers: h, body: payload });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, headers: res.headers };
}

// Khởi động auth trên một cổng ngẫu nhiên; sẵn sàng khi chính tiến trình con in dòng "đang chạy ở cổng N"
// (không dò HTTP để khỏi nhầm với tiến trình khác đang giữ cổng). Thử lại nếu trùng cổng.
async function startServer() {
  const port = await freePort();
  logs = '';
  // Chỉ truyền biến cần thiết; SMTP để trống, MAIL_MODE=log nên không gửi mail.
  const proc = spawn(process.execPath, ['index.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, PORT: String(port), DATA_DIR: tmp, MAIL_MODE: 'log' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => (logs += d));
  proc.stderr.on('data', (d) => (logs += d));
  // Khi tắt, Node 24 + better-sqlite3 có thể abort lúc thoát; chỉ xét thoát sớm trước khi sẵn sàng.
  const ok = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 15000);
    const check = () => {
      if (logs.includes(`đang chạy ở cổng ${port}`)) {
        clearTimeout(timer);
        resolve(true);
      }
    };
    proc.stdout.on('data', check);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
  if (!ok) {
    if (proc.exitCode === null) proc.kill('SIGKILL');
    return null;
  }
  return { proc, port };
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gpb-auth-http-'));
  let started = null;
  for (let i = 0; i < 4 && !started; i++) started = await startServer();
  if (!started) throw new Error(`auth không khởi động được: ${logs}`);
  child = started.proc;
  base = `http://127.0.0.1:${started.port}`;
  dbh = new DatabaseSync(path.join(tmp, 'app.db'));
  dbh.exec('PRAGMA busy_timeout = 5000');
  sid.a = makeUser('a@test.local', 'Nguyễn An');
  sid.b = makeUser('b@test.local', 'Trần Bình');
});

after(async () => {
  try {
    dbh?.close();
  } catch {
    // Bỏ qua.
  }
  if (child && child.exitCode === null) {
    const done = new Promise((r) => child.once('exit', r));
    child.kill('SIGTERM');
    await Promise.race([done, sleep(6000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test('chưa đăng nhập: mọi route hồ sơ/nhân vật trả 401, có no-store', async () => {
  for (const [m, p, body] of [
    ['GET', '/api/auth/profile'],
    ['PUT', '/api/auth/profile', { revision: 0, name: 'Abc' }],
    ['GET', '/api/auth/profile/character'],
    ['PUT', '/api/auth/profile/character', { revision: 0, look: sampleLook() }],
    ['DELETE', '/api/auth/profile/character'],
  ]) {
    const r = await call(m, p, { body });
    assert.equal(r.status, 401, `${m} ${p}`);
    assert.equal(r.json.code, 'unauthenticated');
    assert.equal(r.headers.get('cache-control'), 'no-store');
  }
});

test('cookie sid giả hoặc sai định dạng bị từ chối', async () => {
  assert.equal((await call('GET', '/api/auth/profile', { token: 'x'.repeat(43) })).status, 401);
  assert.equal((await call('GET', '/api/auth/profile', { token: 'ngan' })).status, 401);
});

test('GET hồ sơ: trả đúng chủ, chưa có dòng profile thì revision 0', async () => {
  const r = await call('GET', '/api/auth/profile', { token: sid.a.token });
  assert.equal(r.status, 200);
  assert.equal(r.json.profile.id, sid.a.id);
  assert.equal(r.json.profile.name, 'Nguyễn An');
  assert.equal(r.json.profile.revision, 0);
  assert.equal(r.json.profile.avatarRef, null);
  assert.ok(!JSON.stringify(r.json).includes('password'));
});

test('PUT hồ sơ: đổi tên, tăng revision, conflict, trường cấm, không hợp lệ', async () => {
  let r = await call('PUT', '/api/auth/profile', { token: sid.a.token, body: { revision: 0, name: '  Nguyễn   Văn An ', avatarRef: 'character' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.profile.name, 'Nguyễn Văn An');
  assert.equal(r.json.profile.revision, 1);
  assert.equal(r.json.profile.avatarRef, 'character');
  assert.equal(r.json.profile.email, 'a@test.local');

  // Trường cấm / không rõ / sai kiểu được kiểm trước giới hạn tần suất.
  r = await call('PUT', '/api/auth/profile', { token: sid.a.token, body: { revision: 1, department: 'IT' } });
  assert.equal(r.status, 403);
  assert.equal(r.json.code, 'field_forbidden');
  r = await call('PUT', '/api/auth/profile', { token: sid.a.token, body: { revision: 1, userId: sid.b.id, name: 'Xyz' } });
  assert.equal(r.status, 403);
  r = await call('PUT', '/api/auth/profile', { token: sid.a.token, body: { revision: 1, foo: 1 } });
  assert.equal(r.status, 422);
  assert.equal(r.json.code, 'unknown_field');
  r = await call('PUT', '/api/auth/profile', { token: sid.a.token, body: { revision: -1, name: 'Abc' } });
  assert.equal(r.json.code, 'invalid_revision');
  r = await call('PUT', '/api/auth/profile', { token: sid.a.token, body: { revision: 1 } });
  assert.equal(r.json.code, 'empty_update');
  r = await call('PUT', '/api/auth/profile', { token: sid.a.token, body: { revision: 1, avatarRef: 'https://x.example/a.png' } });
  assert.equal(r.status, 422);
  r = await call('PUT', '/api/auth/profile', { token: sid.a.token, body: { revision: 1, name: 'A' } });
  assert.equal(r.status, 422);
  r = await call('PUT', '/api/auth/profile', { token: sid.a.token, raw: 'name=abc', type: 'text/plain' });
  assert.equal(r.status, 415);
  r = await call('PUT', '/api/auth/profile', { token: sid.a.token, raw: '{hỏng', type: 'application/json' });
  assert.equal(r.status, 400);

  // Hợp lệ ngay sau lần ghi đầu: bị giới hạn tần suất.
  r = await call('PUT', '/api/auth/profile', { token: sid.a.token, body: { revision: 1, name: 'Hai Ba' } });
  assert.equal(r.status, 429);
  assert.equal(r.json.code, 'rate_limited');
  assert.ok(r.headers.get('retry-after'));

  await sleep(WRITE_GAP);
  // Revision cũ: 409, không ghi đè.
  r = await call('PUT', '/api/auth/profile', { token: sid.a.token, body: { revision: 0, name: 'Hai Ba' } });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'revision_conflict');
  assert.equal(r.json.currentRevision, 1);
  const g = await call('GET', '/api/auth/profile', { token: sid.a.token });
  assert.equal(g.json.profile.name, 'Nguyễn Văn An');
});

test('PUT nhân vật: hợp lệ, GET đọc lại, ghi trùng revision 0 bị 409', async () => {
  let r = await call('GET', '/api/auth/profile/character', { token: sid.a.token });
  assert.equal(r.status, 200);
  assert.equal(r.json.character, null);
  assert.equal(r.json.revision, 0);

  r = await call('PUT', '/api/auth/profile/character', { token: sid.a.token, body: { revision: 0, look: sampleLook('Bộ A') } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.revision, 1);
  assert.equal(r.json.character.meta.name, 'Bộ A');

  r = await call('GET', '/api/auth/profile/character', { token: sid.a.token });
  assert.equal(r.json.character.meta.name, 'Bộ A');
  assert.equal(r.json.revision, 1);

  await sleep(WRITE_GAP);
  r = await call('PUT', '/api/auth/profile/character', { token: sid.a.token, body: { revision: 0, look: sampleLook('Bộ khác') } });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'revision_conflict');
  assert.equal(r.json.currentRevision, 1);
  r = await call('GET', '/api/auth/profile/character', { token: sid.a.token });
  assert.equal(r.json.character.meta.name, 'Bộ A', 'bản cloud không bị ghi đè');

  // Lần 409 ở trên cũng tính vào giới hạn tần suất (ghi nhận trước khi kiểm revision), nên phải chờ.
  await sleep(WRITE_GAP);
  // Sửa đúng revision thì tăng lên 2.
  r = await call('PUT', '/api/auth/profile/character', { token: sid.a.token, body: { revision: 1, look: sampleLook('Bộ A2') } });
  assert.equal(r.status, 200);
  assert.equal(r.json.revision, 2);
});

test('PUT nhân vật không hợp lệ: 422, 403, 413, 415', async () => {
  const t = sid.b.token;
  // Các lỗi dưới đây trả trước bước giới hạn tần suất nên không cần chờ.
  let r = await call('PUT', '/api/auth/profile/character', { token: t, body: { revision: 0, look: { version: 1 } } });
  assert.equal(r.status, 422);
  assert.ok(r.json.code);
  r = await call('PUT', '/api/auth/profile/character', { token: t, body: { revision: 0 } });
  assert.equal(r.status, 422);
  r = await call('PUT', '/api/auth/profile/character', { token: t, body: { revision: 'x', look: sampleLook() } });
  assert.equal(r.json.code, 'invalid_revision');
  r = await call('PUT', '/api/auth/profile/character', { token: t, body: { revision: 0, userId: sid.a.id, look: sampleLook() } });
  assert.equal(r.status, 403);
  r = await call('PUT', '/api/auth/profile/character', { token: t, body: { revision: 0, look: sampleLook(), extra: 1 } });
  assert.equal(r.json.code, 'unknown_field');

  const withUrl = sampleLook();
  withUrl.hair.style = 'https://evil.example/x';
  r = await call('PUT', '/api/auth/profile/character', { token: t, body: { revision: 0, look: withUrl } });
  assert.equal(r.status, 422);
  assert.equal(r.json.code, 'external_ref');

  const proto = '{"revision":0,"look":' + JSON.stringify(sampleLook()).replace('"hair":{', '"hair":{"__proto__":1,') + '}';
  r = await call('PUT', '/api/auth/profile/character', { token: t, raw: proto });
  assert.equal(r.status, 422);

  // Look quá 64 KB nhưng body dưới 72 KB: 413 từ route.
  const big = sampleLook();
  big.meta.presetId = null;
  big.body.pad = 'x'.repeat(100);
  const bigBody = JSON.stringify({ revision: 0, look: { ...big, notes: 'x'.repeat(68 * 1024) } });
  r = await call('PUT', '/api/auth/profile/character', { token: t, raw: bigBody });
  assert.ok(r.status === 413 || r.status === 422, `quá cỡ trả ${r.status}`);
  // Body vượt 72 KB: parser trả 413.
  r = await call('PUT', '/api/auth/profile/character', { token: t, raw: JSON.stringify({ revision: 0, look: { pad: 'x'.repeat(80000) } }) });
  assert.equal(r.status, 413);
  assert.equal(r.json.code, 'payload_too_large');
  // Body quá 72 KB trả 413 cả khi chưa đăng nhập (parser chạy trước phiên).
  r = await call('PUT', '/api/auth/profile/character', { raw: JSON.stringify({ revision: 0, look: { pad: 'x'.repeat(80000) } }) });
  assert.equal(r.status, 413);

  r = await call('PUT', '/api/auth/profile/character', { token: t, raw: 'abc', type: 'text/plain' });
  assert.equal(r.status, 415);
  r = await call('PUT', '/api/auth/profile/character', { token: t, raw: '[1]' });
  assert.equal(r.status, 415);

  // Chưa có gì được lưu cho B.
  r = await call('GET', '/api/auth/profile/character', { token: t });
  assert.equal(r.json.character, null);
});

test('ownership: A và B không đọc/sửa dữ liệu của nhau, không có route theo id', async () => {
  // B lưu nhân vật riêng.
  let r = await call('PUT', '/api/auth/profile/character', { token: sid.b.token, body: { revision: 0, look: sampleLook('Của B') } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  r = await call('GET', '/api/auth/profile/character', { token: sid.b.token });
  assert.equal(r.json.character.meta.name, 'Của B');
  r = await call('GET', '/api/auth/profile/character', { token: sid.a.token });
  assert.equal(r.json.character.meta.name, 'Bộ A2', 'A không thấy dữ liệu B');

  // Truyền id người khác: query, đường dẫn, body đều không có tác dụng.
  for (const route of [`/api/auth/profile/character/${sid.b.id}`, `/api/auth/profile/${sid.b.id}`]) {
    for (const m of ['GET', 'PUT', 'DELETE']) {
      const x = await call(m, route, { token: sid.a.token, body: m === 'PUT' ? { revision: 0 } : undefined });
      assert.equal(x.status, 404, `${m} ${route}`);
    }
  }
  r = await call('GET', `/api/auth/profile/character?userId=${sid.b.id}`, { token: sid.a.token });
  assert.equal(r.json.character.meta.name, 'Bộ A2');
  r = await call('GET', `/api/auth/profile?id=${sid.b.id}`, { token: sid.a.token });
  assert.equal(r.json.profile.id, sid.a.id);

  // Xác nhận trong DB: dữ liệu của B nguyên vẹn, tên B không đổi.
  const rowB = dbh.prepare('SELECT data FROM user_characters WHERE user_id = ?').get(sid.b.id);
  assert.equal(JSON.parse(rowB.data).meta.name, 'Của B');
  assert.equal(dbh.prepare('SELECT name FROM users WHERE id = ?').get(sid.b.id).name, 'Trần Bình');

  // A xóa nhân vật của mình thì B không bị ảnh hưởng.
  r = await call('DELETE', '/api/auth/profile/character', { token: sid.a.token });
  assert.equal(r.status, 200);
  assert.equal(r.json.deleted, true);
  r = await call('GET', '/api/auth/profile/character', { token: sid.b.token });
  assert.equal(r.json.character.meta.name, 'Của B');
  assert.equal((await call('GET', '/api/auth/profile/character', { token: sid.a.token })).json.character, null);
});

test('danh bạ không lộ email; hồ sơ không lộ băm mật khẩu hay token', async () => {
  const r = await call('GET', '/api/auth/directory', { token: sid.a.token });
  assert.equal(r.status, 200);
  const text = JSON.stringify(r.json);
  assert.ok(!text.includes('@test.local'));
  assert.ok(!text.includes(sid.a.token));
});

test('CSRF/Origin: GET không bị chặn; không bật CORS; form chéo trang bị 415', async () => {
  await sleep(WRITE_GAP);
  const r = await call('GET', '/api/auth/profile', { token: sid.a.token, headers: { Origin: 'https://evil.example' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), null, 'không bật CORS cho origin lạ');
  // Content-Type dạng form bị từ chối nên form chéo trang không ghi được.
  const f = await call('PUT', '/api/auth/profile', { token: sid.a.token, raw: 'revision=1&name=Hacker', type: 'application/x-www-form-urlencoded' });
  assert.equal(f.status, 415);
});

test('hết phiên và đăng xuất: 401 và bị thu hồi', async () => {
  const u = makeUser('c@test.local', 'Lê Cường');
  assert.equal((await call('GET', '/api/auth/profile', { token: u.token })).status, 200);
  dbh.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?').run(Date.now() - 1000, u.id);
  assert.equal((await call('GET', '/api/auth/profile', { token: u.token })).status, 401);

  const v = makeUser('d@test.local', 'Phạm Dũng');
  const out = await call('POST', '/api/auth/logout', { token: v.token, body: {} });
  assert.equal(out.status, 200);
  assert.equal((await call('GET', '/api/auth/profile/character', { token: v.token })).status, 401);
});

test('phiên tạm (onboarding) và tài khoản bị khóa không dùng được API hồ sơ', async () => {
  const u = makeUser('e@test.local', 'Hồ Em');
  dbh.prepare("UPDATE sessions SET scope = 'onboarding' WHERE user_id = ?").run(u.id);
  assert.equal((await call('GET', '/api/auth/profile', { token: u.token })).status, 401);
  const w = makeUser('f@test.local', 'Vũ Phương');
  dbh.prepare("UPDATE users SET status = 'banned' WHERE id = ?").run(w.id);
  assert.equal((await call('GET', '/api/auth/profile', { token: w.token })).status, 401);
});

test('log của server không chứa token phiên', () => {
  assert.ok(!logs.includes(sid.a.token));
  assert.ok(!logs.includes(sid.b.token));
});

test('Origin/Referer: request ghi từ origin lạ bị 403, origin cho phép và không có Origin thì qua', async () => {
  const u = makeUser('o@test.local', 'Ông Origin');
  const put = (headers, rev = 0) => call('PUT', '/api/auth/profile/about', { token: u.token, body: { revision: rev, bio: 'xin chào' }, headers });
  let r = await put({ Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  assert.equal(r.json.code, 'origin_forbidden');
  r = await put({ Origin: 'null' });
  assert.equal(r.status, 403);
  r = await put({ Referer: 'https://evil.example/trang' });
  assert.equal(r.status, 403);
  r = await put({ Origin: 'https://gp.daisoncoop.com.evil.example' });
  assert.equal(r.status, 403, 'không khớp tiền tố');
  // POST và DELETE cũng bị chặn, kể cả khi chưa đăng nhập (chặn trước phiên).
  assert.equal((await call('POST', '/api/auth/logout', { headers: { Origin: 'https://evil.example' }, body: {} })).status, 403);
  assert.equal((await call('DELETE', '/api/auth/profile/character', { token: u.token, headers: { Origin: 'https://evil.example' } })).status, 403);
  // Chưa có dòng nào được ghi do các request bị chặn.
  assert.equal(dbh.prepare('SELECT COUNT(*) AS n FROM user_about WHERE user_id = ?').get(u.id).n, 0);
  // GET từ origin lạ không bị chặn (chỉ chặn ghi).
  assert.equal((await call('GET', '/api/auth/profile/about', { token: u.token, headers: { Origin: 'https://evil.example' } })).status, 200);
  r = await put({ Origin: 'https://gp.daisoncoop.com' });
  assert.equal(r.status, 200);
  await sleep(WRITE_GAP);
  r = await put({ Origin: 'http://localhost:5173' }, 1);
  assert.equal(r.status, 200);
  await sleep(WRITE_GAP);
  r = await put({ Referer: 'http://127.0.0.1:4187/x' }, 2);
  assert.equal(r.status, 200);
  await sleep(WRITE_GAP);
  r = await put({ Origin: base }, 3);
  assert.equal(r.status, 200, 'cùng origin với chính máy chủ');
});

test('about: mặc định, ghi, kiểm tra đầu vào, từ cấm, conflict', async () => {
  const u = makeUser('p@test.local', 'Phạm Phương');
  const put = (body) => call('PUT', '/api/auth/profile/about', { token: u.token, body });
  let r = await call('GET', '/api/auth/profile/about', { token: u.token });
  assert.equal(r.status, 200);
  assert.deepEqual(
    { ...r.json.about, updatedAt: null },
    { bio: '', presence: 'free', statusText: '', profileVisibility: 'colleagues', characterVisibility: 'colleagues', revision: 0, updatedAt: null },
  );
  // Kiểm tra (trước giới hạn tần suất)
  assert.equal((await put({ revision: 0, presence: 'ngu' })).json.code, 'invalid_input');
  assert.equal((await put({ revision: 0, profileVisibility: 'all' })).status, 422);
  assert.equal((await put({ revision: 0, bio: 'x'.repeat(281) })).json.code, 'too_long');
  assert.equal((await put({ revision: 0, statusText: 'y'.repeat(61) })).json.code, 'too_long');
  assert.equal((await put({ revision: 0, bio: 'xem http://x.example' })).status, 422);
  assert.equal((await put({ revision: 0, bio: 'a\u0000b' })).status, 422);
  assert.equal((await put({ revision: 0, role: 'admin' })).status, 403);
  assert.equal((await put({ revision: 0, foo: 1 })).json.code, 'unknown_field');
  assert.equal((await put({ revision: 0 })).json.code, 'empty_update');
  assert.equal((await put({ revision: 0, bio: 'đụ má mày' })).json.code, 'content_rejected');
  assert.equal((await put({ revision: 0, statusText: 'địt mẹ' })).json.code, 'content_rejected');
  assert.equal(dbh.prepare('SELECT COUNT(*) AS n FROM user_about WHERE user_id = ?').get(u.id).n, 0);

  r = await put({ revision: 0, bio: '  Dev  frontend\n\n\n\nthích mèo ', presence: 'meeting', statusText: 'Họp  sprint', profileVisibility: 'everyone', characterVisibility: 'self' });
  assert.equal(r.status, 200);
  assert.equal(r.json.about.bio, 'Dev frontend\n\nthích mèo');
  assert.equal(r.json.about.statusText, 'Họp sprint');
  assert.equal(r.json.about.revision, 1);
  assert.equal((await put({ revision: 1, presence: 'busy' })).status, 429);
  await sleep(WRITE_GAP);
  r = await put({ revision: 0, presence: 'busy' });
  assert.equal(r.status, 409);
  assert.equal(r.json.currentRevision, 1);
  await sleep(WRITE_GAP);
  r = await put({ revision: 1, presence: 'busy' });
  assert.equal(r.status, 200);
  assert.equal(r.json.about.bio, 'Dev frontend\n\nthích mèo', 'trường không gửi giữ nguyên');
  assert.equal(r.json.about.presence, 'busy');
  assert.equal(r.json.about.revision, 2);
  // Không ảnh hưởng revision hồ sơ cũ
  assert.equal((await call('GET', '/api/auth/profile', { token: u.token })).json.profile.revision, 0);
  // Chưa đăng nhập
  assert.equal((await call('GET', '/api/auth/profile/about')).status, 401);
  assert.equal((await call('PUT', '/api/auth/profile/about', { body: { revision: 0, bio: 'x' } })).status, 401);
});

test('about: quyền riêng tư giữa chủ, đồng nghiệp, người ngoài tenant', async () => {
  dbh.prepare("INSERT OR IGNORE INTO tenants (id, type, name) VALUES ('t-other', 'business', 'Other')").run();
  const owner = makeUser('own@test.local', 'Chủ Hồ Sơ');
  const mate = makeUser('mate@test.local', 'Đồng Nghiệp');
  const out = makeUser('out@test.local', 'Người Ngoài');
  dbh.prepare("UPDATE users SET tenant_id = 't-other' WHERE id = ?").run(out.id);
  const card = (viewer, id = owner.id) => call('GET', `/api/auth/profile/about/${id}`, { token: viewer.token });
  const ownerPut = (body) => call('PUT', '/api/auth/profile/about', { token: owner.token, body });

  // Mặc định colleagues: đồng nghiệp thấy, người ngoài không.
  let r = await card(mate);
  assert.equal(r.status, 200);
  assert.equal(r.json.profile.name, 'Chủ Hồ Sơ');
  assert.ok(!JSON.stringify(r.json).includes('@'), 'không lộ email');
  assert.equal(r.json.profile.character, null);
  r = await card(out);
  assert.equal(r.status, 403);
  assert.equal(r.json.code, 'profile_private');

  // Lưu nhân vật + mở nhân vật cho mọi người, hồ sơ mọi người.
  await sleep(WRITE_GAP);
  assert.equal((await call('PUT', '/api/auth/profile/character', { token: owner.token, body: { revision: 0, look: sampleLook('Bộ của chủ') } })).status, 200);
  assert.equal((await ownerPut({ revision: 0, bio: 'Xin chào', presence: 'away', profileVisibility: 'everyone', characterVisibility: 'colleagues' })).status, 200);
  r = await card(out);
  assert.equal(r.status, 200);
  assert.equal(r.json.profile.bio, 'Xin chào');
  assert.equal(r.json.profile.presence, 'away');
  assert.equal(r.json.profile.character, null, 'người ngoài không thấy nhân vật');
  r = await card(mate);
  assert.equal(r.json.profile.character.meta.name, 'Bộ của chủ');

  // Chỉ mình tôi.
  await sleep(WRITE_GAP);
  assert.equal((await ownerPut({ revision: 1, profileVisibility: 'self' })).status, 200);
  assert.equal((await card(mate)).status, 403);
  assert.equal((await card(out)).status, 403);
  r = await card(owner);
  assert.equal(r.status, 200, 'chủ luôn xem được bản thân');
  assert.equal(r.json.profile.character.meta.name, 'Bộ của chủ');

  // id không hợp lệ / không tồn tại
  assert.equal((await card(mate, 'abc')).status, 404);
  assert.equal((await card(mate, 999999)).status, 404);
  assert.equal((await call('GET', `/api/auth/profile/about/${owner.id}`)).status, 401);
});
