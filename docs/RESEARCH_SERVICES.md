# Nghiên cứu dịch vụ giải trí và giao lưu văn nghệ · Test App Phòng CNTT

Ngày kiểm tra: 2026-11-06. Trạng thái: nghiên cứu và đề xuất, chưa triển khai.

Phạm vi: dịch vụ chơi game, hát karaoke và giao lưu văn hóa văn nghệ cho văn phòng ảo 3D nội bộ của GPBank (khối CNTT, khoảng 500 nhân sự). Tài liệu này không thay đổi mã nguồn, không chạy npm install hay docker, và không tạo commit.

Cách đọc nguồn license:
- "GitHub API": trường license trả về từ api.github.com, kiểm tra ngày 2026-11-06.
- "npm": registry.npmjs.org/<gói>/latest, kiểm tra ngày 2026-11-06.
- "file LICENSE": nội dung file tải từ raw.githubusercontent.com.
- "thứ cấp": bài viết bên thứ ba hoặc kết quả tìm kiếm, không phải nguồn chính thức.
- "chưa xác minh": không lấy được nguồn chính thức trong phiên này.

---

## 1. Tóm tắt

1. Đề xuất ba microservice mới, mỗi dịch vụ một thư mục, một container và một cổng: games-service (3003), karaoke-service (3004), events-service (3005). Gateway proxy `/api/games/*`, `/api/karaoke/*`, `/api/events/*`.
2. Các văn phòng ảo SaaS (Gather, Sococo, Remo, Kumospace) có mini-game hoặc sự kiện, nhưng đều là dịch vụ đóng và dữ liệu nằm ngoài. Trong các sản phẩm đã kiểm tra, không có karaoke chấm điểm tích hợp; theo bài hướng dẫn thứ cấp, Gather tổ chức karaoke bằng công cụ bên ngoài.
3. Mã nguồn mở đủ để làm game: Phaser (MIT), boardgame.io (MIT), Colyseus (MIT), Socket.IO (MIT), chess.js (BSD-2-Clause). Karaoke: pitchy (MIT theo npm), đặc tả định dạng UltraStar (MIT), UltraStar Play (MIT) để tham khảo.
4. Loại khỏi việc tái sử dụng mã: repo không có license (allkaraoke, singalong), copyleft GPL/AGPL (USDX, Spivak, OpenHomeKaraoke, Vocaluxe, OpenKara), và WorkAdventure (AGPLv3 kèm Commons Clause theo FAQ chính thức).
5. Nhạc nền: chỉ dùng CC0, CC BY có ghi công, nhạc tự sáng tác hoặc đặt hàng có hợp đồng. Pixabay dùng được nếu lưu bằng chứng giấy phép tại thời điểm tải. YouTube Audio Library và CC BY-NC chưa đủ điều kiện.
6. Lời bài hát: không dùng LRCLIB, Musixmatch hay Genius trong MVP, vì quyền dữ liệu chưa xác minh hoặc cần giấy phép thương mại. Dùng lời tự soạn trên nhạc đã có quyền.
7. MVP đề xuất: cờ caro và đố vui theo lượt; karaoke solo chấm điểm bằng micro trên 5 đến 10 bài đã được cấp phép; sự kiện gồm lịch, đăng ký tiết mục và bình chọn một phiếu mỗi người. Song ca và livestream để sau MVP.
8. Rủi ro kỹ thuật lớn nhất: micro trên trình duyệt cần HTTPS hoặc localhost, và song ca cần WebRTC dùng UDP mà SSH tunnel hiện tại không chuyển được. Phải có domain riêng và duyệt mạng trước khi làm phần này.
9. Mặt bằng: góc game và sân khấu đặt trong lounge (khu Đông), bảng sự kiện đặt cạnh kudos_board. Không đặt hoạt động ồn ở util_quiet, util_health hay khu dự phòng khi chưa có quyết định.
10. Ràng buộc sản phẩm được kiểm soát bằng thiết kế (mục 1.1), và cần người dùng trả lời 15 câu ở mục 9 trước khi làm.

### 1.1 Ràng buộc sản phẩm và cách kỹ thuật hóa

| Ràng buộc | Cách thực hiện trong thiết kế |
|---|---|
| Không có tiền thật | Không tích hợp cổng thanh toán. Schema không có trường tiền. Phần thưởng chỉ là vinh danh (kudos) hoặc chứng nhận nội bộ, không đổi được ra tiền. |
| Không quà đổi bằng tiền | Không có cơ chế đổi điểm lấy voucher hay quà. Bảng xếp hạng chỉ hiển thị danh hiệu. |
| Không cờ bạc | Không có đặt cược, vòng quay, hộp quà ngẫu nhiên hay giải có giá trị vật chất. Các game là trò chơi kỹ năng hoặc đố vui. |
| Không livestream công khai | Không tích hợp YouTube, Twitch hay Facebook Live. Nếu có phát trực tiếp ở giai đoạn sau, chỉ dùng máy chủ nội bộ có đăng nhập. |
| Tự nguyện, tắt được theo phòng ban | Mỗi game, bài hát và sự kiện có cờ enabled. Admin bật hoặc tắt theo phòng ban. Tham gia bảng xếp hạng phải tự opt-in. |
| Nhạc miễn phí bản quyền | Mỗi bài có trạng thái license_status. Chỉ bài đã approved mới phát được. Lưu loại giấy phép, ghi công, nguồn, ngày tải và mã bằng chứng. API audio trả 403 nếu chưa approved. |
| Tiếng Việt có dấu | Giao diện, tên game, tên sự kiện và nhãn đều viết tiếng Việt có dấu. Dữ liệu dùng UTF-8. Tên bài hát gốc giữ nguyên ngôn ngữ gốc. |
| Dữ liệu cá nhân nội bộ | Mỗi service có volume SQLite riêng (DATA_DIR), giống auth và it. Không gửi điểm hoặc lịch sử ra ngoài. Không dùng analytics bên thứ ba. Tài nguyên game và nhạc được đóng gói hoặc lưu trong kho nội bộ, không tải từ CDN công cộng. |

---

## 2. Hệ thống văn phòng ảo tương tự

