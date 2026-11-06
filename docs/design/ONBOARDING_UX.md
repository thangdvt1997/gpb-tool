# ONBOARDING_UX: Đăng ký và tạo nhân vật lần đầu

| Mục | Nội dung |
|---|---|
| Ngày | 2026-11-06 |
| Trạng thái | Đề xuất. Chờ người dùng duyệt các mục ở mục 15 trước khi làm giao diện. |
| Phạm vi | Chỉ file này. Không sửa mã nguồn. Không chạy npm, docker, ssh. |
| Người đọc | ONBOARD-API (API và dữ liệu), đội 3D (avatar), người duyệt sản phẩm. |
| Đã đọc | `src/auth/AuthScreen.tsx`, `src/auth/api.ts`, `src/auth/auth.css`, `src/avatar/appearance.ts` (file xuất hiện giữa phiên, 15:53), `docs/design/AVATAR_SPEC.md`, `docs/design/DESIGN_V2.md`, `docs/PROMPT_phong_CNTT.md` (điều khiển, dữ liệu, trợ năng), `services/auth/index.js`, `services/auth/auth.js`, `services/auth/tenants.js`. |
| Chưa có hoặc chưa đọc | `FallbackAvatar` chỉ được nhắc trong comment của `appearance.ts`, chưa có component. Chưa có ảnh minh hoạ tóc và trang phục (mô tả bằng chữ ở mục 6). `docs/design/ASSET_SOURCES.md` chưa đọc. DESIGN_V2 cho phép asset CC0, CC BY, SIL OFL 1.1. Mục da (4) của AVATAR_SPEC chỉ đọc tiêu đề, màu hex lấy từ `appearance.ts`. Không có mục onboarding riêng trong DESIGN_V2. |

---

## 0. Tóm tắt

- Năm bước: (1) họ tên và email, (2) mã xác minh, (3) đặt mật khẩu (đề xuất, cần duyệt), (4) tạo nhân vật, (5) hướng dẫn nhanh. Bước 4 và 5 bỏ qua được. Mục tiêu tổng thời gian 5 đến 7 phút, chưa đo.
- Bước 3 đổi thứ tự so với hiện tại: mật khẩu không còn được đặt trước khi xác minh email (lý do ở mục 5).
- Ba điểm lệch phải xử lý trước khi làm giao diện (chi tiết mục 14):
  1. Server hiện ghi đè tên và mật khẩu của tài khoản chưa xác minh khi có người đăng ký lại bằng email đó.
  2. Đăng nhập tài khoản đã xác minh nhưng chưa có mật khẩu trả về "Tài khoản này đăng nhập bằng Google/Microsoft", sai với luồng mới.
  3. Danh mục trong `appearance.ts` thiếu "cúc" và "cà vạt". Số dáng thân và số kiểu tóc khác `AVATAR_SPEC.md`.
- Cỡ chữ tối thiểu 14 px. `auth.css` đang dùng 12 px (`.auth-divider`) và 13 px (`.auth-error`, `.auth-info`, `.auth-link`), phải nâng.

---

## 1. Sơ đồ luồng

```
[Trang đăng ký]
      |
      v
(1) Họ tên và email ---- email đã có tài khoản đã xác minh ----> [Đăng nhập, giữ email]
      |  gửi mã
      v
(2) Nhập mã 6 số <------ gửi lại mã (sau 60 giây) ------+
      |  sai, hết hạn, hoặc quá 5 lần:                   |
      |  khoá ô nhập, bắt buộc gửi lại mã ---------------+
      |  đúng mã: server đăng nhập luôn
      v
(3) Đặt mật khẩu (đề xuất, cần duyệt)
      |
      v
(4) Tạo nhân vật ---- "Bỏ qua, dùng mặc định" ----+
      |  lưu                                       |
      v                                            |
(5) Hướng dẫn nhanh (bỏ qua được) <----------------+
      |
      v
[Văn phòng 3D]   Phòng ban: "Đang chờ gán phòng ban"
```

---

## 2. Tổng quan các bước

| Bước | Mục đích | Thời gian mục tiêu (chưa đo) | Bỏ qua được | Yêu cầu từ server |
|---|---|---|---|---|
| 1. Họ tên, email | Nhận diện người dùng, gửi mã | 30 giây | Không | Đăng ký không cần mật khẩu |
| 2. Mã xác minh | Chứng minh quyền dùng email | 1 phút | Không | Trả thời gian hết hạn và số lần thử còn lại |
| 3. Mật khẩu | Đặt mật khẩu sau khi đã xác minh | 30 đến 60 giây | Không (tài khoản OAuth không có bước này) | Endpoint đặt mật khẩu; danh sách mật khẩu phổ biến |
| 4. Nhân vật | Tạo ngoại hình | 2 đến 4 phút | Có, dùng mặc định | Lưu appearance qua `normalizeAppearance` |
| 5. Hướng dẫn | Chỉ cách đi lại và tương tác | 1 phút | Có | Cờ `welcomeSeenAt` |

---

## 3. Bước 1: Họ tên và email

### 3.1 Màn hình

- Chỉ báo tiến trình: "Bước 1 trên 5" (chữ, không chỉ thanh màu).
- Tiêu đề: **Tạo tài khoản**. Mô tả: "Tạo tài khoản mất khoảng 5 đến 7 phút. Bạn sẽ xác minh email, đặt mật khẩu và tạo nhân vật của mình."

| Trường | Nhãn hiển thị | Gợi ý dưới ô | Kiểm tra | Ghi chú kỹ thuật |
|---|---|---|---|---|
| Họ tên | Họ và tên | Dùng họ tên thật để đồng nghiệp nhận ra bạn. Tối đa 80 ký tự. | 2 đến 80 ký tự, cắt khoảng trắng đầu và cuối | `autocomplete="name"`. Server kiểm tra lại. |
| Email | Email | Dùng email doanh nghiệp (tên miền công ty) hoặc email cá nhân như Gmail, Outlook đều được. Chúng tôi gửi mã xác minh tới địa chỉ này. | Đúng định dạng, chuyển chữ thường | `autocomplete="email"`, `inputmode="email"`. Thay thế gợi ý hiện có trong `AuthScreen.tsx` dòng 106. |

- Nút chính: **Tiếp tục**. Khi đang gửi: "Đang gửi mã…".
- Liên kết phụ: "Đã có tài khoản? Đăng nhập" (chuyển sang tab Đăng nhập, giữ email đã nhập).
- Không hỏi mật khẩu ở bước này.

### 3.2 Thông báo lỗi

