// Chạy: node --test tests/camera/   (Node >= 22.18 hoặc >= 23.6: tự bỏ kiểu khi import file .ts)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCameraModeController,
  createComfortStore,
  effectiveShake,
  sanitizeComfort,
  clampToPolicy,
  MODE_POLICY,
  DEFAULT_SHAKE_SCALE,
  COMFORT_STORAGE_KEY,
} from '../../src/scene/controls/cameraModes.ts';

test('mặc định là thirdPerson, đổi base sang firstPerson', () => {
  const c = createCameraModeController();
  assert.equal(c.getMode(), 'thirdPerson');
  assert.equal(c.setBase('firstPerson'), true);
  assert.equal(c.getMode(), 'firstPerson');
  assert.equal(c.getPrevious(), 'thirdPerson');
  assert.equal(c.setBase('firstPerson'), false);
});

test('ưu tiên: inspect > overview > seated > base', () => {
  const c = createCameraModeController();
  c.request('seated', 's');
  assert.equal(c.getMode(), 'seated');
  c.request('overview', 'o');
  assert.equal(c.getMode(), 'overview');
  c.request('inspect', 'i');
  assert.equal(c.getMode(), 'inspect');
  c.release('i');
  assert.equal(c.getMode(), 'overview');
  c.release('o');
  assert.equal(c.getMode(), 'seated');
  c.release('s');
  assert.equal(c.getMode(), 'thirdPerson');
});

test('yêu cầu seated đè base firstPerson, gỡ thì về firstPerson', () => {
  const c = createCameraModeController();
  c.setBase('firstPerson');
  c.request('seated', 's');
  assert.equal(c.getMode(), 'seated');
  c.release('s');
  assert.equal(c.getMode(), 'firstPerson');
});

test('một nguồn chỉ giữ một yêu cầu; lặp lại không đổi gì', () => {
  const c = createCameraModeController();
  assert.equal(c.request('seated', 'x'), true);
  assert.equal(c.request('seated', 'x'), false);
  assert.equal(c.request('overview', 'x'), true);
  assert.equal(c.getMode(), 'overview');
  c.release('x');
  assert.equal(c.getMode(), 'thirdPerson');
  assert.equal(c.release('x'), false);
});

test('Esc chỉ thoát overview (escapable), không gỡ seated/inspect', () => {
  const c = createCameraModeController();
  c.request('seated', 's');
  assert.equal(c.canEscape(), false);
  assert.equal(c.escape(), false);
  assert.equal(c.getMode(), 'seated');
  c.request('overview', 'o');
  assert.equal(c.canEscape(), true);
  assert.equal(c.escape(), true);
  assert.equal(c.getMode(), 'seated', 'Esc về đúng chế độ trước');
  c.request('inspect', 'i');
  assert.equal(c.escape(), false);
  assert.equal(c.getMode(), 'inspect');
});

test('Esc không gỡ overview khi overview bị inspect che', () => {
  const c = createCameraModeController();
  c.request('overview', 'o');
  c.request('inspect', 'i');
  assert.equal(c.escape(), false);
  assert.equal(c.has('o'), true);
});

test('hợp đồng enter/exit: lưu khi rời, khôi phục khi vào lại', () => {
  const calls = [];
  let state = { yaw: 1, pitch: 0.5, dist: 7.5 };
  const c = createCameraModeController({
    exit: (from, to) => {
      calls.push(`exit:${from}->${to}`);
      return { ...state };
    },
    enter: (to, from, saved) => {
      calls.push(`enter:${to}<-${from}:${saved ? saved.dist : 'none'}`);
      if (saved) state = { ...saved };
    },
  });
  c.request('seated', 's');
  state = { yaw: 2, pitch: 0.3, dist: 2.8 }; // người chơi zoom khi ngồi
  c.release('s');
  assert.deepEqual(state, { yaw: 1, pitch: 0.5, dist: 7.5 });
  c.request('seated', 's');
  assert.equal(state.dist, 2.8, 'vào lại seated nhận trạng thái seated đã lưu');
  assert.deepEqual(calls, [
    'exit:thirdPerson->seated',
    'enter:seated<-thirdPerson:none',
    'exit:seated->thirdPerson',
    'enter:thirdPerson<-seated:7.5',
    'exit:thirdPerson->seated',
    'enter:seated<-thirdPerson:2.8',
  ]);
});

