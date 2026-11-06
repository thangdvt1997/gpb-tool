# Đo hiệu năng trên máy thật (Task 08)

Phần này cần trình duyệt có GPU. Repo này chưa có số đo nào; mọi con số draw call trong docs (~208, trần 200) là ước tính.
Script tĩnh `node scripts/perf/static-census.mjs` chỉ đếm vị trí mã nguồn, không thay cho phép đo này.
Không đổi trần draw call hay tối ưu cảnh dựa trên tài liệu này: quyết định đó nằm ở `docs/design/PENDING_DECISIONS.md` mục 3.

## Chuẩn bị

1. `npm run build && npm run preview` (hoặc `npm run dev`; dev có thêm chi phí HMR, ưu tiên bản build).
2. Mở bằng Chrome, thoát DevTools khi đo FPS (DevTools làm lệch), tắt extension.
3. Ghi lại: GPU/CPU, độ phân giải, `devicePixelRatio`, mức chất lượng (Thấp/Trung/Cao), số người chơi trong phòng, vị trí camera.

## Snippet đo (dán vào Console)

Cần lấy `renderer` của R3F. Cách đơn giản không sửa mã: chặn `getContext` trước khi app khởi tạo, hoặc tạm thời gắn
`window.__gl = gl` trong một component thử (không commit). Sau khi có `window.__gl`:

```js
(async () => {
  const gl = window.__gl;                       // THREE.WebGLRenderer
  const secs = 10, samples = [];
  let last = performance.now(), end = last + secs * 1000;
  await new Promise((done) => {
    const tick = (t) => { samples.push(t - last); last = t; t < end ? requestAnimationFrame(tick) : done(); };
    requestAnimationFrame(tick);
  });
  samples.shift();
  const s = [...samples].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const i = gl.info;
  console.table({
    frames: samples.length, avgMs: +avg.toFixed(2), fps: +(1000 / avg).toFixed(1),
    p50Ms: +q(0.5).toFixed(2), p95Ms: +q(0.95).toFixed(2), p99Ms: +q(0.99).toFixed(2), maxMs: +s.at(-1).toFixed(2),
    over33ms: samples.filter((x) => x > 33.4).length,
    drawCalls: i.render.calls, triangles: i.render.triangles, points: i.render.points, lines: i.render.lines,
    geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length,
  });
})();
```

Lưu ý: `info.render.calls` mặc định reset mỗi khung (`autoReset`), nên giá trị là của khung cuối, gồm cả pass đổ bóng
và pass hậu kỳ nếu có. Ghi rõ đó là tổng gồm đổ bóng hay chỉ pass chính (so sánh bằng cách tắt đổ bóng ở mức Thấp).

## Kịch bản (mỗi kịch bản chạy 3 lần, lấy lần giữa)

| # | Kịch bản | Ghi |
|---|---|---|
| 1 | Đứng yên ở spawn, nhìn dọc sàn | nền |
| 2 | Đi vòng sàn chữ L 60 giây | đo trung bình khi di chuyển |
| 3 | Nhìn vào khu bàn đông (11 desk) | cảnh nặng nhất dự kiến |
| 4 | 1, 5, 20, 40 avatar cùng phòng (nếu có) | đo tăng drawCalls/triangles theo avatar |
| 5 | Mỗi mức chất lượng Thấp/Trung/Cao | đối chiếu trần theo mức |

## Mẫu ghi kết quả

| Máy | Mức | Kịch bản | fps | p95 ms | drawCalls | triangles | geometries | textures |
|---|---|---|---|---|---|---|---|---|
| (điền) | | | | | | | | |

## Đo bằng module có sẵn (src/perf) — thay cho snippet Console

Sau khi dòng mount (xem `docs/design/PERFORMANCE.md`) được thêm vào App, không cần `window.__gl`:

- `?perf=1` (hoặc phím F3) hiện HUD: FPS, p50/p95/p99, khung giật > 50 ms, draw call/tam giác/geometry/texture/program, heap JS (chỉ Chromium).
- `?bench=1&benchSec=30` chạy camera theo đường cố định, xong thì tải `bench-<time>.json` và in `[perf] bench` ra console.
  Đường mặc định (`DEFAULT_BENCH_PATH` trong `src/perf/bench.ts`) dùng TỌA ĐỘ GIẢ ĐỊNH: phải chỉnh theo cảnh thật trước khi đo
  (toàn cảnh, hành lang bàn, cận nhân vật, phòng thay đồ) rồi truyền qua prop `benchPath`.
- Mỗi lần đo ghi tay: máy/GPU, trình duyệt, viewport, DPR, mức chất lượng, số avatar, cache (lạnh/nóng) vào bảng "Mẫu ghi kết quả".
  JSON chỉ tự ghi userAgent/viewport/DPR.
- Số khung là thời gian tường đồng hồ theo rAF (CPU+compositor), KHÔNG phải thời gian GPU. `textureMB` là ước lượng w*h*4(*4/3), không phải bộ nhớ GPU.
- Rò rỉ: gọi `createLeakCounter().record({geometries, textures})` sau mỗi lần đổi cảnh/trang phục (>= 20 vòng), rồi `report()`:
  `bounded-growth` = cache có giới hạn, `suspect-leak` = tăng đều ở nửa sau.
- Chạy mỗi kịch bản 3 lần, lấy lần giữa; so trước/sau cùng điều kiện.

Trạng thái: các hàm thống kê có test (`npx vitest run src/perf`); phần chạy trong trình duyệt/GPU CHƯA kiểm chứng.

## Chưa kiểm chứng

Chưa có số đo nào trong repo. Đối chiếu với trần 200 draw call (DECISIONS mục 11) chỉ làm được sau khi điền bảng trên.
