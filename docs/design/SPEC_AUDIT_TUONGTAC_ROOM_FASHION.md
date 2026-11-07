# Đối chiếu đặc tả: tuongtac.txt, room.txt, fashion.txt

Nhánh `wt3/tuong3`. Đối chiếu với mã tại thời điểm làm (sau đợt 1-3). `COMPLIANCE_MATRIX.md` (6/11) đã cũ ở phần room và fashion (nó viết khi `src/fashion` chưa được dùng; nay đã có `src/wardrobe`, `src/avatar/outfit`, `src/tattoo`). Bảng dưới lấy mã làm chuẩn.

Ký hiệu: CÓ = đủ; MỘT PHẦN = có nhưng thiếu ý nào đó (ghi rõ); THIẾU = chưa có; QĐ n = đã chốt trong `PENDING_DECISIONS.md` (hoặc `DECISIONS_27.md`), không chọn lại; MỚI = làm trong đợt này, có test.

## 1. tuongtac.txt

### Mục 1. Cơ chế chung
| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Gợi ý "E - ..." khi gần và nhìn vật, làm nổi nhẹ | CÓ | `scene/interact/InteractionHud.tsx` (chip), `selection.ts`, viền sáng `InteractTracker.tsx` |
| Raycast/shape cast, khoảng cách, kiểm vật cản | CÓ | `selection.ts:100` `isOccluded`, `SELECT.occluderInset` (:34); không tương tác xuyên tường |
| Chỉ chọn một đối tượng phù hợp nhất | CÓ | `selection.ts` (điểm theo khoảng cách, hướng, `priority`) |
| E làm hành động chính; nhiều hành động thì menu nhỏ | CÓ | `InteractionHud.tsx` menu, phím 1-9/Esc trong `InteractionSystem.tsx:101-182` |
| Gợi ý theo trạng thái hiện tại | CÓ | nhãn hàm `label: (c) => ...` trong `printer.ts:89`, `tv.ts:76`, `door.ts` |
| Nút tương tác trên điện thoại | CÓ | `InteractionHud.tsx` nút `ix-touch` (`pointer: coarse`) |
| Bật/tắt viền sáng và hướng dẫn phím | CÓ | `settings.ts`, `InteractionHelp` |
| Không kích hoạt lặp khi giữ phím | CÓ | `InteractTracker.tsx:70` (`e.repeat`), `InteractionSystem.tsx:158-165` |
| Mất focus trình duyệt nhả phím | CÓ | `InteractionSystem.tsx:197-198`, `useGtaControls.ts:88-89` |

