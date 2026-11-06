# Chuẩn asset 3D · Văn phòng ảo GPBank

Ngày lập: 2026-11-06. Áp dụng cho mọi file GLB/glTF nạp vào scene (nhân vật, animation, nội thất, phụ kiện).
Hợp đồng dữ liệu: `src/assets/schema.ts`. Validator: `scripts/assets/validate-manifest.mjs`. Manifest: `public/models/manifest.json`.
Nguồn và license: theo `docs/design/ASSET_SOURCES.md`. Vật liệu và kích thước nội thất tham chiếu: `docs/design/REAL_OFFICE_STYLE.md`.

Số liệu ghi "đã đo" lấy từ file thật bằng `--print-facts`. Số liệu ghi "ước lượng chờ đo" chưa có bằng chứng.

## 1. Kiểm kê asset hiện có (đo ngày 2026-11-06)

| assetId | File | Dung lượng | Tam giác | Mesh / material / texture | Rig | Morph | Clip | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| char.male_real | public/models/male_real.glb | 5 531 416 B | 27 120 | 3 / 3 / 3 PNG nhúng | 53 xương, 1 skin | 18 | 0 | Cao 1.866 m (bounds y 0.026–1.892). Material BLEND. Origin thấp hơn đáy chân 2.6 cm |
| char.female_real | public/models/female_real.glb | 6 228 128 B | 27 120 | 3 / 3 / 3 PNG nhúng | 53 xương, 1 skin | 18 | 0 | Cao 1.574 m (bounds y 0.027–1.601). Như trên |

- Generator: Khronos glTF Blender I/O v4.2.83, không dùng extension (không Draco, không KTX2, không meshopt).
- Material: `*.body`, `*.eyebrow001`, `*.low-poly` (mắt), cả ba `alphaMode BLEND`, `doubleSided true`, chỉ có baseColor, không normal map.
- Nguồn: dữ liệu MakeHuman (CC0) xuất bằng MPFB 2 (add-on Blender, GPL-3.0). License GPL áp cho mã của công cụ, không áp cho dữ liệu xuất ra. File gốc trên VPS `/opt/gpb-mpfb/out/`. Chưa mở lại trang license MakeHuman trong phiên này nên manifest để `verified: false`. Nguồn gốc 6 shape key thân (bodyBelly, bodyWaistSlim, bodyHipsWide, bodyShouldersV, headFat, chestMuscle) chưa đối chiếu.
- Repo chưa có GLB nội thất, phụ kiện hay animation. Bàn, ghế, tủ hiện vẽ bằng hộp thủ tục trong `src/scene/layout.ts` theo `src/content/zones/it.json`.
- Chưa đo: kích thước ảnh texture, bộ nhớ GPU, thời gian tải.

## 2. Đơn vị, hệ trục, hướng

- Đơn vị: **mét**. `scale` trong manifest = 1. Không bù tỷ lệ khi nạp; asset sai đơn vị phải xuất lại.
- Hệ trục: **Y-up, tay phải** (Three.js, glTF). Sàn là mặt phẳng y = 0.
- Hướng trước: **+Z** trong không gian asset. Đã kiểm trên hai GLB nhân vật: mũi chân (`ball_l` z = 0.150) và lông mày (z ≈ 0.13–0.16) nằm phía +Z so với gót (`foot_l` z = 0.014). Tay trái nhân vật ở **+X** (`hand_l` x = +0.531).
- Mặt trước đồ vật (mặt người dùng đứng, mặt ngăn kéo kéo ra, mặt tay nắm cửa) cũng hướng +Z.
- Toạ độ thế giới giữ nguyên quy ước hiện có: `worldX = x − 29`, `worldZ = y − 15` theo bản vẽ (`src/scene/layout.ts`). Chuẩn này không đổi toạ độ vật thể trong `it.json`.
- Nhập từ Blender: glTF exporter bật `+Y Up`, Apply Transform/Modifiers, đơn vị scene = Metric, Unit Scale 1.0. Mặt trước model trong Blender là −Y (exporter đổi thành +Z).
- Nhập từ nguồn khác (FBX, OBJ): đi qua Blender, kiểm tra kích thước bằng thước 1 m, rồi xuất GLB. Không xoay/scale trong mã ứng dụng để chữa file.

## 3. Origin và pivot

