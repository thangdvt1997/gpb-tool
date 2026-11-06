# Bộ 27 prompt triển khai văn phòng 3D trên web

**Phiên bản:** 1.0 — 06/11/2026  
**Ngôn ngữ:** Tiếng Việt — dùng để giao lần lượt cho Claude hoặc AI lập trình có quyền đọc/sửa dự án.

## Phạm vi và cách sử dụng

Bộ prompt này triển khai 27 đầu mục đã thống nhất: nền tảng 3D, trải nghiệm, quản lý nội dung và chế độ nhiều người. Đây là yêu cầu triển khai, không phải báo cáo rằng mã nguồn đã có lỗi hay tính năng đã hoạt động.

**Hướng hình ảnh cuối cùng:** văn phòng thực tế theo mặt bằng chữ L khoanh xanh; nhân vật giống người thật, có co kéo hình thể, hình xăm, trang phục và phụ kiện. Phong cách người thật thay thế yêu cầu chibi cũ. Các prompt này bổ sung hệ thống, không thay thế đầu vào mặt bằng/ảnh và asset gốc.

### Giao việc lần lượt

1. Gửi ảnh mặt bằng, ảnh văn phòng, repository và tài liệu dự án ở lần đầu. Cung cấp asset nhân vật/rig/animation và quyền sử dụng nếu đã có; prompt không thể tự tạo ra bộ asset production hoàn chỉnh chỉ từ tên gọi.
2. Copy toàn bộ nội dung giữa hai dấu `BẮT ĐẦU PROMPT` và `KẾT THÚC PROMPT` của một task. Mỗi prompt chứa sẵn bối cảnh chung để dùng độc lập.
3. Chạy theo thứ tự 01 → 27, nghiệm thu từng task trước khi giao task kế tiếp. Đọc mục phụ thuộc: nếu một task cần module chưa có, triển khai adapter tối thiểu và ghi phần thiếu, không giả lập để báo hoàn tất.
4. Task 22–27 là giai đoạn mở rộng nhiều người. Hoàn thiện bản một người dùng trước; cần backend và hạ tầng thật cho các tiêu chí online. Task 26 là nơi hoàn thiện quản lý vai trò, nhưng mọi endpoint xuất hiện trước đó vẫn phải kiểm tra danh tính và ownership ngay từ đầu.
5. Nếu ngữ cảnh Claude đã đầy, gửi lại prompt task hiện tại cùng báo cáo bàn giao task trước, sơ đồ dữ liệu và lệnh chạy. Không yêu cầu AI sửa lại toàn bộ kiến trúc từ đầu mỗi lần.
6. Chỉ yêu cầu triển khai một task trong một lần giao. Nếu muốn tự động chạy nhiều task, cần thêm chỉ thị điều phối riêng; bộ này không mặc định cấp quyền deploy production.

### Các giả định cần giữ nhất quán

- Đọc mã nguồn trước khi quyết định thư viện; không mặc định dự án đã dùng React, Three.js, Rapier hay một backend cụ thể.
- Giá trị kích thước không đọc được từ mặt bằng phải được đánh dấu ước lượng và chỉnh qua cấu hình.
- Hiệu năng phải đo trên thiết bị cụ thể; avatar realism phụ thuộc mesh, rig, morph, texture và animation thật.
- Với kiểm thử thiếu thiết bị/hạ tầng, báo “chưa kiểm chứng” cùng cách kiểm tra, không chuyển thành “đã đạt”.

## Mục lục và thứ tự triển khai

### Giai đoạn A — Nền tảng