| Tình huống | Copy |
|---|---|
| Họ tên ngắn | Nhập họ và tên, ít nhất 2 ký tự. |
| Email sai định dạng | Email chưa đúng định dạng. Ví dụ: ten@example.com |
| Email đã có tài khoản đã xác minh | Email này đã có tài khoản. Hãy đăng nhập để tiếp tục. Kèm nút: "Đăng nhập với email này". |
| Gửi lại quá sớm | Vừa gửi mã. Hãy đợi {n} giây rồi thử lại. |

### 3.3 Hành vi

- Kiểm tra trùng chỉ xảy ra khi bấm Tiếp tục. Không có API tra email trước khi gửi, để không lộ tài khoản tồn tại.
- Email chưa xác minh: server gửi mã mới. Hiện tại server ghi đè tên và mật khẩu của bản ghi cũ (mục 5.1). Với luồng mới, bước này không nhận mật khẩu nên không còn ghi đè mật khẩu.
- Email cá nhân (danh sách trong `services/auth/tenants.js`, ví dụ gmail.com, outlook.com, hotmail.com, yahoo.com, icloud.com, proton.me) vào tenant cá nhân. Tên miền khác tạo tenant riêng theo tên miền. Người dùng không thấy khác biệt này (xem mục 15, câu 3).

---

## 4. Bước 2: Nhập mã xác minh

### 4.1 Màn hình

- Tiêu đề: **Xác minh email**.
- Mô tả: "Mã 6 chữ số đã được gửi tới {email}. Mã có hiệu lực trong 10 phút. Nếu chưa thấy thư, hãy kiểm tra mục thư rác."
- Nhãn ô nhập: **Mã xác minh (6 chữ số)**. Gợi ý: "Có thể dán mã từ thư. Chỉ nhận chữ số."
- Đồng hồ: "Mã còn hiệu lực: {mm:ss}". Khi hết hạn: "Mã đã hết hạn. Bấm “Gửi lại mã” để nhận mã mới."
- Nút chính: **Xác minh**. Khi đang xử lý: "Đang xác minh…".
- Nút phụ: "Gửi lại mã sau {n} giây" / "Gửi lại mã" / "Đang gửi…". Và "Đổi email" (quay lại bước 1, giữ họ tên và email).
- Sau khi gửi lại thành công: "Đã gửi mã mới tới {email}. Kiểm tra hộp thư, kể cả thư rác."

### 4.2 Hành vi

- Nút Xác minh chỉ bật khi đã nhập đủ 6 chữ số. Không tự gửi khi vừa đủ 6 số, để tránh gửi nhầm khi đang dán mã (đề xuất).
- Đồng hồ 10 phút tính từ lúc server phát mã. Server cần trả `expiresInSeconds` (mục 14), không dùng giờ máy khách.
- Gửi lại chỉ sau 60 giây kể từ lần gửi gần nhất. Server hiện chặn lần sớm hơn (`services/auth/auth.js`, `OTP_RESEND_MS`).
- Số lần thử: server cho 5 lần (`OTP_MAX_ATTEMPTS`). Server đếm cả lần đúng. Lần thứ sáu bị từ chối dù mã đúng. Giao diện đếm số lần đã gửi trong phiên để hiện "Bạn còn {n} lần thử". Sau khi tải lại trang, đếm này mất, nên server cần trả `attemptsLeft`.
- Sau 5 lần: khoá ô nhập và nút Xác minh, hiện thông báo khoá. Chỉ mở lại khi gửi mã mới.
- Lỗi hiện trong vùng `role="alert"`. Ô nhập có `aria-invalid="true"` khi sai.
- Đồng hồ không đọc mỗi giây. Chỉ thông báo một lần khi còn 1 phút và khi hết hạn.

### 4.3 Thông báo

| Tình huống | Copy |
|---|---|
| Chưa đủ 6 số | Nhập đủ 6 chữ số. |
| Sai mã | Mã chưa đúng. Kiểm tra lại mã trong thư. Bạn còn {n} lần thử. |
| Mã hết hạn | Mã đã hết hạn. Bấm “Gửi lại mã” để nhận mã mới. |
| Sai quá 5 lần | Bạn đã nhập sai quá 5 lần. Bấm “Gửi lại mã” để nhận mã mới. |
| Đã gửi lại | Đã gửi mã mới tới {email}. Kiểm tra hộp thư, kể cả thư rác. |
| Gửi mail thất bại (502) | Chưa gửi được mã xác minh. Hãy thử lại sau ít phút. Nếu vẫn chưa nhận được mã sau vài phút, liên hệ Phòng CNTT. |
| Đợi trước khi gửi lại | Vừa gửi mã. Hãy đợi {n} giây rồi thử lại. |

---

## 5. Bước 3: Đặt mật khẩu (đề xuất, cần duyệt)

### 5.1 Lý do

- Hiện tại, khi có người đăng ký bằng một email chưa xác minh, server ghi đè tên và mật khẩu của bản ghi đó (`services/auth/index.js`, nhánh `existing`). Người đó có thể đặt mật khẩu của họ trước. Chủ email nhận mã xác minh, nhưng mật khẩu của người kia vẫn còn hiệu lực sau khi chủ email xác minh.
- Đặt mật khẩu sau khi xác minh chặn đúng rủi ro này: chỉ người nhận được mã mới đặt được mật khẩu.
- Chính server đã ghi nhận cùng rủi ro cho đăng nhập OAuth (`signInOAuthUser`: mật khẩu chưa xác minh "có thể do người khác đặt trước, nên bỏ đi").

### 5.2 Ba lựa chọn

| Lựa chọn | Mô tả | Ưu | Nhược | Khuyến nghị |
|---|---|---|---|---|
| A. Mật khẩu sau xác minh | Bước 1 không hỏi mật khẩu. Bước 3 hỏi sau khi mã đúng. | Chặn việc đặt mật khẩu thay người khác. | Thêm 30 đến 60 giây. Cần API mới và luồng tiếp tục (mục 9). | Đề xuất |
| B. Giữ như hiện tại | Mật khẩu ở bước 1. | Ít bước. Không đổi API. | Còn rủi ro ở mục 5.1. | Không đề xuất |
| C. Không mật khẩu | Đăng nhập bằng mã OTP mỗi lần. | Không có mật khẩu để quản lý. | Mỗi lần vào phải chờ thư. Gửi thư qua Gmail cá nhân có hạn mức khoảng 500 thư mỗi ngày (ghi chú quyết định dự án). | Chỉ cân nhắc nếu hạn mức thư đủ cho số người dùng thử nghiệm. |

