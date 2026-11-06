# Camera và khôi phục nhân vật (TASK 05)

Mã: `src/scene/controls/cameraModes.ts` (thuần), `src/scene/controls/safePosition.ts` (thuần),
`src/scene/controls/gtaCamera.ts` (R3F, DOM). Gắn vào cảnh qua `useGtaCamera` (gọi trong `controls/index.ts`,
không đổi) và `useCameraSafety`, `useCameraBodyVisibility` (gọi trong `src/scene/Player.tsx`).

## Chế độ camera

| Chế độ | Nguồn | Ưu tiên | Xoay | Zoom | Khoảng cách (m) | Pitch (rad) |
|---|---|---|---|---|---|---|
| thirdPerson | nền, mặc định | 0 | có | có | 2,5–20 (vào 7,5) | 0,05–1,25 |
| firstPerson | nền, phím V | 0 | có | không | mắt | −1,2–1,3 |
| seated | `session.seated` khi nền là thirdPerson | 10 | có | có | 1,6–5 (vào 2,8) | 0,05–1,1 |
| overview | người chơi (nút "Toàn cảnh" trong menu tạm dừng) | 20 | có | có | 10–30 (vào 18) | 0,9–1,4 |
| inspect | `characterState === 'using_ui'` (máy tính, bảng) | 30 | không | không | mắt | 0,3 |

- Chế độ đang chạy = yêu cầu có ưu tiên cao nhất, bằng nhau thì yêu cầu mới hơn; không có yêu cầu thì nền.
- Ngồi khi đang firstPerson: giữ góc nhìn mắt (mắt hạ theo `EYE_SIT`), không ép sang camera sau lưng.
- Hợp đồng enter/exit: rời chế độ thì lưu `{yaw, pitch, dist}` mục tiêu; vào lại thì khôi phục, lần đầu dùng
  `startPitch/startDist`. inspect quay theo hướng mặt nhân vật (`playerPose.yaw`); rời inspect khôi phục cả yaw.
- Đổi khoảng cách giữa các chế độ đi qua cùng bước quét va chạm mỗi khung (nội suy tham số, không nội suy vị trí),
  nên đường chuyển không đi xuyên tường. firstPerson ↔ thirdPerson là cắt thẳng như trước.
- Esc (pha capture trên window): chỉ thoát yêu cầu escapable (overview) về chế độ trước; khi đang tạm dừng
  hoặc đang gõ chữ thì không xử lý. seated và inspect thuộc hệ tương tác (E đứng dậy, UI tự đóng), camera
  đi theo trạng thái đó chứ không tự gỡ.
- Mỗi lần đổi chế độ: nhả kéo chuột và pointer capture. inspect chặn xoay/zoom để UI giữ chuột.

## Third-person

- Anchor = chân nhân vật + `targetHeight` (1,5 m đứng, 1,1 m ngồi, trộn theo trọng số ngồi của hoạt ảnh).
  Hình thể hiện chỉ đổi bề ngang (`bodyType`), chưa có chiều cao riêng nên anchor chưa đổi theo hình thể.
- Làm mượt theo delta time (`1 − e^(−k·dt)`, dt chặn 0,1 s): yaw/pitch 22/s, bám XZ 14/s, Y 7/s, zoom 5/s.
- Sphere sweep: quả cầu bán kính 0,25 m quét từ vị trí thật của nhân vật theo hướng camera, vật cản là hộp nở
  thêm bán kính (Minkowski xấp xỉ bảo thủ ở góc), cộng tường phòng; tia đã cao hơn 3,35 m khi tới vật cản thì
  bỏ qua. Gốc nằm trong hộp nở (ngồi tại bàn) thì bỏ qua hộp đó.
- Collision mask: vật cản có cạnh dài nhất < 0,7 m (ghế, chậu cây, thùng rác) không chặn camera.
  Nhân vật vẫn va chạm với chúng.
- Co ngay khi chạm; hết vướng phải giữ 0,2 s mới nở lại (chống dao động giữa hai khoảng cách).
- Góc tường / chỗ hẹp: khoảng ngang còn lại không đủ cho 1,2 m thì nâng góc ngẩng (tối đa 1,4 rad) để camera
  lên trên đầu thay vì vào trong tường; hạ lại mượt khi hết vướng.
- Near-clip 0,05 m khi camera ở mắt hoặc dưới 1,6 m, về 0,1 m khi trên 1,9 m (có trễ).
- Thân nhân vật ẩn khi camera ở mắt (firstPerson, inspect) bằng `Object3D.visible`; không làm mờ, không sao chép material.
- Trần: trần văn phòng dùng `FrontSide`, nhìn từ trên xuống không thấy, nên camera cao hơn trần là thiết kế sẵn
  (góc nhìn mặc định ~5 m). Chưa thêm giới hạn trần thấp.

