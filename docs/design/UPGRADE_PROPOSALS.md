# Đề xuất nâng cấp app GP

Ngày: 2026-11-06. Gộp từ hai nghiên cứu: văn phòng ảo 3D (ký hiệu V1-V8) và ghi danh, hiện diện, hoạt động văn phòng (ký hiệu C1-C8). Đối chiếu với CHECKIN_ENTRY.md và MODERATION.md để tránh trùng việc đang làm. Tài liệu này chỉ là đề xuất, chưa phải hợp đồng thực hiện.

Quy ước mức chắc chắn: XN = đã xác nhận từ trang nguồn; XN-1 = xác nhận một phần (nguồn thứ cấp, kết quả tìm kiếm); SĐ = suy đoán. Nghiên cứu ghi danh dùng ký hiệu TT cho thông tin bên thứ ba, ở đây quy về XN-1.

## 1. Tóm tắt

Nên làm trước nhóm nền tảng nhỏ, ít rủi ro, ít phụ thuộc: trạng thái hiện diện hai lớp (P1), cài đặt riêng tư và chính sách lưu giữ dữ liệu ghi danh (P2), và vai trò theo thẻ (P3). P2 nên đi cùng P1 vì dữ liệu ghi danh đang lưu không giới hạn. Sau đó mới tới vùng yên lặng và riêng tư (P5), đặt phòng họp (P13) và chế độ nhẹ cho thiết bị yếu (P8), vì ngân sách draw call đang vượt trần. Thoại qua LiveKit (P6) và trình chỉnh sửa bản đồ (P7) làm sau cùng vì độ khó L và cần duyệt hạ tầng. Mọi đề xuất chạm tới dữ liệu chấm công, hiện diện hoặc báo cáo quản lý phải qua pháp chế hoặc nhân sự trước khi viết mã (mục 4).

## 2. Bảng 16 đề xuất gốc

| Mã | Tên | Mục tiêu | Khó | Tác động | Nguồn tham chiếu (mức chắc chắn) |
|---|---|---|---|---|---|
| V1 | Vùng yên lặng và vùng riêng tư | Phòng họp trò chuyện riêng, khu làm việc yên lặng, có khóa và gõ cửa | M | Cao | Gather private area (XN-1); WorkAdventure `silent` (XN); Sococo knock (XN-1) |
| V2 | Phân quyền theo thẻ và vai trò điều phối | Giới hạn phòng, bảng, tivi theo nhóm; có moderator, mapmaker | M | Cao | Gather roles (XN); WorkAdventure tags (XN) |
| V3 | Thoại và chia sẻ màn hình qua LiveKit | Họp và song ca trong app, không camera, mặc định tắt | L | Cao | LiveKit Apache-2.0 (XN); tính năng SFU (SĐ); Teamflow, Virbela screen share (XN-1) |
| V4 | Trình chỉnh sửa bản đồ nội bộ | Admin chỉnh vùng, vật thể không sửa JSON | L | Vừa đến cao | WorkAdventure Area/Entity Editor (XN); Gather Mapmaker (XN) |
| V5 | Trạng thái Tập trung / Bận / Vắng trên đầu avatar | Giảm gián đoạn, tự hết hạn | S | Vừa | Sococo (XN-1); cơ chế tắt nhắc trong INTERACTIONS (XN) |
| V6 | Chế độ nhẹ và điều khiển cảm ứng | Chạy trên máy yếu, điện thoại; kéo ngân sách về 200 draw call | M | Cao | WorkAdventure, Hubs mobile (XN); DECISIONS 11 (XN) |
| V7 | Bảng trắng cộng tác nâng cao | Ghi chú dán cố định, bảng theo buổi họp, xuất PNG | M | Vừa | Teamflow, Virbela (XN-1) |
| V8 | Báo cáo, chặn, màn hình kiểm duyệt | Xử lý hành vi và nội dung không phù hợp | M | Vừa đến cao | WorkAdventure Reports/Banned Users (XN); Gather moderator (XN) |
| C1 | Trạng thái làm việc hôm nay (Văn phòng / Từ xa / Công tác / Nghỉ) | Tách "chưa ghi danh" khỏi "vắng" | S | Cao | Teams work location (XN-1); Slack status hết hạn (XN) |
| C2 | Cài đặt riêng tư "mức chia sẻ" | Người dùng quyết định ai thấy tên mình, mặc định kín | M | Cao | Teams (XN-1); Envoy admin-only (XN-1) |
| C3 | Chính sách lưu giữ và quyền chủ dữ liệu | Tự xóa theo hạn, xem, xuất, xóa lịch sử của mình | M | Cao | Envoy data retention (XN-1) |
| C4 | Ghi danh ra về tùy chọn, nhắc nhẹ cuối ngày | Giờ có mặt ở mức tổng hợp, không hiện người đã về | S | Vừa | Frappe HR check-out (XN); Slack (XN) |
| C5 | Bảng quản lý mức tổng hợp, ngưỡng ẩn nhóm nhỏ | Xu hướng tuần/tháng không lộ cá nhân; role `manager` | M | Cao | Envoy báo cáo (XN); Frappe (XN); ngưỡng nhóm nhỏ (SĐ) |
| C6 | Kế hoạch vào văn phòng và lời mời đồng đội | Phối hợp ngày vào văn phòng, có đồng ý hai chiều | M | Vừa | Teams Places (XN-1); Seatsurfing (XN) |
| C7 | Đặt phòng họp: chống trùng, đặt lặp, tự giải phóng | Phòng không bị giữ vô ích | M | Vừa | MRBS (XN); tự giải phóng (SĐ) |
| C8 | Tiếp cận và nhắc việc có kiểm soát | Dùng bằng bàn phím, trình đọc màn hình; nhắc việc ít phiền | S đến M | Vừa | Slack (XN); Envoy kiosk đa ngôn ngữ (XN); aria-live (SĐ) |

