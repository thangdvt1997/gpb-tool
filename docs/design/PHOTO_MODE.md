# Chế độ chụp ảnh (TASK 16, phần lõi)

Trạng thái: lõi tính toán và component chụp đã viết; CHƯA mount, CHƯA chạy trên trình duyệt, CHƯA chạy tsc.

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
