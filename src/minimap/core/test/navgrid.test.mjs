// Test A* và tuyến đường trên lưới tổng hợp (không dùng dữ liệu thật). Chạy: node --test "src/minimap/core/test/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  astar,
  buildNavGrid,
  cellIndexAt,
  distPointRect,
  findRoute,
  pointInRects,
  routeProgress,
  circleCovered,
  isPointClear,
  segmentClear,
} from '../index.js';

const R = 0.35;

/** Kiểm tra độc lập: mọi điểm lấy mẫu dọc tuyến (bước 2 cm) có clearance >= R với vật cản và nằm trong vùng đi lại. */
function assertRouteClear(points, walkRects, obstacles, label = '') {
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.02));
    for (let s = 0; s <= n; s++) {
      const x = a.x + ((b.x - a.x) * s) / n;
      const z = a.z + ((b.z - a.z) * s) / n;
      for (const o of obstacles) {
        const d = distPointRect(x, z, o);
        assert.ok(d >= R - 1e-3, `${label} điểm (${x.toFixed(2)}, ${z.toFixed(2)}) cách vật cản ${d.toFixed(3)} < ${R}`);
      }
      assert.ok(circleCovered(x, z, R - 1e-3, walkRects), `${label} điểm (${x.toFixed(2)}, ${z.toFixed(2)}) ra ngoài vùng đi lại`);
    }
  }
}

// Hai phòng 10 x 10 m ngăn bởi tường x 4.8–5.2, cửa ở z 4–5.2 (rộng 1,2 m).
const ROOM = [{ minX: 0, maxX: 10, minZ: 0, maxZ: 10 }];
const wallWithDoor = (z0, z1) => [
  { minX: 4.8, maxX: 5.2, minZ: 0, maxZ: z0 },
  { minX: 4.8, maxX: 5.2, minZ: z1, maxZ: 10 },
];

test('đường vòng qua cửa: tuyến đi qua khe cửa, không xuyên tường', () => {
  const obstacles = wallWithDoor(4, 5.2);
  const grid = buildNavGrid({ walkRects: ROOM, obstacles, radius: R, cellSize: 0.2 });
  const res = findRoute(grid, { x: 2, z: 1 }, { x: 8, z: 1 });
  assert.equal(res.status, 'ok');
  assert.deepEqual(res.points[0], { x: 2, z: 1 });
  assert.deepEqual(res.points[res.points.length - 1], { x: 8, z: 1 });
  assert.equal(res.goalSnapped, false);
  // Phải có đoạn cắt mặt phẳng x = 5 trong khe cửa.
  let crossed = false;
  for (let k = 1; k < res.points.length; k++) {
    const a = res.points[k - 1];
    const b = res.points[k];
    if ((a.x - 5) * (b.x - 5) <= 0 && a.x !== b.x) {
      const z = a.z + ((b.z - a.z) * (5 - a.x)) / (b.x - a.x);
      assert.ok(z >= 4 + R - 1e-3 && z <= 5.2 - R + 1e-3, `cắt tường tại z ${z}`);
      crossed = true;
    }
  }
  assert.ok(crossed, 'tuyến không đi qua cửa');
  // Vòng lên cửa rồi xuống: dài hơn đường thẳng 6 m, ngắn hơn 2 × đường chéo tới cửa + lề.
  assert.ok(res.length > 6.5 && res.length < 2 * Math.hypot(3, 3.6) + 0.5, `độ dài ${res.length}`);
  assertRouteClear(res.points, ROOM, obstacles, 'cửa');
  const prog = routeProgress(res.points, 2, 1);
  assert.ok(Math.abs(prog.remaining - res.length) < 1e-9);
  assert.ok(prog.offRoute < 1e-9);
});

test('cửa hẹp hơn đường kính nhân vật (0,6 m < 0,7 m): không có đường', () => {
  const grid = buildNavGrid({ walkRects: ROOM, obstacles: wallWithDoor(4.4, 5.0), radius: R, cellSize: 0.2 });
  const res = findRoute(grid, { x: 2, z: 1 }, { x: 8, z: 1 });
  assert.equal(res.status, 'unreachable');
  assert.equal(res.points.length, 0);
  // A* trực tiếp cũng trả null.
  assert.equal(astar(grid, cellIndexAt(grid, 2, 1), cellIndexAt(grid, 8, 1)), null);
});

