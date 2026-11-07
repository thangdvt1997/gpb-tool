// Chạy: node --test scripts/assets/measure-sockets.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { measureSockets, inverseRotationDeg } from './measure-sockets.mjs';

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

test('neck, foot_l, foot_r đã đo và calibrated=true; mọi socket nhân vật có rotationDeg khớp số đo', () => {
  for (const a of chars) {
    const m = measureSockets(path.join(models, a.url));
    for (const n of ['hand_l', 'hand_r', 'head', 'back', 'neck', 'foot_l', 'foot_r']) {
      const s = a.sockets.find((x) => x.name === n);
      assert.equal(s.calibrated, true, `${a.assetId} ${n}`);
      s.offset.forEach((v, i) => assert.ok(Math.abs(v - m[n].offset[i]) < 1e-4, `${a.assetId} ${n} offset[${i}]`));
      assert.equal(s.rotationDeg.length, 3, `${a.assetId} ${n} rotationDeg`);
      s.rotationDeg.forEach((v, i) => assert.ok(Math.abs(v - m[n].rotationDeg[i]) < 0.01, `${a.assetId} ${n} rotationDeg[${i}]`));
    }
    assert.ok(m.neck.offset[1] > 0.005 && m.neck.offset[1] < 0.1, 'giữa cổ nằm trên xương neck_01');
    assert.ok(m.foot_l.offset.every(Number.isFinite) && m.foot_r.offset.every(Number.isFinite));
    assert.ok(Math.abs(m.foot_l.offset[0] + m.foot_r.offset[0]) < 0.01, 'chân trái/phải đối xứng');
  }
});

test('inverseRotationDeg: xoay xương rồi áp rotationDeg cho ra xoay đơn vị (đối chiếu three.js)', () => {
  for (const [ex, ey, ez] of [[0.3, -1.1, 2.0], [-2.5, 0.4, 0.9], [1.2, 0.2, -0.7]]) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(ex, ey, ez, 'XYZ'));
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
    m.setPosition(0.1, 0.2, 0.3);
    const deg = inverseRotationDeg(m.elements);
    const local = new THREE.Quaternion().setFromEuler(new THREE.Euler(...deg.map((d) => (d * Math.PI) / 180), 'XYZ'));
    const id = q.clone().multiply(local);
    assert.ok(Math.abs(Math.abs(id.w) - 1) < 1e-4, `w=${id.w}`);
  }
});
