// Test chuyển đổi tọa độ world <-> map. Chạy: node --test "src/minimap/core/test/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMapTransform,
  createViewTransform,
  headingAngle,
  iconAngle,
  mapRotation,
  northAngle,
  polygonBounds,
  wrapAngle,
} from '../index.js';
import { real } from './realData.mjs';

const close = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, msg ?? `${a} != ${b}`);

test('bounds lấy từ đa giác chữ L thật: x -29..16.1, z -15..15', () => {
  const b = polygonBounds(real.polygon);
  close(b.minX, -29);
  close(b.maxX, 16.1);
  close(b.minZ, -15);
  close(b.maxZ, 15);
});

test('bản đồ Bắc cố định: điểm chuẩn từ bản vẽ khớp pixel, đổi ngược khớp world', () => {
  const b = polygonBounds(real.polygon);
  // 45,1 x 30 m vào khung 451 x 300 px: 10 px/m, không dư.
  const t = createMapTransform({ bounds: b, width: 451, height: 300 });
  close(t.scale, 10);
  const { toWorldX, toWorldZ } = real.layout;
  // [x bản vẽ, y bản vẽ, u px, v px]
  const cases = [
    [0, 0, 0, 0], // góc Tây-Bắc tòa nhà (đỉnh 1 của L)
    [45.1, 30, 451, 300], // góc Đông-Nam của L (đỉnh 11)
    [14.5, 15.2, 145, 152], // góc trong của L (đỉnh 3)
    [35.9, 8.1, 359, 81], // đỉnh 8, khu an ninh
    [25, 18, 250, 180], // SPAWN (src/scene/layout.ts)
    [20.2, 13.4, 202, 134], // ENTRY_DROP (src/scene/entry/placement.ts)
  ];
  for (const [px, py, u, v] of cases) {
    const p = t.worldToMap(toWorldX(px), toWorldZ(py));
    close(p.u, u, 1e-9, `u tại (${px}, ${py}): ${p.u}`);
    close(p.v, v, 1e-9, `v tại (${px}, ${py}): ${p.v}`);
    const w = t.mapToWorld(u, v);
    close(w.x, toWorldX(px), 1e-9);
    close(w.z, toWorldZ(py), 1e-9);
  }
  // SPAWN và ENTRY_DROP thật của dự án.
  const s = t.worldToMap(real.layout.SPAWN.x, real.layout.SPAWN.z);
  close(s.u, 250);
  close(s.v, 180);
  const d = t.worldToMap(real.entry.ENTRY_DROP.x, real.entry.ENTRY_DROP.z);
  close(d.u, 202, 1e-9);
  close(d.v, 134, 1e-9);
});

test('bản đồ Bắc cố định: khung khác tỷ lệ thì giữ 1:1 và căn giữa, có lề', () => {
  const b = polygonBounds(real.polygon);
  const t = createMapTransform({ bounds: b, width: 600, height: 340, padding: 20 });
  // Khả dụng 560 x 300 => scale = min(560/45.1, 300/30) = 10; dư ngang (560 - 451)/2 = 54.5.
  close(t.scale, 10);
  const nw = t.worldToMap(b.minX, b.minZ);
  close(nw.u, 20 + 54.5);
  close(nw.v, 20);
  const se = t.worldToMap(b.maxX, b.maxZ);
  close(se.u, 600 - 20 - 54.5);
  close(se.v, 320);
  // Đổi ngược tại nhiều điểm.
  for (const [x, z] of [[-29, -15], [-4, 3], [6.9, 0], [16.1, 15], [-14.5, 0.2]]) {
    const p = t.worldToMap(x, z);
    const w = t.mapToWorld(p.u, p.v);
    close(w.x, x, 1e-9);
    close(w.z, z, 1e-9);
  }
  assert.throws(() => createMapTransform({ bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 1 }, width: 10, height: 10 }));
});

test('hướng icon theo quy ước playerPose: yaw π nhìn Bắc (lên), π/2 nhìn Đông (phải)', () => {
  close(headingAngle(Math.PI), 0); // Bắc
  close(headingAngle(Math.PI / 2), Math.PI / 2); // Đông, (sin, cos) = (1, 0)
  close(Math.abs(headingAngle(0)), Math.PI); // Nam
  close(headingAngle(-Math.PI / 2), -Math.PI / 2); // Tây
  close(wrapAngle(3 * Math.PI), Math.PI);
  close(wrapAngle(-Math.PI), Math.PI);
});

test('hai chế độ: Bắc cố định xoay icon, xoay theo người thì icon luôn lên và mũi tên Bắc xoay', () => {
  for (const yaw of [0, 0.3, Math.PI / 2, Math.PI, -2.1, 5]) {
    close(iconAngle('north', yaw), headingAngle(yaw), 1e-9);
    close(northAngle('north', yaw), 0);
    close(iconAngle('heading', yaw), 0, 1e-9);
    close(wrapAngle(northAngle('heading', yaw) + headingAngle(yaw)), 0, 1e-9);
  }
});

test('khung nhìn quanh nhân vật: điểm phía trước luôn ở phía trên tâm trong chế độ xoay theo người', () => {
  const W = 200;
  const H = 200;
  const S = 10;
  for (const yaw of [Math.PI, Math.PI / 2, 0, -Math.PI / 2, 2.4]) {
    const p = { x: -4, z: 3 };
    const v = createViewTransform({ center: p, scale: S, width: W, height: H, rotation: mapRotation('heading', yaw) });
    const c = v.worldToMap(p.x, p.z);
    close(c.u, 100);
    close(c.v, 100);
    // 2 m phía trước theo hướng (sin yaw, cos yaw).
    const f = v.worldToMap(p.x + 2 * Math.sin(yaw), p.z + 2 * Math.cos(yaw));
    close(f.u, 100, 1e-9, `yaw ${yaw}: u ${f.u}`);
    close(f.v, 80, 1e-9, `yaw ${yaw}: v ${f.v}`);
    // Đổi ngược.
    const w = v.mapToWorld(137, 41);
    const back = v.worldToMap(w.x, w.z);
    close(back.u, 137, 1e-9);
    close(back.v, 41, 1e-9);
  }
  // Nhìn Đông (yaw π/2): điểm 1 m phía Bắc nằm bên trái.
  const v = createViewTransform({ center: { x: 0, z: 0 }, scale: S, width: W, height: H, rotation: mapRotation('heading', Math.PI / 2) });
  const n = v.worldToMap(0, -1);
  close(n.u, 90, 1e-9);
  close(n.v, 100, 1e-9);
  // Chế độ Bắc cố định: 1 m phía Bắc nằm phía trên.
  const vn = createViewTransform({ center: { x: 0, z: 0 }, scale: S, width: W, height: H, rotation: mapRotation('north', 1) });
  const n2 = vn.worldToMap(0, -1);
  close(n2.u, 100);
  close(n2.v, 90);
});