### 5.3 Tiêu chí mật khẩu

| Mức | Điều kiện | Xử lý |
|---|---|---|
| Bắt buộc | Từ 10 đến 128 ký tự (khớp server) | Chặn nút Tiếp tục |
| Bắt buộc | Không giống email, không giống phần trước dấu @ của email, không giống họ tên | Chặn, hiện thông báo |
| Bắt buộc | Không nằm trong danh sách mật khẩu phổ biến (server giữ danh sách) | Chặn, hiện thông báo |
| Khuyến nghị | Có chữ hoa và chữ thường | Chỉ hiện trong checklist |
| Khuyến nghị | Có số hoặc ký tự đặc biệt | Chỉ hiện trong checklist |
| Không bắt buộc | Ký tự đặc biệt | Không yêu cầu. Chỉ khuyến nghị. |

### 5.4 Thanh độ mạnh

- Bốn đoạn, mỗi đoạn 25%. Kèm chữ: **Yếu**, **Trung bình**, **Khá**, **Mạnh**.
- Cách tính (đề xuất, không phải thuật toán chặt):
  - Yếu: chưa đạt tiêu chí bắt buộc.
  - Trung bình: đạt bắt buộc, chưa có khuyến nghị nào.
  - Khá: đạt bắt buộc, có một nhóm khuyến nghị trở lên.
  - Mạnh: đạt bắt buộc, có hai nhóm khuyến nghị, từ 14 ký tự trở lên.
- Không dùng màu làm dấu hiệu duy nhất. Thanh có chữ mức. Checklist ghi rõ "Đạt" hoặc "Chưa đạt" cho từng mục.
- Trình đọc màn hình chỉ được báo khi mức thay đổi, trễ 500 ms.

### 5.5 Màn hình và copy

- Tiêu đề: **Đặt mật khẩu**.
- Mô tả: "Email đã được xác minh. Đặt mật khẩu để lần sau đăng nhập nhanh hơn. Đừng dùng lại mật khẩu của dịch vụ khác."
- Ô **Mật khẩu mới**. Gợi ý: "Ít nhất 10 ký tự. Nên kết hợp chữ hoa, chữ thường và số." `autocomplete="new-password"`. Nút bật tắt hiện mật khẩu: "Hiện mật khẩu" và "Ẩn mật khẩu" (dùng `aria-pressed`). Mặc định ẩn.
- Ô **Nhập lại mật khẩu** (đề xuất, xem mục 15, câu 2). Lỗi: "Hai mật khẩu chưa khớp."
- Checklist: "Ít nhất 10 ký tự: Đạt / Chưa đạt"; "Không giống email hoặc họ tên"; "Không phổ biến"; "Có chữ hoa và chữ thường (khuyến nghị)"; "Có số hoặc ký tự đặc biệt (khuyến nghị)".
- Nút chính: **Lưu mật khẩu và tiếp tục**. Khi đang lưu: "Đang lưu…".
- Lỗi:
  - "Mật khẩu cần ít nhất 10 ký tự."
  - "Mật khẩu không được giống email hoặc họ tên."
  - "Mật khẩu này quá phổ biến. Hãy chọn mật khẩu khác."
  - "Mật khẩu tối đa 128 ký tự."
- Không lưu mật khẩu vào bộ nhớ trình duyệt. Xoá ô mật khẩu sau khi lưu xong.

---

## 6. Bước 4: Tạo nhân vật

### 6.1 Khung chung

- Tiêu đề: **Tạo nhân vật của bạn**. Mô tả: "Mọi mục đã có sẵn lựa chọn. Bạn có thể giữ nguyên, chỉnh vài mục, và đổi lại bất cứ lúc nào trong văn phòng."
- Nút ở đầu bước, luôn có: **Bỏ qua, dùng mặc định** (lưu mặc định và sang bước 5). Nút **Ngẫu nhiên** và **Khôi phục mặc định**.
- Bố cục desktop: hai cột. Trái là các tab: **Dáng và da**, **Tóc và mắt**, **Trang phục**, **Phụ kiện**, **Xem lại**. Phải là khung xem trước 3D rộng khoảng 40%, cố định khi cuộn. Tab điều hướng bằng mũi tên trái và phải.
- Thanh dưới: **Quay lại** (ẩn ở tab đầu), **Tiếp tục** (sang tab kế). Ở tab cuối, nút là **Lưu nhân vật và tiếp tục**.
- **Ngẫu nhiên**: chọn ngẫu nhiên giá trị có trong danh mục. Không chọn cùng lúc nơ và cà vạt. Tối đa 3 phụ kiện. Thông báo: "Đã chọn ngẫu nhiên. Bạn có thể chỉnh lại từng mục." Kèm nút **Hoàn tác** trong 8 giây.
- **Khôi phục mặc định**: đặt về `DEFAULT_APPEARANCE`. Thông báo: "Đã khôi phục mặc định." Kèm **Hoàn tác** trong 8 giây.
- Thay đổi hiện ngay trong khung 3D. Không cần chờ lưu. Chỉ lưu khi bấm nút cuối (AVATAR_SPEC mục 7.1 giới hạn 1 lần mỗi 5 giây).
- Bản tóm tắt bằng chữ cho trình đọc màn hình, cập nhật sau khi đổi (aria-live polite, trễ 500 ms). Ví dụ: "Dáng vừa, tông da 2, tóc ngắn gọn, nâu rất đậm, sơ mi và quần tây, phụ kiện: thẻ tên, đồng hồ."

### 6.2 Các mục chọn

#### 6.2.1 Dáng và da (tab 1)

- Nhóm **Kiểu dáng** (radio, 3 lựa chọn): "Dáng thanh", "Dáng vừa" (mặc định), "Dáng chắc". Gợi ý nhỏ: "Chỉ thay đổi ngoại hình trong văn phòng."
- Nhóm **Màu da** (6 ô, sắp từ sáng đến sẫm). Nhãn chữ bắt buộc:
  - "Tông 1 (sáng nhất)", "Tông 2 (mặc định)", "Tông 3", "Tông 4", "Tông 5", "Tông 6 (sẫm nhất)".
  - Giá trị hex lấy từ `SKIN_TONES`. Không dùng tên gọi theo màu da của con người.

#### 6.2.2 Tóc và mắt (tab 2)

- Nhóm **Kiểu tóc**: 8 thẻ, lưới 4 cột trên desktop và 2 cột trên điện thoại. Mỗi thẻ có nhãn, ảnh minh hoạ và mô tả thay thế (alt text) như bảng dưới.

