# TASK 09: minimap, tìm phòng, chỉ đường

Gộp từ `HANDOFF_MINIMAP.md` và phần làm thêm (marker 3D, focus trap, clearance tròn, tự đi).

## Cấu trúc

| File | Vai trò |
|---|---|
| `src/minimap/core/*.js` (+ `index.d.ts`) | Lõi thuần, test bằng `node --test`: geometry, transform world-map, navgrid (A*), search, debounce, mapModel, **autowalk** |
| `src/minimap/sources.ts` | Dữ liệu từ đúng nguồn của cảnh (lọc theo vùng văn phòng, vai trò; vật cản = va chạm + decor + entry + tường ngoài) |
| `src/minimap/useNavigation.ts` | Đích, tuyến, debounce (lưới 300 ms, tuyến 150 ms), lệch tuyến > 1,5 m thì tính lại, tự đi (mặc định tắt); đẩy tuyến sang `navStore` |
| `src/minimap/navStore.ts` | Store ngoài React (`useSyncExternalStore`), cầu nối Minimap (ngoài Canvas) và NavMarkers (trong Canvas) |
| `src/minimap/NavMarkers.tsx`, `routeStrip.ts` | Marker 3D: cột sáng ở đích, dải tuyến trên sàn (một BufferGeometry, một draw call) |
| `src/minimap/focusTrap.ts` | Focus trap cho hộp thoại bản đồ lớn |
| `src/minimap/Minimap.tsx`, `draw.ts`, `minimap.css` | Giao diện, phím M, tìm kiếm, bản đồ lớn |

## Mount

- Ngoài Canvas, trong `<LayoutProvider>`, sau `</Canvas>`: `<Minimap zone={zone} role={user.role} plants={partyOf(theme) !== 'none'} />` (đã mount).
- Trong `<Canvas>`: `<NavMarkers />` với `import { Minimap, NavMarkers } from './minimap';`. Chưa mount (không sửa App.tsx trong phạm vi task).

## Hành vi chính

- Tuyến tính trên lưới 0,2 m. Chỉ trả tuyến cho đích trong hình chữ L; 11 khu ngoài L: minimap báo không có tuyến (giữ nguyên, chờ quyết định).
- Không tự di chuyển nhân vật nếu người dùng chưa bật "Tự đi theo tuyến". Marker 3D có hộp chọn riêng ("Hiện cột đích và đường đi trong thế giới 3D"), cùng điều kiện "Hiện chỉ đường".
- Bản đồ lớn: Tab xoay vòng trong hộp (Shift+Tab ngược lại), Esc đóng, đóng xong trả focus về phần tử đã focus trước khi mở (nút "Bản đồ" hoặc phần tử đang focus lúc bấm M). Phím di chuyển không lọt xuống điều khiển nhân vật.

## Clearance (đổi so với bản bàn giao)

- Trước: hình vuông nửa cạnh 0,35 m và hình chữ nhật nới vuông góc khi rút gọn tuyến, nên khe đúng 0,7 m không đi được.
- Nay: vòng tròn bán kính `PLAYER_RADIUS` = 0,35. Khoảng cách điểm-hình chữ nhật và đoạn-hình chữ nhật (`distSegmentRect`) so với bán kính với dung sai `CLEAR_TOL` = 1e-6; vùng đi lại kiểm bằng `circleCovered`.
- Ô lưới bị chặn tại tâm nhưng có điểm đứng được trong ô (khe hẹp lệch ô) được "neo" vào điểm đó (`grid.anchors`); cạnh nối ô có neo được kiểm bằng `segmentClear`. Khe đúng 0,7 m đi được trên đường tâm khe, khe 0,69 m vẫn không.
- Lưu ý đối chiếu Player: `gtaMotion.hits` so sánh ngặt trên hình chữ nhật nới `r` về mỗi phía (hộp vuông, không phải tròn) và đi theo từng trục. Với cạnh song song trục thì tròn và vuông cho cùng kết luận: khe đúng 2r chỉ là một đường tâm (độ rộng 0), nên đi được về lý thuyết nhưng thực tế rất dễ kẹt. Ở góc vật cản, kiểm tra tròn nới hơn Player (Player trượt theo trục). Chưa thử chạy thật qua khe 0,7 m. Dữ liệu `it.json` hiện không có khe đúng 0,7 m giữa hai vật cản; khe 0,7 m gần nhất là giữa tường và một vật nhỏ ở góc Tây-Bắc.

## Tự đi theo tuyến

Logic thuần ở `core/autowalk.js` (test `autowalk.test.mjs`): gửi điểm gấp kế tiếp qua `requestWalk`, mỗi điểm một lần. Dừng và báo lý do khi: bấm phím di chuyển (WASD, mũi tên), bấm vào canvas của cảnh (ngoài `.mm-root`), nhân vật nhích dưới 0,1 m trong 2 s, tới nơi (< 0,8 m), mất tuyến. Tắt tự đi cũng gọi `cancelWalkRequest`.

## Kiểm thử

```
node --test "src/minimap/core/test/*.test.mjs"
npx vitest run src/minimap
npx tsc --noEmit -p tsconfig.json 2>&1 | grep src/minimap   # phải rỗng
```

Phủ: world-map tại điểm chuẩn, A*, cửa 0,6 m không đi, 0,7 m đi, 0,69 m không, vòng tròn ở góc, tuyến dữ liệu thật hai nhánh L, tìm kiếm, debounce, autowalk (kẹt 2 s, phím, click cảnh), dải tuyến, navStore, focus trap (hàm thuần).

## Việc còn lại / chưa kiểm chứng

- Mount `<NavMarkers />` trong Canvas; xem marker bằng mắt (độ cao dải 0,03 m có bị z-fighting với sàn không, cột đích có bị che bởi trần không).
- Toàn bộ giao diện chưa mở trình duyệt: canvas, vị trí không che `.hint`/nút/joystick, mobile (≤ 760 px), cảm ứng, bàn phím. Focus trap mới test phần chọn đích bằng hàm thuần, chưa thử Tab thật trong DOM.
- Tự đi chưa chạy thật qua Player; dừng khi phím/click/kẹt mới được test ở mức logic.
- `applyLayout` mặc định `false` (ITOffice chưa áp `poseOf` vào va chạm). Bật khi cảnh áp bố cục.
- Cửa phòng họp không có trong dữ liệu (phòng kính là khối đặc), tuyến dừng ở mép ngoài phòng; "cửa" trên bản đồ chỉ gồm `lift7_east`, `lift7_west`, `entrance`, `security_gate`.
- Test dữ liệu thật không gồm cây theo chủ đề (`plants = true`).
- Chưa có pinch-zoom (chỉ nút, con lăn, phím + / -).
