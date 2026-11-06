# Quyết định đã chốt

Ngày chốt: 2026-11-06. Người duyệt: người dùng (uỷ quyền chọn theo khuyến nghị).

1. **Chỗ ngồi.** Chọn phương án A trong DESIGN_V2.md mục 5.2: giữ sàn 58 × 30 m, khoảng 104 chỗ có ghế. 500 nhân sự làm việc theo ca và đặt chỗ (hot-desk). Chỉ đổi dữ liệu khối bàn, không đổi mặt bằng.
2. **Đố vui.** Không lộ đáp án trong lúc làm bài. Trả lời một câu chỉ trả về đã ghi nhận. Đáp án đúng và điểm chỉ hiện khi kết thúc ván.
3. **Karaoke.** Điểm vẫn do trình duyệt tính (MVP nội bộ). Bảng xếp hạng bỏ các lượt bị gắn cờ `suspicious`.
4. **Sự kiện.** Sự kiện được coi là đã đóng khi thời điểm hiện tại vượt `endsAt`, dù trạng thái chưa được đóng thủ công. Không nhận bình chọn và đăng ký.
5. **CSRF sự kiện.** Giữ chặn request `Sec-Fetch-Site: cross-site`. Frontend và API cùng origin qua gateway.
6. **Cờ caro.** Bỏ cuộc giữa trận: bên còn lại thắng nhưng không cộng điểm.
7. **Phòng chờ caro.** Tự hết hạn sau 30 phút không có người vào.
8. **Đố vui, ván không có câu trả lời nào.** Không ghi dòng điểm.
9. **Cổng dịch vụ mới.** Đã dùng: auth 3001, it 3002, games 3003, karaoke 3004, events 3005, display 3006, plants 3007, layout 3008 (vị trí vật thể di chuyển được), social 3010 (đề xuất trong SOCIAL.md). `world` (presence, trạng thái người và động vật theo INTERACTIONS.md và ANIMALS.md) dùng cổng 3011. Tài liệu ANIMALS.md ghi 3008 cần đổi thành 3011.
10. **Động vật (MVP).** Chọn rùa cảnh và cá cảnh trong bể, không chọn mèo, chó, chim, thỏ vì rủi ro dị ứng, cắn và cào. Mô hình dựng bằng hình học.
11. **Ngân sách draw call.** Trần mức Trung là 200 cho cả scene. Ước tính hiện tại khoảng 209 là vượt, cần thu gọn khi tích hợp, không đổi trần.
