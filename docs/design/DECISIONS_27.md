# Quyết định cho bộ 27 prompt

Ngày: 2026-11-06. Người duyệt: người dùng.

1. **Nhân vật có rig thật.** Dùng mô hình người mã nguồn mở MakeHuman/MPFB (giấy phép CC0 cho dữ liệu). Pipeline đã xuất ba file GLB trên VPS (nam, nữ, chibi), có xương và 18 morph target. Không mua mô hình và không giữ nhân vật dựng bằng code làm bản cuối.

2. **Hạ tầng nhiều người.** Tự viết service realtime bằng Node với thư viện `ws`, không dùng Colyseus hay dịch vụ ngoài. Xác thực bằng cookie phiên khi bắt tay WebSocket, kiểm tra Origin, giới hạn tần suất và kích thước message.

3. **Domain và HTTPS.** Đã có domain `gp.daisoncoop.com` với HTTPS (chứng chỉ Cloudflare Origin). Điều kiện này đã đạt. Cần kiểm tra gateway nginx chuyển tiếp được header Upgrade cho WebSocket (wss) trước khi triển khai nhiều người.

4. **Hình xăm.** Hình xăm là dấu vết vẽ trên cơ thể, không phải ảnh tải lên. Người dùng tự vẽ hoặc chọn mẫu có sẵn (ví dụ rồng, hoa văn, chữ) và đặt lên vùng da bằng công cụ vẽ trong app. Không có bước tải ảnh lên, nên không cần kiểm duyệt ảnh. Mẫu có sẵn do dự án tự tạo, không dùng hình có bản quyền. Task 19 (xử lý ảnh tải lên) đổi thành: công cụ vẽ hình xăm trên UV của mô hình.

5. **Vật lý và test.** Giữ va chạm hộp (AABB), không thêm Rapier. Dùng vitest làm công cụ test, thêm vào devDependencies khi build trên VPS.
