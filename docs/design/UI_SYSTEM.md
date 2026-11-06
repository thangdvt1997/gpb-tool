# Hệ thống giao diện chung (UI_SYSTEM)

Phạm vi: lớp giao diện 2D của văn phòng ảo GPBank (màn đăng nhập, HUD, các panel ghi danh, thi đấu, kiểm duyệt, biểu cảm). Không áp dụng cho cảnh 3D, nhãn tên 3D (`.label`) và màu cảnh (`sceneFloor`, `sceneWall`, `sceneAccent`).

File CSS: `src/ui/ui-system.css`. Mọi class có tiền tố `ui-`. File này chỉ đọc biến theme có sẵn (`--bg`, `--panel`, `--line`, `--text`, `--muted`, `--accent`, `--accent-text`, `--ok`, `--warn`, `--down`, và `--auth-*`, `--brand-*` trong `.auth-page`). Biến còn thiếu được thêm với tiền tố `--ui-` ở đầu file.

## 0. Đối tượng và nhiệm vụ

- Người dùng: nhân viên ngân hàng, dùng trong giờ làm việc trên máy văn phòng và điện thoại.
- Nhiệm vụ chính của lớp 2D: ghi danh vào văn phòng, xem ai đang có mặt, thao tác nhanh (biểu cảm, thách đấu), và cho người kiểm duyệt xử lý báo cáo.
- Giọng điệu: trang trọng, rõ ràng, như một phiếu nghiệp vụ được trình bày tốt. Phần vui nhộn nằm trong cảnh 3D, không nằm trong khung giao diện.

## 1. Bảng màu

Chưa có bộ nhận diện chính thức. Hai màu thương hiệu là placeholder, đọc qua `--brand-primary` và `--brand-accent`. Giá trị hex chỉ xuất hiện một lần, làm giá trị dự phòng trong `var()` ở đầu `ui-system.css`. Khi có bộ nhận diện, chỉ cần khai báo `--brand-primary` và `--brand-accent` trên `:root` (hoặc `.auth-page`), không sửa file khác.

| Tên | Hex | Vai trò | Tương phản đã tính (WCAG 2.x) |
|---|---|---|---|
| Mực chứng từ | `#12394A` | Placeholder `--brand-primary`: nút chính, liên kết, tab đang chọn, vòng focus ở nền sáng | Chữ trắng trên nó 12.3:1. Nó trên `#FFFFFF` 12.3:1, trên `#EEF2F7` khoảng 11:1 |
| Đồng niêm phong | `#9A6B1F` | Placeholder `--brand-accent`: chỉ dùng cho đường kẻ kép dưới tiêu đề panel (chi tiết nổi bật). Không dùng cho chữ | Trên `#FFFFFF` 4.67:1, trên `#EEF2F7` khoảng 4.1:1 (đạt 3:1 cho thành phần đồ họa) |
| Đồng trên nền tối | `#D6A85A` | Placeholder `--brand-accent-on-dark`: đường kẻ kép ở theme `after-work` | Trên `#171E33` khoảng 7.6:1 |
| Giấy nghiệp vụ | `#EEF2F7` | Nền trang ở nền sáng (trùng `office-day.bg`). Xám lạnh, không phải kem | Nền |
| Mặt phiếu | `#FFFFFF` | Nền panel, hộp thoại, ô nhập (trùng `office-day.panel`) | Nền |
| Mực in | `#0F172A` | Chữ chính (trùng `office-day.text`) | Trên `#FFFFFF` 17.85:1 |
| Chì | `#4B5563` | Chữ phụ, viền ô nhập (trùng `office-day.muted`) | Trên `#FFFFFF` 7.56:1, trên `#EEF2F7` 6.72:1 |

Ghi chú: bảng có 5 màu nền và chữ dùng chung với theme `office-day` để không tạo hai nguồn sự thật. Chỉ hai màu thương hiệu (và biến thể nền tối) là mới.

### 1.1 Ánh xạ sang biến theme

`ui-system.css` dùng một lớp biến trung gian `--ui-*`. Component chỉ đọc biến `--ui-*`, không đọc thẳng `--accent`.

