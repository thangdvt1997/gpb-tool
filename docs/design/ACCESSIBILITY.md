# Khả năng tiếp cận (Task 12)

Trạng thái: lớp hạ tầng trong `src/a11y/` đã có và có test thuần. Chưa gắn vào ứng dụng (xem "Cần mount"). Chưa kiểm chứng trên trình duyệt hay trình đọc màn hình.

## Thành phần

| File | Vai trò |
|---|---|
| `focusLogic.ts` | Logic thuần: vòng Tab, thứ tự tabindex, ngăn xếp lớp focus, điều kiện đóng bằng Esc |
| `focusTrap.ts`, `useFocusTrap.ts` | Gắn vào DOM: bẫy focus trong dialog/panel, trả focus về nơi mở, Esc đóng, nhả Pointer Lock |
| `announce.ts`, `LiveRegion.tsx` | Vùng aria-live dùng chung (polite/assertive), chống trùng, giới hạn tần suất |
| `contrast.ts` | Tỷ lệ tương phản WCAG, ngưỡng chữ/chữ lớn/UI, kích thước vùng chạm (24 AA, 44 khuyến nghị) |
| `useA11yAudit.ts` | Quét container lúc dev: tương phản và vùng chạm, báo `console.warn` |
| `interactAudit.ts` | Kiểm tra danh sách vật tương tác: mỗi vật/hành động có nhãn đọc được, không trùng id |
| `keyboardMove.ts` | API chọn vật và di chuyển theo lưới (thay thế kéo thả) |
| `a11y.test.ts` | 19 test thuần, chạy bằng `runA11yTests()` |

## Cần mount (người điều phối)

1. `App.tsx`: render `<LiveRegion />` một lần ở gốc.
2. Mỗi panel/dialog: `const ref = useFocusTrap<HTMLElement>({ id: 'panel:<id>', onClose })`, gắn `ref`, thêm `aria-modal="true"`. Ví dụ `Panel.tsx` hiện có `role="dialog"` nhưng chưa có bẫy focus, chưa Esc, chưa trả focus.
3. Nơi lưu/lỗi/tương tác gọi `announce('Đã lưu')` hoặc `announce(msg, 'assertive')` cho lỗi. Không gọi mỗi frame.
4. Tùy chọn: gọi `auditInteractables(danhSachVat)` lúc dev (đầu vào là các `InteractableDef` của `scene/interact/registry`; kiểu tương thích cấu trúc).
5. Chạy test: import `runA11yTests` từ `src/a11y/a11y.test` ở một script dev.

## Thao tác thay thế kéo thả

Module `keyboardMove.ts` cung cấp `createMoveController`: `select` -> `step` (mũi tên, nút) hoặc `setCell` (nhập số) -> `confirm` (Enter) hoặc `cancel` (Esc). Mỗi thao tác trả `message` để đưa vào `announce`. `isValid` do bên gọi cấp (va chạm). Cùng một API cho người dùng bàn phím và người chỉ dùng một con trỏ (nút trái/phải/lên/xuống bấm được).

**CHƯA CÓ chế độ sắp xếp trong ứng dụng.** Module này chưa được gọi bởi UI nào; chưa có giao diện nút hướng, ô nhập số, hay nối với `LayoutMovePanel`. Việc đó thuộc task làm chế độ sắp xếp.

## Hạn chế và chưa kiểm chứng

- Chưa kiểm tra bằng trình duyệt: bẫy focus, trả focus, Esc, nhả Pointer Lock (`document.exitPointerLock`) chỉ viết theo đặc tả, chưa chạy thật.
- Chưa kiểm tra bằng trình đọc màn hình (NVDA, VoiceOver, TalkBack): cách đọc của vùng live chưa xác nhận.
- Chưa kiểm tra zoom 200%, giảm chuyển động, tắt rung camera: nằm ngoài lớp này.
- `contrast.ts` chỉ nhận màu hex/rgb(a), nền phải đặc; không xử lý ảnh nền, gradient, hay chữ trên canvas 3D. `useA11yAudit` chỉ dựa trên style tính toán, không bắt được mọi trường hợp.
- Kiểm tra tự động không đủ để tuyên bố đạt WCAG; cần kiểm tra thủ công.
- Phạm vi của thế giới 3D: nội dung canvas không có cây ngữ nghĩa. Tiếp cận chức năng chính phải qua UI DOM (danh sách vật tương tác, panel); danh sách phòng/vật thể bằng UI chưa được xây trong task này.
- Các hạng mục của task 12 chưa làm ở đây: kiểm kê thao tác (mục 1), nút chọn vùng cơ thể/đồ vật và nhập số (mục 2), reduced motion/camera shake/nhấp nháy (mục 6), gợi ý văn bản cho âm thanh (mục 7).

## Kiểm trên điện thoại giả lập và axe (task 10, 12 một phần)

Spec ở `e2e-new/mobile.spec.ts` và `e2e-new/a11y.spec.ts` (Playwright, Chromium giả lập).

Đã kiểm tự động:
- Pixel 7 và iPhone 13 (hasTouch), dọc và ngang: vào văn phòng bằng phiên giả lập, mở Trợ giúp và Cài đặt bằng chạm, không tràn ngang (scrollWidth <= clientWidth), nút trong Trợ giúp và Cài đặt >= 44 px, không lỗi console.
- axe-core (cài ngoài repo, `/tmp/axe-dir`, biến `AXE_PATH`) trên màn đăng nhập, Trợ giúp, Cài đặt, Thư viện: không còn lỗi critical/serious. Đã sửa: tương phản `.sp-todo` trong Cài đặt.
- HelpCenter là dialog modal: focus vào ô tìm khi mở, Tab không thoát khỏi hộp, Esc đóng, trả focus về nút mở.

Đã xử lý ở lượt sau: joystick cảm ứng được mount lại (`TouchLayer` trong App, dùng chung `touchInput`, `touch.joystickSize`, `buttonsEnabled` với useGtaPlayer; nút tương tác do InteractionHud đảm nhiệm), e2e kéo joystick thì nhân vật di chuyển; Thư viện `li[role=option]` tự là phần tử tương tác (hết nested-interactive); cột công cụ cuộn được và nằm trên các nút nổi (dưới tour) nên chạm được "Cài đặt" ở màn ngang 915x412.

CHƯA KIỂM CHỨNG: NVDA, VoiceOver, TalkBack thật; điện thoại thật (cảm ứng đa điểm, bàn phím ảo, WebGL iOS, vùng an toàn tai thỏ); chỉ có giả lập Chromium và axe.
