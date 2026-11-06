// Chạy: node --test src/photo/photo.test.mjs (Node >= 22.6, tự bỏ kiểu TypeScript). Chỉ test phần thuần.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aspectRatio, computeCropRect, computeOutputSize, gridLines, focalToFov, fovToFocal, clampFov, isBlankPixels,
} from './framing.ts';
import { buildPhotoFileName, buildPhotoMetadata } from './filename.ts';
import { computeFollowPose, stepFreeCamera } from './cameraModes.ts';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('tỷ lệ cố định và viewport', () => {
  near(aspectRatio('16:9', 0, 0), 16 / 9);
  near(aspectRatio('viewport', 1000, 500), 2);
  assert.ok(Number.isNaN(aspectRatio('viewport', 0, 500)));
});

test('crop 16:9 từ 1000x1000 và 1:1 từ 1920x1080', () => {
  assert.deepEqual(computeCropRect(1000, 1000, 16 / 9), { x: 0, y: 218, w: 1000, h: 563 });
  assert.deepEqual(computeCropRect(1920, 1080, 1), { x: 420, y: 0, w: 1080, h: 1080 });
  assert.equal(computeCropRect(0, 100, 1), null);
  assert.equal(computeCropRect(100, 100, 0), null);
});

test('crop không vượt nguồn, đúng tỷ lệ trong sai số 1px', () => {
  for (const r of [1, 4 / 3, 3 / 2, 16 / 9, 9 / 16, 4 / 5]) {
    for (const [w, h] of [[1920, 1080], [390, 844], [7, 5], [1, 1]]) {
      const c = computeCropRect(w, h, r);
      assert.ok(c.w >= 1 && c.h >= 1 && c.x >= 0 && c.y >= 0 && c.x + c.w <= w && c.y + c.h <= h);
      if (c.w > 20 && c.h > 20) assert.ok(Math.abs(c.w / c.h - r) < 0.05, `${w}x${h} r=${r}`);
    }
  }
});

test('kích thước ra: đủ, bị chặn texture, bị chặn pixel, bị chặn nguồn', () => {
  const lim = { maxTexture: 8192, maxPixels: 16_000_000 };
  assert.deepEqual(computeOutputSize(16 / 9, 1920, lim), { width: 1920, height: 1080, reduced: false, reason: 'none' });
  assert.deepEqual(computeOutputSize(9 / 16, 1920, lim), { width: 1080, height: 1920, reduced: false, reason: 'none' });
  const t = computeOutputSize(1, 4096, { maxTexture: 2048, maxPixels: 1e9 });
  assert.deepEqual([t.width, t.height, t.reason], [2048, 2048, 'texture']);
  const p = computeOutputSize(1, 3840, { maxTexture: 8192, maxPixels: 4_000_000 });
  assert.equal(p.reason, 'pixels');
  assert.ok(p.width * p.height <= 4_000_000 && p.width >= 1900);
  const s = computeOutputSize(16 / 9, 3840, { ...lim, maxLongEdge: 1280 });
  assert.deepEqual([s.width, s.height, s.reason], [1280, 720, 'source']);
  assert.equal(computeOutputSize(0, 100, lim), null);
  assert.equal(computeOutputSize(1, 0, lim), null);
});

test('lưới bố cục', () => {
  assert.equal(gridLines('none').length, 0);
  assert.equal(gridLines('thirds').length, 4);
  near(gridLines('golden')[0].x1, 0.381966, 1e-5);
  assert.equal(gridLines('center').length, 2);
});

test('tiêu cự <-> FOV', () => {
  near(focalToFov(24), 53.130102, 1e-4);
  near(fovToFocal(focalToFov(50)), 50, 1e-9);
  assert.ok(Number.isNaN(focalToFov(0)));
  assert.equal(clampFov(5), 20);
  assert.equal(clampFov(500), 100);
  assert.equal(clampFov(Number.NaN), 20);
});