- [01. Chuẩn hóa asset 3D và hợp đồng dữ liệu](#task-01)
- [02. Hoàn thiện chuyển động và animation nhân vật](#task-02)
- [03. IK tay chân và căn tư thế tương tác](#task-03)
- [04. Chống xuyên cơ thể và phối nhiều lớp trang phục](#task-04)
- [05. Camera ổn định và khôi phục nhân vật mắc kẹt](#task-05)
- [06. Lưu và khôi phục toàn bộ trạng thái](#task-06)
- [07. Tải asset, phục hồi lỗi và mất ngữ cảnh đồ họa](#task-07)
- [08. Đo hiệu năng và tối ưu rendering/bộ nhớ](#task-08)
### Giai đoạn B — Trải nghiệm

- [09. Minimap, tìm phòng và chỉ đường](#task-09)
- [10. Hướng dẫn lần đầu và trợ giúp theo ngữ cảnh](#task-10)
- [11. Cài đặt điều khiển và hỗ trợ nhiều thiết bị](#task-11)
- [12. Khả năng tiếp cận và thao tác thay thế kéo thả](#task-12)
- [13. Chế độ đồ họa và chất lượng tự thích nghi](#task-13)
- [14. Âm thanh không gian và phản hồi tương tác](#task-14)
- [15. Biểu cảm và hành động nhanh của nhân vật](#task-15)
- [16. Chế độ chụp ảnh nhân vật và văn phòng](#task-16)
### Giai đoạn C — Công cụ quản lý

- [17. Trình biên tập bố trí văn phòng](#task-17)
- [18. Quản lý thư viện asset và danh mục đồ](#task-18)
- [19. Xử lý ảnh tải lên cho hình xăm và họa tiết](#task-19)
- [20. Xuất/nhập, sao lưu và phiên bản dữ liệu](#task-20)
- [21. Bộ kiểm tra chất lượng scene và asset](#task-21)
### Giai đoạn D — Nhiều người

- [22. Tài khoản, hồ sơ và nhân vật cá nhân](#task-22)
- [23. Đồng bộ nhiều người: chuyển động và trạng thái thế giới](#task-23)
- [24. Quyền chiếm ghế, cầm vật và khóa chỉnh sửa](#task-24)
- [25. Chat chữ, thoại theo khoảng cách và phòng họp](#task-25)
- [26. Phân quyền chủ phòng, người chỉnh sửa và khách](#task-26)
- [27. Mất kết nối, reconnect và khôi phục phiên](#task-27)

---

<a id="task-01"></a>

## TASK 01 — Chuẩn hóa asset 3D và hợp đồng dữ liệu

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 01 — Chuẩn hóa asset 3D và hợp đồng dữ liệu

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Không; đây là nền tảng cho các task sau.

### Mục tiêu
Thiết lập một chuẩn asset duy nhất để nhân vật, nội thất, animation, phụ kiện và hệ thống tương tác ghép với nhau đúng tỷ lệ. Bảo toàn bố trí văn phòng hiện tại.

### Yêu cầu triển khai
1. Kiểm kê asset hiện có: nguồn, quyền sử dụng, định dạng, dung lượng tải, polygon/triangle, material, texture, rig, animation clip, morph target và trạng thái lỗi. Ghi số đo thực tế; không suy ra kích thước kiến trúc chính xác từ ảnh mờ.
2. Quy ước đơn vị mét, hệ trục phù hợp engine, hướng nhìn trước của nhân vật, hướng cửa và cách chuyển đổi asset nhập. Với Three.js ưu tiên Y-up; không ép một quy ước khác gây hỏng scene đã có. Áp dụng chuyển đổi qua bước import có kiểm soát.
3. Xác định origin/pivot: bàn và tủ ở chân đế, cửa ở bản lề, ngăn kéo ở trục trượt, ghế tại tâm chân. Tạo socket có tên cho tay trái/phải, đầu, cổ, lưng, bàn chân và vị trí tương tác.
4. Chuẩn hóa skeleton bằng hồ sơ tương thích: tên xương, rest pose, đơn vị, root motion/in-place và mapping retarget. Không đổi tên xương hàng loạt trước khi kiểm tra mọi clip phụ thuộc.
5. Tạo asset manifest có schemaVersion, assetId ổn định, version/hash, type, URL tương đối, bounds, scale, pivot, colliderProfile, lods, materials, sockets, rigProfile, morphCapabilities và license/source. Xác định trường bắt buộc theo từng loại, không bắt đồ tĩnh phải có rig.
6. Quy định color space cho texture màu và texture dữ liệu, normal map, alpha mode và quy tắc material dùng chung. Lập budget theo asset type dựa trên đo thực tế, không áp một con số tùy ý cho mọi thiết bị.
7. Tạo công cụ kiểm tra manifest, đường dẫn asset, ID trùng, giá trị không hữu hạn, transform bất thường và socket/clip thiếu. Báo lỗi có assetId và hướng sửa.

### Đầu ra và nghiệm thu
- Có tài liệu chuẩn, manifest mẫu, validator chạy được và scene xem asset với grid 1 m, bounds, pivot, socket.
- Nạp thử tối thiểu một nhân vật, một animation, một bàn, một ghế và một phụ kiện; chứng minh tỷ lệ và vị trí gắn đúng.
- Asset không hợp lệ có thông báo rõ, không âm thầm sửa làm mất dữ liệu.
- Có phương án chuyển manifest cũ sang schema mới và kiểm tra không mất bố trí hiện tại.

**KẾT THÚC PROMPT**

---

<a id="task-02"></a>

## TASK 02 — Hoàn thiện chuyển động và animation nhân vật

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 02 — Hoàn thiện chuyển động và animation nhân vật

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 01; tái sử dụng controller và engine vật lý hiện có.

### Mục tiêu
Hoàn thiện điều khiển góc nhìn thứ ba có cảm giác tự nhiên trong văn phòng, tương thích người dùng đã chỉnh chiều cao và hình thể.

### Yêu cầu triển khai
1. Tách input intent, character motor, animation state và camera. Đầu vào gồm bàn phím, cảm ứng hoặc gamepad qua cùng action interface; task này không cần xây toàn bộ UI đổi phím.
2. Di chuyển tương đối với hướng camera, chuẩn hóa vector để đi chéo không nhanh hơn. Có tăng/giảm tốc, quay mượt và xử lý quay 180 độ. Đứng yên khi không có input.
3. Xây state machine idle, walk, run, jumpStart, airborne, land và các trạng thái tương tác có sẵn. Quy định chuyển trạng thái, thời gian blend và ưu tiên; không phát hai animation cùng điều khiển chân trái ngược nhau.
4. Chọn in-place hoặc root motion theo asset thật. Nếu in-place, motor quyết định vận tốc và animation khớp tốc độ; nếu root motion, tích hợp qua vật lý để không xuyên tường. Không đồng thời áp hai nguồn chuyển động.
5. Dùng timestep vật lý cố định và nội suy hiển thị. Chống xuyên khi chạy bằng sweep/CCD phù hợp, xử lý mặt dốc, giới hạn độ dốc, bậc thấp, cầu thang và mép sàn. Grounded không chỉ dựa vào tọa độ Y.
6. Nhảy chỉ khi điều kiện hợp lệ; cấu hình jump buffer/coyote time nếu dùng. Xóa input khi mất focus; không cộng dồn delta lớn khi trở lại tab.
7. Tùy chỉnh capsule, bước chân và tốc độ hợp lý theo chiều cao trong phạm vi hỗ trợ. Dùng IK từ task 03 qua interface, không hardcode mỗi dáng người.
8. Bổ sung debug hiển thị velocity, grounded, slope, state, collider và animation blend; không hiện bảng kỹ thuật trong UI sản phẩm mặc định.

### Nghiệm thu
- Có đường kiểm thử gồm hành lang hẹp, góc tường, bậc thấp, cầu thang, dốc và vật cản thấp.
- So sánh quãng đường theo thời gian ở 30/60/120 FPS mô phỏng, đặt dung sai và báo kết quả.
- Đi chéo, đổi hướng, nhảy sát tường, mất focus và chuyển ngồi/đứng không gây trượt vô hạn, bay người hoặc mắc trạng thái.
- Kiểm tra ít nhất ba cấu hình chiều cao có hỗ trợ; báo rõ clip/rig thiếu thay vì giả lập bằng animation không liên quan.

**KẾT THÚC PROMPT**

---

<a id="task-03"></a>

## TASK 03 — IK tay chân và căn tư thế tương tác

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 03 — IK tay chân và căn tư thế tương tác

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 01–02; sử dụng socket và interaction anchor của đồ vật.

### Mục tiêu
Chân bám sàn, tay chạm đúng vật thể và tư thế ngồi thích nghi với hình thể mà không phá animation gốc.

### Yêu cầu triển khai
1. Tạo lớp IK sau bước lấy mẫu animation, có thứ tự cập nhật rõ: animation → target sampling → IK/corrective → cập nhật socket. Tái sử dụng solver trong dự án nếu phù hợp.
2. Foot IK lấy mẫu bề mặt dưới từng chân qua physics query và collision mask, điều chỉnh bàn chân theo pháp tuyến và bù pelvis có giới hạn. Phân biệt stance/swing để không khóa chân đang bước.
3. Có foot locking ở pha tiếp đất và cơ chế nhả khóa khi nhảy, đổi nền, bước lên vật chuyển động hoặc target mất. Làm mượt target, không raycast xuyên xuống tầng dưới.
4. Hand IK dùng target position/orientation và pole vector cho khuỷu tay. Có reach envelope, blend weight và giới hạn khớp; target quá xa phải báo không với tới, đổi vị trí hoặc từ chối hành động.
5. Ngồi ghế dùng seat anchor, hướng ngồi, chiều cao mặt ghế, điểm chân và vị trí đứng dậy. Phối hợp pelvis, chân và tay vịn thay vì dịch toàn bộ nhân vật xuống sàn.
6. Hỗ trợ cầm điện thoại/cốc bằng grip profile; đồ vật theo socket ổn định, không vừa bị parent vào tay vừa bị physics kéo ngược. Quy định rõ chuyển quyền điều khiển khi cầm/thả.
7. Khi hình thể thay đổi, cập nhật chiều dài chi, giới hạn reach và calibration. Không hứa mọi tỷ lệ cực đoan đều khả thi; công bố miền hỗ trợ.
8. Thêm debug target, ray, pole vector và weight; cho phép tắt từng solver để đối chiếu animation nguyên bản.

### Nghiệm thu
- Kiểm tra đứng trên sàn phẳng, bậc và dốc; chân không rung liên tục hoặc chui xuống sàn trong miền hỗ trợ.
- Thử với nắm cửa, cầm cốc và ngồi hai ghế khác chiều cao bằng ít nhất ba hình thể.
- Mất target giữa hành động phải blend về trạng thái an toàn, không giật xương về gốc tọa độ.
- Ghi ảnh/video trước và sau IK cùng giới hạn sai số đo được tại điểm tiếp xúc.

**KẾT THÚC PROMPT**

---

<a id="task-04"></a>

## TASK 04 — Chống xuyên cơ thể và phối nhiều lớp trang phục

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 04 — Chống xuyên cơ thể và phối nhiều lớp trang phục

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 01, rig/morph nhân vật và tủ đồ hiện có; phối hợp task 03.

### Mục tiêu
Giảm xuyên da, xuyên quần áo và phụ kiện khi chỉnh hình thể hoặc vận động; chỉ cho phép các tổ hợp được hỗ trợ thật.

### Yêu cầu triển khai
1. Kiểm kê garment asset, rig, skin weights, morph tương ứng, vùng che cơ thể, thứ tự lớp và dải hình thể hỗ trợ. Tạo compatibility matrix thay vì thử ghép mọi món tùy ý.
2. Đồng bộ body morph với garment morph qua mapping có giới hạn; không mặc định cùng tên morph là cùng ý nghĩa. Khi đổi tỷ lệ xương, cập nhật skinning và attachment.
3. Tạo body-region mask để ẩn phần da nằm kín dưới trang phục; lưu theo món và trạng thái. Không ẩn vùng có thể nhìn thấy qua cổ, tay áo, váy hoặc áo hở.
4. Định nghĩa layer như base, shirt, jacket và accessory, cùng quy tắc xung đột. Các biến thể sơ vin, áo mở, tay dài/ngắn phải có mesh hoặc morph phù hợp.
5. Bổ sung corrective morph cho tư thế có lỗi thường gặp ở vai, nách, khuỷu, hông và đầu gối. Chỉ dùng mô phỏng vải khi asset và budget hỗ trợ, không xem simulation là giải pháp thay thế mọi lỗi topology.
6. Kiểm tra kính, dây chuyền, đồng hồ, tóc và mũ với đầu/cổ/tay đã chỉnh. Dùng socket offset/profile theo biến thể có kiểm soát.
7. Khi người dùng chọn tổ hợp không hỗ trợ, giữ bộ hợp lệ trước đó và hiển thị lý do, gợi ý món tương thích; không tự xóa trang phục mà không có phản hồi.
8. Giải phóng mesh/material không còn dùng theo cơ chế sở hữu tài nguyên; không dispose tài nguyên chung đang được nhân vật khác dùng.

### Nghiệm thu
- Có bộ test hình thể mặc định và các biên được công bố, phối ít nhất ba kiểu bộ đồ và các animation đi/chạy/ngồi/giơ tay.
- Tạo bảng tổ hợp đạt/không đạt, kèm ảnh lỗi còn tồn tại. Không tuyên bố hoàn toàn không xuyên mesh chỉ từ một tư thế đứng.
- Đổi đồ nhiều lần không làm mất body mask, sai thứ tự lớp hoặc tăng bộ nhớ không giới hạn.

**KẾT THÚC PROMPT**

---

<a id="task-05"></a>

## TASK 05 — Camera ổn định và khôi phục nhân vật mắc kẹt

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 05 — Camera ổn định và khôi phục nhân vật mắc kẹt

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 02; collider và raycast của scene.

### Mục tiêu
Camera hoạt động ổn định trong văn phòng nhiều bàn ghế; nhân vật luôn có cách trở về vị trí an toàn.

### Yêu cầu triển khai
1. Tạo camera mode controller cho third-person, first-person nếu đã có, seated, inspect và overview. Chuyển mode có hợp đồng enter/exit, lưu trạng thái và ưu tiên rõ.
2. Third-person bám vào anchor theo chiều cao cơ thể, orbit yaw/pitch có giới hạn; làm mượt theo delta time và tránh giật khi xoay nhanh.
3. Dùng sphere cast/sweep từ điểm bám đến vị trí mong muốn, có collision mask để không bị props nhỏ không liên quan kéo camera quá gần. Thu camera khi gặp tường và trả khoảng cách mượt khi hết vướng.
4. Có near-clip phù hợp, xử lý camera sát đầu, góc tường và trần thấp. Nếu dùng làm mờ nhân vật khi quá gần, khôi phục đúng material gốc, không tạo bản sao material mỗi frame.
5. Khi chuyển ngồi, dùng máy tính hoặc inspect, kiểm tra đường đi camera và cho Esc thoát về mode trước. Không để UI chiếm input và camera vẫn xoay.
6. Theo dõi safe position đã được kiểm tra có sàn và đủ khoảng trống. Cung cấp nút “Về vị trí an toàn”; không tự teleport chỉ vì người chơi đứng yên.
7. Khi rơi khỏi map hoặc physics invalid, phục hồi về safe position/spawn, reset velocity và state liên quan. Trong multiplayer, vị trí phục hồi phải được server xác nhận.
8. Có tùy chọn giảm camera shake, giảm chuyển động và độ nhạy; không bật rung lắc mạnh mặc định.

### Nghiệm thu
- Test đi lùi sát tường, qua cửa hẹp, dưới gầm/cạnh bàn, ngồi cạnh tủ, đổi hình thể và zoom cực trị.
- Không xuyên tường nghiêm trọng, không dao động liên tục giữa hai khoảng cách và không mất con trỏ khi thoát mode.
- Phục hồi từ ngoài map không chui vào bàn hoặc người khác; có fallback spawn nếu safe position cũ đã bị chặn.

**KẾT THÚC PROMPT**

---

<a id="task-06"></a>

## TASK 06 — Lưu và khôi phục toàn bộ trạng thái

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 06 — Lưu và khôi phục toàn bộ trạng thái

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 01; tích hợp các module hiện có, chuẩn bị cho task 20 và 22.

### Mục tiêu
Lưu nhân vật, hình thể, hình xăm, bộ đồ, bố trí phòng và trạng thái vật thể theo schema rõ, tải lại không mất hoặc sai dữ liệu.

### Yêu cầu triển khai
1. Thiết kế snapshot có schemaVersion, sceneId, revision, timestamp, asset references, character configuration, appearance layers, outfit, layout overrides, object states và user settings. Không serialize trực tiếp toàn bộ scene graph hoặc instance vật lý.
2. Phân biệt dữ liệu bền vững với transient state: không lưu khóa phím, con trỏ, animation frame hoặc lock vật thể đang giữ như sự thật lâu dài. Position phải được kiểm tra lại khi restore.
3. Dùng IndexedDB cho dữ liệu/Blob lớn nếu chưa có backend; localStorage chỉ cho cấu hình nhỏ. Đặt storage adapter để thêm server sau, không giả lập đồng bộ cloud.
4. Autosave có debounce và hàng đợi tuần tự; có lưu thủ công, trạng thái đang lưu/thành công/lỗi và cảnh báo dữ liệu chưa lưu khi cần. Đảm bảo ghi snapshot và tham chiếu asset không rơi vào trạng thái nửa chừng.
5. Validate trước khi ghi và sau khi đọc; migration từ schema được hỗ trợ, backup trước migration và từ chối bản quá mới bằng thông báo rõ.
6. Lưu ảnh xăm/họa tiết bằng asset ID và nội dung bền vững; không dùng object URL tạm làm định danh. Kiểm tra reference missing và có fallback không phá bản gốc.
7. Xử lý quota, tab đóng giữa lúc lưu, dữ liệu lỗi và nhiều tab ghi đồng thời. Dùng revision hoặc compare-and-swap phù hợp; không âm thầm ghi đè bản mới.
8. Khi restore, tải asset rồi áp morph/đồ/scene theo thứ tự, kiểm tra collider và đưa nhân vật về vị trí an toàn nếu cần.

### Nghiệm thu
- Round-trip: chỉnh hình thể, thêm xăm, đổi đồ, chuyển bàn, mở rèm, reload rồi đối chiếu các trường quan trọng.
- Test quota/lỗi ghi, JSON sai, asset mất, migration và hai tab xung đột.
- Có nút khôi phục bản lưu gần nhất và đặt lại, phân biệt rõ hai hành động; không xóa dữ liệu người dùng chỉ vì một asset không tải được.

**KẾT THÚC PROMPT**

---

<a id="task-07"></a>

## TASK 07 — Tải asset, phục hồi lỗi và mất ngữ cảnh đồ họa

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 07 — Tải asset, phục hồi lỗi và mất ngữ cảnh đồ họa

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 01 và 06; loader/renderer hiện có.

### Mục tiêu
Ứng dụng có quy trình tải và phục hồi rõ ràng khi mạng chậm, asset hỏng hoặc GPU context mất; người dùng không phải nhìn màn hình trống.

### Yêu cầu triển khai
1. Tạo loading coordinator cho manifest, geometry, texture, decoder và animation; phân biệt critical asset để vào scene với asset có thể tải sau.
2. Hiển thị tiến độ thực tế. Nếu không biết tổng byte, dùng số mục/giai đoạn hoặc trạng thái không xác định, không dựng phần trăm giả.
3. Giới hạn số yêu cầu đồng thời, timeout, retry có backoff và jitter; chỉ retry lỗi có khả năng phục hồi. Có nút thử lại và hủy, dùng cancellation token/AbortController khi API hỗ trợ.
4. Deduplicate yêu cầu cùng asset/version, cache theo hash, tránh kết quả tải cũ gắn vào lựa chọn mới khi người dùng đổi đồ liên tục.
5. Asset tùy chọn lỗi có placeholder nhận diện được và thông báo; asset quan trọng lỗi phải có màn hình phục hồi. Không thay bằng asset khác rồi báo tải đúng.
6. Xử lý decoder không khả dụng, định dạng không hỗ trợ và URL hết hạn qua adapter. Không ghi signed URL hoặc thông tin xác thực vào log công khai.
7. Với WebGL, lắng nghe context lost/restored theo renderer đang dùng; tạm dừng simulation/input phù hợp, khôi phục tài nguyên từ manifest/state hoặc remount có kiểm soát. Nếu phục hồi không được, cho reload an toàn sau khi lưu được trạng thái.
8. Xử lý offline, resume tab, cache invalid và lỗi CORS bằng thông báo có hướng hành động; giới hạn số lần tự động retry để tránh vòng lặp.

### Nghiệm thu
- Mô phỏng mạng chậm, mất mạng, 404, texture hỏng, đổi đồ khi đang tải và hủy giữa chừng.
- Mô phỏng context loss bằng công cụ phù hợp khi có hỗ trợ; ghi rõ môi trường không hỗ trợ kiểm thử này.
- Không leak listener, tải trùng vô hạn hoặc mất cấu hình nhân vật sau phục hồi.

**KẾT THÚC PROMPT**

---

<a id="task-08"></a>

## TASK 08 — Đo hiệu năng và tối ưu rendering/bộ nhớ

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 08 — Đo hiệu năng và tối ưu rendering/bộ nhớ

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 01, 07; scene và nhân vật đại diện phải chạy được.

### Mục tiêu
Đo trước khi tối ưu, xác định bottleneck và cải thiện FPS, thời gian tải, draw calls cùng bộ nhớ mà vẫn giữ độ giống văn phòng.

### Yêu cầu triển khai
1. Tạo benchmark tuyến camera cố định qua toàn cảnh, hành lang đông bàn, cận nhân vật và phòng thay đồ. Ghi máy, trình duyệt, viewport, DPR, chất lượng, số người/asset và trạng thái cache.
2. Thu frame-time median/p95, FPS, draw calls, triangles, texture/geometry counts, thời gian tải và số byte tải khi quan sát được. Phân biệt số đo CPU, GPU thật và ước lượng; không gắn nhãn GPU memory cho một con số suy ra thiếu căn cứ.
3. Phân tích render loop, React re-render nếu có, physics, animation, raycast và texture upload. Không đổi UI state mỗi frame nếu không cần.
4. Instancing đồ tĩnh lặp lại khi phù hợp; dùng chung geometry/material, frustum culling, LOD, texture compression và lazy loading. Không gộp đồ cần tương tác thành mesh mất ID.
5. Giới hạn đèn đổ bóng, shadow map, post-processing và phản chiếu; phân biệt đèn có hình phát sáng với đèn thật. Tránh hàng trăm shadow-casting light.
6. Tạo ownership/ref-count hoặc resource registry rõ ràng. Khi đổi cảnh/đồ, dispose tài nguyên không còn dùng nhưng giữ asset chung đang có người sử dụng; thu hồi object URL và listener.
7. Đặt mục tiêu theo thiết bị tham chiếu đã đo; có thể dùng 60 FPS desktop và 30 FPS mobile làm mục tiêu ban đầu, không coi đó là kết quả trước khi test.
8. So sánh trước/sau cùng điều kiện; nếu giảm chất lượng phải ghi rõ tác động nhìn thấy được.

### Nghiệm thu
- Có báo cáo benchmark tái lập và bảng trước/sau, không chỉ ảnh FPS ở cảnh trống.
- Chạy vòng đổi trang phục và vào/ra scene đủ nhiều lần để phát hiện xu hướng tăng tài nguyên; phân biệt cache có giới hạn với leak.
- Không làm mất tương tác, collider, bóng quan trọng hoặc chi tiết nhận diện nội thất.

**KẾT THÚC PROMPT**

---

<a id="task-09"></a>

## TASK 09 — Minimap, tìm phòng và chỉ đường

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 09 — Minimap, tìm phòng và chỉ đường

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 01, 02, 05; layout có roomId và vùng đi lại.

### Mục tiêu
Người dùng xác định mình đang ở đâu trong văn phòng chữ L, tìm phòng/bàn và nhận hướng dẫn theo đường có thể đi thực tế.

### Yêu cầu triển khai
1. Tạo bản đồ 2D từ cùng dữ liệu layout dùng dựng cảnh; không vẽ một sơ đồ độc lập dễ lệch. Có chuyển đổi tọa độ world ↔ map và hiệu chỉnh theo bounds.
2. Hiển thị tường, cửa, khu vực đi lại, tên phòng, vị trí và hướng nhân vật. Không vẽ khu trống ngoài phạm vi khoanh xanh thành phòng đang dùng.
3. Minimap có chế độ cố định hướng bắc hoặc xoay theo người, zoom và mở bản đồ lớn; xử lý hướng icon đúng ở cả hai chế độ.
4. Tìm theo tên phòng, mã phòng hoặc bàn có ID. Khi không có dữ liệu, hiển thị trạng thái trống; không tạo tên nhân viên giả làm dữ liệu thật.
5. Dùng navmesh/navigation graph phù hợp, có clearance theo collider nhân vật. Đường đi phải qua cửa và hành lang, không xuyên bàn, tường hoặc khu ngoài phạm vi.
6. Có tuyến hướng dẫn trên bản đồ và tùy chọn marker trong thế giới, kèm khoảng cách tính theo tuyến. Không tự di chuyển nhân vật nếu người dùng chưa bật chế độ đó.
7. Cửa khóa, đồ nội thất vừa chuyển hoặc đường bị chặn phải cập nhật vùng/edge liên quan và tính lại tuyến có debounce. Nếu không có đường, giải thích và cho chọn đích khác.
8. Cho phép tắt chỉ đường, xóa đích, tiếp tục sau khi đóng bản đồ. Mở bản đồ phải phối hợp với input focus, không vừa bấm tìm kiếm vừa chạy nhân vật.

### Nghiệm thu
- Chọn đích ở hai nhánh chữ L, đứng sát góc tường và thử đường vòng qua cửa.
- Chặn đường bằng đồ được phép chuyển; tuyến được tính lại hoặc báo không tới được.
- Tọa độ marker khớp vị trí world tại nhiều điểm chuẩn; layout thay đổi không làm minimap dùng dữ liệu cũ.
- Bản đồ dùng được bằng bàn phím và cảm ứng; không che các nút điều khiển chính.

**KẾT THÚC PROMPT**

---

<a id="task-10"></a>

## TASK 10 — Hướng dẫn lần đầu và trợ giúp theo ngữ cảnh

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 10 — Hướng dẫn lần đầu và trợ giúp theo ngữ cảnh

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Controller, interaction, avatar editor hiện có; task 06 để lưu tiến độ.

### Mục tiêu
Giúp người mới học di chuyển, nhìn quanh, tương tác và thay đồ bằng các bước ngắn có thể bỏ qua, không làm gián đoạn trải nghiệm.

### Yêu cầu triển khai
1. Xây tutorial state machine gồm giới thiệu, di chuyển, xoay camera, tương tác ghế/cửa, mở trình nhân vật, lưu và kết thúc. Chỉ đưa bước có chức năng thật trong build.
2. Hoàn tất bước dựa trên domain event hoặc điều kiện thực tế: nhân vật đã di chuyển đủ, cửa thật sự mở, cấu hình đã lưu thành công; không tính chỉ vì người dùng bấm “Tiếp”.
3. Chỉ dẫn dùng tên phím/action từ input mapping hiện tại, cập nhật khi đổi phím hoặc thiết bị. Không hardcode “E” nếu người dùng đã remap.
4. Có bỏ qua, tạm dừng, xem lại và mục trợ giúp luôn truy cập được. Lưu tutorialVersion và progress để phiên mới không lặp vô lý; nội dung mới có thể giới thiệu riêng.
5. Nếu vật mục tiêu bị chuyển, đã chiếm hoặc không tải được, chọn mục tiêu hợp lệ khác hoặc cho bỏ bước với lý do. Không khóa người dùng trong overlay chờ sự kiện không thể xảy ra.
6. Overlay không che mục tiêu và hỗ trợ kích thước màn hình nhỏ. Focus được đưa tới nút phù hợp và trả lại sau khi đóng, không bẫy bàn phím.
7. Tôn trọng reduced motion, không bắt người dùng thực hiện thao tác nhanh hoặc kéo chính xác mới tiếp tục được. Đọc nội dung được bằng công nghệ hỗ trợ khi dùng DOM.
8. Nếu thêm thống kê hoàn tất, dùng event tối thiểu và không ghi nội dung cá nhân; không tự tích hợp dịch vụ analytics ngoài khi dự án chưa dùng.

### Nghiệm thu
- Người mới hoàn tất luồng bằng desktop và touch; người đã biết bỏ qua ngay rồi mở lại được.
- Reload giữa bước, đổi phím, mất target và mở menu không làm tiến độ sai hoặc giữ input bị khóa.
- Không có bước chỉ tới chức năng chưa triển khai, không gắn nhiều listener sau khi xem lại.

**KẾT THÚC PROMPT**

---

<a id="task-11"></a>

## TASK 11 — Cài đặt điều khiển và hỗ trợ nhiều thiết bị

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 11 — Cài đặt điều khiển và hỗ trợ nhiều thiết bị

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 02, 05; phối hợp task 12 và 06.

### Mục tiêu
Thiết lập một input action system dùng chung cho bàn phím/chuột, gamepad và cảm ứng, có cấu hình lưu được.

### Yêu cầu triển khai
1. Định nghĩa action thay vì nối trực tiếp key vào logic: move, look, run, jump, interact, cancel, map, editor và các action hiện có. Có input context cho gameplay, UI, text entry, inspect và editor.
2. Trang đổi phím hiển thị binding hiện tại, nhận binding mới, phát hiện trùng trong cùng context, cho đổi/hoán đổi/hủy và khôi phục mặc định. Không chặn các phím tắt bắt buộc của trình duyệt.
3. Xác định dùng physical key code hay ký tự theo từng hành động; hiển thị nhãn phù hợp. Không để nhập tiếng Việt hoặc IME trong ô văn bản kích hoạt gameplay.
4. Có độ nhạy chuột, đảo trục Y, chạy giữ/bật tắt và các lựa chọn cần thiết; chuẩn hóa theo thiết bị, không nhân mouse delta sai khiến cảm giác lệ thuộc FPS.
5. Gamepad có deadzone, đường cong analog, mapping được nhận diện, hot-plug và ngắt kết nối an toàn. Trình duyệt không hỗ trợ phải có fallback; không hiển thị đã kết nối nếu chưa có thiết bị thật.
6. Touch gồm joystick di chuyển, vùng kéo nhìn và nút hành động; quản lý pointerId riêng để đa chạm không tranh nhau, xử lý safe area, xoay màn hình và pointer cancel.
7. Mất focus, mở menu, nhả Pointer Lock, tháo gamepad hoặc mất touch phải xóa trạng thái giữ. Chỉ khóa con trỏ sau thao tác người dùng hợp lệ và xử lý lỗi bị từ chối.
8. Lưu version của bindings, validate trước restore và đảm bảo luôn có đường thoát/hủy bằng UI.

### Nghiệm thu
- Đổi WASD, giải quyết binding trùng, gõ văn bản, Alt-Tab và Esc không tạo di chuyển ngoài ý muốn.
- Kiểm tra gamepad thật nếu có; nếu chỉ giả lập phải ghi rõ giới hạn.
- Di chuyển và xoay nhìn đồng thời trên touch; không cuộn trang trong vùng gameplay nhưng UI vẫn cuộn được.

**KẾT THÚC PROMPT**

---

<a id="task-12"></a>

## TASK 12 — Khả năng tiếp cận và thao tác thay thế kéo thả

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 12 — Khả năng tiếp cận và thao tác thay thế kéo thả

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 11; áp dụng cho avatar editor, scene editor và mọi panel.

### Mục tiêu
Người dùng có thể thao tác các chức năng quan trọng mà không phụ thuộc riêng vào kéo chuột, phân biệt màu hoặc chuyển động camera mạnh.

### Yêu cầu triển khai
1. Kiểm kê UI và thao tác 3D: kéo hình thể, đặt xăm, chuyển đồ, xoay mô hình, chọn màu và tương tác. Với mỗi thao tác, ghi phương án bàn phím và thao tác một con trỏ đơn giản tương đương.
2. Bổ sung nút chọn vùng cơ thể/đồ vật trong danh sách, nhập số và nút tăng/giảm; chọn rồi bấm đích để đặt đồ khi khả thi. Không coi bàn phím là phương án duy nhất thay cho kéo đối với người chỉ dùng một con trỏ.
3. Dùng DOM control có label, mô tả, trạng thái disabled, lỗi và focus rõ; không vẽ toàn bộ form vào canvas rồi mất ngữ nghĩa.
4. Modal có focus management, đóng bằng nút và Esc, trả focus về nơi mở. Thứ tự Tab hợp lý, không bẫy focus; Pointer Lock phải được nhả trước khi dùng form.
5. Trạng thái hợp lệ/không hợp lệ dùng chữ/icon ngoài màu xanh/đỏ. Kiểm tra tương phản, cỡ chữ, zoom trình duyệt và kích thước vùng chạm.
6. Cung cấp reduced motion, tắt camera shake, tắt hiệu ứng nhấp nháy và thời gian chuyển camera ngắn/không chuyển theo cài đặt.
7. Thông báo lưu/lỗi/tương tác bằng vùng live phù hợp, không đọc telemetry mỗi frame. Âm thanh quan trọng có gợi ý văn bản hoặc trạng thái tương đương.
8. Phạm vi tiếp cận của thế giới 3D cần nêu trung thực; có danh sách phòng và vật thể tương tác để tiếp cận các chức năng chính qua UI nếu thực hiện được.

### Nghiệm thu
- Hoàn tất chỉnh một vùng cơ thể, đặt xăm, đổi đồ, lưu và sắp xếp một vật bằng bàn phím; thử lại chỉ bằng bấm/chạm không kéo.
- Kiểm tra focus, zoom 200%, chế độ giảm chuyển động và screen reader trên các panel chính khi môi trường cho phép.
- Báo các tiêu chí đã kiểm tra và hạn chế còn lại; không tuyên bố đạt toàn bộ WCAG chỉ dựa vào automated scan.

**KẾT THÚC PROMPT**

---

<a id="task-13"></a>

## TASK 13 — Chế độ đồ họa và chất lượng tự thích nghi

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 13 — Chế độ đồ họa và chất lượng tự thích nghi

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 07–08; có baseline benchmark.

### Mục tiêu
Cho người dùng chọn chất lượng phù hợp thiết bị, giữ chức năng và trạng thái ổn định khi đổi cấu hình.

### Yêu cầu triển khai
1. Tạo preset Thấp/Vừa/Cao và Tùy chỉnh. Mỗi preset có bảng giá trị cho DPR cap, shadow, texture tier, LOD distance, antialiasing, ambient occlusion, reflection và post-processing đang được engine hỗ trợ.
2. Không hiển thị tùy chọn không thực sự thay đổi renderer. Nếu một thay đổi cần reload, báo rõ và lưu trạng thái trước khi áp dụng.
3. Có giới hạn FPS hoặc chế độ tiết kiệm khi đứng yên/tab nền. Render có thể giảm tần suất nhưng simulation/timestep không bị sai tốc độ; online vẫn phải duy trì heartbeat theo thiết kế.
4. Đề xuất preset ban đầu bằng feature detection và benchmark ngắn khi thích hợp; không chỉ dựa vào user-agent hoặc tên GPU. Không thu thông tin thiết bị vượt nhu cầu.
5. Adaptive quality là tùy chọn: lấy mẫu frame-time theo cửa sổ, dùng hysteresis/cooldown để tránh nhảy mức liên tục. Ưu tiên giảm chi phí ít ảnh hưởng trước; không tự thay đổi lựa chọn thủ công khi người dùng đã khóa preset.
6. Thiết bị không hỗ trợ tính năng phải ẩn/disable kèm lý do, có fallback phù hợp. Giới hạn DPR trên màn hình mật độ cao để tránh render quá tải.
7. Đổi chất lượng phải cập nhật resource lifecycle, tránh giữ texture/shadow target cũ vô hạn và không làm mất decal, avatar hay interaction state.
8. Lưu cài đặt theo thiết bị/browser, tách với cấu hình nhân vật dùng chung; có nút đặt lại.

### Nghiệm thu
- So sánh cùng camera ở ba preset bằng ảnh và bảng frame-time/draw calls.
- Chuyển preset nhiều lần, resize, full screen, tab nền và quay lại không làm màn hình đen hoặc nhân vật chạy sai tốc độ.
- Ghi rõ thiết bị đo và preset nào chưa được kiểm chứng trên máy thật.

**KẾT THÚC PROMPT**

---

<a id="task-14"></a>

## TASK 14 — Âm thanh không gian và phản hồi tương tác

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 14 — Âm thanh không gian và phản hồi tương tác

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 02 và hệ thống tương tác; task 13 cung cấp cài đặt chất lượng.

### Mục tiêu
Âm thanh hỗ trợ cảm giác hiện diện trong văn phòng, có khoảng cách và hướng hợp lý, không gây ồn hoặc phát sai trạng thái.

### Yêu cầu triển khai
1. Tạo audio manager với các bus master, ambience, footsteps, interaction, UI và voice để dành cho task 25. Có mute, volume và lưu cấu hình.
2. Khởi tạo/resume audio context sau thao tác người dùng theo chính sách browser; nếu bị chặn thì có nút bật âm thanh, không tự báo đã phát.
3. Bước chân phát theo animation event hoặc quãng bước đồng bộ với vận tốc. Chọn âm theo surface tag: gạch, thảm nếu có, cầu thang; có nhiều sample và biến thiên nhỏ để tránh lặp máy móc.
4. Cửa, ngăn kéo, ghế, công tắc và máy in có âm tương ứng với thời điểm hành động thành công, không phát khi bị từ chối.
5. Dùng spatial audio cho nguồn trong scene: vị trí, khoảng cách giảm âm, giới hạn nghe và hướng khi cần. UI sound dùng non-spatial; chọn listener theo camera/người chơi và giữ nhất quán.
6. Ambience văn phòng nhẹ, loop không lộ điểm nối. Occlusion hoặc vùng phòng dùng giải pháp đơn giản có budget; không raycast mọi nguồn mỗi frame hoặc hứa mô phỏng âm học thật.
7. Giới hạn nguồn đồng thời, ưu tiên nguồn gần/quan trọng, pool sound, fade khi dừng. Xử lý tab nền, đổi cảnh và tháo vật thể không để âm kẹt.
8. Có nguồn asset và giấy phép rõ; không nhúng tiếng người thật từ ảnh/video tham chiếu. Cung cấp mô tả văn bản cho tín hiệu quan trọng.

### Nghiệm thu
- Di chuyển xa/gần cửa và máy in nghe mức âm thay đổi đúng; xoay camera kiểm tra hướng.
- Chạy/đứng/nhảy không phát bước chân sai; spam tương tác không chồng hàng trăm âm.
- Mute từng bus hoạt động, resume tab không phát dồn âm cũ; không làm tăng nguồn audio sau nhiều lần vào/ra cảnh.

**KẾT THÚC PROMPT**

---

<a id="task-15"></a>

## TASK 15 — Biểu cảm và hành động nhanh của nhân vật

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 15 — Biểu cảm và hành động nhanh của nhân vật

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 01–03; input action system và rig tương thích.

### Mục tiêu
Nhân vật có các hành động văn phòng và giao tiếp ngắn, không xung đột với di chuyển, tương tác vật thể hoặc hình thể tùy chỉnh.

### Yêu cầu triển khai
1. Tạo thư viện action có ID, clip, duration/loop, mask, precondition, cancel policy, cooldown và prop requirement. Bộ ban đầu: chào tay, gật đầu, lắc đầu, chỉ tay, khoanh tay, xem điện thoại và ngồi thư giãn nếu có clip phù hợp.
2. Phân loại full-body và upper-body; chỉ layer với locomotion khi animation mask và rig hỗ trợ. Không phát action khiến chân trượt trong khi đang ngồi.
3. Tạo action wheel hoặc panel nhanh có tên/icon, phím tắt cấu hình được và tương đương touch/bàn phím. Khóa input nhìn khi wheel chiếm pointer theo context.
4. State machine xử lý start, active, finish, cancel; quy định hành động nào bị ngắt khi đi/chạy/nhảy, bị tương tác khác hoặc mở editor. Thoát blend mượt, không kẹt pose.
5. Biểu cảm mặt dùng morph target thật có tên mapping; giới hạn cường độ và tránh tổ hợp làm xuyên mí/môi. Nếu rig không có facial morph, nêu thiếu asset thay vì giả vờ đổi biểu cảm.
6. Action dùng điện thoại phải gắn prop, hand IK và ánh nhìn hợp lý; prop được thu hồi khi hủy, không tạo bản sao tồn tại trong scene.
7. Không đưa hành động người lớn hoặc bạo lực vào bộ mặc định. Không cần sao chép danh tính hay biểu cảm người trong ảnh.
8. Chuẩn bị event gồm actionId, startTime và parameters có thể đồng bộ ở task 23, nhưng không xây backend multiplayer trong task này.

### Nghiệm thu
- Chạy chuỗi chào → đi → điện thoại → hủy → ngồi trên ba hình thể được hỗ trợ.
- Nhấn liên tiếp, đổi đồ giữa action và mất focus không tạo prop rác hoặc kẹt animation.
- Mỗi mục UI có clip hoạt động thật; liệt kê asset chưa đủ để triển khai.

**KẾT THÚC PROMPT**

---

<a id="task-16"></a>

## TASK 16 — Chế độ chụp ảnh nhân vật và văn phòng

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 16 — Chế độ chụp ảnh nhân vật và văn phòng

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 05, 13, 15; scene/renderer hiện có.

### Mục tiêu
Cho người dùng bố trí góc máy, tạo dáng và xuất ảnh chất lượng phù hợp mà không làm hỏng phiên tham quan.

### Yêu cầu triển khai
1. Photo mode lưu camera mode, vị trí, FOV, UI visibility và trạng thái input trước khi vào; khôi phục đúng khi thoát. Có orbit avatar và free camera giới hạn trong vùng cho phép.
2. Công cụ gồm FOV/tiêu cự tương đương, độ nghiêng, grid bố cục, tỉ lệ ảnh, camera preset và chọn pose từ task 15. Không bóp méo nhân vật bằng thay tỷ lệ mesh để tạo hiệu ứng camera.
3. Có ẩn UI, tên người, marker và guide khi chụp; phân biệt cài đặt chỉ cho ảnh với thay đổi scene thật. Tạm dừng cục bộ nếu hỗ trợ; không đóng băng người chơi khác trong phòng online.
4. Xuất PNG và JPEG với độ phân giải định sẵn, kiểm tra giới hạn texture/renderbuffer và bộ nhớ thiết bị. Nếu quá lớn, báo rõ và đề xuất giảm kích thước.
5. Dùng render target hoặc cơ chế capture phù hợp; xử lý color space, tone mapping và alpha đúng. Không xuất ảnh đen vì canvas bị clear hoặc texture CORS làm taint mà vẫn báo thành công.
6. Tạo preview, tải xuống thật, tên file an toàn và giải phóng buffer/object URL sau khi dùng. Hủy capture không để UI ẩn vĩnh viễn.
7. Nếu có ảnh chân dung nền trong suốt, chỉ cung cấp khi pipeline hỗ trợ đúng; không thay nền trắng rồi gọi là transparent.
8. Có preset góc tổng thể chữ L, hành lang và cận nhân vật; giữ asset license/source khi cần lưu metadata.

### Nghiệm thu
- Chụp từng tỷ lệ ở độ phân giải hỗ trợ, mở file kiểm tra số pixel, màu và nội dung.
- Thử ảnh có texture ngoài, resize giữa thao tác, hủy và lỗi ghi/tải.
- Thoát photo mode khôi phục đúng camera/input; ảnh không chứa UI đã chọn ẩn hoặc debug overlay.

**KẾT THÚC PROMPT**

---

<a id="task-17"></a>

## TASK 17 — Trình biên tập bố trí văn phòng

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 17 — Trình biên tập bố trí văn phòng

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 01, 06; dùng chung layout với task 09; quyền online do task 26.

### Mục tiêu
Chỉnh sửa bố trí văn phòng qua công cụ trực quan, dùng cùng dữ liệu và component với cảnh tham quan, bảo toàn bản thiết kế gốc.

### Yêu cầu triển khai
1. Tạo edit mode tách khỏi play mode. Có danh sách đối tượng, tìm kiếm, chọn trong scene, gizmo translate/rotate và bảng thuộc tính; scale chỉ mở với loại cho phép.
2. Đối tượng có stable ID, type, transform, asset reference, roomId, parent/group và interaction configuration. Không dùng chỉ số mảng làm ID lâu dài.
3. Hỗ trợ thêm, nhân bản, xóa, nhóm, khóa, ẩn, snap grid, snap góc và nhập số theo mét/độ. Nhân bản phải tạo ID mới cho object và interaction liên quan.
4. Tường/cửa/cột có quy tắc riêng: cửa gắn tường và lỗ mở, tường nối hợp lý; cột và lõi kết cấu khóa mặc định. Chỉ cho chỉnh cấu trúc khi người dùng bật rõ chế độ tương ứng và giữ trong phạm vi chữ L.
5. Thêm/sửa đèn, material override và interaction anchor qua schema có validation. Đèn phải tuân budget rendering, không tự tạo bóng cho tất cả.
6. Preview vị trí hợp lệ/không hợp lệ, collider, giới hạn vùng, cửa mở và lối đi tối thiểu theo cấu hình dự án. Không coi kiểm tra này là chứng nhận tuân thủ xây dựng.
7. Undo/redo bằng command stack hoặc transaction; kéo liên tục tạo một thao tác, không hàng nghìn bước. Hủy edit trả về bản trước; Save ghi một revision nhất quán.
8. Sau commit, cập nhật colliders, navigation graph/minimap và interaction index theo vùng ảnh hưởng. Đồ trên bàn đi theo quan hệ đã định nghĩa.
9. Lưu draft riêng khỏi published layout; có preview và reset về bản gốc. Online không broadcast các thao tác tạm thành dữ liệu chính thức nếu chưa có cơ chế collaboration.

### Nghiệm thu
- Thêm cụm bàn/ghế, đặt cửa đúng tường, đổi đèn, undo/redo, save/reload và so sánh layout.
- Vị trí ngoài phạm vi, trùng ID, cửa bị bít và parent cycle bị chặn hoặc cảnh báo có thể kiểm tra.
- Đổi mode không mất điều khiển hoặc để gizmo tương tác trong chế độ tham quan.

**KẾT THÚC PROMPT**

---

<a id="task-18"></a>

## TASK 18 — Quản lý thư viện asset và danh mục đồ

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 18 — Quản lý thư viện asset và danh mục đồ

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 01, 04, 07; trang quản lý theo cơ chế quyền hiện có.

### Mục tiêu
Quản lý nội thất, trang phục, tóc, phụ kiện, animation và vật liệu bằng danh mục có phiên bản và khả năng tương thích rõ ràng.

### Yêu cầu triển khai
1. Tạo danh mục theo type, tag, style, màu, rig profile, body range, layer và trạng thái draft/available/deprecated. Tìm kiếm, lọc, phân trang hoặc virtualize với thư viện lớn.
2. Trang chi tiết có model preview, bounds, triangle/material/texture statistics, socket, morph/clip, source/license và cảnh báo validator. Thumbnail phải có fallback khi asset lỗi.
3. Upload/import dùng pipeline task 01/19 với giới hạn định dạng/dung lượng, kiểm tra external reference và decoder. Không chạy script hoặc cho loader tải URL tùy ý từ metadata không tin cậy.
4. Asset ID ổn định, version bất biến theo hash. Cập nhật asset tạo version mới và cho preview tác động trước khi thay tham chiếu trong scene/outfit.
5. Trước khi xóa hoặc deprecate, hiển thị nơi đang dùng trong nhân vật, bộ đồ và layout. Không xóa bytes còn được phiên bản/bản lưu tham chiếu; chính sách dọn rác có grace period.
6. Thư viện hiển thị tương thích theo nhân vật hiện tại; món không phù hợp có lý do. Không cần retarget/fitting tự động cho mọi asset nhập.
7. Hỗ trợ batch tagging và chỉnh metadata có xác thực; không đổi asset gốc của người khác khi chỉ người dùng cá nhân đang chỉnh bộ phối.
8. Nếu chưa có backend, dùng repository/local catalog qua adapter và ghi rõ chức năng quản trị chia sẻ chưa có; không giả nút publish/upload server.

### Nghiệm thu
- Import một món nội thất và một món đồ mặc, tạo thumbnail, validate, đưa vào scene/avatar.
- Thử asset thiếu texture, sai rig, tên trùng và version cũ còn được dùng.
- Rollback reference về phiên bản trước không làm hỏng bản lưu; đổi filter không gây tải lại toàn bộ model nặng.

**KẾT THÚC PROMPT**

---

<a id="task-19"></a>

## TASK 19 — Xử lý ảnh tải lên cho hình xăm và họa tiết

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 19 — Xử lý ảnh tải lên cho hình xăm và họa tiết

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 01, 06; hệ thống decal/UV và chỉnh sửa nhân vật hiện có.

### Mục tiêu
Biến ảnh người dùng tải lên thành asset hình xăm/họa tiết có thể chỉnh, lưu và khôi phục chính xác trên mô hình.

### Yêu cầu triển khai
1. Hỗ trợ PNG/JPEG/WebP nếu decoder cho phép. Validate MIME và signature, dung lượng nén, chiều rộng/cao và tổng pixel sau giải mã; từ chối ảnh hỏng hoặc quá lớn trước khi đưa lên GPU.
2. Mặc định không nhận SVG tùy ý như ảnh an toàn; nếu cần hỗ trợ phải có pipeline sanitize/rasterize rõ. Không dùng tên file làm HTML hoặc đường dẫn filesystem trực tiếp.
3. Công cụ crop, xoay, flip, resize giữ tỷ lệ, chỉnh alpha và color tint. Có checkerboard để kiểm tra nền trong suốt và undo/redo.
4. Xóa nền chỉ hiển thị nếu có thuật toán/model/dịch vụ thật. Chạy local khi khả thi; nếu gửi ảnh ra dịch vụ ngoài, nêu rõ nơi xử lý và để người dùng chủ động kích hoạt. Có fallback giữ nguyên ảnh hoặc xóa vùng màu đơn giản được mô tả đúng.
5. Bỏ metadata không cần thiết như EXIF vị trí. Tạo asset ID/hash, lưu bản gốc và bản dẫn xuất nếu cần, kèm quy trình chỉnh để sửa lại không phá hủy.
6. Áp hình lên đúng UV/decal layer, kiểm soát seam, bleeding, depth bias và giới hạn vùng cơ thể/quần áo. Hình xăm dùng cùng biến dạng da; không chỉ parent một plane trước cánh tay.
7. Preview trên vùng chọn, chỉnh translate/scale/rotate, đổi thứ tự lớp và chọn mask. Kiểm tra hình xăm không chiếu xuyên sang phía sau hoặc nổi trên quần áo.
8. Lưu blob bền vững qua adapter task 06, thu hồi object URL tạm và texture không còn dùng. Dọn asset chỉ khi không còn reference.

### Nghiệm thu
- Tải ảnh nền trong suốt, ảnh dọc/ngang, ảnh có EXIF, file giả đuôi ảnh và ảnh quá số pixel.
- Đặt xăm lên tay, đổi hình thể, chạy animation, mặc áo rồi reload: vị trí và độ che đúng trong miền hỗ trợ.
- Lỗi xử lý hoặc quota không làm mất các lớp đã lưu trước đó; không báo xóa nền thành công khi chưa xử lý.

**KẾT THÚC PROMPT**

---

<a id="task-20"></a>

## TASK 20 — Xuất/nhập, sao lưu và phiên bản dữ liệu

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 20 — Xuất/nhập, sao lưu và phiên bản dữ liệu

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 06, 18, 19; khác với autosave, task này quản lý dữ liệu di chuyển và lịch sử.

### Mục tiêu
Xuất/nhập nhân vật, bộ phối và bố trí văn phòng thành gói có thể chia sẻ; khôi phục phiên bản cũ có kiểm soát và không mất asset người dùng.

### Yêu cầu triển khai
1. Định nghĩa package manifest có packageType, schemaVersion, createdAt, app compatibility, asset references, hashes và phạm vi dữ liệu. Có lựa chọn chỉ cấu hình hoặc kèm asset đủ quyền phân phối.
2. Gói chứa avatar/outfit/layout phải ghi rõ dependency. Với asset không được phép đóng gói, chỉ lưu reference và hiển thị yêu cầu bổ sung, không tự copy asset hạn chế quyền.
3. Import qua hai bước validate/preview rồi commit. Preview có thay đổi, xung đột ID/version, asset thiếu và hành động merge/copy/replace phù hợp. Không ghi đè scene hiện tại ngay khi chọn file.
4. Nếu dùng ZIP, chặn path traversal/absolute path, symlink không cần thiết, file count quá lớn và decompressed-size bomb. Parse JSON theo schema; không deserialize code hoặc tải external URL từ package mà không kiểm soát.
5. Migration có chuỗi rõ từ version được hỗ trợ, giữ bản gốc và kiểm tra sau migration. Future schema không hỗ trợ phải từ chối an toàn.
6. Tạo lịch sử checkpoint với revision, author nếu có, timestamp và mô tả. Restore tạo revision mới trỏ về nội dung cũ, không xóa lịch sử mới hơn.
7. Compare phiên bản bằng thay đổi có ý nghĩa: body params, lớp xăm, outfit item, object transform và trạng thái. Không chỉ hiển thị JSON diff khó dùng.
8. Ghi package/import theo transaction; khi lỗi rollback, cleanup dữ liệu tạm và không làm hỏng autosave. Trong online, server kiểm tra quyền import/restore và optimistic concurrency.

### Nghiệm thu
- Xuất nhân vật có ảnh xăm riêng, nhập trên phiên sạch và so sánh cấu hình/hình ảnh.
- Thử conflict ID, missing asset, version cũ/mới, gói lỗi và gói ZIP có đường dẫn nguy hiểm.
- Restore bố trí cũ rồi quay lại bản mới; kiểm tra undo lịch sử và reference asset không bị mất.

**KẾT THÚC PROMPT**

---

<a id="task-21"></a>

## TASK 21 — Bộ kiểm tra chất lượng scene và asset

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 21 — Bộ kiểm tra chất lượng scene và asset

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 01; tích hợp layout, navigation, interactions và asset catalog đã có.

### Mục tiêu
Phát hiện lỗi có thể kiểm tra lặp lại trước khi đưa scene/asset vào sử dụng, kèm vị trí và hướng sửa cụ thể.

### Yêu cầu triển khai
1. Tạo validator dùng chung cho CLI/CI và panel trong editor. Kết quả chuẩn gồm ruleId, severity, objectId/assetId, message, location và suggestedFix.
2. Kiểm tra schema, ID trùng, reference thiếu, file không tồn tại, hash sai nếu có, transform NaN/Infinity, scale bất thường, bounds và parent cycle.
3. Kiểm tra collider thiếu ở loại bắt buộc, anchor nằm quá xa object, interaction target không tới được và cửa thiếu hinge/travel limit. Quy tắc tùy theo asset type để tránh báo lỗi vô nghĩa.
4. Kiểm tra overlap theo broadphase rồi kiểm tra sâu phù hợp; hỗ trợ danh sách giao nhau có chủ ý như đồ trên bàn. Không coi mọi AABB overlap là mesh xuyên nhau.
5. Kiểm tra navigation giữa spawn và các phòng/điểm quan trọng, clearance, spawn đứng trong vật cản và cửa mở chắn lối. Chỉ dùng tiêu chuẩn lối đi cấu hình dự án, không tuyên bố kiểm định pháp lý.
6. Với nhân vật, kiểm tra rig profile, clip/morph/socket cần thiết, garment compatibility và texture budget. Phát hiện xuyên mesh theo sampled poses chỉ là kiểm tra gần đúng, cần báo confidence và giới hạn.
7. Có severity/error/warning/info, suppression theo object/rule có lý do, baseline lỗi cũ và cổng CI chặn lỗi nghiêm trọng mới. Không tắt cả nhóm rule để làm báo cáo xanh.
8. Report JSON và HTML/Markdown, panel bấm để focus object trong scene; tự sửa chỉ áp dụng cho lỗi xác định được và có undo.

### Nghiệm thu
- Tạo fixture nhỏ cho các lỗi quan trọng: ID trùng, missing texture, spawn bị chặn, invalid transform và cửa thiếu anchor.
- Mỗi fixture bị phát hiện đúng; scene hợp lệ không báo lỗi nghiêm trọng giả.
- Báo thời gian chạy và phạm vi scan; không cam kết tự động phát hiện mọi lỗi thẩm mỹ hoặc giải phẫu.

**KẾT THÚC PROMPT**

---

<a id="task-22"></a>

## TASK 22 — Tài khoản, hồ sơ và nhân vật cá nhân

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 22 — Tài khoản, hồ sơ và nhân vật cá nhân

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 06, 18–20; cần backend/auth thật hoặc tích hợp nhà cung cấp hiện có.

### Mục tiêu
Người dùng đăng nhập, có hồ sơ và lưu nhân vật/bộ phối của mình trên backend với kiểm tra quyền rõ ràng.

### Yêu cầu triển khai
1. Kiểm tra hệ thống auth hiện có, ưu tiên tái sử dụng. Nếu chưa có, chọn một giải pháp phù hợp stack và nêu lý do; không tự viết mật mã hoặc dựng đăng nhập chỉ bằng localStorage.
2. Tách account, public profile, avatar configuration, outfit presets và private settings. Account ID nội bộ ổn định, display name không dùng làm khóa sở hữu.
3. Triển khai đăng nhập/đăng xuất và luồng phục hồi/xác minh theo auth provider đã chọn. Không tạo nút gửi email hoạt động giả khi chưa cấu hình dịch vụ.
4. Session/cookie hoặc token tuân kiến trúc thực tế; có expiry, logout/revoke và CSRF/CORS phù hợp. Không trả secret, password hash hoặc token qua public profile/log.
5. API hồ sơ/nhân vật có validation, ownership check trên server, optimistic revision và giới hạn kích thước. Không tin userId do client gửi là bằng chứng sở hữu.
6. Public profile chỉ chứa tên, ảnh đại diện/nhân vật và trường được công khai; email và asset riêng không bị rò qua endpoint danh sách.
7. Di chuyển dữ liệu khách cục bộ sau đăng nhập bằng preview merge/copy, không ghi đè avatar cloud tự động. Đăng xuất không để người dùng tiếp theo thấy dữ liệu riêng qua cache phiên.
8. Giới hạn tần suất endpoint nhạy cảm, xử lý tên/chuỗi nhập an toàn và có quy trình xóa hồ sơ/dữ liệu liên quan với chính sách giữ bản sao rõ nếu được triển khai.
9. Cung cấp migration DB, API contract, biến môi trường mẫu và dữ liệu seed chỉ dành cho dev; không hardcode tài khoản production.

### Nghiệm thu
- Hai tài khoản tạo avatar khác nhau, không đọc/sửa asset riêng của nhau bằng đổi ID.
- Kiểm tra hết session, logout, request trùng, sửa đồng thời và chuyển dữ liệu guest.
- Nếu chưa có provider/backend để chạy thật, báo phần bị chặn và cung cấp cấu hình cần thiết; không gọi mock auth là đã hoàn thành.

**KẾT THÚC PROMPT**

---

<a id="task-23"></a>

## TASK 23 — Đồng bộ nhiều người: chuyển động và trạng thái thế giới

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 23 — Đồng bộ nhiều người: chuyển động và trạng thái thế giới

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 22; task 01–06; chuẩn bị interface cho task 24/26/27.

### Mục tiêu
Nhiều người vào cùng văn phòng và thấy chuyển động, animation, ngoại hình cùng trạng thái vật thể nhất quán, với quyền quyết định trạng thái trên server.

### Yêu cầu triển khai
1. Xác định room/instance, playerId, entityId, sessionId, protocolVersion và server tick. Dùng transport realtime phù hợp stack; REST cho cấu hình dài hạn nếu phù hợp. Không đồng bộ toàn bộ scene graph mỗi frame.
2. Server xác thực room membership, input/action, tốc độ, vị trí hợp lệ và quyền cập nhật. Client không được tự tuyên bố teleport, sở hữu vật hoặc đổi state dùng chung.
3. Tách input command, snapshot chuyển động tạm thời và reliable domain event. Mỗi message có sequence/timestamp/revision thích hợp; idempotency cho action có tác dụng một lần.
4. Local player có prediction/reconciliation nếu triển khai được; remote player dùng snapshot interpolation và teleport threshold. Xác định xử lý gói trễ, trùng, sai thứ tự và mất gói theo transport, không áp một thuật toán cho mọi message.
5. Đồng bộ animation bằng state/actionId, server start time và tham số, không gửi toàn bộ xương mỗi frame. Ngoại hình đồng bộ bằng asset/config version, tải asset async và dùng placeholder có giới hạn.
6. Vật thể dùng chung đồng bộ state machine/revision; vật lý động cần mô hình authority rõ. Không để mọi client tự mô phỏng rồi coi kết quả đều là sự thật.
7. Có interest management theo vùng/phòng/khoảng cách và mức cập nhật phù hợp; người ngoài room không nhận dữ liệu riêng. Late join nhận snapshot nhất quán trước khi áp event mới.
8. Instrumentation đo RTT, jitter, tick delay, bandwidth, queue depth và số entity. Giới hạn payload, rate, inbound validation và backpressure.
9. Đặt target số người và máy tham chiếu dựa trên test tải; không hứa hàng nghìn người chỉ từ hai tab local.

### Nghiệm thu
- Chạy ít nhất hai client độc lập và một server, kiểm tra join muộn, di chuyển, đổi đồ và mở cửa.
- Mô phỏng latency/jitter/disconnect; state hội tụ, không mở cửa nhiều lần do request retry.
- Thử client gửi tốc độ/transform sai và sửa entity ngoài quyền; server từ chối.
- Có protocol schema, sơ đồ luồng ngắn, test và số đo thực tế. Không báo hoàn tất multiplayer nếu chỉ hiển thị bot local.

**KẾT THÚC PROMPT**

---

<a id="task-24"></a>

## TASK 24 — Quyền chiếm ghế, cầm vật và khóa chỉnh sửa

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 24 — Quyền chiếm ghế, cầm vật và khóa chỉnh sửa

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 23; identity task 22; kiểm tra quyền qua task 26 khi có.

### Mục tiêu
Tại một thời điểm chỉ người dùng hợp lệ được chiếm một ghế, giữ một vật hoặc chỉnh một đối tượng cần độc quyền; kết quả đúng cả khi request đồng thời hoặc mất kết nối.

### Yêu cầu triển khai
1. Xác định resource scope và loại quyền: seat occupancy, held object, edit lock. Tách permission lâu dài khỏi lease tạm; có quyền vào phòng không đồng nghĩa đang giữ ghế.
2. Server là nơi cấp quyền bằng thao tác nguyên tử/transaction/CAS theo storage đang dùng. Nếu chạy nhiều server, lock không chỉ tồn tại trong RAM của một process trừ khi room có single authority được đảm bảo.
3. Request acquire có resourceId, action, expectedRevision và requestId; response có owner, leaseId/fencing token, expiry hoặc lý do từ chối. Không tin owner do client tự khai.
4. Trạng thái UI: available, pending, ownedByMe, occupiedByOther và releasing. Chỉ ngồi/cầm thực sự khi server xác nhận; có phản hồi ngắn trong lúc chờ.
5. Gia hạn bằng heartbeat theo chính sách, release khi đứng dậy/đặt xuống/thoát editor và hết lease khi mất kết nối. Dùng thời gian server; client cũ mang token hết hạn không được sửa vật sau khi quyền đã chuyển.
6. Kết hợp cập nhật world state với cấp/thu hồi quyền nhất quán: ghế occupancy, object parent/transform, physics mode và animation. Tránh cấp lock xong nhưng cập nhật scene thất bại để vật mất chủ.
7. Reconnect có grace period cấu hình, xác thực lại session và resync trước khi tiếp tục. Quản trị viên force release phải qua permission server và audit.
8. Xử lý request lặp, double click, timeout không rõ kết quả bằng requestId/query trạng thái; không cấp hai lần vì retry.

### Nghiệm thu
- Hai client đồng thời ngồi một ghế/cầm một cốc: chỉ một người được cấp, người kia nhận phản hồi đúng.
- Ngắt mạng chủ đang cầm vật, chờ hết grace/lease rồi người khác lấy; client cũ quay lại không ghi đè.
- Test duplicate acquire/release, server restart theo cơ chế lưu hiện có và force release; không có orphan lock kéo dài vô hạn.

**KẾT THÚC PROMPT**

---

<a id="task-25"></a>

## TASK 25 — Chat chữ, thoại theo khoảng cách và phòng họp

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 25 — Chat chữ, thoại theo khoảng cách và phòng họp

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 22–23; quyền task 26; voice cần signaling và STUN/TURN/SFU phù hợp.

### Mục tiêu
Giao tiếp trong văn phòng bằng chat chữ và thoại có phạm vi rõ, có thể tắt, chặn và phục hồi kết nối mà không rò nội dung giữa các phòng.

### Yêu cầu triển khai
1. Chat có channel văn phòng/phòng họp và tin riêng chỉ khi phạm vi sản phẩm cho phép. Server kiểm tra membership và quyền gửi/đọc, không chỉ lọc channel ở client.
2. Message có ID, senderId do server xác nhận, server time và trạng thái pending/sent/failed. Validate độ dài, rate limit, escape nội dung, chống duplicate khi retry; không render HTML tùy ý.
3. UI chat không kích hoạt phím di chuyển khi nhập; có mute/block/report theo khả năng backend, phân trang lịch sử và chính sách retention rõ. Không tự lưu vĩnh viễn mọi cuộc trò chuyện.
4. Thoại dùng WebRTC qua hạ tầng phù hợp. Có signaling xác thực, cấu hình ICE/STUN/TURN thật và xác định topology theo quy mô; không coi thử hai tab cùng máy là bằng chứng hoạt động qua Internet.
5. Xin quyền microphone sau hành động người dùng, hỗ trợ từ chối/thiếu thiết bị. Có chọn mic/output khi browser hỗ trợ, push-to-talk, mute, speaking indicator và test mic cục bộ.
6. Giọng nói có suy giảm âm theo khoảng cách và hướng nghe. Nếu yêu cầu riêng tư theo phòng/khoảng cách, giới hạn subscription/routing ở server/SFU; giảm volume phía client không phải cơ chế bảo mật.
7. Phòng họp có membership và chế độ hội thoại riêng; rời phòng phải dừng subscription phù hợp. Không thu âm mặc định; nếu thêm ghi âm cần luồng riêng với trạng thái và đồng ý rõ.
8. Dọn media tracks, peer connection và listener khi rời phòng/logout. Network reconnect không tạo nhiều mic stream hoặc tiếp tục phát tiếng sau khi mute.
9. TURN credential có thời hạn nếu dùng; không nhúng secret hạ tầng vào frontend. Ghi metadata vận hành tối thiểu, không log nội dung thoại.

### Nghiệm thu
- Test chat giữa hai phòng và người ngoài quyền, rate limit, reconnect và request trùng.
- Voice thử trên hai mạng khác nhau nếu điều kiện cho phép, kiểm tra relay/TURN, từ chối mic, mute, rời room và tab nền.
- Nếu chưa có hạ tầng voice, đánh dấu phần chưa chạy thật; không báo đã hoàn thành chỉ vì có icon microphone.

**KẾT THÚC PROMPT**

---

<a id="task-26"></a>

## TASK 26 — Phân quyền chủ phòng, người chỉnh sửa và khách

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 26 — Phân quyền chủ phòng, người chỉnh sửa và khách

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 22; tích hợp server/API/realtime của task 23–25 và editor task 17.

### Mục tiêu
Kiểm soát ai được vào văn phòng, sửa bố trí, quản lý asset, tương tác hoặc quản trị người dùng bằng quyền kiểm tra trên server.

### Yêu cầu triển khai
1. Tạo permission matrix cho owner, admin/moderator nếu cần, editor, member và guest. Quyền cụ thể gồm room.view, room.join, layout.edit, layout.publish, asset.manage, object.use, member.manage và moderation action thực có.
2. Tách role theo room/workspace khỏi account role toàn hệ thống. Mặc định deny đối với action nhạy cảm; quyền sử dụng đồ vật vẫn phải kiểm tra lease từ task 24.
3. API và realtime handler gọi cùng authorization service hoặc policy nhất quán. Client chỉ dùng capability để hiển thị UI, không là nơi quyết định quyền.
4. Kiểm tra cả hành động và đối tượng: roomId/entityId/asset ownership, tránh truy cập tài nguyên phòng khác bằng đổi ID. Không để editor tự nâng role qua payload profile.
5. Hỗ trợ thêm/bỏ thành viên và đổi vai trò trong UI quản lý; chỉ gửi email/invitation nếu người dùng chủ động yêu cầu và backend có chức năng thật. Không gửi lời mời khi chỉ mở trang quyền.
6. Thu hồi quyền có hiệu lực trong phiên đang mở: refresh capability, chặn commit, hủy edit lease/voice subscription khi cần và đưa người không còn quyền ra khỏi room theo chính sách.
7. Chuyển owner cần bước rõ ràng và transaction; không để phòng mất owner cuối cùng hoặc cho người không đủ quyền đổi chủ.
8. Audit ghi actor, action, target, kết quả, timestamp và requestId, tránh ghi secret/nội dung nhạy cảm. Có giới hạn quyền xem audit.
9. Migration role cũ, seed dev và tài liệu matrix; không tự cấp quyền rộng cho tất cả để sửa lỗi 403.

### Nghiệm thu
- Test matrix qua API và socket với mọi role; gửi request trực tiếp vẫn bị từ chối nếu UI bị ẩn.
- Thu hồi editor đang kéo bàn: commit sau thu hồi không được chấp nhận, scene trở về state server.
- Kiểm tra cross-room access, tự nâng quyền, owner cuối cùng và đổi role đồng thời.

**KẾT THÚC PROMPT**

---

<a id="task-27"></a>

## TASK 27 — Mất kết nối, reconnect và khôi phục phiên

**BẮT ĐẦU PROMPT**

### Nhiệm vụ hiện tại: 27 — Mất kết nối, reconnect và khôi phục phiên

Bạn đang làm trên dự án văn phòng 3D chạy trên web. Phạm vi kiến trúc là khu vực chữ L khoanh xanh trong mặt bằng được cung cấp; nội thất bám ảnh thực tế: bàn gỗ sáng, ghế lưới đen, gạch xám bóng và trần thả trắng. Nhân vật là người trưởng thành có tỷ lệ chân thực, có tùy chỉnh hình thể, trang phục, hình xăm và phụ kiện; yêu cầu này thay thế phong cách chibi trước đây.

Hãy đọc AGENTS.md, cấu trúc dự án, package manifest, lockfile, mã nguồn và các tài liệu liên quan trước khi sửa. Xác định phần đã có, phần thiếu và tích hợp vào kiến trúc hiện tại. Tái sử dụng stack, renderer, vật lý, rig và animation đang hoạt động; không dựng một ứng dụng mẫu tách rời hoặc đổi nền tảng khi chưa có lý do kỹ thuật cụ thể. Nếu thiếu phụ thuộc, chỉ xây adapter tối thiểu có hợp đồng rõ ràng và liệt kê giới hạn, không triển khai lan sang toàn bộ task khác.

Trực tiếp triển khai trong phạm vi task này. Không tạo nút, số liệu, phản hồi hay trạng thái giả để tuyên bố hoàn tất. Không hardcode bí mật; cấu hình dịch vụ bằng biến môi trường và cung cấp mẫu không chứa giá trị nhạy cảm. Không tự triển khai production hoặc thay đổi quyền truy cập ngoài phạm vi task.

Với mỗi task, hoàn tất bằng: tóm tắt hành vi trước/sau; danh sách file chính; lệnh chạy; kiểm thử đã chạy và kết quả thực tế; ảnh/video chứng minh nếu có giao diện; giả định, giới hạn và asset/dịch vụ còn thiếu. Chỉ báo hoàn tất phần đã kiểm chứng. Không tuyên bố hỗ trợ mọi thiết bị, mọi hình thể hoặc không bao giờ xuyên mesh nếu chưa có bằng chứng.

**Phụ thuộc:** Task 06, 22–24, 26; phối hợp chat/voice task 25.

### Mục tiêu
Người dùng hiểu trạng thái mạng, kết nối lại an toàn và khôi phục nhân vật/thế giới đúng sự thật của server, không tạo phiên hoặc hành động trùng.

### Yêu cầu triển khai
1. Tạo connection state machine: connecting, connected, degraded khi xác định được, reconnecting, resyncing, disconnected và authExpired. Phân biệt mất socket, lỗi server, mất mạng và phiên hết hạn.
2. Heartbeat/timeout phù hợp transport, retry exponential backoff có jitter và giới hạn. Có thử lại thủ công và rời phòng; tránh retry dồn khi hàng loạt client mất kết nối.
3. Resume dựa trên session/resume token hợp lệ, roomId và revision/sequence cuối đã xác nhận. Token gắn danh tính và thời hạn, không cho client tự nhập playerId để chiếm phiên.
4. Nếu server còn delta history, nhận phần thiếu; nếu không, lấy full snapshot. Áp snapshot rồi event theo thứ tự, xác thực version và deduplicate; không cho input gameplay hoạt động đầy đủ trước khi resync hoàn tất.
5. Phân loại action có thể queue và không thể queue. Không replay hàng loạt lệnh di chuyển, cầm vật, gửi chat hoặc giao dịch khi chưa có idempotency và xác nhận. World state server thắng với tài nguyên dùng chung; draft cá nhân có thể giữ riêng và yêu cầu merge.
6. Chỗ ngồi/vật cầm chỉ khôi phục nếu lease vẫn hợp lệ; nếu đã đổi chủ, nhân vật về trạng thái đứng/tay trống và có phản hồi. Vị trí spawn phải kiểm tra an toàn.
7. Một tài khoản mở nhiều tab cần chính sách rõ: cho phép nhiều phiên độc lập hoặc thay thế phiên; tránh tạo hai avatar cùng playerId. Xử lý refresh, logout và auth refresh thất bại.
8. Server restart khôi phục persistent state từ dữ liệu bền vững, phân biệt ephemeral state mất được; không hứa giữ khóa RAM qua restart. Có drain/shutdown khi kiến trúc hỗ trợ.
9. Voice/chat phục hồi theo room membership và permission hiện tại. Mic mute state được tôn trọng, không tự bật mic lại trái lựa chọn.
10. Telemetry có reconnect attempts, thời gian phục hồi và failure reason, không log token. Offline UI thể hiện rõ action nào bị khóa.

### Nghiệm thu
- Mô phỏng mất mạng ngắn/dài, server restart, auth hết hạn, snapshot history thiếu và quyền bị thu hồi lúc offline.
- Retry request thành công nhưng response mất không tạo action trùng; client cũ không ghi đè thế giới sau reconnect.
- Kiểm tra nhiều tab và thoát room khi đang reconnect: không còn listener, timer, avatar hoặc lease mồ côi.
- Cung cấp bảng tình huống → hành vi mong đợi → kết quả thực tế, kèm thời gian phục hồi đo được.

**KẾT THÚC PROMPT**

---


## Mẫu bàn giao bắt buộc sau mỗi task

Yêu cầu Claude trả lại một báo cáo ngắn theo cấu trúc sau để dùng làm đầu vào task tiếp theo:

1. **Đã thay đổi:** hành vi trước/sau và phạm vi thực sự hoàn thành.
2. **Mã nguồn:** file/module, schema, API/event, dependency và migration đã thêm/sửa.
3. **Chạy và cấu hình:** lệnh cài/build/run/test, biến môi trường mẫu và dữ liệu/asset cần cung cấp.
4. **Kiểm chứng:** test case → kết quả, thiết bị/browser, ảnh/video và benchmark nếu có.
5. **Giới hạn:** lỗi còn lại, tiêu chí chưa đạt, hạ tầng/asset thiếu và ảnh hưởng.
6. **Bàn giao:** hợp đồng dữ liệu, quyết định kỹ thuật cần giữ và lưu ý cho task kế tiếp.

Không dùng “mọi thứ đã hoạt động” thay cho bằng chứng cụ thể. Không đưa mật khẩu, token hay URL có chữ ký vào báo cáo.

## Tham chiếu kỹ thuật để người triển khai kiểm tra khi cần

Đây là điểm bắt đầu tra cứu; phải đọc tài liệu đúng phiên bản dependency thực tế của dự án. Không bắt buộc chuyển sang các công nghệ dưới đây nếu stack đang dùng đã đáp ứng.

- Three.js Manual: https://threejs.org/manual/
- Three.js — giải phóng tài nguyên: https://threejs.org/manual/pages/how-to-dispose-of-objects.html
- Three.js API: https://threejs.org/docs/
- glTF 2.0 specification: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- Rapier documentation (nếu dự án dùng): https://rapier.rs/docs/
- MDN Pointer Lock API: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API
- MDN IndexedDB: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- MDN Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- MDN WebRTC API: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API
- W3C — keyboard: https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html
- W3C — dragging movements: https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- W3C — pointer gestures: https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html
- Gaffer On Games — state synchronization: https://gafferongames.com/post/state_synchronization/
