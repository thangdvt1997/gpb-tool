// TASK 25a: chat chữ theo phòng và theo khoảng cách.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeText } from '../src/chat.js';
import { MEMBER, MEMBER2, OWNER, mk, pose, setup } from './helpers.js';

const say = (c, text, id, channel = 'room') => c.send({ type: 'chat', channel, text, clientMsgId: id });

test('room: mọi người cùng phòng nhận, phòng khác không; senderId do server gán', () => {
  const { connect } = setup();
  const a = connect(MEMBER);
  const b = connect(MEMBER2);
  const x = connect(mk('x', 'employee', 't2'));
  a.send({ type: 'chat', channel: 'room', text: 'Chào mọi người', clientMsgId: 'c1', from: { id: 'fake' } });
  assert.equal(b.conn.last('chat').from.id, 'm');
  assert.equal(b.conn.last('chat').text, 'Chào mọi người');
  assert.equal(x.conn.all('chat').length, 0);
  assert.equal(a.conn.last('chat.ack').id, b.conn.last('chat').id);
});

test('near: chỉ người trong bán kính nhận; kênh gần cần có vị trí', () => {
  const { connect } = setup();
  const a = connect(MEMBER);
  const near = connect(MEMBER2);
  const far = connect(mk('f', 'employee'));
  say(a, 'xin chào', 'n0', 'near');
  assert.equal(a.conn.last('error').code, 'no_position');
  a.send(pose(1, -4, 3));
  near.send(pose(1, -3, 3));
  far.send(pose(1, 8, -6));
  say(a, 'nghe thấy không', 'n1', 'near');
  assert.equal(near.conn.last('chat').text, 'nghe thấy không');
  assert.equal(far.conn.all('chat').length, 0);
});

test('near không vào lịch sử; room có lịch sử, giới hạn limit', () => {
  const { clock, connect } = setup();
  const a = connect(MEMBER);
  const b = connect(MEMBER2);
  a.send(pose(1));
  say(a, 'riêng tư gần', 'n1', 'near');
  for (let i = 0; i < 3; i++) {
    clock.t += 3000;
    say(a, `tin ${i}`, `r${i}`);
  }
  b.send({ type: 'chat.history', limit: 2 });
  const h = b.conn.last('chat.history').messages;
  assert.deepEqual(h.map((m) => m.text), ['tin 1', 'tin 2']);
  b.send({ type: 'chat.history', beforeId: h[0].id });
  assert.deepEqual(b.conn.last('chat.history').messages.map((m) => m.text), ['tin 0']);
});

test('lọc từ cấm, rỗng, quá dài; không phát ra', () => {
  const { connect } = setup();
  const a = connect(MEMBER);
  const b = connect(MEMBER2);
  say(a, 'đ.m mày', 'c1');
  assert.equal(a.conn.last('error').code, 'content_rejected');
  say(a, '   ', 'c2');
  assert.equal(a.conn.last('error').code, 'empty');
  say(a, 'a'.repeat(251), 'c3');
  assert.equal(a.conn.last('error').code, 'too_long');
  assert.equal(b.conn.all('chat').length, 0);
});

test('rate limit: burst 5 rồi rate_limited kèm retryAfterMs', () => {
  const { clock, connect } = setup();
  const a = connect(MEMBER);
  for (let i = 0; i < 5; i++) say(a, `tin ${i}`, `r${i}`);
  clock.t -= 60 * 5; // gom về cùng thời điểm để thấy burst
  say(a, 'tin 6', 'r6');
  assert.equal(a.conn.last('error').code, 'rate_limited');
  assert.ok(a.conn.last('error').retryAfterMs > 0);
});

test('retry cùng clientMsgId không tạo tin trùng', () => {
  const { connect } = setup();
  const a = connect(MEMBER);
  const b = connect(MEMBER2);
  say(a, 'một lần', 'dup');
  say(a, 'một lần', 'dup');
  assert.equal(b.conn.all('chat').length, 1);
  assert.equal(a.conn.all('chat.ack').length, 2);
  assert.equal(a.conn.all('chat.ack')[1].duplicate, true);
});

test('chặn người: không nhận tin trực tiếp lẫn lịch sử; bỏ chặn thì nhận lại', () => {
  const { clock, connect } = setup();
  const a = connect(MEMBER);
  const b = connect(MEMBER2);
  b.send({ type: 'chat.block', target: 'm', on: true });
  assert.equal(b.conn.last('chat.block').ok, true);
  say(a, 'bạn có đó không', 'c1');
  assert.equal(b.conn.all('chat').length, 0);
  b.send({ type: 'chat.history' });
  assert.equal(b.conn.last('chat.history').messages.length, 0);
  b.send({ type: 'chat.block', target: 'm', on: false });
  clock.t += 3000;
  say(a, 'đây rồi', 'c2');
  assert.equal(b.conn.last('chat').text, 'đây rồi');
  b.send({ type: 'chat.block', target: 'm2' });
  assert.equal(b.conn.last('chat.block').error, 'invalid_target');
});

test('sanitizeText bỏ ký tự điều khiển và đảo chiều; HTML giữ nguyên là chữ (client không render HTML)', () => {
  assert.equal(sanitizeText('a‮b\u0000c​d'), 'abcd');
  assert.equal(sanitizeText('  <b>x</b>  '), '<b>x</b>');
  assert.equal(sanitizeText(5), '');
});

test('chat cần vai trò member trở lên (đã có test guest); owner chat được', () => {
  const { connect } = setup();
  const o = connect(OWNER);
  say(o, 'họp lúc 3 giờ', 'c');
  assert.equal(o.conn.last('chat.ack').clientMsgId, 'c');
});
