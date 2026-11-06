# ANIMALS · Động vật NPC cho văn phòng ảo GPBank (Khối CNTT)

| Mục | Nội dung |
|---|---|
| Ngày | 2026-11-06 |
| Trạng thái | Bản đề xuất. Mục 10 ghi mặc định áp dụng cho mọi điểm chưa có phản hồi |
| Phạm vi | Chỉ tài liệu thiết kế. Không có mã nguồn, asset hay gói cài đặt |
| Tham chiếu (chỉ đọc) | DESIGN_V2.md (mục 1, 2.2, 5.3, 5.7, 7.7, 9), AVATAR_SPEC.md (mục 7, Hiện trạng repo), ASSET_SOURCES.md, DECISIONS.md, INTERACTIONS.md (mục 1.3, 2.3, 6, 8; file đang viết, dừng ở mục 8), docs/FLOORPLAN_IT.md, src/scene/layout.ts, services/display (mẫu SSE), docker-compose.yml, deploy/nginx/gateway.conf |
| Ràng buộc | Nguyên gốc, không nhân vật có bản quyền. Không nhạc hay âm thanh có bản quyền. Tối đa 3 động vật hiển thị đầy đủ trong khung nhìn |

Ký hiệu: [THƯ VIỆN] dùng API có sẵn của three.js hoặc drei. [SHADER] cần shader nhỏ. [ƯỚC LƯỢNG] chưa đo trên máy thật. [CHƯA XÁC MINH] chưa có nguồn hoặc quy định đã đối chiếu.

---

## 0. Tóm tắt

- Bốn loài: rùa cảnh (đi lại, MVP), cá cảnh trong bể (MVP), ốc sên cảnh (đi lại chậm, giai đoạn 3b), sứa trong bể (giai đoạn 3c).
- Mèo, chó nhỏ, chim, thỏ bị loại vì gây dị ứng (lông, da, lông vũ) và có nguy cơ cắn hoặc cào. Đây là điểm khác với danh sách gợi ý, xem mục 1.3.
- Mô hình procedural, hình khối nguyên gốc, mỗi loài một vật liệu có màu đỉnh, không texture.
- Server quyết định trạng thái (vị trí, hành động, nhu cầu). Server phát `animal.changed` qua SSE chung của `world` mỗi 2 giây. Client nội suy. Phản hồi tức thì đi bằng `animal.react`.
- Trạng thái động vật nằm trong dịch vụ `world` (cổng 3008), dưới dạng module `animals`. Không tạo dịch vụ riêng. Lý do ở mục 6.1.
- Động từ dùng đúng ID của INTERACTIONS.md mục 6: `pet`, `feed`, `give_water`, `call_back`, `photo`, `play`. Thêm `pick` cho thức ăn và bóng (đề xuất, mục 4.3).
- Tối đa 8 thực thể toàn tầng. Trần draw call cho động vật ở mức Trung là 10. Con số này đẩy tổng DESIGN_V2 lên 209, cần chủ dự án chốt (mục 2.5, mục 11).
- MVP là Pha 3a của INTERACTIONS.md: rùa và bể cá, hai hành động `pet` và `feed`. MVP phụ thuộc Pha 1 của `world` (presence có toạ độ, SSE, tay cầm).

---

## 1. Chọn loài

### 1.1 Tiêu chí

| # | Tiêu chí | Lý do |
|---|---|---|
| T1 | Không gây dị ứng đáng kể: không lông, không lông vũ, không bong da lông | Ràng buộc dự án. 500 nhân sự dùng chung một sàn |
| T2 | Không cắn, cào, chích; không có nọc hay độc | Ràng buộc dự án |
| T3 | Không ồn, không mùi, không cần chuồng lớn | Môi trường văn phòng |
| T4 | Rủi ro vệ sinh khi tiếp xúc thật có thể nhắc bằng một dòng ngắn | Rùa, ốc và cá có thể mang vi khuẩn hoặc ký sinh trùng |
| T5 | Dựng được bằng khối hình học nguyên gốc, đọc được ở camera cách 7 đến 10 m | Mục 2 |
| T6 | Không phải loài xâm lấn hoặc bị kiểm soát | [CHƯA XÁC MINH] quy định tại Việt Nam, xem mục 11 |

### 1.2 Bốn loài đề xuất

| Loài (tên hiển thị) | Kiểu | Lý do chọn | Vị trí thường ở | Kích thước (m) | Số lượng tối đa | Khung hoạt động | Giai đoạn |
|---|---|---|---|---|---|---|---|
| Rùa cảnh | Đi lại chậm trên sàn | Không dị ứng, không cắn. Chậm nên không gây phiền. Đủ hành động vuốt ve, cho ăn, đưa nước, gọi về chỗ, chơi bóng | Ổ ở góc Đông lounge. Đi dạo ở lounge và hành lang Nam | Dài 0.45, cao 0.16 | 2 con | Xem bảng chu kỳ ngày, mục 3.3 | MVP (3a) |
| Cá cảnh nhỏ (dáng betta, đơn giản hóa) | Bể cố định | Không lông, không cắn. Bể dễ đặt ở lounge, tốn ít tài nguyên | Bể trong lounge, phía Nam, gần lối xuống pantry | Thân dài 0.06 mỗi con. Bể 3.0 × 0.5 × 1.0 | 2 bể, mỗi bể 3 con (MVP: 1 bể) | Bơi 24 giờ, chậm lại ban đêm | MVP (3a) |
| Ốc sên cảnh | Đi lại rất chậm | Hình dáng dễ thương, chuyển động chậm và yên tĩnh | Lounge phía Bắc, cạnh karaoke | Dài 0.22, cao 0.15 | 2 con | Đi dạo 08:00 đến 20:00, ngủ trong vỏ | 3b |
| Sứa mặt trăng (đơn giản hóa) | Bể cố định | Chuyển động nhẹ, yên bình, hợp với sảnh tiếp khách | Bể ở sảnh, cạnh bảng thông báo (xem 1.4) | Chuông đường kính 0.24. Xúc tu 0.25 | 1 bể | 24 giờ | 3c |

Tổng toàn tầng tối đa 7 thực thể (2 rùa, 2 ốc, 2 bể cá, 1 bể sứa), cộng 1 dự phòng, nên trần là 8. Xem mục 5.6.

### 1.3 Loại trừ

| Gợi ý | Quyết định | Lý do |
|---|---|---|
| Mèo | Loại | T1: protein gây dị ứng trong lông và nước bọt (ví dụ Fel d 1). T2: cào |
| Chó nhỏ | Loại | T1: protein gây dị ứng (ví dụ Can f 1). T2: cắn. Cần đi dạo ngoài trời, không hợp sàn văn phòng |
| Chim | Loại | T1: lông vũ và bụi lông. T3: tiếng hót, mùi. Một số loài nuôi có nguy cơ bệnh đường hô hấp cho người |
| Thỏ | Loại | T1: dị ứng lông. T2: đá, cắn khi bị stress |
| Rùa | Chọn, có điều kiện | Không dị ứng, không cắn. Rủi ro vi khuẩn (T4) xử lý bằng nhắc rửa tay (mục 7) |

Ràng buộc "không có động vật gây dị ứng" được đọc là ràng buộc mạnh, nên loại cả loài có lông. Nếu chủ dự án muốn đưa lại mèo hoặc thỏ, cần quyết định riêng (mục 10, D1). Đây là nhân vật ảo, nên rủi ro dị ứng không tồn tại trong game. Tài liệu vẫn áp dụng ràng buộc để thông điệp với nhân viên nhất quán.

### 1.4 Vị trí và điểm neo

Quy ước: toạ độ bản vẽ (x, y) theo docs/FLOORPLAN_IT.md. Toạ độ three.js: worldX = x − 29, worldZ = y − 15. Toạ độ dưới đây là đề xuất, chưa kiểm bằng script. Phải kiểm không chồng lên 39 vật thể trong content/zones/it.json trước khi thêm.