### Mục 2. Vật thể
| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Cửa: xoay đúng bản lề, 5 trạng thái, collider theo chuyển động, bị chặn thì dừng | CÓ | `door.ts` (`doorBlocked` :79, `doorTick`), `blockers.ts`, test `logic.vitest.test.ts`, `blockers.vitest.test.ts` |
| Ghế: ngồi đúng vị trí/hướng, khóa đi bộ, đứng dậy kiểm chỗ trống, chống người thứ hai | CÓ | `chair.ts:52` `findStandSpot`, `chairs.ts`, `seatSync.ts`, `net/seatLease.ts` (lease khi `?world=1`) |
| Ghế: tư thế theo chiều cao, chân không xuyên sàn | CÓ | IK ngồi (TASK 03), `docs/design/IK.md` |
| Máy tính: chỉ dùng khi ở vị trí/đang ngồi; camera gần; giao diện; bật tắt, tài liệu, ghi chú, hình nền; Esc; gõ chữ không đi | CÓ | `computer.ts:80` `canUseComputer`, `ComputerPanel.tsx`, camera `inspect` (`gtaCamera.ts:172,643`), `holdPause`, `isTypingTarget` (`useGtaControls.ts:33`) |
| Tủ/ngăn kéo: từng ngăn riêng, trượt ray, hành trình, khóa, vật bên trong đi theo | CÓ | `drawer.ts`; cánh tủ xoay bản lề: dùng `door.ts` (không có mẫu cánh tủ trong khu mẫu) - MỘT PHẦN |
| Đồ nhỏ: cầm, xoay, đặt, trả về chỗ cũ | CÓ | `smallItem.ts` (`pickupItem`, `returnItem`), `ItemMesh`, IK tay `ikHold` |
| Đồ nhỏ: cầm, "quan sát" (xoay vật trên tay) | MỚI | `objects/itemInspect.ts`, `ItemInspectHud.tsx`: phím theo cài đặt `inspectItem` (mặc định R, hiện trong HUD), kéo chuột hoặc mũi tên/WASD xoay, Esc hoặc phím lần nữa thoát. Vật được đưa ra trước camera trong `ItemMesh` (không thêm mesh, không thêm draw call); `holdPause` khóa nhân vật và camera nên camera đứng nguyên chỗ cũ. Test `itemInspect.vitest.test.ts` |
| Đặt xuống: xem trước xanh/đỏ | MỚI | `evaluatePlacement` + `PlacePreview` (`components.tsx`), test `extras.vitest.test.ts` |
| Chỉ đặt lên bề mặt phù hợp, không xuyên/chồng | CÓ | `validatePlacement` (`smallItem.ts:62`) |
| Thả tự do dùng vật lý (rơi, va chạm sàn) | MỚI (một phần) | `dropLanding`, `fallStep` (rơi theo trọng lực 9,8 m/s2), hành động "Thả rơi" trên mặt đặt; không mô phỏng lăn/nảy, không khối lượng. Test `extras.vitest.test.ts` |
| TV: bật/tắt, đổi nội dung, âm lượng | CÓ | `tv.ts:75-85` |
| Đèn: bật/tắt theo nhóm, ánh sáng đổi thật | CÓ | `lightSwitch.ts`, `GroupLight` (pointLight) |
| Rèm: kéo trong giới hạn, đổi mức che sáng theo render | MỚI | trước đó `getCurtainDaylight` không ai dùng. Nay `CurtainMesh` có pointLight ánh sáng ngày theo `curtainLightIntensity`; test `extras.vitest.test.ts` |
| Cây nước: lấy nước, animation + âm thanh | CÓ | `waterCooler.ts`, `WaterCoolerMesh`, `audio/spatial/interactBridge.ts` |
| Máy in: bảng điều khiển, chọn tài liệu, hiệu ứng in | CÓ | menu hành động (`printer.ts:88-102`), `PrinterMesh`; bảng điều khiển là menu, không phải panel riêng |

### Mục 3. Sắp xếp nội thất
| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Hai chế độ tham quan / sắp xếp | CÓ | `editor/`, `characterState` `arranging` |
| Đường bao chọn, vùng chiếm chỗ, lưới, xoay theo bước, bắt lưới | CÓ | `editor/core.ts` (`gridStep`, `snap`, `rotate`), `EditorGrid.tsx` |
| Va chạm tường/nội thất | CÓ | `layout/placement.ts` `checkPlacement` |
| Không di chuyển vật kết cấu/cố định | CÓ | `layout/movable.ts` |
| Xác nhận, hủy, hoàn tác/làm lại, khôi phục bố trí gốc | CÓ | `editor/core.ts:168-176` |
| Cho kéo bàn, ghế, tủ | MỘT PHẦN | bàn `desk_*` cố định do quy tắc server (`movable.ts:isDesk`); ghế và tủ hồ sơ của `OfficeProps` không nằm trong `MOVABLE`. QĐ 2 chọn "giữ hàng song song" và ghi "tự xoay bàn trong chế độ sắp xếp" nhưng mã cấm di chuyển bàn: mâu thuẫn chữ nghĩa, không đổi hành vi (xem mục 4) |
| Đồ đặt trên bàn đi theo bàn (cha/con) | THIẾU | không có quan hệ cha/con trong `layout/types.ts`; vì bàn cố định nên chưa phát sinh; cần server + schema layout |