| Nhãn | Mã trong `appearance.ts` | Mô tả minh hoạ (alt text) | Gợi ý mã trong AVATAR_SPEC |
|---|---|---|---|
| Ngắn gọn (mặc định) | `short` | Tóc ngắn, rẽ ngôi một bên, gọn sát đầu. | H01 |
| Bob ngang vai | `bob` | Tóc ngang vai, đuôi tóc hơi vào trong. | H03 hoặc H04 |
| Dài thẳng | `long` | Tóc dài quá vai, thẳng, không uốn. | H09 |
| Búi cao | `bun` | Tóc vén lên và búi gọn cao sau đầu. | H06 |
| Vuốt ngược | `spiky` | Tóc ngắn, vuốt ngược lên, phồng ở đỉnh đầu. | H02 |
| Xoăn ngắn | `curly` | Tóc ngắn, xoăn tự nhiên, nhiều lọn nhỏ. | H08 |
| Cắt sát | `buzz` | Tóc cắt rất ngắn, sát da đầu. | H07 (chưa khớp, cần đội 3D xác nhận) |
| Đuôi ngựa | `ponytail` | Tóc buộc cao sau đầu, đuôi tóc rủ xuống. | H05 |

- Nhóm **Màu tóc** (6 ô, có nhãn chữ): "Nâu rất đậm (mặc định, #2b1d14)", "Nâu đậm (#3b2a1f)", "Nâu hạt dẻ", "Nâu vàng", "Vàng nhạt", "Xám bạc". Hex của 4 màu sau do đội 3D chốt.
- Nhóm **Màu mắt** (4 ô, có nhãn chữ): "Nâu (mặc định, #3b2a1e)", "Nâu đen", "Xám", "Xanh lục". Hex của 3 màu sau do đội 3D chốt. Số lượng cần duyệt (mục 15, câu 6).

#### 6.2.3 Trang phục (tab 3)

- Nhóm **Trang phục** theo 4 nhóm. Mỗi nhóm là một nút phân đoạn (segmented control). Mô tả minh hoạ bên dưới là đề xuất của UX, AVATAR_SPEC chưa mô tả các trang phục này.

| Nhóm | Nhãn | Mã | Mô tả minh hoạ (alt text) |
|---|---|---|---|
| Ngày thường | Thường ngày | `casual` | Áo thun cổ tròn và quần kaki. |
| Ngày thường | Váy | `dress` | Váy ngắn gọn, dáng suông. |
| Công sở | Sơ mi, quần tây | `shirt-tie` (mặc định) | Sơ mi trắng hoặc xanh nhạt, quần tây. |
| Công sở | Sơ mi và vest | `blazer` | Sơ mi và vest navy hoặc xám. |
| Lễ | Áo dài | `ao-dai` | Áo dài truyền thống. |
| Lễ | Bộ dự tiệc | `party-suit` | Bộ dự tiệc, sơ mi màu sáng. |
| Văn nghệ | Đồng phục văn nghệ | `uniform-karaoke` | Áo sơ mi đồng phục, quần đen, dùng cho biểu diễn. |

- Nhóm **Màu áo** (6 ô). Mặc định `#e8edf3` ("Trắng xám"). Các màu khác do đội 3D chốt hex.
- Nhóm **Màu quần, váy** (6 ô). Mặc định `#2e3a4f` ("Xanh navy đậm"). Các màu khác do đội 3D chốt hex.
- Nhóm **Giày** (3 lựa chọn): "Giày da" (`oxford`, mặc định), "Giày cao gót" (`heels`), "Giày thể thao" (`sneakers`). Nhãn cần duyệt để trung tính giới tính (mục 15, câu 9).

#### 6.2.4 Phụ kiện (tab 4)

- Danh sách ô chọn nhiều, có nhãn và mô tả ngắn. Tối đa 6 phụ kiện. Khi đủ 6, các ô còn lại bị vô hiệu hoá và có thông báo: "Đã chọn tối đa 6 phụ kiện. Bỏ chọn một mục để thêm mục khác."
- Nơ và cà vạt là nhóm "Cổ áo", chỉ chọn một. Thông báo: "Nơ và cà vạt không dùng cùng lúc. Chọn một trong hai."

| Nhãn | Mã | Mô tả | Trạng thái |
|---|---|---|---|
| Thẻ tên | `name-badge` (mặc định) | Thẻ tên đeo ngực. | Có |
| Đồng hồ | `watch` | Đồng hồ đeo tay. | Có |
| Kính | `glasses` | Kính gọng mảnh. | Có |
| Dây đeo thẻ | `lanyard` | Dây đeo cổ, đỡ thẻ tên. | Có |
| Ghim cài áo | `pin-brooch` | Ghim nhỏ cài ở ngực trái. | Có |
| Khuy măng sét | `cufflinks` | Khuy tay áo, một cái mỗi cổ tay. | Có |
| Khăn quàng | `scarf` | Khăn mỏng quàng cổ. | Có |
| Nơ bướm | `bowtie` | Nơ bướm ở cổ áo. | Có (nhóm Cổ áo) |
| Mũ tiệc | `hat-party` | Mũ dùng cho sự kiện. | Có |
| Cúc áo | chưa có | Hàng cúc áo sơ mi. | Ẩn cho đến khi có trong danh mục (mục 15, câu 8) |
| Cà vạt | chưa có | Cà vạt cho bộ công sở. | Ẩn cho đến khi có trong danh mục (mục 15, câu 8) |

#### 6.2.5 Xem lại (tab 5)

- Mỗi mục là một dòng tóm tắt, có liên kết **Sửa** đưa về đúng tab. Ví dụ: "Dáng: Dáng vừa", "Màu da: Tông 2", "Tóc: Ngắn gọn, nâu rất đậm", "Trang phục: Sơ mi và quần tây", "Phụ kiện: Thẻ tên, Đồng hồ".
- Nút: **Quay lại chỉnh sửa** và **Lưu nhân vật và tiếp tục**.

### 6.3 Xem trước 3D