| Hệ thống | Mô hình | Mini-game | Karaoke | Sự kiện | Giá (nguồn, kiểm tra 2026-11-06) | Nguồn mở | Ghi chú |
|---|---|---|---|---|---|---|---|
| Gather.town | SaaS đóng | Có: đối tượng game dựng sẵn (Tetris, Codenames, Draw Battle) theo trợ giúp của Gather. Nguồn thứ cấp và cũ, chưa xác minh bản hiện tại. | Không có tính năng gốc được xác nhận. Bài hướng dẫn thứ cấp dùng Watch2Gether hoặc KaraFun bên ngoài. | Có: sự kiện ảo, bản đồ tùy chỉnh | Essential 12 USD/thành viên/tháng (trang pricing, có chọn theo năm giảm 20%). Gói Custom liên hệ. Dùng thử 30 ngày. | Không | Dữ liệu nằm trên hạ tầng của hãng. Không phù hợp để lưu điểm nội bộ. |
| Sococo | SaaS đóng | Chưa xác minh | Không ghi nhận | Phòng họp và hội nghị. Tích hợp Zoom, Teams, Meet. | 13,49 USD/chỗ/tháng, tối thiểu 10 chỗ, trả trước theo năm. Kèm 500 phút họp/chỗ/tháng. | Không | Phù hợp so sánh về phòng họp ảo. |
| TeamFlow | SaaS đóng | Không | Không | Không | Trang pricing hiện tại mô tả nền tảng quản lý quy trình làm việc, chưa thấy tính năng văn phòng 3D. Gói liên hệ, dùng thử 30 ngày. | Không | Cần xác minh lại. Có thể không phải văn phòng ảo, đề nghị loại khỏi so sánh. |
| Remo | SaaS đóng, định hướng doanh nghiệp | Không ghi nhận | Không | Mạnh về sự kiện: sân khấu, bàn, networking, poll, quiz, Q&A. Gói Starter bắt đầu từ 200 người tham dự mỗi sự kiện. Có vé trả phí. Có tích hợp livestream YouTube (gói Enterprise). | Starter từ 299 USD/tháng. Sự kiện một lần từ 699 USD. Dùng thử 14 ngày. | Không | Vé trả phí và livestream công khai vi phạm ràng buộc sản phẩm. Chỉ tham khảo về sân khấu và poll. |
| Kumospace | SaaS đóng | Có: game trong ứng dụng (crossword, puzzle, Codenames) theo đánh giá Remo và Wikipedia | Không ghi nhận | Có: trang sự kiện ảo | Nguồn mâu thuẫn. Gói miễn phí tối đa 5 thành viên đăng ký (thứ cấp), hoặc miễn phí cho sự kiện 30 người (trang chính thức). Business 16 đến 20 USD/người/tháng (thứ cấp). | Không | Dữ liệu giá cần xác minh lại trên trang chính thức trước khi dùng làm mốc. |
| Mozilla Hubs | Mã nguồn mở. Mozilla ngừng dịch vụ ngày 31/05/2024. Bản Community Edition do Hubs Foundation duy trì. | Không | Không | Có: phòng 3D và hội thảo | Miễn phí khi tự host | Có, MPL-2.0 (file LICENSE đã xác minh) | Triển khai cần Kubernetes, không hợp hạ tầng hiện tại (network_mode host, không dùng k8s). Loại khỏi MVP. |
| WorkAdventure | Tự host hoặc SaaS. FAQ chính thức ghi bản tự host là AGPLv3 kèm Commons Clause. | Chưa xác minh | Chưa xác minh | Có: trang chính thức ghi "Virtual Office & Remote Event App" | Bản tự host theo FAQ dùng miễn phí. Bảng quản trị trả phí. | Không phải open source theo OSI. Commons Clause cấm bán dịch vụ. | GitHub API không nhận diện license (null) và không có file LICENSE ở nhánh master. Xem mục 4. |
| PopSpace | Theo AlternativeTo là mã nguồn mở | Chưa xác minh | Chưa xác minh | Chưa xác minh | Chưa xác minh | Chưa xác minh license | Chỉ ghi nhận, chưa đưa vào so sánh chi tiết. |
| WonderVerse | Không tìm thấy trang chính thức trong tìm kiếm | Chưa xác minh | Chưa xác minh | Chưa xác minh | Chưa xác minh | Chưa xác minh | Cần người dùng cung cấp URL nếu muốn đưa vào so sánh. |

Ghi chú: giá lấy từ trang pricing ngày 2026-11-06. Các tính năng mini-game và karaoke của Gather và Kumospace lấy từ bài đánh giá thứ cấp, cần xác minh trên trang chính thức trước khi trích dẫn cho cấp quản lý.

Kết luận từ bảng: không có sản phẩm SaaS nào phù hợp để dùng trực tiếp. Lý do là dữ liệu ra ngoài, thiếu chấm điểm karaoke, và nhiều tính năng vi phạm ràng buộc (vé trả phí, livestream công khai). Nên xây phần giải trí trong hệ thống nội bộ và chỉ học ý tưởng sự kiện, sân khấu và poll từ các sản phẩm trên.

---

## 3. Thư viện và dự án nguồn mở đã xác minh

### 3.1 Game và thời gian thực

| Thư viện | Phiên bản (npm, 2026-11-06) | License và nguồn xác minh | Dùng cho | Rủi ro |
|---|---|---|---|---|
| Phaser | 4.2.1 | MIT (npm; GitHub photonstorm/phaser, GitHub API) | Mini-game 2D trên trình duyệt: đố vui hình ảnh, arcade nhẹ | Gói lớn, cần tự host tài nguyên. Phiên bản 4 mới, cần kiểm thử kỹ. |
| boardgame.io | 0.50.2 | MIT (npm; GitHub boardgameio/boardgame.io, GitHub API, pushed 2026-10-30) | Trạng thái và lượt chơi cho cờ caro, đố vui theo lượt, kiểm tra nước đi trên server | API 0.x có thể đổi. Phần server dùng Koa, đặt trong services/games. |
| Colyseus (gói colyseus và @colyseus/core) | 0.18.11 và 0.18.27 | MIT (npm; GitHub colyseus/colyseus, GitHub API, pushed 2026-11-05) | Phòng thời gian thực nhiều người (giai đoạn 2) | Phiên bản 0.x. Cần WebSocket đi qua gateway. |
| Socket.IO | 4.8.4 | MIT (npm; GitHub socketio/socket.io, GitHub API, pushed 2026-11-05) | Sự kiện thời gian thực phụ: cập nhật bảng điểm, đồng bộ lời karaoke | Chỉ chọn một với Colyseus cho game. Có thể dùng chung cho karaoke. |
| chess.js | 1.4.0 | BSD-2-Clause (npm; GitHub jhlywa/chess.js, GitHub API) | Luật cờ vua (giai đoạn sau) | Chỉ có luật, không có giao diện. |
| PlayCanvas engine | 2.23.3 | MIT (npm; GitHub playcanvas/engine, GitHub API) | Không đề xuất | Trùng với three.js đã có trong package.json. Thêm một engine 3D thứ hai. |
| Babylon.js | 9.34.0 | Apache-2.0 (npm babylonjs; GitHub BabylonJS/Babylon.js, GitHub API) | Không đề xuất | Trùng với three.js. Gói lớn. |

Ghi chú: repo đã có three 0.169.0 và @react-three/fiber trong package.json. Đề xuất dùng chúng cho mini-game 3D trong lounge. License của three.js không được kiểm tra lại trong phiên này.

### 3.2 Karaoke và chấm điểm

| Thư viện | Phiên bản | License và nguồn xác minh | Dùng cho | Rủi ro |
|---|---|---|---|---|
| pitchy | 4.1.0 (npm) | npm: MIT. GitHub API (ianprime0509/pitchy): 0BSD. Hai nguồn mâu thuẫn, nhưng cả hai đều cho phép dùng thương mại. Kiểm tra file LICENSE trong gói khi cài. | Phát hiện cao độ trong trình duyệt để chấm điểm | Độ chính xác với giọng hát và tiếng ồn văn phòng cần đo. Độ trễ cần đo. |
| Đặc tả UltraStar (repo UltraStar-Deluxe/format) | Không có phiên bản. Repo pushed 2025-07-29. | MIT (GitHub API; file LICENSE ghi "Copyright (c) 2023 UltraStar Karaoke") | Định dạng nhập bài dạng .txt có timing và phân đoạn | Đặc tả không đầy đủ. Wiki cộng đồng mâu thuẫn ở #RELATIVE và mã hóa tệp. Phải tự viết bộ đọc. |
| UltraStar Play (repo UltraStar-Deluxe/Play) | Không có phiên bản. Pushed 2026-10-21, 510 sao. | MIT (GitHub API) | Tham khảo quy tắc chấm điểm và cách hiển thị lời | Là game desktop, không phải web service. Chỉ tham khảo, không nhúng vào service. |
| OpenSing (brandonwisnicki/OpenSing) | Không có phiên bản. Pushed 2022-01-19. | MIT (GitHub API) | Tham khảo định dạng JSON .sing | Đã cũ, 1 sao. |
| open-karaoke (osmanahmadxai/open-karaoke) | Không có phiên bản. Pushed 2026-10-27. | MIT (GitHub API) | Tham khảo ý tưởng chấm điểm và đồng bộ lời | Ứng dụng desktop, lấy lời và nhạc từ dịch vụ bên thứ ba. Không dùng trực tiếp. |
| YuutaTsubasa/karaoke | Không có phiên bản. Pushed 2026-11-05. | MIT (GitHub API) | Tham khảo công cụ canh thời gian lời | 0 sao, mới, chưa đủ trưởng thành. |
| LRCLIB (mã nguồn, tranxuanthang/lrclib) | Không có phiên bản. Pushed 2026-10-28. | MIT (GitHub API; file LICENSE) | Tham khảo định dạng LRC và API tra cứu | Chỉ là mã nguồn. Dữ liệu lời xem mục 3.6. |

