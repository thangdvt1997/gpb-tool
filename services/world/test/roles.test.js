// TASK 26: vai trò theo phòng, can(), kick/mute, audit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATRIX, can, roleFromAccount } from '../src/roles.js';
import { EDITOR, GUEST, MEMBER, MEMBER2, OWNER, mk, pose, setup } from './helpers.js';

const act = (role, extra) => ({ id: 'x', tenantId: 't1', role, ...extra });

test('ánh xạ role tài khoản -> vai trò phòng; lạ hoặc thiếu -> guest', () => {
  assert.equal(roleFromAccount('admin'), 'owner');
  assert.equal(roleFromAccount('it'), 'editor');
  assert.equal(roleFromAccount('employee'), 'member');
  assert.equal(roleFromAccount(undefined), 'guest');
  assert.equal(roleFromAccount('root'), 'guest');
});

test('ma trận quyền: vai trò cao kế thừa vai trò thấp, mặc định từ chối', () => {
  assert.equal(can(act('guest'), 'room.join').ok, true);
  assert.equal(can(act('guest'), 'chat.send').ok, false);
  assert.equal(can(act('guest'), 'seat.use').ok, false);
  assert.equal(can(act('member'), 'object.use').ok, true);
  assert.equal(can(act('member'), 'layout.edit').ok, false);
  assert.equal(can(act('editor'), 'layout.edit').ok, true);
  assert.equal(can(act('editor'), 'member.kick').ok, false);
  assert.equal(can(act('owner'), 'member.kick', { targetId: 'y', targetRole: 'member' }).ok, true);
  assert.equal(can(act('owner'), 'hack.everything').ok, false);
  assert.equal(can(null, 'room.view').ok, false);
  for (const a of MATRIX.member) assert.ok(MATRIX.owner.has(a));
});

test('can: phòng khác bị chặn; mute chặn chat; owner không đụng owner/chính mình; không nâng owner', () => {
  assert.equal(can(act('member'), 'chat.send', { tenantId: 't2' }).reason, 'cross_room');
  assert.equal(can(act('member', { muted: true }), 'chat.send').reason, 'muted');
  assert.equal(can(act('owner'), 'member.kick', { targetId: 'x' }).reason, 'cannot_target_self');
  assert.equal(can(act('owner'), 'member.mute', { targetId: 'y', targetRole: 'owner' }).reason, 'cannot_target_owner');
  assert.equal(can(act('owner'), 'role.set', { targetId: 'y', targetRole: 'member', newRole: 'owner' }).reason, 'cannot_grant_owner');
  assert.equal(can(act('owner'), 'role.set', { targetId: 'y', targetRole: 'member', newRole: 'god' }).reason, 'invalid_role');
});

test('socket: member không kick/mute/đổi vai trò/xem audit dù gửi trực tiếp; ghi audit từ chối', () => {
  const { connect } = setup();
  const o = connect(OWNER);
  const m = connect(MEMBER);
  connect(MEMBER2);
  for (const msg of [
    { type: 'mod.kick', target: 'm2', requestId: '1' },
    { type: 'mod.mute', target: 'm2', requestId: '2' },
    { type: 'role.set', target: 'm2', role: 'editor', requestId: '3' },
  ]) {
    m.send(msg);
    assert.equal(m.conn.last('mod.result').ok, false);
    assert.equal(m.conn.last('mod.result').error, 'forbidden');
  }
  m.send({ type: 'audit.list' });
  assert.equal(m.conn.last('mod.result').error, 'forbidden');
  o.send({ type: 'audit.list' });
  const entries = o.conn.last('audit.list').entries;
  assert.equal(entries.length, 3);
  assert.equal(entries[0].actor, 'm');
  assert.equal(entries[0].result, 'forbidden');
  assert.equal(JSON.stringify(entries).includes('cookie'), false);
});

test('owner kick: đóng socket 4403, nhả lease, chặn kết nối lại, có audit', () => {
  const { world, connect, presence } = setup();
  const o = connect(OWNER);
  const m = connect(MEMBER);
  m.send(pose(1));
  m.send({ type: 'lease.acquire', resource: 'seat:s1', requestId: 'a' });
  o.send({ type: 'mod.kick', target: 'm', requestId: 'k1' });
  assert.equal(o.conn.last('mod.result').ok, true);
  assert.equal(m.conn.closed.code, 4403);
  assert.equal(o.conn.last('lease').ownerId, null);
  assert.equal(presence.get('t1', 'm'), null);
  assert.equal(world.isKicked(MEMBER), true);
  o.send({ type: 'audit.list' });
  assert.equal(o.conn.last('audit.list').entries[0].action, 'member.kick');
});