| Biến `--ui-*` | Mặc định (mọi theme) | `office-day` | `.auth-page` | `after-work` | `tet`, `midautumn`, `party` |
|---|---|---|---|---|---|
| `--ui-ground` (nền trang) | `--bg` | `--bg` | `--auth-bg` | `--bg` | `--bg` |
| `--ui-surface` (nền panel) | `--panel` | `--panel` | `--auth-surface` | `--panel` | `--panel` |
| `--ui-ink` (chữ chính) | `--text` | `--text` | `--auth-text` | `--text` | `--text` |
| `--ui-ink-2` (chữ phụ) | `--muted` | `--muted` | `--auth-muted` | `--muted` | `--muted` |
| `--ui-rule` (kẻ trang trí) | `--line` | `--line` | `--auth-line` | `--line` | `--line` |
| `--ui-field-line` (viền ô nhập, nút phụ) | `--muted` | `--muted` | `--auth-field-line` | `--muted` | `--muted` |
| `--ui-primary` (nút chính, focus) | `--accent` | `--brand-primary` | `--brand-primary` | `--accent` | `--accent` |
| `--ui-on-primary` (chữ trên nút chính) | `--accent-text` | trắng | trắng | `--accent-text` | `--accent-text` |
| `--ui-seal` (đường kẻ kép) | `--accent` | `--brand-accent` | `--brand-accent` | `--brand-accent-on-dark` | `--accent` |
| `--ui-danger` | `--down` | `--down` | `--auth-error` | `--down` | `--down` |
| `--ui-ok`, `--ui-warn` | `--ok`, `--warn` | như trái | `--auth-success`, `--warn` | như trái | như trái |

Lý do tách: theme nền tối (`after-work`, `tet`, `midautumn`, `party`) không thể dùng Mực chứng từ làm nút (quá tối trên panel tối). Ở các theme đó nút chính dùng `--accent` đã được đo trong `tokens.ts` (accent-text/accent ≥ 5.89:1, accent/panel ≥ 5.14:1). Theme lễ hội giữ màu nhấn riêng cho đường kẻ kép (vàng Tết, cam Trung thu).

Lưu ý hiện trạng: `auth.css` đang khai báo `--brand-primary: #0b2d5b` và `--brand-accent: #0e8a7e` trong `.auth-page`. Trong màn đăng nhập, hệ thống sẽ đọc giá trị đó cho tới khi agent phụ trách auth đổi sang placeholder mới hoặc bỏ khai báo (khi bỏ, giá trị dự phòng `#12394A` và `#9A6B1F` có hiệu lực).

## 2. Kiểu chữ

- Họ phông duy nhất: phông hệ thống có đủ dấu tiếng Việt.
  `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif`
  Windows dùng Segoe UI, macOS và iOS dùng San Francisco, Android dùng Roboto hoặc Noto Sans. Tất cả có dấu tiếng Việt đầy đủ. Không tải phông từ CDN.
- Không dùng phông thứ hai, không dùng monospace. Số liệu (giờ ghi danh, máu, đếm người) dùng `font-variant-numeric: tabular-nums` để cột số thẳng hàng như sổ sách. Đây là cách tạo tính cách bằng xử lý chữ thay vì đổi phông.

| Bậc | Cỡ | Trọng số | Chiều cao dòng | Dùng cho |
|---|---|---|---|---|
| `--ui-fs-sm` | 14px (0.875rem) | 400 | 1.45 | Chữ phụ, gợi ý, meta, nhãn trường. Cỡ nhỏ nhất của giao diện 2D |
| `--ui-fs-md` | 15px (0.9375rem) | 400, 600 cho nhãn nút | 1.5 | Chữ thường, nút, mục danh sách |
| `--ui-fs-lg` | 17px (1.0625rem) | 600 | 1.3 | Tiêu đề panel |
| `--ui-fs-xl` | 20px (1.25rem) | 600 | 1.3 | Tiêu đề hộp thoại, tiêu đề màn đăng nhập trên điện thoại |
| `--ui-fs-2xl` | 24px (1.5rem) | 600 | 1.25 | Tiêu đề màn đăng nhập trên màn rộng |
| `--ui-fs-num` | 28px (1.75rem) | 700 | 1.15 | Một con số tổng duy nhất trên panel (ví dụ số người đã ghi danh) |

