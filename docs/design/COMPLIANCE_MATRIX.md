# Bảng đối chiếu đặc tả với mã nguồn (COMPLIANCE_MATRIX)

Ngày đối chiếu: 06/11/2026, ảnh chụp mã lúc 20:17 (giờ máy). Chỉ đọc mã, không chạy npm, tsc, vite hay trình duyệt.

Đặc tả: `promy_update/control.txt`, `room.txt`, `fashion.txt`, `user.txt`, `tuongtac.txt`.

Cách chấm:
- **ĐẠT**: có mã cụ thể, đã mount vào App hoặc cảnh, nêu file:dòng.
- **MỘT PHẦN**: có một phần, hoặc có mã nhưng chưa mount hay chưa nối vào luồng chạy.
- **CHƯA LÀM**: không tìm thấy mã.
- **BỊ CHẶN**: cần tài nguyên (asset, thư viện) hoặc quyết định của người dùng, hoặc cần chạy thử mà phiên này không được chạy.

Lưu ý khi đọc bảng:
- Trong lúc đối chiếu, các file trong `src/scene/interact/` vẫn đang được sửa (giờ sửa từ 20:08 đến 20:16), và `framework.ts`, `InteractionHud.tsx`, `interaction.css` mới xuất hiện giữa chừng. Bảng phản ánh trạng thái lúc 20:17.
- Đường dẫn tính từ `src/` nếu không ghi khác.

## 1. Tổng kết

| Đặc tả | Số yêu cầu | ĐẠT | MỘT PHẦN | CHƯA LÀM | BỊ CHẶN | Tỷ lệ ĐẠT |
|---|---:|---:|---:|---:|---:|---:|
| control.txt (CTRL) | 28 | 19 | 5 | 2 | 2 | 68% |
| room.txt (ROOM) | 59 | 40 | 15 | 2 | 2 | 68% |
| fashion.txt (FASH) | 54 | 5 | 34 | 9 | 6 | 9% |
| user.txt (USER) | 45 | 1 | 21 | 10 | 13 | 2% |
| tuongtac.txt (TI) | 58 | 5 | 26 | 24 | 3 | 9% |
| **Tổng** | **244** | **70** | **101** | **47** | **26** | **29%** |

### Phát hiện chính

1. **Module thời trang không được dùng.** `src/fashion/*` (catalog, rules, presets, tattoos, scars, face, hair, khoảng 3.400 dòng) chỉ là dữ liệu và hàm kiểm tra. Không file nào ngoài `src/fashion` import nó (Grep `from '.*fashion` không có kết quả). UI và cảnh vẫn dùng `Appearance` cũ 10 trường (`avatar/appearance.ts:50-62`).
2. **Không có asset nhân vật.** Dự án không có thư mục `public/`, không có tệp `.vrm`, `.glb`, `.gltf`, `.fbx`. `Player.tsx:207` gọi `<Avatar>` không truyền `url`, nên luôn vẽ `FallbackAvatar` dựng từ khối hình học. Mọi yêu cầu về morph target, skinning, IK, hình xăm bám da, fitting trang phục, da PBR có normal map đều bị chặn vì thiếu asset.
3. **Khung tương tác mới chưa mount.** `InteractionSystem`, `registry`, `controller` (menu nhiều hành động), `InteractHighlight` (viền sáng), `selection.isOccluded` (chặn xuyên tường), `characterState`, `objectStates`, `InteractionHud` đã viết nhưng `ITOffice.tsx:487` vẫn mount `InteractTracker` cũ. `registerInteractable` không có nơi gọi. Đường đang chạy (`interact/geometry.ts:185 pickFocus`) không kiểm tra vật cản.
4. **Chưa có vật tương tác cụ thể** ngoài ghế: không có cửa mở được, máy tính, ngăn kéo, đồ nhỏ cầm được, công tắc đèn, rèm, cây nước, máy in. Thẻ "E — Mở cửa" hiện ở thang máy (`interact/geometry.ts:46`) nhưng hành động là mở panel thông tin, không mở cửa.
5. **Âm thanh bị tắt.** `ITOffice.tsx:190` đặt `audioEnabled = false`, `App.tsx:332-345` không truyền prop này, nên thanh âm lượng trong bảng phím và menu tạm dừng không có âm nào để chỉnh.
6. **Chế độ sắp xếp chưa mount.** `layout/useMoveMode.ts`, `ui/LayoutMovePanel.tsx`, `layout/GhostMesh.tsx` có mã, `LayoutProvider` có trong `App.tsx:305`, nhưng không component nào trong cảnh gọi `useMoveMode` hay mount `LayoutMovePanel`.

### Mâu thuẫn giữa các đặc tả (cần người dùng chọn)

| Mâu thuẫn | Đặc tả A | Đặc tả B | Hiện trạng mã | Đề xuất |
|---|---|---|---|---|
| Phong cách nhân vật | fashion.txt mục 1: chibi, đầu lớn, thân gọn | user.txt dòng 1: thay chibi bằng người trưởng thành chân thực | `fashion/types.ts:27-34` có cả `'realistic'` (mặc định) và `'chibi'`; `FallbackAvatar` vẽ tỷ lệ người thật (`avatar/fallbackBody.tsx:16-22`) | Người dùng chọn một: (a) chỉ realistic, bỏ phần chibi của fashion.txt; (b) giữ cả hai như `BodyStyle`, nhưng cần hai bộ mesh và gấp đôi asset trang phục. |
| Tên tab trình chỉnh | fashion.txt mục 7: Cơ thể, Khuôn mặt, Tóc, Hình xăm & Sẹo, Trang phục, Phụ kiện, Bộ đã lưu | user.txt mục 6: Tổng thể, Khuôn mặt, Hình thể, Da, Tóc & Râu, Hình xăm & Sẹo, Trang phục, Phụ kiện | `onboarding/AvatarCreator.tsx:491-509` có 5 tab (body, hair, outfit, acc, review) | Chốt một danh sách tab trước khi làm phòng thay đồ. |
| Cách chỉnh hình thể | fashion.txt mục 2: thanh thông số | user.txt mục 2: kéo trực tiếp trên cơ thể kèm thanh thông số | Chưa có cả hai | Cả hai đều cần mesh có morph target. Quyết định asset trước. |
| Vật lý | control.txt: Rapier, capsule, bước thời gian cố định | tuongtac.txt mục 2: đồ nhỏ rơi tự do có khối lượng | Va chạm hình chữ nhật 2D tự viết (`controls/gtaMotion.ts:89-209`), không có thư viện vật lý | Người dùng duyệt thêm `@dimforge/rapier3d-compat` (hoặc giữ va chạm 2D và bỏ yêu cầu rơi tự do). |

### Tài nguyên cần bổ sung (lý do của các mục BỊ CHẶN)

- Mesh người có rig humanoid và bộ morph target hình thể, mặt (ví dụ VRM 1.0 từ VRoid theo `docs/design/AVATAR_SPEC.md`), kèm texture da có normal map và roughness map.
- Mesh trang phục cùng rig cho từng món trong `fashion/catalog.ts`, có biến thể phom và morph theo hình thể.
- GLB phụ kiện gắn bone (kính, đồng hồ, điện thoại, tai nghe, balo).
- Hoạt ảnh cầm đồ, dùng thiết bị, nhìn điện thoại, lấy nước.
- GLB nội thất nếu muốn tăng độ giống ảnh (room.txt mục 8).
- Thư viện vật lý: `@dimforge/rapier3d-compat` hoặc `@react-three/rapier` (cần duyệt thêm dependency).
- Môi trường chạy thử (VPS) để chạy dự án, chụp ảnh và thử thao tác chuột, bàn phím, cảm ứng.

### Năm mảng thiếu nhiều nhất

1. Vật tương tác cụ thể trong tuongtac.txt: cửa, máy tính, ngăn kéo và tủ, đồ nhỏ, công tắc đèn, rèm, cây nước, máy in (24 mục CHƯA LÀM).
2. Phòng thay đồ và hệ thời trang: `src/fashion` không được dùng, không có hình xăm, sẹo, họa tiết, bộ phối mẫu nào hiển thị.
3. Nhân vật chân thực và co kéo hình thể: không có mesh, rig, morph; không có công cụ kéo trên cơ thể.
4. Khung tương tác chung chưa mount: menu nhiều hành động, viền sáng, chặn xuyên tường, máy trạng thái nhân vật, lưu trạng thái vật.
5. Chế độ xem tổng thể, điểm camera đặt sẵn, chế độ sắp xếp đồ, và vật lý (Rapier, bậc, dốc, bước thời gian cố định).

