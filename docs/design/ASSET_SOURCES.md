# Nguồn tài nguyên số · Văn phòng ảo GPBank

Ngày kiểm tra: 2026-11-06. Phạm vi: chỉ đọc trang chính thức và điều khoản license. Không tải file lớn về máy, không cài gói, không đưa asset vào repo ở bước này. Mã khu trong bảng lấy từ `docs/FLOORPLAN_IT.md` (đã gồm games_corner, karaoke_room, events_board).

## Cách đọc trạng thái

- **Đã xác minh**: đã mở trang license hoặc chính sách chính thức của nguồn trong ngày kiểm tra.
- **Chính sách đã xác minh, từng mục chưa xác minh**: nguồn có license riêng cho từng tài nguyên. Chính sách chung đã đọc, nhưng mỗi mục phải kiểm tra riêng trước khi nhập.
- **Chưa xác minh**: không mở được trang chính thức, hoặc chỉ có nguồn thứ cấp. Không đưa vào danh sách khuyến nghị.

Phần tóm tắt license là diễn giải của người rà soát, không trích nguyên văn. Trước khi nhập, mở lại trang chính thức của đúng mục đó.

## 1. Tiêu chí cho phép

- **Cho phép**: CC0 1.0 (ưu tiên), CC BY (phải ghi công), SIL OFL 1.1 (font).
- **Không cho phép**: CC BY-NC, CC BY-ND, "miễn phí cho cá nhân", license chỉ biên tập (editorial), GPL. CC BY-SA không nằm trong ràng buộc, nên chỉ dùng khi chủ dự án duyệt riêng.
- **Không đưa vào**: nội dung có thương hiệu, người thật, nhạc thương mại (xem mục 6).

## 2. Kết quả kiểm tra nguồn

