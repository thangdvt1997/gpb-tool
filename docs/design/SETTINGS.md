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

## Giao diện cài đặt (Task 11, phần UI)
- `SettingsPanel.tsx` (props `open`, `onClose`): hộp thoại có focus trap, Esc đóng, role dialog. Tab: Điều khiển, Chuột/cảm ứng, Gamepad, Camera, Hiển thị. Mount ví dụ: `<SettingsPanel open={open} onClose={() => setOpen(false)} />` (import từ `src/settings`).
- Đổi phím: `rebindFlow.ts` (thuần): `resolveCapture` (Esc hủy, phím giữ riêng báo invalid, trùng thì trả `conflict`), `confirmSwap`, `resetOne`, `resetAll`, `keyLabel`.
- Schema thêm `gamepad {deadzone 0 đến 0,5; sensitivity 0,2 đến 3}` và `display {reducedMotion}`; dữ liệu cũ không có hai trường này vẫn nạp được (dùng mặc định).
- `gamepad.ts` (thuần): vùng chết tròn có co giãn, đường cong bình phương, `mapGamepad` (chỉ mapping standard): cần trái = đi, cần phải = nhìn, A nhảy, X tương tác, Y đổi góc nhìn, RT/L3 chạy, Start tạm dừng, Back bản đồ.
- `useGamepadInput(enabled)`: polling rAF, trả `getMoveInput` (cùng hình dạng MoveInput), `getLook`, `isRunning`, `consumeJump`, `consumePress`, `isConnected`. Xóa trạng thái khi blur, tab ẩn, tháo tay cầm.

### Có hiệu lực thật
Độ nhạy, đảo X/Y (camera), âm lượng, hintsEnabled, phím di chuyển/chạy/nhảy/firstPerson/cancel.
### Đã lưu nhưng chưa nối (panel ghi chú trên giao diện)
interact, map, editor (phím); controlMode, joystickSize, buttonsEnabled, chạm để đi; highlightEnabled kiểm tra lại ở interact; reducedMotion; toàn bộ gamepad (hook chưa được gọi trong scene). FOV, khoảng cách camera, cỡ chữ chưa có trong schema nên không hiển thị.