- Ô nhập dùng 16px để iOS không tự phóng to.
- Trọng số chỉ có 400, 600, 700. 700 chỉ dành cho con số tổng.
- Độ dài dòng tối đa 64 ký tự cho đoạn văn (`max-width: 64ch`).
- Căn lề trái cho mọi nội dung. Chỉ con số trong cột số căn phải. Không căn giữa đoạn văn.
- Không có chữ in hoa toàn bộ, không giãn chữ (`letter-spacing`).

## 3. Bố cục

Quy tắc chung: khoảng cách theo bội số 4px (4, 8, 12, 16, 24). Lề ngoài tối thiểu 16px. Vùng chạm tối thiểu 44px. Bo góc theo thứ bậc, không đồng đều: 4px cho huy hiệu và phím tắt, 6px cho nút và ô nhập, 10px cho panel, 14px cho hộp thoại. Danh sách là các dòng kẻ như sổ cái, không phải lưới thẻ.

### 3.1 HUD

Một câu: dải nút nhỏ nằm sát mép trên trái của cảnh 3D, nền gần đặc để đọc được trên mọi cảnh, trạng thái mở thể hiện bằng viền và gạch dưới màu chính.

```
Màn rộng                                         Điện thoại (≤ 480px)
+--------------------------------------------+   +------------------------+
| Thanh trên: tên văn phòng      Tên  [Đăng xuất]| | Thanh trên             |
+--------------------------------------------+   +------------------------+
| [Biểu cảm] [Thi đấu] [Ghi danh]   +-------+ |   | [☺]  +---------------+ |
|                                   |Trận   | |   | [⚔]  | Trận đang đấu | |
|                                   |đang   | |   | [✓]  +---------------+ |
|          cảnh 3D                  |đấu    | |   |                        |
|                                   +-------+ |   |       cảnh 3D          |
+--------------------------------------------+   +------------------------+
```

Chip chỉ có biểu tượng trên điện thoại, chữ vẫn có cho trình đọc màn hình (`.ui-hud-chip-label`).

### 3.2 Bảng ghi danh

Một câu: panel có tiêu đề kèm đường kẻ kép, một con số tổng lớn, phân bổ theo phòng ban dạng dòng có thanh mảnh, và danh sách giờ ghi danh dạng sổ với cột giờ thẳng hàng.

```
+------------------------------------------+
| Ghi danh hôm nay                    [×]  |
|==========================================|  <- đường kẻ kép màu niêm phong
| 42 người đã có mặt ở tầng 7              |  <- 42 là .ui-figure
|                                          |
| Khối Công nghệ                       18  |
| ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬                       |
| Khối Bán lẻ                          12  |
| ▬▬▬▬▬▬▬▬▬▬▬▬                             |
|                                          |
| Mới ghi danh                             |  <- .ui-subhead
| 08:02   Nguyễn Văn An                    |
|         Khối Công nghệ                   |
|------------------------------------------|
| 08:05   Trần Thị Bình                    |
|         Khối Bán lẻ                      |
+------------------------------------------+
```

Lớp phủ ghi danh ở cổng (góc dưới trái) dùng cùng `.ui-panel` cộng `.ui-panel-float`:

```
+--------------------------------------+
| (✓)  Đã ghi danh lúc 08:02           |
|      Chúc anh An một ngày làm việc tốt |
| [Ghi danh]  [Để sau]                 |
+--------------------------------------+
```

### 3.3 Bảng kiểm duyệt

Một câu: panel chia tab cho Báo cáo, Người dùng, Nhật ký; mỗi báo cáo là một dòng sổ có thể mở rộng, hành động mạnh nằm trong hộp thoại xác nhận có nút nguy hiểm riêng.

```
+------------------------------------------+
| Kiểm duyệt                          [×]  |
|==========================================|
| Báo cáo (3) | Người dùng | Nhật ký       |  <- .ui-tabs, gạch dưới tab đang chọn
|------------------------------------------|
|▌Lời lẽ xúc phạm             [Chờ xử lý]  |  <- dòng đang chọn có vạch trái
|▌Báo cáo bởi Lê Chi, 09:14                |
|   Nội dung: "..."                         |
|   [Bỏ qua]  [Cảnh cáo]  [Khóa tài khoản] |
|------------------------------------------|
| Spam trong kênh chung        [Đã xử lý]  |
| Báo cáo bởi Phạm Dũng, 08:40             |
+------------------------------------------+

Hộp thoại xác nhận
+-------------------------------------+
| Khóa tài khoản Hoàng Em?            |
| Người này không vào được văn phòng  |
| cho tới khi được mở khóa.           |
| Lý do (bắt buộc)                    |
| [______________________________]    |
|                 [Hủy] [Khóa tài khoản] |
+-------------------------------------+
```