| Thành phần | Quy định | Mục tiêu (chưa đo) |
|---|---|---|
| Hình người dự phòng (`FallbackAvatar`, hình học, màu theo đỉnh, không tải file) | Luôn dùng trong bước 4. | Hiện trong 1,5 giây sau khi mở bước 4 trên mạng văn phòng. Không quá 3 giây trên máy yếu. |
| VRM đầy đủ | Không tải trong bước 4 (đề xuất, mục 15, câu 11). Tải khi vào văn phòng, thay thế hình dự phòng khi xong. | Dưới 10 giây trên 10 Mbps. Ước tính: base body ≤ 6 MB (AVATAR_SPEC mục 1.7) cần khoảng 5 giây ở 10 Mbps. |
| Đổi tuỳ chọn | Đổi lớp hoặc phụ kiện, không tải lại. | Phản hồi trong 100 ms. |
| Xoay | Kéo chuột. Phím ← và →. Nút **Xoay trái**, **Xoay phải**, **Đặt lại góc nhìn**. | Không áp dụng. |
| Không có WebGL hoặc mất ngữ cảnh đồ hoạ | Hiện ảnh tĩnh của lựa chọn hiện tại. Thông báo: "Không hiển thị được xem trước 3D. Bạn vẫn có thể chọn và lưu nhân vật." | Không áp dụng. |
| Lỗi tải hình dự phòng | "Không tải được xem trước." Kèm nút **Thử lại**. | Không áp dụng. |
| Giảm chuyển động (`prefers-reduced-motion`) | Không tự xoay, không hiệu ứng. Chỉ xoay khi người dùng thao tác (DESIGN_V2 mục 1.1 và 1.5). | Không áp dụng. |

- Canvas có `aria-label`: "Xem trước nhân vật". Tóm tắt bằng chữ ở mục 6.1 là nội dung thay thế cho trình đọc màn hình.

### 6.4 Lưu và trạng thái mạng

- Lưu một lần khi bấm nút cuối. Trạng thái: "Đang lưu nhân vật…", rồi "Đã lưu nhân vật." (aria-live polite).
- Bản nháp: lưu giá trị appearance trong `localStorage`, không lưu email, tên, mật khẩu hay mã. Xoá khi lưu thành công. Bọc try/catch. Nếu không dùng được, chỉ giữ trong bộ nhớ của trang.
- Mất mạng khi lưu: "Chưa lưu được nhân vật. Bản của bạn vẫn còn trên máy này. Kiểm tra mạng rồi bấm “Thử lưu lại”." Tự thử lại một lần khi trình duyệt báo có mạng.
- Hết phiên khi lưu: xem mục 8.
- Server: kiểm tra qua `normalizeAppearance`, tối đa 6 phụ kiện (AVATAR_SPEC mục 7.1), ghi audit log (PROMPT_phong_CNTT.md mục 6: mọi ghi dữ liệu phải có bản ghi audit).

### 6.5 Bản đồ tuỳ chọn sang `appearance.ts`

| Mục UX | Trường | Giá trị | Mặc định |
|---|---|---|---|
| Kiểu dáng | `bodyType` | `slim` / `regular` / `broad` | `regular` |
| Màu da | `skinTone` | 0 đến 5 (chỉ số trong `SKIN_TONES`) | 1 (Tông 2) |
| Kiểu tóc | `hairStyle` | 8 giá trị (bảng 6.2.2) | `short` |
| Màu tóc | `hairColor` | hex | `#2b1d14` |
| Màu mắt | `eyeColor` | hex | `#3b2a1e` |
| Trang phục | `outfit` | 7 giá trị (bảng 6.2.3) | `shirt-tie` |
| Màu áo | `topColor` | hex | `#e8edf3` |
| Màu quần, váy | `bottomColor` | hex | `#2e3a4f` |
| Giày | `shoes` | `oxford` / `heels` / `sneakers` | `oxford` |
| Phụ kiện | `accessories` | mảng mã, tối đa 6 | `["name-badge"]` |

- `normalizeAppearance` thay giá trị sai bằng mặc định mà không báo lỗi. UI phải gửi đúng mã để không mất lựa chọn một cách âm thầm.

---

## 7. Bước 5: Hướng dẫn nhanh

- Tiêu đề: **Hướng dẫn nhanh**. Mô tả: "Mất khoảng 1 phút. Bạn có thể bỏ qua và xem lại trong menu Trợ giúp."
- Sáu thẻ:

| Thẻ | Copy |
|---|---|
| Di chuyển | Nhấn W, A, S, D hoặc phím mũi tên để đi lại. Kéo chuột để xoay góc nhìn. |
| Tương tác | Đến gần vật thể có viền sáng, nhấn E hoặc bấm vào vật thể để mở thông tin hoặc chức năng. |
| Khu trò chơi | Chơi giải trí cùng đồng nghiệp trong giờ nghỉ. |
| Karaoke | Phòng karaoke nội bộ để hát cùng nhau. |
| Giao lưu văn nghệ | Sân khấu cho các buổi biểu diễn và giao lưu nội bộ. |
| Service Desk | Quầy hỗ trợ ảo. Mở “Yêu cầu hỗ trợ” để tạo yêu cầu và theo dõi trạng thái. |

- Dòng phím tắt: "Esc đóng bảng thông tin. Tab chuyển giữa các nút. Bản đồ nhỏ ở góc trên bên phải." (theo PROMPT_phong_CNTT.md mục điều khiển).
- Gợi ý: "Xem lộ trình hội nhập tại Sảnh onboarding. Thông tin cá nhân chỉ hiện với bạn."
- Nút: **Bắt đầu** (chính) và **Bỏ qua** (phụ). Hai nút đều ghi `welcomeSeenAt` lên server. Từ lần sau, bước này không tự hiện. Mở lại từ menu **Trợ giúp**.
- Điện thoại: chỉ hiện các thẻ về phím và chuột nếu văn phòng hỗ trợ điều khiển cảm ứng (mục 15, câu 10). Nếu không, thay bằng hướng dẫn chạm.

---

## 8. Trạng thái, lỗi và tình huống bất thường