| Điểm neo | Bản vẽ (x, y) | World (x, z) | Ghi chú |
|---|---|---|---|
| Ổ rùa | (56.0, 12.5) | (27.0, −2.5) | Góc Đông lounge. Thảm decor 2.0 × 2.0 m (55–57 × 11.5–13.5) |
| Ổ ốc | (54.0, 5.2) | (25.0, −9.8) | Mép Bắc lounge, giữa karaoke (x ≤ 51.2) và util_health (y ≥ 6.0) |
| Bể cá | x 52.0–55.0, y 17.5–18.0 | Tâm (24.5, 2.75), 3.0 × 0.5 m | Lounge phía Nam. Để trống lối y 18.0–21.0 dẫn xuống pantry |
| Bể sứa | x 20.8–22.8, y 14.5–14.9 | Tâm (−7.2, −0.3), 2.0 × 0.4 m | Sảnh, phía Đông bảng thông báo, sát tường lõi. Chỉ decor, không chặn cửa |
| Điểm lấy thức ăn | Vật thể `pet_food_pantry` (đề xuất): (54.0, 21.5) | (25.0, 6.5) | Khe giữa lounge và pantry. Dùng `pick` trong bán kính mặc định 2.0 m |
| Giá bóng | Vật thể `ball_rack_games` (đề xuất): (51.8, 11.6) | (22.8, −3.4) | Sát mép Đông games_corner |
| Bình nước | `water_cooler_pantry` (đã có trong INTERACTIONS mục 3.2) | Theo it.json | Dùng `fill` để lấy `water_cup`. Không cần vật thể mới |

### 1.5 Khu không đặt động vật

- Khu làm việc Bắc (open_north) và các khối bàn: đông người, có tường NOC. Động vật không đi vào.
- Phòng họp mr1 đến mr3, util_quiet, util_health: phòng kín hoặc đặt phòng. Không đi vào.
- Phòng máy chủ và SOC: cấm (DESIGN_V2 mục 5.7, INTERACTIONS mục 6). Mở rộng 1.0 m, không có ô nào trong vùng đi lại.
- WC, lõi thang, kho IT, khu trong pantry (ngoài điểm lấy thức ăn).
- Vùng dự phòng (14.5–29.9 × 0.2–15.2): MVP không cho đi lang thang, vì chưa xác minh lối vào (mục 11).

---

## 2. Mô hình

### 2.1 Quyết định: procedural cho MVP

- Procedural: ghép từ BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry của three.js (MIT). Không có file ngoài, không cần ghi công, không tải từ CDN.
- GLB hoặc VRM: không đề xuất ở MVP. ASSET_SOURCES.md chưa có nguồn động vật đã xác minh. Quaternius có trong bảng nhưng trạng thái là chưa xác minh (QAL), nên không dùng.
- Lý do: bốn loài đều là khối đơn giản, đọc được ở khoảng cách camera. Không tăng gói tải, không rủi ro license.

### 2.2 Quy ước kỹ thuật

- Đơn vị mét. Gốc mô hình ở tâm đế. Trục Z là hướng đầu.
- Mỗi loài một vật liệu MeshStandardMaterial (hoặc MeshLambertMaterial) với vertexColors: true, dùng chung cho mọi con cùng loài. [THƯ VIỆN]
- Hình học tĩnh gộp bằng mergeGeometries (BufferGeometryUtils, MIT). Bộ phận có chuyển động là Group riêng.
- Cá và sứa dùng InstancedMesh.
- Không texture. Không đổ bóng riêng. Một đốm tối dưới đế được gộp vào mesh thân, không tốn thêm draw call.
- Sứa không dùng transmission (DESIGN_V2 mục 9.5). Dùng transparent, opacity 0.5, depthWrite false.
- Geometry và vật liệu được tạo một lần khi tải. Không tạo trong vòng lặp khung hình (DESIGN_V2 mục 9.5).

### 2.3 Đặc tả hình khối

**Rùa** (tổng dài khoảng 0.45 m, cao 0.16 m)

| Bộ phận | Hình khối | Kích thước (m) | Vị trí (m) | Màu (hex) | Ghi chú |
|---|---|---|---|---|---|
| Mai | Nửa ellipsoid | Bán kính (0.20, 0.08, 0.16) | y = 0.06 | Mai #5E6F45. Viền #B9A67A | Phần lớn nhất, một mesh |
| Yếm | Hộp mỏng | 0.34 × 0.015 × 0.24 | y = 0.02 | #D9C98F | Dưới mai |
| Đầu | Ellipsoid | (0.065, 0.055, 0.06) | (0.23, 0.09, 0) | #7C9A56 | Nhóm đầu |
| Cổ | Trụ | Bán kính 0.03, cao 0.06 | Nối thân và đầu | #7C9A56 | Nhóm đầu |
| Mắt (2) | Cầu | Bán kính 0.011 | Hai bên đầu | #1B1B1B. Điểm sáng #FFFFFF bán kính 0.003 | Nhóm đầu |
| Vệt cam (2) | Ellipsoid dẹt | (0.02, 0.006, 0.012) | Hai bên đầu | #D9703A | Dấu nhận diện, không mô phỏng loài thật |
| Chân (4) | Trụ ngắn và đĩa dẹt | Bán kính 0.035, cao 0.06 | Bốn góc thân | #7C9A56 | Nhóm chân |
| Đuôi | Nón | Bán kính 0.015, dài 0.05 | (−0.21, 0.03, 0) | #7C9A56 | Thân |

**Cá cảnh** (một con dài 0.09 m; ba con dùng InstancedMesh, màu riêng qua instanceColor)

| Bộ phận | Hình khối | Kích thước (m) | Màu | Ghi chú |
|---|---|---|---|---|
| Thân | Ellipsoid | (0.045, 0.028, 0.012) | Cam #E8873E, xanh #3E86C6, vàng #F2C14E | Màu theo từng con |
| Đuôi | Ba tam giác quạt | Dài 0.03 | #D9587E | Gốc đuôi là trục lắc |
| Vây lưng | Tam giác mỏng | Cao 0.02 | #F2C14E | Xòe khi RESPOND |
| Mắt (2) | Cầu | Bán kính 0.004 | #111111 | |

**Ốc sên** (dài 0.22 m, cao 0.15 m)

| Bộ phận | Hình khối | Kích thước (m) | Màu | Ghi chú |
|---|---|---|---|---|
| Vỏ | Ba cầu giảm dần, xếp lệch | (0.11, 0.09, 0.05) | Vỏ #B08A55, vạch #6B4F2E | Nhóm vỏ |
| Thân | Ellipsoid | (0.16, 0.05, 0.06) | #D8CBA8 | Nhóm thân |
| Râu (2) | Trụ mảnh, đầu cầu | Trụ bán kính 0.005, dài 0.05. Cầu 0.009 | Râu #D8CBA8, đầu #222222 | Nhóm râu |

**Sứa mặt trăng** (đơn giản hóa)

| Bộ phận | Hình khối | Kích thước | Màu | Ghi chú |
|---|---|---|---|---|
| Chuông | Nửa cầu, 24 × 12 đoạn | Bán kính 0.12 | #A9E4FF, opacity 0.5, emissive #2EA8E0 cường độ 0.25 | InstancedMesh |
| Xúc tu (8) | Đoạn thẳng | Dài 0.25 | #C9ECFF, opacity 0.4 | LineSegments, một draw call |

### 2.4 Hoạt ảnh tối thiểu