| # | Nguồn | Trang license | Tóm tắt license | Trạng thái | Ghi chú |
|---|---|---|---|---|---|
| 1 | Kenney | https://kenney.nl/support | CC0. Dùng thương mại, không bắt buộc ghi công. | Đã xác minh | Trang nói mọi asset trên kenney.nl/assets là CC0. Vẫn giữ file license đi kèm từng pack. |
| 2 | Poly Haven | https://polyhaven.com/license | CC0 cho HDRI, texture và model 3D. | Đã xác minh | Không bắt buộc ghi công, vẫn nên ghi. |
| 3 | ambientCG | https://docs.ambientcg.com/license/ | CC0 cho file tải về và ảnh preview. | Đã xác minh | Ghi công là tùy chọn. |
| 4 | Google Fonts (OFL) | https://openfontlicense.org/ | OFL 1.1: được nhúng, sửa, phân phối, kể cả bản sửa. Phải giữ thông báo bản quyền và văn bản OFL. | Đã xác minh | Font cụ thể ở các dòng 5 đến 7. |
| 5 | Be Vietnam Pro | https://github.com/google/fonts/tree/main/ofl/bevietnampro | OFL 1.1, có subset tiếng Việt. | Đã xác minh | Đối chiếu METADATA.pb và OFL.txt trong google/fonts. |
| 6 | Noto Sans | https://github.com/google/fonts/tree/main/ofl/notosans | OFL 1.1, có tiếng Việt. | Đã xác minh | Như dòng 5. |
| 7 | Inter | https://github.com/google/fonts/tree/main/ofl/inter | OFL 1.1, có subset tiếng Việt. | Đã xác minh | Như dòng 5. |
| 8 | Freesound | https://freesound.org/help/faq/ | Mỗi âm thanh có license riêng: CC0, CC BY hoặc CC BY-NC. CC0 không cần ghi công. CC BY phải ghi công. CC BY-NC cấm thương mại. | Chính sách đã xác minh, từng mục chưa xác minh | Dự án chỉ nhận CC0 và CC BY. Ghi công theo mẫu của Freesound. |
| 9 | OpenGameArt | https://opengameart.org/content/faq | License theo từng mục (CC0, CC BY, GPL và khác). FAQ coi mặc định là cần ghi công, trừ khi tác giả ghi khác. | Chính sách đã xác minh, từng mục chưa xác minh | Dự án chỉ nhận CC0 và CC BY. Loại GPL. |
| 10 | Free Music Archive | https://freemusicarchive.org/faq | FAQ mô tả các loại CC. CC BY phải ghi tên bài, tác giả, nguồn, license, kèm link. | Chính sách đã xác minh, từng bài chưa xác minh | Dự án chỉ nhận CC0 và CC BY. Loại mọi bài CC BY-NC. |
| 11 | VRM Public License 1.0 | https://vrm.dev/licenses/1.0/ | Cho phép dùng avatar, chỉnh sửa và phân phối lại. Người tạo model có thể giới hạn: chỉ phi thương mại, chỉ cá nhân, bắt ghi công, cấm một số nội dung. Các giới hạn này đặt trong "ライセンス設定" của từng model. | Văn bản đã xác minh, từng model chưa xác minh | Chỉ đối chiếu bản tiếng Nhật trên vrm.dev. Bản tiếng Anh chưa đọc. Phải đọc license setting của từng model trước khi nhập. |
| 12 | three-vrm (pixiv) | https://github.com/pixiv/three-vrm/blob/dev/LICENSE | MIT. | Đã xác minh | Đối chiếu LICENSE nhánh dev. Chưa đối chiếu gói npm 3.5.5 trong phiên này. |
| 13 | Sketchfab | https://sketchfab.com/licenses | Điều khoản chung: loại Editorial cấm dùng thương mại và quảng bá. Loại Standard có hạn chế. Không xác định được bộ lọc CC0 trực tiếp. Nhãn license có khi không khớp mô tả trên trang model. | Chưa xác minh | Chỉ nhận model có ghi CC0 trên trang model và không phải Editorial. Không dựa vào nhãn tìm kiếm. |
| 14 | Quaternius | https://quaternius.com/ và https://quaternius.com/packs/ultimatemonsters.html | Trang chính thức đọc được trong phiên này không hiển thị dòng license. Một catalog bên thứ ba ghi CC0 cho pack Ultimate Monsters (ngày 2026-07-19) và nêu license mới "QAL v1.0" áp dụng từ 2026-08-28. Chưa kiểm chứng. | Chưa xác minh | Mở từng trang pack bằng trình duyệt để đọc dòng license và điều khoản QAL trước khi nhập. |
| 15 | VRoid Hub | https://hub.vroid.com/ | Điều kiện do tác giả đặt cho từng model: thương mại (cá nhân, doanh nghiệp), chỉnh sửa, phân phối lại, ghi công. Trang điều khoản chính thức trả về 403. | Chưa xác minh | Không đưa vào. |
| 16 | Mixamo | https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html | FAQ (cập nhật 2021): nhân vật và animation dùng miễn phí cho dự án thương mại, kể cả game. Điều khoản Adobe về phân phối lại trả về 403. | Chưa xác minh (điều khoản phân phối lại) | Rủi ro lớn nếu đưa file FBX hoặc GLB gốc ra client tải về. Xem mục 6. |
| 17 | Pixabay Music | https://pixabay.com/service/license-summary/ | Trang chính thức trả về 403. Nguồn thứ cấp nói: dùng thương mại không cần ghi công, không bán lại dạng file độc lập, nên lưu link tải và tên file. | Chưa xác minh | Không đưa vào danh sách khuyến nghị. |
| 18 | CC0 1.0 (tham chiếu) | https://creativecommons.org/publicdomain/zero/1.0/ | Mở được trang chính thức. | Đã xác minh | Chuẩn so sánh. |

**Tóm tắt số lượng**: đã xác minh đầy đủ 4 nguồn (Kenney, Poly Haven, ambientCG, Google Fonts). Chính sách đã xác minh nhưng phải kiểm từng mục: 4 nguồn (Freesound, OpenGameArt, Free Music Archive, VRM Public License 1.0). Chưa xác minh: 5 nguồn (Quaternius, Sketchfab, VRoid Hub, Mixamo, Pixabay Music).

## 3. Bảng tài nguyên đề xuất