test('chặn cửa bằng đồ di chuyển được: báo không tới; dời đồ đi thì có tuyến lại', () => {
  const base = wallWithDoor(4, 5.2);
  const movedHere = { minX: 4.6, maxX: 5.6, minZ: 3.9, maxZ: 5.3 }; // vd service_desk bị kéo vào cửa
  const blocked = buildNavGrid({ walkRects: ROOM, obstacles: [...base, movedHere], radius: R });
  assert.equal(findRoute(blocked, { x: 2, z: 1 }, { x: 8, z: 1 }).status, 'unreachable');
  const freed = buildNavGrid({ walkRects: ROOM, obstacles: [...base, { minX: 1, maxX: 2, minZ: 8, maxZ: 9 }], radius: R });
  const res = findRoute(freed, { x: 2, z: 1 }, { x: 8, z: 1 });
  assert.equal(res.status, 'ok');
});

test('đích nằm trong vật cản (bàn): dừng ở ô đi được sát bàn, không xuyên bàn', () => {
  const desk = { minX: 6, maxX: 8, minZ: 6, maxZ: 8 };
  const obstacles = [desk];
  const grid = buildNavGrid({ walkRects: ROOM, obstacles, radius: R });
  const res = findRoute(grid, { x: 1, z: 1 }, { x: 7, z: 7, rect: desk });
  assert.equal(res.status, 'ok');
  assert.equal(res.goalSnapped, true);
  const d = distPointRect(res.goal.x, res.goal.z, desk);
  assert.ok(d >= R - 1e-9 && d <= R + 2 * grid.cellSize + 1e-9, `cách bàn ${d}`);
  assertRouteClear(res.points, ROOM, obstacles, 'bàn');
  // Không có rect: tâm bàn cách ô đi được gần nhất ~1,45–1,6 m. goalSnap 1 m: goal_blocked; 2 m: bắt về mép bàn.
  assert.equal(findRoute(grid, { x: 1, z: 1 }, { x: 7, z: 7 }, { goalSnap: 1 }).status, 'goal_blocked');
  const res2 = findRoute(grid, { x: 1, z: 1 }, { x: 7, z: 7 }, { goalSnap: 2 });
  assert.equal(res2.status, 'ok');
  assert.equal(res2.goalSnapped, true);
});

test('đích sâu trong vật cản lớn, hoặc ngoài vùng đi lại: goal_blocked', () => {
  const big = { minX: 3, maxX: 10, minZ: 3, maxZ: 10 };
  const grid = buildNavGrid({ walkRects: ROOM, obstacles: [big], radius: R });
  assert.equal(findRoute(grid, { x: 1, z: 1 }, { x: 7, z: 7 }).status, 'goal_blocked');
  // Ngoài sàn hẳn.
  const g2 = buildNavGrid({ walkRects: ROOM, obstacles: [], radius: R });
  assert.equal(findRoute(g2, { x: 1, z: 1 }, { x: 30, z: 30 }).status, 'goal_blocked');
});

test('chữ L tổng hợp: tuyến vòng qua góc trong, không cắt qua khu ngoài L', () => {
  // L: nhánh dọc x 0–4, z 0–10; nhánh ngang x 4–12, z 6–10. Khu x 4–12, z 0–6 ngoài L.
  const L = [
    { minX: 0, maxX: 4, minZ: 0, maxZ: 10 },
    { minX: 4, maxX: 12, minZ: 6, maxZ: 10 },
  ];
  const grid = buildNavGrid({ walkRects: L, obstacles: [], radius: R });
  const res = findRoute(grid, { x: 2, z: 1 }, { x: 11, z: 7 });
  assert.equal(res.status, 'ok');
  assert.ok(res.points.length >= 3, 'phải bẻ góc');
  assertRouteClear(res.points, L, [], 'L');
  for (const p of res.points) assert.ok(pointInRects(p.x, p.z, L));
  // Đích ở khu ngoài L: không tới.
  assert.equal(findRoute(grid, { x: 2, z: 1 }, { x: 9, z: 2 }).status, 'goal_blocked');
});