| Loài | Hoạt ảnh | Tham số | Ghi chú |
|---|---|---|---|
| Rùa | Thở | Scale y ±1.5% trên mai, chu kỳ 4 s | Giống thở người (DESIGN_V2 mục 7.7) |
| | Nháy mắt | Mí từ 0 đến 1 trong 0.12 s, mỗi 4 đến 7 s (ngẫu nhiên) | |
| | Bước đi | Bốn chân lắc ±15° theo cặp chéo, chu kỳ 1.2 s | Không dùng IK |
| | Nhìn theo | Quay đầu tối đa ±25° về người chơi gần nhất | Client tính, không cần server |
| | Rụt đầu | Đầu co trong 0.5 s rồi thò lại | Khi vuốt ve hoặc sợ |
| | Ăn | Cổ vươn tới người chơi, nhai scale 0.97 đến 1.0 ở 2 Hz, 6 s | |
| | Uống | Cúi đầu 4 s | |
| | Ngủ | Mắt nhắm, thở chậm chu kỳ 6 s | |
| Ốc | Thở | Co thân ±3% khi đi, chu kỳ 2 s | |
| | Râu | Lắc ±12° ở 0.5 Hz | |
| | Rụt râu | Scale 0.2 trong 0.5 s khi chạm | |
| Cá | Bơi | Dọc bể, đổi hướng khi chạm biên | Hộp bơi 2.6 × 0.3 × 0.4 m |
| | Lắc đuôi | ±20° ở 2 Hz | [SHADER] nhỏ. Nếu bỏ shader thì xoay nhẹ cả thân theo hướng bơi |
| | Vây xòe | Khi RESPOND | |
| | Ăn | Mở miệng ba lần (scale 1.0 → 1.3 → 1.0 trong 0.25 s), đi lên mặt | |
| | Ngủ | Lắng xuống đáy, bơi 0.4 lần tốc độ | |
| Sứa | Đập chuông | ScaleY 0.82 ↔ 1.0 ở 0.6 Hz | |
| | Xúc tu | Sóng lệch pha ở 0.4 Hz | Cập nhật vị trí đỉnh của LineSegments |
| | Phát sáng | Emissive tăng 0.5 mỗi 6 s | |

Tần suất cập nhật: rùa LOD0 mỗi khung (30 Hz). LOD1, bể cá và bể sứa 15 Hz. Gọi invalidate() theo nhịp này khi có động vật trong khung nhìn (frameloop demand, DESIGN_V2 mục 9.5).

### 2.5 Ngân sách hình học và draw call

| Thực thể | Mức | Draw call | Tam giác (ước lượng) |
|---|---|---|---|
| Rùa | LOD0 | 2 (thân, mai, chân, đuôi; đầu, cổ, mắt) | ~1 000 |
| Rùa | LOD1 | 1 (gộp hết) | ~350 |
| Ốc | LOD0 | 2 | ~700 |
| Ốc | LOD1 | 1 | ~250 |
| Bể cá (3 con) | Instanced | 1 | ~750 |
| Bể sứa | Instanced và xúc tu | 2 | ~700 |

Trần draw call cho động vật: Thấp 3, Trung 10, Cao 14. Tam giác: tối đa 6 000 ở mức Trung. Bộ quản lý ở mục 2.6 bảo đảm không vượt trần. [ƯỚC LƯỢNG], đo ở mục 8.

**Xung đột ngân sách.** DESIGN_V2 mục 9.3 ghi tổng Trung là 199 draw call, đã gồm nhân vật, sát trần 200. Thêm 10 draw call cho động vật được 209. Cần một trong hai: nâng trần Trung lên 210 (đề xuất, mục 10 D8), hoặc giảm 9 draw call ở khu khác. Tài liệu này không tự cắt nội thất.

### 2.6 Giới hạn "tối đa 3 đầy đủ" và LOD

Mức hiển thị:
- LOD0: đầy đủ hoạt ảnh (mục 2.3, 2.4).
- LOD1: gộp một mesh, không hoạt ảnh chi tiết, chỉ lên xuống nhẹ.
- Ẩn: ngoài khung nhìn, hoặc xa hơn 40 m.

Quy tắc, chạy mỗi 0.5 s hoặc khi camera đổi nhiều:
1. Lấy các con đi lại nằm trong khung nhìn và trong 25 m.
2. Sắp theo khoảng cách. Ba con gần nhất thành LOD0. Có độ trễ 1 m để không nhấp nháy khi ranh giới.
3. Các con còn lại trong 25 đến 40 m thành LOD1, tối đa 3 con. Còn lại ẩn.
4. Bể luôn LOD0 khi nằm trong khung nhìn.
5. Nếu tổng draw call vượt trần: hạ LOD0 xa nhất xuống LOD1, rồi ẩn bể xa nhất.

Mức Thấp: không LOD0. Tối đa 2 con đi lại dạng LOD1 và 1 bể cá.

Giảm chuyển động: giữ vị trí, tắt thở, nháy mắt, sóng xúc tu, lắc đuôi. Tắt phản ứng giật mình. Không tắt phản hồi bằng chữ (INTERACTIONS mục 8).

---

## 3. Hành vi AI

### 3.1 Trạng thái

Rùa và ốc:

| Trạng thái | Vào khi | Thoát khi | Hành vi |
|---|---|---|---|
| IDLE | Đến đích, hết dwell | Hết dwell: rùa 4 đến 10 s, ốc 20 đến 40 s | Đứng yên, thở, nhìn theo người chơi |
| WALK | Chọn đích mới | Đến đích | Đi theo đường đã tính |
| SLEEP | Khung 22:00–06:00 ở ổ, hoặc cuối tuần ở ổ | Hết khung ngủ. Hoặc hunger ≥ 85, thirst ≥ 85, hoặc FEAR | Mắt nhắm. Nhu cầu tăng chậm |
| EAT | `feed` thành công | Hết 6 s | Vươn cổ, nhai. Giảm hunger |
| DRINK | `give_water` thành công (giai đoạn 3b) | Hết 4 s | Cúi đầu. Giảm thirst |
| SEEK_FOOD | hunger ≥ 70 và người chơi chưa cho ăn | Có `feed`, hoặc sau 60 s | Đi tới điểm pantry còn đi được gần nhất, đứng chờ. Đây là tín hiệu để nhân viên biết cần cho ăn |
| SEEK_WATER | thirst ≥ 70 (giai đoạn 3b) | Có `give_water`, hoặc sau 60 s | Như trên, điểm pantry |
| RESPOND | Nhận `pet`, `feed`, `give_water`, `call_back` hoặc `play` | Hết 2.5 s | Quay đầu về người chơi. Không di chuyển |
| RECALL | `call_back` thành công (giai đoạn 3b) | Đến ổ | Đi về ổ, 0.4 m/s |
| CHASE | `play` đã thả bóng trong 8 m (giai đoạn 3c) | Mang bóng về người chơi và thả xuống | Chạy tới bóng 0.45 m/s, nhặt, đi về người chơi |
| FEAR | Tiếng động ≥ 0.7 (giai đoạn 3b) | Hết 6 s | Chạy tới điểm cách nguồn ít nhất 6 m, rồi về WALK |

Cá: SWIM (mặc định), EAT, DRINK, RESPOND, SLEEP, FEAR. Sứa: PULSE, RESPOND, FEAR. Xem mục 3.6.

Trạng thái "bận" (không nhận `pet`): EAT, DRINK, FEAR, CHASE, RECALL. Khi SLEEP, `pet` chỉ ngáp, không tăng affection.

### 3.2 Thứ tự ưu tiên

Khi nhiều điều kiện cùng đúng, chọn theo thứ tự từ trên xuống:
1. FEAR
2. SLEEP đang diễn ra (chỉ thoát bằng điều kiện ở 3.1)
3. CHASE
4. RECALL
5. EAT hoặc DRINK đang diễn ra (không bị RESPOND ngắt)
6. RESPOND (ngắt WALK và IDLE)
7. SEEK_FOOD, SEEK_WATER
8. SLEEP theo lịch
9. WALK, IDLE

### 3.3 Chu kỳ ngày

Múi giờ Asia/Ho_Chi_Minh, theo DESIGN_V2 mục 2.2. Giờ làm 08:00–17:30 là mặc định, cần xác nhận (D3).

| Khung giờ | Rùa | Ốc | Bể cá | Bể sứa |
|---|---|---|---|---|
| 22:00–06:00 | Ngủ ở ổ. Nhu cầu tăng chậm | Ngủ trong vỏ | Lắng xuống đáy, bơi 0.4 lần | Đập chậm, 0.5 lần |
| 06:00–08:00 | Thức ở ổ 4 phút rồi IDLE | Thức, đứng yên | Bình thường | Bình thường |
| 08:00–17:30 (giờ làm) | WALK ở hành lang Nam và lounge | WALK chậm trong lounge phía Bắc | Bình thường | Bình thường |
| 17:30–21:00 (sau giờ làm) | WALK nhiều hơn, dwell ngắn hơn 50%. Cho phép chơi bóng (giai đoạn 3c) | WALK | Bình thường | Bình thường |
| 21:00–22:00 | RECALL về ổ | RECALL về ổ | Bình thường | Bình thường |
| Thứ Bảy, Chủ nhật | Ở ổ cả ngày, không WALK. Vẫn đói và khát, chỉ ăn uống khi có người | Ở ổ | Bình thường | Bình thường |