| Tình huống | Hiển thị | Người dùng làm gì | Ghi chú kỹ thuật |
|---|---|---|---|
| Mất mạng ở bước 1, 2, 3 | "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại." | Bấm **Thử lại**. Giữ họ tên và email. | Lỗi status 0 trong `api.ts`. |
| Mất mạng khi lưu nhân vật | "Chưa lưu được nhân vật. Bản của bạn vẫn còn trên máy này. Kiểm tra mạng rồi bấm “Thử lưu lại”." | Bấm **Thử lưu lại**. | Bản nháp trong `localStorage` (mục 6.4). |
| Email đã có tài khoản đã xác minh | "Email này đã có tài khoản. Hãy đăng nhập để tiếp tục." | Bấm **Đăng nhập với email này**. | Server trả 409 hiện tại. Xem mục 15, câu 4. |
| Hết phiên giữa bước 3 hoặc 4 | "Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục. Bản nhân vật của bạn vẫn được giữ." | Đăng nhập lại. Quay về đúng bước. | Xoá ô mật khẩu. Không lưu mật khẩu. Nhân vật lấy từ bản nháp. |
| Lỗi gửi mail (502) | "Chưa gửi được mã xác minh. Hãy thử lại sau ít phút. Nếu vẫn chưa nhận được mã sau vài phút, liên hệ Phòng CNTT." | Thử lại sau. | Không cho gửi lại vô hạn. Nút gửi lại vẫn theo 60 giây. |
| Gửi quá nhiều lần | "Bạn thao tác quá nhiều lần. Thử lại sau ít phút." | Chờ. | Server 429 chung. |
| Đăng nhập sai nhiều lần | "Đăng nhập sai quá nhiều lần. Thử lại sau {n} phút." | Chờ. | Server khoá 15 phút (`LOGIN_LOCK_MIN`). Hiển thị đúng như server trả. |
| Sai hoặc hết hạn mã | Xem mục 4.3. | Xem mục 4.3. | Xem mục 4.2. |
| Xem trước 3D lỗi | "Không hiển thị được xem trước 3D. Bạn vẫn có thể chọn và lưu nhân vật." | Chọn tiếp. | Mục 6.3. |
| Id tuỳ chọn lạ hoặc lỗi dữ liệu | Không báo lỗi người dùng. | Không cần làm gì. | Dùng mặc định và ghi log (AVATAR_SPEC mục 7.3). |
| Máy chủ lỗi 500 | "Máy chủ đang gặp lỗi. Thử lại sau." | Thử lại. | Không cho gửi lại vô hạn. |
| Email đăng nhập bằng OAuth | "Tài khoản này đăng nhập bằng Google/Microsoft." | Dùng nút nhà cung cấp. | Chỉ hiện khi nhà cung cấp đã bật (mục 14). |

---

## 9. Đăng ký lại và tiếp tục từ bước dừng

Trạng thái lấy từ server (trường `onboarding` trong `/api/auth/me`, đề xuất mục 14). Không dùng trạng thái trên máy làm nguồn chính.

| Trạng thái trên server | Lần sau vào | Ghi chú |
|---|---|---|
| Chưa xác minh email | Bước 2. Nếu đã qua 60 giây, cho gửi lại mã. Nếu chưa, hiện đồng hồ đếm. | Mã cũ đã hết hạn thì phải gửi lại. |
| Đã xác minh, chưa có mật khẩu, còn phiên | Bước 3. | Đây là trường hợp đóng trình duyệt sau bước 2. |
| Đã xác minh, chưa có mật khẩu, hết phiên | Màn đăng nhập, hiện: "Bạn chưa đặt mật khẩu. Nhập email để nhận mã và tiếp tục đăng ký." Sau khi xác minh, vào bước 3. | Hiện server trả "đăng nhập bằng Google/Microsoft" (sai). Phải sửa (mục 14). |
| Có mật khẩu, chưa có nhân vật | Bước 4, hiện mặc định. Khôi phục bản nháp trong trình duyệt nếu còn. | Bản nháp chỉ có ở máy đã dùng. Máy khác bắt đầu từ mặc định. |
| Có nhân vật | Vào văn phòng ngay. | Không hiện lại bước 4 và 5. |
| Có nhân vật, chưa xem hướng dẫn | Vào văn phòng. Hướng dẫn chỉ mở từ menu **Trợ giúp**. | Khớp yêu cầu "vào thẳng văn phòng". |
| Đăng nhập OAuth (khi bật sau này) | Bỏ bước 3 vì không có mật khẩu. Vào theo trạng thái nhân vật. | OAuth đang tắt theo quyết định dự án. |

- Đóng trình duyệt giữa bước 2: mã còn hiệu lực đến khi hết 10 phút. Nếu hết, phải gửi lại.
- Đóng trình duyệt giữa bước 4: bản nháp còn trên máy đó. Không có tài khoản mới nào bị tạo thêm.

---

## 10. Vai trò và phòng ban

- Không có ô chọn vai trò trong luồng. Vai trò do server gán, mặc định là "Nhân viên" (`role` mặc định `employee` trong `services/auth/db.js`). PROMPT_phong_CNTT.md mục 3 ghi vai trò lấy từ nhóm SSO, người dùng không tự khai.
- Phòng ban: khi `department` là `null` (kiểu `AuthUser`), hiện chip **Phòng ban: Đang chờ gán phòng ban** trong hồ sơ và dưới thẻ tên. Chip dùng màu trung tính, có biểu tượng đồng hồ và chữ. Không dùng màu đỏ hoặc từ "thiếu" hay "lỗi".
- Không chặn vào văn phòng. Lần đầu vào, hiện thông báo nhỏ có thể đóng: "Quản trị sẽ gán phòng ban cho bạn. Bạn vẫn dùng đầy đủ văn phòng."
- Khi quản trị gán phòng ban, chip đổi thành tên phòng ban. Người dùng không cần làm gì.

---

## 11. Trợ năng

- Mọi bước dùng được bằng bàn phím. Thứ tự Tab theo thứ tự đọc. Enter gửi form. Esc đóng bảng trợ giúp và bảng thông tin. Mũi tên trong nhóm radio và tab.
- Mỗi ô có nhãn hiển thị, không chỉ dùng placeholder. Gợi ý nối bằng `aria-describedby`.
- Lỗi: ô có `aria-invalid="true"`. Thông báo lỗi có `role="alert"`. Thông báo trạng thái (đã gửi, đã lưu) có `role="status"`.
- Ô chọn có nhãn chữ, ví dụ "Tông 3 trên 6, vừa". Nhóm radio dùng `role="radiogroup"`. Nút bật tắt dùng `aria-pressed`.
- Mỗi ảnh minh hoạ tóc có `alt` là mô tả ở mục 6.2.2.
- Không dùng màu làm dấu hiệu duy nhất. Lựa chọn đang chọn có viền dày, dấu tích và chữ. Thanh độ mạnh có chữ mức. Lỗi có chữ và biểu tượng.
- Tương phản (đã tính bằng script, ngưỡng WCAG AA 4,5:1 cho chữ thường):
  - `--text` #e8edf7 trên `--panel` #171e33: 14,09:1.
  - `--muted` #9aa8c7 trên #171e33: 6,93:1.
  - Lỗi #ff9b9f trên #171e33: 8,22:1.
  - Chữ trắng trên nút #2563eb: 5,17:1.
  - `--accent` #4f8cff trên #171e33: 5,14:1.
  - Các màu này lấy từ `src/styles.css` và `src/auth/auth.css`. Bảng màu S1 trong DESIGN_V2 cũng đạt, ví dụ `ink` #1F262D trên #F4F1EA: 13,56:1.
