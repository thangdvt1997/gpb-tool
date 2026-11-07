// TASK 25b: tín hiệu WebRTC qua WebSocket world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionHandler } from '../src/connection.js';
import { createVoice, VOICE } from '../src/voice.js';
import { MEMBER, MEMBER2, OWNER, GUEST, mk, pose, setup } from './helpers.js';

const SDP = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const offer = (to, over) => ({ type: 'voice.signal', kind: 'offer', to, callId: 'c1', sdp: SDP, ...over });

function pair() {
  const s = setup();
  const a = s.connect(MEMBER);
  const b = s.connect(MEMBER2);
  a.send(pose(1, -4, 3));
  b.send(pose(1, -3, 3));
  return { ...s, a, b };
}

test('offer tới đúng người, from do server gán (không tin payload)', () => {
  const { a, b } = pair();
  a.send(offer('m2', { from: 'fake' }));
  const got = b.conn.last('voice.signal');
  assert.equal(got.from, 'm');
  assert.equal(got.kind, 'offer');
  assert.equal(got.sdp, SDP);
  assert.equal(a.conn.all('voice.signal').length, 0);
  assert.equal(a.conn.all('error').length, 0);
});

test('answer và ice được chuyển; ice sai cấu trúc bị từ chối', () => {
  const { a, b } = pair();
  b.send({ type: 'voice.signal', kind: 'answer', to: 'm', callId: 'c1', sdp: SDP });
  assert.equal(a.conn.last('voice.signal').kind, 'answer');
  a.send({ type: 'voice.signal', kind: 'ice', to: 'm2', callId: 'c1', candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 });
  assert.equal(b.conn.last('voice.signal').candidate.startsWith('candidate:'), true);
  a.send({ type: 'voice.signal', kind: 'ice', to: 'm2', callId: 'c1', candidate: 5 });
  assert.equal(a.conn.last('error').code, 'invalid_message');
});

test('phòng khác không nhận; người không tồn tại', () => {
  const s = setup();
  const a = s.connect(MEMBER);
  const x = s.connect(mk('m2', 'employee', 't2'));
  a.send(pose(1));
  x.send(pose(1));
  a.send(offer('m2'));
  assert.equal(a.conn.last('error').code, 'target_not_found');
  assert.equal(x.conn.all('voice.signal').length, 0);
});

test('quá xa thì không chuyển offer, nhưng bye vẫn chuyển', () => {
  const far = setup({ voice: createVoice({ config: { ...VOICE, signalRadius: 10 } }) });
  const p = far.connect(MEMBER);
  const q = far.connect(MEMBER2);
  p.send(pose(1, -4, 3));
  q.send(pose(1, 8, -6));
  p.send(offer('m2'));
  assert.equal(p.conn.last('error').code, 'too_far');
  assert.equal(q.conn.all('voice.signal').length, 0);
  p.send({ type: 'voice.signal', kind: 'bye', to: 'm2', callId: 'c1' });
  assert.equal(q.conn.last('voice.signal').kind, 'bye');
});

test('người bị mute không phát được offer; bye vẫn được', () => {
  const s = setup();
  const o = s.connect(OWNER);
  const a = s.connect(MEMBER);
  const b = s.connect(MEMBER2);
  a.send(pose(1, -4, 3));
  b.send(pose(1, -3, 3));
  o.send({ type: 'mod.mute', target: 'm', on: true });
  assert.equal(a.conn.last('muted')?.on, true);
  a.send(offer('m2'));
  assert.equal(a.conn.last('error').code, 'muted');
  assert.equal(b.conn.all('voice.signal').length, 0);
  a.send({ type: 'voice.signal', kind: 'bye', to: 'm2', callId: 'c1' });
  assert.equal(b.conn.last('voice.signal').kind, 'bye');
});

test('khách (guest) không có quyền thoại', () => {
  const s = setup();
  const g = s.connect(GUEST);
  const b = s.connect(MEMBER2);
  g.send(pose(1, -4, 3));
  b.send(pose(1, -3, 3));
  g.send(offer('m2'));
  assert.equal(g.conn.last('error').code, 'forbidden');
  assert.equal(b.conn.all('voice.signal').length, 0);
});

test('người đã chặn nhau thì không nhận tín hiệu', () => {
  const { a, b } = pair();
  b.send({ type: 'chat.block', target: 'm', on: true });
  a.send(offer('m2'));
  assert.equal(a.conn.last('error').code, 'blocked');
  assert.equal(b.conn.all('voice.signal').length, 0);
});

test('giới hạn kích thước SDP, kind lạ, tự gửi cho mình', () => {
  const { a } = pair();
  a.send(offer('m2', { sdp: 'x'.repeat(6001) }));
  assert.equal(a.conn.last('error').code, 'invalid_message');
  a.send(offer('m2', { kind: 'weird' }));
  assert.equal(a.conn.last('error').code, 'invalid_message');
  a.send(offer('m'));
  assert.equal(a.conn.last('error').code, 'invalid_target');
});

test('giới hạn tần suất: burst rồi rate_limited', () => {
  const { a, b } = pair();
  let limited = null;
  for (let i = 0; i < 40; i++) {
    // Mỗi tin cách 60 ms (helper) = ~16 tin/giây: nhanh hơn mức nạp 5/giây của voice nhưng không dính flood 20/giây.
    a.send({ type: 'voice.signal', kind: 'ice', to: 'm2', callId: 'c1', candidate: `candidate:${i}` });
    const e = a.conn.last('error');
    if (e?.code === 'rate_limited') {
      limited = e;
      break;
    }
  }
  assert.ok(limited, 'phải bị rate_limited');
  assert.ok(limited.retryAfterMs > 0);
  assert.ok(b.conn.all('voice.signal').length >= 15);
});

test('khung 1-8 KB chỉ chấp nhận với voice.signal; loại khác đóng 1009', () => {
  const s = setup();
  const mk1 = (user) => {
    const conn = { sent: [], closed: null, send(t) { this.sent.push(JSON.parse(t)); }, close(c, r) { this.closed = { c, r }; }, terminate() {}, bufferedAmount: 0 };
    const { client } = s.hub.add(user, conn);
    return { conn, h: createConnectionHandler({ world: s.world, hub: s.hub, client, now: () => s.clock.t }) };
  };
  const a = mk1(MEMBER);
  const big = Buffer.from(JSON.stringify({ type: 'voice.signal', kind: 'offer', to: 'zz', callId: 'c', sdp: 'v'.repeat(3000) }));
  a.h.onMessage(big, false);
  assert.equal(a.conn.closed, null);
  const b = mk1(MEMBER2);
  b.h.onMessage(Buffer.from(JSON.stringify({ type: 'chat', text: 'a'.repeat(3000) })), false);
  assert.equal(b.conn.closed.c, 1009);
  const c = mk1(OWNER);
  c.h.onMessage(Buffer.alloc(9000, 97), false);
  assert.equal(c.conn.closed.c, 1009);
});