### 3.4 Nhu cầu: công thức

Mỗi tick mô phỏng 500 ms, tức Δ = 1/120 phút. Mọi giá trị nằm trong [0, 100].

Công thức cập nhật: need ← clamp(need + Δ × rate, 0, 100).

Tốc độ tăng (đơn vị: điểm mỗi phút):

| Nhu cầu | Thức | Ngủ | Cuối tuần | Ghi chú |
|---|---|---|---|---|
| hunger (đói) | +0.9 | +0.3 | Nhân 0.5 | Có từ MVP |
| thirst (khát) | +1.1 | +0.4 | Nhân 0.5 | Tắt trong MVP (rate = 0). Bật ở giai đoạn 3b cùng `give_water` |
| boredom (chán) | +0.6 | +0.05 | Nhân 0.5 | Giảm khi có `pet` hoặc `play` |
| affection (tình cảm) | −0.2 | 0 | Không đổi | Giảm dần, không dưới 0 |

Sự kiện (áp dụng khi hoàn tất):

| Sự kiện | hunger | thirst | boredom | affection |
|---|---|---|---|---|
| pet (vuốt ve) | 0 | 0 | −5 | +6 |
| feed (cho ăn xong) | −45 | 0 | −2 | +4 |
| give_water (đưa nước xong) | 0 | −50 | −2 | +4 |
| play (bóng về tới người chơi) | 0 | 0 | −30 | +5 |

Điều kiện từ chối (409, không tiêu thụ đồ):
- `feed` khi hunger < 20. Người chơi giữ thức ăn.
- `give_water` khi thirst < 20.
- `feed` vượt 6 lần mỗi giờ cho một con.

Mọi giá trị giới hạn trong [0, 100]. Tình cảm cao không tạo phần thưởng gameplay. Đây chỉ là số để hiển thị trạng thái vui.

Trạng thái khởi đầu: hunger 25, thirst 25, boredom 40, affection 50. Mốc tham chiếu: hunger từ 25 lên 70 mất khoảng 50 phút khi thức.

Cảm xúc hiển thị:

mood = clamp(0.35 × affection + 0.20 × (100 − hunger) + 0.20 × (100 − thirst) + 0.25 × (100 − boredom), 0, 100)

Ngưỡng biểu hiện:
- Biểu tượng đói: hunger ≥ 70. Khát: thirst ≥ 70. Chán: boredom ≥ 70. Vui: mood ≥ 70.
- Đi chậm (0.6 lần, trông ủ rũ): hunger ≥ 90 hoặc thirst ≥ 90. Vẫn đi, không dừng hẳn.
- Không chết, không biến mất. Giá trị chỉ bị chặn ở 100.

### 3.5 Di chuyển

Vùng đi lại (toạ độ bản vẽ):
- R1, hành lang Nam và sảnh: x 15.0–45.0, y 18.6–19.7.
- R2, lounge: x 46.5–57.9, y 4.7–21.0.
- Lối nối R1–R2 (x 45.0–46.5, y 18.6–19.7) [CHƯA XÁC MINH]. Nếu không thông, rùa và ốc chỉ đi trong R2 (xem D17).

Lưới và đồ thị:
- Lưới ô 0.5 m trong R1 và R2.
- Ô hợp lệ khi khoảng cách từ tâm ô tới mọi hộp va chạm ≥ bán kính động vật + 0.05 m.
- Hộp va chạm lấy từ collisionRects(objects) trong src/scene/layout.ts. Hàm này đã gồm footprint vật thể đặc và các mảnh solid của sofa, quầy. Module animals không import TypeScript trực tiếp, nên cần file JSON sinh từ build (mục 6.2).
- Bán kính: rùa 0.25 m, ốc 0.15 m.
- Cấm thêm: server_room và soc_room mở rộng 1.0 m, WC, lõi thang, khối phòng họp.
- Cạnh nối 8 hướng, không cắt góc. Cạnh hợp lệ khi đoạn thẳng không cắt hộp đã mở rộng.

Tìm đường:
- A* với heuristic Euclid.
- Làm mịn: bỏ điểm trung gian khi cạnh nối trực tiếp hợp lệ.
- Chọn đích mới: ngẫu nhiên trong bán kính 12 m, không trùng ba đích gần nhất. Trọng số R2 = 2, R1 = 1.
- Tính lại đường chỉ khi chọn đích mới, không tính mỗi tick.

Người chơi và động vật:
- Server biết vị trí người chơi từ presence của `world` (mục 4.1). Động vật không chặn người chơi trên server.
- Client đẩy người chơi ra khỏi bán kính 0.4 m quanh động vật. Chỉ là hiển thị, không gửi lên server.

Kẹt:
- Không tiến quá 0.3 m trong 15 s: chuyển sang RECALL.
- Vẫn kẹt sau 30 s: đặt về ổ, mờ dần 0.5 s. Đếm số lần, không ghi người dùng.

Tốc độ: rùa đi 0.22 m/s, chạy 0.45 m/s. Ốc đi 0.06 m/s.

### 3.6 Đặc tả cho cá và sứa

- Cá: đi trong hộp bơi 2.6 × 0.3 × 0.4 m. Đổi hướng khi chạm biên, và có 10% xác suất đổi hướng mỗi 2 s. Không ra khỏi bể. EAT: bơi lên mặt gần người chơi, rồi quay lại. Không dùng đồ thị đường đi. Dùng seed ngẫu nhiên.
- Sứa: không đi ngang. Đập chuông và trôi nhẹ trong bể. PULSE là trạng thái chính.

### 3.7 Tiếng động và sợ (giai đoạn 3b)

- Nguồn duy nhất: admin gọi `POST /api/world/animals/noise` với level từ 0.0 đến 1.0. Ví dụ: diễn tập báo cháy. Ghi nhật ký theo mục 8 INTERACTIONS (không có nội dung).
- Level ≥ 0.7: FEAR 6 s. Rùa chạy tới điểm cách nguồn ít nhất 6 m (nếu không xác định nguồn, chọn điểm xa nhất trong vùng). Cá lao 2 s. Sứa co nhanh 3 s.
- Level 0.4 (ví dụ pháo giấy khi vinh danh): chỉ rụt đầu 0.3 s. Không đổi trạng thái.
- FEAR không trừ nhu cầu nào và không gây hại.
- Người chơi chạy sát (≤ 1.2 m) chỉ có phản ứng cục bộ 0.3 s phía client. Không đổi trạng thái server.

---

## 4. Tương tác

### 4.1 Điều kiện chung

Áp dụng INTERACTIONS.md mục 1.3 cho mọi động từ:
- Phiên hợp lệ qua GET /api/auth/me. Tài khoản đã qua tour (onboard).
- Vai trò: employee, it, admin đều dùng được mọi động từ với động vật. Chỉ `admin/noise` cần admin.
- Chặn POST có Sec-Fetch-Site: cross-site (DECISIONS mục 5).
- Giới hạn 60 yêu cầu tương tác mỗi phút cho mỗi người (mặc định của INTERACTIONS). Vượt thì 429.
- Log theo INTERACTIONS mục 8: chỉ verb, actor_id, target, outcome, payload_hash. Không có số lượng đồ ăn, nước.

Khoảng cách: dùng vị trí presence của `world` (toạ độ x, z mới nhất của người chơi). Server không tin toạ độ do client gửi lên. Giả định này cần Pha 1 của `world` có toạ độ trong presence (mục 11).

Không có điểm, không có tiền. Không có cơ chế chống gian lận nặng vì không có phần thưởng.

### 4.2 Bảng tương tác

