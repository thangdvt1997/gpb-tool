# DESIGN V2 · Văn phòng ảo GPBank (Khối CNTT)

Định hướng nghệ thuật, kỹ thuật và ngân sách cho thế giới 3D

| Mục | Nội dung |
|---|---|
| Ngày | 2026-11-06 |
| Trạng thái | Bản đề xuất. Chờ người dùng trả lời mục 10 trước khi chốt |
| Phạm vi | Chỉ tài liệu thiết kế. Không có mã nguồn, không có asset, không cài gói |
| Ràng buộc kỹ thuật | three 0.169.0, @react-three/fiber 8.17.10, @react-three/drei 9.114.0, React 18.3.1 (theo `package.json`) |
| Nguồn mặt bằng | `docs/FLOORPLAN_IT.md`. Kích thước là ước lượng từ ảnh CAD, chưa đối chiếu tỷ lệ |
| Chính sách asset | `docs/design/ASSET_SOURCES.md`. Chỉ nhận CC0, CC BY và SIL OFL 1.1 |

Ký hiệu dùng trong tài liệu:
- **[THƯ VIỆN]**: dùng API có sẵn của three.js hoặc drei, không cần shader tùy biến.
- **[SHADER]**: cần `ShaderMaterial` hoặc `onBeforeCompile` (shader tùy biến).
- **[POSTFX]**: cần postprocessing trong `three/examples/jsm` (thuộc three.js, giấy phép MIT).
- **[ƯỚC LƯỢNG]**: con số chưa đo trên máy thật, dùng để lập ngân sách. Phải đo lại theo mục 9.7.

---

## 0. Tóm tắt và quyết định cần chốt

Hướng chung là **tả thực điệu** (stylized-real). Bố cục, vật liệu và ánh sáng bám theo văn phòng thật. Hình người và đồ vật hơi phóng đại tỷ lệ, màu bão hòa vừa phải. Vui nhờ chi tiết và chuyển động nhỏ. Chuyên nghiệp nhờ lưới, đường thẳng, typography và bảng màu tiết chế.

Năm điểm chính:
1. Bốn phong cách chủ đạo (mục 1), tám chủ đề theo thời gian và sự kiện (mục 2), rig ánh sáng cho từng khu (mục 3), âm thanh tổng hợp hoàn toàn bằng Web Audio (mục 4).
2. Ba mức chất lượng (Thấp, Trung, Cao) với ngân sách draw call, tam giác, bộ nhớ texture và số đèn cố định (mục 9).
3. Nhân vật ba cấp LOD. Cấp xa dùng `InstancedMesh`, để có thể hiển thị đông người mà vẫn chạy trên GPU tích hợp (mục 7).
4. Phòng máy chủ và SOC không gửi nội thất xuống trình duyệt của nhân viên thường (mục 5.7).
5. Mọi con số về chỗ ngồi và ngân sách phải đối chiếu với các kiểm tra ở mục 8.

### Phát hiện cần chốt trước khi dựng 3D

**Phát hiện 1 (chặn quyết định): mặt bằng không chứa đủ 484 chỗ.** Tính theo số liệu trong `docs/FLOORPLAN_IT.md`, bước chỗ và bước hàng 1.2 m:

| Cách tính | Số chỗ | Giả định |
|---|---|---|
| Mục tiêu trong tài liệu | 484 | 336 (7 squad × 48) + 108 (L1–L3) + 40 (Bắc) |
| Tối đa về hình học | 246 | Bàn cách nhau 1.2 m, sát mép, không tính ghế và lối đi |
| Thực tế hơn | khoảng 104 | Mỗi khối có hai hàng đối diện. Bàn 0.6 m sâu, ghế kéo ra 0.9 m mỗi bên, bước 1.2 m. Không tính lối đi giữa các khối |

Tài liệu ghi mỗi cụm squad là 4 hàng × 12 chỗ. Một hàng 12 chỗ cần ít nhất 13.2 m chiều ngang, trong khi khối squad rộng 4.6–6.0 m và sâu 4.6 m. Khu L1 (6.0 × 4.6 m) ghi "khoảng 36 chỗ", nhưng theo bước 1.2 m chỉ chứa tối đa 24 chỗ. Để đạt 484 chỗ với mật độ khoảng 5 m² mỗi chỗ (kể cả lối đi), cần khoảng 2 400 m² sàn làm việc, lớn hơn toàn bộ sàn 1 740 m². Đây là ước lượng, chưa phải kết luận về quy chuẩn.

Tác động: bộ sinh chỗ ngồi (mục 5.6) sẽ đặt đúng số chỗ mà bản vẽ cho phép, không tự thêm bàn. Phương án cần chọn nằm ở mục 5.2.

**Phát hiện 2: chồng lấn footprint.** WC (`wc_block`: x 35.9–45.1, y 5.9–11.9) và thang máy phụ (`core_lift3`: x 35.9–39.9, y 11.1–13.7) chồng nhau một vùng 4.0 × 0.8 = 3.2 m² (x 35.9–39.9, y 11.1–11.9). Cần sửa một trong hai khối. Đề xuất: thu WC về y ≤ 11.0, hoặc đẩy `core_lift3` xuống y ≥ 11.9.

**Phát hiện 3: phòng họp chật.** `mr3` (12 chỗ, 4.4 × 3.0 m = 13.2 m²) tương đương khoảng 1.1 m² mỗi người, không đủ chỗ đi lại quanh bàn. `mr2` (10 chỗ, 4.3 × 3.0 m = 12.9 m²) cũng sát. Đề xuất: `mr3` tối đa 8 đến 9 chỗ, hoặc dùng bàn chữ U ngắn.

**Phát hiện 4: khu dự phòng 231 m² không có bàn.** Đây là khoảng trống lớn nhất sàn (15.4 × 15.0 m). Nếu chọn phương án B ở mục 5.2, đây là nơi mở rộng. Nếu vẫn giữ là dự phòng, có thể dùng làm sân khấu tạm trong sự kiện (câu hỏi 8).

**Mặc định nếu người dùng chưa trả lời:** render đúng bản vẽ, sinh khoảng 104 chỗ có ghế theo bố trí thực tế, không thêm bàn ở khu dự phòng. Người online nhưng không có chỗ được đặt ở điểm tụ (lounge, pantry, sảnh), đứng hoặc ngồi ghế sofa (mục 7.7).

---

## 1. Định hướng nghệ thuật

### 1.1 Nguyên tắc

1. **Bố cục như văn phòng thật.** Lưới 0.6 m cho thảm và tấm trần, 1.2 m cho bàn. Nhịp đều tạo cảm giác chuyên nghiệp.
2. **Màu trung tính là nền, màu đậm chỉ ở khu vui.** Khu làm việc giữ tông trắng ngà, xám xanh và gỗ sáng. Lounge và sân khấu mới dùng neon và màu đậm.
3. **Vui ở chi tiết.** Cây lắc nhẹ, hơi nước từ cốc, bảng vinh danh có pháo giấy, linh vật dọn dẹp đi tuần. Mỗi chi tiết có lý do tồn tại trong cảnh.
4. **Chuyển động có kiểm soát.** Không quá 20% số vật thể chuyển động cùng lúc. Chuyển động nền (cây, hơi nước) tắt khi bật chế độ giảm chuyển động.
5. **Chữ ngắn.** Biển và nhãn tối đa 6 chữ. Không dùng emoji trong 3D. Biểu tượng vẽ bằng SVG hoặc hình học.
6. **Không sao chép.** Không nhân vật, logo, màu nhận diện hay phong cách của tác phẩm có bản quyền (mục 1.6).

### 1.2 Bốn phong cách chủ đạo

**S1. Văn phòng sáng hiện đại** (khu làm việc, sảnh, phòng họp, hành lang). Cảm giác gọn, sáng, rõ ràng. Gỗ sáng, kim loại mờ, cây xanh nhỏ rải đều. Ánh sáng 4000–4500 K.

**S2. Đêm karaoke neon** (lounge Đông, khu vui chơi, đêm văn nghệ). Nền xanh than đêm, điểm sáng hồng và ngọc. Gương, dải LED, sofa vải nhung tối màu. Vui và hơi sôi động, nhưng nội thất vẫn sạch và gọn.

**S3. Sân khấu giao lưu** (sự kiện trong lounge, hoặc sân khấu tạm ở khu dự phòng nếu được chọn). Nền đen, vàng ấm và trắng ánh xanh. Đèn spot có chùm sáng, màn LED là điểm nhấn. Chỉ bật khi có sự kiện.

**S4. Góc thư giãn gỗ ấm** (pantry, coffee corner, phòng nghỉ yên tĩnh, phòng y tế và mẹ bé, lounge ban ngày). Gỗ ấm, vải lanh, cây lá lớn. Đèn 2700–3000 K. Tạo cảm giác nghỉ ngơi.

Bảng màu. Mỗi token có vai trò cố định, dùng chung cho 3D, UI và bảng thông báo.

| Token | S1 Sáng hiện đại | S2 Neon | S3 Sân khấu | S4 Gỗ ấm | Vai trò |
|---|---|---|---|---|---|
| `bg.ground` | #E9E6DF | #0F1420 | #0B0D12 | #E6D8C3 | Nền sàn, nền cảnh |
| `bg.wall` | #F4F1EA | #1A2233 | #14171F | #EFE6D6 | Tường, vách |
| `surface.carpet` | #B8C2C8 | #232C3F | #1B1F29 | #C9B79C | Thảm, vải nền |
| `ink` | #1F262D | #E8F4FF | #F5F1E6 | #2B2118 | Chữ, đường viền tối |
| `accent.primary` | #2F5D8A | #FF3D8B | #E0B252 | #A0683F | Nhấn chính |
| `accent.secondary` | #5E8C61 | #2EE6C5 | #A3121B | #6E7F5A | Nhấn phụ |
| `light.warm` | #FFCEA6 (4000 K) | #FFD166 | #FFE3A3 | #FFB16E (3000 K) | Màu đèn chủ đạo |
| `wood` | #D9B98A | #5C3A22 | #3A2A20 | #A0683F | Gỗ |
| `metal` | #8A9299 | #AEB8C4 | #6B7280 | #5B636B | Kim loại |
| `plant` | #4F7F52 | #2E6B5A | #2F4F3A | #6E7F5A | Lá cây |
| `squad.1` đến `squad.7` | #5E8C61, #2F5D8A, #C06C4A, #7B6FA6, #D9A441, #4F8F8B, #A65C7A | | | | Màu nhận diện squad (thảm, dây đeo, bảng tên) |

Màu thương hiệu GPBank **để trống**. Token `brand.primary` và `brand.accent` là `null` cho đến khi người dùng cung cấp. Khi có, thay vào `accent.primary` của S1 và các thành phần UI. Không lấy màu nhận diện của ngân hàng khác. Các màu trong bảng chưa được đối chiếu với bảng màu của ngân hàng nào. Khi có danh sách (câu hỏi 2), cần kiểm tra lại.

Màu squad (`squad.1` đến `squad.7`) có độ bão hòa thấp, để thảm và dây đeo phân biệt được nhưng không gây chói.

### 1.3 Vật liệu chính

| Vật liệu | Dùng ở | Cách làm trong three.js | Ghi chú |
|---|---|---|---|
| Sơn tường mờ | Tường, vách | `MeshStandardMaterial`, roughness 0.9 [THƯ VIỆN] | Ít chi phí |
| Thảm dạng ô 60 cm | Khu làm việc, phòng họp | `MeshStandardMaterial`, roughness 0.95, normal map sợi 512 px [THƯ VIỆN] | Lặp texture theo lưới 0.6 m |
| Gỗ sồi, óc chó | Bàn, quầy, sàn lounge | `MeshPhysicalMaterial`, roughness 0.45, `clearcoat` 0.3 [THƯ VIỆN] | Bóng nhẹ, không gương |
| Đá granite giả | Quầy service desk, sảnh | `MeshStandardMaterial`, roughness 0.35, texture vân 1024 px [THƯ VIỆN] | Dùng atlas chung |
| Kim loại xước | Khung, chân bàn, thang | `MeshPhysicalMaterial`, metalness 1, roughness 0.4, `anisotropy` 0.5 [THƯ VIỆN] | Anisotropy ít tốn |
| Kính | Vách phòng họp, server room | Alpha 0.18 kèm viền fresnel [SHADER] | Không dùng `transmission`, vì nó vẽ lại cảnh |
| Vải sofa, ghế lounge | Lounge, phòng nghỉ | `MeshPhysicalMaterial`, `sheen` 0.6, `sheenRoughness` 0.8 [THƯ VIỆN] | Tạo độ mềm của vải |
| Len, vest | Trang phục | `sheen` 0.3, normal map dệt 512 px [THƯ VIỆN] | Xem mục 6 |
| Da người | Nhân vật | `MeshPhysicalMaterial`, roughness 0.55, `specularIntensity` 0.5 + wrap diffuse [SHADER] | Mục 7.5 |
| Tóc | Nhân vật | Thẻ alpha (`alphaTest` 0.5) + Kajiya-Kay [SHADER] | Mục 7.4 |
| Neon, LED, màn hình | Biển, dải LED | `MeshBasicMaterial`, màu cường độ > 1, `toneMapped` false [POSTFX] | Bloom nhẹ |
| Gương (karaoke) | Lounge | `MeshStandardMaterial`, metalness 1, roughness 0.02, envMap `RoomEnvironment` [THƯ VIỆN] | Không dùng `Reflector` (vẽ lại cảnh) |
| Màn hình làm việc | Bàn làm việc | `CanvasTexture` cập nhật 1 Hz, `MeshBasicMaterial` [THƯ VIỆN] | Chỉ màn hình trong tầm nhìn cập nhật |
| Bóng tiếp xúc | Dưới bàn, sofa | `ContactShadows` của drei, `frames={1}` [THƯ VIỆN] | Vẽ một lần rồi giữ |
| Bóng nhân vật | Dưới chân người | Texture blob radial gradient [THƯ VIỆN] | Rẻ, dùng cho mọi LOD |

Môi trường phản chiếu dùng `RoomEnvironment` từ `three/examples/jsm/environments` (MIT), qua `PMREMGenerator`. Không dùng `Environment` của drei với preset, vì preset tải HDRI từ máy chủ bên ngoài, trái với CSP và giới hạn mạng nội bộ.

### 1.4 Gia vị vui nhộn

