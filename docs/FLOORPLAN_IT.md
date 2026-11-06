# Mặt bằng khối CNTT · đặc tả cho 3D

Nguồn: ảnh mặt cắt khối CNTT do người dùng cung cấp (bản vẽ CAD, ~934×505 px). Các kích thước dưới đây là ƯỚC LƯỢNG từ ảnh, cần đối chiếu bản vẽ gốc có tỷ lệ.

## Hệ tọa độ và tỷ lệ

- Hiệu chỉnh: 1 m ≈ 15 px ảnh (lấy từ khung "Diện tích dự phòng 227.2 m²" ≈ 15 × 15 m).
- Gốc (0,0) = góc trên-trái của tòa nhà trên ảnh. Trục x sang phải, trục y xuống dưới (hướng Bắc ở trên).
- Kích thước sàn: ≈ 58 m × 30 m.
- Quy đổi sang 3D (three.js): `worldX = x - 29`, `worldZ = y - 15`. Mặt đất y = 0. Phía Bắc (y nhỏ) có worldZ âm.
- Tất cả toạ độ dưới đây là mét, theo hệ gốc trên.

## Lõi giao thông (không đi xuyên qua được trong 3D)

| Id | Loại | x0–x1 | y0–y1 | Ghi chú |
|---|---|---|---|---|
| core_st1 | Thang bộ | 5.6–8.5 | 1.2–3.9 | Góc Tây-Bắc, cạnh kho thiết bị IT |
| core_st2 | Thang bộ | 45.5–51.5 | 0.5–3.5 | Góc Đông-Bắc |
| core_lift1 | Thang máy + thang bộ | 15.5–20.5 | 15.5–18.5 | Lõi giữa-Nam |
| core_lift2 | Thang máy | 30.5–35.9 | 15.5–18.5 | Lõi giữa |
| core_st3 | Thang bộ | 38.5–44.5 | 15.5–18.5 | Lõi Đông-Nam |
| core_lift3 | Thang máy phụ | 35.9–39.9 | 11.1–13.7 | Cạnh khối WC |

## Phòng vệ sinh, tiện ích

| Id | Loại | x0–x1 | y0–y1 | Ghi chú |
|---|---|---|---|---|
| wc_block | Nhà vệ sinh | 35.9–45.1 | 5.9–11.9 | Nam / Nữ / khuyết tật, chỉ thông tin |
| pantry | Pantry và khu nghỉ | 51.0–57.0 | 22.0–28.5 | Góc Đông-Nam, chỉ thông tin |
| lounge | Sảnh mở, lounge | 46.5–57.9 | 4.7–21.0 | Khu vực Đông lớn, có bảng vinh danh (kudos) |

## Khu dự phòng và khu làm việc

| Id | Loại | x0–x1 | y0–y1 | Ghi chú |
|---|---|---|---|---|
| reserved | Dự phòng phát triển | 14.5–29.9 | 0.2–15.2 | Nhãn gốc: "Diện tích dự phòng phát triển 227.2 m²". Không có bàn |
| open_north | Khu làm việc phía Bắc | 30.5–45.1 | 0.5–5.2 | Đặt tường NOC ở mép Bắc |
| desk_L1 | Bàn làm việc | 2.5–8.5 | 4.9–9.5 | Squad Core integration |
| desk_L2 | Bàn làm việc | 2.5–8.5 | 9.9–14.5 | Squad Data & BI |
| desk_L3 | Bàn làm việc | 2.5–8.5 | 15.9–18.9 | Squad Security (SOC) |
| desk_B1 | Bàn làm việc | 2.5–7.9 | 19.9–24.5 | Squad Mobile (GP.DigiPlus) |
| desk_B2 | Bàn làm việc | 8.5–13.9 | 19.9–24.5 | Squad Backend & API |
| desk_B3 | Bàn làm việc | 15.2–19.9 | 19.9–24.5 | Squad Core integration |
| desk_B4 | Bàn làm việc | 20.5–25.1 | 19.9–24.5 | Squad Data & BI |
| desk_B5 | Bàn làm việc | 26.5–31.1 | 19.9–24.5 | Squad Hạ tầng |
| desk_B6 | Bàn làm việc | 32.5–37.1 | 19.9–24.5 | Squad Vận hành |
| desk_B7 | Bàn làm việc | 38.5–44.5 | 19.9–24.5 | Squad Product / QA |