### 3.3 Thoại và video (cho song ca, giai đoạn sau)

| Thư viện | Phiên bản | License và nguồn xác minh | Dùng cho | Rủi ro |
|---|---|---|---|---|
| LiveKit server (livekit/livekit) | Pushed 2026-11-06 | Apache-2.0 (GitHub API; file LICENSE) | Song ca và phòng âm thanh (giai đoạn 3) | Cần UDP, HTTPS và TURN. Phải duyệt mạng và firewall. |
| livekit-client (livekit/client-sdk-js) | 2.23.0 (npm) | Apache-2.0 (npm; GitHub API) | Client trình duyệt | Phụ thuộc server LiveKit. |
| livekit-server-sdk | 2.19.2 (npm) | Apache-2.0 (npm) | Cấp token phiên từ backend | Chỉ dùng ở backend. |
| OpenVidu (OpenVidu/openvidu, openvidu-browser) | openvidu-browser 2.32.2 (npm) | Apache-2.0 (GitHub API; npm) | Phương án thay thế LiveKit | Nhánh 2.x là bản cũ hơn. Chưa xác minh kiến trúc bản hiện tại. Ưu tiên LiveKit. |
| Jitsi Meet (jitsi/jitsi-meet) | Pushed 2026-11-06 | Apache-2.0 (GitHub API) | Họp video nội bộ | Nặng, nhiều thành phần. Không đề xuất MVP. |
| Owncast (owncast/owncast) | Pushed 2026-10-26 | MIT (GitHub API) | Phát trực tiếp nội bộ (giai đoạn 3) | Không có xác thực người xem sẵn. Phải đặt sau gateway để không lộ ra ngoài. |

### 3.4 Lịch, sự kiện và bình chọn

| Thư viện | Phiên bản | License và nguồn xác minh | Dùng cho | Rủi ro |
|---|---|---|---|---|
| FullCalendar core (@fullcalendar/core) | 7.1.4 (npm) | MIT (npm; GitHub fullcalendar/fullcalendar, GitHub API) | Giao diện lịch sự kiện | Các gói premium có license riêng. Không dùng. |
| Rallly (lukevella/rallly) | Pushed 2026-11-06 | AGPL-3.0 (GitHub API; file LICENSE) | Tham khảo ý tưởng bình chọn thời gian chung | AGPL: sửa đổi và phục vụ người dùng qua mạng có thể phải công bố mã nguồn. Cần pháp chế. Không sao chép mã. |
| pretix (pretix/pretix) | Pushed 2026-11-05 | AGPL-3.0 (file LICENSE, GitHub báo NOASSERTION) | Bán vé. Không cần, vì vé trả phí bị loại. | AGPL. Quá lớn so với nhu cầu. |
| LimeSurvey (LimeSurvey/LimeSurvey) | Pushed 2026-11-06 | GPL-2.0 (file LICENSE, văn bản GPL v2; GitHub báo NOASSERTION) | Khảo sát và bình chọn phức tạp (không đề xuất) | Stack PHP và MySQL nặng. Copyleft. |
| BigBlueButton | Pushed 2026-11-06 | LGPL-3.0 (GitHub API) | Họp và lớp học trực tuyến | Quá nặng, không đề xuất. |

Kết luận cho bình chọn: tự xây trong events-service. Bình chọn một phiếu mỗi người là logic đơn giản, không cần thư viện có license phức tạp.

### 3.5 Nhạc và tài nguyên

| Nguồn | Điều kiện đã xác minh | Quyết định |
|---|---|---|
| Pixabay Music | Trang chính thức trả 403 khi kiểm tra. Theo FAQ và bản sao văn bản license (thứ cấp, 2026-11-06): dùng thương mại được, không bắt buộc ghi công, cấm bán riêng từng bản nhạc. Có thể bị Content ID. Không bồi thường (no indemnity). Có nhiều thời kỳ điều khoản. | Dùng được cho MVP nếu lưu ảnh chụp trang license và mã bài tại thời điểm tải. Không phân phối lại ra ngoài. |
| YouTube Audio Library | Trang hỗ trợ của Google nêu nhạc "copyright-safe" khi dùng trong YouTube, và bắt buộc ghi công với bài CC BY. Không xác minh được điều khoản khi dùng ngoài YouTube. | Không dùng trong MVP trước khi pháp chế xác nhận. |
| Free Music Archive (FMA) | Đa số là CC BY, CC BY-NC, một phần CC0. FMA-Limited chỉ cho tải về cá nhân, không phân phối lại. FAQ ghi NC phụ thuộc mục đích, và tổ chức phi lợi nhuận vẫn có thể vi phạm NC. | Chỉ dùng CC0 và CC BY có ghi công trong màn hình credit. Loại NC, ND, FMA-Limited. |
| Incompetech (Kevin MacLeod) | Trang track không tải được nội dung khi kiểm tra. Chưa xác minh giấy phép từng bài. | Chưa xác minh. Chỉ dùng khi từng bài được xác nhận là CC BY. |
| Nhạc đặt hàng hoặc tự sáng tác | Không phụ thuộc giấy phép bên thứ ba nếu có hợp đồng chuyển nhượng hoặc cấp phép nội bộ. | Khuyến nghị cho nhạc Việt. Đa số nhạc Việt đang lưu hành có bản quyền. |
| Musopen (nhạc phạm vi công cộng) | Chưa xác minh trong phiên này. | Chưa đưa vào. Có thể kiểm tra sau. |

### 3.6 Dữ liệu lời bài hát

| Nguồn | Điều kiện đã xác minh | Quyết định |
|---|---|---|
| LRCLIB (lrclib.net) | Trang chính thức gọi là "free and open lyrics database". Mã nguồn MIT. Không tìm thấy điều khoản license cho dữ liệu trong README, docs.txt hay llms.txt. Nguồn thứ cấp cho rằng lời vẫn là tác phẩm có bản quyền của nhà xuất bản. | Không dùng trong MVP. Cần pháp chế xác nhận quyền dữ liệu trước. |
| Musixmatch API | Điều khoản chính thức (musixmatch.com/apiterms) không đọc được trong phiên này. Nguồn thứ cấp: gói miễn phí chỉ trả đoạn xem trước, dành cho phát triển và phi thương mại. Lời đầy đủ và đồng bộ cần giấy phép thương mại. | Loại khỏi MVP. |
| Genius | Trang điều khoản trả 403 khi kiểm tra. Chưa xác minh. | Loại khỏi MVP. Chỉ xem xét lại nếu pháp chế đưa ra điều khoản rõ. |
| File cộng đồng USDB/UltraStar | Chứa lời có bản quyền. Điều khoản sử dụng chưa xác minh. | Không nhập file cộng đồng. Chỉ dùng đặc tả định dạng. |
| Lời tự soạn trên nhạc đã có quyền | Không phụ thuộc bên thứ ba. | Đề xuất cho MVP. Timing gán bằng công cụ soạn nội bộ. |