## 3. Nhóm trùng nhau và đề xuất sau khi gộp

### Các nhóm gộp

1. **V5 + C1 gộp thành P1 "Trạng thái hiện diện hai lớp".** Cùng một mô hình trạng thái người dùng tự đặt, tự hết hạn. Lớp 1 theo ngày (C1: văn phòng, từ xa, công tác, nghỉ). Lớp 2 trong phiên (V5: tập trung, bận, vắng, chỉ hiện biểu tượng). Một bảng lưu trữ, một API. Phần "Đang tập trung chặn wave, remind" của V5 giữ nguyên.
2. **C2 + C3 gộp thành P2 "Riêng tư và vòng đời dữ liệu hiện diện".** Cả hai là quyền của chủ dữ liệu trên cùng bảng `checkins`: mức chia sẻ, xem, xuất, xóa, hạn lưu. Làm chung một đợt thì chỉ phải xin duyệt pháp chế một lần.
3. **V2 hấp thụ phần role `manager` của C5, thành P3 "Thẻ và vai trò".** Một cơ chế `tags[]` và role cho cả vùng 3D lẫn báo cáo quản lý. C5 còn lại phần báo cáo tổng hợp, thành P4, phụ thuộc P3 và P2.
4. **V8 thu hẹp thành P10 "Kiểm duyệt trong phòng".** MODERATION.md đã có role `moderator`, báo cáo, hàng đợi, khóa tài khoản, nhật ký. Phần V2 về role `moderator` cũng đã có, nên P3 chỉ còn `tags` và `mapmaker`. P10 chỉ giữ phần chưa có: tạm khóa tương tác theo phòng (không đụng tài khoản gốc), nút báo cáo cho bảng vẽ và chat gần khi V1 ra đời.

### Liên quan nhưng giữ riêng

- V1 và C7: cả hai đụng khóa/quyền vào phòng họp. Dùng chung khái niệm chủ phòng, nhưng khác dữ liệu (vùng 3D và lịch đặt).
- V6 và C8: cả hai về tiếp cận thiết bị. Một bên là hiệu năng và cảm ứng, một bên là bàn phím và trình đọc màn hình. Cùng phần thân cảnh 3D, nên kiểm thử chung.
- C8 (nhắc việc, không làm phiền theo lịch) dựa vào P1.
- C4 và C6 dùng P1 làm nền.