Ghi chú: tên squad là gợi ý, người dùng có thể đổi. Chỗ ngồi mục tiêu ≈ 500 người, khoảng 480–500 chỗ:
- Bảy cụm squad phía Nam: mỗi cụm 4 hàng × 12 chỗ = 48 chỗ (336 chỗ).
- Ba cụm bên trái (desk_L1, L2, L3): mỗi cụm khoảng 36 chỗ (108 chỗ). Được phép điều chỉnh số hàng để vừa diện tích.
- Khu Bắc (open_north): 4 hàng × 10 chỗ = 40 chỗ.
Mỗi khối bàn là một `desk` đa hàng (instancing), khoảng cách hàng và chỗ 1.2 m.

## Phòng họp, phòng chức năng

| Id | Loại | x0–x1 | y0–y1 | Ghi chú |
|---|---|---|---|---|
| mr1 | Phòng họp 1 (8 chỗ) | 8.5–13.5 | 10.5–15.2 | Đặt phòng qua API |
| mr2 | Phòng họp 2 (10 chỗ) | 4.9–9.2 | 25.5–28.5 | Đặt phòng qua API |
| mr3 | Phòng họp 3 (12 chỗ) | 9.5–13.9 | 25.5–28.5 | Đặt phòng qua API |
| server_room | Phòng máy chủ (kính, hạn chế) | 21.3–24.1 | 25.5–28.5 | Chỉ IT và admin xem. Không có nút điều khiển |
| soc_room | Phòng SOC | 26.5–31.1 | 25.5–28.5 | Chỉ IT và admin. Chỉ tóm tắt |
| service_desk | Quầy Service Desk | 23.0–27.5 | 16.0–17.2 | Đặt ngay trong sảnh thang máy, sát lối vào chính |
| entrance | Lối vào chính (sảnh giữa) | 23.5–26.5 | 18.4–18.8 | Cửa rộng 3 m, mép Nam của sảnh. Nhân vật xuất hiện ở (25.0, 17.0) |
| notice_board | Bảng thông báo | 15.5–20.5 | 14.5–15.2 | Dán sát tường lõi giữa |

## Tường và cột

- Tường ngoài: 0.3 m, cao 3.2 m.
- Tường ngăn phòng họp và phòng máy chủ: 0.15 m, cao 2.8 m (vẽ dạng kính trong 3D).
- Cột: ô vuông 0.6 m đặt ở mép các khối bàn. Không cần vẽ đủ lưới.

## Quy định mức truy cập

| Khu | employee | it | admin |
|---|---|---|---|
| Bàn làm việc, lounge, WC, pantry, phòng họp | xem | xem | xem |
| Tường NOC (khu Bắc) | xem | xem | xem |
| Service Desk | dùng | dùng | dùng |
| Bảng thông báo | xem | xem | xem |
| Phòng SOC | không | xem tóm tắt | xem tóm tắt |
| Phòng máy chủ | không | xem sơ đồ | xem sơ đồ |

## Phòng tiện ích (thay cho các phòng không rõ chức năng)

| Id | Loại | x0–x1 | y0–y1 | Ghi chú |
|---|---|---|---|---|
| util_store | Kho thiết bị IT | 2.5–5.4 | 1.2–3.9 | Góc Tây-Bắc, cạnh thang bộ st1. Chỉ IT và admin |
| util_print | In ấn và văn phòng phẩm | 15.5–18.5 | 11.0–13.8 | Sát lõi giữa, nằm ở mép khu dự phòng. Chỉ thông tin |
| util_quiet | Phòng nghỉ yên tĩnh | 8.5–10.5 | 4.9–7.5 | Cạnh khu L1. Đặt được như phòng họp |
| util_coffee | Coffee corner | 40.5–44.5 | 12.2–14.6 | Cạnh lõi Đông, chỉ thông tin |
| util_health | Phòng y tế và phòng mẹ và bé | 52.5–56.5 | 6.0–9.5 | Nằm trong lounge. Đặt được như phòng họp |

## Danh sách tiện ích (object loại `amenity`)

Mỗi tiện ích là một `ZoneObject` với `kind` tương ứng và `action` để panel biết cần hiển thị gì:

- WC, thang máy, thang bộ, pantry: `action: "info"`, chỉ mô tả.
- Phòng họp mr1, mr2, mr3: `action: "booking"`, mở panel đặt phòng.
- Bảng vinh danh ở lounge: `action: "kudos"`, mở panel gửi vinh danh.
- Bảng thông báo: `action: "notice"`.
- Tường NOC: `action: "noc"`.
- Service Desk: `action: "service_desk"`.
- Phòng SOC: `action: "soc"`.
- Bàn squad: `action: "squad"`.
- Phòng máy chủ: `action: "server_room"` (chỉ xem sơ đồ, không điều khiển).