### 3.4 Bảng thi đấu

Một câu: panel gửi lời thách đấu có danh sách đồng nghiệp ở gần và chọn chế độ, cộng một banner trận đang diễn ra ở góc phải trên với hai thanh máu cạnh nhau.

```
Panel                                     Banner trận (góc phải trên)
+--------------------------------------+  +------------------------------+
| Thi đấu                         [×]  |  | Bạn và Minh       [Đang đấu] |
|======================================|  | Bạn       80   Minh       55 |
| Chế độ                               |  | ▬▬▬▬▬▬▬▬░░    ▬▬▬▬▬▬░░░░░    |
| (•) Giao hữu: không trừ điểm         |  | [Đầu hàng]                   |
| ( ) Tính điểm: ghi vào bảng xếp hạng |  +------------------------------+
|--------------------------------------|
| Đồng nghiệp ở gần                    |
| Đỗ Minh           [Thách đấu]        |
|--------------------------------------|
| Vũ Lan            [Thách đấu]        |
|--------------------------------------|
| Lời mời đến                          |
| Ngô Hải mời bạn   [Từ chối] [Nhận lời]|
+--------------------------------------+
```

### 3.5 Bảng biểu cảm

Một câu: panel nhỏ mở từ HUD, lưới hai cột các nút biểu cảm với phím tắt nằm bên phải tên, trên điện thoại thành tấm trượt từ đáy.

```
+------------------------------+
| Biểu cảm                [×]  |
|==============================|
| [Vẫy tay      1] [Vỗ tay  2] |
| [Gật đầu      3] [Cúi chào 4]|
| [Nhảy         5] [Ngồi    6] |
| [Dừng biểu cảm             ] |
| [x] Hiện biểu cảm của người khác |
+------------------------------+
```

### 3.6 Màn đăng nhập

Một câu: nền giấy nghiệp vụ toàn màn, tên văn phòng căn trái phía trên, một tờ phiếu trắng chứa form có đường kẻ kép ở đỉnh, không cột màu thương hiệu và không thẻ đổ bóng.

```
Màn rộng (≥ 768px)                              Điện thoại
+----------------------------------------------+ +------------------------+
| Văn phòng ảo GPBank                          | | Văn phòng ảo GPBank    |
| Đăng nhập để vào tầng làm việc của bạn.      | |                        |
|                                              | | +--------------------+ |
|   +--------------------------------------+   | | |====================| |
|   |======================================|   | | | Đăng nhập          | |
|   | Đăng nhập                            |   | | | Email công việc    | |
|   | [Đăng nhập | Tạo tài khoản]          |   | | | [________________] | |
|   | Email công việc                      |   | | | Mật khẩu    [Hiện] | |
|   | [________________________________]   |   | | | [________________] | |
|   | Mật khẩu                     [Hiện]  |   | | | [   Đăng nhập    ] | |
|   | [________________________________]   |   | | | Quên mật khẩu?     | |
|   | [            Đăng nhập             ] |   | | +--------------------+ |
|   | Quên mật khẩu?                       |   | +------------------------+
|   +--------------------------------------+   |
+----------------------------------------------+
```

Tờ phiếu rộng tối đa 440px, căn trái theo lưới trang trên màn rộng (cùng lề với tên văn phòng), không căn giữa tuyệt đối. Tiêu đề "Test App" được thay bằng tên văn phòng lấy từ cấu hình.

## 4. Nguyên tắc