---

## 4. Bảng loại trừ

| Dự án | Lý do loại | Nguồn xác minh |
|---|---|---|
| Asvarox/allkaraoke (269 sao) | Không có license. Chỉ tham khảo ý tưởng. Fork diegogd/allkaraoke cũng không có license. Tìm kiếm thứ cấp báo MIT ở fork, nhưng API không xác nhận. | GitHub API, 2026-11-06 |
| karaokeresearch/singalong | Không có license. Lần đẩy mã cuối năm 2018. | GitHub API, 2026-11-06 |
| workadventure/workadventure | Không nhận diện được license. Không có file LICENSE ở nhánh master. FAQ chính thức ghi AGPLv3 kèm Commons Clause, nên không phải open source theo OSI. Không fork trong giai đoạn đầu. | GitHub API và raw LICENSE, 2026-11-06. FAQ workadventu.re |
| UltraStar-Deluxe/USDX | GPL-2.0. Copyleft. Chỉ dùng đặc tả định dạng (repo format, MIT), không dùng mã. | GitHub API, 2026-11-06 |
| xuancong84/OpenHomeKaraoke | GPL-3.0. Copyleft. Tính năng thêm nhạc từ YouTube có rủi ro bản quyền. | GitHub API, 2026-11-06 |
| gyunaev/spivak | GPL-3.0. Copyleft. Lần đẩy mã cuối 2025-07-14. | GitHub API, 2026-11-06 |
| Vocaluxe/Vocaluxe | GPL-3.0. Copyleft. | GitHub API, 2026-11-06 |
| thedavidweng/OpenKara | AGPL-3.0 theo GitHub API. Kết quả tìm kiếm thứ cấp ghi Apache-2.0, mâu thuẫn. Dùng số liệu của API. Chỉ tham khảo. | GitHub API, 2026-11-06 |
| performous/performous | GitHub báo NOASSERTION, không xác minh được license. | GitHub API, 2026-11-06 |
| karaokemugen-app | App có license MIT theo GitHub API, nhưng file LICENSE ở nhánh master trả 404. Dữ liệu bài hát có license riêng chưa xác minh. Loại phần dữ liệu. | GitHub API và raw, 2026-11-06 |
| ultrastar-dev/ultrastar_pitch, ultrastar-dev/usdb_syncer | Trả 404. Chưa xác định được repo đúng. Người dùng nêu tên này, cần URL cụ thể. | GitHub API, 2026-11-06 |
| Synchron, OkTV | Không tìm thấy qua tìm kiếm. Chưa xác minh. Cần URL. | WebSearch, 2026-11-06 |
| Mozilla Hubs | License MPL-2.0 hợp lệ, nhưng dịch vụ đã ngừng từ 2024 và triển khai cần Kubernetes. Loại triển khai. | File LICENSE và support.mozilla.org |
| pretix, LimeSurvey, BigBlueButton, Rallly | Copyleft hoặc quá nặng cho nhu cầu. Chỉ tham khảo. | Mục 3.4 |
| Musixmatch, Genius (dữ liệu lời) | Cần giấy phép thương mại hoặc điều khoản không đọc được. | Mục 3.6 |

---

## 5. Đề xuất dịch vụ mới

### 5.0 Quy ước chung

Ba dịch vụ dưới đây theo đúng quy ước hiện có (services/auth, services/it):

- Thư mục: services/games, services/karaoke, services/events. Tên dịch vụ: games-service, karaoke-service, events-service.
- Node 20 và Express, cùng kiểu với auth và it. Dockerfile đặt trong docker/ theo mẫu có sẵn.
- network_mode: host, bind 127.0.0.1, không có ports:. Upstream dùng IP và cổng cố định.
- Biến môi trường: PORT, DATA_DIR (volume), AUTH_URL=http://127.0.0.1:3001.
- Xác thực: gọi AUTH_URL/api/auth/me, forward header Cookie, không cache, timeout 3 giây, lỗi trả 401. Cách này giống it-service để logout có hiệu lực ngay.
- Health: GET /api/games/health, /api/karaoke/health, /api/events/health (không cần đăng nhập).
- Phía client: Phaser, pitchy, three.js đóng gói bằng Vite, không tải từ CDN.

### 5.1 games-service (cổng 3003)

Mục tiêu: cho nhân viên chơi trò chơi ngắn theo lượt với đồng nghiệp, có bảng xếp hạng tự nguyện, và admin bật tắt từng game hoặc từng phòng ban.

Phạm vi:
- MVP: Cờ caro hai người (tự viết luật, không cần thư viện). Đố vui theo lượt cho 2 đến 8 người, bộ câu hỏi do admin soạn. Bảng xếp hạng opt-in. Bật tắt theo game và phòng ban.
- Giai đoạn 2: phòng thời gian thực với Colyseus, cờ vua với chess.js, cập nhật bảng điểm bằng Socket.IO.
- Giai đoạn 3: mini-game 3D trong lounge bằng three.js. Không làm nối từ tiếng Việt nếu chưa có từ điển được cấp phép.

API chính:

| Phương thức | Đường dẫn | Body | Trả về | Quyền |
|---|---|---|---|---|
| GET | /api/games/catalog | — | [{id, name, minPlayers, maxPlayers, turnBased, enabled}], đã lọc theo phòng ban | employee, it, admin |
| GET | /api/games/rooms?gameId= | — | [{id, gameId, status, players, maxPlayers}] | employee, it, admin |
| POST | /api/games/rooms | {gameId, maxPlayers, visibility: "public" hoặc "private"} | 201 {room} | employee, admin |
| GET | /api/games/rooms/:id | — | {room, state}. Chỉ người trong phòng hoặc admin. | người trong phòng, admin |
| POST | /api/games/rooms/:id/join | — | 200 {room}. 409 nếu đầy. | employee, admin |
| POST | /api/games/rooms/:id/leave | — | 200 | người trong phòng |
| POST | /api/games/rooms/:id/moves | {move: {type, payload}, expectedVersion} | 200 {state, version}. 409 nếu sai lượt hoặc lệch phiên bản. | người trong phòng |
| POST | /api/games/rooms/:id/kick | {userId} | 200 | chủ phòng, admin |
| GET | /api/games/me | — | {settings, stats} | employee, it, admin |
| PUT | /api/games/me/settings | {optInLeaderboard, displayName} | 200 | chính người dùng |
| GET | /api/games/leaderboard?gameId=&scope=all hoặc dept&period=month hoặc all | — | [{rank, displayName, wins, played}]. Chỉ người đã opt-in. | employee, it, admin |
| GET | /api/games/admin/settings | — | {games: [...], departmentsDisabled: [...]} | admin |
| PUT | /api/games/admin/games/:gameId | {enabled} | 200 | admin |
| PUT | /api/games/admin/departments/:dept | {enabled} | 200 | admin |
| GET | /api/games/admin/stats?period=month | — | {rooms, matches, activeUsers}. Chỉ số tổng hợp, không có danh tính. | it, admin |

Dữ liệu lưu (volume games-data):
- games: id, name, enabled, updated_at.
- rooms: id, game_id, status, visibility, created_by, created_at.
- room_players: room_id, user_id, joined_at.
- matches: id, room_id, game_id, result_json, ended_at.
- match_players: match_id, user_id, outcome, score.
- player_settings: user_id, opt_in, display_name, updated_at.
- dept_toggles: dept, enabled.
- Lưu trữ đề xuất: matches giữ 12 tháng rồi xóa. Không lưu email trong games-service, chỉ lưu user_id từ auth.