| Chi tiết | Mô tả | Kỹ thuật | Chi phí |
|---|---|---|---|
| Cây cảnh lắc nhẹ | Lá dao động 1–2°, theo gió điều hòa | [SHADER] vertex, sin theo thời gian, uniform dùng chung | Rất thấp. Tắt ở mức Thấp |
| Hơi nước cốc và máy pha | 12 hạt mỗi nguồn, bay lên 0.8 m rồi tan | `Points` hoặc sprite mờ, tối đa 6 nguồn | Thấp. Mức Thấp chỉ 2 nguồn |
| Vẫy tay khi vào sảnh | Nhân vật vẫy tay trong 1.5 s | Cập nhật xương tay bằng code, không cần clip | Rất thấp |
| Pháo giấy khi có vinh danh | 120 hạt, rơi 1.5 s rồi tự hủy | `Points`, pool hạt tái sử dụng, không cấp phát mới | Thấp. Tắt khi giảm chuyển động |
| Linh vật robot dọn dẹp "Gọn" (tên tạm) | Đi tuần 2 vòng mỗi giờ theo đường cố định, tránh người | Một mesh khoảng 600 tam giác, di chuyển theo spline | Thấp. Tên và thiết kế chờ duyệt (câu hỏi 13) |
| Màn hình chào ở sảnh | Hình khối và chữ ngắn, không có dữ liệu nhân viên | `CanvasTexture` cập nhật 0.5 Hz | Thấp |
| Đèn bàn "tan ca" | Đèn bàn sáng dần khi vào giờ tan ca | Tăng intensity, không thêm đèn | Thấp |
| Ghim trên bảng vinh danh | Mỗi lượt kudos thêm một ghim màu, nảy nhẹ khi gắn | `InstancedMesh` cho ghim | Thấp |

### 1.5 Giao diện (HUD và panel)

- **Panel**: nền `rgba(255,255,255,0.92)` ở S1 và `rgba(15,20,32,0.88)` ở S2. Bo góc 12 px, viền 1 px màu `ink` với độ trong suốt 12%. Bóng nhẹ `0 4px 16px rgba(0,0,0,0.12)`.
- **Chữ**: thang 12, 14, 16, 20, 28 px, chiều cao dòng 1.4. Font tiếng Việt có dấu, tự host, license SIL OFL 1.1, ghi vào `THIRD_PARTY.md`. Không dùng font mặc định của troika (drei `Text`), vì font đó tải từ CDN bên ngoài.
- **Khoảng cách** theo bội số 4 px. Vùng chạm tối thiểu 40 px.
- **Tương phản** chữ tối thiểu 4.5:1 (WCAG AA). Kiểm tra bằng script (mục 8.1, A16).
- **Trạng thái** (trực tuyến, bận, đang họp, vắng) dùng chấm màu cộng chữ hoặc biểu tượng. Không chỉ dùng màu.
- **Bàn phím**: mũi tên hoặc WASD để di chuyển, Tab chuyển giữa các panel, Esc đóng panel. Vòng focus 2 px màu `accent.primary`.
- **Biểu tượng**: vẽ SVG tự làm, nét 2 px. Nếu dùng bộ icon bên ngoài, chỉ chọn bộ có license CC0, CC BY hoặc OFL, ghi vào `THIRD_PARTY.md`.
- **Chuyển cảnh UI**: 200 ms. Khi giảm chuyển động, không có chuyển cảnh.

### 1.6 Checklist không sao chép

Trước khi nhận một asset hoặc phong cách, kiểm tra:
- Không có nhân vật, linh vật, logo hay tên riêng của tác phẩm có bản quyền.
- Không sao chép bố cục, bảng màu hay cách vẽ của một tựa game, phim hoặc thương hiệu cụ thể. Chỉ dùng tham chiếu chung: "văn phòng mở", "lounge gỗ", "đêm neon".
- Không dùng màu hoặc logo của ngân hàng khác (chờ danh sách từ người dùng).
- Mỗi asset có dòng trong `THIRD_PARTY.md` với nguồn, tác giả, license và ngày kiểm tra. Nguồn và điều kiện license xem `docs/design/ASSET_SOURCES.md`.
- Asset tự tạo ghi người tạo và ngày tạo.

---

## 2. Chủ đề theo thời gian và sự kiện

### 2.1 Bảng chủ đề

| Mã | Hiển thị | Kích hoạt | Màu và đèn | Decor | Âm thanh | Biển và trang phục |
|---|---|---|---|---|---|---|
| T0 `ngay-thuong` | Ngày thường | Mặc định khi không có chủ đề khác | S1. Rig chuẩn 4000 K | Cây, bảng thông báo, kudos | Chỉ ambient khu vực | Biển chào theo giờ. Trang phục smart casual |
| T1 `tan-ca` | Giờ tan ca | Tự động trong giờ cấu hình (mặc định 17:30–19:30, giờ Việt Nam), ngày làm việc | S4 ấm. Đèn bàn 2700 K ở 4 bàn gần camera nhất | Đèn bàn sáng dần, lounge có ghế sofa đông hơn | Lounge: nhạc lo-fi 70 BPM, tự tạo | Biển "Tan ca nhẹ nhàng". Casual |
| T2 `van-nghe` | Đêm văn nghệ | Thủ công (admin) hoặc sự kiện có lịch | S2 neon và S3 sân khấu. Đèn sân khấu quét 4 spot | Sân khấu nhỏ, micro, màn LED, gương, bóng bay | Nhạc sôi động 118 BPM tự tạo, vỗ tay SFX | Biển "Đêm văn nghệ {tên công ty}". Vest hoặc áo dài, tự chọn |
| T3 `tet` | Tết Nguyên Đán | Lịch âm do admin nhập từng năm. Từ 7 ngày trước đến 3 ngày sau | Đỏ `#A3121B`, vàng `#E0B252`, gỗ ấm. Đèn 2700 K | Cành mai hoặc đào (InstancedMesh), mâm ngũ quả, câu đối dạng chữ admin nhập | Nhạc xuân tự soạn, dùng thang năm âm | Biển chúc năm mới do admin nhập. Áo dài, sơ mi đỏ, vest |
| T4 `trung-thu` | Trung thu | Lịch âm do admin nhập từng năm. Từ 3 ngày trước đến 1 ngày sau | Cam `#E8833A`, xanh đêm `#1E2A4A`, vàng `#F4D35E`. Đèn lồng 2200 K | Đèn lồng sao (emissive), trăng (đĩa phát sáng và vầng sáng), hộp bánh | Nhạc ru nhẹ tự soạn, 72 BPM | Biển "Trung thu sum vầy". Casual, có thể mặc áo cam |
| T5 `8-3` | Ngày 8/3 | Ngày dương lịch, từ 1 đến 8 tháng 3 | Pastel: hồng `#F3C6D4`, tím nhạt `#D9CCEB`, kem `#FFF6EE` | Hoa tulip hoặc hoa hồng ở service desk và trên bàn, ghim hoa | Nhạc nhẹ tự soạn, 96 BPM | Biển "Chúc mừng ngày 8/3". Trang phục tự chọn, không phân theo giới |
| T6 `20-11` | Ngày Nhà giáo | Ngày dương lịch, từ 15 đến 20 tháng 11 | Xanh lá nhạt `#8DBB8B`, kem `#FBF5E6`, bảng đen `#2D3A34` | Bảng đen ở lounge để viết lời tri ân (admin nhập), hoa, sách | Nhạc nhẹ tự soạn, 84 BPM | Biển "Tri ân người hướng dẫn". Sơ mi trắng, áo dài, vest |
| T7 `sinh-nhat` | Sinh nhật công ty | Ngày admin cấu hình mỗi năm | Confetti nhiều màu theo token squad | Bóng bay (40 quả, InstancedMesh), bánh kem có nến, banner | Nhạc sôi động tự tạo, SFX pháo giấy | Biển "Sinh nhật {N} năm {tên công ty}". Tự chọn |

Ghi chú về biển: `{tên công ty}` và `{N}` là chuỗi do admin nhập, không hard-code trong code.

### 2.2 Ưu tiên và kích hoạt

Thứ tự ưu tiên khi nhiều điều kiện đúng cùng lúc:

1. **Thủ công** (admin đặt, có ghi log). Ưu tiên cao nhất, kể cả khi lịch khác đang đúng.
2. **Sự kiện đã lên lịch** (`calendar.json`, mục 2.3).
3. **Giờ tan ca** (T1), chỉ trong ngày làm việc và giờ cấu hình.
4. **Ngày thường** (T0).

Cách kích hoạt:
- **Thủ công**: admin mở panel chủ đề, chọn mã, xem trước 10 giây (chỉ admin thấy), rồi áp dụng. Ghi `{ai, khi nào, mã chủ đề}` vào log. Có nút "về mặc định".
- **Theo lịch**: admin nhập ngày bắt đầu và kết thúc theo dương lịch. Lịch âm (Tết, Trung thu) do admin nhập từng năm sau khi đối chiếu. Client không tự tính lịch âm, để tránh sai ngày.
- **Theo giờ**: T1 dùng múi giờ `Asia/Ho_Chi_Minh`. Giờ bắt đầu và kết thúc đặt trong cấu hình.

### 2.3 Dữ liệu chủ đề

Mỗi chủ đề là một đối tượng dữ liệu, không hard-code trong component. Dạng tham khảo:

```json
{
  "id": "tet",
  "label": "Tết Nguyên Đán",
  "palette": { "accent.primary": "#A3121B", "accent.secondary": "#E0B252" },
  "lights": { "lounge.led": { "color": "#FFD9A0", "intensity": 1.2 } },
  "decor": { "plum-branch": { "zones": ["Z01", "Z05"], "count": 6 } },
  "music": { "track": "tet-soan-01", "bpm": 92, "loop": true },
  "sfx": ["chime", "applause-soft"],
  "signs": { "lounge.board": "Chúc năm mới {năm}" },
  "dressHint": ["ao-dai", "so-mi-do", "vest"],
  "tierMin": "Trung",
  "calendar": [{ "from": "2027-01-30", "to": "2027-02-09", "tz": "Asia/Ho_Chi_Minh" }]
}
```

Lưu ý: các ngày trong ví dụ là minh họa, chưa đối chiếu. Admin phải nhập ngày thật.

Quy tắc: `lights` chỉ đổi màu và intensity của đèn đã có trong rig. Không thêm hay bớt đèn khi đổi chủ đề, vì đổi số đèn làm shader biên dịch lại và gây giật (mục 3.1).

### 2.4 Chuyển cảnh và tải

- Chuyển chủ đề mất 2.5 giây, trộn màu và intensity tuyến tính. Không tải lại trang.
- Asset của chủ đề tải theo kiểu lazy trước khi chuyển. Nếu tải lỗi, giữ chủ đề cũ và ghi log.
- Mức Thấp: bỏ hạt, bỏ bloom, chỉ phát một lớp nhạc, không chạy chuyển cảnh màu (đổi tức thì).
- Đổi chủ đề không làm đổi tên nhân vật, vị trí chỗ ngồi hay trạng thái người dùng.

### 2.5 Nội dung nhạy cảm

- Không dùng biểu tượng tôn giáo trong bất kỳ chủ đề nào.
- Không dùng hình người thật trong trang trí.
- Không tạo chủ đề cho dịp chính trị. Nếu có dịp lễ quốc gia khác, người dùng quyết định (câu hỏi 5).
- Chữ trên biển do admin nhập, có giới hạn 40 ký tự. Biển không chứa dữ liệu cá nhân.

---

## 3. Ánh sáng

### 3.1 Nguyên tắc kỹ thuật

- **Đơn vị**: three r155 trở lên dùng đơn vị vật lý (candela cho `PointLight` và `SpotLight`). Giá trị trong bảng dưới là điểm xuất phát, phải tinh chỉnh bằng bảng mẫu (mục 8.2). Không chép giá trị từ ví dụ cũ trước r155.
- **Số đèn cố định theo mức chất lượng.** Tắt đèn bằng `intensity = 0`, không gỡ hoặc thêm đèn. Đổi số đèn làm shader biên dịch lại. Ở Mức Thấp, không có đèn nào có bóng ngoài directional.
- **Chỉ một đèn có bóng** (directional) ở mức Thấp và Trung. Mức Cao có tối đa hai đèn có bóng ở lounge (T2).
- **Ánh sáng nền từ lightmap nướng.** Trần và sàn có AO và ánh sáng khuếch tán nướng sẵn (baked). Đèn realtime chỉ dùng cho hiệu ứng động và đèn bàn. Lightmap nướng ngoài runtime bằng công cụ dựng cảnh offline. Công cụ không được đưa vào runtime, và texture đầu ra là sản phẩm của dự án.
- **Tone mapping**: `THREE.AgXToneMapping` là mặc định vì màu trung tính hơn. `ACESFilmicToneMapping` làm màu neon rực hơn. Chọn bằng bảng mẫu của S2 (mục 8.2). Đặt trên renderer [THƯ VIỆN]. Khi dùng `EffectComposer` cần `OutputPass` để áp tone mapping đúng [POSTFX].
- **Không dùng** `RectAreaLight` quá bốn đèn. Loại này dùng LTC và chỉ hoạt động với `MeshStandardMaterial`.

### 3.2 Nhiệt độ màu

Màu hiển thị xấp xỉ theo công thức Planckian thông dụng. Chỉnh bằng mắt trên màn hình thật trước khi chốt.

| Nhiệt độ | Màu hex xấp xỉ | Dùng cho |
|---|---|---|
| 2200 K | #FF9227 | Đèn lồng Trung thu |
| 2700 K | #FFA757 | Đèn bàn tan ca, đèn lounge ấm, dải LED ấm |
| 3000 K | #FFB16E | Đèn spot điểm nhấn, quầy pantry, S4 |
| 4000 K | #FFCEA6 | Trần văn phòng, phòng họp, sảnh (S1) |
| 5000 K | #FFE4CE | Ánh sáng ngày giả lập qua directional |
| 6500 K | #FFF9FB | Đèn màn hình, tủ rack, nền LED |

### 3.3 Rig ánh sáng theo khu

Cường độ là giá trị khởi đầu, đơn vị three.js. Chi phí dùng bốn lớp:
- **A**: không có đèn realtime (emissive, hemisphere, baked). Gần như không tốn thêm.
- **B**: `PointLight` hoặc `SpotLight` không có bóng. [ƯỚC LƯỢNG] 0.1–0.3 ms mỗi đèn ở 1080p, mức Thấp.
- **C**: directional có bóng, hoặc `RectAreaLight`. [ƯỚC LƯỢNG] 1–3 ms.
- **D**: đèn có bóng dạng point (vẽ sáu lần), hoặc GTAO. [ƯỚC LƯỢNG] 3–6 ms. Không dùng ở mức Thấp và Trung.

