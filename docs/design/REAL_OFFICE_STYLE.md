# Chuẩn phong cách theo văn phòng thật · khối CNTT

Nguồn: 14 ảnh trong `ảnh văn phòng/` (photo_2026-11-06_*.jpg), chụp ngày 06/11/2026. Tài liệu này mô tả phong cách để dựng lại cảnh 3D và trang phục nhân vật. Không đổi toạ độ vật thể trong `docs/FLOORPLAN_IT.md` hay `src/content/zones/it.json`.

## 0. Ảnh đã dùng và ảnh đã bỏ

| Ảnh | Dùng | Nội dung tham chiếu |
|---|---|---|
| 18-58-31 | Có | Lối đi chính, tủ gỗ cửa kính, TV treo tường, máy lọc nước, cây lá lớn, bình chữa cháy, trang phục polo |
| 19-00-28 | Có | Dãy bàn dài nhìn dọc, băng rôn treo trần, ghế lưới, tranh treo tường, cây góc |
| 19-01-02 | Có | Toàn cảnh khu mở, lưới trần, đèn panel, miệng gió, phản chiếu sàn, biển khu |
| 19-01-16 | Có | Bàn bench dài, lỗ đi dây, hộc tủ, băng rôn, tủ cửa kính, tranh |
| 19-01-24 | Có | Cận cảnh mặt bàn, khung chân kim loại, hộc tủ di động có khoá, dãy tủ hồ sơ, TV, tranh |
| 19-01-29 | Có | Mạch lát sàn, phản chiếu đèn, ghế lưới, bình chữa cháy trên giá đỏ, áo sơ mi |
| 19-01-33 | Có | Góc phòng nhỏ, TV treo, cây trong chậu trắng, tranh, thùng rác đỏ, ghế lưới |
| 19-01-45 | Có | Trang phục polo, dây đeo thẻ, giày da, tủ, bình nước dự phòng |
| 19-00-49 | Bỏ | Ảnh chụp chân và giày cá nhân. Chỉ dùng để xác nhận mạch lát sàn, không dùng cho trang phục |
| 19-01-06 | Bỏ | Ảnh dưới gầm bàn, tối, có chân người và chăn cá nhân |
| 19-01-10 | Bỏ | Ảnh chân đi dép, đồ cá nhân |
| 19-00-44 | Bỏ | Bàn làm việc cá nhân, màn hình có nội dung chat và công việc riêng |
| 19-00-54 | Bỏ | Đồ cá nhân (bộ phát wifi, chìa khoá), màn hình có tên tài khoản |
| 19-00-58 | Bỏ | Trùng với 19-00-44, có nội dung màn hình riêng. Chỉ lấy màu tấm lót bàn |

Kết quả: dùng 8 ảnh, bỏ 6 ảnh.

## 1. Tổng quan

Khối CNTT là một sàn văn phòng mở rất sâu, trần thấp vừa phải (ước lượng 2.7–2.8 m), không thấy cửa sổ trong ảnh. Các dãy bàn bench dài, đặt quay lưng vào nhau, không có vách ngăn, chạy song song với lối đi chính. Ánh sáng đến hoàn toàn từ đèn panel LED âm trần, trắng hơi lạnh, rất đều, gần như không có bóng đổ. Sàn đá xám bóng phản chiếu đèn trần thành các ô sáng chữ nhật, làm không gian sáng và "sạch" hơn. Màu chủ đạo là trắng, xám và gỗ sồi nhạt. Điểm nhấn màu duy nhất là chuỗi băng rôn đỏ cam treo trần dọc lối đi và vài bình chữa cháy đỏ. Cảm giác chung: văn phòng ngân hàng hiện đại, đông người, gọn và chức năng, có chút ấm nhờ cây xanh, tranh khẩu hiệu và đồ cá nhân trên bàn.

## 2. Bảng màu ước lượng

Tất cả mã hex là **ước lượng**. Một phần được lấy mẫu trung vị từ ảnh (ghi "đo"), sau đó hiệu chỉnh bằng mắt vì ảnh điện thoại thiếu sáng và cân bằng trắng lệch lạnh. Cần chỉnh lại trên màn hình thật bằng bảng mẫu (DESIGN_V2 mục 8.2).