## 2. control.txt (CTRL)

| ID | Nguồn | Yêu cầu rút gọn | Trạng thái | Bằng chứng | Ghi chú, việc tiếp |
|---|---|---|---|---|---|
| CTRL-01 | Di chuyển | W/A/S/D, phím mũi tên đi theo hướng camera | ĐẠT | `scene/controls/useGtaControls.ts:117-135`; `scene/controls/index.ts:193-197` | |
| CTRL-02 | Di chuyển | Shift chạy, Space nhảy, E tương tác | ĐẠT | `useGtaControls.ts:83,136-142`; `controls/gtaMotion.ts:159,227-231`; `interact/InteractTracker.tsx:68-72` | |
| CTRL-03 | Di chuyển | Xoay mượt theo hướng đi, tăng tốc và giảm tốc | ĐẠT | `gtaMotion.ts:11-29,164-178,216-223` | |
| CTRL-04 | Di chuyển | Chuyển animation mượt idle, đi, chạy, nhảy; nhịp khớp tốc độ | ĐẠT | `avatar/animation.ts:241-276` (`stepLocomotion`, pha theo quãng đường) | Hoạt ảnh là tư thế thủ tục trên rig khối hình học, không phải clip. |
| CTRL-05 | Di chuyển | Trọng lực, va chạm sàn | MỘT PHẦN | `gtaMotion.ts:225-242` | Trọng lực chỉ rơi về mặt phẳng y = 0, không có hình học sàn. |
| CTRL-06 | Di chuyển | Va chạm tường, bàn ghế, cửa; không xuyên | MỘT PHẦN | `gtaMotion.ts:89-209`; `scene/ITOffice.tsx:270-273` | Hình chữ nhật 2D trên sàn, không có chiều cao. Ghế nằm trong footprint khối bàn, không chặn riêng. Không có cửa có collider. |
| CTRL-07 | Di chuyển | Bước qua bậc thấp, đi trên dốc, cầu thang | CHƯA LÀM | `gtaMotion.ts:240-241` ép y = 0 | Cần hình học bậc, dốc và bộ điều khiển nhân vật có step offset. |
| CTRL-08 | Camera | Sau lưng, cao hơn vai; chuột xoay ngang và dọc | ĐẠT | `controls/gtaCamera.ts:20-21,285-290` | Phải giữ chuột phải mới xoay, không dùng pointer lock như GTA V. |
| CTRL-09 | Camera | Bám mượt, nhìn quanh khi đứng yên, giới hạn góc dọc | ĐẠT | `gtaCamera.ts:161-165,198-224` | |
| CTRL-10 | Camera | Cuộn chuột đổi khoảng cách | ĐẠT | `gtaCamera.ts:352-358` | |
| CTRL-11 | Camera | Gặp vật cản thì camera tiến gần, hết vướng thì trở lại | ĐẠT | `gtaCamera.ts:87-147,232-242` | Tia nhìn tính trên hình chiếu 2D kèm độ cao gần đúng `obstacleTop`. |
| CTRL-12 | Camera | V đổi góc nhìn thứ ba và thứ nhất | ĐẠT | `useGtaControls.ts:173-176`; `gtaCamera.ts:207-218`; `scene/Player.tsx:206` | |
| CTRL-13 | Tương tác | Gợi ý "E — Mở cửa", "E — Ngồi xuống", "E — Xem thông tin phòng" | MỘT PHẦN | `interact/geometry.ts:21-26`; `interact/InteractPrompt.tsx:19-36`, mount `App.tsx:350` | "Mở cửa" gán cho thang máy và vật có chữ "cửa" (`geometry.ts:46`) nhưng hành động là mở panel, không mở cửa. |
| CTRL-14 | Tương tác | Chỉ vật trong tầm với và trước mặt | ĐẠT | `geometry.ts:11-15,168-200` | |
| CTRL-15 | Tương tác | Ngồi: khóa di chuyển, căn đúng ghế; E đứng dậy | ĐẠT | `controls/index.ts:165-192`; `InteractTracker.tsx:39-63` | |
| CTRL-16 | Web | Esc mở menu tạm dừng, giải phóng con trỏ, xóa phím giữ; nút "Tiếp tục" | ĐẠT | `useGtaControls.ts:92-98,160-171`; `gtaCamera.ts:364-373`; `InteractPrompt.tsx:117-138` | |
| CTRL-17 | Web | Không cuộn trang; mất focus thì dừng nhận điều khiển | ĐẠT | `useGtaControls.ts:82,89-102`; `gtaCamera.ts:271,352-353`; `Player.tsx:143-158` | |
| CTRL-18 | Web | Bảng hướng dẫn phím nhỏ, ẩn được | ĐẠT | `InteractPrompt.tsx:74-114`, mount `App.tsx:349` | |
| CTRL-19 | Web | Tùy chỉnh độ nhạy chuột và âm lượng | MỘT PHẦN | `controls/session.ts:115-122,165-206`; `InteractPrompt.tsx:39-71` | Độ nhạy hoạt động. Âm lượng chỉnh AmbientEngine nhưng âm nền tắt (`ITOffice.tsx:190`, App không bật), nên không nghe được thay đổi. |
| CTRL-20 | Web | Điện thoại: joystick trái, kéo phải xoay camera, nút chạy, nhảy, tương tác | ĐẠT | `InteractPrompt.tsx:140-245,248-256`; `gtaCamera.ts:292-339` | Chưa thử trên thiết bị thật. |
| CTRL-21 | Kỹ thuật | Three.js hoặc React Three Fiber | ĐẠT | `package.json` (three 0.169.0, @react-three/fiber 8.17.10) | |
| CTRL-22 | Kỹ thuật | Rapier cho vật lý, capsule collider | BỊ CHẶN | Không có Rapier trong `package.json` | Cần người dùng duyệt thêm dependency. Hiện dùng hình tròn bán kính `PLAYER_RADIUS` và hình chữ nhật 2D. |
| CTRL-23 | Kỹ thuật | Tách input, di chuyển, camera, animation, tương tác | ĐẠT | `controls/useGtaControls.ts`, `gtaMotion.ts`, `gtaCamera.ts`, `avatar/animation.ts`, `scene/interact/`; mô tả `controls/index.ts:107-111` | |
| CTRL-24 | Kỹ thuật | Di chuyển độc lập FPS | ĐẠT | `gtaMotion.ts:142` (nhân dt, giới hạn `maxDt`), `gtaMotion.ts:185-209` chia bước con | |
| CTRL-25 | Kỹ thuật | Vật lý chạy theo bước thời gian cố định | CHƯA LÀM | `controls/index.ts:157,211` gọi `stepMotion` với dt biến thiên | Cần bộ tích lũy thời gian và bước cố định (làm được kể cả khi chưa có Rapier). |
| CTRL-26 | Kỹ thuật | Tối ưu mô hình, bóng đổ, va chạm | MỘT PHẦN | `scene/InstancedBoxes.tsx`; `scene/OfficeProps.tsx:263-264` (3 draw call); `lighting/rigs.tsx:121` (giới hạn đèn có bóng) | Chưa đo FPS hay số draw call khi chạy. |
| CTRL-27 | Mục cuối | Cảm giác tự nhiên khi qua hành lang, cửa hẹp, dãy bàn | BỊ CHẶN | | Cần chạy thử trên VPS; phiên này không được chạy dự án. |
| CTRL-28 | Mục cuối | Dùng nhân vật và tài nguyên được phép; chỉ tham khảo cơ chế GTA V | ĐẠT | `avatar/FallbackAvatar.tsx` dựng thủ tục, không có asset bên thứ ba | |

## 3. room.txt (ROOM)