| Loại | pivot.kind | Vị trí origin | Trục |
|---|---|---|---|
| character | feet-center | Giữa hai bàn chân, trên mặt sàn | — |
| furniture (bàn, tủ, hộc) | base-center | Tâm đáy chân đế, trên mặt sàn | — |
| chair | seat-center | Tâm chân sao (trục xoay), trên mặt sàn | Trục xoay ghế [0,1,0] nếu xoay |
| door | hinge | Trên trục bản lề, mép dưới cánh | Bắt buộc, thường [0,1,0] |
| drawer | slide-axis | Trên trục trượt, mặt trước khi đóng | Bắt buộc, thường [0,0,1] |
| accessory | attach-point | Điểm chạm socket | — |
| prop | base-center hoặc custom | custom phải ghi `pivot.note` | — |

- Nếu file chưa đúng origin, ghi độ lệch đã đo vào `pivot.offset`; loader trừ offset khi đặt vào scene. Validator cảnh báo `PIVOT_OFFSET_REQUIRED`. Hai GLB nhân vật hiện ở trường hợp này (y = 0.026 và 0.027 m).
- Đồ đặt sàn có đáy lệch y quá 1 cm mà không ghi offset: lỗi `NOT_ON_GROUND`.

## 4. Socket

Tên chuẩn trên nhân vật (bắt buộc): `hand_l`, `hand_r`, `head`, `neck`, `back`, `foot_l`, `foot_r`.
Ánh xạ hiện tại với rig `rig.mpfb_53`: hand_l→`hand_l`, hand_r→`hand_r`, head→`head`, neck→`neck_01`, back→`spine_03`, foot_l→`foot_l`, foot_r→`foot_r`. Offset đang là [0,0,0] tại gốc xương, `calibrated: false`.

Socket tương tác trên đồ vật dùng tiền tố `interact.`:
- `interact.sit` (ghế, bắt buộc): điểm đặt hông, hướng +Z là hướng nhìn khi ngồi.
- `interact.handle` (cửa, ngăn kéo, bắt buộc): vị trí tay nắm.
- `interact.stand` (bàn, tủ, tùy chọn): chỗ đứng trước đồ vật, trên sàn.
- `interact.place` (mặt bàn, tùy chọn): điểm đặt đồ.

Socket gắn theo `bone` (asset có rig) hoặc `node` (empty trong file), không có cả hai. Phụ kiện khai báo `attachTo` bằng một tên socket nhân vật.

## 5. Skeleton và retarget

- Hồ sơ rig (`rigProfiles`) ghi đủ tên xương theo thứ tự `skin.joints`, `rootBone`, `restPose`, `rootMotion`, `retargetMap` (tên humanoid VRM → tên xương).
- `rig.mpfb_53`: 53 xương, root `Root`, rest pose A (đo: cánh tay chếch xuống khoảng 49°), `rootMotion: unknown` vì chưa có clip. retargetMap chưa kiểm chứng bằng clip thật.
- Clip mặc định in-place; clip có root motion ghi `rootMotion: "root-motion"`.
- Không đổi tên xương hàng loạt trước khi rà mọi clip và socket phụ thuộc. Nếu cần đổi, thêm rigProfile mới và mapping, giữ hồ sơ cũ.

## 6. Color space, alpha, material

- Texture màu (baseColor, emissive): **sRGB**. Texture dữ liệu (normal, metallicRoughness, occlusion, alpha riêng): **linear**. GLTFLoader của three 0.169 tự đặt theo glTF; texture tạo bằng mã phải đặt `colorSpace` tương ứng (`SRGBColorSpace` hoặc `NoColorSpace`).
- Normal map: tangent space, quy ước glTF (+Y xanh lá hướng lên, kiểu OpenGL). Map kiểu DirectX phải lật kênh G khi nhập.
- alphaMode: da, thân, vải, gỗ = `OPAQUE`; lông mày, mi, tóc thẻ, lưới ghế = `MASK` với `alphaCutoff` ghi rõ (REAL_OFFICE_STYLE dùng 0.4 cho lưới ghế); `BLEND` chỉ cho kính, phải đặt `blendApproved: true`.
- doubleSided chỉ bật cho mặt mỏng (lưới, lá cây, tóc thẻ).
- Material dùng chung khai báo `shared` bằng ID token, ví dụ `real.wood.oak`, `real.metal.frame` (xem REAL_OFFICE_STYLE mục 2–3).