| Động từ (ID) | Đích | Khoảng cách | Điều kiện | Hồi chiêu | Phản hồi của động vật | Hiệu ứng nhu cầu | Ghi lịch sử | Giai đoạn |
|---|---|---|---|---|---|---|---|---|
| `pet` (vuốt ve) | Động vật | ≤ 1.5 m | Không ở trạng thái bận (mục 3.1). Khi SLEEP: ngáp, không tăng affection | 10 s cho cùng (người, con). Tối đa 12 lần mỗi phút mỗi con | Rùa: rụt đầu 0.5 s, mắt nheo, tiếng "hm" 180 → 150 Hz, 0.15 s. Cá: bơi tới kính trong 1.5 s, tiếng bong bóng (sóng sin 600 → 900 Hz, 80 ms). Ốc: rụt râu | boredom −5, affection +6 | Không | 3a |
| `pick` thức ăn (đề xuất, mục 4.3) | `pet_food_pantry` | ≤ 2.0 m | Tay trống | 10 s mỗi người | Không có phản hồi động vật. Người chơi có biểu tượng "đang mang" | Không | Không | 3a |
| `feed` (cho ăn) | Động vật | ≤ 1.5 m | Đang cầm `food`. hunger ≥ 20. Không quá 6 lần mỗi giờ cho một con | 20 s toàn cục mỗi con | Rùa: cổ vươn tới người chơi, nhai 6 s. Cá: mở miệng ba lần, lên mặt. Tiếng lạo xạo nhỏ, 40 ms (nhiễu trắng lọc thấp) | hunger −45, affection +4 | Có (không ghi số lượng) | 3a |
| `fill` (đã có) | `water_cooler_pantry` | ≤ 2.0 m | Tay trống | 5 s | Không | Không | Không | 2 |
| `give_water` (đưa nước) | Động vật | ≤ 1.5 m | Đang cầm `water_cup`. thirst ≥ 20 | 20 s toàn cục mỗi con | Rùa cúi đầu uống 4 s. Cá: nổi lên mặt 2 s | thirst −50, affection +4 | Không | 3b |
| `call_back` (gọi về chỗ) | Động vật cùng khu với người chơi | ≤ 15 m | Cùng khu (Z01 sảnh hoặc Z05 lounge, DESIGN_V2 mục 5.3). Không gọi vào server_room, soc_room | 20 s mỗi người | Rùa ngẩng đầu, huýt hai nốt 880 → 660 Hz, 0.2 s, rồi đi về ổ | Không | Không | 3b |
| `photo` (chụp ảnh) | Động vật | ≤ 3.0 m | Con đó trong khung nhìn | 5 s mỗi người (phía client) | Không đổi trạng thái. Đèn flash trắng 150 ms, tiếng "tách" 15 ms | Không | Không. Không gửi máy chủ | 3b |
| `pick` bóng (đề xuất, mục 4.3) | `ball_rack_games` hoặc `ball_1` đang nằm sàn | ≤ 2.0 m | Tay trống | 30 s mỗi người | Không | Không | Không | 3c |
| `play` (chơi bóng) | Động vật | ≤ 3.0 m | Đang cầm `ball`. Thả bóng trong 4 m quanh người chơi, nằm trong R1 hoặc R2 | 15 s toàn cục mỗi con | Rùa chạy 0.45 m/s tới bóng (nếu trong 8 m), nhặt, mang về, thả trong 1.5 m quanh người chơi. Tiếng "boing" 300 → 600 Hz, 120 ms khi nhặt | boredom −30, affection +5 khi bóng về tới người chơi | Không | 3c |

Ghi chú:
- `play` dùng chung ID với trò chơi (INTERACTIONS mục 2.1, dòng 22). Phân biệt theo loại đích: object là trò chơi, animal là bóng.
- Động vật không đồng ý được, nên không có bước hỏi (INTERACTIONS mục 6). Thay vào đó có giới hạn tần suất và tổng tác động lên một động vật.
- Không có động từ gây hại. Không có động từ đánh, kéo, nhấc hay đuổi bắt động vật.

### 4.3 Thức ăn, nước và bóng: tay cầm

Tay cầm (INTERACTIONS mục 1.3): mỗi người cầm tối đa một món. Món tự rơi sau 10 phút. Hai món mới cần bổ sung vào danh sách:
- `food`: thức ăn cho rùa và cá. Lấy từ `pet_food_pantry` bằng `pick`.
- `ball`: bóng chơi với rùa. Lấy từ `ball_rack_games` hoặc từ sàn bằng `pick`.
- `water_cup` đã có, lấy từ `water_cooler_pantry` bằng `fill`.

Vật thể mới đề xuất (đưa vào INTERACTIONS mục 4 khi cập nhật, không sửa trong tài liệu này): `pet_food_pantry` (khe pantry, (54.0, 21.5) bản vẽ), `ball_rack_games` (sát games_corner, (51.8, 11.6) bản vẽ).

Bóng là một vật thể dùng chung `ball_1`, chỉ có một quả trong toàn tầng. Trạng thái: RACK (trên giá), HELD (người chơi cầm), FLOOR (nằm tại toạ độ), ANIMAL (con vật đang mang).
- Nếu không ai nhặt và con vật không nhặt được trong 60 s sau khi thả, bóng về giá.
- Chỉ rùa chơi bóng. Ốc và sứa không chơi bóng.

### 4.4 Chụp ảnh (chỉ trên máy người dùng)

- Chụp canvas của renderer trong cùng một khung hình: gọi render rồi toDataURL trong một tác vụ. Không cần preserveDrawingBuffer.
- Ảnh hiện trong khung xem trước phủ trên màn hình, có nút đóng. Không gửi lên server. Không lưu localStorage hay IndexedDB. Không có nút tải về. Đóng khung là mất ảnh.
- Cảnh 3D có thể chụp cả nhân viên khác. Khung xem trước ghi dòng: "Ảnh chỉ hiển thị trên máy bạn và không được lưu." Người dùng vẫn có thể chụp màn hình bằng hệ điều hành. Không thể ngăn việc này.
- Không có API và không có nhật ký (INTERACTIONS mục 6: ghi lịch sử "Không").

### 4.5 Giới hạn tần suất

- Mỗi người: 60 yêu cầu tương tác mỗi phút (INTERACTIONS mục 1.3). Vượt thì 429 kèm retryAfterMs.
- Mỗi cặp (người, con): `pet` 10 s.
- Mỗi con: `feed` và `give_water` 20 s toàn cục. `feed` tối đa 6 lần mỗi giờ. `play` 15 s toàn cục.
- Client hiển thị đếm ngược nhỏ theo retryAfterMs.

### 4.6 Phản hồi tức thì

- Client chạy hoạt ảnh và âm thanh ngay khi bấm (cục bộ, dưới 100 ms), không chờ server.
- Nếu server từ chối (409, 422, 429), client hủy hoặc đảo phản hồi trong 0.5 s. Ví dụ: rùa thôi cúi đầu, và người chơi giữ lại thức ăn.

---

## 5. Đồng bộ đa người

### 5.1 Quyết định: server quyết định, client nội suy

Chọn server làm nguồn sự thật, vì:
- Mọi người phải thấy cùng một con vật, cùng chỗ, cùng nhu cầu. Hành động của người này phải thấy được với người khác.
- Hồi chiêu và giới hạn cần một nơi lưu trạng thái, để không lách bằng cách mở nhiều tab.
- Số thực thể nhỏ (tối đa 8), tính toán nhẹ. Chi phí server gần như không đáng kể.
- Client tự chạy cùng logic với seed chung sẽ lệch nhau sau mỗi lệnh gửi. Không chọn.

### 5.2 Luồng

- Mô phỏng: tick 500 ms (2 Hz) trên `world`. Tick chỉ chạy khi có ít nhất một client kết nối.
- Sự kiện `animal.changed` qua SSE chung của `world` (`GET /api/world/stream`): gửi mỗi 2 s, chứa toàn bộ 8 thực thể tối đa. Gửi ngay khi có kết nối mới. Đây là kênh riêng, không gộp vào presence của người (INTERACTIONS mục 6).
- Sự kiện `animal.react`: gửi ngay khi có phản hồi, không chờ chu kỳ 2 s. Dạng {id, k: "pet" | "feed" | "give_water" | "call_back" | "play" | "respond" | "fear"}. Không có id người chơi.
- Dự phòng: nếu EventSource lỗi 3 lần liên tiếp, client gọi GET /api/world/animals mỗi 4 s. Có version để trả 304 khi không đổi.
- SSE theo mẫu services/display/src/sse.js: heartbeat 25 s, retry 3 s, không có middleware nén, header X-Accel-Buffering: no.

