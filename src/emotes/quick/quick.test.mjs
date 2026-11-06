// Chạy: node --test src/emotes/quick/quick.test.mjs  (Node >= 22.6, type stripping)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './logic.ts';
import { EMOTES, EMOTE_ORDER, LEAD_IN, LEAD_OUT } from '../library.ts';

const ok = { speed: 0, airborne: false, sitting: false, editorOpen: false, interacting: false, position: { x: 1, z: 1 }, zones: null };
const act = (id) => L.QUICK_ACTIONS.find((a) => a.id === id);

test('mỗi hành động ánh xạ tới emote người dùng có thật', () => {
  for (const a of L.QUICK_ACTIONS) {
    assert.ok(EMOTES[a.emoteId], a.id);
    assert.ok(EMOTE_ORDER.includes(a.emoteId), a.id);
    assert.equal(a.needsOtherPlayer, false);
  }
  assert.equal(L.QUICK_ACTIONS.length, 6);
});

test('không phím trùng nhau hoặc trùng phím dành riêng', () => {
  assert.deepEqual(L.findKeyConflicts(L.QUICK_ACTIONS), []);
  for (const k of ['w', 'a', 's', 'd', 'shift', ' ', 'e', 'v', 'escape']) assert.ok(L.RESERVED_KEYS.includes(k));
});

test('phát hiện trùng phím', () => {
  const bad = [{ id: 'x', hotkey: 'W' }, { id: 'y', hotkey: 'k' }, { id: 'z', hotkey: 'k' }, { id: 'q', hotkey: 'q' }];
  const keys = L.findKeyConflicts(bad).map((c) => c.key).sort();
  assert.deepEqual(keys, ['k', 'q', 'w']);
});

test('rebind từ chối phím dành riêng và phím trùng', () => {
  assert.equal(L.rebind(L.QUICK_ACTIONS, 'wave', 'W').ok, false);
  assert.equal(L.rebind(L.QUICK_ACTIONS, 'wave', 'x').ok, false);
  assert.equal(L.rebind(L.QUICK_ACTIONS, 'wave', 'ab').ok, false);
  assert.equal(L.rebind(L.QUICK_ACTIONS, 'wave', 'g').ok, true);
});

test('actionForKey bỏ qua modifier', () => {
  assert.equal(L.actionForKey('z', {}), 'wave');
  assert.equal(L.actionForKey('Z', {}), 'wave');
  assert.equal(L.actionForKey('z', { ctrl: true }), null);
  assert.equal(L.actionForKey('w', {}), null);
});

test('điều kiện bắt đầu', () => {
  const w = act('wave');
  assert.deepEqual(L.canStart(w, ok, 0, 0), { ok: true });
  const cases = [
    [{ speed: 2 }, 'moving'], [{ airborne: true }, 'airborne'], [{ sitting: true }, 'sitting'],
    [{ editorOpen: true }, 'editor_open'], [{ interacting: true }, 'interacting'],
  ];
  for (const [patch, reason] of cases) assert.deepEqual(L.canStart(w, { ...ok, ...patch }, 0, 0), { ok: false, reason });
  assert.deepEqual(L.canStart(undefined, ok, 0, 0), { ok: false, reason: 'unknown_action' });
  assert.deepEqual(L.canStart(w, ok, 100, 500), { ok: false, reason: 'cooldown' });
  assert.deepEqual(L.canStart(w, ok, 500, 500), { ok: true });
});

test('vùng cho phép', () => {
  const zones = [{ minX: 0, maxX: 2, minZ: 0, maxZ: 2 }];
  assert.equal(L.canStart(act('wave'), { ...ok, zones }, 0, 0).ok, true);
  assert.deepEqual(L.canStart(act('wave'), { ...ok, zones, position: { x: 5, z: 1 } }, 0, 0), { ok: false, reason: 'outside_zone' });
  assert.deepEqual(L.canStart(act('wave'), { ...ok, zones: [] }, 0, 0), { ok: false, reason: 'outside_zone' });
});

test('chính sách hủy: stance không bị hủy khi di chuyển, khớp player', () => {
  assert.equal(L.shouldCancel(act('stance'), 'move'), false);
  assert.equal(L.shouldCancel(act('wave'), 'move'), true);
  assert.equal(L.shouldCancel(act('stance'), 'editor'), true);
  assert.equal(EMOTES.stance.mode, 'hold');
});

test('thời lượng: once có số, loop/hold là null', () => {
  const d = L.durationSec(EMOTES.wave, LEAD_IN, LEAD_OUT);
  assert.ok(d > 1.5 && d < 4);
  assert.equal(L.durationSec(EMOTES.dance_1, LEAD_IN, LEAD_OUT), null);
  assert.equal(L.durationSec(EMOTES.stance, LEAD_IN, LEAD_OUT), null);
});

test('bánh xe: góc và phím số', () => {
  assert.equal(L.wheelIndexFromPointer(0, -100, 6), 0);
  assert.equal(L.wheelIndexFromPointer(100, 0, 6), 2);
  assert.equal(L.wheelIndexFromPointer(0, 100, 6), 3);
  assert.equal(L.wheelIndexFromPointer(-87, 50, 6), 4);
  assert.equal(L.wheelIndexFromPointer(3, 3, 6), -1);
  assert.equal(L.wheelIndexFromDigit('1', 6), 0);
  assert.equal(L.wheelIndexFromDigit('6', 6), 5);
  assert.equal(L.wheelIndexFromDigit('7', 6), -1);
  assert.equal(L.wheelIndexFromDigit('a', 6), -1);
});

test('hành động chưa làm không nằm trong danh sách chạy', () => {
  const ids = new Set(L.QUICK_ACTIONS.map((a) => a.id));
  for (const n of L.NOT_IMPLEMENTED) {
    assert.ok(!ids.has(n.id));
    assert.ok(n.reason.length > 0);
  }
  assert.ok(L.NOT_IMPLEMENTED.some((n) => n.id === 'handshake'));
});