| Token đề xuất | Hex | Đo từ ảnh | Dùng cho |
|---|---|---|---|
| `real.floor.stone` | #A9ABAA | #A5A6A4 | Nền gạch đá xám |
| `real.floor.vein` | #CDD0D0 | — | Vân đá trắng mảnh |
| `real.floor.grout` | #85888A | — | Mạch lát |
| `real.floor.highlight` | #F2F5F8 | — | Ô phản chiếu đèn trên sàn (nếu vẽ bằng decal) |
| `real.wall.paint` | #ECEEF0 | #B8B8B8 (thiếu sáng) | Tường sơn trắng, cột |
| `real.ceiling.tile` | #E4E6E9 | #838991 (thiếu sáng) | Tấm trần 600 × 600 |
| `real.ceiling.grid` | #D3D6DA | — | Khung xương trần T-bar |
| `real.ceiling.vent` | #C9CDD2 | — | Miệng gió vuông, khe gió dài |
| `real.light.panel` | #F4F9FF | #F1F9FF | Mặt đèn panel LED (emissive) |
| `real.wood.desktop` | #DDD2BE | #C8C6BF | Mặt bàn gỗ sồi nhạt (melamine) |
| `real.wood.pedestal` | #D5C6A9 | #B5A897 | Hộc tủ di động, thân tủ hồ sơ |
| `real.wood.edge` | #C9B998 | — | Cạnh dán chỉ, mặt cánh tủ |
| `real.metal.frame` | #A2A5A8 | #515352 (trong bóng) | Khung chân bàn sơn tĩnh điện bạc xám |
| `real.glass.cabinet` | #DDE6EA, alpha 0.25 | — | Kính cửa tủ trên |
| `real.banner.red` | #E0402C | — | Nền băng rôn, nửa trên đậm |
| `real.banner.orange` | #F2713A | — | Nền băng rôn, nửa dưới chuyển sang cam |
| `real.banner.text` | #FFFFFF | — | Chữ trên băng rôn |
| `real.sign.strip` | #FFFFFF | — | Dải trắng dưới biển tên khu |
| `real.deskmat` | #45494C | #697878 (đèn chiếu) | Tấm lót bàn nỉ xám đậm (không có thảm sàn) |
| `real.chair.seat` | #1D1D22 | #1D1D22 | Đệm ghế đen |
| `real.chair.mesh` | #2B2B31 | #5B5760 (lưới thấu sáng) | Lưng lưới đen, trong mờ |
| `real.screen.bezel` | #16181C | — | Viền màn hình, thân laptop |
| `real.tv.off` | #1E2126 | #404450 (có phản chiếu) | Mặt TV tắt |
| `real.water.bottle` | #8DB6CC, alpha 0.5 | #5C747E | Bình nước 19 L xanh trong |
| `real.dispenser` | #F1F2F2 | — | Thân máy lọc nước trắng |
| `real.fire.red` | #B4202C | #82303B | Bình chữa cháy và giá đỡ |
| `real.plant.leaf` | #2F5A2C | #35423B | Lá cây, mặt trên |
| `real.plant.leaf.light` | #4F7F3E | — | Lá non, mặt lá phản sáng |
| `real.pot.white` | #F3F3F1 | — | Chậu sứ trắng |
| `real.poster.dark` | #2C3138 | #49525F | Tranh khẩu hiệu nền đen |
| `real.poster.yellow` | #E6CC3B | — | Tranh khẩu hiệu nền vàng |
| `real.poster.green` | #B6D58A | — | Tranh khẩu hiệu nền xanh lá nhạt |
| `real.exit.green` | #2E9E5B | — | Biển thoát hiểm (emissive) |