| Loại tài nguyên | Nguồn | URL | License | Điều kiện bắt buộc | Khu trong mặt bằng | Trạng thái |
|---|---|---|---|---|---|---|
| Bàn, ghế, tủ, sofa, đèn | Kenney | https://kenney.nl/assets | CC0 | Giữ file license đi kèm pack | desk_L1 đến L3, desk_B1 đến B7, open_north, mr1 đến mr3 (ghế họp), lounge (sofa), games_corner (bàn, ghế), karaoke_room (sofa, ghế), util_print (tủ), util_health | Đã xác minh (nguồn). Pack cụ thể chưa chọn |
| Cây cảnh, đèn, đồ decor 3D | Poly Haven (models), Kenney | https://polyhaven.com/models | CC0 | Không bắt buộc | lounge (cây), pantry, entrance, service_desk | Đã xác minh (nguồn) |
| Cốc, sổ, bút, ghim, cờ, bong bóng | Kenney, Poly Haven | như trên | CC0 | Không bắt buộc | pantry (cốc), util_print (sổ, bút, ghim), notice_board (ghim), events_board (cờ, bong bóng, ghim), entrance (cờ), lounge (bong bóng, bảng vinh danh), games_corner (bong bóng) | Đã xác minh (nguồn) |
| Sàn gỗ, thảm, tường, vải | Poly Haven (textures), ambientCG | https://polyhaven.com/textures ; https://ambientcg.com | CC0 | Không bắt buộc | Sàn gỗ: lounge, games_corner, khu làm việc. Thảm và vải: util_quiet, util_health, karaoke_room (ghế, tường). Tường: tường ngoài, tường NOC ở open_north | Đã xác minh (nguồn) |
| HDRI ánh sáng môi trường | Poly Haven (hdris), ambientCG | https://polyhaven.com/hdris | CC0 | Không bắt buộc | Toàn tầng | Đã xác minh (nguồn) |
| Font tiếng Việt | Be Vietnam Pro, Noto Sans, Inter | https://github.com/google/fonts (ofl/bevietnampro, ofl/notosans, ofl/inter) | OFL 1.1 | Giữ OFL.txt và thông báo bản quyền cạnh font. Nếu sửa và đổi tên, không dùng tên reserved trong OFL.txt. Nên tự host, không gọi CDN ngoài | Toàn UI, notice_board, events_board, bảng vinh danh (lounge), panel đặt phòng | Đã xác minh |
| SFX (chuông service desk, cửa, nhấp, thông báo) | Freesound, OpenGameArt | https://freesound.org ; https://opengameart.org | CC0 hoặc CC BY, từng mục | CC BY: ghi công. Lưu link, ID, tác giả, ngày tải | service_desk (chuông), entrance, events_board, mr1 đến mr3 (xác nhận đặt phòng), games_corner, lounge | Chính sách đã xác minh, từng mục chưa xác minh |
| Nhạc nền | Free Music Archive | https://freemusicarchive.org | CC0 hoặc CC BY, từng bài | CC BY: ghi tên bài, tác giả, FMA, license, link. Lưu trang bài và ngày tải | lounge, pantry, games_corner | Chính sách đã xác minh, từng bài chưa xác minh |
| Avatar nhân vật (VRM) | Model VRM cụ thể; three-vrm (MIT) để hiển thị | https://vrm.dev/licenses/1.0/ ; https://github.com/pixiv/three-vrm | VRM Public License 1.0 theo license setting từng model; MIT cho thư viện | Đọc license setting từng model. Ghi công nếu được bật. Lưu bản chụp license setting | entrance (điểm xuất hiện nhân vật 25.0, 17.0), toàn tầng | Văn bản đã xác minh, từng model chưa xác minh |
| Tóc, quần áo | Chưa có nguồn đã xác minh | — | — | — | — | Chưa tìm được nguồn, để trống |
| Nhạc karaoke (karaoke_room) | Chưa có nguồn đã xác minh | — | — | — | karaoke_room | Không lấy từ nguồn trong bảng. Cần bản nhạc riêng có license rõ, xem mục 6 |