### 5.3 Dữ liệu sự kiện

```json
{"v":1,"tick":1842,"animal.changed":[
  {"id":"rua-1","s":"WALK","g":[25.0,6.5,22.5,6.2,0.0,4.1],"n":[62,31,48,58],"m":64},
  {"id":"ca-1","s":"SWIM","g":[24.1,2.7,24.9,2.8,0.0,2.0],"n":[40,35,30,70],"m":72}
]}
```

- g = [x0, z0, x1, z1, s0, s1]: đoạn đang đi (toạ độ world). s0 và s1 là số giây tính từ lúc tạo sự kiện (có thể âm).
- n = [hunger, thirst, boredom, affection], làm tròn số nguyên. m = mood.
- Kích thước: khoảng 110 byte mỗi con, khoảng 1 KB cho 8 con.
- Không gửi: vị trí người chơi, id người chơi, nhật ký, mesh, texture.

### 5.4 Nội suy phía client

- Không đồng bộ đồng hồ. Client ghi thời điểm nhận sự kiện là t = 0. Mỗi khung: elapsed = (now − tNhận) / 1000. Tiến độ p = clamp((elapsed − s0) / (s1 − s0), 0, 1). Vị trí = lerp(điểm đầu, điểm cuối, p).
- Khi sự kiện mới đổi đoạn, trộn 300 ms giữa vị trí đang hiện và vị trí mới để không giật.
- Sai số do mạng: vài trăm ms × 0.22 m/s, khoảng vài cm. Chấp nhận được.
- Hướng quay theo vector đoạn, quay mượt trong 0.2 s.
- Mất kết nối: đóng băng vị trí, hoạt ảnh dần về IDLE, không hiện biểu tượng nhu cầu. Tránh báo động giả.

### 5.5 Băng thông ước lượng cho 500 người online

| Thành phần | Cách tính | Ước lượng |
|---|---|---|
| `animal.changed` qua SSE | 1 KB × 0.5 lần/s × 500 | ~250 KB/s (~2 Mbps) |
| `animal.react` | ~100 byte × ~20 sự kiện mỗi phút toàn tầng | < 1 KB/s |
| Dự phòng polling, giả sử 10% client | 50 client × (1.4 KB / 4 s) | ~18 KB/s |
| Tổng đỉnh cho động vật | | ~270 KB/s (~2.2 Mbps) |

Trường hợp xấu nhất, cả 500 client đều polling: 500 × 1.4 KB / 4 s ≈ 175 KB/s, cộng khoảng 125 yêu cầu/s. Vẫn trong khả năng của một tiến trình Node.

Luồng SSE của `world` còn chứa presence và các yêu cầu khác. Phần đó chưa ước lượng ở đây, sẽ tính trong INTERACTIONS mục 9.

Tải CPU mô phỏng: 2 Hz, 8 thực thể. A* chỉ chạy khi chọn đích, mỗi 4 đến 40 s mỗi con. [ƯỚC LƯỢNG] dưới 1 ms mỗi tick.

### 5.6 Giới hạn toàn cục

| Mục | Giới hạn |
|---|---|
| Thực thể động vật toàn tầng | Tối đa 8. MVP: 2 rùa và 1 bể cá (3 con) |
| Rùa | 2 |
| Ốc | 2 (giai đoạn 3b) |
| Bể cá | 2, mỗi bể 3 con |
| Bể sứa | 1 (giai đoạn 3c) |
| Đi lại tổng (rùa và ốc) | Tối đa 4 con cùng lúc |
| Bóng | Một quả (`ball_1`) |
| Thức ăn và nước đang mang | Tối đa 1 món mỗi người, theo INTERACTIONS mục 1.3 |
| Sự kiện `animal.react` | Tối đa 50 mỗi giây toàn `world`. Vượt thì bỏ, không báo lỗi cho người dùng |
| Kết nối SSE | Theo giới hạn chung của `world` |

---

## 6. Dữ liệu và dịch vụ

### 6.1 Quyết định: module `animals` trong dịch vụ `world` (cổng 3008)

INTERACTIONS.md đã giao cho `world` các phần việc có liên quan: presence, tay cầm, trạng thái vật thể dùng chung, SSE, log tối thiểu, và trạng thái động vật (bảng `animal_state`, sự kiện `animal.changed`, mục 6). Tạo dịch vụ `animals` riêng sẽ trùng các phần đó.

| Tiêu chí | `world` (3008), module animals | Dịch vụ `animals` riêng (3009) |
|---|---|---|
| Phù hợp INTERACTIONS.md | Có: đúng bảng `animal_state` và sự kiện `animal.changed` | Lệch. Phải đồng bộ hai nơi |
| Presence (vị trí người chơi) | Có sẵn trong `world`. Dùng trực tiếp cho kiểm khoảng cách | Phải gọi `world` hoặc tự theo dõi vị trí |
| Tay cầm (`food`, `water_cup`, `ball`) | Có sẵn: mục 1.3 INTERACTIONS | Phải nhân bản cơ chế |
| SSE và xác thực | Một luồng SSE chung. Một lần kiểm phiên | Hai luồng SSE cho cùng một client |
| Log tối thiểu | Có sẵn: interaction_log | Phải nhân bản |
| Lỗi lan | Lỗi module có thể ảnh hưởng `world` | Cách ly hoàn toàn |
| Tắt tính năng | Tắt bằng cờ cấu hình ANIMALS_ENABLED. Không dừng container | Dừng một container |
| Phụ thuộc tiến độ | Phải chờ `world` Pha 1 xong | Không phải chờ |
| Chi phí | Không thêm container | Thêm một container, [ƯỚC LƯỢNG] khoảng 50 MB RAM |

Chọn `world`, module `animals`. Lý do chính: INTERACTIONS.md đã chọn như vậy, và mọi thứ động vật cần đều đã nằm trong `world`. Điểm yếu là `world` lớn hơn và động vật phụ thuộc tiến độ `world`. Giảm rủi ro bằng ba biện pháp:
- Module `animals` là hàm thuần (không I/O) trong sim, có vòng tick riêng và có cờ ANIMALS_ENABLED. Khi tắt, các thành phần khác của `world` không đổi.
- Không đổi API của presence, tay cầm hay SSE chung để phục vụ động vật.
- Nếu về sau tải của `world` thành vấn đề, sim có thể tách ra thành dịch vụ riêng với cùng hợp đồng API (mục 6.3). Chi phí là nhân bản presence và tay cầm.

Trạng thái cổng trong repo: 3001 auth, 3002 it, 3003 games, 3004 karaoke, 3005 events, 3006 display, 3007 plants (services/plants/src/config.js). 3008 là world (INTERACTIONS.md, chưa có trong repo).

### 6.2 Cấu trúc đề xuất (trong `world`)

```
services/world/src/animals/
  sim/nav.js        lưới, đồ thị, A*, làm mịn
  sim/needs.js      công thức nhu cầu và mood
  sim/states.js     máy trạng thái, ưu tiên, bóng
  sim/schedule.js   khung giờ, múi giờ Asia/Ho_Chi_Minh, cuối tuần
  sim/rng.js        seed ngẫu nhiên
  data/collision.json   hộp va chạm, sinh bằng script từ it.json và layout.ts
  service.js        vòng tick 2 Hz, bộ nhớ trạng thái, cooldown
  persist.js        ghi animal_state mỗi 60 s
  routes.js         các route mục 6.3
services/world/test/animals/*.test.js   node --test, không cần npm install
```

Nếu không có bước sinh collision.json, cách thay thế là sao chép tay hộp va chạm. Cách đó dễ lệch, nên không khuyến nghị.

### 6.3 API (đề xuất, thêm vào hợp đồng của `world`)