Quyền theo vai trò:

| Chức năng | employee | it | admin |
|---|---|---|---|
| Chơi, tạo và tham gia phòng | có | không | có |
| Xem bảng xếp hạng opt-in | có | có | có |
| Xem thống kê tổng hợp | không | có | có |
| Bật tắt game và phòng ban | không | không | có |
| Đuổi người chơi khỏi phòng | chủ phòng | không | có |

Vị trí trên mặt bằng (it.json):
- Đề xuất vật thể mới games_corner (kind "amenity", action "games") trong lounge, phía Tây, tránh vùng util_health tại khoảng (25.5, -7.25). Vị trí cụ thể do người dựng 3D quyết định và kiểm tra lối đi.
- Không đặt trong util_quiet (phòng nghỉ yên tĩnh).

Ưu tiên: MVP cho cờ caro và đố vui. Giai đoạn 2 cho thời gian thực.

### 5.2 karaoke-service (cổng 3004)

Mục tiêu: cho nhân viên hát karaoke solo trên thiết bị cá nhân với tai nghe, có chấm điểm tham khảo, lịch sử cá nhân và bảng xếp hạng tự nguyện. Có hàng đợi biểu diễn khi tổ chức sự kiện.

Luồng solo (MVP):
1. Người dùng chọn bài đã approved. Trình duyệt tải lời theo timing và phát nhạc nền từ /audio.
2. Micro lấy âm thanh, pitchy phát hiện cao độ trên client, tính điểm tóm tắt (độ chính xác, độ đúng nhịp, số nốt).
3. Client gửi summary lên /sessions/:id/score. Server kiểm tra giới hạn hợp lý (thời lượng không vượt bài, số nốt trong khoảng, điểm từ 0 đến 100), rồi lưu.

Lưu ý: điểm do client tính nên có thể bị giả mạo. Điểm chỉ mang tính giải trí. Không dùng trong đánh giá nhân sự hay khen thưởng vật chất (xem câu hỏi 15).

Phạm vi:
- MVP: 5 đến 10 bài đã được cấp phép. Chấm điểm solo. Lịch sử cá nhân. Bảng xếp hạng opt-in theo bài.
- Giai đoạn 2: hàng đợi biểu diễn theo phòng, bảng xếp hạng theo phòng ban, nhập file UltraStar .txt (sau khi xác nhận quyền với từng bài).
- Giai đoạn 3: song ca (duet) qua LiveKit, cần duyệt mạng.

API chính:

| Phương thức | Đường dẫn | Body | Trả về | Quyền |
|---|---|---|---|---|
| GET | /api/karaoke/songs?q=&lang=&tag= | — | [{id, title, artist, lang, durationSec, license: {type, attribution}}]. Chỉ bài approved. | employee, it, admin |
| GET | /api/karaoke/songs/:id | — | {song, lyrics: [{startMs, endMs, text}]} | employee, it, admin |
| GET | /api/karaoke/songs/:id/audio | Header Range | 206 audio. 403 nếu chưa approved. | employee, it, admin |
| POST | /api/karaoke/sessions | {songId, mode: "solo"} | 201 {sessionId, startedAt, lyrics}. Song ca để giai đoạn 3. | employee, admin |
| POST | /api/karaoke/sessions/:id/score | {summary: {accuracy, timing, notesHit, notesTotal, elapsedMs}} | 200 {score, rank}. 422 nếu ngoài giới hạn. | chủ phiên |
| GET | /api/karaoke/me/history?limit= | — | [{songId, score, createdAt}] | chính người dùng |
| GET | /api/karaoke/leaderboard?songId=&period= | — | [{rank, displayName, score}]. Chỉ opt-in. | employee, it, admin |
| POST | /api/karaoke/queue | {songId, roomId, displayName} | 201 {entry} | employee, admin |
| GET | /api/karaoke/queue?roomId= | — | [{position, songId, displayName, status}] | employee, it, admin |
| POST | /api/karaoke/admin/songs | multipart: audio, file lời, metadata, license | 201 {song, status: "pending"} | it (tải lên) |
| PATCH | /api/karaoke/admin/songs/:id/license | {status: "approved" hoặc "rejected", type, attribution, evidenceRef} | 200 | admin (phê duyệt) |
| DELETE | /api/karaoke/admin/songs/:id | — | 200 {status: "retired"}. Xóa mềm. Xóa hẳn chỉ khi người dùng yêu cầu rõ. | admin |

Tách quyền: it tải lên, admin phê duyệt. Một người không tự tải và tự duyệt.

Dữ liệu lưu (volume karaoke-data, và karaoke-media chỉ đọc cho file audio đã duyệt):
- songs: id, title, artist, lang, duration_ms, status, retired_at.
- song_licenses: song_id, type, attribution, source_url, evidence_ref, approved_by, approved_at, downloaded_at.
- song_lyrics: song_id, start_ms, end_ms, text.
- sessions: id, user_id, song_id, mode, started_at.
- scores: session_id, user_id, song_id, score, accuracy, timing, created_at.
- queue: id, room_id, song_id, display_name, position, status.

Quyền theo vai trò:

| Chức năng | employee | it | admin |
|---|---|---|---|
| Xem thư viện, hát solo, xem lịch sử | có | có | có |
| Tải bài lên (chờ duyệt) | không | có | không |
| Phê duyệt giấy phép bài | không | không | có |
| Xếp hàng biểu diễn | có | không | có |
| Xem bảng xếp hạng opt-in | có | có | có |

Vị trí và giờ dùng:
- Solo trên thiết bị cá nhân với tai nghe. Không cần phòng riêng cho MVP.
- Biểu diễn chung dùng sân khấu lounge (đề xuất vật thể stage_lounge, kind "stage") trong giờ nghỉ trưa và sau 17 giờ. Giờ cụ thể cần người dùng xác nhận (câu hỏi 13).
- Phiên nhóm nhỏ: đặt phòng họp mr3 (12 chỗ) qua it-service /api/rooms/book trước giờ hoạt động. Phòng có vách kính, nên chỉ dùng ngoài giờ cao điểm.
- Không dùng util_quiet, util_health hay khu dự phòng. Khu dự phòng không đặt bàn theo quyết định đã chốt (mục 4 FLOORPLAN_IT.md).

Yêu cầu kỹ thuật:
- Micro trình duyệt yêu cầu HTTPS hoặc localhost. Khi truy cập qua SSH tunnel tới 127.0.0.1:18080 thì được. Khi dùng domain nội bộ thì phải có HTTPS.
- Audio phát qua gateway với proxy_buffering off để hỗ trợ Range. Không cache công khai.
- Giới hạn tải lên, ví dụ 200 MB mỗi file, và kiểm tra định dạng audio trước khi lưu.

Ưu tiên: MVP cho solo và thư viện nhỏ đã cấp phép. Giai đoạn 2 cho hàng đợi và bảng xếp hạng theo phòng ban. Giai đoạn 3 cho song ca.

### 5.3 events-service (cổng 3005)

Mục tiêu: tổ chức lịch giao lưu văn nghệ, đăng ký tiết mục và khán giả, chương trình biểu diễn, bình chọn và công bố kết quả. Các mô hình sự kiện xem Phụ lục A.

Phạm vi:
- MVP: lịch sự kiện, đăng ký tiết mục và khán giả, chương trình có thứ tự, bình chọn một phiếu mỗi người mỗi vòng, công bố kết quả dạng tổng số phiếu, tải file .ics (không gửi email), danh sách nổi bật cho bảng thông báo.
- Giai đoạn 2: nhiều vòng thi, tích hợp hàng đợi karaoke-service, kết quả gắn với vinh danh kudos.
- Giai đoạn 3: phát trực tiếp nội bộ qua LiveKit hoặc máy chủ nội bộ có đăng nhập. Chỉ khi được duyệt.