1. **Một chi tiết nổi bật: đường kẻ kép niêm phong.** Trong sổ kế toán, kẻ hai nét dưới một dòng nghĩa là đã chốt. Hệ thống dùng đúng chi tiết này: đường kẻ kép 4px (`border-bottom: 4px double`) màu `--ui-seal` dưới tiêu đề mỗi panel và ở đỉnh tờ phiếu đăng nhập. Nó chỉ xuất hiện ở đúng hai vị trí đó. Không dùng cho nút, không dùng cho thẻ, không dùng làm trang trí phụ.
2. **Còn lại tiết chế.** Panel không đổ bóng trong luồng trang, chỉ có viền 1px. Chỉ panel nổi trên cảnh 3D và hộp thoại có bóng, và bóng pha từ màu nền của theme, không phải xám `rgba(0,0,0,.1)`.
3. **Danh sách là dòng sổ.** Mục danh sách tách bằng đường kẻ ngang, không đóng khung từng mục. Mục đang chọn có vạch trái 3px màu chính.
4. **Màu không mang thông tin một mình.** Trạng thái luôn có chữ (huy hiệu có chấm màu cộng chữ, banner có chữ mở đầu rõ nghĩa).
5. **Chuyển động chỉ đáp lại thao tác.** Hộp thoại hiện mờ 120ms, thanh máu đổi chiều rộng 200ms. Không có hiệu ứng vào trang lặp lại theo từng panel. Khi `prefers-reduced-motion: reduce`, mọi chuyển động bị tắt, spinner đứng yên và chữ trạng thái thay thế.
6. **Focus luôn thấy được.** Viền 3px màu `--ui-primary`, cách 2px. Chip HUD thêm vành nền 2px phía trong để vòng focus nổi trên mọi cảnh 3D.

## 5. Chữ trong giao diện

- Câu ngắn, động từ rõ, viết hoa đầu câu (sentence case). Không in hoa toàn bộ.
- Nút nói đúng điều sẽ xảy ra. Cùng một hành động giữ cùng một tên trong toàn luồng: nút "Ghi danh" cho thông báo "Đã ghi danh lúc 08:02".
- Lỗi nói chuyện gì đã xảy ra và cách sửa. Không xin lỗi, không mơ hồ.
- Trạng thái trống mời hành động: "Chưa có báo cáo nào cần xử lý." thay vì "Không có dữ liệu".
- Không dùng dấu mũi tên, dấu chấm giữa, gạch ngang dài làm trang trí trong chữ.

| Không dùng | Dùng | Ghi chú |
|---|---|---|
| Gửi (ở cổng ghi danh) | Ghi danh | Thông báo sau đó: "Đã ghi danh lúc 08:02" |
| Gửi (lời mời thi đấu) | Thách đấu | Thông báo: "Đã gửi lời thách đấu tới Minh" |
| OK, Đồng ý (khi nhận lời đấu) | Nhận lời | Đối lại: "Từ chối" |
| Xác nhận (khóa tài khoản) | Khóa tài khoản | Nút nguy hiểm luôn lặp lại hành động |
| Submit, Gửi (báo cáo vi phạm) | Gửi báo cáo | Sau đó: "Đã gửi báo cáo. Người kiểm duyệt sẽ xem trong giờ làm việc." |
| Đóng lại, X không nhãn | Đóng | Nút biểu tượng có `aria-label="Đóng"` |
| Lỗi! Có gì đó sai | Không ghi danh được. Kiểm tra kết nối rồi thử lại. | Lỗi có nguyên nhân và cách sửa |
| Đang tải... (chung chung) | Đang ghi danh… / Đang tải danh sách… | Nêu việc đang làm |
| Stop | Dừng biểu cảm | |
| Test App | Văn phòng ảo GPBank (lấy từ cấu hình) | Không hardcode tên |

## 6. Tự rà soát

### 6.1 Danh sách mặc định bị cấm và kết quả kiểm tra

| Mặc định bị cấm | Kết quả trong plan | Bằng chứng |
|---|---|---|
| Nền kem và nhấn đất nung | Không mắc | Nền là xám lạnh `#EEF2F7`, nhấn là đồng `#9A6B1F` chỉ dùng cho một đường kẻ, không dùng cho nút hay chữ |
| Nền đen với nhấn xanh neon | Không mắc | Không có nền đen tuyền. Theme tối dùng `#0F1424` và `--accent` đã đo. Không có xanh lá neon |
| Thẻ bo tròn đồng đều đổ bóng xám | Không mắc sau sửa | Bo góc theo thứ bậc 4, 6, 10, 14px. Panel trong luồng không có bóng. Danh sách là dòng sổ |
| Nhãn chữ hoa cách chữ rộng phía trên tiêu đề | Không mắc sau sửa | Không có eyebrow. Không có `text-transform: uppercase`, không có `letter-spacing` |
| Chuỗi meta ngăn bằng dấu chấm giữa | Không mắc sau sửa | Meta viết thành câu: "Báo cáo bởi Lê Chi, 09:14" |
| Nhãn "CHỮ — mô tả" | Không mắc sau sửa | Chế độ thi đấu viết "Giao hữu: không trừ điểm" với hai phần tách thành tên và mô tả |
| Phông monospace cho nhãn nhỏ | Không mắc sau sửa | Phím tắt `.ui-kbd` dùng phông hệ thống, viền 1px, số dạng tabular |
| Dấu mũi tên trong nút | Không mắc | Không nút nào có "→". Nút có động từ rõ |
| (Bổ sung) Bố cục kiểu báo giấy, bo góc 0, kẻ mảnh dày đặc | Không mắc | Có bo góc, chỉ một loại kẻ ngang giữa các dòng, không chia cột báo |

