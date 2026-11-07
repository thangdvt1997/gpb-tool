// TASK 26: lưu bền vai trò phòng (tmp+rename) và chuyển quyền chủ phòng.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { can, createRoleStore } from '../src/roles.js';
import { EDITOR, MEMBER, MEMBER2, OWNER, mk, setup } from './helpers.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'world-roles-'));

test('lưu bền: setRole ghi tệp, store mới đọc lại; xóa override cũng được lưu; chỉ tệp đích, không còn .tmp', () => {
  const dir = tmp();
  try {
    const a = createRoleStore({ dataDir: dir });
    a.setRole('t1', 'm', 'editor');
    a.setRole('t2', 'x', 'guest');
    assert.deepEqual(readdirSync(dir), ['room-roles.json']);
    const b = createRoleStore({ dataDir: dir });
    assert.equal(b.roleOf(MEMBER), 'editor');
    assert.equal(b.roleOf(mk('x', 'admin', 't2')), 'guest');
    assert.equal(b.roleOf(MEMBER2), 'member'); // không có override: theo tài khoản
    b.setRole('t1', 'm', undefined);
    assert.equal(createRoleStore({ dataDir: dir }).roleOf(MEMBER), 'member');
    assert.equal(JSON.parse(readFileSync(join(dir, 'room-roles.json'), 'utf8')).version, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tệp hỏng hoặc vai trò lạ: bỏ qua an toàn, giữ bản hỏng để điều tra', () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, 'room-roles.json'), '{không phải json');
    const errs = [];
    const s = createRoleStore({ dataDir: dir, onError: (e) => errs.push(e) });
    assert.equal(s.roleOf(MEMBER), 'member');
    assert.equal(errs.length, 1);
    assert.ok(readdirSync(dir).some((f) => f.startsWith('room-roles.json.corrupt-')));
    writeFileSync(join(dir, 'room-roles.json'), JSON.stringify({ version: 1, rooms: { t1: { m: 'god', e: 'editor' } } }));
    const s2 = createRoleStore({ dataDir: dir });
    assert.equal(s2.roleOf(MEMBER), 'member');
    assert.equal(s2.roleOf(EDITOR), 'editor');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('không ghi được (thư mục là tệp): báo lỗi, trạng thái bộ nhớ vẫn đúng', () => {
  const dir = tmp();
  try {
    const blocker = join(dir, 'file');
    writeFileSync(blocker, 'x');
    const errs = [];
    const s = createRoleStore({ dataDir: join(blocker, 'sub'), onError: (e) => errs.push(e) });
    s.setRole('t1', 'm', 'editor');
    assert.equal(s.roleOf(MEMBER), 'editor');
    assert.ok(errs.length >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('role.set qua socket được lưu và còn sau "khởi động lại" (world mới cùng thư mục)', () => {
  const dir = tmp();
  try {
    const s1 = setup({ roles: createRoleStore({ dataDir: dir }) });
    const o = s1.connect(OWNER);
    s1.connect(MEMBER);
    o.send({ type: 'role.set', target: 'm', role: 'editor' });
    assert.equal(o.conn.last('mod.result').ok, true);
    const s2 = setup({ roles: createRoleStore({ dataDir: dir }) });
    assert.equal(s2.connect(MEMBER).snap.role, 'editor');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('chuyển quyền: chỉ owner, cần confirm, không cho chính mình/owner khác/người vắng mặt; có audit', () => {
  const { connect } = setup();
  const o = connect(OWNER);
  const m = connect(MEMBER);
  connect(mk('o2', 'admin'));
  m.send({ type: 'owner.transfer', target: 'm2', confirm: true });
  assert.equal(m.conn.last('mod.result').error, 'forbidden');
  o.send({ type: 'owner.transfer', target: 'm', requestId: 'q' });
  assert.equal(o.conn.last('mod.result').error, 'confirm_required');
  o.send({ type: 'owner.transfer', target: 'o', confirm: true });
  assert.equal(o.conn.last('mod.result').error, 'cannot_target_self');
  o.send({ type: 'owner.transfer', target: 'o2', confirm: true });
  assert.equal(o.conn.last('mod.result').error, 'cannot_target_owner');
  o.send({ type: 'owner.transfer', target: 'vắng', confirm: true });
  assert.equal(o.conn.last('mod.result').error, 'target_not_found');
  o.send({ type: 'audit.list' });
  const acts = o.conn.last('audit.list').entries.map((e) => `${e.action}:${e.result}`);
  assert.ok(acts.includes('owner.transfer:cannot_target_owner'));
  assert.ok(acts.includes('owner.transfer:forbidden'));
});

test('chuyển quyền thành công: bên mới là owner ngay, bên cũ xuống editor, được lưu bền và có audit', () => {
  const dir = tmp();
  try {
    const store = createRoleStore({ dataDir: dir });
    const { connect } = setup({ roles: store });
    const o = connect(OWNER);
    const m = connect(MEMBER);
    o.send({ type: 'owner.transfer', target: 'm', confirm: true, requestId: 'ok' });
    assert.equal(o.conn.last('mod.result').ok, true);
    assert.equal(m.conn.last('role').role, 'owner');
    assert.ok(m.conn.last('role').capabilities.includes('role.set'));
    assert.equal(o.conn.last('role').role, 'editor');
    assert.equal(o.conn.last('role').capabilities.includes('member.kick'), false);
    // owner cũ mất quyền ngay
    o.send({ type: 'mod.kick', target: 'm' });
    assert.equal(o.conn.last('mod.result').error, 'forbidden');
    // owner mới dùng quyền được và xem được audit chuyển quyền
    m.send({ type: 'audit.list' });
    const e = m.conn.last('audit.list').entries.find((x) => x.action === 'owner.transfer' && x.result === 'ok');
    assert.equal(e.actor, 'o');
    assert.equal(e.target, 'm');
    // sau khởi động lại vẫn giữ
    const again = createRoleStore({ dataDir: dir });
    assert.equal(again.roleOf(MEMBER), 'owner');
    assert.equal(again.roleOf(OWNER), 'editor'); // override thắng ánh xạ admin->owner
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('can(owner.transfer): member/editor bị từ chối; phòng khác bị chặn', () => {
  const act = (role) => ({ id: 'x', tenantId: 't1', role });
  assert.equal(can(act('editor'), 'owner.transfer', { targetId: 'y', targetRole: 'member' }).ok, false);
  assert.equal(can(act('owner'), 'owner.transfer', { targetId: 'y', targetRole: 'member' }).ok, true);
  assert.equal(can(act('owner'), 'owner.transfer', { tenantId: 't2', targetId: 'y' }).reason, 'cross_room');
});
