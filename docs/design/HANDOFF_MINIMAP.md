# Bàn giao TASK 09: minimap, tìm phòng, chỉ đường (2026-11-06)

## Trạng thái

- Phần logic thuần (`src/minimap/core/*.js`) đã viết xong và có test. 23/23 test đạt.
- Phần giao diện (`Minimap.tsx`, `draw.ts`, `useNavigation.ts`, `sources.ts`, `minimap.css`) đã viết đủ file, không có file nào viết dở. **Chưa** chạy `tsc`, chưa build, chưa mở trong trình duyệt (ràng buộc: không chạy npm/tsc/vite trên máy cục bộ).
- **Chưa mount** vào App.tsx. Chưa viết `docs/design/MINIMAP.md` (dừng theo yêu cầu bàn giao; nội dung thiết kế tóm tắt ở dưới).
- Chưa commit.

## File đã tạo (không sửa file nào có sẵn)

| File | Vai trò |
|---|---|
| `src/minimap/core/geometry.js` | Hình chữ nhật, khoảng cách, phủ hình vuông, cắt đoạn thẳng (Liang–Barsky) |
| `src/minimap/core/transform.js` | world ↔ map: `createMapTransform` (vừa khung theo bounds của L), `createViewTransform` (tâm, scale, xoay), `headingAngle`, `iconAngle`, `northAngle`, `mapRotation` |
| `src/minimap/core/navgrid.js` | Lưới 0,2 m, clearance theo `PLAYER_RADIUS` 0,35 m, A* 8 hướng không cắt góc, `findRoute` (bắt đích vào ô đứng được), `smoothPath`, `routeProgress` |
| `src/minimap/core/search.js` | Tìm theo id, nhãn, squad; bỏ dấu tiếng Việt; rỗng thì trả `[]` |
| `src/minimap/core/debounce.js` | Debounce bơm được đồng hồ giả |
| `src/minimap/core/mapModel.js` | Nhóm vật theo kind, cửa, vùng đi lại từ lưới |
| `src/minimap/core/index.js`, `index.d.ts` | Re-export và kiểu TS cho lõi JS |
| `src/minimap/core/test/*.test.mjs` | Test node:test |
| `src/minimap/core/test/realData.mjs`, `ts-hooks.mjs`, `three-stub.mjs` | Cho test import thẳng `layout.ts`, `officeBounds.ts`, `officePropsLayout.ts`, `entry/placement.ts` thật (Node bỏ kiểu TS; `three` thay bằng bản giả vì máy chưa có node_modules) |
| `src/minimap/sources.ts` | Dựng dữ liệu từ đúng nguồn của cảnh: lọc `isObjectInOffice` + bàn kiểm duyệt theo vai trò như ITOffice; vật cản = `collisionRects` + `decorBlockersOf` + `entryBlockers` + tường ngoài (quy tắc Floorplan.tsx) |
| `src/minimap/useNavigation.ts` | Đích, tuyến, debounce dựng lưới 300 ms và tính tuyến 150 ms, tính lại khi lệch tuyến > 1,5 m, tới nơi < 0,8 m, tự đi (mặc định tắt) |
| `src/minimap/draw.ts` | Vẽ canvas: sàn L, khu đi lại, phòng, bàn, tường ngoài, ranh giới L nét đứt, cửa, tuyến, đích, nhân vật, mũi tên Bắc |
| `src/minimap/Minimap.tsx`, `minimap.css`, `index.ts` | Minimap tròn góc dưới-trái, bản đồ lớn (phím M), tìm kiếm, trạng thái trống, tắt chỉ đường, xóa đích, chọn đích khác |

## Lệnh test và kết quả

```
cd D:\Work\Work-out\gpb-tool
node --test "src/minimap/core/test/*.test.mjs"
```

Đã chạy với Node v24.19.0: tests 23, pass 23, fail 0 (khoảng 0,8 s). Cần Node có bỏ kiểu TS mặc định (≥ 22.18 hoặc ≥ 23.6) cho `realData.mjs`.

Phủ: chuyển đổi tọa độ tại các điểm chuẩn (đỉnh L, SPAWN, ENTRY_DROP, đổi ngược), hai chế độ hướng; A* đi vòng qua cửa, cửa hẹp hơn 0,7 m không có đường, cửa bị đồ chặn rồi gỡ; đích trong vật cản; đích ngoài L; đứng sát góc; không cắt góc chéo; dữ liệu thật: đích ở nhánh dọc (desk_L1, mr1) và nhánh ngang (desk_B7, soc_room), tuyến L1 → B7, tới lift7_east, đích ngoài L (lounge, karaoke_room, core_st2, util_health) không có tuyến; tìm kiếm trên it.json; debounce.

## Dòng mount đề xuất (chưa thêm vào App.tsx)

Trong `src/App.tsx`, bên trong `<LayoutProvider>`, ngay sau `</Canvas>`:

```tsx
<Minimap zone={zone} role={user.role} plants={partyOf(theme) !== 'none'} />
```

kèm `import { Minimap } from './minimap';`. `plants` phải khớp `showPlants` của ITOffice (`theme !== 'none'`, với `theme={partyOf(theme)}` trong App.tsx; `partyOf` trả `'none'` khi không có chủ đề).

## Việc còn lại

1. Trên VPS: `tsc --noEmit` và `vite build`, sửa lỗi kiểu nếu có (đặc biệt import `./core/index.js` dựa vào `index.d.ts`, moduleResolution bundler).
2. Mount vào App, kiểm tra trong trình duyệt: minimap không che `.hint`, nút tương tác, panel phải, joystick cảm ứng (nếu có).
3. Viết `docs/design/MINIMAP.md` (có thể lấy từ file này).
4. `applyLayout` mặc định `false`: ITOffice hiện không áp `useLayout().poseOf` vào va chạm, nên minimap dùng vị trí it.json như cảnh. Khi cảnh áp bố cục, bật `applyLayout` để minimap tính lại theo bố cục (đã có debounce theo `signature`).
5. Marker trong thế giới 3D (yêu cầu 6, tùy chọn) chưa làm: cần component trong `<Canvas>`.
6. Focus trap trong hộp thoại chưa có (Tab có thể ra ngoài); chưa có pinch-zoom (chỉ nút, con lăn, phím + / -).

## Chưa kiểm chứng

- Toàn bộ giao diện: vẽ canvas, vị trí trên màn hình, mobile (≤ 760 px), cảm ứng (kéo, chạm chọn điểm), bàn phím (M, Esc, mũi tên trên bản đồ lớn).
- Chặn phím di chuyển lọt xuống điều khiển nhân vật khi đang ở trong bản đồ lớn (dựa vào `stopPropagation` của React trước listener `window`).
- Tự đi theo tuyến qua `requestWalk`: chưa chạy thật; dừng khi bấm phím di chuyển, bấm vào cảnh, hoặc đứng yên 2 s.
- Clearance dùng hình vuông nửa cạnh 0,35 m với mép L và hình chữ nhật nới vuông góc khi rút gọn tuyến: chặt hơn va chạm tròn của Player, nên khe đúng 0,7 m (west_mid) bị coi là không đi được.
- Cửa phòng họp không có trong dữ liệu (phòng kính là khối đặc), nên tuyến tới phòng dừng ở mép ngoài phòng; "cửa" vẽ trên bản đồ chỉ gồm `lift7_east`, `lift7_west`, `entrance`, làn `security_gate`.
- Test dữ liệu thật không gồm cây theo chủ đề (`decorBlockersOf` với plants = true) vì `src/env` kéo theo React/three.