## 4. Điều kiện bắt buộc

- **Ghi công** (CC BY, và VRM Public License khi model bật ghi công): tạo trang "Nguồn và giấy phép" trong app, đồng thời ghi vào THIRD_PARTY.md. Mỗi mục ghi: tên tác phẩm, tác giả, nguồn (URL), license kèm link, và nếu có chỉnh sửa thì nêu rõ. Điều kiện này lấy theo văn bản CC BY. Trang deed CC BY 4.0 chưa mở trong phiên này.
- **Lưu bằng chứng** cho mỗi mục: URL nguồn, URL license, tên file gốc, ngày tải, sha256 của file, và bản chụp trang license (PDF hoặc HTML). Với Freesound, OpenGameArt và Free Music Archive, lưu thêm trang của âm thanh hoặc bài nhạc.
- **OFL**: giữ OFL.txt cạnh font. Không đổi license của font.
- **CC0**: không bắt buộc ghi công, vẫn ghi nguồn để dễ kiểm tra lại.
- Nếu mục có license khác với bảng này, dừng và báo lại.

## 5. Quy trình nhập tài nguyên

1. Chọn mục cụ thể (không chỉ chọn nguồn). Ghi vào THIRD_PARTY.md với trạng thái "chưa xác minh".
2. Mở trang của đúng mục đó. Đọc license, điều khoản và thông tin tác giả. Lưu bằng chứng.
3. Kiểm tra license nằm trong danh sách cho phép (mục 1). Loại nếu có NC, ND, SA, GPL, "personal", editorial, hoặc không có license.
4. Kiểm tra nội dung: không có logo, nhân vật hoạt hình có thương hiệu, nhãn hàng, người thật.
5. Cập nhật THIRD_PARTY.md, mỗi mục một dòng: ID, nguồn, tác giả, license, URL license, ngày kiểm tra, khu dùng, điều kiện ghi công.
6. Đặt file theo cấu trúc đề xuất. Repo hiện chưa có thư mục `public/`, tạo khi nhập mục đầu tiên:
   - `public/assets/models/kenney/<slug>/`
   - `public/assets/textures/polyhaven/<slug>/` và `public/assets/textures/ambientcg/<slug>/`
   - `public/assets/hdri/polyhaven/<slug>/`
   - `public/assets/audio/sfx/freesound/<id>/` và `public/assets/audio/sfx/opengameart/<slug>/`
   - `public/assets/audio/music/fma/<id>/`
   - `public/assets/fonts/<ten-font>/`
   - `public/assets/avatars/vrm/<model-id>/`

   Mỗi thư mục có `SOURCE.json` với các trường: source_url, author, license, license_url, checked_at, sha256, zones.
7. Trước khi commit: đối chiếu license với bảng mục 3 và kiểm tra kích thước file. Nếu có file lớn, quyết định Git LFS với chủ dự án trước. Không commit từ thư mục tạm.
8. Rà soát lại mỗi quý, đặc biệt Quaternius (QAL), Sketchfab và các model VRM.

## 6. Không đưa vào

| Loại | Lý do |
|---|---|
| CC BY-NC (Freesound, OpenGameArt, FMA) | Cấm dùng thương mại. Ràng buộc dự án không cho phép NC. |
| CC BY-ND | Không cho chỉnh sửa, không cắt, đổi màu hay tối ưu được. |
| CC BY-SA | Buộc sản phẩm phái sinh cùng license. Không nằm trong danh sách cho phép. |
| GPL (OpenGameArt) | Copyleft, không nằm trong danh sách cho phép. |
| "Miễn phí cho cá nhân", "non-commercial" | Không dùng thương mại. |
| Sketchfab Editorial | Cấm dùng thương mại và quảng bá. |
| Quaternius (đến khi xác minh trang pack) | Chưa kiểm chứng dòng license. Có dấu hiệu license mới QAL v1.0. |
| Mixamo | Điều khoản phân phối lại chưa xác minh. Rủi ro khi đưa file gốc ra client. |
| VRoid Hub | Điều kiện theo từng model, điều khoản chung không đọc được. |
| Pixabay Music | Điều khoản chính thức không đọc được. Nguồn thứ cấp nêu hạn chế phân phối lại và Content ID. |
| Nhạc thương mại, nhạc trong game hoặc phim, nhạc quảng cáo, backing track karaoke | Có bản quyền. Không đưa vào sản phẩm nội bộ nếu không có giấy phép. Gồm cả nhạc cho karaoke_room. |
| Nội dung có thương hiệu: logo, nhân vật hoạt hình, sản phẩm có nhãn hiệu | Quyền thương hiệu. |
| Ảnh hoặc quét người thật | Quyền hình ảnh và dữ liệu cá nhân. |
| Tài nguyên không rõ license, ảnh lấy từ web, repo không có LICENSE | Không xác định được quyền sử dụng. |
| Font không có OFL hoặc Apache, font trả phí, font "miễn phí cá nhân" | Không đủ quyền thương mại. |