| ID | Nguồn | Yêu cầu rút gọn | Trạng thái | Bằng chứng | Ghi chú, việc tiếp |
|---|---|---|---|---|---|
| ROOM-01 | Mục 1 | Chỉ dựng khu chữ L trong đường khoanh | ĐẠT | `scene/officeBounds.ts:19-60,86-92`; lọc ở `scene/ITOffice.tsx:201-209` | |
| ROOM-02 | Mục 1 | Giữ hướng, tỷ lệ, tường, cột, cửa, hành lang, cụm bàn, phòng theo bản vẽ | MỘT PHẦN | `content/zones/it.json`; `officeBounds.ts:20` | Không thấy mã dựng cột. Cửa phòng không có hình học. Chưa đối chiếu được với ảnh mặt bằng khi chạy. |
| ROOM-03 | Mục 1 | Bỏ khu dự phòng và khu trống bên phải | ĐẠT | `officeBounds.ts:86-92` (`isObjectInOffice`, reserved bị loại) | |
| ROOM-04 | Mục 1 | Đường xanh không dựng thành vật thể | ĐẠT | `scene/Floorplan.tsx:19-36` (cạnh trong chữ L không dựng tường) | |
| ROOM-05 | Mục 1 | Kích thước đọc từ bản vẽ, nếu không thì chuẩn, tập trung trong cấu hình | ĐẠT | `env/deskConfig.ts:7-38`; `scene/officePropsLayout.ts:55-140`; `scene/layout.ts` | |
| ROOM-06 | Mục 1 | Không chép méo phối cảnh của ảnh vào hình học | ĐẠT | `officeBounds.ts:38-46` (hình chữ nhật thẳng trục) | |
| ROOM-07 | Mục 2 Sàn | Gạch xám khổ lớn, vân đá trắng mảnh, biến thiên giữa viên | ĐẠT | `Floorplan.tsx:76-135` | |
| ROOM-08 | Mục 2 Sàn | Ron mảnh, đều, đúng tỷ lệ | ĐẠT | `Floorplan.tsx:136-142` | |
| ROOM-09 | Mục 2 Sàn | Bóng vừa, phản chiếu mờ đèn và đồ | ĐẠT | `Floorplan.tsx:57-67,152-178`; `scene/officeEnv.ts:18-59` | Phản chiếu từ env map nướng sẵn, không phản chiếu đồ nội thất động. |
| ROOM-10 | Mục 2 Sàn | Ô sáng là phản chiếu, không vẽ cố định vào texture | ĐẠT | `Floorplan.tsx:152-156` | |
| ROOM-11 | Mục 2 Sàn | Không thảm, không sàn gỗ ở khu làm việc | ĐẠT | `Floorplan.tsx:157-178,211` | |
| ROOM-12 | Mục 2 Tường | Tường trắng, cột vuông trắng | MỘT PHẦN | `Floorplan.tsx:14-36` | Có tường, không có cột. |
| ROOM-13 | Mục 2 Tường | Một số tranh slogan chữ nhật trên tường, tiết chế | MỘT PHẦN | `scene/Corridors.tsx:12,248-252` (tranh khu trưng bày) | Khẩu hiệu hiện là băng treo trần, không phải tranh trên tường khu làm việc. |
| ROOM-14 | Mục 2 Tường | Cửa sổ và rèm cuốn xám theo mặt bằng và ảnh | MỘT PHẦN | `window/glass.tsx:51-92`; `ITOffice.tsx:104-108,460-462` | Có kính và cảnh thành phố ở góc Đông-Nam. Không có rèm cuốn. |
| ROOM-15 | Mục 2 Trần | Trần thả tấm vuông trắng, khung chia ô mảnh | ĐẠT | `scene/OfficeCeiling.tsx:1-8`; `officePropsLayout.ts:158-170` | |
| ROOM-16 | Mục 2 Trần | Đèn LED panel âm trần theo lưới | ĐẠT | `OfficeCeiling.tsx:1-4` (emissiveMap cùng texture) | |
| ROOM-17 | Mục 2 Trần | Cửa gió điều hòa và thiết bị trần vừa phải | ĐẠT | `OfficeCeiling.tsx:1-4,29-30` | Vẽ trong texture, không có khối nổi. |
| ROOM-18 | Mục 2 Trần | Bảng tên bộ phận cam/đỏ treo trần dọc dãy bàn, nội dung cấu hình được | MỘT PHẦN | `officePropsLayout.ts:105-140`; `scene/OfficeProps.tsx:152-219` | Có băng đỏ cam treo trần và cấu hình được (`BANNER_TEXTS`), nhưng nội dung là khẩu hiệu, không phải tên bộ phận. |
| ROOM-19 | Mục 2 Trần | Trần hiện diện khi tham quan | ĐẠT | `Floorplan.tsx:184-213` | |
| ROOM-20 | Mục 3 | Một bộ bàn mẫu, tái sử dụng theo cụm | ĐẠT | `env/desk.tsx:166-200` (`DeskSpec`, `Seat`); `ITOffice.tsx:394` | |
| ROOM-21 | Mục 3 Bàn | Mặt chữ nhật vân gỗ kem, cạnh thẳng, dày thật | ĐẠT | `env/desk.tsx:5,232` | |
| ROOM-22 | Mục 3 Bàn | Chân thép hộp xám bạc; một số có tấm chắn gỗ | ĐẠT | `desk.tsx:5,232,528`; `deskConfig.ts:20` (`modestyPanelChance`) | |
| ROOM-23 | Mục 3 Bàn | Dãy dài, ngồi đối diện, mật độ theo bản vẽ | ĐẠT | `desk.tsx:194-200` | |
| ROOM-24 | Mục 3 Bàn | Không thêm vách ngăn cao | ĐẠT | `desk.tsx:5` (chỉ tấm chắn gỗ thấp) | |
| ROOM-25 | Mục 3 Bàn | Kích thước khởi tạo 1,2 x 0,65 x 0,75 m, chỉnh được | ĐẠT | `deskConfig.ts:9-13` (width 1.2, depth 0.65, height 0.75) | |
| ROOM-26 | Mục 3 Hộc tủ | Hộc gỗ có bánh xe, ngăn kéo, tay kéo, khóa; không chặn chỗ để chân | ĐẠT | `desk.tsx:6,258` | |
| ROOM-27 | Mục 3 Ghế | Ghế xoay đen, lưng lưới khung cong, tay vịn, chân năm cánh có bánh xe; lệch góc nhẹ | ĐẠT | `desk.tsx:7,91-148`; `deskConfig.ts:24` | |
| ROOM-28 | Mục 3 Thiết bị | Phần lớn có màn hình, bàn phím, chuột; một số laptop hoặc hai màn | ĐẠT | `desk.tsx:8,478-492`; `deskConfig.ts:39-48` | |
| ROOM-29 | Mục 3 Thiết bị | Màn hình có độ dày, chân đế hoặc tay đỡ | ĐẠT | `desk.tsx:316-329` | |
| ROOM-30 | Mục 3 Thiết bị | Bình nước, cốc, giấy, tai nghe, quạt mini, cây nhỏ | ĐẠT | `desk.tsx:8-9`; `deskConfig.ts:49-64` | |
| ROOM-31 | Mục 3 Thiết bị | Nhiều biến thể bàn, không lấn át | ĐẠT | `deskConfig.ts:39-64` | |
| ROOM-32 | Mục 3 Thiết bị | Nội dung màn hình giả lập chung | ĐẠT | `env/deskAtlas.ts` (ô màn hình), `desk.tsx:492` | |
| ROOM-33 | Mục 4 | Tủ hồ sơ cao gỗ sáng, trên kính, dưới cánh kín | ĐẠT | `OfficeProps.tsx:87-125` | |
| ROOM-34 | Mục 4 | TV lớn màu đen gắn tường | ĐẠT | `display/TvScreen.tsx:19-23`; `scene/itFixtures.ts:24-28`; mount `ITOffice.tsx:408-420` | Chưa kiểm tra vị trí TV có nằm trong chữ L. |
| ROOM-35 | Mục 4 | Cây lớn, cây nước bình xanh, tủ thấp, bình chữa cháy | MỘT PHẦN | `OfficeProps.tsx:55-145`; `officePropsLayout.ts:13` | Không có tủ thấp (`PropKind` chỉ có fire, water, cabinet, plant, bin). |
| ROOM-36 | Mục 4 | Phòng họp, phòng riêng, khu trao đổi, lõi thang theo mặt bằng | ĐẠT | `content/zones/it.json` (mr1–mr3, server_room, soc_room, lounge, core_*) | |
| ROOM-37 | Mục 4 | Vách kính chỉ ở nơi có căn cứ | MỘT PHẦN | `ITOffice.tsx:296-314` (lớp `glass` từ `partsOf`) | Chưa đối chiếu với ảnh. |
| ROOM-38 | Mục 4 | Không tái tạo người thật | ĐẠT | Không có mô hình người theo ảnh | |
| ROOM-39 | Mục 5 | Nhánh trái: cụm bàn, khu phụ trợ, khu trao đổi, phòng họp đúng vị trí | MỘT PHẦN | `it.json` desk_L1–L3 | Cần chạy và so ảnh mặt bằng. |
| ROOM-40 | Mục 5 | Nhánh dưới: chuỗi cụm bàn và phòng dọc cạnh dưới, đúng hướng | MỘT PHẦN | `it.json` desk_B1–B7 | Cần chạy và so ảnh mặt bằng. |
| ROOM-41 | Mục 5 | Trục hành lang liên tục, cửa ra vào thông thoáng | MỘT PHẦN | `scene/Corridors.tsx`; `scene/corridors/` | Không có cửa phòng dựng hình. |
| ROOM-42 | Mục 5 | Bàn ghế, cột, tủ, cửa không xuyên nhau | MỘT PHẦN | `desk.tsx:194-200` (tính khoảng ghế trong footprint) | Chưa có kiểm tra tự động; chưa chạy để xem. |
| ROOM-43 | Mục 5 | Số lượng và hướng cụm bàn khớp bản vẽ, không rải ngẫu nhiên | MỘT PHẦN | `it.json`; `desk.tsx:194-200` (lưới cố định) | Số cụm lấy từ it.json; chưa so với ảnh. |
| ROOM-44 | Mục 6 | Ánh sáng trắng trung tính từ panel, kèm ánh sáng tự nhiên ở cửa sổ | MỘT PHẦN | `lighting/presets.ts:37-45`; `lighting/rigs.tsx` | Không có nguồn sáng tự nhiên riêng tại cửa sổ. |
| ROOM-45 | Mục 6 | Sáng đều, không ám vàng, không tối kiểu điện ảnh | ĐẠT | `presets.ts:40-45` | |
| ROOM-46 | Mục 6 | Vật liệu PBR: gỗ, kim loại, nhựa đen, lưới, kính, gạch có độ phản xạ khác nhau | MỘT PHẦN | `env/deskAtlas.ts:3,267` (roughnessMap); `Floorplan.tsx:61-67` | Không có normal map; lưới ghế là texture alpha, không có vật liệu riêng có kiểm chứng. |
| ROOM-47 | Mục 6 | Bóng tiếp xúc dưới bàn, ghế, tủ | MỘT PHẦN | `env/contactShadow.ts:46`; dùng ở `env/desk.tsx:22` | Tủ hồ sơ và đạo cụ trong `OfficeProps.tsx` không có bóng tiếp xúc. |
| ROOM-48 | Mục 6 | Tránh sàn gương, gỗ cam, nhựa bóng, texture lặp rõ | ĐẠT | `Floorplan.tsx:57-81` | |
| ROOM-49 | Mục 7 | Chế độ xem tổng thể từ trên hoặc isometric, ẩn trần, hạ tường | CHƯA LÀM | Grep "overview", "isometric", "OrthographicCamera" không có kết quả | `OfficeCeiling.tsx:6-8` chỉ chuẩn bị để trần không che khi camera ở trên. |
| ROOM-50 | Mục 7 | Chế độ tham quan tầm mắt, đủ tường và trần, có điều khiển góc nhìn thứ ba | ĐẠT | `scene/Player.tsx:130-137`; `controls/index.ts:112` | |
| ROOM-51 | Mục 7 | Điểm camera đặt sẵn: toàn cảnh L, hành lang trái, hành lang dưới, cụm bàn, phòng họp | CHƯA LÀM | Không tìm thấy | |
| ROOM-52 | Mục 8 | Tái sử dụng scene, camera, điều khiển có sẵn | ĐẠT | `ITOffice.tsx:375-491` | |
| ROOM-53 | Mục 8 | Tách dữ liệu bố trí khỏi mã dựng hình | ĐẠT | `content/zones/it.json`; `officeBounds.ts`; `officePropsLayout.ts`; `deskConfig.ts`; `theme/tokens.ts` | |
| ROOM-54 | Mục 8 | Component dùng lại cho bàn, ghế, màn hình, hộc, tủ, đèn trần | ĐẠT | `desk.tsx:232-337` (hàm dựng từng phần); `OfficeProps.tsx:56-150`; `OfficeCeiling.tsx` | |
| ROOM-55 | Mục 8 | Instancing hoặc chia sẻ geometry và material | ĐẠT | `OfficeProps.tsx:263-264`; `scene/InstancedBoxes.tsx`; `desk.tsx:147-148` | |
| ROOM-56 | Mục 8 | Dùng GLB nếu có; đồ chính không là khối hộp đơn | BỊ CHẶN | Không có tệp GLB | Đồ hiện ghép nhiều khối có chi tiết. Muốn giống ảnh hơn cần GLB nội thất được phép dùng. |
| ROOM-57 | Mục 8 | Tối ưu ánh sáng, bóng đổ, phản chiếu | ĐẠT | `lighting/rigs.tsx:121`; `officeEnv.ts:18-59` (env map nướng một lần) | |
| ROOM-58 | Mục 8 | Không thay không gian bằng panorama | ĐẠT | Cảnh dựng 3D toàn bộ | |
| ROOM-59 | Mục 9 | Tự chạy, chụp ảnh các góc, kiểm tra console | BỊ CHẶN | | Phiên này không được chạy npm hay vite. Cần chạy trên VPS và chụp ảnh đối chiếu. |