### Mục 4. Animation, camera, âm thanh
| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Hành động tay, cầm, ngồi, đứng, dùng thiết bị; IK chạm đúng điểm | CÓ | `avatar/ik`, `ikHold`, `docs/design/IK.md` |
| Hủy ở thời điểm an toàn, không kẹt trạng thái | CÓ | bảng chuyển `characterState.ts:24-36`, `resetAllObjects` chỉ chạy ở trạng thái an toàn (MỚI) |
| Camera mượt khi ngồi, dùng máy, tránh xuyên | CÓ | `gtaCamera.ts` (`seated`, `inspect`, safe position) |
| Âm thanh theo khoảng cách cho cửa, ngăn kéo, bước chân, thiết bị | CÓ | `audio/spatial/interactBridge.ts`, `ITOffice.tsx:296` |
| Chỉnh âm lượng | CÓ | `SettingsPanel.tsx:205`, bus sfx |

### Mục 5. Kiến trúc
| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Khung dùng chung, mỗi vật khai báo ID/loại/hành động/khoảng cách/điểm/điều kiện/trạng thái | CÓ | `registry.ts`, `framework.ts` |
| Tách phát hiện, hành động, giao diện, animation, lưu | CÓ | `selection.ts`, `controller.ts`, `InteractionHud.tsx`, `components.tsx`, `persist/manager.ts` |
| Trạng thái nhân vật rõ ràng | CÓ | `characterState.ts` (6 trạng thái) |
| Xác nhận quyền dùng khi nhiều người | CÓ (MỚI cho vật cầm) | lease ghế (`net/seatLease.ts`); lease vật cầm `held:<id>` nối vào hành động Cầm (`net/itemLease.ts`, gắn trong `SeatLeaseBridge` nên chỉ chạy khi `?world=1`): chỉ cầm khi server cấp lease, trả lease khi đặt/thả/trả, mất lease thì trả vật về chỗ cũ. Không có world thì hành vi cũ. Test `itemLease.vitest.test.ts` |
| Lưu vị trí, cửa, rèm, thiết bị; nút đặt lại | MỚI (nút) | lưu: `persist/manager.ts:16,115`. Nút "Đặt lại vật" trong `InteractionHelp` + `resetObjects.ts`, test `extras.vitest.test.ts` |

### Mục 6. Khu mẫu và kiểm tra
Khu mẫu đủ 7 mục: cửa kho, ghế, máy tính, ngăn kéo, cốc, công tắc đèn, nội thất sắp xếp được: CÓ (`InteractObjects.tsx`, e2e `22-objects`, `12-interact-editor`). Các ca đứng xa, bị tường che, vị trí đặt bị chặn, thoát giao diện, mất focus có test đơn vị (`selection`, `logic.vitest.test.ts`, `extras.vitest.test.ts`).

## 2. room.txt

Phần này chỉ đối chiếu ở mức tính năng (không so ảnh mặt bằng). Các mục "giống ảnh" cần mắt người, không kiểm bằng mã.