### 6.2 Những thay đổi sau rà soát

1. **Bảng màu.** Bản nháp đầu dùng xanh navy `#0B2D5B` cộng xanh ngọc, giống `auth.css` hiện tại. Đây là cặp "ngân hàng" mặc định, gặp ở mọi bản thiết kế tài chính. Đã đổi sang Mực chứng từ `#12394A` (xanh dầu, ngả lục) và Đồng niêm phong `#9A6B1F`, lấy từ vật liệu thật trong nghiệp vụ ngân hàng: mực ký chứng từ và con dấu, khóa két bằng đồng.
2. **Chi tiết nổi bật.** Bản nháp đầu đặt điểm nhấn ở viền trái màu nhấn của panel (giống `theme.css` hiện tại) và một gradient ở cột thương hiệu đăng nhập. Viền trái màu là mẫu thẻ thông báo thông dụng. Đã đổi sang đường kẻ kép kế toán, có nghĩa trong ngữ cảnh ngân hàng, và bỏ gradient.
3. **Huy hiệu.** Bản nháp đầu dùng huy hiệu dạng viên thuốc bo 999px (như `.duel-badge`, `.mod-badge`, `.chip`). Vượt giới hạn 14px và là mẫu SaaS. Đã đổi sang huy hiệu chữ nhật bo 4px có chấm trạng thái.
4. **Danh sách.** Bản nháp đầu đóng khung từng mục (như `.duel-item`, `.mod-item`). Đã đổi sang dòng sổ có kẻ ngang.
5. **Nhãn trên tiêu đề.** Bản nháp đầu giữ "Hôm nay" nhỏ màu phụ phía trên số tổng (như `.ci-board-kicker`) và "Bước 2/5" phía trên tiêu đề đăng ký (như `.auth-kicker`). Đã gộp vào tiêu đề: "Ghi danh hôm nay"; bước đăng ký đã có thanh tiến trình nên bỏ kicker.
6. **Meta.** Bản nháp đầu viết "Lê Chi · 09:14 · Chờ xử lý". Đã đổi thành câu và chuyển trạng thái sang huy hiệu.
7. **Phím tắt biểu cảm.** Bản nháp đầu dùng monospace. Đã đổi sang phông hệ thống.
8. **Màn đăng nhập.** Bản nháp đầu giữ thẻ form bo 16px đổ bóng kép giữa màn. Đã đổi thành tờ phiếu bo 10px, chỉ viền, căn theo lưới trái, có đường kẻ kép ở đỉnh.

## 7. Bảng thay thế: class mới thay cho mẫu cũ

Hướng dẫn cho agent áp dụng: import `src/ui/ui-system.css` một lần (sau `styles.css` và `theme.css`). Giữ class định vị cũ (ví dụ `.hud-duel`, `.emote-panel` khi chỉ còn dùng cho `position`), bỏ các thuộc tính hình thức trùng lặp trong file component khi đã chuyển sang `ui-`. Không ghép `.ui-panel` với `.panel` trên cùng phần tử, vì `theme.css` có `:root .panel { border-left-color }` sẽ đè viền.