API chính:

| Phương thức | Đường dẫn | Body | Trả về | Quyền |
|---|---|---|---|---|
| GET | /api/events?from=&to=&type= | — | [{id, title, type, startsAt, endsAt, zoneId, status}] | employee, it, admin |
| GET | /api/events/:id | — | {event, program, myRegistration, myVote} | employee, it, admin |
| POST | /api/events | {title, type, startsAt, endsAt, zoneId, capacity, rules, prizeNote} | 201 {event} | admin |
| PATCH | /api/events/:id | Các trường cần sửa | 200 | admin |
| POST | /api/events/:id/registrations | {kind: "performer" hoặc "audience", title, durationSec, songId, displayName} | 201 {entry}. 409 nếu vượt số tiết mục. | employee, admin |
| DELETE | /api/events/:id/registrations/:regId | — | 204 | chủ đăng ký, admin |
| PATCH | /api/events/:id/program/:entryId | {order, status: "queued", "on", "done" hoặc "skipped"} | 200 | admin |
| POST | /api/events/:id/votes | {entryId} | 201. 409 nếu đã bình chọn ở vòng này. 422 nếu bình chọn tiết mục của chính mình. | employee |
| GET | /api/events/:id/results | — | [{entryId, title, votes}]. Chỉ khi đã công bố hoặc đã đóng. | employee, it, admin |
| POST | /api/events/:id/status | {status: "draft", "open", "voting", "closed" hoặc "published"} | 200 | admin |
| GET | /api/events/:id/ics | — | File .ics để tải về. Không gửi email. | employee, it, admin |
| GET | /api/events/highlights?limit=5 | — | [{eventId, title, date, winnerTitle}]. Dùng cho bảng thông báo. | employee, it, admin |

Dữ liệu lưu (volume events-data):
- events: id, title, type, starts_at, ends_at, zone_id, status, capacity, rules, prize_note, results_visible.
- registrations: id, event_id, user_id, kind, title, duration_sec, song_id, display_name, status.
- program_entries: id, event_id, registration_id, position, status.
- votes: event_id, round, entry_id, voter_id, created_at. Ràng buộc duy nhất (event_id, round, voter_id).
- highlights: event_id, summary, published_at.

Quy tắc bình chọn:
- Một phiếu mỗi người mỗi vòng. Không bình chọn tiết mục của chính mình.
- Hệ thống lưu voter_id để kiểm toán, nhưng API kết quả chỉ trả tổng số phiếu.
- Admin không xem được ai bình chọn ai qua API. Muốn kiểm toán phải có quy trình riêng do pháp chế và an toàn thông tin duyệt.

Quyền theo vai trò:

| Chức năng | employee | it | admin |
|---|---|---|---|
| Xem lịch và chi tiết sự kiện | có | có | có |
| Đăng ký tiết mục hoặc khán giả | có | có | có |
| Bình chọn | có | có | có |
| Xem kết quả khi đã công bố | có | có | có |
| Tạo, sửa, đổi trạng thái, duyệt chương trình | không | không | có |

Ghi chú: đề xuất thêm vai trò "ban văn hóa" để tạo sự kiện và duyệt tiết mục mà không cần quyền admin toàn hệ thống. Cần quyết định (câu hỏi 7).

Vị trí trên mặt bằng:
- Sân khấu chung: lounge (khu Đông, kind "lounge"). Đề xuất vật thể stage_lounge (kind "stage", action "events").
- Bảng sự kiện: đề xuất events_board (kind "board", action "events_board") đặt cạnh kudos_board trên tường phía Đông. Hiển thị danh sách nổi bật và lịch, chỉ đọc.
- Bảng thông báo notice_board: hiển thị lịch sự kiện từ /api/events/highlights.
- Bảng vinh danh kudos_board: vinh danh kết quả (không gắn tiền).
- Tập dượt: đặt mr1 (8 chỗ) hoặc mr3 (12 chỗ) qua it-service.
- Không dùng util_health, util_quiet hay khu dự phòng cho sự kiện.

Ưu tiên: MVP cho lịch, đăng ký, bình chọn và công bố. Giai đoạn 2 cho nhiều vòng và liên kết karaoke. Giai đoạn 3 cho phát trực tiếp.

### 5.4 Tích hợp với dịch vụ hiện có

- auth-service: vai trò hiện có là employee, it, admin. Đề xuất đưa thiết lập opt-in và tên hiển thị về một hồ sơ dùng chung, để games và karaoke không lưu trùng. Việc này thay đổi auth nên cần người phụ trách auth duyệt.
- it-service: đặt phòng qua /api/rooms/book và /api/rooms/free cho tập dượt và phiên nhóm nhỏ. Vinh danh qua /api/kudos cho người thắng cuộc thi.
- Bảng thông báo: đọc /api/events/highlights. Không ghi đè nội dung bảo trì của IT.

---

## 6. Kiến trúc gateway

### 6.1 Đường dẫn và upstream