## Quyết định đã chốt

1. Quy mô: khoảng 500 nhân sự trên một sàn. Dùng 58 × 30 m làm diện tích ước lượng. Nếu diện tích thật lớn hơn, cần điều chỉnh tỷ lệ.
2. Lối vào chính nằm giữa tầng, tại sảnh thang máy. Quầy Service Desk đặt ngay trong sảnh.
3. Các phòng nhãn mờ (góc Tây-Bắc, cạnh lõi giữa) chuyển thành phòng tiện ích ở bảng trên.
4. Khu dự phòng giữ nguyên, không đặt bàn. Chỉ phòng In ấn được bố trí ở mép khu này.

## Khu giải trí và giao lưu văn nghệ (bổ sung)

Ba vật thể mới, thêm vào cuối mảng `objects` trong `src/content/zones/it.json`. Toạ độ theo bản vẽ (gốc trên-trái, mét), cùng quy ước với các bảng trên. Kích thước trong JSON: `position` và `size` đổi từ toạ độ này theo `worldX = x - 29`, `worldZ = y - 15`.

| Id | Loại | Action | x0–x1 | y0–y1 | Ghi chú |
|---|---|---|---|---|---|
| games_corner | amenity | games | 48.0–51.2 | 10.5–12.7 | Bàn trò chơi trong lounge, phía Tây, dưới phòng karaoke. Cao 0.8 m nên là vật đặc. Không đè util_health (52.5–56.5 × 6.0–9.5). |
| karaoke_room | room | karaoke | 46.8–51.2 | 5.7–8.9 | Phòng kính trong lounge, phía Tây-Bắc, sức chứa 6. Cách util_health khoảng 1.3 m. Chỉ bấm từ bên ngoài, như soc_room. |
| events_board | board | events | 23.2–25.2 | 14.9–15.1 | Sảnh giữa, cùng tuyến với bảng thông báo notice_board (15.5–20.5 × 14.5–15.2), cách 2.7 m. Cách quầy service_desk 0.9 m. |

Ghi chú vị trí:
- `events_board` không đặt đúng ô gợi ý "sảnh gần lối vào" (23.5–26.5 × 18.4–18.8). Ô đó là lối vào chính (`entrance`), đặt bảng đặc lên sẽ chặn cửa. Vị trí hiện tại nằm trên cùng tuyến với bảng thông báo, không chặn lối đi (khoảng hở tới bảng thông báo đủ rộng cho nhân vật, bán kính 0.35 m).
- Ba vật thể mới không chồng lấn với 39 vật thể trong JSON. Kiểm tra bằng script đọc JSON, không build.
- Đã có sẵn từ trước, không thuộc phần bổ sung này: core_lift3 (35.9–39.9 × 11.1–13.7) chồng wc_block (35.9–45.1 × 5.9–11.9) ở dải y 11.1–11.9. Cần xem lại khi chỉnh bản vẽ gốc.
- Không thêm kind mới: dùng `amenity`, `room`, `board` có sẵn trong `ObjectKind`.

## Lối vào tầng 7 và hành lang (bổ sung 2026-11-06)

Theo bản vẽ người dùng khoanh. Pixel quy đổi bằng 15 px/m, lề ảnh khoảng (32, 27) px, rồi hiệu chỉnh theo lõi thang có sẵn. Tọa độ bản vẽ (m).

| Id | Kind | x0–x1 | y0–y1 | Ghi chú |
|---|---|---|---|---|
| lift7_east | elevator | 33.4–35.8 | 15.2–15.5 | Cửa mặt Bắc core_lift2, mở ra hành lang giữa. Cabin thật trong lõi. Cụm của chuỗi cảnh (pixel 585,312) |
| lift7_west | elevator | 20.5–20.8 | 15.7–18.1 | Cửa mặt Đông core_lift1, mở ra sảnh (pixel 320,315). Mặt Bắc bị notice_board che nên đặt mặt Đông. Mở kèm chuông khi số ghi danh hôm nay tăng |
| security_gate | security_gate | 30.9–33.4 | 11.1–14.1 | Giao lộ sau cửa thang Đông (pixel 520,270). Mặt trước hướng Đông. Làn cổng tại y 13.4, rộng 1.02 m |
| moderation_desk | counter | 31.2–33.2 | 9.1–9.9 | Khu an ninh, sau bàn ghi danh. Chỉ moderator, admin thấy |
| checkin_board | checkin_board | 30.4–30.5 | 16.1–17.9 | Tường Tây core_lift2, mặt hướng sảnh |