### Danh sách sau khi gộp: 14 đề xuất

| Mã mới | Gồm | Khó | Tác động | Phụ thuộc | Ghi chú đối chiếu tài liệu hiện có |
|---|---|---|---|---|---|
| P1 | V5 + C1 | S | Cao | none | Mở rộng bản ghi `checkins`; ghi danh cổng tầng 7 tự đặt `office` |
| P2 | C2 + C3 | M | Cao | none | CHECKIN_ENTRY ghi "MVP không tự xóa" nên đây là khoảng trống đã biết |
| P3 | V2 + role `manager` của C5 | M | Cao | none | Role `moderator` đã có trong MODERATION; chỉ thêm `tags`, `mapmaker`, `manager` |
| P4 | C5 (phần báo cáo) | M | Cao | P2, P3 | CHECKIN_ENTRY mới có tổng theo phòng ban hôm nay và `detail=1` cho `it`, `admin` |
| P5 | V1 | M | Cao | P3 | Chưa có trong tài liệu đã đọc |
| P6 | V3 | L | Cao | P5, duyệt hạ tầng | RESEARCH_SERVICES đã dự kiến LiveKit sau MVP |
| P7 | V4 | L | Vừa đến cao | P3 | Mở rộng dịch vụ layout |
| P8 | V6 | M | Cao | none | Câu hỏi mở về di động trong ONBOARDING_UX |
| P9 | V7 | M | Vừa | none | Giữ giới hạn 300 nét, 30 nét/phút |
| P10 | V8 (phần chưa có) | M | Vừa | P5 | Phần lớn đã có trong MODERATION.md |
| P11 | C4 | S | Vừa | P1, P2 | CHECKIN_ENTRY mục 7 loại trừ ra về khỏi đợt đầu; đây là đợt sau |
| P12 | C6 | M | Vừa | P1, P2 | Chưa có |
| P13 | C7 | M | Vừa | none | Dùng bảng `bookings` ở service `it` (theo nghiên cứu, từ SOCIAL.md) |
| P14 | C8 | S đến M | Vừa | P1 (phần nhắc việc) | Chưa có |

Thứ tự gợi ý: P1, P2, P3 → P4, P13, P8, P5 → P11, P12, P14, P9, P10 → P7, P6.

## 4. Cần pháp chế hoặc nhân sự xem trước

Các mục dưới đây xử lý dữ liệu chấm công, hiện diện hoặc báo cáo cho quản lý. Không bắt đầu viết mã trước khi có ý kiến bằng văn bản.

| Mục | Vấn đề cần xem |
|---|---|
| P1 | Trạng thái "Từ xa", "Công tác", "Nghỉ" là dữ liệu về nơi làm việc và nghỉ phép của cá nhân. Cần xác định có được lưu không, ai được thấy, và có trùng với hệ thống nhân sự chính thức không (dễ bị hiểu thành chấm công). |
| P2 | Hạn lưu giữ mặc định (nghiên cứu gợi ý 180 ngày, đây là con số của người nghiên cứu, không có nguồn). Quyền xuất và xóa lịch sử cá nhân. Phần bắt buộc lưu theo quy định ngân hàng cần bộ phận tuân thủ xác nhận. Nhật ký truy cập khi admin xem danh sách chi tiết. |
| P3 | Role `manager` thấy đội của mình: cần nhân sự xác định đội, quyền, và việc có được thấy tên hay không. Ghi audit tối thiểu. |
| P4 | Báo cáo theo tuần/tháng, xuất CSV, ngưỡng ẩn nhóm dưới 5 người (SĐ, chưa kiểm chứng). Cần xác định mục đích sử dụng báo cáo: không dùng đánh giá hiệu suất hoặc kỷ luật nếu chưa được duyệt. |
| P5 | Vùng riêng tư, chat gần: nếu có lưu nội dung chat thì thuộc phạm vi dữ liệu liên lạc nội bộ. Giữ nguyên nguyên tắc log chỉ băm, không nội dung. |
| P6 | Thoại và chia sẻ màn hình có thể lộ nội dung nhạy cảm của ngân hàng. Cần an toàn thông tin duyệt UDP, TURN; chính sách ghi âm (đề xuất: không ghi). |
| P10 | Hàng đợi báo cáo và khóa tương tác: cần quy trình xử lý, quyền khiếu nại của người bị khóa, thời hạn lưu bản chụp nội dung. |
| P11 | Ra về, giờ có mặt tổng hợp: dễ bị dùng như chấm công. Phải giữ tùy chọn, không bắt buộc, không phạt, chỉ hiện ở mức tổng. |
| P12 | Kế hoạch vào văn phòng là dữ liệu dự kiến về cá nhân; chia sẻ hai chiều có đồng ý. Lời mời chỉ gửi khi người nhận chấp nhận. |
| P14 | Nhắc việc ngoài giờ: cần nhân sự xác nhận khung giờ không làm phiền. |