test('owner không kick owner khác hay chính mình', () => {
  const { connect } = setup();
  const o = connect(OWNER);
  const o2 = connect(mk('o2', 'admin'));
  o.send({ type: 'mod.kick', target: 'o2' });
  assert.equal(o.conn.last('mod.result').error, 'cannot_target_owner');
  o.send({ type: 'mod.kick', target: 'o' });
  assert.equal(o.conn.last('mod.result').error, 'cannot_target_self');
  assert.equal(o2.conn.closed, null);
});

test('mute: người bị mute không chat được, hết hạn thì chat lại', () => {
  const { clock, connect } = setup();
  const o = connect(OWNER);
  const m = connect(MEMBER);
  o.send({ type: 'mod.mute', target: 'm', durationMs: 5000 });
  assert.equal(m.conn.last('muted').on, true);
  m.send({ type: 'chat', channel: 'room', text: 'xin chào', clientMsgId: 'c1' });
  assert.equal(m.conn.last('error').code, 'muted');
  clock.t += 6000;
  m.send({ type: 'chat', channel: 'room', text: 'xin chào', clientMsgId: 'c2' });
  assert.equal(m.conn.last('chat.ack').clientMsgId, 'c2');
});

test('đổi vai trò có hiệu lực ngay: thu hồi editor nhả edit lock, commit sau đó bị từ chối', () => {
  const { connect } = setup();
  const o = connect(OWNER);
  const e = connect(EDITOR);
  e.send({ type: 'lease.acquire', resource: 'edit:d1', requestId: '1' });
  const tok = e.conn.last('lease.result').lease;
  o.send({ type: 'role.set', target: 'e', role: 'member' });
  assert.equal(o.conn.last('mod.result').ok, true);
  assert.equal(e.conn.last('role').role, 'member');
  assert.equal(e.conn.last('role').capabilities.includes('layout.edit'), false);
  e.send({ type: 'edit.commit', resource: 'edit:d1', leaseId: tok.leaseId, fence: tok.fence, patch: { x: 1 }, requestId: '2' });
  assert.equal(e.conn.last('edit.result').error, 'forbidden');
  assert.equal(o.conn.last('lease').reason, 'revoked');
});

test('guest chỉ xem: không chat, không ngồi; vẫn gửi pose', () => {
  const { connect } = setup();
  const g = connect(GUEST);
  assert.equal(g.snap.role, 'guest');
  g.send({ type: 'chat', channel: 'room', text: 'hi', clientMsgId: 'c' });
  assert.equal(g.conn.last('error').code, 'forbidden');
  g.send({ type: 'lease.acquire', resource: 'seat:s1', requestId: 'r' });
  assert.equal(g.conn.last('lease.result').error, 'forbidden');
  g.send(pose(1));
  assert.equal(g.conn.last('ack').seq, 1);
});

test('cross-room: owner phòng A không kick/đổi vai trò người phòng B', () => {
  const { connect } = setup();
  const o = connect(OWNER);
  connect(mk('b1', 'employee', 't2'));
  o.send({ type: 'mod.kick', target: 'b1' });
  assert.equal(o.conn.last('mod.result').error, 'target_not_found');
});

test('member.list: owner thấy mọi người kèm vai trò, member bị từ chối, không lộ role tài khoản', () => {
  const { connect } = setup();
  const o = connect(OWNER);
  const m = connect(MEMBER);
  const e = connect(EDITOR);
  m.send({ type: 'member.list', requestId: 'l0' });
  assert.equal(m.conn.last('mod.result').error, 'forbidden');
  o.send({ type: 'member.list', requestId: 'l1' });
  const list = o.conn.last('member.list');
  assert.equal(list.requestId, 'l1');
  const byId = Object.fromEntries(list.members.map((x) => [x.id, x]));
  assert.equal(byId[OWNER.id].role, 'owner');
  assert.equal(byId[MEMBER.id].role, 'member');
  assert.equal(byId[EDITOR.id].role, 'editor');
  assert.equal(byId[MEMBER.id].muted, false);
  assert.equal(JSON.stringify(list).includes('accountRole'), false);
  o.send({ type: 'mod.mute', target: MEMBER.id, durationMs: 60000 });
  o.send({ type: 'role.set', target: MEMBER.id, role: 'editor' });
  o.send({ type: 'member.list' });
  const again = o.conn.all('member.list').pop().members.find((x) => x.id === MEMBER.id);
  assert.equal(again.muted, true);
  assert.equal(again.role, 'editor');
  void e;
});
