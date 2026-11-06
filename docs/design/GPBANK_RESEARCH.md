# Nghiên cứu GPBank (công khai)

Ngày tra cứu: 2026-11-06. Chỉ đọc trang công khai. Không đăng nhập, không nhập liệu, không tải logo hay file.
Thông tin lịch sử và kết quả kinh doanh là do ngân hàng hoặc báo tự công bố, chưa kiểm chứng độc lập.

## 1. Danh tính

- Tên hiện hành: Ngân hàng TM TNHH MTV Kỷ Nguyên Thịnh Vượng, thương hiệu GPBank. Xác nhận qua trang tuyển dụng và báo Dân trí.
- Tên cũ: Ngân hàng TMCP Dầu khí Toàn Cầu. Không dùng cho hiện trạng.
- Website chính thức: gpbank.com.vn (xác nhận).
- Công ty mẹ: VPBank sở hữu 100% (xác nhận qua trang tuyển dụng; Vietstock ghi VPB là cổ đông lớn, cập nhật 17/01/2025).
- Chưa thống nhất: ngày đổi tên. Báo ghi 08/10/2025; SGGP ghi tên đầy đủ có từ đầu 2025.

## 2. Hồ sơ

- Lịch sử: tiền thân là Ngân hàng TM nông thôn Ninh Bình (1993). Chuyển thành TNHH MTV nhà nước 100% (07/07/2015). Chuyển giao bắt buộc cho VPBank (17/01/2025). Xác nhận qua Vietstock và trang tuyển dụng.
- Vốn điều lệ hiện hành: không tìm được. Wikiland ghi 3.018 tỷ đồng (2010), dữ liệu cũ.
- Hội sở: chưa xác nhận. Trang tuyển dụng ghi Tòa nhà Naforimex, 19 Bà Triệu, Hà Nội. Wikiland ghi 109 Trần Hưng Đạo. Cần đối chiếu với cơ quan đăng ký kinh doanh.
- Mạng lưới: "gần 80 điểm giao dịch toàn quốc", khoảng 1.400 nhân sự (trang tuyển dụng, xác nhận ở mức công bố). Không tìm được số chi nhánh và phòng giao dịch tách riêng.
- Sản phẩm:
  - Cá nhân: tiết kiệm, tín dụng, thanh toán quốc tế, ngân hàng số GP DigiPlus.
  - Doanh nghiệp: tín dụng theo ngành, GPBank Biz (vận hành từ 01/07/2026).
  - Thẻ: không tìm được danh mục.
- Kết quả nửa đầu 2026 (tự công bố): huy động +30%, dư nợ +21%, lợi nhuận trước thuế +780%.
- Công nghệ: New Core Banking thế hệ mới đã triển khai xong đến hết 6/2026 (Chinhphu.vn). Trang tuyển dụng nêu "Core Banking T24", chưa rõ có cùng hệ thống hay không. Nhà cung cấp: không tìm được.

## 3. Phòng ban đối chiếu với 5 khối

Nguồn: danh mục vị trí tuyển dụng trên trang tuyển dụng, không phải sơ đồ tổ chức.

| Khối bạn đưa | Đơn vị tìm thấy | Ghi chú |
|---|---|---|
| Kinh doanh | Khối KHDN, Khối KHCN, Digital Banking, Phòng Phát triển Kinh doanh, Marketing sản phẩm, Trung tâm Phát triển sản phẩm | Xác nhận tên |
| Hỗ trợ và kiểm soát | Kiểm toán nội bộ, Khối QTRR & PCTT, Trung tâm Thẩm định và Phê duyệt tín dụng, Phòng Xử lý nợ | Xác nhận tên |
| Vận hành và nền tảng | Khối Vận hành, Khối CNTT | Xác nhận tên. Khối CNTT thuộc nhóm này |
| Hỗ trợ chung | Trung tâm Quản trị nguồn nhân lực, VP TGĐ & Quản lý chuyển đổi, Khối Tài chính | Xác nhận tên |
| Mạng lưới | Không có trong danh mục tuyển dụng | Chỉ thấy mục menu trên website |

Chức năng chi tiết của từng đơn vị là suy đoán.

## 4. Nhận diện thương hiệu (chỉ tham khảo, không sao chép)

- Slogan: "Vì một kỷ nguyên thịnh vượng", liên kết với thông điệp của VPBank (xác nhận).
- Màu: cam chủ đạo, gradient #f25821 đến #f7941d trong CSS website (giá trị xác nhận; vai trò thương hiệu là suy đoán mạnh). Chữ dùng navy #2e3a5b.
- Font: SVNArticulatCF, font của bên thứ ba. Không nhúng.
- Logo: chữ GPBank bo tròn, tô cam chuyển đỏ; biểu tượng chồi non hai lá xanh và cam. Không dùng.
- Phong cách website: header kính mờ, nút bo tròn hoàn toàn, thẻ trắng bo 16–24px, icon phẳng, nhiều khoảng trắng.
- Không tìm được: mã Pantone, bảng HEX chính thức, brand guideline, giao diện app và ebanking.

## 5. Quyết định cho app nội bộ

- Giữ biến màu placeholder (`--brand-primary`, `--brand-accent`). Không hardcode cam hoặc navy, vì chưa có bộ nhận diện chính thức của GPBank cho dự án này.
- Không dùng font SVNArticulatCF, logo, biểu tượng chồi non, hay gradient cố định.
- Khi cần ghi tên ngân hàng, dùng tên hiện hành. Tránh "Dầu khí Toàn Cầu" trừ khi ghi lịch sử.

## 5b. Tham chiếu ngân hàng thương mại Việt Nam

Khảo sát sáu ngân hàng (Vietcombank, BIDV, Techcombank, VPBank, MB, TPBank), chỉ đọc trang công khai. Màu và font đo từ trang web, không phải quy định thương hiệu.

- Mỗi ngân hàng có một màu đậm dùng cho nút chính chữ trắng, trên nền sáng hoặc ảnh mờ.
- Font sans-serif hiện đại. Không có serif trên trang đăng nhập.
- Bo góc ô nhập và nút khoảng 5 đến 12px.
- Form một cột là mặc định. Không trang nào dùng tab đăng nhập và đăng ký. Đăng ký là liên kết riêng.
- Ba trên sáu trang có captcha, nên không mô tả được giao diện OTP.
- Chi tiết từng ngân hàng: `C:\Users\tuand\AppData\Local\Temp\claude\bf0cecbd3cd9607d\38ad34d0-d47e-4308-bc2e-41c2af00ba74\scratchpad\gpbank-research-peers.md`

Lưu ý: yêu cầu của dự án là tab đăng nhập và đăng ký, nên không đổi theo mẫu ngân hàng.

## 6. Chưa kiểm chứng

- Vốn điều lệ hiện hành.
- Hội sở chính xác.
- Số chi nhánh và phòng giao dịch tách riêng.
- Danh mục thẻ.
- Nhà cung cấp core banking và số nhân sự CNTT.
- Ban lãnh đạo hiện hành.
- Ngày đổi tên chính xác.