## 4. fashion.txt (FASH)

Ghi chú chung: `src/fashion/*` có kiểu dữ liệu, danh mục và hàm kiểm tra, nhưng không file nào ngoài thư mục này import nó. Vì vậy các mục chỉ có dữ liệu được chấm MỘT PHẦN, không phải ĐẠT.

| ID | Nguồn | Yêu cầu rút gọn | Trạng thái | Bằng chứng | Ghi chú, việc tiếp |
|---|---|---|---|---|---|
| FASH-01 | Mục 1 | Nhân vật 3D chibi đầu lớn, thân gọn | MỘT PHẦN | `fashion/types.ts:27-34`; `fashion/rules.ts:129-157` (giới hạn chibi) | Chỉ có dữ liệu. Avatar đang vẽ tỷ lệ người thật. Mâu thuẫn với user.txt, xem mục 1. |
| FASH-02 | Mục 1 | Kết hợp công sở và streetwear (sơ mi, polo, blazer, bomber, hoodie, quần âu, jeans, cargo, sneaker, giày da) | MỘT PHẦN | `fashion/catalog.ts:145` (`GARMENTS`) | Chỉ dữ liệu. Trang phục vẽ được nằm ở `avatar/appearance.ts:8-32`, không có hoodie, bomber, cargo, jeans. |
| FASH-03 | Mục 1 | Tạo hình thống nhất, chất liệu đẹp, đủ chi tiết | BỊ CHẶN | | Cần mesh trang phục thật. |
| FASH-04 | Mục 1 | Trang phục có phom, độ dày, lớp riêng | MỘT PHẦN | `avatar/fallbackOutfit.tsx` (khối hình học riêng cho áo, quần) | Lớp áo là khối hình học, không có mesh trang phục theo rig. |
| FASH-05 | Mục 1 | Phối phong cách lịch sự, tối giản, năng động, nổi bật | MỘT PHẦN | `fashion/catalog.ts:37-48` (`STYLE_TAG_LABELS`) | Chỉ dữ liệu. |
| FASH-06 | Mục 2 | Tổng thể: da, chiều cao, vóc dáng, tỷ lệ đầu thân, vai, tay chân | MỘT PHẦN | UI: `onboarding/AvatarCreator.tsx:523-544` (3 dáng, 6 tông da); dữ liệu: `fashion/types.ts:77-99` | UI không có chiều cao, tỷ lệ đầu, vai, tay chân. |
| FASH-07 | Mục 2 | Mặt: dáng mặt, mắt, mày, mũi, miệng, tai, màu mắt, râu, biểu cảm | MỘT PHẦN | UI màu mắt `AvatarCreator.tsx:568-577`; dữ liệu `fashion/face.ts:11-83` | Chỉ màu mắt có trong UI và cảnh (`avatar/FallbackAvatar.tsx:396`). |
| FASH-08 | Mục 2 | Tóc: kiểu, màu, highlight; side part, undercut, buzz, xoăn, dài | MỘT PHẦN | UI `AvatarCreator.tsx:547-567`; dữ liệu `fashion/hair.ts:22-48`, `types.ts:132-143` | UI có 8 kiểu và màu. Không có highlight, side part, undercut. |
| FASH-09 | Mục 2 | Chỉnh riêng đầu, thân, tay, bàn tay, chân, bàn chân; đối xứng hoặc từng bên | CHƯA LÀM | Dữ liệu `types.ts:41-75` (`ArmShape`, `LegShape`, `Paired`) | Không có UI và không có mesh để áp. |
| FASH-10 | Mục 2 | Giới hạn thông số để dùng chung rig | MỘT PHẦN | `rules.ts:104-157` | Chỉ dữ liệu. |
| FASH-11 | Mục 2 | Thay đổi hình dáng bằng morph target hoặc biến thể tương thích rig | BỊ CHẶN | Không có mesh skinned hay morph | Cần asset (xem mục 1). |
| FASH-12 | Mục 3 | Nhiều hình xăm, sẹo trên mặt, cổ, thân, tay, chân | MỘT PHẦN | `types.ts:172-226` | Chỉ dữ liệu. |
| FASH-13 | Mục 3 | Thư viện hình xăm: chữ, hình học, hoa văn, biểu tượng, line art | MỘT PHẦN | `fashion/tattoos.ts:8-77` | Chỉ dữ liệu, không có bộ vẽ. |
| FASH-14 | Mục 3 | Chỉnh vị trí, kích thước, góc, màu, độ đậm; trái, phải, đối xứng | MỘT PHẦN | `types.ts:186-210` | Chỉ dữ liệu. |
| FASH-15 | Mục 3 | Tải PNG nền trong suốt làm hình xăm | CHƯA LÀM | | |
| FASH-16 | Mục 3 | Sẹo có kiểu, chiều dài, màu, độ nổi; hoạt hình | MỘT PHẦN | `fashion/scars.ts:7-54` | Chỉ dữ liệu. |
| FASH-17 | Mục 3 | Hình xăm bám bề mặt và chuyển động, bị quần áo che | BỊ CHẶN | | Cần mesh skinned có UV để dán decal. |
| FASH-18 | Mục 3 | Danh sách lớp: chọn, sửa, ẩn, xóa; không nhấp nháy | CHƯA LÀM | | |
| FASH-19 | Mục 4 | Nhóm tủ đồ: áo trong, áo ngoài, quần, bộ liền, tất, giày, mũ | MỘT PHẦN | Dữ liệu `catalog.ts:25-35`; UI nhóm trang phục `AvatarCreator.tsx:583-594` | UI nhóm theo bộ đồ liền, không theo slot. |
| FASH-20 | Mục 4 | Danh sách món: sơ mi, polo, phông, hoodie, blazer, bomber, denim, quần âu, chinos, jeans, cargo, short, sneaker, loafer, giày da, boots | MỘT PHẦN | `catalog.ts:145-1054` | Chỉ dữ liệu. Giày vẽ được chỉ có oxford, heels, sneakers (`appearance.ts:35`). |
| FASH-21 | Mục 4 | Màu theo vùng: thân, tay, cổ, viền, đế | MỘT PHẦN | Dữ liệu `types.ts:269-309`; UI chỉ màu áo và màu quần `AvatarCreator.tsx:595-614` | |
| FASH-22 | Mục 4 | Chọn chất liệu cotton, denim, da, dệt, kim loại | MỘT PHẦN | `types.ts:235-251` | Chỉ dữ liệu. |
| FASH-23 | Mục 4 | Họa tiết, chữ, ảnh tải lên ở vùng cho phép | MỘT PHẦN | `catalog.ts:1067-1112`; `types.ts:293-306` | Chỉ dữ liệu; không có tải ảnh. |
| FASH-24 | Mục 4 | Chỉnh vị trí, tỷ lệ, góc, màu họa tiết, xem trước trực tiếp | CHƯA LÀM | | |
| FASH-25 | Mục 4 | Biến thể phom regular, slim, oversized; sơ vin | MỘT PHẦN | `types.ts:232-233` (`FITS`) | Chỉ dữ liệu, không có mesh biến thể. |
| FASH-26 | Mục 4 | Phối nhiều lớp với quy tắc tương thích, tự xử lý xung đột | MỘT PHẦN | `rules.ts:839-890` (`validate`, `canWear`, `conflictsOf`) | Hàm thật nhưng không được gọi từ UI. |
| FASH-27 | Mục 4 | Giữ thiết kế món đồ khi đổi cơ thể | CHƯA LÀM | | |
| FASH-28 | Mục 5 | Vị trí gắn phụ kiện theo bộ xương | MỘT PHẦN | Dữ liệu `catalog.ts:1121-1165`; vẽ `avatar/fallbackAccessories.tsx:45-53` | Bộ vẽ gắn vào nhóm khối của rig dự phòng, không có bone thật. |
| FASH-29 | Mục 5 | Phụ kiện đầu, mặt, cổ, thân, tay, trang phục (kính, khuyên, khẩu trang, tai nghe, dây chuyền, balo, nhẫn, điện thoại, thắt lưng) | MỘT PHẦN | Dữ liệu `catalog.ts:1196-1241`; vẽ được 9 món `appearance.ts:38-47` | Không có khẩu trang, tai nghe, balo, nhẫn, điện thoại trong cảnh. |
| FASH-30 | Mục 5 | Chỉnh màu, vật liệu, kích thước phụ kiện | MỘT PHẦN | `catalog.ts:1251-1254` | Chỉ dữ liệu, không có UI. |
| FASH-31 | Mục 5 | Phụ kiện bám đúng bộ phận, không trôi khi chạy | MỘT PHẦN | `fallbackAccessories.tsx` | Bám theo khối của rig dự phòng; chưa chạy để kiểm. |
| FASH-32 | Mục 5 | Điện thoại cất, cầm, dùng; animation nhìn hoặc chụp | MỘT PHẦN | `types.ts:375-381` (`PHONE_STATES`) | Chỉ dữ liệu, không có mesh và hoạt ảnh. |
| FASH-33 | Mục 6 | Ít nhất 6 bộ phối mẫu | MỘT PHẦN | `fashion/presets.ts:230-237` | Đủ 6 bộ trong dữ liệu, không chọn được trong UI. |
| FASH-34 | Mục 6 | Không dùng logo thương hiệu | ĐẠT | `presets.ts:230-237`; `officePropsLayout.ts:112` | |
| FASH-35 | Mục 7 | Nhân vật 3D ở giữa, xoay 360°, zoom, nút về góc chuẩn | MỘT PHẦN | `AvatarCreator.tsx:455-487` | Có xoay và đặt lại góc, không có zoom. Chỉ có trong onboarding. |
| FASH-36 | Mục 7 | Tab Cơ thể, Mặt, Tóc, Xăm & Sẹo, Trang phục, Phụ kiện, Bộ đã lưu | MỘT PHẦN | `AvatarCreator.tsx:491-509` | Có 5 tab: body, hair, outfit, acc, review. |
| FASH-37 | Mục 7 | Camera tự chuyển đến vùng đang chỉnh | CHƯA LÀM | | |
| FASH-38 | Mục 7 | Bảng màu, thanh chỉnh, danh sách mẫu, công cụ đặt họa tiết | MỘT PHẦN | `AvatarCreator.tsx:535-614` (ô màu) | Không có thanh trượt và công cụ họa tiết. |
| FASH-39 | Mục 7 | Hoàn tác, làm lại, đặt lại từng mục, ngẫu nhiên theo chủ đề, so sánh trước sau | MỘT PHẦN | `AvatarCreator.tsx:303-319,438-443` | Hoàn tác một bước, ngẫu nhiên, đặt lại toàn bộ. Không có làm lại, đặt lại từng mục, so sánh. |
| FASH-40 | Mục 7 | Lọc đồ theo phong cách, loại, màu, khả năng phối | CHƯA LÀM | | |
| FASH-41 | Mục 7 | Nút "Lưu bộ phối" và "Vào văn phòng" hoạt động thật | MỘT PHẦN | `AvatarCreator.tsx:332-355,712-720` (`putAppearance`, `completeOnboarding`) | Có "Lưu nhân vật và tiếp tục" vào văn phòng. Không lưu được nhiều bộ phối. |
| FASH-42 | Mục 7 | Hỗ trợ chuột và cảm ứng | ĐẠT | `AvatarCreator.tsx:392-407,456-466` (pointer events) | |
| FASH-43 | Mục 8 | Nhân vật dùng trong văn phòng, giữ cơ thể, trang phục, xăm, phụ kiện | MỘT PHẦN | `App.tsx:338`; `Player.tsx:207` | Chỉ các trường `Appearance`; không có xăm vì chưa có. |
| FASH-44 | Mục 8 | Tương thích animation đứng, đi, chạy, nhảy, ngồi, tương tác | ĐẠT | `avatar/animation.ts:241-276` | Với rig dự phòng. |
| FASH-45 | Mục 8 | Mở trình chỉnh thì tạm dừng điều khiển, đóng thì về chỗ cũ | CHƯA LÀM | | Trình chỉnh chỉ có ở onboarding, không mở được trong văn phòng. |
| FASH-46 | Mục 8 | Giảm xuyên bằng vùng che cơ thể, biến thể, quy tắc lớp | BỊ CHẶN | | Cần mesh cơ thể và trang phục thật. |
| FASH-47 | Mục 8 | Kiểm trang phục ở tư thế vận động và ngồi | BỊ CHẶN | | Cần asset và chạy thử. |
| FASH-48 | Mục 9 | Một bộ xương chuẩn, mesh cơ thể và trang phục cùng rig | BỊ CHẶN | `docs/design/AVATAR_SPEC.md` (kế hoạch VRM) | Chưa có tệp VRM. |
| FASH-49 | Mục 9 | Tách dữ liệu nhân vật, danh mục, vùng gắn, quy tắc khỏi giao diện | ĐẠT | `src/fashion/types.ts`, `catalog.ts`, `rules.ts` | Đã tách, nhưng chưa có giao diện dùng. |
| FASH-50 | Mục 9 | Lưu JSON; lưu cục bộ, xuất, nhập; lưu asset tải lên | MỘT PHẦN | Nháp `AvatarCreator.tsx:43-61` (localStorage); máy chủ `putAppearance`; `types.ts:11` (`LOOK_SCHEMA_VERSION`) | Không có hàm xuất, nhập tệp JSON. Không có lưu asset tải lên. |
| FASH-51 | Mục 9 | Tối ưu polygon, texture, material; tải khi cần | MỘT PHẦN | `avatar/fallbackParts.tsx` (dùng chung vật liệu) | Không có tải theo nhu cầu. |
| FASH-52 | Mục 9 | Không có tính năng giả: mọi tùy chọn hiển thị đều đổi mô hình | ĐẠT | Các tùy chọn trong `AvatarCreator.tsx` đều là trường `Appearance` mà `FallbackAvatar` đọc (ví dụ `FallbackAvatar.tsx:396`) | Dữ liệu `src/fashion` chưa hiển thị nên không tạo nút giả. |
| FASH-53 | Mục 9 | Thiếu asset thì nêu rõ, không dùng khối hộp làm trang phục cuối | MỘT PHẦN | `docs/design/AVATAR_SPEC.md`, `ASSET_SOURCES.md`; mục 1 của file này | Trang phục hiện tại vẫn là khối hình học. |
| FASH-54 | Mục 10 | Tạo nhân vật chibi, chỉnh từng vùng, xăm, họa tiết, phụ kiện, lưu, vào văn phòng | CHƯA LÀM | | Luồng đầy đủ chưa có. |