test('đứng sát góc tường: vẫn tìm được tuyến; quá sát thì bắt về ô gần nhất', () => {
  const grid = buildNavGrid({ walkRects: ROOM, obstacles: wallWithDoor(4, 5.2), radius: R });
  const corner = findRoute(grid, { x: R, z: R }, { x: 8, z: 9 });
  assert.equal(corner.status, 'ok');
  assert.equal(corner.startSnapped, false);
  const tight = findRoute(grid, { x: 0.1, z: 0.1 }, { x: 8, z: 9 });
  assert.equal(tight.status, 'ok');
  assert.equal(tight.startSnapped, true);
  // Kẹt hẳn trong tường dày: start_blocked.
  const g2 = buildNavGrid({ walkRects: ROOM, obstacles: [{ minX: 0, maxX: 6, minZ: 0, maxZ: 6 }], radius: R });
  assert.equal(findRoute(g2, { x: 2, z: 2 }, { x: 8, z: 9 }).status, 'start_blocked');
});

test('A* không cắt góc vật cản khi đi chéo', () => {
  const grid = buildNavGrid({ walkRects: ROOM, obstacles: [], radius: 0, cellSize: 1 });
  // Chặn ô (1,0) và (0,1): từ (0,0) không được đi chéo sang (1,1).
  grid.walk[cellIndexAt(grid, 1.5, 0.5)] = 0;
  grid.walk[cellIndexAt(grid, 0.5, 1.5)] = 0;
  assert.equal(astar(grid, cellIndexAt(grid, 0.5, 0.5), cellIndexAt(grid, 1.5, 1.5)), null);
  // Mở một ô: đi được qua ô đó, 2 bước thẳng.
  grid.walk[cellIndexAt(grid, 1.5, 0.5)] = 1;
  const p = astar(grid, cellIndexAt(grid, 0.5, 0.5), cellIndexAt(grid, 1.5, 1.5));
  assert.equal(p.length, 3);
});

// Khe đúng 0,7 m = 2 x PLAYER_RADIUS: vòng tròn bán kính 0,35 lọt đúng vào giữa (Player dùng so sánh ngặt
// nên đi được trên đường tâm). Khe lệch ô lưới (0,2 m) nên cần ô neo.
for (const [z0, z1, tên] of [
  [4.4, 5.1, 'khe trùng tâm ô lưới'],
  [4.63, 5.33, 'khe lệch ô lưới'],
  [4.37, 5.07, 'khe lệch ô lưới (2)'],
]) {
  test(`cửa đúng 0,7 m đi được (${tên})`, () => {
    const obstacles = wallWithDoor(z0, z1);
    assert.ok(Math.abs(z1 - z0 - 0.7) < 1e-9);
    const grid = buildNavGrid({ walkRects: ROOM, obstacles, radius: R, cellSize: 0.2 });
    const res = findRoute(grid, { x: 2, z: 1 }, { x: 8, z: 1 });
    assert.equal(res.status, 'ok');
    assertRouteClear(res.points, ROOM, obstacles, tên);
    // Tuyến phải đi qua mặt phẳng x = 5 đúng đường tâm khe.
    const mid = (z0 + z1) / 2;
    let crossZ = null;
    for (let k = 1; k < res.points.length; k++) {
      const a = res.points[k - 1];
      const b = res.points[k];
      if ((a.x - 5) * (b.x - 5) <= 0 && a.x !== b.x) crossZ = a.z + ((b.z - a.z) * (5 - a.x)) / (b.x - a.x);
    }
    assert.ok(crossZ !== null && Math.abs(crossZ - mid) < 1e-3, `cắt x=5 tại z=${crossZ}, tâm khe ${mid}`);
  });
}

test('khe 0,69 m vẫn không đi được (chỉ dung sai số học, không nới clearance)', () => {
  const grid = buildNavGrid({ walkRects: ROOM, obstacles: wallWithDoor(4.4, 5.09), radius: R, cellSize: 0.2 });
  assert.equal(findRoute(grid, { x: 2, z: 1 }, { x: 8, z: 1 }).status, 'unreachable');
});

test('kiểm tra tròn: góc vật cản cách đúng R theo đường chéo thì đi được, hình vuông thì không', () => {
  const o = { minX: 4, maxX: 6, minZ: 4, maxZ: 6 };
  const grid = buildNavGrid({ walkRects: ROOM, obstacles: [o], radius: R, cellSize: 0.2 });
  const d = R / Math.SQRT2; // cách góc đúng R theo đường chéo (ngoài hình vuông nới R)
  assert.equal(isPointClear(grid, 4 - d, 4 - d), true);
  assert.equal(isPointClear(grid, 4 - d + 0.01, 4 - d + 0.01), false);
  assert.equal(segmentClear(grid, { x: 3.2, z: 4 - d - 0.4 }, { x: 4 - d - 0.4, z: 3.2 }), true);
});
