# Quyết định chờ người dùng

Agent không tự quyết các mục này (HANDOFF.md mục 7). Hành vi hiện tại của từng mục được giữ nguyên. Các phần không phụ thuộc vẫn làm bình thường.

## 1. 11 khu nằm ngoài hình chữ L

Khu: lounge, pantry, karaoke, game, kudos, y tế, in ấn, thông báo, lối vào lounge, góc đằng sau (và một khu phụ cùng nhóm). Hiện trạng: sàn, tường, trần theo hình L; các khu này có trong dữ liệu nhưng nằm ngoài L, minimap không tìm được tuyến tới chúng (test `realData` ghi nhận).

| Phương án | Làm gì | Ảnh hưởng |
|---|---|---|
| A. Giữ hình L, bỏ hoặc ẩn 11 khu | Lọc khu khỏi cảnh và minimap; tính năng gắn với khu (karaoke, game) chuyển vào trong L hoặc tắt | Đúng bản vẽ; mất lối vào karaoke/game/pantry; giảm draw call (có lợi cho mục 3) |
| B. Nới hình L để chứa các khu | Sửa `src/scene/officeBounds.ts` thêm đa giác phụ, tường/trần/sàn mới, lưới chỉ đường | Giữ đủ tính năng; lệch bản vẽ thật; tăng draw call (thêm tường, trần, đèn), phải chạy lại scene-qa và test minimap |

## 2. Bàn đối diện nhau

Hiện trạng: các hàng bàn song song, một hướng (`src/scene/interact/geometry.ts`, lưới ghế).

| Phương án | Làm gì | Ảnh hưởng |
|---|---|---|
| A. Đổi sang cụm bàn đối diện | Sửa lưới ghế và hướng ghế trong `geometry.ts`, `Desks.tsx`, điểm neo ngồi | Giống ảnh văn phòng thật; phải cập nhật test ghế, IK ngồi (task 03), tuyến minimap, bố trí mặc định trong trình biên tập (task 17) |
| B. Giữ hàng song song | Không đổi | Không tốn công; khác ảnh tham chiếu |

## 3. Trần draw call

Hiện trạng: khoảng 208 draw call (đo tĩnh bằng `scripts/perf/static-census.mjs`), trần ngân sách 200. Module `src/perf` chỉ cảnh báo khi vượt, không cắt nội dung. Phiên 2026-11-06 thêm: khu vật tương tác mẫu khoảng 12 đến 14 draw call (ước lượng, trừ đi tủ hồ sơ và cây nước tĩnh đã ẩn nằm trong lô gộp nên không giảm draw call), vỏ trang phục một draw call mỗi món đang mặc (thêm pass bóng). Số thật cần đo bằng `?perf=1` trên trình duyệt.

| Phương án | Làm gì | Ảnh hưởng |
|---|---|---|
| A. Nâng trần lên 250 | Đổi một hằng số ngân sách | Không mất nội dung; máy yếu có thể giảm FPS (bộ chất lượng tự thích nghi task 13 bù một phần) |
| B. Giữ 200, giảm thêm | Gộp mesh tường/trần, instancing đồ nhỏ, bỏ một số đạo cụ | Đạt trần; tốn công; vật tương tác mới (cửa, rèm, máy in) phải nằm trong ngân sách còn lại |

## 4. Múa võ và tập quyền trong bộ biểu cảm mặc định

Hiện trạng: `punch_combo`, `kata` có trong `src/emotes/types.ts`; bánh xe nhanh (task 15) chưa đưa vào.

| Phương án | Làm gì | Ảnh hưởng |
|---|---|---|
| A. Bỏ khỏi bộ mặc định, chỉ dùng trong luồng thi đấu có đồng ý | Lọc khỏi bảng biểu cảm chung | Đúng task 15 mục 7 (tránh hành động mang tính bạo lực); vẫn giữ cho tính năng thi đấu |
| B. Giữ trong bộ mặc định | Không đổi | Người dùng dùng được mọi lúc; trái khuyến nghị của đặc tả task 15 |