| Khu | Đèn | Loại | Số lượng | K | Cường độ khởi đầu | Bóng | Bloom | Chi phí |
|---|---|---|---|---|---|---|---|---|
| Sảnh (Z01) | Trần sảnh | Emissive panel | 6 | 4000 K | emissive 1.0 | Không | Không | A |
| Sảnh (Z01) | Chiếu quầy Service Desk | Spot | 2 | 4000 K | 40 cd | Không | Không | B |
| Sảnh (Z01) | Ánh sáng chung S1 | Hemisphere | 1 | 4000 K (trời) | 0.9 | Không | Không | A |
| Làm việc (Z02–Z04) | Trần khu làm việc | Lightmap baked | 1 | 4000 K | theo lightmap | Có AO nướng | Không | A |
| Làm việc (Z02–Z04) | Ánh sáng ngày giả | Directional | 1 | 5000 K | 2.2 (tương đối) | Có, 1024 (Thấp) hoặc 2048 | Không | C |
| Làm việc (Z02–Z04) | Đèn bàn (T1) | Spot | 4 gần camera nhất | 2700 K | 15 cd | Không | Không | B |
| Làm việc (Z02–Z04) | Bóng tiếp xúc dưới bàn | ContactShadows | 1 | — | — | Cập nhật một lần | Không | A |
| Làm việc (Z02–Z04) | Bóng nhân vật | Blob texture | mọi nhân vật | — | — | Không tốn đèn | Không | A |
| Lounge (Z05) | Dải LED trần (màu theo chủ đề) | Emissive + point | 2 | 2700 K (mặc định) | point 25 cd | Không | Nhẹ | B |
| Lounge (Z05) | Đèn bàn cờ, bàn thẻ | Point | 2 | 3000 K | 25 cd | Không | Không | B |
| Lounge (Z05) | Đèn sân khấu quét (T2) | Spot | 4 | Theo chủ đề | 60 cd, quét | Không | Có | B |
| Lounge (Z05) | Spot tranh và cây | Spot | 2 | 3000 K | 30 cd | Không | Không | B |
| Lounge (Z05) | Biển neon S2 | Emissive, màu > 1 | 1 biển | 6500 K hoặc màu neon | emissive 2.5 | Không | Có | A (+ POSTFX) |
| Lounge (Z05) | Gương karaoke | Không đèn, envMap | 2 | — | — | — | — | A |
| Lounge (Z05) | Tia sáng sân khấu (chùm) | Mặt cone additive [SHADER] | 4 | Theo chủ đề | alpha 0.12 | — | Có | A (+ POSTFX) |
| Phòng họp (Z06) | Trần LED panel | Lightmap baked | mỗi phòng 1 | 4000 K | theo lightmap | Có AO nướng | Không | A |
| Phòng họp (Z06) | Đèn "Đang họp" | Emissive | 3 | 6500 K | emissive 1.0 | Không | Không | A |
| Lõi, WC, pantry (Z07) | Hành lang và WC | Lightmap baked + hemisphere | 1 | 4000 K | theo lightmap | Có AO nướng | Không | A |
| Lõi, WC, pantry (Z07) | Quầy bếp pantry | Spot | 2 | 3000 K | 25 cd | Không | Không | B |
| Lõi, WC, pantry (Z07) | Đèn treo bàn ăn | Point | 1 | 2700 K | 20 cd | Không | Không | B |
| Lõi, WC, pantry (Z07) | Dải lối thang bộ | Emissive | 4 | 4000 K | emissive 0.8 | Không | Không | A |
| Dự phòng (Z08) | Sân khấu tạm (nếu có) | Spot và LED | 4 spot + 1 LED | Như S3 | Như S3 | Không | Có | B (+ POSTFX) |
| Máy chủ, SOC (Z09) | Tủ rack, màn tổng hợp | Emissive | 6 | 6500 K | emissive 1.2 | Không | Có | A |
| Trang trí T3 | Cành mai, đào | Spot nhỏ | 1 | 2700 K | 10 cd | Không | Không | B |
| Trang trí T4 | Đèn lồng sao | Emissive + point | 8 đèn, 1 point | 2200 K | point 15 cd | Không | Có | B |
| Trang trí T7 | Nến bánh kem | Sprite lửa + point | 1 | 2200 K | point 5 cd | Không | Không | B |

### 3.4 Bloom, bóng, tone mapping theo mức chất lượng

| Thiết lập | Thấp | Trung | Cao |
|---|---|---|---|
| Bóng directional | 1024. Tắt tự cập nhật. Chỉ vẽ lại khi đổi khu hoặc chủ đề | 2048. Tắt tự cập nhật | 2048, PCFSoft. Vẽ lại khi camera đi quá 2 m |
| Bóng point | Không | Không | Tối đa 2, chỉ lounge khi T2 |
| Tone mapping | AgX, không composer | AgX, `OutputPass` [POSTFX] | AgX, `OutputPass` [POSTFX] |
| Bloom | Không | `UnrealBloomPass` nửa độ phân giải, strength 0.25 [POSTFX] | Nửa độ phân giải, strength 0.25–0.45 tùy chủ đề [POSTFX] |
| Chống răng cưa | Không MSAA, không SMAA | SMAA [POSTFX] | SMAA [POSTFX] |
| GTAO | Không | Không | Tùy chọn, mặc định tắt. `GTAOPass` [POSTFX] |
| DPR tối đa | 1.0 | 1.25 | 1.5 |
| Số đèn có hiệu lực tối đa | 4 | 6 | 8 |

Chi tiết kỹ thuật:
- `UnrealBloomPass` nhận ngưỡng 0.85 và bán kính 0.4. Chỉ các vật có màu lớn hơn 1 mới phát sáng, nên biển neon và đèn sân khấu là nguồn chính.
- Khi dùng composer, tạo render target dạng `HalfFloatType` chỉ ở mức Cao. Mức Trung dùng `UnsignedByteType`, tiết kiệm bộ nhớ (mục 9.4).
- `renderer.shadowMap.autoUpdate = false`. Gọi `renderer.shadowMap.needsUpdate = true` khi đổi khu, đổi chủ đề, hoặc camera đi quá ngưỡng. Với khu làm việc có ít chuyển động, điều này tiết kiệm nhiều lượt vẽ bóng.
- Canvas của R3F 8 dùng `frameloop="demand"` để không vẽ lại khi cảnh đứng yên. Phần nhân vật đang chuyển động gọi `invalidate()` theo tần suất giới hạn (mục 9.5).
- `gl.powerPreference`: đặt `"low-power"` ở mức Thấp để tránh đánh thức GPU rời trên laptop có hai GPU. Mức Cao đặt `"high-performance"`.

---

## 4. Âm thanh

### 4.1 Nguyên tắc

- Âm thanh tổng hợp 100% bằng Web Audio API. Repo không chứa file âm thanh nào cho đến khi có license rõ.
- Nhạc được soạn bởi nhóm và phát bằng sequencer (dao động, bộ lọc và trống tổng hợp). Không tải bản thu sẵn.
- Âm thanh nhỏ (gõ phím, chuông, vỗ tay) tổng hợp từ nhiễu và sóng sin theo công thức ở mục 4.4. Nếu cần mẫu thu sẵn, chỉ dùng nguồn CC0 hoặc CC BY đã ghi trong `docs/design/ASSET_SOURCES.md`.
- Mặc định tắt tiếng. Âm thanh chỉ bật sau cử chỉ của người dùng (nhấn nút), đây là yêu cầu của trình duyệt.
- Âm lượng mặc định 25%.

### 4.2 Lớp nền theo khu (ambient)

| Khu | Lớp | Nội dung | Kỹ thuật | Mức đích | Nhịp, khóa |
|---|---|---|---|---|---|
| Làm việc (Z02–Z04) | Tiếng văn phòng | Tiếng nền nâu (brown noise) 200–1200 Hz. Gõ phím ngẫu nhiên 0.2 đến 1.5 lần mỗi giây | Buffer nhiễu 4 s lặp, lowpass 1200 Hz. Click tổng hợp | −38 dBFS (nền) | Không có |
| Sảnh (Z01) | Tiếng phòng | Nhiễu hồng rất nhẹ. Tiếng cửa thang khi có sự kiện | Buffer pink noise, lowpass 800 Hz | −42 dBFS | Không có |
| Lounge ban ngày (Z05, T0) | Chill pad | Am9, Fmaj7, Cmaj7, G6. Pad răng cưa 3 bè, lọc 800 Hz, bật tắt chậm | Oscillator, BiquadFilter, LFO | −30 dBFS | 70 BPM, A minor |
| Pantry, phòng nghỉ (Z06, Z07, S4) | Ambient gỗ | Chuông tre tổng hợp thưa, 1 tiếng mỗi 6–12 s. Nền nhiễu rất thấp | Sóng sin, envelope ngắn, thang năm âm | −36 dBFS | Tự do |
| Đêm văn nghệ (Z05, T2) | Nhạc sôi động | Xem mục 4.3 | Sequencer | −20 dBFS | 118 BPM |
| Phòng họp (Z06) | Yên tĩnh | Không có nhạc. Chỉ có tiếng nền của điều hòa (nếu thêm) | Không có | — | — |

### 4.3 Nhạc theo chủ đề (tự soạn)

| Chủ đề | BPM | Khóa hoặc thang | Cấu trúc | Nhạc cụ tổng hợp | Độ dài vòng |
|---|---|---|---|---|---|
| T1 Tan ca | 70 | D dorian | 32 nhịp, 4 phần | Điện piano (sin và FM nhẹ), bass sin, hi-hat nhẹ, chổi (brush) từ nhiễu | Khoảng 1 phút 50 giây |
| T2 Văn nghệ | 118 | E minor | 32 nhịp, có cầu và đoạn cao trào | Kick, snare, hi-hat từ nhiễu, bass saw, chord stab, lead square | Khoảng 65 giây |
| T3 Tết | 92 | D pentatonic | 16 nhịp | Sáo và kèn tổng hợp (sin và rung nhẹ), chuông, trống nhẹ | Khoảng 42 giây |
| T4 Trung thu | 72 | G pentatonic | 16 nhịp | Kalimba tổng hợp (sin, envelope nhanh), chuông nhỏ | Khoảng 53 giây |
| T5 8/3 | 96 | C major | 16 nhịp | Piano tổng hợp, pad nhẹ | Khoảng 40 giây |
| T6 20/11 | 84 | F major | 16 nhịp | Guitar tổng hợp (Karplus-Strong), pad | Khoảng 46 giây |
| T7 Sinh nhật | 124 | G major | 32 nhịp | Trống, bass, lead, arpeggio vui | Khoảng 62 giây |

Quy tắc về nội dung nhạc:
- Giai điệu, hợp âm và bản phối đều do nhóm soạn. Không dùng bài hát đại chúng, dân ca đã có bản phối được bảo hộ, hay bản thu của người khác.
- Dân ca đã hết hạn bảo hộ vẫn cần bản phối mới của nhóm, và phải ghi tên tác giả gốc (nếu có) và người phối trong bảng nhạc.
- Nhạc karaoke có lời hiện trên màn hình chỉ dùng bài do nhóm sáng tác. Lý do ghi trong `docs/ARCHITECTURE.md`, mục "Lưu ý pháp lý về nhạc".

### 4.4 Âm thanh sự kiện (SFX)

| Âm | Kịch bản | Công thức tổng hợp | Độ dài | Mức đỉnh |
|---|---|---|---|---|
| Gõ phím | Gõ phím hoặc nhấn nút nội dung | Nhiễu trắng 8 ms, bandpass 2.5–3.5 kHz, Q 2, envelope mũ | 8–12 ms | −22 dBFS |
| Nhấn nút giao diện | Bấm nút HUD | Sin 1800 Hz kèm nhiễu 4 ms, giảm trong 40 ms | 40 ms | −20 dBFS |
| Ghim lên bảng | Thêm ghim hoặc kudos | Hai sin 2200 Hz và 4700 Hz, giảm trong 60 ms, pan ngẫu nhiên ±0.3 | 60 ms | −24 dBFS |
| Thông báo | Có tin mới hoặc kudos mới | Hai nốt 880 Hz và 1320 Hz, mỗi nốt 150 ms, attack 5 ms | 320 ms | −18 dBFS |
| Vỗ tay | Sau kudos hoặc sau sự kiện | 30–60 tiếng vỗ, mỗi tiếng là nhiễu bandpass 1.5–3 kHz trong 25 ms, lệch thời điểm 20–90 ms | 2–3 s | −16 dBFS |
| Pháo giấy | Sinh nhật công ty | Nhiễu bandpass 3–6 kHz, envelope nhanh, lặp 5 lần ngẫu nhiên | 0.6 s | −18 dBFS |
| Cửa thang | Có người vào sảnh (tùy chọn) | Bộ lọc lowpass quét 300 → 1200 Hz, thump sin 90 Hz | 0.8 s | −26 dBFS |
| Hơi máy pha | Khi hơi nước bay (mục 1.4) | Nhiễu lowpass 2 kHz, envelope 0.8 s | 0.8 s | −30 dBFS |
| Chuông tre | Ambient pantry | Sin 1200 Hz, tỉ lệ tần số ngẫu nhiên 1.0–1.25 | 1.2 s | −34 dBFS |

### 4.5 Kiến trúc engine

- **Bus**: bốn bus `master`, `music`, `ambient`, `sfx`, mỗi bus có `GainNode`. `master` có `DynamicsCompressorNode` để chặn đỉnh.
- **Khởi tạo**: tạo `AudioContext` khi người dùng bật âm thanh lần đầu, không tạo sớm.
- **Chuyển khu**: crossfade ambient 1.5 s, gain tuyến tính.
- **Chuyển chủ đề**: crossfade nhạc 2.5 s, chờ vạch nhịp kế tiếp để không lệch nhịp.
- **Sequencer**: dùng bộ lập lịch kiểu lookahead. Đọc `AudioContext.currentTime`, nhìn trước 0.1 s, gọi lại mỗi 25 ms. Đây là cách làm thông dụng, không cần thư viện.
- **Giới hạn giọng**: tối đa 16 giọng đồng thời (SFX và pad). Giọng mới cắt giọng cũ có envelope ngắn nhất.
- **Pan**: `StereoPannerNode` theo góc giữa camera và nguồn âm, giới hạn ±0.8.
- **Tiết kiệm**: khi tab ẩn, giảm bus `ambient` xuống −12 dB. Khi khu không có người trong 5 phút, tắt ambient của khu đó.
- **Bộ nhớ**: nhiễu dùng buffer 4 s mono 22050 Hz (khoảng 88 KB). Nhạc tổng hợp lúc chạy, không lưu. Tránh buffer stereo 44.1 kHz 30 s, vì float32 tốn khoảng 10.6 MB không cần thiết.
- **Dựng buffer**: dựng nhiễu khi khởi tạo, chia nhỏ để không chặn luồng chính quá 20 ms.
- **CPU**: mục tiêu dưới 3% trên laptop tầm trung [ƯỚC LƯỢNG]. Đo bằng `performance.now()` quanh hàm lập lịch.
- **An toàn âm lượng**: đỉnh tổng không vượt −1 dBFS (đo khi render thử). Trong 300 ms đầu của một âm, đỉnh không vượt −12 dBFS.

### 4.6 Nguồn và license

- Âm thanh tự tổng hợp: không cần ghi công. Vẫn ghi "tự tạo, nhóm dự án, ngày" trong `THIRD_PARTY.md`, mục âm thanh.
- Mẫu thu sẵn (ví dụ tiếng vỗ tay thật) chỉ nhận CC0 từ Freesound, kiểm tra từng file. Lưu link và license từng file, theo quy định ở `docs/design/ASSET_SOURCES.md`.
- Không dùng: nhạc thương mại, bản karaoke sao chép, nhạc CC BY-NC, CC BY-ND hoặc GPL.
- Không dùng dân ca làm nhạc nền nếu chưa có bản phối mới của nhóm.

---

## 5. Mặt bằng và decor

### 5.1 Kiểm tra hình học

Kết quả kiểm tra dựa trên số liệu trong `docs/FLOORPLAN_IT.md`:

