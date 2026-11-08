# Yêu cầu kiểm trên GPU thật (VGA) — lần lặp 12, 08/11/2026

Bản này nằm trong repo vì /home/cc/handoff-20261107 đã đổi chủ sang root lúc 08:15 UTC nên user cc không ghi gpu_request.md vào đó được. Bản sao: /home/cc/gpu-handoff/gpu_request.md.

- Commit: 2d00d8b (main, github.com/thangdvt1997/gpb-tool)
- Production: https://gp.daisoncoop.com (đang chạy đúng commit trên, deploy 13:37 UTC)
- Cách chạy: mở production bằng Chrome trên laptop (GPU thật), đăng nhập bằng phiên của chủ dự án. Nếu chạy bản build local: `git fetch && git checkout 2d00d8b && npm ci && npm run build && npx vite preview`.
- Ghi kết quả vào /home/cc/handoff-20261107/gpu_result.md (hoặc docs/design/GPU_RESULT.md trong repo): mỗi mục một dòng `<số task>: ĐẠT|LỖI — ghi chú`, kèm ảnh nếu có (đường dẫn hoặc mô tả). Agent đọc ở lần lặp sau.

| Task | Việc cần kiểm | Tiêu chí đạt |
|---|---|---|
| 03 | Chọn dáng Chibi (Phòng thay đồ), đi tới một ghế cao (ghế quầy/ghế văn phòng), bấm E để ngồi | Mông chạm mặt ghế, chân không xuyên ghế/sàn, tay không xuyên bàn; đứng dậy bình thường |
| 04 | Mặc áo hoodie, sơ mi dài, blazer, áo len (Phòng thay đồ), xoay camera quanh cổ | Mép cổ áo sát cổ, không gồ/viền nổi, không thấy da xuyên qua áo |
| 07 | Mở DevTools Console, chạy: `const gl=document.querySelector('canvas').getContext('webgl2'); const e=gl.getExtension('WEBGL_lose_context'); e.loseContext(); setTimeout(()=>e.restoreContext(),3000)` | Cảnh hiện thông báo mất ngữ cảnh rồi tự vẽ lại trong ≤10 s, nhân vật và vị trí giữ nguyên, không trắng màn hình |
| 08 | Mở `https://gp.daisoncoop.com/?perf=1` (hoặc F3), đứng ở toàn cảnh 60 s, rồi `?bench=1` | Ghi lại FPS p50/p95, thời gian khung p95/p99, draw call, tên GPU. Đạt khi p95 khung ≤ 33 ms trên laptop |
| 13 | Cài đặt → Đồ họa: chuyển Thấp / Trung bình / Cao / Tự động, mỗi mức 20 s | Mức Tự động không nhảy qua lại liên tục (hysteresis), FPS ở mỗi mức ghi lại; Thấp nhanh hơn Cao |
| 14 | Bật loa/tai nghe, đi lại, mở cửa, bấm máy in, đi qua các khu (sảnh, phòng họp) | Nghe tiếng bước chân theo tốc độ, âm vật phát từ đúng hướng (trái/phải), nhỏ dần khi đi xa; âm nền đổi theo khu; không rè |
| 15 | Hai trình duyệt (hai tài khoản hoặc một cửa sổ ẩn danh), đứng gần nhau: Vẫy chào, Bắt tay (bên kia Chấp nhận) | Bên kia thấy nhân vật vẫy/bắt tay đúng hướng, tay hai bên gần chạm nhau, không giật |
| 16 | Phím chụp ảnh (chế độ chụp ảnh), đổi tỷ lệ, hẹn giờ, 2x, chụp | Tải về PNG đúng tỷ lệ/kích thước, ảnh không đen/trắng, không có HUD |
| 19 | Vẽ xăm: thêm mẫu lên cánh tay/lưng, thoát ra cảnh | Hình xăm hiện đúng vị trí trên da trong cảnh, không vỡ mép UV, không phủ lên quần áo |