## 7. Budget theo loại (ước lượng chờ đo)

Chỉ dòng nhân vật có số đo thật; các dòng khác là ước lượng chờ đo trên thiết bị mục tiêu, không dùng làm ngưỡng chặn.

| Loại | Tam giác LOD0 | Dung lượng file | Texture | Ghi chú |
|---|---|---|---|---|
| character | Đã đo: 27 120 | Đã đo: 5.3–5.9 MB | 3 PNG nhúng, kích thước chưa đo | Chưa có LOD1, chưa nén |
| furniture / chair | Ước lượng chờ đo | Ước lượng chờ đo | Ước lượng chờ đo | Dùng InstancedMesh cho ghế, hộc tủ |
| door / drawer | Ước lượng chờ đo | Ước lượng chờ đo | Ước lượng chờ đo | |
| accessory | Ước lượng chờ đo | Ước lượng chờ đo | Ước lượng chờ đo | |
| animation | — | Ước lượng chờ đo | — | |

Cách đo: `--print-facts` cho tam giác và dung lượng; bộ nhớ GPU và thời gian khung hình đo bằng `renderer.info` trong scene xem asset (chưa có).

## 8. Manifest

Trường chung bắt buộc: `assetId` (dạng `<nhóm>.<tên>`, chữ thường, không đổi sau khi phát hành), `type`, `version` (semver, tăng khi file đổi), `hash` (sha256), `bytes`, `url` (tương đối so với manifest, dùng `/`, không `..`), `format`, `scale`, `bounds` (kèm `measuredBy`), `pivot`, `license`.

| Loại | Bắt buộc thêm |
|---|---|
| character | rigProfile, sockets (7 tên chuẩn), morphCapabilities, materials, lods, colliderProfile |
| animation | rigProfile, clips (ít nhất 1) |
| furniture, chair, door, drawer, prop | colliderProfile, materials, lods; chair/door/drawer cần socket interact tương ứng. Không bắt rig |
| accessory | attachTo, materials |

## 9. Validator

```
node scripts/assets/validate-manifest.mjs                       # public/models/manifest.json
node scripts/assets/validate-manifest.mjs <manifest> --strict   # cảnh báo cũng là lỗi
node scripts/assets/validate-manifest.mjs --print-facts <file.glb>
node --test scripts/assets/validate-manifest.test.mjs
```

Cần Node có type stripping (đã chạy với Node 24.19). Validator chỉ đọc, không sửa file. Mỗi lỗi có mã, assetId, đường dẫn trường và hướng sửa. Kiểm tra: schema, ID trùng, giá trị không hữu hạn (kể cả `null` do NaN bị JSON.stringify), URL và file tồn tại, transform bất thường (scale, bounds, đáy lệch sàn, chiều cao nhân vật), pivot theo loại, socket thiếu/trùng/sai xương, clip thiếu, license không cho phép. Với GLB: đối chiếu hash, bytes, bounds, số tam giác, xương, morph, clip, node, material với file.

## 10. Chuyển manifest cũ

Repo chưa có manifest asset cũ. `src/assets/migrate.ts` chuyển mục dạng `SOURCE.json` (ASSET_SOURCES.md mục 5) hoặc mảng mục tự do sang schema 1, không điền số đo giả; trường thiếu được liệt kê và validator báo lỗi. Bố trí văn phòng nằm ở `src/content/zones/*.json`, không đi qua manifest, nên chuyển manifest không làm đổi toạ độ. Chưa kiểm chứng trên dữ liệu cũ thật.

## 11. Còn thiếu

- Scene xem asset (grid 1 m, bounds, pivot, socket) chưa làm: nằm trong `src/scene/**` đang do agent khác sửa.
- Chưa có GLB bàn, ghế, tủ, cửa, ngăn kéo, phụ kiện, animation; chưa nạp thử để chứng minh tỷ lệ và vị trí gắn.
- Clip `idle`, `walk`, `sit` chưa có cho `rig.mpfb_53`.
- Offset socket chưa hiệu chỉnh; material nhân vật còn BLEND; origin nhân vật lệch 2.6–2.7 cm.
- Chưa có bằng chứng license MakeHuman lưu trong repo; THIRD_PARTY.md chưa có dòng cho hai GLB.