Đường chuỗi cảnh: cabin (34.6, 16.25) → cửa → Bắc 1.1 m → rẽ trái tới (33.0, 13.4) → quét → qua làn → Tây dọc y 13.4 → điểm thả (20.2, 13.4). Pixel điểm cuối 285,275 ứng với x ≈ 17, dời sang 20.2 vì x 15.5–18.5 là util_print.

Hành lang (src/scene/Corridors.tsx, chỉ lớp sàn và trang trí tường, không chặn đi lại):

| Đoạn | Phong cách | x0–x1 | y0–y1 |
|---|---|---|---|
| lobby | Sảnh kính, sàn bóng, viền đèn | 20.5–30.5 | 15.5–18.9 |
| central | Hành lang giữa, đá | 18.6–29.9 | 12.9–13.9 |
| link | Đá, nối hành lang giữa và sảnh | 25.6–27.0 | 13.9–15.5 |
| security | Khu an ninh, đá tối, vạch dẫn | 29.9–35.9 | 5.2–15.1 |
| east | Đá, nối khu an ninh xuống hành lang Nam | 35.9–38.5 | 13.7–18.9 |
| south | Hành lang gỗ | 2.5–46.5 | 18.9–19.9 |
| gallery | Khu trưng bày, tranh trên tường khối WC | 45.1–46.5 | 3.5–18.9 |
| west | Hành lang Tây, gỗ sồi lát ngang, dọc tường Tây (mặt Tây desk_L1..L3) | 0.4–2.5 | 4.9–19.9 |
| west_north | Gỗ sồi, phía Bắc desk_L1 và util_quiet (mặt Nam util_store, core_st1) | 0.4–14.5 | 3.9–4.9 |
| west_inner | Gỗ sồi, phía Đông util_quiet và mr1, nối hành lang Nam | 13.5–14.5 | 4.9–18.9 |
| west_mid | Gỗ sồi, nhánh giữa desk_L2 và desk_L3 | 2.5–8.5 | 14.6–15.8 |
| west_link | Đá, nối Tây sang hành lang giữa, vòng phía Bắc util_print | 14.5–19.6 | 9.9–10.9 |
| west_link2 | Đá, chạm central tại y 12.9 | 18.6–19.6 | 10.9–12.9 |

Ghi chú hành lang Tây: trong it.json desk_L1..L3 (x ≤ 8.5) và util_quiet, mr1 (x ≥ 8.5) chạm cạnh nhau, không có khe để đặt hành lang "giữa" hai cụm. Hành lang Tây vì vậy đi vòng quanh cụm (Tây, Bắc, Đông) và có nhánh giữa desk_L2/L3. Khe tại góc x 8.5, y 15.2–15.9 chỉ rộng 0,7 m (bằng đường kính nhân vật), nên west_mid là nhánh cụt từ west.

Chưa làm: hành lang Bắc dọc open_north (khe open_north y 5.2 tới wc_block y 5.9 chỉ 0,7 m, cần thu va chạm open_north hoặc đổi dữ liệu trước), lối vào lounge từ gallery (đề xuất x 46.5–48.6, y 15.4–17.4, mặt trên lớp sàn phải cao hơn 0,035 vì lớp phủ lounge).

## Phạm vi hình chữ L (bổ sung 2026-11-06)

Theo đường khoanh xanh trong `promy_update/ảnh văn phòng/Screenshot 2026-11-06 194350.png` (room.txt mục 1). Dữ liệu ở `src/scene/officeBounds.ts`.

Hiệu chỉnh ảnh (1645 × 923 px): khu `reserved` (x 14.5–29.9, y 0.2–15.2) nằm ở pixel x 445–870, y 78–470, nên x ≈ (px − 45) / 27.6, y ≈ (py − 73) / 26.1. Mỗi góc đường xanh bắt về cạnh vật thể có sẵn gần nhất.