test('phát hiện ảnh trống', () => {
  assert.equal(isBlankPixels(new Uint8Array(4 * 100)), true);
  const black = new Uint8Array(4 * 100);
  for (let i = 0; i < 100; i++) black[i * 4 + 3] = 255;
  assert.equal(isBlankPixels(black), true);
  black[4 * 50] = 10;
  assert.equal(isBlankPixels(black, 100), false);
  assert.equal(isBlankPixels(new Uint8Array(0)), true);
});

test('tên file', () => {
  const d = new Date(2026, 10, 6, 9, 5, 3);
  assert.equal(buildPhotoFileName({ mode: 'follow', width: 1920, height: 1080, format: 'png', date: d }), 'gpb-photo-follow-20261106-090503-1920x1080.png');
  assert.equal(buildPhotoFileName({ mode: 'free', width: 1080, height: 1080, format: 'jpeg', date: d, seq: 2 }), 'gpb-photo-free-20261106-090503-1080x1080-2.jpg');
  // đầu vào xấu không tạo ký tự lạ
  const bad = buildPhotoFileName({ mode: '../../x', width: -5, height: 3.9, format: 'png', date: new Date(Number.NaN) });
  assert.match(bad, /^gpb-photo-free-[0-9-]+-0x3\.png$/);
  assert.doesNotMatch(bad, /[\\/:*?"<>|\s]/);
});

test('metadata chỉ có trường cơ bản', () => {
  const d = new Date(Date.UTC(2026, 10, 6, 1, 2, 3));
  const m = buildPhotoMetadata({ date: d, mode: 'fixed', width: 800.7, height: 600, format: 'jpeg', aspect: '4:3', hudHidden: true });
  assert.deepEqual(m, { capturedAt: '2026-11-06T01:02:03.000Z', cameraMode: 'fixed', width: 800, height: 600, format: 'jpeg', aspect: '4:3', hudHidden: true });
  assert.deepEqual(Object.keys(m).sort(), ['aspect', 'cameraMode', 'capturedAt', 'format', 'height', 'hudHidden', 'width']);
});

test('camera theo nhân vật: sau lưng, không đổi đầu vào', () => {
  const player = { x: 2, z: 3, yaw: Math.PI };
  const before = { ...player };
  const p = computeFollowPose(player, { dist: 4, pitch: 0, azimuthOffset: 0, targetHeight: 1.5 });
  // yaw = PI nhìn -z, camera ở +z phía sau
  near(p.position.x, 2);
  near(p.position.z, 7);
  near(p.position.y, 1.5);
  assert.deepEqual(player, before);
  const front = computeFollowPose(player, { dist: 4, pitch: 0, azimuthOffset: Math.PI, targetHeight: 1.5 });
  near(front.position.z, -1);
  const clamped = computeFollowPose(player, { dist: 999, pitch: 9, azimuthOffset: 0, targetHeight: 1.5 });
  assert.ok(Math.hypot(clamped.position.x - 2, clamped.position.y - 1.5, clamped.position.z - 3) <= 12 + 1e-9);
});

test('camera tự do bị kẹp vùng và đúng chiều phải', () => {
  const b = { minX: -5, maxX: 5, minY: 0.5, maxY: 3, minZ: -5, maxZ: 5 };
  const r = stepFreeCamera({ x: 0, y: 1, z: 0 }, Math.PI, { forward: 0, right: 1, up: 0 }, b);
  near(r.x, 1);
  near(r.z, 0);
  const f = stepFreeCamera({ x: 0, y: 1, z: 0 }, Math.PI, { forward: 2, right: 0, up: 0 }, b);
  near(f.z, -2);
  assert.deepEqual(stepFreeCamera({ x: 4.9, y: 2.9, z: 0 }, 0, { forward: 0, right: 99, up: 99 }, b), { x: -5, y: 3, z: 0 });
});