| Đường dẫn | Chuyển tới | Ghi chú |
|---|---|---|
| /api/games/* | 127.0.0.1:3003 | Giai đoạn 2 thêm WebSocket: Upgrade và Connection trong location. |
| /api/karaoke/* | 127.0.0.1:3004 | proxy_buffering off cho /audio. Giới hạn kích thước tải lên 200 MB cho đường admin. |
| /api/events/* | 127.0.0.1:3005 | Không cần cấu hình đặc biệt. |
| /api/* còn lại | Trả 404 JSON | Giữ nguyên, khai báo sau các location mới. |

Gateway không cắt tiền tố, nên service nhận đường dẫn đầy đủ như /api/games/rooms. Thêm location vào deploy/nginx/gateway.conf. Trước khi sửa cần đọc lại file hiện có, vì tài liệu này không đọc nội dung file đó.

### 6.2 Cổng và volume

| Service | Cổng | Volume | Container | Phụ thuộc |
|---|---|---|---|---|
| web | 18081 | — | gpb-tool/web:local | gateway |
| gateway | 18080 | — | gpb-tool/gateway:local | web, auth, it, games, karaoke, events |
| auth | 3001 | auth-data | gpb-tool/auth:local | — |
| it | 3002 | it-data | gpb-tool/it:local | auth |
| games (đề xuất) | 3003 | games-data | gpb-tool/games:local | auth |
| karaoke (đề xuất) | 3004 | karaoke-data, karaoke-media (chỉ đọc) | gpb-tool/karaoke:local | auth |
| events (đề xuất) | 3005 | events-data | gpb-tool/events:local | auth, it (đặt phòng) |
| LiveKit (giai đoạn 3, chờ duyệt) | 3006 cho signalling, cộng dải UDP riêng | — | Container riêng | Cần duyệt firewall |
| Dự phòng | 3007 trở đi | — | — | — |

Ghi chú:
- Các cổng 3003, 3004, 3005 đã chọn theo quy tắc bắt đầu từ 3003, tránh 3001 và 3002.
- Compose: thêm ba service mới với network_mode: host, restart: unless-stopped, healthcheck wget tới cổng tương ứng. Không thêm ports:, không tạo network mới.
- LiveKit cần UDP trực tiếp từ trình duyệt đến máy chủ media. Điều này không đi qua gateway và không đi qua SSH tunnel. Phải được duyệt trước khi làm giai đoạn 3.

---

## 7. Rủi ro và việc cần pháp chế hoặc người phê duyệt

| # | Rủi ro | Mức | Biện pháp đề xuất | Người phê duyệt |
|---|---|---|---|---|
| 1 | Bản quyền nhạc nền | Cao | Chỉ phát bài có trạng thái approved. Lưu ảnh chụp license và mã bài tại thời điểm tải. Không dùng nhạc thương mại. | Pháp chế |
| 2 | Bản quyền lời bài hát | Cao | Không dùng LRCLIB, Musixmatch, Genius trong MVP. Lời tự soạn trên nhạc đã có quyền. | Pháp chế |
| 3 | Nội dung do người dùng tải lên | Trung bình | Chỉ it tải lên, admin duyệt trước khi phát. Có nút báo cáo nội dung. | Ban văn hóa hoặc admin |
| 4 | Dữ liệu cá nhân: điểm, lịch sử, tên hiển thị | Cao | Mục đích rõ, opt-in, lưu 12 tháng rồi xóa, cho phép tắt và xóa lịch sử. Không dùng ngoài nội bộ. | Pháp chế, phụ trách bảo mật dữ liệu, HR |
| 5 | Ghi âm và ghi hình giọng hát, hình ảnh nhân viên | Cao | Không ghi mặc định. Ghi hình có đồng ý bằng văn bản. Lưu nội bộ, có thời hạn. Không đưa ra công khai. | Pháp chế, HR |
| 6 | Hoạt động trong giờ làm việc và năng suất | Trung bình | Tự nguyện. Chỉ hoạt động trong khung giờ đã duyệt. Điểm và thành tích không dùng trong đánh giá nhân sự. Ghi trong quy định. | HR, ban lãnh đạo khối |
| 7 | Tiếng ồn trong khu làm việc mở | Trung bình | Biểu diễn chung ở lounge trong giờ nghỉ. Solo dùng tai nghe. Không hoạt động ở util_quiet và util_health. | Hành chính, quản lý khối |
| 8 | Cờ bạc hoặc tiền thật | Cao | Không tích hợp thanh toán. Không cược. Không quà đổi tiền. Có kiểm thử tự động cho các endpoint không có trường tiền. | Pháp chế, kiểm soát nội bộ |
| 9 | Livestream lộ ra ngoài | Cao | Không tích hợp nền tảng công khai. Mọi phát trực tiếp đều nội bộ và có đăng nhập. | An toàn thông tin |
| 10 | Mở UDP cho WebRTC (LiveKit) | Cao khi làm giai đoạn 3 | Duyệt firewall và đánh giá bảo mật trước khi triển khai. | An toàn thông tin, network |
| 11 | Micro cần HTTPS | Trung bình | Dùng HTTPS. Chờ domain riêng do người dùng cung cấp trước khi tạo DNS. | Người phụ trách hạ tầng |
| 12 | Giấy phép phần mềm copyleft và Commons Clause | Trung bình | Không sao chép mã GPL, AGPL, Commons Clause. Chỉ tham khảo ý tưởng. Nếu sửa một dự án AGPL và phục vụ nội bộ qua mạng, cần pháp chế đánh giá. | Pháp chế |
| 13 | Gian lận bình chọn | Trung bình | Một phiếu mỗi người mỗi vòng. Không bình chọn chính mình. Lưu nhật ký. Công bố tổng số phiếu. | Ban văn hóa |
| 14 | Nhạy cảm văn hóa, dân tộc, tôn giáo | Trung bình | Duyệt kịch bản trước. Không bắt buộc người tham gia làm đại diện cho một nhóm. | Ban văn hóa |
| 15 | Chấm điểm karaoke dễ bị giả mạo | Trung bình | Chỉ dùng để giải trí. Server kiểm tra giới hạn hợp lý. Không dùng để khen thưởng vật chất. | Quản lý sản phẩm |
| 16 | Khả năng tiếp cận | Trung bình | Chế độ khán giả, không bắt buộc hát. Hỗ trợ bàn phím. Chữ tiếng Việt có dấu, tương phản đủ. | Quản lý sản phẩm |

---

## 8. Lộ trình gợi ý theo đợt

Tài liệu này không ước lượng thời gian. Đội phát triển cần xác nhận số sprint sau khi trả lời câu hỏi ở mục 9.

| Đợt | Nội dung | Điều kiện đầu vào | Tiêu chí hoàn thành |
|---|---|---|---|
| 0: Chuẩn bị | Trả lời câu hỏi mục 9. Pháp chế duyệt nguyên tắc nhạc, lời và dữ liệu. Chọn vị trí. Chọn 5 đến 10 bài đầu tiên đã có quyền. Xác nhận domain HTTPS. | Người dùng trả lời câu hỏi. Có domain riêng. | Bảng chính sách nhạc và lời được duyệt. Danh sách bài có bằng chứng giấy phép. |
| 1: MVP | games-service: cờ caro, đố vui theo lượt, bảng xếp hạng opt-in, bật tắt. karaoke-service: thư viện, phát nhạc, chấm điểm solo, lịch sử. events-service: lịch, đăng ký, chương trình, bình chọn, .ics, nổi bật. Gateway và Compose. Ba vật thể trên mặt bằng. | Đợt 0 hoàn thành. | Ba service chạy qua gateway. Có kiểm thử cho quyền theo vai trò. Không có endpoint nào trả trường tiền. Tắt được từng game và từng phòng ban. |
| 2: Mở rộng | games: phòng thời gian thực với Colyseus. karaoke: hàng đợi, bảng xếp hạng theo phòng ban. events: nhiều vòng, liên kết hàng đợi karaoke, vinh danh qua kudos. | Đợt 1 ổn định. Có phản hồi người dùng thử. | Có số liệu tải và độ trễ. Ngưỡng chấp nhận đã được đặt. |
| 3: Nâng cao | Song ca qua LiveKit. Phát trực tiếp nội bộ. Mini-game 3D trong lounge bằng three.js. | Duyệt mạng UDP và firewall. Duyệt an toàn thông tin. Có HTTPS nội bộ. | Kiểm thử với nhóm thí điểm. Được duyệt bởi an toàn thông tin. |

---

## 9. Câu hỏi cần người dùng trả lời trước khi làm

1. Nguồn nhạc: có chấp nhận CC0, CC BY có ghi công, Pixabay (có lưu bằng chứng) và nhạc đặt hàng hoặc tự sáng tác không? Có ai có quyền nhạc Việt để cấp phép không?
2. Lời bài hát: đồng ý không dùng LRCLIB, Musixmatch và Genius trong MVP, và dùng lời tự soạn trên nhạc đã có quyền không?
3. Pháp chế có xác nhận hai điểm này không: không dùng YouTube Audio Library ngoài YouTube, và không dùng CC BY-NC cho nội bộ ngân hàng?
4. Vị trí karaoke và biểu diễn: sân khấu lounge trong giờ nghỉ và sau 17 giờ, phòng họp mr3 khi đặt trước, hay khu dự phòng (cần đổi quyết định 4 trong docs/FLOORPLAN_IT.md)?
5. Có đồng ý thêm ba vật thể mới vào src/content/zones/it.json (games_corner, stage_lounge, events_board) và cập nhật docs/FLOORPLAN_IT.md không?
6. Nguồn danh sách phòng ban để bật tắt theo phòng ban là gì: HR, file thủ công, hay tenant hiện có? Auth hiện chỉ có tenant theo tên miền email.
7. Có cần vai trò "ban văn hóa" tách khỏi admin để tạo sự kiện và duyệt tiết mục không?
8. Bảng xếp hạng có tự nguyện (opt-in) không, và có cần xem theo phòng ban không?
9. Có ghi âm hoặc ghi hình giọng hát và buổi giao lưu không? Nếu có, lưu bao lâu và ai được xem? Đề xuất: mặc định không ghi.
10. Quà không bằng tiền (sách, chứng nhận, vật phẩm nhỏ) có được không, hay chỉ vinh danh trên bảng kudos?
11. MVP chỉ xuất file .ics. Có cần gửi lời mời qua Outlook hoặc email không? Gửi thư cần người phê duyệt riêng.
12. Khi nào có domain riêng cho HTTPS? Micro trình duyệt không hoạt động qua HTTP ngoài localhost.
13. Khung giờ hoạt động được phép là gì (ví dụ 12 giờ đến 13 giờ 30 và sau 17 giờ)?
14. Song ca có cần ở đợt 1 không? Nếu có, cần mở UDP cho LiveKit trong mạng nội bộ và duyệt trước.
15. Hai câu về nội dung: (a) Trò nối từ tiếng Việt có dùng được từ điển nội bộ không? (b) Điểm karaoke có bị cấm dùng trong đánh giá nhân sự không? Đề xuất: có cấm.

Ngoài ra cần URL cụ thể cho Synchron, OkTV, ultrastar_pitch và WonderVerse nếu muốn đưa vào so sánh. Tên ultrastar_pitch không tìm thấy trong tổ chức ultrastar-dev, có thể là UltraStar Play (mục 3.2).

---

## Phụ lục A. Mô hình sự kiện giao lưu văn nghệ

| Mô hình | Cách vận hành | Rủi ro | Biện pháp |
|---|---|---|---|
| A1. Sân khấu mở giờ nghỉ trưa (open mic) | Đăng ký trước. Mỗi tiết mục khoảng 5 phút. Khán giả đeo tai nghe khi không biểu diễn. | Tiếng ồn ảnh hưởng khu làm việc. Áp lực khi đứng trước đồng nghiệp. Người không muốn hát bị kéo vào. Giờ nghỉ ngắn. | Tự nguyện. Có vai trò khán giả. Không chấm điểm. Giới hạn số tiết mục mỗi buổi. |
| A2. Cuộc thi bình chọn theo vòng | Sơ loại rồi chung kết. Mỗi người một phiếu mỗi vòng, không bình chọn chính mình. Giải thưởng phi tiền: vinh danh kudos, chứng nhận nội bộ. | Kéo phiếu hoặc vận động hành lang. Cạnh tranh giữa phòng ban. Tranh cãi kết quả. Người thua mất tự tin. | Nhật ký phiếu. Chỉ công bố tổng số phiếu. Có hội đồng chấm phụ. Thông báo tiêu chí trước. |
| A3. Gala ảo theo mùa lễ (Tết, Trung thu) | Có MC, video chúc mừng, tiết mục xếp lịch trên sân khấu lounge. Mở cho nhân viên tự nguyện tham dự. | Video hoặc nhạc nền vi phạm bản quyền. Nội dung không phù hợp. Phát trực tiếp lộ ra ngoài. Tốn thời gian làm việc. | Chỉ dùng nhạc đã duyệt. Duyệt kịch bản trước. Phát nội bộ không có đường công khai. Khung giờ được duyệt. |
| A4. Giao lưu văn hóa vùng miền (ẩm thực, trang phục, dân ca) | Nhóm nhỏ giới thiệu văn hóa, trình diễn ngắn, hỏi đáp. | Định kiến và hiểu sai. Nhạy cảm về dân tộc, tôn giáo. Nhân viên thuộc nhóm thiểu số bị đặt làm đại diện. | Duyệt nội dung trước. Không bắt buộc ai làm đại diện. Có người phụ trách nội dung. |
| A5. Đố vui và hát tập thể theo phòng ban (team-building) | Thi đố vui theo đội hỗn hợp liên phòng ban. Hát đồng ca theo lượt. | So sánh thành tích phòng ban tạo áp lực. Dùng kết quả làm chỉ số đánh giá. Phòng ban nhỏ bất lợi. | Ghi quy định cấm dùng kết quả trong đánh giá nhân sự. Chia đội hỗn hợp. Tự nguyện. |

---

## Phụ lục B. Nguồn đã dùng và ngày kiểm tra

Tất cả kiểm tra vào ngày 2026-11-06.

- GitHub API: https://api.github.com/repos/<chủ>/<repo>. Các repo kiểm tra gồm colyseus/colyseus, boardgameio/boardgame.io, photonstorm/phaser, playcanvas/engine, BabylonJS/Babylon.js, socketio/socket.io, jhlywa/chess.js, livekit/livekit, livekit/client-sdk-js, OpenVidu/openvidu, jitsi/jitsi-meet, owncast/owncast, bigbluebutton/bigbluebutton, lukevella/rallly, fullcalendar/fullcalendar, pretix/pretix, LimeSurvey/LimeSurvey, UltraStar-Deluxe/USDX, UltraStar-Deluxe/format, UltraStar-Deluxe/Play, tranxuanthang/lrclib, ianprime0509/pitchy, Vocaluxe/Vocaluxe, Asvarox/allkaraoke, diegogd/allkaraoke, karaokeresearch/singalong, brandonwisnicki/OpenSing, thedavidweng/OpenKara, osmanahmadxai/open-karaoke, xuancong84/OpenHomeKaraoke, gyunaev/spivak, YuutaTsubasa/karaoke, karaokemugen/karaokemugen-app, workadventure/workadventure, performous/performous, ultrastar-dev/ultrastar_pitch (404), ultrastar-dev/usdb_syncer (404), mozilla/hubs.
- npm registry: https://registry.npmjs.org/<gói>/latest. Các gói gồm colyseus, @colyseus/core, boardgame.io, phaser, playcanvas, babylonjs, socket.io, socket.io-client, chess.js, livekit-client, livekit-server-sdk, openvidu-browser, pitchy, @fullcalendar/core.
- File LICENSE (raw.githubusercontent.com): pretix, LimeSurvey, mozilla/hubs, tranxuanthang/lrclib, lukevella/rallly, OpenVidu/openvidu, owncast/owncast, UltraStar-Deluxe/format.
- Trang giá: https://www.gather.town/pricing, https://www.sococo.com/pricing, https://www.teamflow.com/pricing, https://remo.co/pricing, https://www.kumospace.com/pricing. Trang wonderverse.com/pricing trả 404.
- Thứ cấp: https://remo.co/review/kumospace, https://softwarefinder.com/collaboration-productivity-software/kumospace, https://www.gather.town/blog/5-minute-games-for-virtual-meetings, https://www.jackboxgames.com/blog/how-the-party-game-people-throw-a-virtual-work-party, https://www.ironistic.com/insights/gather-town-virtual-event-ideas/.
- Hỗ trợ Mozilla về Hubs: https://support.mozilla.org/dsb/kb/end-support-mozilla-hubs.
- FAQ WorkAdventure: https://workadventu.re/faq/what-is-the-license-of-the-self-hosted-version-of-workadventure/.
- Chính sách YouTube Audio Library: https://support.google.com/youtube/answer/3376882.
- FMA FAQ: https://freemusicarchive.org/faq.
- Pixabay (thứ cấp): https://pixabay.com/service/faq/ và https://scancode-licensedb.aboutcode.org/pixabay-content.html. Trang license chính thức trả 403.
- LRCLIB: https://lrclib.net và https://lrclib.net/docs.txt.
- Musixmatch: https://musixmatch.com/apiterms (không đọc được nội dung).
- Đặc tả UltraStar: https://github.com/UltraStar-Deluxe/format.
- Không kiểm tra được: Genius (403), Synchron, OkTV, WonderVerse, PopSpace, Incompetech (nội dung trang không tải).