Ghi chú:
- Màu băng rôn là màu quan sát được trên vật trang trí trong ảnh. Không đặt nó vào `brand.primary` hay `accent.primary`. Theo DESIGN_V2 mục 1.1, màu thương hiệu vẫn để trống cho tới khi người dùng cung cấp.
- Không có thảm sàn trong khu làm việc. Thứ duy nhất giống thảm là tấm lót bàn nỉ trên vài chỗ ngồi.
- So với `src/theme/tokens.ts` (`office-day`: `sceneFloor` #d5dde8, `sceneWall` #c2cddb): sàn thật tối và trung tính hơn, tường thật sáng hơn sàn. Nếu muốn giống ảnh, cần một bộ token cảnh riêng. Tài liệu này không sửa `tokens.ts`.

## 3. Vật liệu

| Vật liệu | Mô tả quan sát | Gợi ý three.js |
|---|---|---|
| Sàn đá xám bóng | Gạch porcelain giả đá, xám trung tính, vân trắng mảnh chạy chéo, vân thưa. Viên vuông lớn, ước lượng 800 × 800 mm. Mạch rất mảnh (1–2 mm), màu xám đậm hơn nền một chút, chạy thẳng dọc và ngang lối đi. Độ bóng gương: ô đèn trần phản chiếu rõ thành hình chữ nhật trắng, cạnh khá sắc, kéo dài theo phối cảnh. Phản chiếu đồ vật (chân ghế, hộc tủ) mờ và ngắn | `MeshPhysicalMaterial`, color `real.floor.stone`, roughness 0.35, `clearcoat` 1.0, `clearcoatRoughness` 0.06. Texture vân 1024 px lặp mỗi 0.8 m, mạch vẽ vào texture. Phản chiếu lấy từ envMap `RoomEnvironment` hoặc envMap nướng từ trần. Không dùng `Reflector` |
| Tường sơn trắng | Sơn nước mờ, phẳng, không ốp. Cột vuông cùng màu. Chân tường không thấy len chân tường nổi bật | `MeshStandardMaterial`, roughness 0.9, color `real.wall.paint` |
| Trần thả lưới | Tấm 600 × 600 mm trắng mờ, khung T-bar mảnh. Đèn panel LED chiếm trọn ô (600 × 600 hoặc 600 × 1200). Miệng gió vuông 600 × 600 có lá xếp đồng tâm, và khe gió dài. Có đầu báo khói, đầu phun nước tròn nhỏ | Trần một mesh, texture lưới 600 mm. Đèn là mặt phẳng emissive `real.light.panel`, cường độ 1.2–1.5. Miệng gió dùng texture, không làm hình học |
| Gỗ tủ và bàn | Melamine vân sồi nhạt, vân thẳng mảnh, gần như mờ, chỉ hơi bóng ở góc. Cạnh dán chỉ cùng màu | `MeshStandardMaterial`, roughness 0.6, texture vân 512 px. Không clearcoat |
| Tủ hồ sơ cao cửa kính | Tủ hai cánh, nửa trên cửa kính khung gỗ, nửa dưới cánh gỗ đặc có khoá. Bên trong có đợt, đựng bìa hồ sơ | Kính alpha 0.25 có viền fresnel (theo DESIGN_V2 mục 1.3) |
| Bàn làm việc | Bàn bench dài, mặt gỗ sồi nhạt dày ~25 mm, chân khung kim loại bạc xám dạng chữ nhật (vòng chữ O). Không có vách ngăn giữa hai dãy đối diện. Lỗ đi dây tròn đen trên mặt bàn | Mặt bàn gỗ như trên, khung `real.metal.frame` metalness 0.6, roughness 0.45 |
| Ghế lưới đen | Ghế xoay văn phòng, lưng lưới đen trong mờ, đệm ngồi nỉ đen, tay vịn nhựa đen vòng, chân sao 5 bánh xe đen | Lưới: alphaMap lưới, `alphaTest` 0.4, hai mặt. Đệm roughness 0.85 |
| Kính, màn hình | Màn hình đen viền mỏng, laptop trên giá đỡ, mặt TV tắt phản chiếu đèn | Màn hình tắt: roughness 0.15. Màn hình bật: `CanvasTexture` (DESIGN_V2 mục 1.3) |

## 4. Ánh sáng

- **Nhiệt độ màu:** trắng trung tính hơi lạnh, ước lượng 5000–6000 K. Mặt đèn đo được #F1F9FF, hơi xanh. DESIGN_V2 mục 3.2 đang dùng 4000 K cho S1. Muốn giống ảnh thì nâng đèn trần khu làm việc lên khoảng 5000 K (#FFE4CE theo bảng 3.2, hoặc trắng #F4F7FF nếu không cần ấm). Cần người dùng chọn.
- **Độ sáng:** cao và đều, ước lượng 500 lux trên mặt bàn. Không có vùng tối trong khu làm việc. Bóng đổ rất mềm, chủ yếu là bóng tiếp xúc dưới bàn, ghế, hộc tủ.
- **Vị trí đèn trần:** panel LED âm trần xếp theo lưới, khoảng cách tâm ước lượng 2.4 m theo hai trục (cứ 3–4 ô trần có một đèn). Dọc lối đi chính, đèn thẳng hàng thành một tuyến chạy theo chiều sâu sàn. Giữa các đèn là miệng gió vuông và khe gió.
- **Phản chiếu trên sàn:** mỗi đèn tạo một ô sáng chữ nhật trắng trên sàn, cạnh khá rõ, nằm trên đường thẳng tới camera. Đây là đặc trưng dễ nhận nhất của ảnh, cần giữ. Đèn bàn không có.
- **Không có ánh sáng ngày.** Không thấy cửa sổ. Directional "ánh sáng ngày giả" (DESIGN_V2 mục 3.3) nên giữ cường độ thấp để không tạo bóng đổ gắt, hoặc chỉ dùng cho bóng.
- **Điểm sáng phụ:** biển thoát hiểm xanh lá, màn hình bật, TV. Không có đèn trang trí ấm trong khu làm việc.

## 5. Nội thất và đạo cụ

Số lượng là ước lượng từ phần nhìn thấy trong ảnh, không phải tổng thật của tầng.

| Đạo cụ | Kích thước ước lượng | Thấy trong ảnh | Vị trí tương đối trong ảnh |
|---|---|---|---|
| Bàn bench dài | Mỗi chỗ rộng 1.2–1.4 m, sâu 0.6–0.7 m, cao 0.75 m. Một dãy 6–10 chỗ mỗi bên | Rất nhiều dãy, 4–8 dãy trong mỗi ảnh toàn cảnh | Song song lối đi chính, hai bên lối đi |
| Ghế lưới đen | Cao lưng 0.95 m | 1 ghế mỗi chỗ ngồi | Kéo ra lối đi, xoay lệch tự nhiên |
| Hộc tủ di động 3 ngăn có khoá | 0.4 × 0.5 × 0.6 m, có bánh xe | 1 mỗi chỗ ngồi | Dưới hoặc cạnh bàn, có chìa khoá cắm, móc dây đỏ |
| Tủ hồ sơ cao cửa kính | 0.9 × 0.45 × 2.0 m mỗi khoang | Dãy 3–5 khoang (19-01-24), 2 khoang (18-58-31) | Sát tường, cuối dãy bàn. Có khi đặt máy in hoặc hộp giấy lên nóc |
| Tủ thấp, tủ hai ngăn | 0.8 × 0.45 × 0.8 m | 2–3 | Cạnh tường, gần máy lọc nước |
| Máy lọc nước đứng | 0.32 × 0.32 × 1.05 m, trắng, bình 19 L úp trên | 2–3 | Sát tường cạnh lối đi, gần cây và TV |
| Bình nước 19 L dự phòng | Đường kính 0.27 m, cao 0.49 m | 2–4 cạnh mỗi máy | Xếp dưới đất cạnh máy lọc nước |
| Bình chữa cháy đỏ | Cao 0.5–0.6 m, đặt đôi trên giá hộp đỏ | 3 cụm | Sát tường hoặc chân cột dọc lối đi, cách nhau khoảng 15–20 m |
| Thùng rác | Thùng nhựa nhỏ 0.3 m, túi đỏ | 1 thấy rõ, chắc mỗi cụm bàn có | Dưới gầm bàn |
| Cây xanh lá lớn | Cao 1.2–1.6 m, chậu sứ trắng hoặc xám | 5–6 | Góc phòng, cạnh máy lọc nước, cạnh TV, cuối lối đi. Loại: lá to bóng, nhiều khả năng trầu bà đế vương (Philodendron) và trầu bà leo cột (Epipremnum) trong chậu trắng (19-01-33). Phỏng đoán từ ảnh |
| Băng rôn khẩu hiệu treo trần | 1.2 × 0.45 m, treo bằng 2 dây, mép dưới cách sàn ~2.4 m | 15–25 tấm thấy trong một ảnh dọc | Thành hai tuyến song song dọc lối đi chính, mỗi tuyến cách nhau 3–4 m, so le |
| Biển tên khu (treo trần) | 0.9 × 0.35 m, nửa trên đỏ cam chữ trắng, dải trắng dưới có phụ đề | 3–4 | Treo trên đầu từng cụm bàn, vuông góc lối đi |
| TV LCD treo tường | 65–75 inch, đen | 3 | Tường cuối phòng, tường cạnh tủ, góc phòng nhỏ |
| Tranh khẩu hiệu đóng khung | 0.5 × 0.7 m, nền đen, vàng hoặc xanh lá, chữ in đậm | 5–6 | Tường trắng, cao ngang mắt, cách nhau vài mét |
| Bảng trắng | 1.2 × 0.9 m | 1 | Tường cuối dãy bàn |
| Biển thoát hiểm | 0.35 × 0.15 m, xanh lá phát sáng | 2 | Trần, phía cuối lối đi |
| Đồ trên bàn | Màn hình 1–2, laptop trên giá, quạt kẹp bàn trắng, bình giữ nhiệt, cốc, hộp giấy ăn, tai nghe | Rất nhiều | Ngẫu nhiên, mật độ cao |

Đạo cụ trên bàn chỉ dùng loại chung (màn hình đen, quạt trắng, bình nước). Không vẽ logo hãng máy tính hay chữ trên màn hình.

## 6. Trang phục nhân viên (để dựng trang phục công sở tương tự)

Tham chiếu trang phục, không tham chiếu người.

**Bộ A. Polo đồng phục (chính, thấy rõ nhất):**
- Áo polo cộc tay trắng `#F4F4F2`, cotton đan pique, dáng suông vừa, thả ngoài hoặc sơ vin.
- Cổ bẻ màu xanh đậm `#1E2636`, nẹp 2–3 cúc.
- Đường viền xanh đậm mảnh (~8 mm) chạy từ chân cổ xuống vai rồi theo đường may raglan tới nách. Bo tay áo xanh đậm rộng ~2.5 cm.
- Ngực trái có thêu một biểu tượng nhỏ. Khi dựng, thay bằng một hình học trung tính (ví dụ chấm tròn hoặc khối nhỏ) hoặc để trống. Không chép logo trên áo.
- Dây đeo thẻ đỏ cam `#E8502E`, bản rộng ~2 cm, có chữ in trắng chạy dọc (dựng bằng vạch trắng, không có chữ đọc được). Treo quanh cổ, móc kim loại, thẻ nhựa trong có thẻ xanh dương nhạt ở dưới, rơi ngang thắt lưng hoặc ngực dưới.
- Quần tây xám than hoặc navy đậm `#22272E`, ống đứng, ly nhẹ, dài chạm giày.
- Thắt lưng da đen, khoá bạc `#AEB8C4`.
- Giày da đen buộc dây kiểu derby/oxford `#17191D`, mũi tròn, đế mỏng, hơi bóng (roughness 0.35, clearcoat 0.2).
- Phụ kiện tuỳ chọn: đồng hồ đeo tay kim loại bạc, kính gọng đen. Chỉ là tuỳ chọn trong danh mục, không gán mặc định.

**Bộ B. Sơ mi công sở (thấy ở nhiều người khác):**
- Sơ mi dài tay trắng `#F4F4F2` hoặc xanh nhạt `#CFE3EC`, sơ vin.
- Quần tây đen hoặc navy, giày da đen.
- Cùng dây đeo thẻ đỏ cam.

**Bộ C. Thường ngày (thấy ít):** áo len hoặc áo khoác mỏng màu trơn (hồng đất, xám), áo thun cam. Dùng cho biến thể "Thứ Sáu thoải mái" đã có trong DESIGN_V2 mục 6.2.

Ánh xạ sang DESIGN_V2 mục 6.2: cần thêm một mục "Áo polo đồng phục trắng viền xanh đậm" và một phụ kiện "Dây đeo thẻ đỏ cam". Các mục sơ mi trắng, quần tây đen, Oxford đen đã có sẵn.

## 7. Quy tắc riêng tư

1. Không dựng gương mặt, kiểu tóc, kính, đồng hồ hay hình dáng cơ thể của bất kỳ người thật nào trong ảnh. Không dùng ảnh làm texture mặt hay texture người.
2. Không ghi tên, chức danh hay thông tin trên thẻ của người trong ảnh. Thẻ đeo trong 3D là thẻ trống hoặc chỉ có ô màu.
3. Nhân vật là nhân vật chung, sinh từ hệ thống avatar (DESIGN_V2 mục 6 và 7, `AVATAR_SPEC.md`). Chỉ tham khảo phong cách trang phục và tỷ lệ cơ thể người trưởng thành bình thường (khoảng 7–7.5 đầu).
4. Không dùng nội dung màn hình trong ảnh (chat, tài khoản, mã nguồn) cho texture màn hình.
5. Không đưa 14 ảnh gốc vào repo build, bundle hay thư mục `public/`. Chỉ giữ ở thư mục tham chiếu cục bộ.
6. Băng rôn, biển khu và áo không mang logo hay khẩu hiệu nguyên văn của tổ chức. Dùng chữ tự đặt ngắn (tối đa 6 chữ, theo DESIGN_V2 mục 1.1) hoặc tên squad.

## 8. Ánh xạ sang mặt bằng (không đổi toạ độ)

Toạ độ dưới đây là toạ độ có sẵn trong `docs/FLOORPLAN_IT.md`. Mọi đạo cụ là decor không va chạm hoặc đặt trong phạm vi vật thể đã có.

| Nhóm đạo cụ | Đặt ở | Ghi chú |
|---|---|---|
| Sàn đá xám bóng | Khu làm việc desk_L1..L3, desk_B1..B7, open_north, sảnh `lobby`, hành lang `central`, `link`, `security`, `east` | Ảnh không có thảm. Hành lang `south` và `west*` đang là gỗ sồi trong Corridors.tsx. Đề xuất đổi sang đá, cần người dùng chọn (mục 9, D1) |
| Quầy lễ tân | `service_desk` (23.0–27.5 × 16.0–17.2) | Ảnh không có quầy. Dùng gỗ sồi nhạt như tủ, mặt quầy trắng, một cây lá lớn ở mỗi đầu quầy, một TV treo trên tường lõi phía sau |
| Bàn bench, ghế lưới, hộc tủ | Trong desk_L1..L3, desk_B1..B7, open_north | Bàn quay lưng vào nhau, không vách ngăn. Hộc tủ dưới mỗi chỗ ngồi |
| Biển tên khu treo trần | Trên tâm mỗi cụm desk_B1..B7, desk_L1..L3 | Chữ là tên squad trong bảng FLOORPLAN |
| Băng rôn khẩu hiệu | Treo trần trên hành lang `south` (2.5–46.5 × 18.9–19.9) và `central` (18.6–29.9 × 12.9–13.9) | Hai tuyến so le, cách 3–4 m. Mép dưới 2.4 m, không chạm nhân vật |
| Tủ hồ sơ cao cửa kính | Tường cạnh `mr1`, `util_print`, mép Bắc của open_north, tường Tây cuối desk_L1..L3 | Dãy 3–5 khoang, sát tường, không đè lối đi |
| Máy lọc nước, bình dự phòng | `pantry`, `util_coffee`, đầu Đông của hành lang `south` gần desk_B7, đầu Bắc desk_L1 | Mỗi điểm 1 máy và 2–3 bình |
| Bình chữa cháy | Cạnh `core_st1`, `core_st2`, `core_st3`, `core_lift1`, `core_lift2`, và giữa hành lang `south` | Đặt đôi trên giá đỏ, sát tường lõi |
| Cây lá lớn | Hai đầu `service_desk`, góc `lounge`, cạnh máy lọc nước, cuối mỗi tuyến bàn, `gallery` | 1 cây mỗi 10–12 m tường |
| TV LCD | Tường NOC mép Bắc open_north, tường lõi sau `service_desk`, lounge | TV ở khu làm việc tắt hoặc hiện màn hình chờ trung tính |
| Tranh khẩu hiệu | `gallery` (tường khối WC), tường Tây dọc `west` | Chữ tự đặt, không chép nguyên văn ảnh |
| Thùng rác | Dưới gầm bàn mỗi cụm, cạnh `pantry`, `util_coffee` | Instancing |
| Biển thoát hiểm | Trần trên cửa `core_st1`, `core_st2`, `core_st3` | Emissive xanh lá |

## 9. Danh sách việc

Quyết định cần người dùng chốt trước:
- D1. Hành lang `south` và `west*`: giữ gỗ sồi (như Corridors.tsx hiện tại) hay đổi sang đá xám bóng giống ảnh.
- D2. Nhiệt độ màu đèn trần khu làm việc: giữ 4000 K (DESIGN_V2) hay nâng 5000–5500 K giống ảnh.
- D3. Có thêm bộ token cảnh "văn phòng thật" bên cạnh `office-day` không.

### Agent decor

- [ ] Sàn khu làm việc dùng color `real.floor.stone`, texture vân lặp mỗi 0.8 m, mạch 1–2 mm; kiểm tra bằng ảnh chụp cảnh thấy mạch thẳng theo lối đi.
- [ ] Sàn có clearcoat ≥ 0.9 và clearcoatRoughness ≤ 0.1; kiểm tra: ảnh chụp cảnh thấy ô đèn trần phản chiếu rõ trên sàn.
- [ ] Không dùng `Reflector` hay `transmission` cho sàn; kiểm tra bằng grep không có `Reflector` trong mã cảnh mới.
- [ ] Trần có texture lưới 600 mm, đèn panel emissive `real.light.panel` cách tâm 2.4 m; kiểm tra số đèn trên mỗi 100 m² nằm trong 15–20.
- [ ] Mặt bàn, hộc tủ, tủ hồ sơ dùng các màu `real.wood.*`, roughness 0.55–0.65, không clearcoat.
- [ ] Bàn bench không có vách ngăn, khung chân màu `real.metal.frame`; kiểm tra bằng ảnh chụp một cụm squad.
- [ ] Mỗi chỗ ngồi có 1 ghế lưới đen và 1 hộc tủ 3 ngăn, dùng `InstancedMesh`; kiểm tra số instance bằng số chỗ.
- [ ] Đặt tủ hồ sơ cao cửa kính theo bảng mục 8, mỗi dãy 3–5 khoang, không giao hộp va chạm với vật thể có sẵn; kiểm tra bằng script đọc JSON.
- [ ] Đặt máy lọc nước kèm 2–3 bình dự phòng ở 4 điểm trong mục 8.
- [ ] Đặt bình chữa cháy đôi trên giá đỏ cạnh 5 lõi và giữa hành lang `south`; kiểm tra có ít nhất 6 cụm.
- [ ] Đặt cây lá lớn chậu trắng theo mục 8, cao 1.2–1.6 m, có lắc lá theo DESIGN_V2 mục 1.4.
- [ ] Treo băng rôn hai tuyến so le trên `south` và `central`, mép dưới 2.4 m, chữ tự đặt tối đa 6 chữ, không logo; kiểm tra nhân vật đi qua không va chạm.
- [ ] Treo biển tên khu trên mỗi cụm bàn, chữ là tên squad; kiểm tra đủ 10 biển (B1..B7, L1..L3).
- [ ] Treo TV ở 3 vị trí trong mục 8, màn hình tắt hoặc màn chờ trung tính.
- [ ] Đặt 5–6 tranh khẩu hiệu tự soạn ở `gallery` và tường Tây; kiểm tra không có câu chép nguyên văn từ ảnh.
- [ ] Không thêm hay đổi toạ độ vật thể trong `it.json`; kiểm tra bằng `git diff` chỉ thấy file decor và theme.
- [ ] Chụp ảnh cảnh cùng góc với ảnh 19-01-02 và 19-01-29 để so sánh, lưu kèm báo cáo.

### Agent nhân vật

- [ ] Thêm mục trang phục "Áo polo đồng phục trắng viền xanh đậm": thân `#F4F4F2`, cổ và bo tay `#1E2636`, viền vai raglan 8 mm; kiểm tra có trong danh mục trang phục.
- [ ] Biểu tượng ngực trái là hình học trung tính hoặc để trống; kiểm tra texture không chứa logo hay chữ.
- [ ] Thêm phụ kiện "Dây đeo thẻ đỏ cam" `#E8502E` bản 2 cm, thẻ trống màu xanh nhạt; kiểm tra thẻ không có tên, ảnh hay số.
- [ ] Đặt bộ mặc định ngày thường là polo + quần tây `#22272E` + thắt lưng đen + giày da đen; kiểm tra avatar mới tạo dùng bộ này.
- [ ] Giữ bộ sơ mi trắng và xanh nhạt + quần tây làm lựa chọn thứ hai, cùng dây đeo thẻ.
- [ ] Giày da có roughness 0.35 và clearcoat 0.2, quần có nếp ly nhẹ.
- [ ] Tỷ lệ cơ thể 7–7.5 đầu, dùng ba kiểu hình thể và ba chiều cao có sẵn (DESIGN_V2 mục 6.1); không thêm hình dáng riêng của ai.
- [ ] Không có texture, mesh hay tên lấy từ người trong ảnh; kiểm tra thư mục asset nhân vật không chứa file từ `ảnh văn phòng/`.
- [ ] Kính và đồng hồ chỉ là tuỳ chọn, không bật mặc định.
- [ ] Chụp ảnh 3 avatar mẫu (A, B, C) mặc bộ polo đứng trên sàn đá để duyệt.
