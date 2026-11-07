// Chạy: node --test scripts/assets/measure-sockets.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureSockets } from './measure-sockets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const models = path.join(root, 'public', 'models');
const manifest = JSON.parse(fs.readFileSync(path.join(models, 'manifest.json'), 'utf8'));
const chars = manifest.assets.filter((a) => a.type === 'character');

test('có 3 nhân vật MPFB', () => assert.equal(chars.length, 3));

for (const a of chars) {
  test(`${a.assetId}: socket tay/đầu/lưng khớp số đo từ GLB và đã calibrated`, () => {
    const m = measureSockets(path.join(models, a.url));
    for (const name of ['hand_l', 'hand_r', 'head', 'back']) {
      const s = a.sockets.find((x) => x.name === name);
      assert.equal(s.calibrated, true, name);
      assert.equal(s.bone, m[name].bone);
      s.offset.forEach((v, i) => assert.ok(Math.abs(v - m[name].offset[i]) < 1e-4, `${name}[${i}] ${v} vs ${m[name].offset[i]}`));
    }
  });
  test(`${a.assetId}: số đo hợp lý về hình học`, () => {
    const m = measureSockets(path.join(models, a.url));
    assert.ok(m.hand_l.offset[1] > 0.02 && m.hand_l.offset[1] < 0.12, 'lòng bàn tay cách cổ tay 2-12 cm dọc trục xương');
    assert.ok(Math.abs(m.hand_l.offset[0] + m.hand_r.offset[0]) < 0.01, 'tay trái/phải đối xứng');
    assert.ok(m.head.offset[1] > 0.1 && m.head.offset[1] < 0.25, 'đỉnh đầu cao hơn xương head 10-25 cm');
    assert.ok(m.back.offset[2] < -0.02, 'lưng nằm sau xương spine_03 (hướng -Z)');
  });
}

test('neck/foot chưa đo thì vẫn calibrated=false (không khai man)', () => {
  for (const a of chars) for (const n of ['neck', 'foot_l', 'foot_r']) assert.equal(a.sockets.find((s) => s.name === n).calibrated, false);
});