## 5. user.txt (USER)

| ID | Nguồn | Yêu cầu rút gọn | Trạng thái | Bằng chứng | Ghi chú, việc tiếp |
|---|---|---|---|---|---|
| USER-01 | Mục 1 | Giải phẫu, tỷ lệ đầu, thân, tay chân, mặt tự nhiên | MỘT PHẦN | `avatar/fallbackBody.tsx:16-22,57-146` (số đo thật theo mét) | Dựng từ khối hình học, không phải mesh người. |
| USER-02 | Mục 1 | Nhiều mẫu hình thể, màu da, đặc điểm mặt | MỘT PHẦN | `avatar/appearance.ts:68-70` (3 dáng, 6 tông da) | Không có lựa chọn đặc điểm mặt. |
| USER-03 | Mục 1 | Da có lỗ chân lông, sắc độ không đều, nếp gấp | BỊ CHẶN | | Cần texture da. |
| USER-04 | Mục 1 | Mắt có chiều sâu, giác mạc, mí; tóc, mày, râu đúng chất liệu | BỊ CHẶN | | Cần mesh mắt và tóc. |
| USER-05 | Mục 1 | PBR, normal map, roughness map, tán xạ dưới da | BỊ CHẶN | `avatar/fallbackParts.tsx:55` (MeshPhysicalMaterial, không có map) | Cần texture set. |
| USER-06 | Mục 1 | Tránh da nhựa, cơ phồng, mặt hoạt hình, tỷ lệ búp bê | MỘT PHẦN | `fallbackParts.tsx:55` | Da có clearcoat 0,2, có nguy cơ bóng nhựa. Chưa chụp ảnh để đánh giá. |
| USER-07 | Mục 2 | Chọn vùng trên mô hình, rê làm nổi, chọn thì hiện hướng kéo | CHƯA LÀM | | |
| USER-08 | Mục 2 | Vùng: tổng thể, đầu mặt, chi tiết mặt, thân, tay, chân | MỘT PHẦN | `fashion/types.ts:77-115` (`BodyShape`, `FaceStructure`) | Chỉ dữ liệu. |
| USER-09 | Mục 2 | Kéo theo phương để tăng giảm rộng, dài, đầy | CHƯA LÀM | | |
| USER-10 | Mục 2 | Chỉnh đối xứng và từng bên | MỘT PHẦN | `types.ts:62-66` (`Paired`) | Chỉ dữ liệu. |
| USER-11 | Mục 2 | Thanh thông số, hoàn tác, làm lại, đặt lại từng vùng | CHƯA LÀM | | |
| USER-12 | Mục 2 | Giới hạn biến dạng theo giải phẫu | MỘT PHẦN | `fashion/rules.ts:104-180` | Chỉ dữ liệu. |
| USER-13 | Mục 2 | Vùng liền kề chuyển tiếp mượt, không lõm, gãy, hở | BỊ CHẶN | | Cần mesh liền có morph. |
| USER-14 | Mục 2 | Tách xoay camera khỏi kéo cơ thể | CHƯA LÀM | | |
| USER-15 | Mục 3 | Mesh người có topology, rig đầy đủ, morph target | BỊ CHẶN | `avatar/VrmAvatar.tsx:12` trỏ `/models/base.vrm`, tệp không tồn tại; không có thư mục `public/` | Cần asset. |
| USER-16 | Mục 3 | Phối nhiều morph, corrective morph | BỊ CHẶN | | Cần asset. |
| USER-17 | Mục 3 | Đổi chiều dài xương: cập nhật skeleton, skinning, điểm gắn, collider | BỊ CHẶN | | Cần rig thật. |
| USER-18 | Mục 3 | Không chỉ scale cả mesh hay kéo vertex tùy ý | MỘT PHẦN | `fallbackBody.tsx:8-22,146-205` | Ba dáng có số đo riêng từng đoạn, nhưng chiều cao vẫn scale đều cả nhóm ngoài. |
| USER-19 | Mục 3 | Giữ tương thích animation sau khi chỉnh | MỘT PHẦN | `avatar/animation.ts:63-66` | Đúng với ba dáng hiện có; chưa có chỉnh tự do. |
| USER-20 | Mục 4 | Bấm lên bề mặt nhân vật để chọn vị trí xăm | CHƯA LÀM | | |
| USER-21 | Mục 4 | Thêm hình xăm từ thư viện hoặc PNG | MỘT PHẦN | `fashion/tattoos.ts:47-77` | Có thư viện dữ liệu, không có tải PNG, không có bộ vẽ. |
| USER-22 | Mục 4 | Di chuyển, xoay, đổi cỡ, màu, độ đậm | MỘT PHẦN | `types.ts:186-210` | Chỉ dữ liệu. |
| USER-23 | Mục 4 | Nhiều lớp, quản lý, nhân bản, xóa | CHƯA LÀM | | |
| USER-24 | Mục 4 | Xăm mặt, cổ, ngực, lưng, bụng, tay, chân; mẫu quấn quanh tay chân | MỘT PHẦN | `types.ts:172-185` (`SkinRegion`); `tattoos.ts:13,17-27` (cờ `wraps`) | Chỉ dữ liệu. |
| USER-25 | Mục 4 | Xăm bám da khi đổi hình thể và chuyển động | BỊ CHẶN | | Cần mesh skinned. |
| USER-26 | Mục 4 | Công cụ chữ: nội dung, phông, cỡ, khoảng cách ký tự | MỘT PHẦN | `tattoos.ts:11,28` | Chỉ dữ liệu. |
| USER-27 | Mục 4 | Sẹo lành, tàn nhang, nốt ruồi, vết rạn | MỘT PHẦN | `fashion/scars.ts:7-54`; `types.ts:145-170` | Chỉ dữ liệu. |
| USER-28 | Mục 4 | Quần áo che hình xăm theo hình học | BỊ CHẶN | | Cần mesh trang phục. |
| USER-29 | Mục 5 | Giữ hệ phối đồ, kính, đồng hồ, trang sức, giày, điện thoại | MỘT PHẦN | `appearance.ts:38-47` | Không có điện thoại và trang sức. |
| USER-30 | Mục 5 | Trang phục thích nghi hình thể bằng morph hoặc fitting | BỊ CHẶN | | Cần asset. |
| USER-31 | Mục 5 | Không xuyên da, phụ kiện không trôi, giày không lệch khi đổi tỷ lệ | BỊ CHẶN | | Cần asset và chạy thử. |
| USER-32 | Mục 5 | Chế độ xem cơ thể với đồ lót kín đáo, nút bật lại trang phục | CHƯA LÀM | | |
| USER-33 | Mục 5 | Báo món không hợp hình thể, đưa lựa chọn tương thích | MỘT PHẦN | `rules.ts:878-890`; `types.ts:463-489` (`WarningCode`) | Hàm có, không có UI. |
| USER-34 | Mục 6 | Nhân vật giữa, nền studio trung tính, ánh sáng rõ | MỘT PHẦN | `onboarding/AvatarCreator.tsx:455-476` (Preview) | Chỉ trong onboarding; chưa chụp ảnh đánh giá. |
| USER-35 | Mục 6 | Xoay 360°, zoom, di chuyển camera; góc trước, sau, trái, phải, cận mặt | MỘT PHẦN | `AvatarCreator.tsx:392-417,477-487` | Chỉ xoay quanh trục đứng. |
| USER-36 | Mục 6 | 8 tab: Tổng thể, Mặt, Hình thể, Da, Tóc & Râu, Xăm & Sẹo, Trang phục, Phụ kiện | MỘT PHẦN | `AvatarCreator.tsx:491-509` | 5 tab. |
| USER-37 | Mục 6 | Camera tự căn tới vùng đang chỉnh | CHƯA LÀM | | |
| USER-38 | Mục 6 | Bật tắt đối xứng, so sánh trước sau, lưu phiên bản, khôi phục mặc định | MỘT PHẦN | `AvatarCreator.tsx:318-319,441-443` | Chỉ có khôi phục mặc định. |
| USER-39 | Mục 6 | Lưu cấu hình để chỉnh tiếp và dùng ngay trong văn phòng | MỘT PHẦN | `AvatarCreator.tsx:43-61,332-341`; `App.tsx:75,338` | Dùng được trong văn phòng; sau onboarding không mở lại để chỉnh. |
| USER-40 | Mục 7 | Nhân vật đã chỉnh đi, chạy, ngồi, tương tác trong văn phòng | ĐẠT | `Player.tsx:207`; `animation.ts:241-276`; `controls/index.ts:165-192` | Với nhân vật dự phòng và các tùy chọn hiện có. |
| USER-41 | Mục 7 | Cập nhật chiều cao camera, khoảng cách, collider, tiếp xúc sàn theo hình thể | CHƯA LÀM | `controls/index.ts:55-57` (mắt cố định 1,58 m); `PLAYER_RADIUS` cố định | |
| USER-42 | Mục 7 | Kiểm tổ hợp giới hạn cao, thấp, gầy, đầy, ít cơ, nhiều cơ | BỊ CHẶN | | Cần asset và chạy thử. |
| USER-43 | Mục 7 | Kiểm vai, khuỷu, hông, gối khi vận động | BỊ CHẶN | | Cần asset và chạy thử. |
| USER-44 | Mục 7 | LOD, texture phù hợp, tải theo nhu cầu | CHƯA LÀM | LOD chỉ có ở cảnh thành phố (`window/cityLayout.ts:20`) | |
| USER-45 | Kiểm tra trước | Kiểm topology, rig, morph; thiếu thì nêu rõ, không tạo thanh giả | MỘT PHẦN | `docs/design/AVATAR_SPEC.md`; mục 1 của file này | Đã nêu tài nguyên thiếu; chưa có quyết định asset. |