Gốc: /api/world. Cần đăng nhập. Mọi POST nhận JSON, body tối đa 1 KB, chặn Sec-Fetch-Site: cross-site.

| Phương thức | Đường dẫn | Mục đích | Ghi chú |
|---|---|---|---|
| GET | /api/world/stream | SSE chung. Gồm `animal.changed` mỗi 2 s và `animal.react` ngay | Gửi trạng thái đầy đủ khi mở kết nối |
| GET | /api/world/animals | Snapshot (dự phòng polling) | ETag theo version |
| POST | /api/world/animals/:id/actions | Hành động với động vật | Body {verb, ...}. verb thuộc {pet, feed, give_water, call_back, play} |
| POST | /api/world/objects/:id/actions | Nhặt đồ | Body {verb: "pick"}. Đối tượng: pet_food_pantry, ball_rack_games, ball_1. Đây là đường chung của INTERACTIONS mục 9 |
| POST | /api/world/animals/noise | Phát tiếng động (giai đoạn 3b) | Chỉ admin. Body {level} |

`photo` không có API. Đây là thao tác cục bộ.

Mã trả về:

| Mã | Ý nghĩa |
|---|---|
| 204 | Thành công |
| 400 | Dữ liệu sai |
| 401 | Chưa đăng nhập |
| 403 | Không đủ quyền (noise) |
| 404 | Không có động vật hoặc vật thể này |
| 409 | Điều kiện không đạt: không cầm đúng món, hunger hoặc thirst dưới ngưỡng, bận, ngoài khu |
| 422 | Ngoài khoảng cách |
| 429 | Hồi chiêu hoặc vượt giới hạn. Kèm retryAfterMs |

Vai trò admin lấy từ auth/me (DESIGN_V2 mục 5.7 định nghĩa employee, it, admin).

### 6.4 Lưu trữ

- Bảng `animal_state` trong world.db (INTERACTIONS mục 6): id, species, state, needs_json, home_zone, updated_at.
- Bảng `objects` hoặc tương đương (đã có trong INTERACTIONS mục 9, chưa viết): trạng thái của `ball_1`.
- Ghi `animal_state` mỗi 60 s và khi có thay đổi quan trọng (đổi trạng thái). Khởi động lại `world`: nạp lại trạng thái. Mất tối đa 60 s thay đổi.
- Không có bảng mới cho tương tác động vật. Lịch sử dùng interaction_log theo INTERACTIONS mục 8.
- Trạng thái trong bộ nhớ: không quá 8 thực thể, cooldown theo TTL.

### 6.5 Gateway và compose

- Không thêm container. Dùng service `world` đã có kế hoạch ở cổng 3008.
- deploy/nginx/gateway.conf: location /api/world cần proxy_buffering off, proxy_cache off, proxy_read_timeout 3600s, như block /api/display. Chi tiết do INTERACTIONS mục 9 quyết định.

---

## 7. An toàn và phúc lợi

- Không có cơ chế gây hại. Không có hành động đánh, kéo, nhấc hay đuổi bắt động vật. Không có chỉ số chết hoặc biến mất.
- Bóng chỉ là vật thể dùng chung. Không va chạm để gây hại. Thả bóng trong 4 m quanh người chơi, nằm trong vùng đi lại. Không thả vào bể.
- Không tính điểm, không tiền, không bảng xếp hạng ai chăm nhiều nhất, không hiện tên người vừa cho ăn (INTERACTIONS mục 8).
- Đói, khát, chán chỉ là biểu hiện để nhân viên biết cần chăm. Giá trị bị chặn trong [0, 100]. Không có trạng thái thất bại.
- Vui chỉ hiển thị. Không tạo lợi ích gameplay.
- Nhắc vệ sinh: sau khi chạm rùa, ốc hoặc bể, hiện một dòng nhỏ "Nhớ rửa tay". Tối đa một lần mỗi 10 phút mỗi người. Không chặn tương tác.
- Dữ liệu cá nhân: vị trí presence là dữ liệu tạm, không ghi log, không đưa vào sự kiện động vật. Không lưu ảnh chụp. Log chỉ có các cột cho phép của INTERACTIONS mục 8.
- Quyền admin: `noise` chỉ dành cho vai trò admin.
- Âm thanh: tổng hợp bằng Web Audio, không dùng file, không nhạc. Mặc định tắt. Người dùng bật trong cài đặt. Âm lượng thấp.
- Giảm chuyển động: tắt thở, nháy, sóng xúc tu, lắc đuôi. Không chạy nhanh. Tắt giật mình. Không tắt phản hồi bằng chữ (INTERACTIONS mục 8).
- Trợ năng: panel "Động vật" liệt kê văn bản (tên, trạng thái, nhu cầu bằng chữ). Không chỉ dựa vào màu hay biểu tượng.
- Mất kết nối: đóng băng, không hiện cảnh báo đói giả.
- Không đưa nội dung tôn giáo hay chính trị vào (DESIGN_V2 câu hỏi 5, INTERACTIONS mục 8).

---

## 8. Kiểm chứng

### 8.1 Danh sách kiểm tra hành vi

| Mã | Hạng mục | Tiêu chí đạt | Cách kiểm (không cần giao diện) |
|---|---|---|---|
| B1 | Không đi xuyên vật cản | 0 cạnh hoặc đoạn đường cắt hộp đã mở rộng | Node test: duyệt mọi cạnh đồ thị và mọi đoạn WALK trong 1 000 mô phỏng 24 giờ, seed cố định. Đếm vi phạm |
| B2 | Không vào khu cấm | 0 ô hoặc đoạn trong server_room, soc_room, WC, lõi, phòng họp | Test trên đồ thị và trên các đoạn đường |
| B3 | Liên thông | Mọi ô R2 liên thông. Nếu R1 và R2 không liên thông, test in cảnh báo và danh sách thành phần | BFS trên đồ thị |
| B4 | Không kẹt | Mỗi con đến đích hoặc đổi trạng thái trong 60 s. Không con nào kẹt quá 30 s | Mô phỏng 100 ngày ảo |
| B5 | Nhu cầu trong khoảng | 0 ≤ giá trị ≤ 100. Không NaN. mood trong [0, 100] | Mô phỏng 100 ngày ảo, kiểm mọi tick |
| B6 | Đúng chu kỳ ngày | Đúng trạng thái theo khung giờ và cuối tuần | Mô phỏng với đồng hồ giả |
| B7 | Hồi chiêu, khoảng cách, từ chối | `pet` quá nhanh nhận 429. `feed` khi hunger < 20 nhận 409 và không mất thức ăn. Gọi từ xa nhận 422 | Test API với client giả và presence giả |
| B8 | Số động vật đầy đủ ≤ 3 | Với 10 000 camera ngẫu nhiên, số LOD0 ≤ 3 | Node test dùng Frustum của three.js, không cần WebGL |
| B9 | Draw call và tam giác | Trần draw call: 3 (Thấp), 10 (Trung), 14 (Cao). Tam giác ≤ 6 000 ở Trung | Đếm Mesh và InstancedMesh hiển thị theo LOD trong scene graph, không render |
| B10 | Phản hồi trong 500 ms | POST p95 dưới 150 ms trên LAN. `animal.react` tới client khác p95 dưới 300 ms. Phản hồi cục bộ dưới 100 ms | Script Node: 500 kết nối SSE giả, 50 POST mỗi giây, đo thời gian |
| B11 | Băng thông | Dưới 300 KB/s cho 500 client (phần animals) | Đo số byte `animal.changed` và `animal.react` trong 60 s |
| B12 | Không rò rỉ dữ liệu | Không có id người chơi hay vị trí trong sự kiện động vật. Log đúng các cột INTERACTIONS mục 8 | Test regex trên sự kiện và log |
| B13 | Bộ nhớ ổn định | Heap không tăng sau 24 giờ mô phỏng | Đo heap trong test |
| B14 | Khôi phục | Khởi động lại `world`: trạng thái nạp từ `animal_state`, mất tối đa 60 s thay đổi | Test ghi, dừng, nạp lại |

### 8.2 Kiểm thị giác (sau khi có giao diện)