| Mẫu cũ (file) | Class mới | Ghi chú khi chuyển |
|---|---|---|
| `.panel` vỏ hình thức (styles.css) | `.ui-panel` | Giữ vị trí bằng class riêng của panel. `.panel` hiện có bóng tối và viền trái màu nhấn, bỏ khi chuyển |
| `.panel-head`, `.panel h2` | `.ui-panel-header`, `.ui-panel-title` | Header có đường kẻ kép. Nút đóng dùng `.ui-btn .ui-btn-ghost .ui-btn-icon` |
| `.btn` | `.ui-btn .ui-btn-primary` | Cao tối thiểu 44px. Chữ từ `--ui-on-primary` |
| `.btn-ghost` | `.ui-btn` | Nút phụ có viền là kiểu mặc định |
| `.icon-btn` (32px) | `.ui-btn .ui-btn-ghost .ui-btn-icon` | Tăng lên 44px, bắt buộc `aria-label` |
| `.tabs`, `.tab-btn`, `.tab-btn.active` | `.ui-tabs`, `.ui-tab`, `[aria-selected="true"]` | Dùng `role="tablist"` và `role="tab"`. Không dùng class `.active` |
| `.chip` | `.ui-badge` (+ `.ui-badge-ok`, `-warn`, `-danger`) | Bo 4px, có chấm trạng thái |
| `.muted`, `.small` | `.ui-muted` | Cỡ nhỏ nhất là 14px, không còn 12px |
| `.hud` | `.ui-hud` | Lề 16px, xếp dọc dưới 480px |
| `.hud-btn` | `.ui-hud-chip` | Trạng thái mở bằng `aria-expanded="true"` |
| `.hud-text`, `.hud-ico` | `.ui-hud-chip-label`, `.ui-hud-chip-icon` | Nhãn ẩn trực quan dưới 480px, vẫn đọc được |
| `.auth-form-card` | `.ui-panel .ui-panel-sheet` | Bỏ bo 16px và bóng kép. Đường kẻ kép ở đỉnh |
| `.auth-btn .auth-btn--primary` | `.ui-btn .ui-btn-primary` | `--block` thành `.ui-btn-block` |
| `.auth-btn--secondary`, `.auth-btn--provider` | `.ui-btn` | |
| `.auth-link`, `.onb-link` | `.ui-btn .ui-btn-ghost` | Có gạch chân. Dùng `<a>` khi đổi trang, `<button>` khi đổi trạng thái |
| `.auth-input`, `.auth-otp-cell` | `.ui-input` | Ô OTP thêm `.ui-input-otp` |
| `.auth-field`, `.auth-label`, `.auth-hint` | `.ui-field`, `.ui-label`, `.ui-hint` | Lỗi trường dùng `.ui-field-error` và `aria-invalid="true"` trên ô nhập |
| `.auth-tablist`, `.auth-tab` | `.ui-tabs .ui-tabs-segmented`, `.ui-tab` | |
| `.auth-msg--error`, `--success`, `--info` | `.ui-banner .ui-banner-danger`, `-ok`, `-info` | Giữ vùng `aria-live` như cũ |
| `.auth-timer` | `.ui-badge` | |
| `.auth-tour-card` | `.ui-list-item` trong `.ui-list` | Dòng sổ, không thẻ |
| `.auth-kicker` | Bỏ | Thanh tiến trình đã báo bước |
| `.auth-spinner`, `.ci-spinner` | `.ui-spinner` | Đứng yên khi giảm chuyển động |
| `.auth-sr-only`, `.onb-sr-only` | `.ui-sr-only` | |
| `.onb-btn`, `.onb-btn-primary` (styles.css, `#2563eb` cứng) | `.ui-btn`, `.ui-btn-primary` | Bỏ màu cứng |
| `.onb-tab[aria-selected]` (`#2563eb` cứng) | `.ui-tab` | |
| `.duel-panel` | `.ui-panel` | |
| `.duel-banner` | `.ui-panel .ui-panel-float` | Huy hiệu "Đang đấu" dùng `.ui-badge` |
| `.duel-panel-head`, `.duel-title` | `.ui-panel-header`, `.ui-panel-title` | |
| `.duel-sub`, `.ci-sub` | `.ui-subhead` | |
| `.duel-btn`, `-primary`, `-ghost`, `-danger` | `.ui-btn`, `.ui-btn-primary`, `.ui-btn-ghost`, `.ui-btn-danger` | `duel-btn-primary` dùng `color: var(--bg)`, sai ở theme sáng. Mới dùng `--ui-on-primary` |
| `.duel-input`, `.duel-field` | `.ui-input`, `.ui-label` trong `.ui-field` | |
| `.duel-mode`, `.duel-mode-on` | `.ui-list-item` dạng `<label>`, `[aria-checked]` hoặc `:has(:checked)` | Tên chế độ `.ui-list-item-title`, mô tả `.ui-list-item-meta` |
| `.duel-list`, `.duel-item` | `.ui-list`, `.ui-list-item` | `.duel-item-actions` thành `.ui-list-item-actions` |
| `.duel-badge` | `.ui-badge` | |
| `.duel-notice-ok`, `.duel-notice-err` | `.ui-banner .ui-banner-ok`, `.ui-banner-danger` | |
| `.duel-down`, `.duel-result` | `.ui-banner .ui-banner-warn` | |
| `.duel-hp-track`, `.duel-hp-fill` | Giữ nguyên | Riêng của thi đấu. Bo về 4px để khớp hệ thống |
| `.ci-card` (bo 16px, bóng `rgba(0,0,0,.22)`) | `.ui-panel .ui-panel-float` | Giữ `.ci-overlay` cho định vị |
| `.ci-btn-primary`, `.ci-btn-ghost` | `.ui-btn .ui-btn-primary`, `.ui-btn` | `.ci-btn:hover { filter }` bỏ |
| `.ci-board` | `.ui-panel` | |
| `.ci-board-kicker` | Bỏ, gộp vào `.ui-panel-title` | Ví dụ "Ghi danh hôm nay" |
| `.ci-board-num` | `.ui-figure` | Một số tổng trên mỗi panel |
| `.ci-items`, `.ci-item` | `.ui-list`, `.ui-list-item` | Giờ dùng `.ui-list-item-figure` |
| `.ci-item-name`, `.ci-item-dept` | `.ui-list-item-title`, `.ui-list-item-meta` | |
| `.ci-hint`, `.ci-note` (12px) | `.ui-hint` (14px) | |
| `.ci-empty`, `.duel-empty` | `.ui-empty` | Chữ mời hành động |
| `.mod-tabs`, `.mod-seg` | `.ui-tabs` | |
| `.mod-list`, `.mod-item`, `.mod-item-active` | `.ui-list`, `.ui-list-item`, `[aria-current="true"]` | `button.ui-list-item` cho mục bấm được |
| `.mod-detail`, `.mod-dl` | `.ui-list-item-detail` | |
| `.mod-badge`, `.mod-badge-banned` | `.ui-badge`, `.ui-badge-danger` | |
| `.mod-backdrop`, `.mod-dialog`, `.mod-dialog-title` | `.ui-dialog-backdrop`, `.ui-dialog`, `.ui-dialog-title` | Hoặc `<dialog class="ui-dialog">` với `showModal()` |
| `.mod-actions` | `.ui-dialog-actions` (trong hộp thoại), `.ui-actions` (nơi khác) | |
| `.btn.mod-danger` | `.ui-btn .ui-btn-danger` | Chữ trên nút lặp lại hành động |
| `.mod-notice-ok`, `.mod-notice-err` | `.ui-banner .ui-banner-ok`, `.ui-banner-danger` | `mod-notice-err` đang dùng màu `--warn` cho lỗi, sai nghĩa |
| `.mod-report-btn` (12px, thấp hơn vùng chạm) | `.ui-btn .ui-btn-ghost` | Chữ "Báo cáo", cao 44px |
| `.mod-field`, `.mod-fieldset` | `.ui-field`, `.ui-fieldset` | |
| `.mod-snapshot` | `.ui-quote` | |
| `.mod-table-wrap` | `.ui-scroll-x` | |
| `.emote-panel` | `.ui-panel .ui-panel-float` | Giữ `.emote-panel` chỉ cho định vị |
| `.emote-head`, `.emote-title` | `.ui-panel-header`, `.ui-panel-title` | |
| `.emote-close` | `.ui-btn .ui-btn-ghost .ui-btn-icon` | |
| `.emote-btn`, `.emote-btn-active` | `.ui-btn .ui-btn-tile`, `[aria-pressed="true"]` | |
| `.emote-key` | `.ui-kbd` | Không monospace |
| `.emote-stop` | `.ui-btn .ui-btn-block` | Chữ "Dừng biểu cảm" |
| `.emote-toggle` | `.ui-check` | |
| `.emote-error` | `.ui-banner .ui-banner-warn` | |
| `.emote-hint` | `.ui-hint` | |