| Mã | Kiểm tra | Kết quả | Hành động |
|---|---|---|---|
| G01 | Số chỗ tối đa theo bước 1.2 m, sát mép, không ghế | 246 | Chọn phương án ở mục 5.2 |
| G02 | Số chỗ có ghế, hai hàng đối diện mỗi khối | khoảng 104 | Như trên |
| G03 | Footprint chồng lấn | `wc_block` và `core_lift3` chồng 3.2 m² | Sửa vị trí (phát hiện 2) |
| G04 | Phòng họp đủ diện tích | mr3: 1.1 m²/người. mr2: 1.3 m²/người | Giảm số chỗ hoặc đổi bàn (phát hiện 3) |
| G05 | Khối bàn không đè lõi giao thông | Không phát hiện chồng lấn | Đạt |
| G06 | Khoảng cách từ lối vào đến quầy | Lối vào ở y 18.4–18.8, quầy ở y 16.0–17.2. Cách nhau khoảng 1.2 m | Đạt |
| G07 | Khu Bắc: "4 hàng × 10 chỗ = 40" | Bước 1.2 m cho tối đa 52 chỗ theo hình học. Hai hàng đối diện cho 24 chỗ | Ghi "40" là mục tiêu chưa khả thi với hai hàng đối diện |
| G08 | Khu dự phòng không đặt bàn | Đúng quyết định trong bản vẽ | Giữ nguyên |
| G09 | Khoảng cách giữa các khối bàn | 0.4 đến 1.4 m. Riêng L1 và L2 cách nhau 0.4 m (y 9.5 đến 9.9), không đủ lối đi 1.2 m | Xem L1 và L2 là một cụm, hoặc giãn ra thêm 0.8 m |
| G10 | Lối đi và đường thoát | Mức tối thiểu 1.2 m (đề xuất thiết kế) | Đối chiếu quy chuẩn PCCC hiện hành. Chưa xác minh trong phiên này |

Lưu ý G05: `desk_B4` (x 20.5–25.1, y 19.9–24.5) và `server_room` (x 21.3–24.1, y 25.5–28.5) cách nhau 1.0 m theo trục y. Hợp lệ, nhưng cần đường đi giữa chúng.

### 5.2 Ba phương án cho số chỗ

Quyết định thuộc về người dùng. Bảng dưới nêu đánh đổi, không đề xuất cách nào là đúng.

| Phương án | Mô tả | Số chỗ có ghế | Đánh đổi |
|---|---|---|---|
| A. Giữ sàn 58 × 30 m | Chấp nhận khoảng 104 chỗ cố định. Làm việc linh hoạt, bàn dùng chung | khoảng 104 | Phù hợp với tỷ lệ chỗ trên người thấp. Cần chính sách đặt chỗ và quy trình check-in |
| B. Mở rộng sàn | Dùng khu dự phòng 231 m² cho bàn. Với 5 m² mỗi chỗ kể cả lối đi, 484 chỗ cần khoảng 2 400 m² sàn làm việc, trong khi cả sàn chỉ 1 740 m² | khoảng 104 + 45 đến 75 (khu dự phòng) | Thay đổi bản vẽ lớn. Vẫn không đủ 484 chỗ trong diện tích hiện có. Cần bản vẽ mới |
| C. Giữ 484 nhân sự, 3D chỉ hiện chỗ có ghế | Giữ chỉ tiêu 484 cho nhân sự. Người online không có chỗ đứng ở điểm tụ | khoảng 104 chỗ có ghế | Hợp với làm việc hybrid. Không hợp nếu mục tiêu là một chỗ cho mỗi người |

Các con số trong bảng là ước lượng theo mục 0. Nếu chọn A hoặc C, bộ sinh chỗ ngồi (mục 5.6) không cần sửa code, chỉ đổi dữ liệu khối bàn.

### 5.3 Bản đồ zone và diện tích

Gom các vật thể trong `FLOORPLAN_IT.md` thành 9 zone. Diện tích tính từ tọa độ trong bản vẽ (m²), làm tròn một chữ số.

| Zone | Tên | Vật thể trong mặt bằng | Diện tích (m²) | Nội dung chính |
|---|---|---|---|---|
| Z01 | Sảnh vào và Service Desk | `entrance`, `service_desk`, `notice_board` | 10.1 | Quầy, bảng thông báo, sảnh. Nhân vật xuất hiện ở (25.0, 17.0) |
| Z02 | Khu làm việc Nam | `desk_B1` đến `desk_B7` | 162.4 | Bảy squad, mỗi squad một màu |
| Z03 | Khu làm việc Tây | `desk_L1`, `desk_L2`, `desk_L3` | 73.2 | Ba cụm bàn phía Tây |
| Z04 | Khu Bắc và NOC | `open_north` | 68.6 | Khu bàn phía Bắc, tường NOC |
| Z05 | Lounge Đông | `lounge` trừ `util_health` | 171.8 | Khu vui chơi, karaoke, bảng vinh danh, sân khấu nhỏ |
| Z06 | Phòng họp và phòng riêng | `mr1`, `mr2`, `mr3`, `util_quiet`, `util_health` | 68.8 | Phòng họp, phòng nghỉ, phòng y tế và mẹ bé |
| Z07 | Lõi, WC, pantry, tiện ích | `core_st1`, `core_st2`, `core_st3`, `core_lift1`, `core_lift2`, `core_lift3`, `wc_block`, `pantry`, `util_coffee`, `util_print`, `util_store` | 205.5 | Thang, thang máy, WC, pantry, máy in, kho |
| Z08 | Khu dự phòng | `reserved` | 231.0 | Trống, không bàn. Có thể làm sân khấu tạm |
| Z09 | Hạn chế truy cập | `server_room`, `soc_room` | 22.2 | Phòng máy chủ và SOC (mục 5.7) |

Tổng các zone là khoảng 1 014 m². Phần còn lại của sàn (khoảng 726 m²) là lối đi, tường và khoảng trống chưa gán zone. Nếu muốn có zone cho hành lang, cần thêm một mã riêng.

`util_health` nằm trong `lounge`, nên diện tích lounge (Z05) đã trừ phần này. `wc_block` và `core_lift3` chồng nhau 3.2 m² (phát hiện 2), nên Z07 tính lặp 3.2 m².

### 5.4 Bộ chi tiết một chỗ làm việc

Mỗi chỗ có bộ chi tiết dưới đây. Tỷ lệ phần trăm là xác suất theo chỗ (ví dụ 60% nghĩa là khoảng 6 trên 10 chỗ). Chọn theo seed cố định để cùng một chỗ luôn có cùng đồ.

| Hạng mục | Kích thước (m) | Vật liệu | Màu (hex) | Số lượng mỗi chỗ | Ghi chú |
|---|---|---|---|---|---|
| Mặt bàn | 1.2 × 0.6 × 0.025 | MDF phủ melamine vân gỗ | #D9B98A | 1 | Các bàn cạnh nhau ghép thành hàng |
| Khung bàn | 1.2 × 0.6 × 0.72 | Thép sơn tĩnh điện | #2B3238 | 1 bộ | Máng dây dưới mặt bàn |
| Màn hình 24 inch | 0.54 × 0.33 × 0.02 | Nhựa mờ, viền đen | #1F262D | 2 (Trung, Cao), 1 (Thấp) | Mặt màn dùng `CanvasTexture` |
| Chân đế màn hình | Đĩa r 0.08, cột 0.25 | Nhựa | #2B3238 | 2 | Gắn cùng màn hình |
| Nội dung màn hình | 512 × 300 px | Canvas tự vẽ | Nền #0E141A, chữ #E8F4FF | 1 mặt | Cập nhật 1 Hz cho màn trong tầm nhìn, còn lại tĩnh |
| Bàn phím | 0.44 × 0.14 × 0.02 | Nhựa | #2E3640 | 1 | Phím dùng atlas chung |
| Chuột | 0.06 × 0.11 × 0.035 | Nhựa | #3A414B | 1 | — |
| Lót chuột | 0.25 × 0.20 × 0.003 | Cao su vải | `squad.n` hoặc #5E8C61 | 1 | — |
| Cốc bút | r 0.04, cao 0.10 | Gốm hoặc nhựa | #F2C14E, #2F5D8A, #C06C4A, #E6D8C3 (ngẫu nhiên) | 1 (40%) | Có thể cùng màu với sổ |
| Bút cắm trong cốc | r 0.004, dài 0.14 | Nhựa | #1F262D, #2F5D8A | 3 đến 4 | — |
| Kẹp giấy | Vòng r 0.012 | Thép | #C9CED4 | 1 hộp nhỏ | — |
| Sổ tay | 0.14 × 0.21 × 0.012 | Bìa cứng | #2F5D8A, #C06C4A, #F2C14E, #5E8C61 | 1 (60%) | — |
| Cây xương rồng | Chậu r 0.035, cao 0.04. Thân cao 0.09 | Gốm và thân xanh | Chậu #C06C4A, thân #6E9A6A | 1 (20%) | Gai là InstancedMesh |
| Cây nhỏ (trầu bà, lưỡi hổ) | Chậu r 0.05, cao 0.06. Lá 6 đến 10 mảnh | Gốm và lá | Lá #4F7F52 | 1 (30%) | Lá là InstancedMesh |
| Ly nước | r 0.04, cao 0.10 | Thủy tinh (alpha 0.25) | Nước #8FC6D9 | 1 (50%) | Không dùng `transmission` |
| Khăn lau | 0.20 × 0.15 × 0.02 | Cotton | #E6D8C3 | 1 (30%) | — |
| Bảng tên bàn | 0.12 × 0.04 × 0.003 | Nhựa mờ | Nền #FFFFFF, chữ #1F262D | 1 | Chỉ ghi tên squad và số chỗ, không ghi tên người |
| Thẻ nhân viên | 0.0856 × 0.054 (CR80) | Nhựa | #F4F1EA | 1 (60%) | Trên ghế hoặc bàn. Đèn LED nhỏ trên thẻ thể hiện trạng thái online |
| Đèn bàn | Đế r 0.06, cần 0.35, chụp 0.12 | Kim loại và vải | Đế #2B3238, chụp #F4F1EA | 1 (40%) | Đèn bật theo T1 (mục 3.3) |
| Ghế công thái học | Đế 5 chấu r 0.31, cao 0.45. Lưng 0.50 × 0.60 | Lưới và nhựa | Lưng #4A5560, đệm #2B3238 | 1 | Màu có biến thể nhẹ theo squad |
| Tai nghe (đặt trên bàn) | 0.18 × 0.08 | Nhựa | #2B3238 | 1 (20%) | Trang trí |

### 5.5 Chi tiết theo zone

**Z01 Sảnh và Service Desk**

| Vật thể | Kích thước (m) | Vật liệu | Màu (hex) | Số lượng | Ghi chú |
|---|---|---|---|---|---|
| Quầy Service Desk | 4.5 × 1.2 × 1.1 | Mặt đá giả, thân gỗ | Mặt #E5E2DC, thân #A0683F | 1 | Trong sảnh, cách lối vào khoảng 1.2 m |
| Màn hình chào | 1.2 × 0.7 | LED | Nền #0E141A | 1 | Không có dữ liệu cá nhân |
| Bảng thông báo | 5.0 × 0.7 × 0.03 | Bần (cork) trên khung nhôm | Bần #C8A77A | 1 | 40 đầu ghim (InstancedMesh) và giấy ghi chú |
| Cửa thang máy (decor) | 1.1 × 2.2 | Thép xước | #9AA3AD | 3 cặp | Chỉ trang trí, không đi qua |
| Thảm chân lối vào | 3.0 × 1.6 × 0.01 | Cao su vải | #3B4650 | 1 | Dòng chữ chỉ dẫn ngắn |
| Cây lớn | Cao 1.6, chậu r 0.3 | Chậu xi măng, lá | Chậu #C9C4BB, lá #4F7F52 | 2 | Hai bên quầy |
| Biển chỉ dẫn WC, thang | 0.3 × 0.2 | Mica phẳng | Nền #FFFFFF, biểu tượng #1F262D | 3 | Biểu tượng tự vẽ |
| Ghế chờ | 1.6 × 0.6 × 0.45 | Vải, khung kim loại | Vải #B8C2C8 | 2 | Tùy chọn |

**Z02 Khu làm việc Nam (B1 đến B7)**

