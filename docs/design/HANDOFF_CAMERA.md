# Bàn giao TASK 05: camera và khôi phục nhân vật (06/11/2026)

Thiết kế đầy đủ: `docs/design/CAMERA.md`.

## Trạng thái

Đã viết code, các file đều hoàn chỉnh, không có file viết dở. Đã chạy test thuần và test đạt.
Chưa chạy `tsc`, `vite build` hay mở cảnh. Chưa commit.

## File đã đổi

- `src/scene/controls/cameraModes.ts` (mới, thuần): controller chế độ có ưu tiên, enter/exit, lưu trạng thái, Esc; tùy chọn comfort.
- `src/scene/controls/safePosition.ts` (mới, thuần): kiểm tra điểm an toàn, tracker, tìm vòng quanh, fallback spawn, FallWatch.
- `src/scene/controls/gtaCamera.ts` (sửa): đồng bộ chế độ trong `useGtaCamera`, collision mask cho props < 0,7 m,
  hysteresis 0,2 s khi nở lại, nâng camera ở góc tường, near-clip có trễ, Esc thoát overview, chặn xoay khi inspect,
  `useCameraSafety` (phục hồi + thanh "Về vị trí an toàn"/"Toàn cảnh"/comfort khi tạm dừng), `useCameraBodyVisibility`.
- `src/scene/Player.tsx`: dòng 10 (import), dòng 131 (lấy thêm `rig`), dòng 143–158 (gọi `useCameraSafety`, `useCameraBodyVisibility`).
- `tests/camera/cameraModes.test.mjs`, `tests/camera/safePosition.test.mjs` (mới).
- `docs/design/CAMERA.md`, `docs/design/HANDOFF_CAMERA.md` (mới).

Không sửa `controls/index.ts`, `src/avatar`, `src/env`, `OfficeProps.tsx`, `src/scene/interact`, `App.tsx`, `services`.

## Test đã chạy

```
node --test tests/camera/cameraModes.test.mjs tests/camera/safePosition.test.mjs
```

Node 24.19.0 trên máy cục bộ: 20 test, 20 đạt, 0 lỗi. (`node --test tests/camera/` theo thư mục không chạy trên
Windows với Node này; phải liệt kê file.) Ngoài ra đã dùng `module.stripTypeScriptTypes` để kiểm tra cú pháp
3 file `.ts`; cách này không kiểm tra kiểu.

## Việc còn lại (trên VPS)

1. Chạy `npm run build` (`tsc --noEmit` + `vite build`) và sửa lỗi kiểu nếu có. Điểm cần soát: `Object.assign(style, … satisfies …)`,
   kiểu `group` ref truyền vào `useCameraBodyVisibility`, tham số `mode` mới của `updateGtaCamera`.
2. Thử trong cảnh: đi lùi sát tường, cửa hẹp, gầm/cạnh bàn, ngồi cạnh tủ, đổi hình thể, zoom cực trị,
   Esc khi overview, nút trong menu tạm dừng (z-index 1000, focus trap của hộp thoại).
3. Chỉnh ngưỡng `CAM.smallPropSize` (0,7 m) theo kích thước props thật.
4. Multiplayer: truyền `confirmRecovery` vào `useCameraSafety` khi service world có API xác nhận vị trí. Hiện phục hồi chỉ cục bộ.
5. Tùy chọn: đưa nút và comfort vào menu tạm dừng thật (`interact/InteractPrompt.tsx`, ngoài phạm vi task này) thay cho thanh DOM riêng.

## Chưa kiểm chứng

Toàn bộ hành vi trên cảnh (va chạm camera, góc tường, near-clip, chuyển chế độ, phục hồi khi ra ngoài chữ L,
thanh menu). Anchor chưa đổi theo hình thể vì `Appearance` chưa có chiều cao. Chưa có giới hạn trần thấp
(trần `FrontSide`, camera cao hơn trần là thiết kế sẵn). `addCameraShake` chưa có nơi gọi.