| Yêu cầu | Trạng thái | Bằng chứng / ghi chú |
|---|---|---|
| Chỉ dựng hình L, không dựng đường xanh | CÓ | `officeBounds.ts`, `Floorplan.tsx` |
| 11 khu ngoài hình L | QĐ 1 (giữ L, không dựng) | |
| Sàn gạch xám vân đá, ron, phản chiếu mờ, không bake ô sáng | CÓ | `Floorplan.tsx`, `scene/stoneTexture.ts` + test |
| Tường trắng, cột vuông trắng | MỘT PHẦN | tường có; cột: không thấy mã dựng cột riêng. Cần dữ liệu vị trí cột từ bản vẽ, không có trong repo |
| Tranh slogan trên tường | MỘT PHẦN | `Corridors.tsx:12` khu trưng bày; chưa có tranh trong khu làm việc. Thiếu vị trí có căn cứ ảnh |
| Cửa sổ và rèm cuốn xám | MỘT PHẦN | kính + cảnh thành phố (`window/`); rèm cuốn tương tác ở khu mẫu (`CurtainMesh`); ánh sáng tự nhiên tại cửa sổ nay có (MỚI, pointLight theo rèm). Rèm cuốn ở mọi cửa sổ: thiếu vị trí cửa sổ có căn cứ |
| Trần thả ô vuông, khung T-bar, đèn LED panel, cửa gió | CÓ | `OfficeCeiling.tsx`, `lighting/` |
| Bảng tên bộ phận cam/đỏ treo trần, cấu hình được | CÓ | `officePropsLayout.ts` `BANNER_TEXTS` |
| Bàn gỗ, chân hộp thép, tấm chắn, bàn nhiều biến thể | CÓ | `env/desk.tsx`, `deskAtlas.ts`; "3 biến thể" theo TASK_STATUS |
| Hộc tủ di động có bánh xe, ngăn kéo | MỘT PHẦN | `PROP_SPOTS` có tủ, ngăn kéo tương tác ở khu mẫu; hộc di động dưới từng bàn: chưa kiểm |
| Ghế xoay lưới đen, 5 chân, biến thiên góc | CÓ | `env/desk.tsx`, `chair` |
| Bàn đối diện nhau, mật độ theo bản vẽ | QĐ 2 (giữ hàng song song) | |
| Màn hình có chân đế, laptop, đồ lặt vặt | CÓ | `env/desk.tsx`, `OfficeProps.tsx` |
| Tủ hồ sơ, TV treo tường, cây lớn, cây nước, tủ thấp, bình chữa cháy | CÓ | `officePropsLayout.ts` `PROP_SPOTS` (fire, water, cabinet, plant, lowcab, tv) |
| Phòng họp, phòng riêng, thang máy theo mặt bằng | CÓ | `content/zones/it.json` |
| Vách kính chỉ nơi có căn cứ | MỘT PHẦN | `ITOffice.tsx` lớp `glass`; cần so ảnh |
| Ánh sáng trắng trung tính + ánh sáng tự nhiên | CÓ (MỚI cho phần tự nhiên ở khu mẫu) | `lighting/presets.ts` |
| PBR, bóng tiếp xúc | MỘT PHẦN | `env/contactShadow.ts`; tủ hồ sơ/đạo cụ `OfficeProps` không có bóng tiếp xúc, không có normal map |
| Chế độ xem tổng thể (ẩn trần, hạ tường) | CÓ | `toggleOverview` (`gtaCamera.ts:177`), e2e `28-overview` |
| Điểm camera đặt sẵn (toàn cảnh, hành lang trái/dưới, cụm bàn, phòng họp) | MỚI | `scene/controls/cameraPresets.ts` (tọa độ suy từ `OFFICE_L_PLAN_RECTS` và vị trí mr1, desk_B), chạy trên chế độ overview (trần ẩn); phím `cameraPreset` (mặc định C) đi vòng các preset rồi về camera theo nhân vật, thanh `CameraPresetBar` chọn trực tiếp, Esc/O thoát. Không sửa `ITOffice.tsx` (nối trong `useGtaCamera`). Góc nhìn thực tế chưa so mắt với ảnh; test `cameraPresets.vitest.test.ts` kiểm điểm nằm trong L và nằm trong giới hạn overview |
| GLB nội thất | THIẾU (cần asset) | không có GLB nội thất được cấp phép |
| Instancing, vật liệu chung | CÓ | `InstancedBoxes.tsx`, census |
| Trần draw call 200 (~208) | QĐ 3 (giữ 200, chỉ cảnh báo) | |
| Ảnh chụp các góc đối chiếu | THIẾU | cần người xem ảnh thật |

## 3. fashion.txt