- Vùng chạm tối thiểu 40 px (DESIGN_V2 mục 1.5).
- Cỡ chữ tối thiểu 14 px cho mọi chữ trên luồng này. DESIGN_V2 có cấp 12 px, không dùng ở đây.
- Focus rõ: viền 2 px, màu `--accent` (đã có trong `auth.css`).
- Chuyển động: không có chuyển cảnh khi bật giảm chuyển động. Không tự xoay 3D.
- Không có giới hạn thời gian làm bài. Chỉ mã OTP có hạn, và có báo trước 1 phút.
- `lang="vi"` trên trang. Số và ngày đọc đúng định dạng.
- Mọi thao tác trong bước 5 và phím tắt không bắt buộc dùng chuột.

---

## 12. Điện thoại (dưới 400 px)

- Mọi bước xếp dọc một cột. Nút chiếm hết chiều rộng.
- Lưới: kiểu tóc 2 cột. Màu da 3 cột, 2 hàng. Trang phục 2 cột. Phụ kiện 1 cột.
- Khung xem trước đứng đầu, cao 220 đến 240 px. Có nút **Hiện ảnh tĩnh** để tiết kiệm dữ liệu và pin.
- Thanh tab bước 4 thành một ô chọn (`select`) với nhãn "Mục đang chỉnh", vì 5 tab không vừa một hàng và không được cuộn ngang cả trang.
- Nút **Tiếp tục** dính đáy, có khoảng trống cho vùng an toàn của thiết bị.
- Không cuộn ngang. Lề hai bên ít nhất 16 px.
- Bàn phím ảo không che ô đang nhập. Trang tự cuộn tới ô đang focus.
- Chữ không nhỏ hơn 14 px.

---

## 13. Số liệu và sự kiện đo lường

| Sự kiện | Khi nào | Thuộc tính (không có dữ liệu cá nhân) |
|---|---|---|
| `onboarding_step_view` | Mở một bước | `step` (1 đến 5), `resumed` (đúng hoặc sai) |
| `onboarding_step_done` | Hoàn tất một bước | `step`, `duration_bucket` (dưới 30 giây, 30 đến 120 giây, trên 120 giây) |
| `otp_sent` | Server gửi mã | `reason`: `register`, `resend`, `login` |
| `otp_result` | Kết quả xác minh | `result`: `ok`, `wrong`, `expired`, `locked` |
| `password_set` | Lưu mật khẩu thành công | `strength` (chỉ mức, không có nội dung mật khẩu) |
| `appearance_saved` | Lưu nhân vật | `used_defaults`, `used_random`, `changed_count` (số mục khác mặc định) |
| `appearance_save_failed` | Lưu lỗi | `reason`: `network`, `auth`, `server` |
| `preview_ready` | Xem trước hiện lên | `ms` (làm tròn), `mode`: `fallback`, `static` |
| `preview_failed` | Xem trước không hiện | `reason`: `no_webgl`, `context_lost`, `load_error` |
| `welcome_done` | Bắt đầu hoặc bỏ qua bước 5 | `action`: `start`, `skip` |
| `onboarding_completed` | Vào văn phòng lần đầu | `total_bucket` |
| `session_expired_in_flow` | Hết phiên giữa luồng | `step` |

- Không ghi email, họ tên, mật khẩu, mã OTP, nội dung ô nhập, địa chỉ IP thô.
- Định danh người dùng bằng mã băm có muối của id nội bộ, để đếm phễu mà không lộ danh tính.
- Gửi về hệ thống nội bộ. Không dùng dịch vụ phân tích bên ngoài (PROMPT_phong_CNTT.md mục 2).
- Thời gian giữ sự kiện thô: đề xuất 90 ngày. Sau đó chỉ giữ số tổng hợp (mục 15, câu 12).

**Chỉ số:**

- Tỉ lệ hoàn tất bước n = số người có `onboarding_step_done` bước n / số người có `onboarding_step_view` bước n.
- Thời gian bước n = trung vị khoảng cách từ lần xem đầu đến lần hoàn tất. Dùng trung vị, không dùng trung bình, vì phiên bỏ dở làm lệch trung bình.
- Điểm thoát = bước có nhiều người xem nhất nhưng không hoàn tất, và không có sự kiện tiếp theo trong 30 phút.
- Mục tiêu đề xuất, chỉ đặt sau khi đo nền 2 tuần: bước 1 và 2 từ 90%; bước 3 từ 90%; bước 4 từ 80%; cả luồng từ 75%.

---

## 14. Điểm lệch so với hiện trạng và yêu cầu với đội API và 3D

### 14.1 Hiện trạng cần sửa

| # | Hiện trạng (file, dòng) | Vấn đề | Đề xuất | Ai xử lý |
|---|---|---|---|---|
| 1 | `services/auth/index.js` nhánh `existing` (dòng 106) ghi đè tên và `password_hash` khi email chưa xác minh. | Người khác đặt mật khẩu trước bằng email của bạn. | Bước 1 không nhận mật khẩu (lựa chọn A). | ONBOARD-API, UX |
| 2 | `services/auth/index.js` dòng 176 đến 178: tài khoản không có `password_hash` trả "đăng nhập bằng Google/Microsoft". | Sai với tài khoản đã xác minh nhưng chưa đặt mật khẩu. | Trả mã `password_not_set`. UI mở luồng gửi mã. | ONBOARD-API |
| 3 | `services/auth/index.js` dòng 98: trả 409 "Email này đã đăng ký". | Lộ tài khoản tồn tại. Khác với gửi lại mã (dòng 152), vốn luôn trả 200. | Xem mục 15, câu 4. | Người duyệt |
| 4 | `src/auth/AuthScreen.tsx` dòng 364 đến 365: "Nếu server đang ở chế độ thử nghiệm, mã nằm trong log server." | Lộ chi tiết vận hành cho người dùng cuối. | Chỉ bật ở môi trường dev. | Frontend |
| 5 | `src/auth/AuthScreen.tsx` dòng 448 đến 458: "Chưa cấu hình (cần client ID)". | Thông tin kỹ thuật cho người dùng. OAuth đang để sau (quyết định dự án). | Ẩn nút OAuth khi chưa bật. | Frontend |
| 6 | `src/auth/auth.css`: `.auth-divider` 12 px; `.auth-error`, `.auth-info`, `.auth-link` 13 px. | Dưới 14 px. | Tối thiểu 14 px. | Frontend |
| 7 | `src/avatar/appearance.ts`: không có `buttons` và `necktie`. Không giới hạn 6 phụ kiện. Có 3 dáng thân (AVATAR_SPEC bản đầy đủ: 2). 8 kiểu tóc (AVATAR_SPEC: 10, H01 đến H10). | Lệch yêu cầu và spec. | Xem mục 15, câu 6 đến 8. | 3D, ONBOARD-API |
| 8 | `src/avatar/appearance.ts` gộp áo, vest, quần vào một `outfit`. AVATAR_SPEC tách lớp `shirt`, `vest`, `bottom` và theme `office-a`, `office-b`. | Ảnh hưởng cách dựng nhân vật. | Đội 3D xác nhận cấu trúc. | 3D |
| 9 | `FallbackAvatar` chỉ được nhắc trong comment của `appearance.ts`. Chưa có file component. | Xem trước 3D (mục 6.3) phụ thuộc vào nó. | Tạo component trước khi làm bước 4. | 3D |
| 10 | AVATAR_SPEC mục 1.7: base body 1 tải lần đầu để người dùng thấy mình. Yêu cầu này: VRM tải sau. | Hai ưu tiên xung đột. | Xem mục 15, câu 11. | Người duyệt |