## Vị trí an toàn và phục hồi

- Điểm an toàn: tọa độ hữu hạn, trong biên phòng, có sàn (chữ L, `isInsideOffice`) ở tâm và 8 điểm trên vòng
  bán kính 0,35 + 0,15 m, không chồng vật cản nở cùng khoảng đó, cách người/NPC khác ≥ 0,9 m.
- Lấy mẫu mỗi 0,5 s khi đứng trên sàn, chỉ khi cách điểm trước ≥ 0,75 m, giữ 8 điểm. Đứng yên không sinh mẫu và
  không bao giờ tự teleport.
- Phục hồi tự động chỉ khi: tọa độ NaN/vô hạn, rơi dưới −2 m (ngay), hoặc ở ngoài vùng có sàn liên tục 1 s.
  Không chạy khi đang ngồi.
- Thứ tự chọn điểm: điểm lưu mới nhất còn an toàn (kiểm tra lại vật cản và người khác) → tìm vòng quanh điểm mới
  nhất → spawn → tìm quanh spawn → không có thì không dịch chuyển và báo trong menu.
- Khi áp: đặt vị trí, `haltMotion` (vận tốc về 0, y = 0), xóa đích tự đi (`onRecovered` trong Player),
  camera nhảy thẳng tới chỗ mới.
- Nút "Về vị trí an toàn": thanh nhỏ hiện khi menu tạm dừng mở (DOM do `useCameraSafety` gắn vào `body`),
  bấm thì đóng menu và phục hồi ở khung kế tiếp; đang ngồi thì báo "bấm E để đứng dậy trước".
  UI khác có thể gọi `requestSafeReturn()`.
- Multiplayer: `useCameraSafety({ confirmRecovery })` nhận hàm hỏi server, chỉ áp khi server trả true.
  Hiện chưa có nơi truyền hàm này, nên phục hồi đang chỉ áp cục bộ.

## Tùy chọn dễ chịu

- `cameraComfort` (localStorage `gpb.camera.comfort.v1`): `reduceMotion` (mặc định theo
  `prefers-reduced-motion`) cắt thẳng khi đổi chế độ, chiều cao bám nhanh như mặt phẳng, tắt rung;
  `shakeScale` 0..1, mặc định 0,25. Điều chỉnh trong thanh của menu tạm dừng.
- Độ nhạy chuột dùng `session.settings.sensitivity` sẵn có (0,2–3).
- `addCameraShake(strength)` có sẵn nhưng chưa có nơi gọi; cảnh hiện không rung.

## API xuất

- `cameraModes.ts`: `createCameraModeController`, `MODE_PRIORITY`, `MODE_POLICY`, `clampToPolicy`, `isOverlay`,
  `sanitizeComfort`, `effectiveShake`, `createComfortStore`, kiểu `CameraMode`, `ModeState`, `ModeHooks`, `CameraComfort`.
- `safePosition.ts`: `isSpotSafe`, `findSafeNear`, `createSafeTracker`, `mapStatus`, `createFallWatch`, `SAFE_DEFAULTS`.
- `gtaCamera.ts` (thêm): `cameraModes`, `cameraComfort`, `MODE_SOURCE`, `toggleOverview`, `addCameraShake`,
  `isCameraBlocker`, `cameraBlockers`, `requestSafeReturn`, `useCameraSafety`, `useCameraBodyVisibility`.
  `updateGtaCamera` thêm tham số cuối tùy chọn `mode`; cách gọi cũ vẫn chạy.

## Kiểm thử

```
node --test tests/camera/cameraModes.test.mjs tests/camera/safePosition.test.mjs
```

Cần Node ≥ 22.18 hoặc ≥ 23.6 (tự bỏ kiểu khi import `.ts`). Hai module thuần không import giá trị nào ngoài
chính nó. Lần chạy 06/11/2026 trên Node 24.19.0: 20 test, 20 đạt.

## Chưa kiểm chứng

Chưa chạy `tsc`, `vite build` hay mở cảnh. Chưa thử: đi lùi sát tường, qua cửa hẹp, dưới gầm và cạnh bàn,
ngồi cạnh tủ, đổi hình thể, zoom cực trị, Esc khi overview, thanh trong menu tạm dừng (vị trí, z-index 1000 so
với backdrop, focus trap của hộp thoại có thể chặn Tab tới thanh), và ngưỡng 0,7 m của collision mask so với
kích thước props thật.