| Yêu cầu | Trạng thái | Bằng chứng / ghi chú |
|---|---|---|
| Chibi đầu lớn, thân gọn | CÓ | GLB `chibi` (MPFB), `AVATAR_SPEC.md`; mâu thuẫn với user.txt đã giải bằng hai kiểu thân |
| Công sở + streetwear (56 món) | CÓ | `fashion/catalog.ts`, `avatar/outfit/` |
| Trang phục có phom/độ dày/lớp riêng | MỘT PHẦN | vỏ cắt từ thân (`avatar/outfit/threeShell.ts`), không phải mesh rời; `WARDROBE.md` mục 1 |
| Tùy chỉnh cơ thể: da, cao, vóc dáng, vai, tay chân | CÓ | `wardrobe/shapeSliders.ts`, `avatar/boneShape.ts`, `avatar/outfit/bodyMorphs.ts` |
| Chỉnh riêng bắp tay, cẳng tay, đùi, cỡ bàn tay/chân | THIẾU (cần morph) | `WARDROBE.md` mục "Chưa làm/hạn chế" (GLB MPFB không có morph này) |
| Khuôn mặt (dáng, mắt, mày, mũi, miệng, tai) | MỘT PHẦN | `fashion/face.ts`, tab `style`; chỉ phần có morph thật được hiện |
| Tóc: kiểu, màu, highlight, side part, undercut, buzz, xoăn, dài | CÓ | `fashion/hair.ts`, `avatar/outfit/hairHat.ts` |
| Hình xăm: thư viện, vị trí/kích thước/xoay/màu/độ đậm, đối xứng, danh sách lớp | CÓ | `src/tattoo/`, `TATTOO_PAINT.md` |
| Tải PNG làm hình xăm | QĐ (DECISIONS_27 mục 4): không tải ảnh, thay bằng vẽ | |
| Sẹo kiểu hoạt hình | CÓ | `fashion/scars.ts` |
| Tủ đồ theo nhóm, màu theo vùng, chất liệu, phom regular/slim/oversized, sơ vin | CÓ | `wardrobe/WardrobeRoom.tsx` tab `outfit`, `color`; `outfit/zones.ts` |
| Họa tiết/chữ trên trang phục + chỉnh vị trí, tỉ lệ, góc, màu; xem trước | CÓ | `patternTexture.ts`, tab `pattern`, `pattern.vitest.test.ts` |
| Ảnh tải lên làm họa tiết | THIẾU | cùng nguyên tắc QĐ không tải ảnh; chưa có quyết định riêng cho họa tiết quần áo |
| Phối nhiều lớp, tự xử lý xung đột | CÓ | `fashion/rules.ts`, `outfitGuard.ts`, `relaxFits` |
| Phụ kiện theo xương, chỉnh màu/vật liệu/kích thước, không trôi | CÓ | `accessoryRig.ts`, `accessoryBuild.ts`, `accessory.vitest.test.ts` |
| Điện thoại cất/cầm/dùng; animation nhìn/chụp | MỘT PHẦN | trạng thái cất nhô khỏi túi đã sửa (commit 39ffb11); animation nhìn điện thoại/chụp ảnh: thiếu asset clip |
| Sáu bộ mẫu | CÓ | `fashion/presets.ts`, `WARDROBE.md` (12 tổ hợp không lỗi) |
| Phòng thay đồ: xoay 360, zoom, về góc chuẩn | CÓ | `WardrobeRoom.tsx` (`V`) |
| Tab Cơ thể, Mặt, Tóc, Xăm & Sẹo, Trang phục, Phụ kiện, Bộ đã lưu | MỘT PHẦN | tab thực tế: Bộ mẫu, Trang phục, Màu, Hình thể, Kiểu tạo hình, Phụ kiện, Họa tiết (`wardrobeState.ts:50`); xăm có công cụ riêng `TattooPainter`. Tên khác đặc tả, đủ chức năng |
| Camera tự chuyển tới vùng đang chỉnh | CÓ | `WardrobeRoom.tsx:67` `focusFor` |
| Hoàn tác/làm lại, đặt lại, ngẫu nhiên, so sánh trước/sau | CÓ | `wardrobeState.ts` (`undo`, `redo`, `compare`) |
| Lọc đồ theo phong cách/loại/màu/khả năng phối | MỘT PHẦN (MỚI: phong cách, màu) | lọc theo loại/slot; thêm lọc phong cách (`GarmentDef.styles`) và họ màu (suy từ `defaultColors`) trong tab Trang phục (`wardrobe/garmentFilter.ts`). "Khả năng phối" vẫn chỉ hiện nhãn (hạn chế) |
| Lưu bộ phối, "Vào văn phòng" | CÓ | `WardrobeRoom.tsx` (Ctrl+Enter), `fashion/persistence.ts` |
| Xuất/nhập JSON | MỚI | tab Bộ mẫu có "Xuất JSON", "Nhập từ tệp", ô dán (`wardrobe/lookTransfer.ts`): dùng `fashion/persistence.ts` và checksum SHA-256 như gói sao lưu; tệp sửa tay bị từ chối, tệp không checksum nhập được kèm cảnh báo; nhập là một bước hoàn tác. Test `wardrobeTransfer.vitest.test.ts` |
| Tạm dừng điều khiển khi mở, khôi phục khi đóng | CÓ | `holdPause('wardrobe')`, `holdPause.vitest.test.ts` |
| Kiểm tra tư thế vận động, ngồi tại vai, khuỷu, hông, gối | THIẾU (cần người xem) | `WARDROBE.md` mục 7 "chưa kiểm chứng" |
| Mũ, mép cổ áo | MỘT PHẦN | mũ dựng (`accessoryHat.ts`), tóc né mũ vừa làm; mép cổ áo đã sửa (39ffb11) |
| Thiếu asset thì nêu rõ | CÓ | `ASSET_SOURCES.md`, `WARDROBE.md` |