## 6. tuongtac.txt (TI)

| ID | Nguồn | Yêu cầu rút gọn | Trạng thái | Bằng chứng | Ghi chú, việc tiếp |
|---|---|---|---|---|---|
| TI-01 | Mục 1 | Đến gần và nhìn vào: làm nổi vật, hiện "E — Mở cửa / Ngồi xuống / Sử dụng máy tính" | MỘT PHẦN | Gợi ý `InteractPrompt.tsx:19-36`; viền sáng `interact/InteractionSystem.tsx:200-236` (chưa mount) | Đang chạy chỉ có thẻ gợi ý; viền sáng thuộc hệ chưa mount; không có "Sử dụng máy tính". |
| TI-02 | Mục 1 | Raycast hoặc shape cast, khoảng cách, kiểm vật cản | MỘT PHẦN | Đang chạy `interact/geometry.ts:168-200` (khoảng cách và góc); vật cản `interact/selection.ts:100-112` (chưa mount) | Đường đang chạy không kiểm vật cản. |
| TI-03 | Mục 1 | Chỉ một vật phù hợp nhất; không xuyên tường | MỘT PHẦN | `geometry.ts:185`; `selection.ts:148-181` (chưa mount) | Chọn một vật thì có; chặn xuyên tường chưa chạy. |
| TI-04 | Mục 1 | E làm hành động chính; nhiều hành động thì mở menu nhỏ | MỘT PHẦN | `interact/controller.ts`; `interact/InteractionHud.tsx`; phím số `InteractionSystem.tsx:161-174` | Menu chưa mount. |
| TI-05 | Mục 1 | Gợi ý cập nhật theo trạng thái vật | MỘT PHẦN | `interact/registry.ts:49,170-172`; `interact/objectStates.ts` | Chưa mount, chưa vật nào đăng ký. |
| TI-06 | Mục 1 | Nút tương tác trên điện thoại | ĐẠT | `InteractPrompt.tsx:239-241` | |
| TI-07 | Mục 1 | Bật tắt viền sáng và hướng dẫn phím | MỘT PHẦN | Ẩn bảng phím `InteractPrompt.tsx:74-101`; cài đặt viền `interact/settings.ts:6-15` | Nút bật tắt viền nằm trong `InteractionHud` chưa mount. |
| TI-08 | Cửa | Mở đóng xoay quanh bản lề | CHƯA LÀM | | |
| TI-09 | Cửa | Trạng thái đóng, đang mở, mở, đang đóng, khóa | CHƯA LÀM | | |
| TI-10 | Cửa | Collider đúng khi chuyển động, không đẩy xuyên nhân vật | CHƯA LÀM | | |
| TI-11 | Cửa | Bị chặn thì dừng hoặc giới hạn | CHƯA LÀM | | |
| TI-12 | Ghế | E ngồi, căn đúng vị trí và hướng | ĐẠT | `geometry.ts:55-80`; `InteractTracker.tsx:61-63`; `controls/index.ts:186-191` | |
| TI-13 | Ghế | Tư thế theo chiều cao nhân vật và mặt ghế; chân không xuyên sàn | MỘT PHẦN | `avatar/animation.ts:63-66,135-148` | Độ cao hông ngồi cố định 0,56 m, không theo chiều cao. |
| TI-14 | Ghế | Ngồi chuyển animation ngồi, khóa đi bộ | ĐẠT | `animation.ts:255,274`; `controls/index.ts:186-191` | |
| TI-15 | Ghế | E đứng dậy ở chỗ trống cạnh ghế, kiểm khoảng trống | MỘT PHẦN | `controls/index.ts:166-174` | Về chỗ đứng trước khi ngồi; không kiểm khoảng trống lúc đứng dậy. |
| TI-16 | Ghế | Ghế có người ngồi thì người khác không dùng được | CHƯA LÀM | | |
| TI-17 | Máy tính | Chỉ dùng khi ở trước bàn hoặc đang ngồi ghế tương ứng | CHƯA LÀM | | |
| TI-18 | Máy tính | Camera tới gần màn hình, mở giao diện máy tính | CHƯA LÀM | | |
| TI-19 | Máy tính | Bật tắt màn hình, xem tài liệu, ghi chú, đổi hình nền | CHƯA LÀM | | |
| TI-20 | Máy tính | Esc thoát, khôi phục camera và điều khiển | CHƯA LÀM | | |
| TI-21 | Máy tính | Đang gõ thì W/A/S/D không di chuyển | ĐẠT | `controls/useGtaControls.ts:32-37,79` | Chặn chung cho mọi ô nhập. |
| TI-22 | Tủ | Từng ngăn kéo hoặc cánh mở đóng riêng | CHƯA LÀM | | |
| TI-23 | Tủ | Ngăn trượt đúng ray, cánh xoay đúng bản lề | CHƯA LÀM | | |
| TI-24 | Tủ | Giới hạn hành trình, trạng thái khóa | CHƯA LÀM | | |
| TI-25 | Tủ | Vật bên trong đi theo ngăn kéo | CHƯA LÀM | | |
| TI-26 | Đồ nhỏ | Cầm lên, quan sát, xoay, đặt, trả về chỗ cũ | CHƯA LÀM | | |
| TI-27 | Đồ nhỏ | Gắn vào điểm cầm trên tay, tay khớp | CHƯA LÀM | | Cần bone bàn tay. |
| TI-28 | Đồ nhỏ | Xem trước khi đặt: xanh hợp lệ, đỏ bị chặn | CHƯA LÀM | | `layout/GhostMesh.tsx` chỉ dành cho nội thất. |
| TI-29 | Đồ nhỏ | Chỉ đặt lên bề mặt phù hợp, không xuyên, giữ tỷ lệ, kiểm ổn định | CHƯA LÀM | | |
| TI-30 | Đồ nhỏ | Thả tự do dùng vật lý, khối lượng, collider | BỊ CHẶN | | Cần thư viện vật lý (xem CTRL-22). |
| TI-31 | TV | Bật tắt, đổi nội dung, chỉnh âm lượng | MỘT PHẦN | `ui/DisplayPanel.tsx:117-135`; mount `App.tsx:353-355` | Có bật tắt và đổi kênh qua bấm chuột. Không có âm lượng, không dùng phím E. |
| TI-32 | Đèn | Công tắc bật tắt theo thiết bị hoặc nhóm, ánh sáng thay đổi thật | CHƯA LÀM | | |
| TI-33 | Rèm | Kéo lên xuống, đổi mức che sáng | CHƯA LÀM | | Chưa có rèm (ROOM-14). |
| TI-34 | Cây nước | Lấy nước có animation và âm thanh | CHƯA LÀM | | |
| TI-35 | Máy in | Bảng điều khiển, chọn tài liệu, hiệu ứng in | CHƯA LÀM | | `util_print` trong it.json chỉ mở panel chung. |
| TI-36 | Mục 2 | Mỗi hành động có phản hồi trạng thái rõ | MỘT PHẦN | Ghế: thẻ "Đứng dậy" `InteractTracker.tsx:21,39-41` | Các vật khác chưa có hành động riêng. |
| TI-37 | Mục 3 | Hai chế độ Tham quan và Sắp xếp | MỘT PHẦN | `interact/characterState.ts:13` (`'arranging'`); `layout/useMoveMode.ts:66-70` | Không có nút chuyển chế độ, chưa mount. |
| TI-38 | Mục 3 | Hiện đường bao chọn và vùng chiếm chỗ | MỘT PHẦN | `layout/GhostMesh.tsx`; `layout/footprints.ts` | Chưa mount. |
| TI-39 | Mục 3 | Kéo trên sàn, xoay theo bước, bắt lưới | MỘT PHẦN | `useMoveMode.ts:3,51-60`; `layout/floorPointer.ts` | Chưa mount. |
| TI-40 | Mục 3 | Kiểm va chạm với tường và nội thất | MỘT PHẦN | `useMoveMode.ts:16-29` | Kiểm ở client là sơ bộ, chưa mount. |
| TI-41 | Mục 3 | Không cho dời vật kết cấu, thiết bị cố định | MỘT PHẦN | `layout/movable.ts` | Chưa mount. |
| TI-42 | Mục 3 | Xác nhận, hủy, hoàn tác, làm lại, khôi phục bố trí | MỘT PHẦN | `useMoveMode.ts:56-60`; `layout/api.ts:70-71` (`resetLayout`) | Có đặt, hủy, khôi phục; không có hoàn tác và làm lại; chưa mount. |
| TI-43 | Mục 3 | Đồ trên bàn đi theo bàn | CHƯA LÀM | | |
| TI-44 | Mục 4 | Hành động với tay, cầm đồ, ngồi, đứng dậy, dùng thiết bị | MỘT PHẦN | `animation.ts:135-148,274` (ngồi, đứng); `emotes/library.ts` | Không có cầm đồ, dùng thiết bị. |
| TI-45 | Mục 4 | IK để tay chạm đúng điểm | BỊ CHẶN | | Cần rig có bone tay. |
| TI-46 | Mục 4 | Chỉ hủy ở thời điểm an toàn; không kẹt giữa trạng thái | MỘT PHẦN | `characterState.ts:25-34` (bảng chuyển trạng thái) | Chưa nối vào luồng; đang dùng cờ `seated` của `controls/session.ts:109-113`. |
| TI-47 | Mục 4 | Camera chuyển mượt khi ngồi, quan sát đồ, dùng máy tính; không xuyên | MỘT PHẦN | `controls/index.ts:221-225` | Chỉ có khi ngồi. |
| TI-48 | Mục 4 | Âm thanh theo khoảng cách cho cửa, ngăn kéo, bước chân, thiết bị; chỉnh âm lượng | CHƯA LÀM | `audio/sfx.ts:3` chỉ có âm UI; âm nền tắt `ITOffice.tsx:190` | |
| TI-49 | Mục 5 | Hệ tương tác dùng chung, không logic rải rác | MỘT PHẦN | `interact/registry.ts:11-19,121-128`; `interact/framework.ts` | `registerInteractable` chưa có nơi gọi; đang chạy `InteractTracker` xử lý ghế riêng. |
| TI-50 | Mục 5 | Mỗi vật khai báo ID, loại, hành động, khoảng cách, điểm, điều kiện, trạng thái | MỘT PHẦN | `registry.ts:55-79` | Kiểu dữ liệu có, chưa có vật nào khai báo. |
| TI-51 | Mục 5 | Tách phát hiện, xử lý, gợi ý, animation, lưu dữ liệu | MỘT PHẦN | `selection.ts`, `controller.ts`, `InteractionHud.tsx`, `objectStates.ts` | Phần lưu dữ liệu chưa có (`objectStates.ts:9`). |
| TI-52 | Mục 5 | Trạng thái nhân vật: đi, tương tác, ngồi, cầm, dùng UI, sắp xếp | MỘT PHẦN | `characterState.ts:13-34` | Chưa nối. |
| TI-53 | Mục 5 | Không xung đột, không kích hoạt lặp khi giữ phím | ĐẠT | `InteractTracker.tsx:69`; `InteractionSystem.tsx:151-157` | |
| TI-54 | Mục 5 | Nhiều người dùng: xác nhận quyền dùng vật | CHƯA LÀM | | |
| TI-55 | Mục 5 | Lưu vị trí nội thất, cửa, rèm, thiết bị; nút đặt lại | MỘT PHẦN | Nội thất `layout/api.ts:39-71` (máy chủ); TV `display/DisplayStore.tsx` | Trạng thái vật chung chưa lưu; nút đặt lại bố trí chưa mount. |
| TI-56 | Mục 6 | Khu mẫu đủ 7 thứ: cửa, ghế, máy tính, hộc tủ, đồ nhỏ, công tắc, nội thất di chuyển được | MỘT PHẦN | Ghế `geometry.ts:55-80`; nội thất `useMoveMode.ts` (chưa mount) | Có 1/7 hoạt động, 1/7 có mã chưa mount. |
| TI-57 | Mục 6 | Tự chạy kiểm bằng chuột, bàn phím, cảm ứng; các ca đứng xa, bị che, đặt bị chặn, thoát UI, mất focus | BỊ CHẶN | | Phiên này không được chạy dự án. |
| TI-58 | Mục 6 | Mọi nút và gợi ý có hành vi thật | MỘT PHẦN | `geometry.ts:21-26,46` | "E — Mở cửa" ở thang máy chỉ mở panel thông tin. Đổi chữ thành "Xem thông tin" hoặc làm cửa thật. |

## 7. Việc nên làm tiếp (theo thứ tự)

1. Người dùng chốt: realistic hay chibi; có duyệt Rapier không; nguồn asset nhân vật (VRM) và nội thất (GLB).
2. Mount `InteractionSystem` và `InteractionHud` thay `InteractTracker`, đăng ký ghế qua `registerInteractable`, để có viền sáng, chặn xuyên tường, menu.
3. Làm khu mẫu tuongtac.txt mục 6: một cửa, một máy tính, một hộc tủ, một đồ nhỏ, một công tắc đèn, và mount `LayoutMovePanel`.
4. Sửa chữ "Mở cửa" ở thang máy; bật `audioEnabled` hoặc bỏ thanh âm lượng cho tới khi có âm thanh.
5. Thêm chế độ xem tổng thể và năm điểm camera đặt sẵn (room.txt mục 7).
6. Nối `src/fashion` vào một phòng thay đồ mở được trong văn phòng, bắt đầu với 6 bộ phối mẫu và xuất, nhập JSON.
7. Chạy trên VPS, chụp ảnh các góc đối chiếu và cập nhật lại bảng này.
