# Chế độ chụp ảnh (TASK 16, phần lõi)

Trạng thái: lõi + UI (camera tự do, preset, FOV/nghiêng, lưới, hẹn giờ, 1x/2x) đã viết và qua tsc/vitest; CHƯA chạy trên trình duyệt thật.

## Thành phần (src/photo)
- `framing.ts`: tỷ lệ, vùng cắt giữa khung, kích thước ra có chặn giới hạn, lưới bố cục, tiêu cự <-> FOV, phát hiện ảnh trống. Thuần.
- `filename.ts`: tên file `gpb-photo-<mode>-YYYYMMDD-HHmmss-WxH[-n].png|jpg` và metadata cơ bản (thời điểm ISO, chế độ camera, kích thước, định dạng, tỷ lệ, có ẩn HUD). Không tên người dùng, không watermark.
- `cameraModes.ts`: camera theo nhân vật (orbit, chỉ đọc `playerPose`), camera tự do kẹp vùng, kiểu preset cố định.
- `PhotoCapture.tsx`: component trong `<Canvas>`; lưu/khôi phục camera (vị trí, quaternion, FOV) khi bật/tắt; `apiRef.current.capture()` trả blob.
- `usePhotoHud.ts`: ẩn HUD bằng thẻ style tạm (`visibility:hidden`), gỡ khi tắt hoặc unmount. Selector mặc định: `[data-hud]`, `.hint`, `.hud-duel`, `.hud-duel-panel`; truyền danh sách khác nếu cần.
- `download.ts`: tải qua object URL (thu hồi sau 10 giây), tạo URL xem trước có hàm thu hồi.

## Cách chụp
`gl.render` ngay trước khi lấy ảnh, vẽ vùng cắt sang canvas 2D đúng kích thước ra, rồi `toBlob`. Kiểm tra mẫu điểm ảnh: toàn đen hoặc trong suốt thì báo `blank`, lỗi SecurityError thì báo `tainted`; không báo thành công giả. JPEG đổ nền trắng; PNG giữ alpha của canvas (không giả lập nền trong suốt).

## Giới hạn đã biết
- Độ phân giải ra không vượt vùng cắt của buffer canvas (không dựng render target lớn hơn). 4K chỉ đạt khi canvas đủ lớn; lý do giảm trả về trong `reducedReason`.
- Chưa có preset cố định (L-overview, hành lang): cần tọa độ cảnh từ người điều phối, truyền qua `FixedPreset`. Cận nhân vật dùng `computeFollowPose` với dist nhỏ.
- Chưa có UI điều khiển (nút, thanh FOV, chọn pose task 15), chưa có tạm dừng input cục bộ: cần nối vào session điều khiển ở nơi mount.
- Metadata chỉ trả về cho UI; chưa nhúng vào file ảnh.
- Camera chính (`useGtaCamera`) cũng ghi camera mỗi khung: `PhotoCapture` phải mount SAU nó để thắng thứ tự useFrame.

## Test
`node --test src/photo/photo.test.mjs` (11 test phần thuần).

## Bổ sung (hoàn thiện TASK 16)
- `photoLogic.ts` (thuần, có test vitest): `clampToOfficeBoxes` kẹp camera vào hợp các hộp chữ L (`OFFICE_L_RECTS`) + dải độ cao, có lề 0,3 m; `computePresetPose` (chân dung, toàn thân, góc rộng, từ trên xuống); `lookAngles/applyLook`; `moveFromKeys/scaleMove`; `computeScaledBuffer` (1x/2x chặn theo maxTextureSize và 16 triệu pixel); `nextCountdown`; `tiltToRadians`.
- Camera tự do: WASD di chuyển, Q/E xuống/lên, Shift nhanh, kéo chuột trên canvas để xoay. "Không xuyên tường" nghĩa là kẹp vào hộp chữ L, KHÔNG raycast mesh nên vẫn có thể xuyên đồ nội thất.
- Preset đặt camera tự do quanh nhân vật rồi cho phép chỉnh tiếp.
- Lưới 1/3, khung tỷ lệ là lớp DOM phủ lên canvas nên không lọt vào ảnh; HUD ẩn bằng `usePhotoHudHidden`.
- Hẹn giờ 3/10 s; Esc khi đang đếm sẽ hủy đếm, Esc lần nữa mới thoát.
- Cờ cho App: `isPhotoControlLocked()`, `isPhotoFlying()`, `usePhotoControlLocked()` (export từ `src/photo`). `PhotoPanel` đã gọi `setPaused(true)` khi bật.

## Cách chụp đúng với R3F
R3F tạo WebGLRenderer với `preserveDrawingBuffer: false`, nên buffer bị xóa sau khi trình duyệt hiển thị khung; gọi `toBlob` ở thời điểm tùy ý sẽ ra ảnh đen. Cách làm: trong một tác vụ đồng bộ, (1) nếu 2x thì `gl.setPixelRatio(ratio * k)` (không đổi style CSS), (2) `gl.render(scene, camera)`, (3) `drawImage` vùng cắt sang canvas 2D, (4) khôi phục pixel ratio. Trình duyệt chưa kịp hiển thị khung phóng to. Không bật `preserveDrawingBuffer` để khỏi tốn hiệu năng cả phiên.

## Giới hạn mới
- Nếu cảnh dùng EffectComposer/hậu kỳ, `gl.render` trực tiếp bỏ qua hậu kỳ (chưa kiểm).
- Chọn pose task 15, orbit chuột cho chế độ bám nhân vật chưa làm.
- Chưa kiểm thử trên trình duyệt: bay, kéo chuột, 2x ở màn hình lớn, hẹn giờ.