| Đỉnh | x | y | Căn cứ |
|---|---|---|---|
| 1 | 0 | 0 | Góc Tây-Bắc tòa nhà |
| 2 | 14.5 | 0 | Đường xanh px ≈ 440, mép Tây `reserved` |
| 3 | 14.5 | 15.2 | Góc Tây-Nam `reserved` |
| 4 | 18.6 | 15.2 | Đầu Tây hành lang `central` (x 18.6), cách điểm thả 20.2 là 1,6 m; ngoài `util_print` (x ≤ 18.5) |
| 5 | 18.6 | 12.4 | Làn chuỗi cảnh y 13.4 trừ 1 m lề |
| 6 | 29.9 | 12.4 | Mép Đông `reserved`, đầu Tây khu an ninh |
| 7 | 29.9 | 8.1 | `moderation_desk` y 9.1 trừ 1 m lề |
| 8 | 35.9 | 8.1 | Mặt Tây `core_lift3` / `wc_block`, mép Đông `core_lift2` |
| 9 | 35.9 | 18.5 | Mặt Đông `core_lift2`, mép Nam các lõi |
| 10 | 45.1 | 18.5 | Đường xanh px ≈ 1280, cạnh Đông `wc_block` / `open_north` |
| 11 | 45.1 | 30 | Tường Nam |
| 12 | 0 | 30 | Góc Tây-Nam tòa nhà |

Nới 2026-11-06 (người dùng chốt: lối vào tầng 7 nằm trong L, không dời vật, không ngoại lệ). Đỉnh 4 đến 9 thay cho hai đỉnh cũ (30.5, 15.2), (30.5, 18.5). Vùng thêm gồm:
- Khu an ninh x 29.9–35.9, y 8.1–18.5: `security_gate`, `moderation_desk`, trọn `core_lift2` (cabin `lift7_east` x 33.85–35.35, y 15.5–17.1, tường treo `checkin_board`). Đường cửa thang (34.6, 15.2) → (34.6, 14.25) → điểm quét (33.3, 13.4) có lề ≥ 1 m mỗi bên.
- Hành lang giữa x 18.6–29.9, y 12.4–15.2: làn y 13.4 ± 1 m từ ra làn (30.55, 13.4) tới điểm thả (20.2, 13.4), nối liền sảnh tại y 15.2 (không khe hở).

Hợp năm hình chữ nhật không chồng nhau (`OFFICE_L_PLAN_RECTS`): [0–14.5 × 0–30], [14.5–18.6 × 15.2–30], [18.6–29.9 × 12.4–30], [29.9–35.9 × 8.1–30], [35.9–45.1 × 18.5–30]. Diện tích 931,76 m², bằng diện tích đa giác.

Quy tắc dựng:
- Sàn, trần chỉ phủ chữ L. Tường ngoài chỉ trên cạnh L trùng mép tòa nhà (Bắc x 0–14.5, Tây, Nam x 0–45.1). Cạnh trong của L không dựng tường.
- Hành lang được cắt theo L. Bỏ hẳn: gallery, west_link, hành lang Bắc, lối vào lounge. Giữ một phần: security (y 8.1–15.1), east (y 18.5–18.9), south (x 2.5–45.1), west_link2 (mẩu x 18.6–19.6, y 12.4–12.9). central, link, lobby nằm trọn trong L.
- Chỉ dựng vật thể it.json có footprint nằm trọn trong L (`isObjectInOffice`, lọc trong `ITOffice.tsx`). Vật ngoài hoặc cắt ngang mép L không dựng, không va chạm, không tương tác. Dữ liệu không xóa. Không còn danh sách ngoại lệ theo id.
- Vật không dựng (16): lounge, kudos_board, util_health, reserved (14% trong L), open_north, games_corner, karaoke_room, wc_block, pantry, util_coffee, util_print, notice_board (38% trong L), noc_wall, core_st2, core_st3, core_lift3.
- `events_board` (x 23.2–25.2, y 14.9–15.1) giờ nằm trọn trong L nên được dựng: tấm bảng đặc 2 × 2,2 × 0,2 m đứng giữa hành lang giữa và sảnh, không chắn làn y 13.4. Muốn ẩn thì phải chừa khe sàn quanh nó hoặc thêm ngoại lệ, cả hai trái quyết định đã chốt.
- Chưa lọc (file ngoài phạm vi sửa): đạo cụ trong `officePropsLayout.ts` ngoài L (bình chữa cháy 45.4,2.0; máy lọc nước 49.5,29.5; cây 50.6,29.3; thùng rác 48.6,29.5, 40.2,14.3, 50.7,23.0) và tivi, bảng, cây trong `itFixtures.ts` (tv_lounge, design_board, plant_lounge_a, plant_lounge_b, plant_north). Ba băng rôn y 13.4 (x 20.4, 24.0, 27.6) và tv_lobby (y 15.05) nay nằm trong vùng nới.
