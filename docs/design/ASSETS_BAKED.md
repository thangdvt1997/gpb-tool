# Asset tự sinh (bake) từ mã dự án

Ngày: 2026-11-07. Phạm vi: task 01 (asset, manifest) và task 02 (clip animation thật).

## Nguồn gốc và license

Các tệp dưới đây do mã trong repo sinh ra, không dùng asset bên ngoài:

| Tệp (public/models) | Sinh bởi | Nội dung |
|---|---|---|
| furn_desk.glb, furn_chair.glb | scripts/assets/bake-furniture.mjs | Bàn (kích thước khớp DeskField), ghế xoay |
| acc_headphones.glb, acc_backpack.glb, acc_mug.glb | scripts/assets/bake-furniture.mjs | Phụ kiện gắn socket head, back, hand_r |
| anim_male_real.glb, anim_female_real.glb, anim_chibi.glb | scripts/assets/bake-clips.ts | Cây xương MPFB + 13 clip keyframe, không mesh |

License: theo license của repo. Repo hiện chưa có file LICENSE, nên manifest ghi `LicenseRef-GPB-project` và chủ dự án cần quyết định license chính thức. Nguồn gốc đã kiểm được vì tái tạo ra đúng từng byte (`--check`).

## License 3 GLB MPFB: CHƯA kiểm chứng

male_real.glb, female_real.glb, chibi.glb (dữ liệu MakeHuman xuất bằng MPFB 2) vẫn `license.verified = false`. Việc này cần người có quyền đối chiếu: mở trang license MakeHuman/MPFB, lưu bằng chứng có ngày, đối chiếu sha256 với tệp gốc trên VPS. Nhóm tệp tự sinh ở trên không thay thế việc đó, và 6 shape key thân vẫn chưa đối chiếu với target gốc.

## Cách tái tạo

```
node scripts/assets/bake-furniture.mjs            # bàn, ghế, phụ kiện (cần polyfill FileReader: scripts/assets/lib/node-gltf-polyfill.mjs)
npx vite-node scripts/assets/bake-clips.ts        # clip cho 3 nhân vật
node scripts/assets/sync-baked-manifest.mjs       # đo lại hash, bytes, bounds, tam giác, socket vào manifest
node scripts/assets/validate-manifest.mjs         # 0 lỗi
```
Mỗi script có `--check` (không ghi, thoát 1 nếu tệp/manifest lệch). Đầu ra xác định.

## Clip animation

- Định nghĩa: `src/avatar/bakedClips.ts` (Idle, Walk, Run, JumpStart, Airborne, Land, SitDown, SeatedIdle, StandUp, Interact, Stunned, Wave, Dance). Tên khớp `CLIP_MAP` (src/scene/motion/clipMap.ts); chỉ Emote vẫn procedural.
- Walk, Run, Dance lấy thẳng từ `computePose`; các clip chuyển tiếp (ngồi, đứng, nhảy, chạm, choáng) là nội suy giữa tư thế procedural do task này viết, không phải chuyển động thu thập.
- Mỗi nhân vật một tệp vì rest pose xương khác nhau. Track: quaternion 10 xương mà AvatarPose điều khiển, cùng Root.position (rootY) và Root.quaternion. Track không đổi chỉ giữ 2 khóa. Mỗi tệp khoảng 130 KB.
- Runtime: `src/avatar/useBakedClips.ts` được `MpfbAvatar.tsx` gọi. Với animation cố định (idle, walk, run, jump, sit, wave, dance) nó ưu tiên clip bake khi tải được; tải lỗi hoặc `?baked=0` thì dùng procedural như cũ. Animation `locomotion` của người chơi và emote KHÔNG dùng clip bake (còn trộn theo tốc độ, nhìn theo camera, xoay tại chỗ), nên FSM 12 trạng thái chưa lái clip.
- Test: `src/avatar/bakedClips.vitest.test.ts` so tên xương, độ dài clip, vòng lặp khép kín, và quaternion xương sau khi phát clip với `applyMpfbPose` (dot > 0,999).

## Socket