## 5. Không làm

Theo ràng buộc dự án và kết quả nghiên cứu:

- Không nhận diện khuôn mặt, không camera, không thẻ từ thật, không máy chấm công thật. Ghi danh vẫn là hành động chủ động của chính tài khoản đang đăng nhập.
- Không tự phát hiện vị trí bằng Wi-Fi (mẫu Teams) hoặc tọa độ GPS (mẫu Frappe HR).
- Không sao chép mã WorkAdventure (AGPL v3 kèm Commons Clause, không được bán SaaS). Chỉ dùng làm tham chiếu thiết kế.
- Không lấy mã Mozilla Hubs (MPL-2.0) khi chưa kiểm tra giấy phép và nghĩa vụ công bố. Chỉ tham chiếu ý tưởng.
- Không lấy mã Seatsurfing, Frappe HR (GPL-3.0), MRBS (GPLv2, theo nguồn thứ cấp) vào mã nguồn dự án khi chưa kiểm tra giấy phép. Chỉ tham chiếu mẫu thiết kế.
- Không làm feed kudos công khai toàn công ty kèm điểm đổi quà (mẫu Bonusly): trái ràng buộc không hành động lên người khác khi họ chưa đồng ý, và dự án không có thưởng tiền. Nếu làm kudos thì người nhận phải chọn hiện công khai hay riêng.
- Không lưu dữ liệu ghi danh vô thời hạn mặc định (mẫu Envoy).
- Không gửi thông báo đẩy hoặc email cho quản lý (đã loại ở CHECKIN_ENTRY mục 7 cho đợt này).
- Không có tiền thật, cờ bạc, hành động lên tài khoản người khác khi họ chưa đồng ý.

## 6. Ghi chú về độ tin cậy

- Nghiên cứu ghi danh chưa đọc hết SOCIAL.md (đã đọc dòng 1-622 trên 846) và ANIMALS.md (đã đọc dòng 1-555 trên 686). Một số đề xuất có thể trùng thiết kế đã có ở phần chưa đọc, đặc biệt kudos, đặt phòng (P13) và nhắc việc (P14). Cần đọc nốt hai file trước khi chốt phạm vi.
- Cả hai nghiên cứu chưa đọc mã nguồn GP. "Khoảng trống" là theo tài liệu thiết kế, có thể một số mục đã có trong code.
- Gather, WorkAdventure, LiveKit, Slack, MRBS, Frappe: mức chắc chắn cao hơn. Teams, Envoy (retention, thông báo), Teamflow, Sococo, Virbela, Bonusly, Seatsurfing (ngoài GPL-3.0 và PWA): nguồn thứ cấp.
- Chưa khảo sát được Topia, Wonder, Kantable. Không suy đoán thêm.
- Các con số như 180 ngày lưu giữ, ngưỡng nhóm nhỏ dưới 5, tự giải phóng phòng sau 10-15 phút, 30 nét/phút là đề xuất của người nghiên cứu, không từ nguồn. Cần chốt lại với người sở hữu sản phẩm.
- Ngân sách draw call hiện ước tính 209, vượt trần 200 (DECISIONS 11). Mọi đề xuất thêm vật thể 3D (P5, P7) phải tính lại.
