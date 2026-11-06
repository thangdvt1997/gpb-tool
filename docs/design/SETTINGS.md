# Cài đặt điều khiển trung tâm (Task 11, phần dữ liệu)

Mã nguồn: `src/settings/`. Khóa lưu: `gpb.settings.v2` (version 2). Khóa cũ `gpb.controls.v1` và `gpb.interact.settings.v1` chỉ được đọc để migrate, không bị ghi hay xóa.

## Trường
mouse.sensitivity (0,2 đến 3), mouse.invertX/invertY, bindings (mã phím vật lý theo KeyboardEvent.code), volume (0 đến 1), hintsEnabled, highlightEnabled, controlMode (rightMouse | leftMouse), touch.joystickSize (80 đến 200), touch.buttonsEnabled.

## Phím tắt
Mỗi action thuộc một ngữ cảnh (gameplay, ui, editor). Hai action cùng phím trong cùng ngữ cảnh là xung đột: `rebind` trả lỗi, `swapBindings` để hoán đổi. Phím giữ riêng (F1, F3, F5, F6, F11, F12, Meta, ContextMenu, PrintScreen) không cho gán. Nhập JSON có trùng phím hoặc phím sai thì báo lỗi, không sửa ngầm.

## Quy tắc
Giá trị sai kiểu dùng mặc định, số ngoài khoảng bị kẹp. Mouse delta nhân độ nhạy và đảo trục qua `applyMouseDelta`, không nhân theo FPS.

## Chưa nối (người điều phối làm)
- `scene/controls/session.ts` còn giữ ControlSettings riêng: đọc sensitivity, volume, helpHidden từ `getSettings()`.
- `scene/interact/settings.ts` còn lưu highlight, keyHints riêng: đổi sang hintsEnabled, highlightEnabled.
- `useGtaControls.ts`, `InteractionSystem.tsx`, `InteractTracker.tsx` còn mã phím cứng (KeyW, KeyE, KeyV, Escape): đọc từ `bindings`.
- controlMode, đảo trục, joystickSize, buttonsEnabled chưa có nơi dùng.

## Chưa kiểm chứng
Test thuần `runSettingsSelfTest()` chưa chạy (không có runner, không chạy npm/tsc). Giao diện trang cài đặt chưa làm. Chạm thật, gamepad, localStorage trên trình duyệt thật chưa kiểm.