Cả 7 socket nhân vật (hand_l, hand_r, head, neck, back, foot_l, foot_r) đo từ xương/đỉnh mesh thật bằng `measure-sockets.mjs`, kèm `rotationDeg` (Euler XYZ, độ, cục bộ theo xương) đưa khung socket về trùng trục mô hình ở tư thế nghỉ. Chưa kiểm bằng mắt trong scene; runtime hiện không đọc `rotationDeg`.

## Draw call

Mỗi GLB tĩnh có đúng 1 mesh, 1 vật liệu (màu theo đỉnh). (Lần 6: đã nối vào cảnh, xem mục Bàn ghế GLB trong cảnh bên dưới.)

## Validator

Sửa nhỏ để chấp nhận tệp chỉ có xương + animation: `readGlbFacts` lấy tên node làm xương khi không có skin/mesh, `checkFacts` bỏ so bounds khi tệp không có hình học. Kết quả: 0 lỗi, 15 cảnh báo (giảm từ 24: hết 9 SOCKET_UNCALIBRATED).

Lần 4: manifest ghi `runtimeAlphaMode` (OPAQUE cho body/low-poly, MASK cho eyebrow) vì `fixMaterials` trong MpfbAvatar ép lại lúc chạy; validator bỏ 9 cảnh báo BLEND_UNAPPROVED tương ứng. Kết quả: 0 lỗi, 6 cảnh báo (3 LICENSE_UNVERIFIED, 3 PIVOT_OFFSET_REQUIRED).

## Bàn ghế GLB trong cảnh (task 01, lần 6)

- Hàm thuần: `src/scene/furnitureGlb.ts` (`sourcesFromScene` gom mesh theo vật liệu bằng `mergeGeometries`, `furniturePlacements`, `glbFurnitureEnabled`). Test: `src/scene/furnitureGlb.vitest.test.ts` (gồm kiểm hai GLB thật mỗi tệp đúng 1 cặp geometry+vật liệu).
- Dựng: `src/scene/GlbFurniture.tsx`. `DeskField` (`src/scene/Desks.tsx`) dựng bàn rồi ghế bằng InstancedMesh từ `furn_desk.glb` và `furn_chair.glb`: 2 InstancedMesh, tức 2 draw call (cũ: `BoxDeskField` cũng 2 draw call, mặt bàn và màn hình). Ghế đặt cách bàn 0,55 m về +z, xoay pi, khớp lưới ghế của hệ tương tác (`SEAT.chairOffset`); không đổi va chạm. Bấm và rê vẫn tác động khối bàn.
- Rơi về hộp (`BoxDeskField`) khi GLB đang tải, tải lỗi hoặc `?glbFurniture=0`.
- Cờ debug: `window.__gpbFurniture = { source: 'glb' | 'boxes' | 'loading', flag, instancedMeshes, desks, chairs }`.
- Đo (e2e `/home/cc/gpb-e2e/pending/35-glb-furniture.spec.ts`, `?perf=1`, swiftshader, camera mặc định): trước (`?glbFurniture=0`, đường mã cũ) 66 draw call, sau (GLB) 66. Lý do bằng nhau: GLB và hộp đều 2 lệnh vẽ, và cảnh hiện không có bàn nào đi qua `DeskField` (`plainDesks` rỗng, mọi bàn thật do `DeskDecorField` vẽ bằng atlas, 2 draw call cho cả khu, chi tiết hơn GLB tự sinh nên KHÔNG thay). Vì vậy thay đổi này không tăng draw call và cũng không đổi hình cảnh hiện tại; nó có hiệu lực khi có bàn không decor. Trần 200 theo PENDING_DECISIONS mục 3 giữ nguyên (chỉ cảnh báo).
- Ba biến thể bàn dev/design/ops chỉ có trong `DeskDecorField` (nội dung màn hình), không áp dụng cho GLB tự sinh (một kiểu bàn).
- PIVOT_OFFSET_REQUIRED còn 3 cảnh báo thuộc nhân vật (char.male_real, char.female_real, char.chibi), không phải bàn/ghế/phụ kiện (các asset này đã gốc ở sàn hoặc socket, không cảnh báo). Không sửa trong lần này. Validator: 0 lỗi, 6 cảnh báo, như trước.
