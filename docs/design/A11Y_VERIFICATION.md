# Kiểm chứng khả năng tiếp cận (Task 12, phần tự động)

Trạng thái: MỘT PHẦN. Chỉ kiểm tự động được; chưa có kiểm chứng bằng trình đọc màn hình thật (NVDA, VoiceOver, TalkBack). Không tuyên bố đạt WCAG chỉ dựa vào quét tự động.

## Đã kiểm tự động

Spec: `e2e-new/30-a11y-full.spec.ts` (bản chạy: `/home/cc/gpb-e2e/tests/30-a11y-full.spec.ts`, chạy với `vite preview` của bản build). Dùng axe-core 4.x nạp bằng `addScriptTag` từ `/tmp/axe-dir/node_modules/axe-core` (biến `AXE_PATH` ghi đè). `@axe-core/playwright` chưa cài trong gpb-e2e và mạng bị chặn nên không cài thêm.

| Hạng mục | Cách kiểm |
|---|---|
| Màn đăng nhập | axe 0 critical/serious; mọi ô nhập có tên truy cập |
| Panel Thư viện, Phòng thay đồ, Vẽ xăm, Hồ sơ, Cài đặt, Trợ giúp, Sao lưu | Mở bằng bàn phím (focus + Enter); mọi button/tab/input/radio/slider trong panel có tên truy cập; axe toàn trang 0 critical/serious; đóng bằng Esc hoặc nút Đóng; focus trở về nút mở |
| Panel modal (Phòng thay đồ, Cài đặt, Trợ giúp) | Tab 15 lần và Shift+Tab: focus không thoát khỏi hộp thoại |
| HUD, minimap, thanh công cụ | Không có nút không tên; axe toàn trang |
| Cây truy cập | `ariaSnapshot` của thanh công cụ chứa `button "<tên>"` cho 7 nút; có vùng aria-live polite và assertive |
| aria-live khi tương tác | Lưu trang phục làm vùng live nhận thông báo (nếu nút Lưu mở khóa) |
| prefers-reduced-motion | Context `reducedMotion: reduce`: media query khớp, không có animation lặp dài hơn 100 ms, không transition dài hơn 300 ms |
| Đăng nhập thật | Nếu có TEST_EMAIL/TEST_PASSWORD: vào cảnh 3D và axe |

Ngoài e2e: `src/a11y/*.test.ts` (focus stack, announcer chống trùng/giới hạn tần suất, tương phản, vùng chạm) và `returnFocus.vitest.test.ts`.

## Lỗi thật tìm được và đã sửa

1. Thư viện, Hồ sơ, Sao lưu, Vẽ xăm là panel không bẫy focus nhưng đóng xong focus rơi về body, không trả về nút mở. Thêm hook `useReturnFocus` (`src/a11y/useReturnFocus.ts`) và gọi trong bốn panel.
2. Sao lưu: nút "Xuất ra tệp" và "Sao lưu ngay" có aria-label không chứa chữ hiển thị (axe `label-content-name-mismatch`, WCAG 2.5.3, mức serious; người dùng điều khiển bằng giọng nói không gọi được tên). Đổi chữ hiển thị thành "Xuất toàn bộ dữ liệu" và "Tạo bản sao lưu cục bộ", là chuỗi con của aria-label.

## Kết quả

Lần chạy cuối trên preview của bản build (cổng 4194, mock phiên): 12 test đạt, 1 bỏ qua (đăng nhập thật: gateway auth không có ở preview nên đăng nhập bị từ chối; không tính là lỗi). Trước khi sửa, 4 panel (Thư viện, Vẽ xăm, Hồ sơ, Sao lưu) không đạt. Vitest toàn bộ: 930 đạt (71 file); tsc sạch; build đạt.

## Giới hạn

- Panel Vẽ xăm, Thư viện, Hồ sơ, Sao lưu là hộp thoại không modal theo thiết kế (aria-modal=false), nên không kiểm bẫy focus.
- Cảnh 3D (canvas) không có cây truy cập nội dung; chức năng chính truy cập qua các panel DOM. Chưa kiểm danh sách vật thể tương tác bằng screen reader.
- axe không bắt được: thứ tự đọc hợp lý, chất lượng mô tả, tiếng Việt trong đọc của trình đọc, tương phản trên nền 3D thay đổi.
- Chưa kiểm zoom 200% và thiết bị thật.

## Checklist thủ công (CHƯA kiểm chứng)

Chạy trên: NVDA + Firefox/Chrome (Windows), VoiceOver + Safari (macOS, iOS), TalkBack + Chrome (Android). Đánh dấu từng mục khi đã thử.

- [ ] Đăng nhập: mỗi ô được đọc kèm nhãn; lỗi đăng nhập được đọc ngay (role alert).
- [ ] Thanh công cụ: Tab qua 7 nút, mỗi nút đọc tên và trạng thái mở/đóng (aria-expanded).
- [ ] Mở từng panel: đọc "hộp thoại" cùng tên; focus vào trong panel; modal không cho Tab ra ngoài.
- [ ] Esc và nút Đóng: panel đóng, focus về đúng nút mở, trình đọc đọc lại tên nút đó.
- [ ] Phòng thay đồ: đổi bộ mẫu/màu; lưu thì nghe "Đã lưu trang phục và hình thể."
- [ ] Xưởng xăm: vùng ứng dụng có hướng dẫn phím; đặt xăm bằng phím và bằng bấm không kéo; trạng thái đọc qua role status.
- [ ] Thư viện: tìm asset, mũi tên duyệt danh sách, đọc tên từng mục; chọn và đặt bằng bàn phím.
- [ ] Cài đặt: mũi tên trái/phải đổi tab; bật "Giảm chuyển động" thì camera không rung.
- [ ] Trợ giúp (F1): tìm kiếm, kết quả được đọc.
- [ ] Sao lưu: xuất, nhập xem trước, khôi phục; thông báo trạng thái và lỗi được đọc.
- [ ] Thông báo: mất kết nối đồ họa, lỗi lưu, lời mời xã hội được đọc, không đọc lặp mỗi frame.
- [ ] Hệ điều hành bật giảm chuyển động: hộp thoại không animation dài.
- [ ] Zoom trình duyệt 200%: không mất nút, không cuộn ngang trong panel.
- [ ] Điện thoại: vùng chạm tối thiểu 44 px, panel cuộn được, joystick không chặn đọc.
