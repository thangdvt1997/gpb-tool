// Test logic tự đi: gửi điểm gấp, dừng khi phím/click cảnh/kẹt 2 s/tới nơi.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoWalk, isMoveKey, isSceneClick, markArrivedAtPoint, stepAutoWalk, STALL_MS } from '../index.js';

const route = { status: 'ok', length: 10, points: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }] };

test('gửi điểm gấp kế tiếp một lần, rồi im cho tới khi tới điểm đó', () => {
  const st = createAutoWalk({ x: 0, z: 0 }, 0);
  const a = stepAutoWalk(st, { route, x: 0, z: 0, now: 100 });
  assert.deepEqual(a, { type: 'walk', x: 5, z: 0, index: 1 });
  assert.deepEqual(stepAutoWalk(st, { route, x: 1, z: 0, now: 350 }), { type: 'none' });
  markArrivedAtPoint(st, route, 1);
  const b = stepAutoWalk(st, { route, x: 5, z: 0.2, now: 600 });
  assert.equal(b.type, 'walk');
  assert.equal(b.index, 2);
});

test('kẹt quá 2 s thì dừng, nhích được thì đặt lại mốc', () => {
  const st = createAutoWalk({ x: 0, z: 0 }, 0);
  stepAutoWalk(st, { route, x: 0, z: 0, now: 100 });
  assert.notEqual(stepAutoWalk(st, { route, x: 0.05, z: 0, now: STALL_MS }).type, 'stop');
  assert.deepEqual(stepAutoWalk(st, { route, x: 0.05, z: 0, now: STALL_MS + 1 }), { type: 'stop', reason: 'stall' });
  const st2 = createAutoWalk({ x: 0, z: 0 }, 0);
  stepAutoWalk(st2, { route, x: 0.5, z: 0, now: 1900 });
  assert.notEqual(stepAutoWalk(st2, { route, x: 0.5, z: 0, now: 3800 }).type, 'stop');
});

test('tới nơi hoặc mất tuyến thì dừng', () => {
  const st = createAutoWalk({ x: 5, z: 5 }, 0);
  assert.deepEqual(stepAutoWalk(st, { route, x: 5, z: 4.5, now: 10 }), { type: 'stop', reason: 'arrived' });
  assert.deepEqual(stepAutoWalk(st, { route: null, x: 0, z: 0, now: 10 }), { type: 'stop', reason: 'no_route' });
  assert.deepEqual(stepAutoWalk(st, { route: { status: 'unreachable', points: [] }, x: 0, z: 0, now: 10 }), { type: 'stop', reason: 'no_route' });
});

test('phím di chuyển và bấm vào cảnh làm tắt; bấm trong minimap thì không', () => {
  for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft']) assert.equal(isMoveKey(c), true);
  for (const c of ['KeyM', 'Tab', 'Escape', 'Space']) assert.equal(isMoveKey(c), false);
  assert.equal(isSceneClick({ isCanvas: true, insideMinimap: false }), true);
  assert.equal(isSceneClick({ isCanvas: true, insideMinimap: true }), false);
  assert.equal(isSceneClick({ isCanvas: false, insideMinimap: false }), false);
});