- Chụp cảnh bằng trình duyệt tự động ở ba khoảng cách (3, 8, 15 m) cho mỗi loài. Kiểm: đọc được hình dáng, không lẫn với bàn ghế, không chắn lối đi.
- Đo FPS P50 và P95 trên ba máy, theo DESIGN_V2 mục 9.7.

### 8.3 Kiểm gameplay nội bộ

- Mời một nhóm nhỏ nhân viên thử. Ghi phản hồi về cảm giác đáng yêu và có làm phiền không. Không thu dữ liệu cá nhân.

---

## 9. Lộ trình

Các pha bám theo INTERACTIONS.md mục 10 (Pha 3: người với động vật). Phụ thuộc: Pha 1 của `world` (presence có toạ độ, SSE, tay cầm, `animal_state`).

| Giai đoạn | Nội dung | Điều kiện hoàn thành |
|---|---|---|
| 3a (MVP) | Rùa và bể cá (1 bể, 3 con). `pet` và `feed`, kèm `pick` thức ăn ở `pet_food_pantry`. Nhu cầu đói và chán (thirst tắt). Chu kỳ ngày rút gọn. `animal.changed` mỗi 2 s. Bộ quản lý LOD | B1 đến B5, B7, B8, B10 đạt |
| 3b | `give_water` (kèm `fill`), `call_back`, `photo` (cục bộ), ốc sên, tiếng động (admin, level 0.4 và 0.7), giảm chuyển động | B9, B11, B12, B14 đạt |
| 3c | `play` với `ball_1`, `pick` bóng, sứa, bể cá thứ hai | B13 đạt. Kiểm thị giác (8.2) đạt |
| Pha 4 (INTERACTIONS) | Hiệu ứng phụ: pháo giấy khi vinh danh, hạt bụi, hiệu ứng nâng cao | Theo INTERACTIONS mục 10 |

---

## 10. Mặc định đã chọn cho điểm mơ hồ

| Mã | Điểm mơ hồ | Mặc định đã chọn |
|---|---|---|
| D1 | Loài có lông (mèo, chó, thỏ, chim) | Loại. Chỉ đưa lại khi chủ dự án ghi quyết định khác |
| D2 | Rùa có rủi ro vi khuẩn | Đưa vào, kèm nhắc rửa tay |
| D3 | Giờ làm | 08:00–17:30, Asia/Ho_Chi_Minh |
| D4 | Cuối tuần | Không đi dạo, ở ổ |
| D5 | Mô hình | Procedural, không GLB |
| D6 | Đồng bộ | Server quyết định. `animal.changed` mỗi 2 s qua SSE của `world`. Dự phòng polling 4 s |
| D7 | Dịch vụ | Module `animals` trong `world`, cổng 3008. Không tạo dịch vụ riêng |
| D8 | Trần draw call mức Trung | Nâng từ 200 lên 210. Động vật được 10 |
| D9 | Vị trí | Toạ độ mục 1.4. Kiểm bằng script trước khi thêm vào zones |
| D10 | Âm thanh | Tắt mặc định. Tổng hợp. Không nhạc |
| D11 | Chụp ảnh | Chỉ cục bộ. Không tải về, không gửi |
| D12 | Nguồn thức ăn, nước, bóng | Thức ăn và bóng: `pick`. Nước: `fill`. Tay cầm tối đa 1 món, 10 phút |
| D13 | Điểm và tiền | Không có |
| D14 | Tên hiển thị | Theo loài: Rùa, Cá cảnh, Ốc sên, Sứa. Chưa đặt tên riêng |
| D15 | Khởi động lại | Nạp từ `animal_state`, ghi mỗi 60 s |
| D16 | Mất kết nối | Đóng băng, không cảnh báo nhu cầu |
| D17 | Lối R1–R2 | Coi là thông. Nếu test B3 báo không thông, rùa và ốc chỉ đi trong R2 |
| D18 | Khung ngủ | 22:00–06:00, không phụ thuộc người chơi |
| D19 | Tiếng động (admin) | Chỉ vai trò admin |
| D20 | Trần số thực thể | 8 toàn tầng |
| D21 | Giới hạn `feed` | 6 lần mỗi giờ cho mỗi con. `feed` khi hunger < 20 bị từ chối |
| D22 | Chơi bóng | Chỉ rùa. Một quả bóng toàn tầng. Bóng không về giá trong 60 s nếu không ai nhặt |

---

## 11. Chưa xác minh và rủi ro

- Quy định nuôi, nhập và bố trí động vật tại văn phòng Việt Nam: [CHƯA XÁC MINH]. Thiết kế này chỉ áp dụng cho nhân vật ảo. Nếu có sự kiện với vật thật, hỏi bộ phận hành chính trước.
- Phân loại "gây dị ứng" và "nguy hiểm" (mục 1) dựa trên kiến thức phổ thông. Chưa đối chiếu tài liệu y tế nội bộ của ngân hàng.
- Ngân sách draw call: DESIGN_V2 mục 9.3 ghi 199 ở mức Trung. Động vật thêm 10 đẩy lên 209. Cần chủ dự án chốt (D8).
- Phụ thuộc `world` (INTERACTIONS mục 9, chưa viết): presence phải có toạ độ (x, z) của người chơi, cập nhật khoảng 1 lần mỗi 0.5 s khi di chuyển. Nếu presence chỉ có khu hoặc phòng, phải bổ sung. Không có toạ độ thì không kiểm được khoảng cách, nên động vật không dùng được.
- INTERACTIONS.md đang viết, dừng ở mục 8. Mục 9 (kiến trúc `world`), mục 10 (pha) và mục 11–12 (mặc định, mâu thuẫn) chưa có tại thời điểm viết. Cần đối chiếu lại khi hoàn thành.
- Bản vẽ chưa có tỷ lệ (FLOORPLAN_IT.md). Toạ độ mục 1.4 là ước lượng. Chưa biết lối nối R1–R2 (x 45–46.5). Chưa có toạ độ bảng vinh danh trong lounge. Trước khi đặt thêm vật thể quanh lounge, cần toạ độ đó.
- Vùng dự phòng (14.5–29.9 × 0.2–15.2): chưa rõ lối vào. MVP không cho đi lang thang ở đó.
- Hộp va chạm cho module animals: chưa có cơ chế sinh JSON từ src/scene/layout.ts (TypeScript). Cần bước build hoặc sao chép có kiểm soát.
- Không có nguồn GLB động vật đã xác minh trong ASSET_SOURCES.md. MVP không dùng GLB.
- Mọi số có [ƯỚC LƯỢNG] (draw call, tam giác, CPU, băng thông) phải đo lại trên máy thật theo DESIGN_V2 mục 9.7.
- Âm thanh tổng hợp: không cần license. Chưa kiểm tra tương thích trình duyệt nội bộ.
- Tên loài trong giao diện: dùng tên chung, không trùng tên sản phẩm hay thương hiệu.
- Giờ làm 08:00–17:30 chưa được xác nhận.

### 11.1 Đề nghị bổ sung cho INTERACTIONS.md (không sửa file đó trong tài liệu này)

- Mục 1.3, Tay cầm: thêm `food` và `ball` vào danh sách món cầm được.
- Mục 2.3: ghi rõ `pet`, `feed`, `give_water`, `call_back`, `photo`, `play` theo mục 4.2 của tài liệu này. Thêm `pick` cho thức ăn và bóng (mở rộng đích của động từ 17 `pick`).
- Mục 4 (vật thể bổ sung): `pet_food_pantry`, `ball_rack_games`, `ball_1` (đối tượng trạng thái, không phải vật thể cố định).
- Mục 6: đổi khoảng cách `play` theo mục 4.2 (ba mét tới động vật, bóng thả trong bốn mét quanh người chơi). Đổi `photo` thành ba mét, 5 s. Đổi `pet` thành 10 s cho cùng cặp người và động vật. Đổi `feed` thành hunger tối thiểu 20 và 6 lần mỗi giờ. Đổi `call_back` thành cùng khu (Z01 hoặc Z05) và tối đa 15 m, thay cho "trong khu của mình".
- Mục 9: thêm `animal_state` và trạng thái `ball_1`. Thêm sự kiện `animal.changed` và `animal.react` vào danh sách SSE.