test('subscribe nhận lý do đổi chế độ, reset về thirdPerson', () => {
  const c = createCameraModeController();
  const seen = [];
  const off = c.subscribe((ch) => seen.push(`${ch.from}>${ch.to}:${ch.reason}`));
  c.setBase('firstPerson');
  c.request('overview', 'o');
  c.escape();
  c.reset();
  off();
  c.request('seated', 's');
  assert.deepEqual(seen, [
    'thirdPerson>firstPerson:base',
    'firstPerson>overview:request',
    'overview>firstPerson:escape',
    'firstPerson>thirdPerson:reset',
  ]);
  assert.equal(c.getPrevious(), 'thirdPerson');
});

test('policy: inspect không cho xoay/zoom; clampToPolicy giữ trong giới hạn', () => {
  assert.equal(MODE_POLICY.inspect.orbit, false);
  assert.equal(MODE_POLICY.inspect.zoom, false);
  assert.equal(MODE_POLICY.firstPerson.zoom, false);
  const r = clampToPolicy('seated', 3, 100);
  assert.equal(r.pitch, MODE_POLICY.seated.maxPitch);
  assert.equal(r.dist, MODE_POLICY.seated.maxDist);
  const t = clampToPolicy('thirdPerson', -1, 0);
  assert.equal(t.pitch, MODE_POLICY.thirdPerson.minPitch);
  assert.equal(t.dist, MODE_POLICY.thirdPerson.minDist);
});

test('comfort: mặc định rung thấp, theo prefers-reduced-motion, chặn giá trị hỏng', () => {
  assert.deepEqual(sanitizeComfort(null), { reduceMotion: false, shakeScale: DEFAULT_SHAKE_SCALE });
  assert.equal(sanitizeComfort(null, true).reduceMotion, true);
  assert.equal(sanitizeComfort({ reduceMotion: false }, true).reduceMotion, false, 'lựa chọn đã lưu thắng mặc định OS');
  assert.equal(sanitizeComfort({ shakeScale: 9 }).shakeScale, 1);
  assert.equal(sanitizeComfort({ shakeScale: -1 }).shakeScale, 0);
  assert.equal(sanitizeComfort({ shakeScale: Number.NaN }).shakeScale, DEFAULT_SHAKE_SCALE);
  assert.ok(DEFAULT_SHAKE_SCALE <= 0.3);
});

test('effectiveShake: tắt khi giảm chuyển động, nhân hệ số', () => {
  assert.equal(effectiveShake(1, { reduceMotion: true, shakeScale: 1 }), 0);
  assert.equal(effectiveShake(0.8, { reduceMotion: false, shakeScale: 0.5 }), 0.4);
  assert.equal(effectiveShake(-1, { reduceMotion: false, shakeScale: 1 }), 0);
});

test('comfort store đọc/ghi storage, JSON hỏng thì về mặc định', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const s = createComfortStore(storage);
  let n = 0;
  s.subscribe(() => n++);
  s.update({ reduceMotion: true, shakeScale: 0.1 });
  assert.equal(n, 1);
  assert.deepEqual(JSON.parse(mem.get(COMFORT_STORAGE_KEY)), { reduceMotion: true, shakeScale: 0.1 });
  assert.deepEqual(createComfortStore(storage).get(), { reduceMotion: true, shakeScale: 0.1 });
  mem.set(COMFORT_STORAGE_KEY, '{hỏng');
  assert.deepEqual(createComfortStore(storage).get(), { reduceMotion: false, shakeScale: DEFAULT_SHAKE_SCALE });
  const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const t = createComfortStore(throwing);
  assert.equal(t.update({ reduceMotion: true }).reduceMotion, true);
});