## 4. Yêu cầu còn thiếu, và vì sao chưa làm đợt này

| Yêu cầu | Lý do |
|---|---|
| Cha/con (đồ trên bàn đi theo bàn), kéo ghế và tủ hồ sơ | cần đổi schema layout và quy tắc server (`services/world`); ngoài phạm vi worktree |
| Cột, tranh slogan, rèm cuốn mọi cửa sổ | thiếu vị trí có căn cứ từ bản vẽ trong repo |
| GLB nội thất, animation nhìn/chụp điện thoại, morph bắp tay/đùi | cần asset ngoài |
| Họa tiết từ ảnh tải lên | chưa có quyết định; xung đột nguyên tắc "không tải ảnh" |
| Chữ QĐ 2 ("xoay bàn trong chế độ sắp xếp") không khớp mã (bàn cố định) | không sửa hành vi; đề nghị điều phối sửa chữ của QĐ 2 |

## 5. Đã triển khai đợt này

1. Xem trước đặt đồ xanh/đỏ (`evaluatePlacement`, `PlacePreview`): hành động đặt và xem trước dùng chung một hàm nên luôn khớp.
2. Thả rơi (`dropLanding`, `fallStep`, hành động "Thả rơi"): rơi xuống mặt đặt hợp lệ hoặc sàn trống; sàn bị chặn thì từ chối và vẫn cầm.
3. Rèm đổi ánh sáng ngày thật: pointLight sau cửa sổ theo `curtainLightIntensity`.
4. Nút "Đặt lại vật" (`resetAllObjects`): đưa mọi vật về trạng thái đầu; từ chối khi đang ngồi hoặc dùng giao diện.

Test: `src/scene/interact/objects/extras.vitest.test.ts`. Draw call: `scripts/perf/static-census.mjs` thêm 1 vị trí mesh (xem trước) nhưng `visible=false` khi không cầm đồ nên không vẽ; thêm 1 pointLight (không phải draw call, tăng chi phí shader).

## 6. Đã triển khai đợt `wt3/tuong4`

1. Quan sát đồ nhỏ (phím `inspectItem`, mặc định R; kéo chuột/mũi tên xoay; Esc thoát; camera không dời).
2. Lease vật cầm `held:<id>` nối vào Cầm khi `?world=1` (`net/itemLease.ts`).
3. Camera điểm đặt sẵn (phím `cameraPreset`, mặc định C; thanh chọn; thoát về camera theo nhân vật). Thêm hai action vào cài đặt phím (`schema.ts`), có thể đổi phím.
4. Phòng thay đồ: lọc phong cách/màu; xuất/nhập JSON nhân vật có checksum.

Draw call: không thêm mesh hay material mới (vật quan sát dùng lại mesh của `ItemMesh`; thanh preset và gợi ý là DOM). Chưa kiểm bằng mắt: góc nhìn từng preset, vị trí vật quan sát trên màn hình.