### 14.2 Đề xuất với ONBOARD-API (tên endpoint chỉ là gợi ý)

1. `POST /api/auth/register`: không bắt buộc `password` (lựa chọn A). Trả thêm `expiresInSeconds: 600` và `resendInSeconds: 60`.
2. `POST /api/auth/verify`: khi sai mã, trả thêm `attemptsLeft`. Giữ nguyên việc tạo phiên khi xác minh thành công (đã có).
3. `POST /api/auth/resend`: giữ phản hồi 200 chung để không lộ email. Trả `resendInSeconds` còn lại.
4. Endpoint mới đặt mật khẩu cho phiên đã xác minh (ví dụ `POST /api/auth/password`): kiểm 10 đến 128 ký tự, không giống email hoặc họ tên, không nằm trong danh sách phổ biến. Trả mã lỗi để UI chọn đúng copy.
5. `POST /api/auth/login`: tài khoản đã xác minh nhưng chưa có mật khẩu trả mã `password_not_set`, thay cho thông báo Google/Microsoft.
6. `GET /api/auth/me`: thêm trường `onboarding` gồm `passwordSet`, `appearanceSaved`, `welcomeSeenAt`. `department` là `null` khi chưa gán.
7. Lưu nhân vật (ví dụ `PUT /api/avatar/appearance`): qua `normalizeAppearance`, tối đa 6 phụ kiện, giới hạn 1 lần mỗi 5 giây, ghi audit log.
8. Cờ hướng dẫn (ví dụ `POST /api/onboarding/welcome-seen`).
9. Nhận sự kiện đo lường (mục 13) ở endpoint nội bộ.

### 14.3 Đề xuất với đội 3D

- Có `FallbackAvatar` nhận đúng kiểu `Appearance` trước bước 4.
- Xác nhận cấu trúc trang phục (mục 6.2.3). Bổ sung hoặc bỏ `buttons` và `necktie` (mục 6.2.4).
- Chốt hex cho các màu chưa có (màu tóc 3 đến 6, màu mắt 2 đến 4, màu áo, màu quần, váy).
- Viết mô tả minh hoạ cho 8 kiểu tóc và 7 trang phục, và tạo ảnh minh hoạ theo giấy phép cho phép (bảng đầu DESIGN_V2, dòng 12).

---

## 15. Mục cần người dùng duyệt

1. **Thứ tự bước 3.** Chọn A (đặt mật khẩu sau xác minh, đề xuất), B (giữ mật khẩu ở bước 1), hay C (không mật khẩu, đăng nhập OTP mỗi lần).
2. **Tiêu chí mật khẩu.** Chặn "Yếu" hay chỉ cảnh báo? Có ô nhập lại mật khẩu không (đề xuất có)? Dùng danh sách mật khẩu phổ biến nào?
3. **Tên miền doanh nghiệp.** Chấp nhận mọi tên miền (hiện trạng, mỗi tên miền tạo một tenant) hay chỉ tên miền GPBank?
4. **Thông báo email đã đăng ký.** Giữ thông báo cụ thể "Email này đã có tài khoản" (lộ thông tin) hay đổi thành thông báo chung, đồng bộ với gửi lại mã?
5. **Tên hiển thị.** Đang là "Test App" (`AuthScreen.tsx` dòng 48), hay dùng "Văn phòng ảo GPBank"?
6. **Số lựa chọn ngoại hình.** Dáng thân: 3 (hiện trong code) hay 2 (AVATAR_SPEC bản đầy đủ)? Kiểu tóc: 8 (yêu cầu) hay thêm 2 để đủ 10 (AVATAR_SPEC)? Màu mắt: 4 hay 6? Màu tóc: 6?
7. **Nhóm trang phục.** Đồng ý phân nhóm như mục 6.2.3? Đầm (`dress`) đặt ở "Ngày thường" hay "Công sở"? Nhóm "Văn nghệ" hiện chỉ có một trang phục. Thêm một bộ (ví dụ `party-suit`) hay giữ nguyên?
8. **Hai phụ kiện chưa có trong danh mục.** "Cúc áo" và "Cà vạt": thêm vào `Accessory` hay ẩn khỏi bước 4 (đề xuất ẩn)?
9. **Nhãn trung tính giới tính.** Đổi "Giày cao gót" và "Váy" thành nhãn trung tính, hay giữ?
10. **Điều khiển trên điện thoại.** Văn phòng 3D có hỗ trợ cảm ứng không? Việc này quyết định bước 5 trên điện thoại (mục 7).
11. **Thời điểm tải VRM.** Khi vào văn phòng (đề xuất) hay tải nền khi bắt đầu bước 4 (AVATAR_SPEC mục 1.7 ưu tiên base body lần đầu)?
12. **Đo lường.** Giữ sự kiện thô 90 ngày được không? Có dùng mã băm của id nội bộ không?
13. **Tham số OTP.** Giữ 10 phút, 5 lần thử, 60 giây gửi lại (đúng server hiện tại)?
14. **Gửi thư.** Chấp nhận Gmail cá nhân giới hạn khoảng 500 thư mỗi ngày cho giai đoạn thử nghiệm (ghi chú dự án), hay cần kênh gửi khác trước khi mở rộng?

---

*Ghi chú cuối:* Các con số về thời gian, tỉ lệ và băng thông là mục tiêu hoặc ước tính, chưa đo trên máy thật. Tỉ lệ tương phản đã tính bằng script trên các cặp màu của `auth.css` và DESIGN_V2.