## 7. Việc còn mở

- Mở các trang Quaternius, Mixamo, VRoid Hub và Pixabay bằng trình duyệt của người phụ trách, vì công cụ rà soát bị 403. Ghi kết quả vào mục 2.
- Chọn pack và mục cụ thể cho từng khu.
- Pháp chế xác nhận cách ghi công và yêu cầu lưu bằng chứng trước khi phát hành.

## 8. Nguồn từng asset đã có trong repo (cập nhật 2026-11-07)

Mọi file dưới `public/` hiện chỉ gồm 3 GLB và `manifest.json`. Không có font, âm thanh, texture hay HDRI trong repo (font dùng của hệ thống). Đồ nội thất/prop trong cảnh dựng bằng mã (primitive three.js), không có file bên ngoài.

| Asset | File | Nguồn | License ghi nhận | Bằng chứng | Trạng thái |
|---|---|---|---|---|---|
| char.male_real | public/models/male_real.glb | Dữ liệu MakeHuman xuất bằng MPFB 2 (Blender 4.2) | CC0-1.0 (theo pipeline) | Chưa có: chưa mở trang license MakeHuman, chưa lưu ảnh chụp, tên file gốc trên VPS `/opt/gpb-mpfb/out/` chưa đối chiếu | THIẾU bằng chứng (`verified = false`) |
| char.female_real | public/models/female_real.glb | như trên | như trên | như trên | THIẾU bằng chứng |
| char.chibi | public/models/chibi.glb | như trên (biến thể tỷ lệ chibi) | như trên | như trên | THIẾU bằng chứng |
| 6 shape key thân (bodyBelly, bodyWaistSlim, bodyHipsWide, bodyShouldersV, headFat, chestMuscle) | trong 3 GLB trên | Do pipeline tạo | Không rõ | Chưa đối chiếu với target MakeHuman gốc | THIẾU bằng chứng |

Việc cần người có quyền truy cập làm: mở trang license MakeHuman/MPFB, lưu bản chụp có ngày, đối chiếu sha256 với file gốc trên VPS, rồi mới đặt `license.verified = true`. Cảnh báo `LICENSE_UNVERIFIED` còn lại là đúng thực tế, không tắt.

### Cảnh báo validator: đã giảm và còn lại

- Giảm 12 cảnh báo `SOCKET_UNCALIBRATED` (hand_l, hand_r, head, back của 3 nhân vật) nhờ đo từ xương/đỉnh mesh thật bằng `scripts/assets/measure-sockets.mjs` (có test `measure-sockets.test.mjs`). "calibrated" ở đây nghĩa là vị trí đã đo, `rotationDeg` chưa đo.
- Còn lại 24: 9 `SOCKET_UNCALIBRATED` (neck, foot_l, foot_r chưa đo), 9 `BLEND_UNAPPROVED` (3 material mỗi file đang BLEND trong GLB; chỉ sửa được bằng xuất lại GLB, không đổi manifest cho đẹp), 3 `PIVOT_OFFSET_REQUIRED` (đáy cách origin 2,4 đến 2,7 cm, thật), 3 `LICENSE_UNVERIFIED` (xem trên).
