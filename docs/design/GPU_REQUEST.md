# Yêu cầu kiểm trên GPU thật (VGA) — lần lặp 15, 09/11/2026 (cập nhật 01:10 UTC)

Bản này nằm trong repo vì /home/cc/handoff-20261107 đã đổi chủ sang root lúc 08:15 UTC nên user cc không ghi gpu_request.md vào đó được. Bản sao: /home/cc/gpu-handoff/gpu_request.md.

- Commit: 1b18bec (main, github.com/thangdvt1997/gpb-tool). Kết quả cũ trong gpu_result.md đo trên dev server 622b58f; lần này đo trên production (bản build).
- Production: https://gp.daisoncoop.com (đang chạy đúng commit trên, deploy ~01:00 UTC 09/11)
- Cách chạy: mở production bằng Chrome trên laptop (GPU thật), đăng nhập bằng phiên của chủ dự án. Nếu chạy bản build local: `git fetch && git checkout 1b18bec && npm ci && npm run build && npx vite preview`.
- Ghi kết quả vào /home/cc/handoff-20261107/gpu_result.md (hoặc docs/design/GPU_RESULT.md trong repo): mỗi mục một dòng `<số task>: ĐẠT|LỖI — ghi chú`, kèm ảnh nếu có (đường dẫn hoặc mô tả). Agent đọc ở lần lặp sau.

| Task | Việc cần kiểm | Tiêu chí đạt |
|---|---|---|
| 03 | Chọn dáng Chibi (Phòng thay đồ), đi tới một ghế cao (ghế quầy/ghế văn phòng), bấm E để ngồi | Mông chạm mặt ghế, chân không xuyên ghế/sàn, tay không xuyên bàn; đứng dậy bình thường |
| 04 | Mặc áo hoodie, sơ mi dài, blazer, áo len (Phòng thay đồ), xoay camera quanh cổ | Mép cổ áo sát cổ, không gồ/viền nổi, không thấy da xuyên qua áo |
| 07 | Mở DevTools Console, chạy: `const gl=document.querySelector('canvas').getContext('webgl2'); const e=gl.getExtension('WEBGL_lose_context'); e.loseContext(); setTimeout(()=>e.restoreContext(),3000)` | Cảnh hiện thông báo mất ngữ cảnh rồi tự vẽ lại trong ≤10 s, nhân vật và vị trí giữ nguyên, không trắng màn hình |
| 08 | Mở `https://gp.daisoncoop.com/?perf=1` (hoặc F3), đứng ở toàn cảnh 60 s, rồi `?bench=1` | Ghi lại FPS trung bình, FPS thấp nhất theo cửa sổ 1 s (`frame.minFps1s` trong bench JSON, overlay ghi "thấp nhất/1s"), thời gian khung p95/p99, draw call, tên GPU, và thời gian GPU (overlay dòng "GPU … ms p50 … p95 …", bench JSON khóa `gpu`: avgMs, p95Ms, discarded; nếu overlay ghi "không hỗ trợ đo" thì ghi rõ). Đạt khi p95 khung ≤ 33 ms trên laptop |
| 13 | Cài đặt → Đồ họa: chuyển Thấp / Trung bình / Cao / Tự động, mỗi mức 20 s | Mức Tự động không nhảy qua lại liên tục (hysteresis), FPS ở mỗi mức ghi lại; Thấp nhanh hơn Cao |
| 14 | Bật loa/tai nghe, đi lại, mở cửa, bấm máy in (máy in nay có model ở mặt Đông phòng In ấn, gần điểm vào; khay giấy quay về phía Đông), đi qua các khu (sảnh, phòng họp) | Nghe tiếng bước chân theo tốc độ, âm vật phát từ đúng hướng (trái/phải), nhỏ dần khi đi xa; âm nền đổi theo khu; không rè |
| 15 | Hai trình duyệt (hai tài khoản hoặc một cửa sổ ẩn danh), đứng gần nhau: Vẫy chào, Bắt tay (bên kia Chấp nhận) | Bên kia thấy nhân vật vẫy/bắt tay đúng hướng, tay hai bên gần chạm nhau, không giật |
| 16 | Phím chụp ảnh (chế độ chụp ảnh), đổi tỷ lệ, hẹn giờ, 2x, chụp | Tải về PNG đúng tỷ lệ/kích thước, ảnh không đen/trắng, không có HUD |
| 01 | Đi dọc các dãy bàn làm việc | Các chỗ ngồi có đồ dùng khác nhau (một màn, hai màn, laptop, đồ lặt vặt), không vật nào lơ lửng hay xuyên mặt bàn |
| user | Phòng thay đồ: kéo thanh Bắp tay, Đùi, Cỡ bàn tay, Cỡ bàn chân tới hai đầu; nhân vật 170 cm đứng cạnh cửa | Lưới không méo/vỡ ở vai, hông; quần áo theo thân; chân chạm sàn (không lơ lửng); chiều cao nhìn hợp lý so với cửa (~2,1 m) |
| 13b | Cài đặt > Hiển thị: Chất lượng texture, LOD, AO đổi từng mức | Thấp: texture mờ hơn, đồ nhỏ ở xa ẩn; Cao: có quầng tối dưới đồ vật; không nhấp nháy |
| 19 | Vẽ xăm: thêm mẫu lên cánh tay/lưng, thoát ra cảnh | Hình xăm hiện đúng vị trí trên da trong cảnh, không vỡ mép UV, không phủ lên quần áo |