- Bảy cụm, mỗi cụm một khối bàn theo mục 5.6, một biển treo trần (2.4 × 0.25 m) ghi tên squad.
- Mỗi cụm có một cây lớn cao 1.3 m, hai tủ hồ sơ 0.8 × 0.45 × 1.8 m (#8A9299).
- Thảm 0.6 m có vạch màu `squad.n` dọc lối đi.
- Vách thấp 1.1 m, không kính, hai đoạn mỗi cụm. Chỉ để đánh dấu cụm.
- Đèn theo rig S1 ở mục 3.3.

**Z03 Khu làm việc Tây (L1 đến L3)**

- Ba cụm, mỗi cụm như Z02. L1 và L2 cách nhau 0.4 m (G09), nên coi là một cụm hoặc giãn ra.
- Tường cây xanh 6.0 × 2.4 × 0.3 m, khung kim loại, lá nhỏ (InstancedMesh). Mức Thấp dùng 40 lá, Trung 90, Cao 120.

**Z04 Khu Bắc và NOC**

- Tường NOC: 6 panel 0.9 × 0.9 m (hai hàng ba panel), tổng 5.4 × 1.8 m.
- Màn NOC hiển thị bảng tổng hợp do máy chủ cung cấp, cập nhật mỗi phút. Không hiện IP, tên máy hay log chi tiết.
- Bàn Bắc: 24 chỗ theo hai hàng đối diện (mục 5.1, G07).
- Hai kệ sách 2 × 0.4 × 2.0 m, gỗ S1. Cây cảnh lớn hai chậu.

**Z05 Lounge Đông (khu vui chơi và giao lưu)**

| Vật thể | Kích thước (m) | Vật liệu | Màu (hex) | Số lượng | Ghi chú |
|---|---|---|---|---|---|
| Bàn cờ (vua, tướng, caro) | 0.9 × 0.9 × 0.75 | Gỗ, mặt vân ô | Gỗ #5C3A22, ô #E6D8C3 và #3B2F2A | 2 bàn | Quân cờ hai mẫu low-poly, 32 quân mỗi bàn (InstancedMesh) |
| Bàn thẻ bài | 1.2 × 0.8 × 0.75 | Mặt nỉ | #2E6B5A | 1 | Bộ bài 52 lá, mặt sau họa tiết tự vẽ, không dùng mẫu thương mại |
| Sofa 3 chỗ | 2.2 × 0.95 × 0.85 | Vải nhung (sheen) | #3B2F4A (S2) hoặc #E6D8C3 (S4) | 2 | Đổi màu theo chủ đề |
| Ghế bành | 0.85 × 0.85 × 0.9 | Vải | Như sofa | 4 | — |
| Bàn trà | 1.1 × 0.6 × 0.42 | Gỗ óc chó, mặt kính | #5C3A22 | 2 | Mặt kính alpha 0.25 |
| Thảm | 3.0 × 2.2 × 0.01 | Sợi tổng hợp | Nền #232C3F, họa tiết tự vẽ | 2 | — |
| Tranh trừu tượng | 1.0 × 0.7 × 0.04 | Canvas | Bốn màu lấy từ S2 | 4 | Tranh tự tạo (generative), không dùng tranh có bản quyền |
| Cây cảnh lớn | Cao 1.8, chậu r 0.3 | Gốm, lá | Lá #2E6B5A | 3 | — |
| Cây nhỏ | Cao 0.6 | Gốm, lá | Lá #4F7F52 | 6 | — |
| Gương | 1.2 × 2.2 | Kính, metalness 1 | — | 2 | Mục 1.3, không dùng `Reflector` |
| Máy karaoke | 0.45 × 0.3 × 0.12 | Nhựa | #1B1F27, LED | 1 | Chỉ sáng khi T2 |
| TV karaoke | 1.45 × 0.83 × 0.05 | LED | Viền #111111 | 1 | Lời hiển thị chỉ là bài do nhóm soạn (mục 4.6) |
| Micro | 0.05 × 0.2 | Nhựa | #1F262D | 2 | Dây cáp là đường cong |
| Loa tháp | 0.3 × 0.3 × 0.9 | Vải lưới (texture) | #14181F | 2 | Chỉ có lưới vải, không có chi tiết loa |
| Sân khấu nhỏ | 3.0 × 2.0 × 0.25 | Gỗ ép sơn | #14171F | 1 | Chỉ hiện khi T2, T3, T7 |
| Màn LED nền sân khấu | 3.0 × 1.6 | LED | Theo chủ đề | 1 | — |
| Bàn bóng bàn (tùy chọn) | 2.74 × 1.525 × 0.76 | Gỗ phủ | #2E6B5A | 0 hoặc 1 | Chờ người dùng (câu hỏi 9) |
| Bảng vinh danh (kudos) | 2.4 × 1.4 | Bần, khung | #C8A77A | 1 | Ghim theo mỗi lượt kudos |
| Bảng đen lời tri ân | 2.0 × 1.2 | Bảng đen | #2D3A34 | 1 | Chỉ hiện khi T6 |

**Z06 Phòng họp và phòng riêng**

| Phòng | Kích thước (m) | Nội dung | Ghi chú |
|---|---|---|---|
| mr1 (8 chỗ) | 5.0 × 4.7 | Bàn 3.2 × 1.2 × 0.75 gỗ sồi, 8 ghế. TV 75 inch (1.66 × 0.94 m). Bảng trắng 2.0 × 1.0 m. Camera hội nghị 0.15 × 0.1 m. Biển "Đang họp" 0.25 × 0.1 m. Cây 1.2 m | Đặt phòng qua API |
| mr2 (10 chỗ) | 4.3 × 3.0 | Bàn oval ngắn 2.6 × 1.0 × 0.75 m (thay bàn dài để có lối đi). 10 ghế lưng thấp. TV 65 inch (1.45 × 0.83 m) | Chỗ sát, cần kiểm tra lại bố trí |
| mr3 (12 chỗ, đề xuất 8 đến 9) | 4.4 × 3.0 | Bàn 3.0 × 1.0 m, 8 ghế. Hoặc bàn chữ U, 9 ghế. TV 65 inch. Bảng trắng 1.5 × 1.0 m | Phát hiện 3: 12 chỗ không đủ lối đi |
| util_quiet (phòng nghỉ yên tĩnh) | 2.0 × 2.6 | Ghế bành, cây, đèn đứng. Nội thất S4 | Đặt được như phòng họp |
| util_health (phòng y tế, mẹ và bé) | 4.0 × 3.5 | Giường khám 1.9 × 0.9 m, tủ thuốc 0.8 × 0.4 × 1.8 m, ghế bành, bàn nhỏ 0.6 × 0.6 m, bồn rửa 0.5 m. Ghế và bàn thay đồ cho mẹ và bé | Nằm trong lounge, có vách kính |
| Cửa kính phòng họp | 0.9 × 2.2 | Kính có viền | Ba cửa. Biển trạng thái thể hiện tình trạng đặt phòng |

**Z07 Lõi, WC, pantry, tiện ích**

| Vật thể | Kích thước (m) | Vật liệu | Màu (hex) | Số lượng | Ghi chú |
|---|---|---|---|---|---|
| Thang bộ | Rộng 1.2 m, bậc 0.28 × 0.17 | Bê tông sơn | Bậc #C9C4BB, lan can #5B636B | 4 (st1, st2, st3 và cầu thang phụ) | Không mở rộng |
| Cabin thang máy | 1.6 × 1.6 × 2.2 | Thép và kính | #9AA3AD | 3 (lift1, lift2, lift3) | Cửa mở và đóng theo hiệu ứng |
| WC | 9.2 × 6.0 | Gạch men 30 cm, vách ngăn | Gạch #F4F1EA, vách #D9DDE2, biển #1F262D | 1 khối | Ba nhóm: Nam, Nữ, khuyết tật. Biểu tượng tự vẽ |
| Bồn cầu | 0.4 × 0.7 | Sứ | #F4F1EA | 10 | Ước lượng |
| Lavabo | 0.55 × 0.45 | Sứ, gương | #F4F1EA | 8 | — |
| Pantry (bếp và bàn ăn) | 6.0 × 6.5 | Gỗ sáng, đá, gạch | Gỗ #A0683F, đá #E5E2DC | 1 khu | Quầy 4.5 × 0.6 × 0.9 m |
| Máy pha espresso | 0.4 × 0.4 × 0.45 | Kim loại, nhựa | #2B3238 | 2 | Có hơi nước (mục 1.4) |
| Tủ lạnh | 0.6 × 0.6 × 1.8 | Kim loại | #DADDE0 | 1 | — |
| Bàn ăn | 1.6 × 0.8 × 0.75 | Gỗ | #A0683F | 2 | Mỗi bàn 3 ghế, 0.45 × 0.45 × 0.85 m |
| Coffee corner | 4.0 × 2.4 | Gỗ, đá | Gỗ #A0683F, đá #E5E2DC | 1 | Ghế cao 2, máy pha 1 |
| Máy in A3 (util_print) | 0.6 × 0.6 × 1.0 | Thép sơn | #3B4650 | 1 | Kệ văn phòng phẩm 1.8 m. Chỉ thông tin |
| Kho thiết bị (util_store) | 2.9 × 2.7 | Kệ thép | #5B636B | 3 kệ 1.2 × 0.5 × 2.0 m | Chỉ IT và admin (mục 5.7) |

**Z08 Khu dự phòng**

| Vật thể | Kích thước (m) | Vật liệu | Màu (hex) | Số lượng | Ghi chú |
|---|---|---|---|---|---|
| Sàn trống | 15.4 × 15.0 | Thảm xám ấm | #D8D3C8 | 1 | Không bàn, không đèn riêng |
| Cột lưới | 0.6 × 0.6 × 3.2 | Bê tông sơn | #E6E2D9 | 0 đến 4 | Chỉ đánh dấu lưới, không bắt buộc |
| Sân khấu tạm (nếu chọn, câu hỏi 8) | 6.0 × 4.0 × 0.3 | Gỗ ép | #14171F | 0 hoặc 1 | Chỉ khi có sự kiện |

**Z09 Phòng máy chủ và SOC**

| Vật thể | Kích thước (m) | Vật liệu | Màu (hex) | Số lượng | Ghi chú |
|---|---|---|---|---|---|
| Vách kính phòng máy chủ | 2.8 × 3.0 × 2.8 | Kính mờ, viền thép | Kính alpha 0.35 | 1 | Nhân viên thường chỉ thấy khung và biển |
| Tủ rack | 0.6 × 1.0 × 2.0 | Thép | #2B3238 | 4 | Đèn LED 6500 K (emissive). Không có nút điều khiển |
| Màn tổng hợp SOC | 2.0 × 1.1 | LED | Nội dung tóm tắt | 2 | Chỉ con số tổng hợp (mục 5.7) |
| Bàn SOC | 1.6 × 0.8 × 0.75 | Gỗ phủ | #5E6670 | 4 | Chỉ IT và admin |
| Sàn chống tĩnh điện | 2.8 × 3.0 | Ô 60 cm | #C9CED4 | 1 | — |

### 5.6 Bộ sinh chỗ ngồi

Quy tắc, viết dưới dạng mô tả thuật toán, không phải code:

1. Đầu vào: một khối `(x0, y0, x1, y1)` từ `FLOORPLAN_IT.md`, và loại (`squad`, `lab`, `north`).
2. Chiều rộng `W = x1 − x0`, chiều sâu `D = y1 − y0`.
3. Số hàng: nếu `D ≥ 3.0` thì hai hàng đối diện. Nếu `D < 3.0` thì một hàng.
4. Số chỗ mỗi hàng: `floor(W / 1.2)`. Bước 1.2 m là khoảng cách giữa hai chỗ liền nhau, theo bản vẽ.
5. Tổng chỗ của khối = số hàng × số chỗ mỗi hàng.
6. Kiểm tra độ sâu. Từ mép bàn hàng A đến mép bàn hàng B là 3.0 m (0.6 bàn, 0.9 ghế, 0.9 ghế, 0.6 bàn). Khối sâu 4.6 m còn 1.6 m, gồm lối đi 1.2 m và lề 0.2 m mỗi phía. Khối sâu 3.0 m (L3) có hai hàng sát nhau, không có lối đi bên trong, lối vào từ hai đầu.
7. Vị trí từng chỗ tính từ mép khối, lề 0.2 m mỗi phía. Khoảng cách giữa hai chỗ liền nhau trong hàng là 1.2 m.
8. Tổng số chỗ được so với con số đã xác nhận (kiểm tra A01, mục 8.1). Nếu lệch, báo lỗi và không tự thêm hay bớt.
9. Chỗ không có người vẫn hiện ghế, bàn và màn hình ở trạng thái tắt. Trạng thái online, bận, họp lấy từ dữ liệu presence.

Áp dụng cho mặt bằng hiện tại, kết quả là 104 chỗ: B1 8, B2 8, B3 6, B4 6, B5 6, B6 6, B7 10, L1 10, L2 10, L3 10, Bắc 24.

### 5.7 Quyền truy cập và nội thất theo vai trò

| Vai trò | Z01 đến Z08 | Z09 phòng máy chủ | Z09 SOC | Kho thiết bị (util_store) |
|---|---|---|---|---|
| employee | Đầy đủ | Chỉ thấy vách kính và biển "Khu hạn chế". Không có nội thất | Chỉ thấy vách kính và biển. Không có nội thất | Chỉ thấy vỏ bên ngoài |
| it | Đầy đủ | Nội thất và sơ đồ rack. Không có nút điều khiển | Màn tổng hợp (con số tóm tắt) | Đầy đủ |
| admin | Đầy đủ | Như IT | Màn tổng hợp (con số tóm tắt) | Đầy đủ |

Nguyên tắc:
- **Nội thất khu hạn chế không đi trong gói tải của nhân viên thường.** Gói tải phân theo vai trò, lấy từ máy chủ sau khi xác thực. Lưu ý: nếu gói chung chứa mesh nội thất, người dùng có thể lấy được bằng công cụ phát triển của trình duyệt. Cách này chỉ giảm bề mặt tiếp xúc, không phải lớp bảo vệ đủ cho nội dung nhạy cảm.
- **Màn SOC chỉ có con số tổng hợp** (số cảnh báo theo mức, thời gian cập nhật). Không có IP, tên máy, log hay nội dung cảnh báo.
- **Trang trí cố định không chứa tên người thật.** Bảng tên bàn chỉ ghi tên squad và số chỗ. Tên đầy đủ chỉ hiện trong panel hồ sơ, và chỉ với người đã đồng ý.
- Kiểm tra A13 (mục 8.1) xác nhận gói của nhân viên thường không có mesh Z09.

---

## 6. Trang phục và phụ kiện

### 6.1 Hình thể và tính bao gồm

- Ba kiểu hình thể: A cân đối, B mảnh, C đầy đặn. Không gắn với giới tính. Mỗi kiểu có hai tỷ lệ vai và hông, người dùng tự chọn.
- Ba chiều cao: 0.94, 1.00 và 1.06 lần mô hình chuẩn.
- Một khung xương chung cho mọi kiểu. Quần áo bám theo khung bằng skinning, không cần mô hình riêng cho từng người.
- Danh mục trang phục dùng "kiểu dáng" (ví dụ "đầm xếp ly"), không dùng nhãn "dành cho nam" hay "dành cho nữ" trong dữ liệu.

### 6.2 Danh mục trang phục

| Nhóm | Mục | Màu (hex) | Chất liệu và hoa văn | Dùng khi |
|---|---|---|---|---|
| Áo sơ mi | Trắng | #F7F7F5 | Cotton pha, roughness 0.8, normal dệt | Ngày thường, 20/11 |
| Áo sơ mi | Xanh nhạt | #CFE3EC | Như trên | Ngày thường |
| Áo sơ mi | Xanh than | #2E3A4B | Như trên | Ngày thường, đêm văn nghệ |
| Áo sơ mi | Kẻ sọc mảnh | Nền #FFFFFF, sọc #2F5D8A (0.5 cm) | Sọc vẽ trên texture | Ngày thường |
| Áo sơ mi | Chấm bi nhỏ | Nền #E6D8C3, chấm #5C3A22 | Chấm vẽ trên texture | 8/3, ngày thường |
| Áo sơ mi | Đỏ | #A3121B | Như trên | Tết |
| Áo polo | Xanh rêu, xám, navy | #6E7F5A, #7A8189, #1F2A3C | Cotton đan, không sheen | Thứ Sáu thoải mái |
| Vest | Navy | #1F2A3C | Len, sheen 0.3, normal dệt | Họp khách, đêm văn nghệ |
| Vest | Xám than | #3A3F47 | Như trên, sọc mờ | Ngày thường |
| Vest | Nâu đất | #5B4636 | Như trên | Ngày thường, 20/11 |
| Vest | Đen (dạ tiệc) | #15181E | Len satin, sheen 0.6 | Đêm văn nghệ |
| Váy | Bút chì | #2B3238 | Len pha, dài 0.6 m | Ngày thường |
| Váy | Xếp ly | #3E6A7A | Vải nhẹ, sheen 0.4 | Ngày thường, 8/3 |
| Đầm | In hoa nhỏ | Nền #F3C6D4, hoa #6B1E2E | Lụa, sheen 0.8 | 8/3, sinh nhật |
| Quần | Tây đen | #1C2026 | Len, nếp gấp | Ngày thường |
| Quần | Kaki | #B9A588 | Cotton twill | Thứ Sáu thoải mái |
| Quần | Jeans xanh nhạt | #6C8EAD | Denim, texture dệt chéo | Thứ Sáu thoải mái |
| Giày | Oxford đen | #1A1A1A | Da, roughness 0.35, clearcoat 0.2 | Ngày thường |
| Giày | Loafer nâu | #5C3A22 | Da, roughness 0.4 | Ngày thường |
| Giày | Sneaker trắng | #F2F2F2, đế #E6E6E6 | Vải | Thứ Sáu thoải mái |
| Giày | Cao gót thấp | #6B1E2E | Da bóng | 8/3, sinh nhật |
| Thắt lưng | Đen, nâu | #1A1A1A, #5C3A22 | Da, khóa #AEB8C4 | Ngày thường |
| Cà vạt | Navy, đỏ đô, kẻ | #1F2A3C, #6B1E2E, sọc | Lụa, sheen 0.5 | Họp khách, 20/11 |
| Nơ | Đen, đỏ | #15181E, #A3121B | Lụa | Đêm văn nghệ, Tết |
| Khăn quàng | Len xám, khăn lụa họa tiết | #9EA3A8, #6B1E2E | Len, lụa | Mùa lạnh (tùy chọn), 8/3 |
| Áo dài | Trắng, đỏ, xanh ngọc | #F7F7F5, #A3121B, #2EE6C5 | Lụa, sheen 0.8, hoa sen tự vẽ | Tết, 20/11, đêm văn nghệ |
| Áo dài | Họa tiết trống đồng (tự vẽ) | Nền #E0B252, hoa văn #5C3A22 | Lụa | Tết, lễ hội |
| Áo bà ba | Nâu, xám | #A0683F, #7A8189 | Vải thô | Tết (tùy chọn) |
| Áo cam | Cam | #E8833A | Cotton | Trung thu |

Họa tiết trống đồng và hoa sen là motif truyền thống. Mọi họa tiết được vẽ lại từ đầu, không lấy từ tranh hay ảnh có bản quyền.

### 6.3 Phụ kiện

| Nhóm | Mục | Kích thước (m) | Màu và chất liệu | Số lượng | Ghi chú |
|---|---|---|---|---|---|
| Kính | Gọng tròn | Vòng r 0.025, dây 0.14 | Kim loại #AEB8C4 | Chọn 1 | Tròng trong hoặc xanh nhạt alpha 0.2 |
| Kính | Gọng vuông | 0.05 × 0.04 | Nhựa #1F262D | Chọn 1 | — |
| Kính | Gọng aviator | 0.055 × 0.045 | Kim loại vàng #D9B98A | Chọn 1 | Tròng xám alpha 0.25 |
| Đồng hồ | Dây da | Mặt r 0.018 | Da #5C3A22, mặt #1F262D | Chọn 1 | Không hiện giờ thật |
| Đồng hồ | Dây kim loại | Như trên | Thép #AEB8C4 | Chọn 1 | — |
| Bảng tên | Gắn áo | 0.09 × 0.03 | Nhựa, chữ #1F262D | 1 | Mặc định ghi tên viết tắt |
| Thẻ nhân viên | CR80 | 0.0856 × 0.054 × 0.0008 | Nhựa, nền #F4F1EA | 1 | Logo là khung trống, chờ người dùng (câu hỏi 2) |
| Dây treo thẻ | Rộng 0.012, dài 0.9 | Vải | `squad.n` | 1 | Đầu nối nhựa |
| Ghim cài áo | r 0.012 đến 0.02 | Kim loại mạ | Sao, hoa, chữ V tự vẽ, hoặc số năm (5 năm, 10 năm) | 0 đến 3 | Mục thành tích do HR duyệt |
| Cúc áo | r 0.008 đến 0.011, 6 đến 8 cạnh | Nhựa ngọc hoặc đen | #F5F1E6, #2B3238 | 4 đến 6 trên áo, 2 ở cổ tay | Chi tiết gần camera, xem 6.5 |
| Khuy (lỗ cài) | — | Texture 64 px | Đường khâu #E6D8C3 | Mỗi nút | Vẽ bằng normal map, không tạo hình học |
| Tai nghe | 0.18 × 0.08 | Nhựa | #2B3238 | 0 hoặc 1 | Nhân vật tự chọn |
| Hoa mai, bao lì xì (T3) | Mai 0.4 × 0.3. Bao 0.09 × 0.16 | Vải, giấy | #E0B252, #A3121B | 0 hoặc 1 | Chỉ trong T3 |
| Đèn lồng cầm tay (T4) | r 0.05 | Giấy trong, emissive 2200 K | #E8833A | 0 hoặc 1 | Chỉ trong T4 |
| Bóng bay (T7) | r 0.08 | Cao su | Màu token | 0 hoặc 1 | Chỉ trong T7 |

### 6.4 Bộ mẫu theo dịp

| Mã | Bộ | Thành phần | Dùng khi |
|---|---|---|---|
| O1 | Thường ngày | Sơ mi trắng, quần tây đen, giày oxford, thẻ nhân viên | Ngày thường |
| O2 | Họp khách | Vest navy, sơ mi xanh nhạt, cà vạt navy, giày oxford, đồng hồ | Họp khách, buổi quan trọng |
| O3 | Thứ Sáu thoải mái | Polo xanh rêu, kaki, sneaker, thẻ nhân viên | Thứ Sáu |
| O4 | Váy làm việc | Váy bút chì, sơ mi trắng, giày loafer, kính gọng tròn | Ngày thường |
| O5 | Tết | Áo dài trắng hoặc đỏ, giày bệt, thẻ nhân viên, ghim mai | T3 |
| O6 | Đêm văn nghệ | Vest đen, sơ mi trắng, nơ đen, giày oxford | T2 |
| O7 | Đêm văn nghệ (áo dài) | Áo dài xanh ngọc, giày cao gót thấp | T2 |
| O8 | 8/3 | Đầm in hoa, khăn lụa, ghim hoa | T5 |
| O9 | 20/11 | Sơ mi trắng, cà vạt đỏ đô, vest nâu đất | T6 |
| O10 | Trung thu | Áo cam, quần kaki, sneaker | T4 |

### 6.5 Kỹ thuật vải và chi tiết nhỏ

- **Vải**: `MeshPhysicalMaterial` với `sheen` và `sheenColor` theo màu vải (mục 1.3). Một normal map dệt 512 px dùng chung cho mọi áo, nhân theo tỷ lệ.
- **Hoa văn**: một atlas vải 2048 px chứa sọc, chấm, hoa, kẻ. Mỗi nhân vật chỉ đổi offset và màu tint, không tải texture mới.
- **Cúc và khuy**: ở LOD0 cúc là mesh 6 đến 8 cạnh. Ở LOD1 bỏ mesh cúc và vẽ vào normal map. Ở LOD2 bỏ hẳn (mục 7.1).
- **Nếp và gấp**: dùng normal map và biến dạng đỉnh nhẹ. Không dùng mô phỏng vải thời gian thực (mục 9.6).
- **Thẻ và bảng tên**: texture chữ tạo bằng `CanvasTexture`, font tiếng Việt tự host. Không hiện tên đầy đủ khi chưa được đồng ý.
- **Màu squad**: dây treo thẻ và viền áo có thể lấy màu `squad.n`. Người dùng tắt được.

---

## 7. Chi tiết nhân vật

### 7.1 Ba cấp LOD và ngân sách

| Cấp | Điều kiện chọn | Tam giác tối đa | Draw call | Xương | Đặc điểm |
|---|---|---|---|---|---|
| LOD0 | Chiều cao trên màn hình từ 120 px trở lên | 9 000 | Tối đa 4 | Tối đa 60 | Tóc thẻ và sợi nét, cúc áo, khuy bằng normal map, mắt có tròng, lông mi, biểu cảm nhẹ |
| LOD1 | Chiều cao 40 đến 120 px | 3 000 | Tối đa 2 | Tối đa 24 | Tóc thẻ đơn giản, không sợi nét, không cúc (đã vẽ vào normal map) |
| LOD2 | Chiều cao dưới 40 px | 400 (Trung, Cao), 250 (Thấp) | InstancedMesh, gộp theo khung tóc và hình thể | 0 (không xương) | Thân và đầu đơn giản. Màu áo qua `instanceColor`, màu da qua uniform. Không có tóc sợi |

Số nhân vật tối đa mỗi cấp theo mức chất lượng:

| Mức | LOD0 | LOD1 | LOD2 (instance hiển thị tối đa) | Tam giác nhân vật tối đa | Draw call nhân vật tối đa |
|---|---|---|---|---|---|
| Cao | 12 | 40 | 500 | 428 000 | 140 |
| Trung | 6 | 20 | 350 | 254 000 | 76 |
| Thấp | 4 | 16 | 200 | 134 000 | 60 |

Quy tắc:
- Chọn LOD theo chiều cao trên màn hình, không theo khoảng cách cố định. Có vùng đệm 10 px để tránh nhảy LOD qua lại.
- Chỉ xét nhân vật trong khung nhìn. Mỗi nhân vật đổi LOD tối đa một lần mỗi 250 ms.
- Nhân vật vượt số tối đa của cấp thì ẩn, thay bằng một đám bóng và số đếm trên biển của khu.
- LOD2 gộp theo 4 khung tóc (ngắn, vừa, dài, búi) × 3 hình thể = 12 `InstancedMesh`, nên chỉ tốn 12 draw call.

### 7.2 Kiểu tóc (12 kiểu)

| Mã | Kiểu | Độ dài | LOD0 (thẻ / phụ kiện) | LOD1 (thẻ) | Ghi chú |
|---|---|---|---|---|---|
| H01 | Ngắn gọn | Dưới 3 cm | 24 | 8 | Kiểu phổ biến |
| H02 | Undercut | Hai bên sát da, đỉnh dài 8 cm | 30 | 10 | Đỉnh vuốt ngược |
| H03 | Ngắn rẽ ngôi | 5 cm | 36 | 12 | Có ngôi |
| H04 | Bob ngang vai | 15 cm, ngang cằm | 48 | 16 | Có thể có mái |
| H05 | Đuôi ngựa buộc cao | 25 cm, buộc | 60 thẻ và 1 khối buộc | 20 và 1 khối | Dây buộc là mesh nhỏ |
| H06 | Búi cao | Búi tròn trên đỉnh | 1 khối cầu tóc và 24 thẻ | 1 khối cầu | Phù hợp với áo dài |
| H07 | Dài thẳng buông | 40 cm, qua vai | 80 thẻ và 600 sợi nét | 30 | Nhiều sợi nhất |
| H08 | Sóng nhẹ | 25 cm, gợn sóng | 70 (uốn bằng normal map) | 28 | — |
| H09 | Xoăn ngắn | Xoăn 5 cm | 60 (cụm xoăn, alpha và normal) | 24 | — |
| H10 | Tết một bên | 40 cm, tết | 3 dải ống (16 đoạn mỗi dải) | 1 dải | Mesh ống chỉ LOD0 |
| H11 | Vuốt ngược | 6 cm | 36 | 12 | Gọn, chuyên nghiệp |
| H12 | Chỏm trước (quiff) | 8 cm, chỏm trước | 40 và khối chỏm | 14 | — |

Mái (bang) là tùy chọn riêng: không mái, mái thưa, mái ngang. Kiểu tóc không gắn với giới tính trong dữ liệu.

### 7.3 Màu tóc

| Tên | Hex | Ghi chú |
|---|---|---|
| Đen | #1B1512 | — |
| Nâu đen | #3A2A20 | — |
| Nâu hạt dẻ | #6B4A33 | — |
| Nâu sáng | #A7784E | — |
| Vàng ánh | #D8B36A | — |
| Đỏ đồng | #8C4A2F | — |
| Xám bạc | #9EA3A8 | Dùng cho tóc bạc tự nhiên |
| Trắng bạc | #E7E4DF | Dùng cho tóc bạc tự nhiên |

Màu tóc là tint trên một atlas chung. Mỗi màu có hệ số sáng riêng cho shader Kajiya-Kay (mục 7.4). Người dùng có thể chọn thêm vệt sáng (highlight) là một màu thứ hai.

### 7.4 Mô phỏng sợi tóc

| Kỹ thuật | Cách làm | Dùng ở | Chi phí | Ghi chú |
|---|---|---|---|---|
| Thẻ alpha (card) | Mặt phẳng ghép theo chỏm. Texture 1024 px có sợi vẽ bằng canvas (nhiều đường cong mảnh), `alphaTest` 0.5 | LOD0, LOD1 | Thấp đến trung | Trông như tóc ở khoảng cách bình thường. Kèm shader Kajiya-Kay [SHADER] |
| Dải (strip) | Dải hình thang thu nhỏ về đuôi, dùng cho mái và tóc tết | LOD0 | Thấp | Đường viền mềm |
| Sợi nét (LineSegments) | 300 đến 600 đường cong, 8 đoạn mỗi đường, nét 1 px | LOD0, chỉ mức Trung và Cao | Thấp đến trung | WebGL chỉ vẽ nét 1 px. Muốn nét dày hơn cần `LineMaterial` (`three/examples/jsm/lines`, MIT), tốn thêm |
| Ống (TubeGeometry) | Mỗi sợi là một ống 8 cạnh | Ảnh cận cảnh ngoài sàn (ảnh hồ sơ) | Cao | Không dùng trong cảnh sàn chính |
| Vỏ (shell) | Vỏ mỏng bao đầu, alpha texture | LOD2 | Rất thấp | Tóc dài dùng vỏ cộng vài thẻ đuôi |

Số thẻ tối đa ở LOD0 là 80. Shader Kajiya-Kay dùng hướng tiếp tuyến của sợi để tạo vệt sáng dọc theo tóc. Đây là shader tùy biến [SHADER]. Không mô phỏng tóc vật lý (mục 9.6).

### 7.5 Da

| Mã | Tông | Hex nền | Hex vùng má | Ghi chú |
|---|---|---|---|---|
| S01 | Sáng hồng nhạt | #F6DCC8 | #F2B9B0 | — |
| S02 | Sáng vàng ấm | #EBC29E | #E6A88E | — |
| S03 | Trung bình ấm | #D7A27A | #CC8A6F | — |
| S04 | Trung bình nâu | #B9825A | #A96A55 | — |
| S05 | Nâu sẫm | #8D5B3D | #7C4A38 | — |
| S06 | Sẫm | #5C3B28 | #4C2F22 | — |

Cách làm da:
- **Nền**: `MeshPhysicalMaterial`, roughness 0.55, `specularIntensity` 0.5. Không dùng `transmission` (mục 9.6).
- **Wrap diffuse**: ánh sáng vòng qua rìa, công thức `(NdotL + w) / (1 + w)` với w khoảng 0.25 [SHADER]. Giả lập tán xạ ở mép, không tốn lượt vẽ.
- **Rim ấm**: fresnel nhẹ, màu bằng tông da nhân 1.15, cường độ 0.15 [SHADER].
- **Tán xạ giả (tai và mũi)**: thickness map 256 px. Khi có đèn từ phía sau, cộng màu đỏ cam theo thickness [SHADER]. Chỉ ở LOD0 mức Cao.
- **Texture**: atlas da 1024 px chứa sáu tông và hai tư thế chỉnh. Normal map lỗ chân lông 512 px, cường độ 0.3. Roughness map dùng chung.
- **Không dùng** tán xạ dưới bề mặt thật (ví dụ mô hình Burley), vì cần thêm lượt vẽ.

### 7.6 Mắt, lông mày, môi, má, nốt ruồi

| Thành phần | Lựa chọn | Kỹ thuật | Ghi chú |
|---|---|---|---|
| Mắt (tròng) | Năm màu: nâu #4A2F1F, nâu sẫm #2B1B12, xám #7C8A96, xanh lá #4F7F52, xanh dương #3D6F9A | Quả cầu nhỏ, texture tròng 128 px, con ngươi vẽ sẵn | Phản chiếu sáng nhẹ từ envMap |
| Chớp mắt | Chu kỳ ngẫu nhiên 3 đến 6 s | Morph target "blink", 0 đến 1 trong 120 ms | Chỉ LOD0 |
| Lông mi | Một thẻ trên mí trên | Thẻ alpha 256 px | Chỉ LOD0 |
| Lông mày | Bốn kiểu: mảnh, vừa, dày, cong | Hai thẻ, texture sợi, màu bằng màu tóc nhân 0.9 | LOD0 và LOD1 |
| Môi | Sáu màu: hồng nhạt #D98B8B, hồng #C76F7F, đỏ #A3121B, nude nâu #A8705C, berry #7A2E4B, cam san hô #E0786A | Texture môi phủ lên, tùy chọn | LOD0 và LOD1 |
| Má hồng | Ba cường độ: 0.15, 0.25, 0.35 | Decal gradient tròn, alpha | Dùng tông vùng má của da |
| Nốt ruồi | Không có, hoặc tối đa 2 nốt ở 3 vị trí (má, cằm, trán) | Decal 0.01 m, texture 64 px | Tùy chọn |
| Tàn nhang | Tùy chọn | Decal 128 px, nhẹ | Tùy chọn |

### 7.7 Chuyển động và biểu cảm

- **Hô hấp**: scale theo trục y ±1.5%, chu kỳ 4 s. LOD0 và LOD1.
- **Nhìn theo**: đầu xoay về người đang nói hoặc nhân vật được chọn, giới hạn ±30°. Làm bằng code, không dùng clip.
- **Ngồi làm việc**: tư thế cố định, chân gập 90°, tay đặt trên bàn. Khi đang online, tay gõ phím dao động 3 Hz ngẫu nhiên.
- **Vẫy tay** 1.5 s khi vào sảnh (mục 1.4).
- **Đi bộ**: một chu kỳ 1.0 s lặp lại, cho LOD0 và LOD1. Tạo bằng IK đơn giản trong code, hoặc dùng clip CC0 đã kiểm tra. Không dùng Mixamo cho đến khi pháp chế xác nhận điều khoản (xem Phụ lục B).
- **Điểm tụ**: người online không có chỗ ngồi đứng ở lounge, pantry, sảnh, hoặc ngồi sofa. Vị trí chọn theo seed, cách nhau tối thiểu 0.6 m.
- **Biểu cảm**: chỉ có chớp mắt và một nụ cười nhẹ (morph "smile" từ 0 đến 0.4) khi nhận kudos. Không có biểu cảm phức tạp.
- **Tần suất cập nhật**: LOD0 30 Hz, LOD1 15 Hz, LOD2 không chạy animation.
- **Trạng thái online**: LED nhỏ trên thẻ nhân viên đổi màu. Không có hiệu ứng sáng lớn.

---

## 8. Tiêu chí kiểm chứng

### 8.1 Kiểm tra tự động

Chạy trong CI hoặc trước khi phát hành. Ngưỡng theo mức chất lượng khi có ghi chú.

| Mã | Kiểm tra | Cách đo | Ngưỡng | Nếu không đạt |
|---|---|---|---|---|
| A01 | Số chỗ có ghế bằng số đã xác nhận | Đếm số chỗ sinh từ khối bàn (mục 5.6) | Bằng số xác nhận (mặc định 104) | Dừng build, báo lỗi. Không tự thêm hay bớt chỗ |
| A02 | Không chồng lấn footprint | So từng cặp hình chữ nhật trong dữ liệu layout | Diện tích chồng dưới 0.05 m² | Hiện tại có một lỗi: WC và `core_lift3`, 3.2 m² (G03) |
| A03 | Lối đi tối thiểu | Mô phỏng lưới 0.1 m, tìm đường từ cửa đến các chỗ | Lối đi chính từ 1.2 m | Báo vị trí hẹp |
| A04 | Số draw call | `renderer.info.render.calls`, trung bình 60 khung hình tại 8 camera preset | Thấp 120, Trung 200, Cao 280 | Giảm LOD hoặc gộp mesh |
| A05 | Tam giác khung hình | `renderer.info.render.triangles` | Thấp 350 000, Trung 600 000, Cao 1 000 000 | Giảm LOD |
| A06 | Số shader program | `renderer.info.programs.length` | Thấp 24, Trung 32, Cao 40 | Gộp material, bỏ biến thể |
| A07 | Số đèn có hiệu lực | Đếm `THREE.Light` có intensity lớn hơn 0 | Thấp 4, Trung 6, Cao 8. Tổng số đèn không đổi giữa các chủ đề | Sửa rig (mục 3.3) |
| A08 | Đèn có bóng | Đếm đèn có `castShadow` | Thấp và Trung: 1 directional. Cao: 1 directional và tối đa 2 point | Tắt bóng thừa |
| A09 | Tam giác nhân vật | Đếm số tam giác của từng LOD | LOD0 9 000, LOD1 3 000, LOD2 400 (Thấp 250) | Giảm mesh |
| A10 | Số xương nhân vật | Đếm bone trong skeleton | LOD0 tối đa 60, LOD1 tối đa 24, LOD2 bằng 0 | Giảm xương |
| A11 | Kích thước texture | Quét mọi texture được tải | Không quá 2048 px. Texture trên 1024 px phải ở dạng KTX2 | Nén lại |
| A12 | Bộ nhớ texture GPU | Tổng dung lượng theo định dạng, nhân 1.33 cho mipmap | Thấp 96 MB, Trung 160 MB, Cao 256 MB | Giảm độ phân giải |
| A13 | Nội thất khu hạn chế | Tìm tên mesh của Z09 trong gói tải của vai trò employee | Không có | Chặn phát hành |
| A14 | Yêu cầu ra ngoài | Ghi lại request khi mở trang, lọc host ngoài | Bằng 0 | Thay bằng asset nội bộ |
| A15 | Đỉnh âm thanh | Render thử 60 s cho từng chủ đề | Đỉnh không quá −1 dBFS | Giảm gain |
| A16 | Tương phản chữ | Quét màu chữ và nền của các panel | Ít nhất 4.5:1 | Đổi màu |
| A17 | Giảm chuyển động | Giả lập `prefers-reduced-motion` | Không confetti, không sway, không chuyển cảnh | Sửa |
| A18 | Thời gian khởi tạo | Từ lúc tải trang đến khung 3D đầu tiên, mạng nội bộ | Dưới 4 s. `renderer.compileAsync` xong trong 1.5 s | Tách lazy |
| A19 | Rò rỉ bộ nhớ | Đổi chủ đề 10 lần, đếm geometry và texture | Không tăng từ lần thứ 3 trở đi | Gọi dispose đúng chỗ |
| A20 | Giấy phép asset | Mỗi file trong thư mục asset có dòng trong `THIRD_PARTY.md` | 100% | Không đưa vào build |
| A21 | Kích thước gói | Đo sau khi nén | Mã 3D gzip dưới 450 KB. Mỗi GLB dưới 3 MB. Tổng khởi động dưới 8 MB (không tính avatar) | Tách lazy hoặc nén thêm |
| A22 | Tọa độ | Đối chiếu tọa độ sau khi đổi | Sai số dưới 0.05 m. Ví dụ: spawn (25, 17) → world (−4, 2) | Sửa công thức đổi tọa độ |

### 8.2 Kiểm tra thị giác

- **Bảng mẫu**: bốn bảng cho bốn phong cách S1 đến S4, và một bảng cho mỗi chủ đề T0 đến T7. Mỗi bảng có sáu ảnh tham chiếu. Ảnh tham chiếu lấy từ bản đầu đã được duyệt, đóng vai trò "ảnh vàng".
- **Camera preset**: tám vị trí cho mỗi khu (Z01 đến Z09). Chụp ở 1280 × 720 và 1920 × 1080, DPR 1.
- **So sánh**: tỷ lệ pixel khác biệt dưới 3% so với ảnh vàng. SSIM ít nhất 0.92 với ảnh tĩnh. Vùng động (màn hình, đèn chớp) được che bằng mặt nạ.
- **Màu chủ đạo**: ΔE2000 trung bình trên vùng sàn và tường dưới 4, so với bảng màu token (mục 1.2).
- Ngưỡng là đề xuất, sẽ chỉnh lại sau lần chạy đầu. Công cụ chụp đề xuất Playwright. Giấy phép Playwright và thư viện so sánh ảnh chưa xác minh trong phiên này.
- **Checklist thủ công** (12 mục): (1) không chớp (z-fighting) trên sàn và tường; (2) chân bàn không xuyên sàn; (3) đèn không lóa ở góc nhìn bình thường; (4) chữ trên biển đọc được ở 1280 px; (5) cây lắc không gây khó chịu; (6) bóng không răng cưa rõ quá 2 px; (7) nhân vật không xuyên ghế; (8) cúc áo không nhấp nháy khi camera gần; (9) tóc không biến mất khi xoay; (10) màn hình không hiện nội dung nhạy cảm; (11) chủ đề đổi mượt; (12) âm thanh không vỡ.

### 8.3 Đánh giá người dùng nội bộ

- Năm người nội bộ, thang 1 đến 5, chạy các camera preset và hai chủ đề.
- Mục tiêu: "vui nhộn" trung bình ít nhất 3.5; "chuyên nghiệp" ít nhất 4.0; "dễ nhìn, không chóng mặt" ít nhất 4.0.
- Kiểm tra chuyển động: tốc độ camera tối đa 4 m/s, không xoay tự động nhanh hơn 60° mỗi giây.

---

## 9. Hiệu năng và ngân sách

### 9.1 Mức thiết bị

| Mức | Thiết bị mục tiêu | Ghi chú |
|---|---|---|
| Thấp | GPU tích hợp đời cũ (ví dụ Intel UHD 620), RAM 8 GB, màn 1920 × 1080 | Phải chạy ổn định ở 30 FPS |
| Trung | GPU tích hợp đời mới (ví dụ Intel Iris Xe, AMD Radeon Vega 8 trở lên) | Mức mặc định khuyến nghị |
| Cao | GPU tích hợp mạnh hoặc GPU rời nhẹ | Bật đầy đủ hậu xử lý |

Tên GPU chỉ để định hướng. Cần đo trên máy thật (câu hỏi 6).

Cách chọn mức tự động: đo thời gian khung hình trong 3 giây sau khi cảnh đã tải, rồi chọn mức theo ngưỡng. Người dùng có thể đổi trong cài đặt. Không dùng chuỗi renderer của WebGL làm nguồn chính, vì trình duyệt có thể che thông tin này.

### 9.2 Ngân sách tổng

| Chỉ số | Thấp | Trung | Cao | Ghi chú |
|---|---|---|---|---|
| FPS mục tiêu | 30 (P95 không dưới 24) | 45 | 60 | P95 đo trên 60 s |
| Ngân sách mỗi khung hình | 33 ms | 22 ms | 16.6 ms | Gồm GPU và CPU |
| Thời gian JS mỗi khung (không tính React) | Tối đa 4 ms | Tối đa 3 ms | Tối đa 3 ms | [ƯỚC LƯỢNG] |
| Draw call | Tối đa 120 | Tối đa 200 | Tối đa 280 | Gồm nhân vật |
| Tam giác mỗi khung | Tối đa 350 000 | Tối đa 600 000 | Tối đa 1 000 000 | Gồm nhân vật |
| Tam giác nhân vật | 134 000 | 254 000 | 428 000 | Theo mục 7.1 |
| Tam giác tĩnh (vật thể trong khu) | 150 000 | 300 000 | 500 000 | Theo mục 9.3 |
| Đèn có hiệu lực | Tối đa 4 | Tối đa 6 | Tối đa 8 | Mục 3.4 |
| Bóng | 1 directional 1024 | 1 directional 2048 | 1 directional 2048, tối đa 2 point | Mục 3.4 |
| DPR | 1.0 | 1.25 | 1.5 | — |
| Hậu xử lý | Không | Bloom nửa độ phân giải, SMAA | Bloom, SMAA, GTAO tùy chọn | Mục 3.4 |
| Bộ nhớ texture GPU | Tối đa 96 MB | Tối đa 160 MB | Tối đa 256 MB | Mục 9.4 |
| Render target | Không (không composer) | Tối đa 24 MB ở 1080p | Tối đa 48 MB ở 1080p | Dùng `UnsignedByteType` ở Trung |
| JS heap | Tối đa 300 MB | Tối đa 400 MB | Tối đa 500 MB | [ƯỚC LƯỢNG] |
| Gói 3D (gzip) | Tối đa 450 KB | Như Thấp | Như Thấp | Không tính asset |
| Asset khởi động | Tối đa 8 MB | Như Thấp | Như Thấp | Avatar tải lười |

Các con số tam giác và draw call trên là tổng của cả cảnh. Mức Thấp cần giảm thêm bằng cách bỏ tường cây, sân khấu tạm, đèn bàn và một phần vật thể nhỏ, để đạt mục tiêu 60 draw call tĩnh và 150 000 tam giác tĩnh [ƯỚC LƯỢNG].

### 9.3 Ngân sách theo khu (mức Trung)

| Khu | Draw call | Tam giác tĩnh | Texture (MB) | Đèn | Ghi chú |
|---|---|---|---|---|---|
| Z01 Sảnh | 10 | 15 000 | 6 | 3 | Quầy, bảng, cây |
| Z02 Nam | 20 | 45 000 | 10 | 2 (cộng đèn bàn T1) | Bảy cụm. Bàn, ghế và màn hình dùng InstancedMesh |
| Z03 Tây | 12 | 25 000 | 6 | 2 | Tường cây xanh |
| Z04 Bắc và NOC | 10 | 20 000 | 6 | 2 | Tường NOC là canvas, cập nhật mỗi phút |
| Z05 Lounge | 35 | 110 000 | 24 | 6 (theo T2) | Sân khấu, karaoke, sofa, bàn cờ, gương |
| Z06 Phòng họp | 12 | 25 000 | 6 | 1 | Ba phòng và hai phòng riêng |
| Z07 Lõi và tiện ích | 16 | 25 000 | 6 | 3 | Thang, WC, pantry |
| Z08 Dự phòng | 2 | 3 000 | 1 | 0 | Sàn trống |
| Z09 Hạn chế | 6 | 8 000 | 2 | 1 (emissive) | Employee chỉ thấy vỏ (mục 5.7) |
| Tổng tĩnh | 123 | 276 000 | 67 | — | Cộng nhân vật (76 draw call, 254 000 tam giác) |

Tổng ở mức Trung là 199 draw call và 530 000 tam giác khi cộng nhân vật. Con số này nằm trong ngân sách 200 draw call và 600 000 tam giác, nhưng sát ngưỡng. Nếu vượt, giảm số LOD0 trước.

### 9.4 Texture và bộ nhớ

| Atlas | Kích thước | Định dạng (desktop) | Dung lượng ước lượng | Dùng cho |
|---|---|---|---|---|
| Sàn và tường | 2048 | KTX2 BC7 | khoảng 5.6 MB | Thảm, gỗ, đá |
| Nội thất | 2048 | KTX2 BC7 | khoảng 5.6 MB | Bàn, ghế, quầy, đồ nhỏ |
| Trang phục và hoa văn | 2048 | KTX2 BC7 | khoảng 5.6 MB | Vải, sọc, hoa, kẻ |
| Màn hình và biển | 1024 (bốn tấm) | Canvas. WebP cho phần tĩnh | khoảng 1 đến 2 MB | Chữ, biển, màn trong 3D |
| Da, mắt, môi | 1024 | KTX2 BC7 | khoảng 1.4 MB | Mặt nhân vật |
| Tóc | 1024 | KTX2 BC7 (có alpha) | khoảng 1.4 MB | Thẻ tóc, lông mày |
| Lá cây | 512 | KTX2 BC7 | khoảng 0.4 MB | Cây, tường cây xanh |

Ghi chú:
- BC7 là định dạng nén cho desktop, Chrome và Edge hỗ trợ. Trên thiết bị khác có thể dùng ETC1S (nhỏ hơn). Chưa kiểm tra hỗ trợ trên mọi trình duyệt nội bộ.
- Texture giữ mipmap. Không dùng `HalfFloatType` cho texture. Render target ở mức Trung dùng `UnsignedByteType`.
- Dung lượng trên đĩa xấp xỉ bằng dung lượng trong GPU vì BC7 không giải nén khi nạp.
- Các khu không dùng được giải phóng bằng dispose khi chuyển khu, trừ atlas chung.

### 9.5 Kỹ thuật tối ưu cho GPU tích hợp

- **Instancing và gộp**: dùng `InstancedMesh` cho ghế, màn hình, bàn phím, chuột, đế màn hình, cây xương rồng, lá, ghim, quân cờ. Dùng `BatchedMesh` (three r156 trở lên) cho vật thể cùng vật liệu khác hình. Dùng `mergeGeometries` (`three/examples/jsm/utils/BufferGeometryUtils.js`, MIT) cho vật thể tĩnh cùng vật liệu.
- **Atlas dùng chung**: một atlas mỗi nhóm (mục 9.4). Không tạo texture riêng cho từng nhân vật. Nhân vật khác nhau nhờ tint và offset.
- **Vẽ theo nhu cầu**: `frameloop="demand"` của R3F 8. Gọi `invalidate()` khi có chuyển động. Animation nhân vật chạy theo tần suất mục 7.7.
- **Hạ độ phân giải động**: dùng `PerformanceMonitor` hoặc `AdaptiveDpr` của drei. Hạ DPR khi FPS dưới ngưỡng trong 3 giây liên tục, khôi phục sau 10 giây ổn định. Cần kiểm tra export trong `@react-three/drei` 9.114.0 trước khi dùng.
- **Bóng tĩnh**: `renderer.shadowMap.autoUpdate = false`. Vẽ lại khi đổi khu hoặc chủ đề (mục 3.4).
- **Cắt theo tầm nhìn cho InstancedMesh**: `InstancedMesh` không cắt từng instance. Sắp lại mảng instance ở CPU theo khu, chỉ gửi instance của khu gần camera, và đặt `count` phù hợp.
- **Không cấp phát trong vòng lặp**: không tạo `Vector3`, `Matrix4`, `Color` mới trong `useFrame`. Dùng pool. Không tạo geometry mỗi khung hình.
- **Đèn**: không thêm hay bớt đèn trong lúc chạy. Đổi intensity và màu (mục 2.3).
- **Tải lười**: mỗi khu bọc trong một `Suspense`. Asset của chủ đề được tải trước khi chuyển.
- **Nén mô hình**: GLB với Draco hoặc meshopt. Decoder tự host trong thư mục public, không tải từ CDN.
- **Tránh**: `MeshReflectorMaterial`, `Reflector`, `AccumulativeShadows`, `transmission`, bóng point, `SoftShadows`. Mỗi thứ tốn thêm lượt vẽ.
- **Đèn trên laptop hai GPU**: `powerPreference` theo mục 3.4.

### 9.6 Không đề xuất

- Ray tracing hoặc path tracing: cần WebGPU và GPU mạnh.
- Ánh sáng gián tiếp thời gian thực (SSGI, voxel GI): dùng lightmap nướng.
- Mô phỏng tóc hoặc vải vật lý: dùng thẻ và normal map.
- Texture video hoặc 4K: màn hình trong 3D tối đa 1024 px.
- LOD0 cho toàn bộ nhân vật: 500 người × 9 000 tam giác khoảng 4.5 triệu, không khả thi.
- Font hoặc HDRI tải từ CDN ngoài: vi phạm CSP và làm chậm khởi động.
- Mô hình nhân vật có giấy phép không rõ.

### 9.7 Đo và ngưỡng dừng

- Đo trên ít nhất ba máy thật, mỗi mức một máy. Ghi FPS P50 và P95, draw call, tam giác, bộ nhớ GPU ước lượng, thời gian khởi tạo.
- Quy trình: (1) đo mức Thấp trước. (2) Nếu P50 dưới 30 FPS sau khi tắt hết hậu xử lý và hạt, giảm LOD0, LOD1 và texture. (3) Nếu vẫn dưới 24 FPS sau hai vòng sửa, đưa máy đó vào chế độ danh sách 2D (không có cảnh 3D).
- Các số có dấu [ƯỚC LƯỢNG] trong tài liệu này được thay bằng số đo sau khi có máy thật.
- Ngưỡng không nới chỉ vì "máy nhân viên đủ mạnh". Ai quyết định ngưỡng là người dùng (câu hỏi 6).

---

## 10. Câu hỏi cho người dùng

Trả lời theo số. Ô "Mặc định" là phương án dùng nếu không có phản hồi.

1. **Số chỗ ngồi** (mục 5.2): chọn phương án A (giữ sàn), B (mở rộng) hay C (giữ 484 nhân sự, 3D chỉ hiện chỗ có ghế)? Nếu giữ 484 chỗ là mục tiêu cứng, cần bản vẽ mới với khoảng 2 400 m² cho chỗ làm việc. Mặc định: A, khoảng 104 chỗ.
2. **Nhận diện GPBank**: mã màu thương hiệu (hex), file logo (SVG hoặc PNG) có quyền sử dụng, font nội bộ nếu có. Cung cấp danh sách màu chính của các ngân hàng khác để kiểm tra trùng. Mặc định: để trống, khung logo trên thẻ là khung trống.
3. **Ảnh thật của nhân viên** có được dùng làm avatar hoặc ảnh trong 3D không? Mặc định: không, dùng avatar tự tạo. Nếu dùng, cần sự đồng ý từng người và chính sách bảo vệ dữ liệu cá nhân.
4. **Mức "vui nhộn"** trên thang 1 đến 5. Mặc định: 3, vui vừa, chuyên nghiệp là chính.
5. **Chủ đề ngoài danh sách** (tôn giáo, chính trị, lễ khác): có cần không? Mặc định: không thêm.
6. **Thiết bị tối thiểu thực tế** của nhân viên (CPU, GPU, RAM, trình duyệt, độ phân giải). Dùng để chốt mức Thấp. Mặc định: mức Thấp là GPU tích hợp đời cũ, RAM 8 GB.
7. **Số người online đồng thời** tối đa cần hiển thị. Mặc định: tối đa 500 nhân vật, phân cấp theo mục 7.1.
8. **Khu dự phòng 231 m²**: có được dùng làm sân khấu tạm trong sự kiện không? Mặc định: không, giữ trống.
9. **Bàn bóng bàn ở lounge** (2.74 × 1.525 m): có cần không? Mặc định: không.
10. **Âm thanh**: đồng ý nhạc do nhóm tự soạn, không dùng bài hát có sẵn? Có ngân sách mua license nhạc không? Mặc định: tự soạn, không mua.
11. **Lịch chủ đề**: ngày sinh nhật công ty, ngày Tết và Trung thu theo lịch âm cho các năm tới, và ai là người duyệt chủ đề. Mặc định: admin duy nhất, có log.
12. **Phòng máy chủ và SOC**: IT và admin được xem những gì (có sơ đồ rack không, con số nào trên màn SOC)? Mặc định: chỉ con số tổng hợp, không có sơ đồ rack chi tiết.
13. **Linh vật robot "Gọn"**: có đồng ý không, đặt tên gì, vai trò thế nào? Mặc định: có, tên tạm, chỉ đi tuần.
14. **Chính sách trang phục**: tự do chọn trong danh mục đã duyệt, hay có quy định (ví dụ thứ Sáu thoải mái)? Mặc định: tự chọn trong danh mục.
15. **Phong cách nhân vật**: giữ "tả thực điệu" (mặc định), hay gần hoạt hình hơn, hay gần người thật hơn? Gửi ảnh tham khảo nếu có.
16. **Mặt bằng**: có bản vẽ CAD có tỷ lệ không? Cần để xác nhận kích thước ước lượng (58 × 30 m, các khối bàn), quy chuẩn lối đi thoát hiểm áp dụng, và sửa ba lỗi hình học (WC và `core_lift3` chồng nhau, mr3 quá chật, L1 và L2 cách 0.4 m). Mặc định: giữ bản vẽ hiện tại, sửa theo đề xuất trong mục 0.

---

## Phụ lục A. Rủi ro và điều chưa chắc

| Rủi ro | Khả năng | Ảnh hưởng | Cách giảm |
|---|---|---|---|
| Số chỗ 484 không khả thi trong mặt bằng hiện tại (phát hiện 1) | Cao, đã có số liệu | Cao, ảnh hưởng thiết kế và kế hoạch | Chốt mục 5.2 trước khi làm 3D |
| Hiệu năng trên GPU tích hợp không đạt | Trung | Cao | Mức chất lượng tự động, LOD, đo sớm trên máy thật |
| Đèn và hậu xử lý quá nặng (bloom, bóng) | Trung | Trung | Không dùng bóng point, GTAO ở mức Thấp và Trung (mục 3.4) |
| Âm thanh tổng hợp nghe không dễ chịu | Trung | Thấp | Thử với người nghe nội bộ. Giữ mức nền thấp |
| Nội thất khu hạn chế lộ qua gói tải | Thấp | Cao | Gói phân theo vai trò, kiểm tra A13 |
| Màu trùng với ngân hàng khác | Thấp đến trung | Trung | Chờ danh sách màu từ người dùng để kiểm tra |
| Font tiếng Việt thiếu dấu | Thấp | Trung | Kiểm tra glyph trước khi chốt |
| Nhập sai ngày lịch âm | Trung | Thấp | Admin xác nhận và có log thay đổi |
| Asset bên ngoài có license không rõ | Trung | Cao | Chỉ nhận nguồn trong `ASSET_SOURCES.md`, kiểm tra từng mục |
| Chuyển động gây chóng mặt | Thấp | Trung | Giới hạn tốc độ camera, cho tắt chuyển động (mục 8.3) |

Điều chưa chắc:
- Các con số về draw call, bộ nhớ, mili giây là ước lượng, chưa đo trên máy thật.
- Giá trị cường độ đèn (candela) là điểm xuất phát, cần tinh chỉnh bằng bảng mẫu.
- Hỗ trợ BC7 và KTX2 trên mọi trình duyệt nội bộ chưa kiểm tra.
- Quy chuẩn lối đi thoát hiểm và PCCC chưa xác minh.
- Tên export `PerformanceMonitor` và `AdaptiveDpr` trong drei 9.114.0 cần xác nhận khi cài.
- Mặt bằng là ước lượng từ ảnh, chưa đối chiếu tỷ lệ.

## Phụ lục B. Nguồn và license

| Thành phần | Dùng ở | License | Trạng thái |
|---|---|---|---|
| three.js 0.169.0 | Lõi 3D và `examples/jsm` (postprocessing, loaders, environments, utils, lines) | MIT | Đã xác minh trong `THIRD_PARTY.md` và `OSS_REUSE.md` |
| @react-three/fiber 8.17.10 | Renderer React | MIT | Đã xác minh trong `OSS_REUSE.md` |
| @react-three/drei 9.114.0 | Instances, ContactShadows, Text, PerformanceMonitor | MIT | Đã xác minh trong `OSS_REUSE.md`. Từng helper chưa kiểm tra |
| @pixiv/three-vrm 3.5.5 | Avatar VRM (nếu chọn) | MIT (đối chiếu LICENSE nhánh dev) | Theo `ASSET_SOURCES.md` mục 12. Chưa đối chiếu gói npm |
| Model VRM | Avatar | Theo license riêng từng model | Chưa xác minh. Xem `ASSET_SOURCES.md` mục 11 |
| Decoder Draco, Basis (KTX2), meshopt | Nén asset (đi kèm three/examples/jsm/libs) | Chưa xác minh trong phiên này | Tự host trong thư mục public |
| Font tiếng Việt | UI và biển | SIL OFL 1.1 (theo `ASSET_SOURCES.md`) | Chọn font cụ thể sau |
| Kenney, Poly Haven, ambientCG | Mô hình, texture, HDRI | CC0 | Đã xác minh (`ASSET_SOURCES.md`) |
| Quaternius | Nhân vật, đạo cụ | Chưa xác minh (QAL v1.0 mới) | Không dùng cho đến khi kiểm tra từng pack |
| Freesound | Mẫu âm thanh | Từng file | Chỉ CC0, lưu link và license |
| Playwright | Chụp ảnh kiểm thử | Chưa xác minh trong phiên này | Kiểm tra trước khi dùng |
| Thư viện so sánh ảnh | Mục 8.2 | Chưa xác minh | Chọn sau |
| Mixamo | Animation (không dùng) | Điều khoản Adobe | Không dùng cho đến khi pháp chế xác nhận |

Hướng dẫn khi thêm asset: ghi dòng vào `THIRD_PARTY.md`, lưu link trang license, ngày kiểm tra, và tên tác giả. Quy trình nhập theo `ASSET_SOURCES.md` mục 5.

## Phụ lục C. Lộ trình gợi ý

Không có ngày, vì chưa có dữ liệu về nhân lực.

1. **Chốt số chỗ và sửa ba lỗi hình học** (câu hỏi 1 và 16). Không bắt đầu công việc 3D trước khi xong.
2. **Nền kỹ thuật**: mức chất lượng, LOD, instancing, bộ sinh chỗ ngồi, kiểm tra A01 đến A03.
3. **Sàn, tường và zone S1** (Z01 đến Z04). Đo trên ba máy thật.
4. **Nhân vật**: LOD2 và LOD1 trước, sau đó LOD0 đầy đủ (tóc, da, cúc).
5. **Lounge và hệ chủ đề T0 đến T2**, âm thanh ambient, nhạc tự soạn.
6. **Các chủ đề còn lại** (T3 đến T7), trang phục theo dịp, decor sự kiện.
7. **Hoàn thiện**: kiểm tra thị giác (mục 8.2), đánh giá nội bộ (mục 8.3), sửa lỗi.

