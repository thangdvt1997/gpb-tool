# Phòng thay đồ, vỏ trang phục và chống xuyên (TASK 04)

Phạm vi: `src/wardrobe/**`, `src/avatar/outfit/**`. Dùng dữ liệu thời trang ở `src/fashion/**` (chỉ đọc) và `MpfbAvatar` (chỉ đọc).

## 1. Hiện trạng asset (đã đọc JSON chunk của `public/models/*.glb`)

- Ba tệp `male_real`, `female_real`, `chibi` có cùng cấu trúc: một SkinnedMesh thân `base` (14 517 đỉnh, 26 756 tam giác, đã gồm đầu, tay, chân, bàn tay, bàn chân), lông mày và mesh `low-poly` nhỏ; một skeleton 53 xương; 18 morph target chỉ trên mesh thân (12 biểu cảm mặt + `bodyBelly`, `bodyWaistSlim`, `bodyHipsWide`, `bodyShouldersV`, `headFat`, `chestMuscle`).
- Không có mesh trang phục rời, không có corrective morph cho khớp, không có morph tay/chân/cổ/lưng, không có socket phụ kiện riêng.
- Vì vậy trang phục được dựng bằng "vỏ" cắt từ chính mesh thân (mục 2). Đây là giải pháp thay thế có giới hạn, không phải mesh quần áo hoàn thiện. Mũ chưa dựng được.

## 2. Cách dựng vỏ (`src/avatar/outfit`)

| File | Vai trò (thuần trừ khi ghi chú) |
|---|---|
| `regions.ts` | Phân vùng đỉnh theo tổng trọng số skin tới xương: head, neck, torso, pelvis, upperArm, foreArm, hand, thigh, calf, foot (+ bên trái/phải); tính `t` (vị trí dọc đoạn xương) và `u` (độ cao chuẩn hoá, 0 = xương chậu, 1 = gốc cổ). |
| `shellClass.ts` | Bảng `group:kind` -> vùng che, độ dày, loe váy, lớp (`base`/`shirt`/`jacket`/`accessory`), mức hỗ trợ. Phủ đủ 56 món (có test). |
| `coverage.ts` | Chọn đỉnh/tam giác được che; xếp lớp (độ đẩy tại mỗi đỉnh của lớp trên = max lớp dưới + khe + độ dày riêng); ẩn tam giác da nằm kín dưới vỏ. |
| `zones.ts` | Gán vùng màu (thân, tay, cổ áo, cổ tay, gấu, cạp, đế, mũi giày...) cho từng đỉnh vỏ; màu lấy từ `WornGarment.colors`. |
| `plan.ts` | `CharacterLook` -> danh sách vỏ cần dựng (thả/sơ vin, áo trong dưới bộ liền). |
| `compat.ts` | Ma trận tương thích, kiểm tra tổ hợp, `proposeGarment/proposeFitChange/proposeTuck/proposeOutfit` (giữ bộ cũ khi từ chối). |
| `bodyMorphs.ts` | Hình thể -> trọng số 6 morph thân (gồm thanh tổng hợp cân nặng/mỡ/cơ). |
| `pool.ts` | `RefPool` đếm tham chiếu, `hashArray`. |
| `threeShell.ts` (three) | Lấy dữ liệu thô từ SkinnedMesh, `deriveGeometry`, kho geometry dùng chung, vật liệu vỏ. |
| `MpfbOutfit.tsx` (R3F) | Component gắn vỏ vào rig. `MpfbOutfitOn.tsx`: bản tự tìm rig từ một `<group ref>`. |

Cơ chế:
- Vỏ là `SkinnedMesh` riêng, `bind(body.skeleton, body.bindMatrix)` (dùng chung skeleton, không thêm bone texture), thêm vào cha của mesh thân nên cùng transform và scale.
- Geometry vỏ dùng chung object attribute (position, normal, uv, skinIndex, skinWeight, morph) với thân, chỉ có `index` riêng + thuộc tính `aOff` (độ đẩy) và `aZone`. `mesh.morphTargetInfluences` là cùng mảng với thân nên vỏ theo mọi morph thân và morph mặt mà không cần sao chép.
- Vật liệu `MeshStandardMaterial` có `onBeforeCompile`: sau `morphtarget_vertex` thêm `transformed += normalize(normal) * aOff` (trước skinning), và nhân màu vùng theo `aZone`. `polygonOffset` tăng theo lớp.
- Da: `body.geometry` được thay bằng geometry dẫn xuất có index đã loại các tam giác nằm kín dưới vỏ; geometry gốc (dùng chung trong cache `useLoader`) không bị sửa, và được khôi phục khi gỡ. Tam giác cần đủ cả 3 đỉnh được che nên cổ, đầu, bàn tay, cẳng tay dưới tay áo ngắn, chân dưới váy/quần short luôn còn da.
- Độ dày (m, cỡ cao 1,8 m, co theo chiều cao mesh): tất 1,5 mm, áo phông 2,8 mm, sơ mi 3 mm, quần âu 4 mm, jeans 5 mm, blazer 7,5 mm, hoodie/bomber 8,5 mm, giày 4,5 đến 7 mm; phom ôm x0,8, rộng x1,15 và thêm độ rộng phom 0/3/14 mm (co dần ở cổ tay, gấu). Tại đỉnh chung, lớp trên luôn ngoài lớp dưới (có test).
- Thứ tự lớp: tất 10 < giày 20 < quần 30 < bộ liền 35 < áo trong 40 < áo ngoài 60; áo trong sơ vin hạ còn 25 (dưới quần), áo trong mặc dưới bộ liền còn 28.
- Quản lý tài nguyên: geometry vỏ/da lấy qua `geometryPool` (khoá theo nội dung, nhiều nhân vật cùng bộ đồ dùng chung); gỡ món hay unmount thì `release`, về 0 mới `dispose`. Vật liệu vỏ thuộc từng mesh, dispose khi gỡ. Skeleton, vật liệu thân và geometry gốc không bị dispose. Test: đổi đồ 200 lần, kho về đúng mức ban đầu.

## 3. Ma trận tương thích (kết quả `compatibilityMatrix()`)

"có luật che" nghĩa là có luật vùng/độ dày riêng và có test hình học trên dữ liệu thật; chưa có nghĩa đã duyệt bằng mắt.

| Loại | Người thật | Chibi | Ghi chú |
|---|---|---|---|
| Áo trong: sơ mi dài/ngắn/camp, polo, phông, hoodie, jersey | có luật che | có luật che | |
| Áo trong cổ lọ, len (cổ cao) | có luật che | xấp xỉ | cổ chibi ngắn, vỏ cổ có thể sát cằm |
| Áo ngoài: blazer, tuxedo, bomber, denim, zip hoodie, cardigan, overshirt, coach, track | có luật che | có luật che | |
| Quần: âu, chinos, jeans, cargo, wide, joggers, short | có luật che | có luật che | |
| Váy công sở | xấp xỉ | xấp xỉ | ống bám đùi và loe theo pháp tuyến, không phải mảng váy |
| Đầm, đầm dạ hội | xấp xỉ | xấp xỉ | tương tự váy, chưa có đuôi váy |
| Áo dài (3 món) | xấp xỉ | xấp xỉ | tà áo rời chưa có |
| Áo bà ba, jumpsuit, đồng phục (2 món) | có luật che | có luật che | |
| Tất (4 món), giày (trừ cao gót) | có luật che | có luật che | |
| Giày cao gót | xấp xỉ | xấp xỉ | không có hình học gót |
| Mũ (5 món) | không | không | cần mesh rời gắn xương `head`; UI khóa các món này |

Ngưỡng chính sách do ta đặt (chưa kiểm chứng bằng ảnh): phom ôm bị từ chối khi bụng > 0,6, cân nặng > 0,6, mỡ > 0,7, hông > 0,8 (quần, bộ liền), ngực/cơ/vai > 0,8 (áo); sơ vin bị từ chối khi bụng > 0,7; áo ngoài phom ôm trên áo trong dày (hoodie, len) bị từ chối.

Bảng đạt/không đạt đã chạy (test tự động, không phải ảnh):

| Tổ hợp | Kết quả |
|---|---|
| 6 bộ mẫu x (người thật, chibi): không có lỗi chặn | đạt cả 12 |
| 6 bộ mẫu trên 3 mesh: số tam giác da bị ẩn / 26 756 | 10 160 đến 11 894, không tam giác nào thuộc đầu hoặc bàn tay |
| Mũ | không đạt (từ chối, giữ bộ cũ, nêu lý do) |
| Blazer ôm trên hoodie | không đạt (lỗi lớp) |
| Phom ôm khi bụng 0,9 | không đạt (thanh kéo bị từ chối, giữ giá trị cũ) |
| Sơ vin khi bụng 0,9, sơ vin hoodie | không đạt |
| Đầm khi đang có áo + quần | cần xác nhận (cởi áo, quần) |

## 4. Thanh hình thể (`src/wardrobe/shapeSliders.ts`)

Chỉ liệt kê thanh có tác dụng thật: chiều cao (scale), vai (+), eo (chỉ chiều thon), hông (+), bụng (+), ngực (+), đầu đầy (+), và thanh tổng hợp cân nặng, lượng mỡ, cơ bắp cộng vào các morph trên. Morph chỉ có một chiều nên phần trục còn lại bị khóa trong UI kèm chú thích. Giới hạn lấy từ `BODY_LIMITS_BY_STYLE`. `convertBodyStyle` giữ vị trí tương đối của chiều cao và số đầu rồi kẹp theo kiểu mới. Chưa có: cổ, lưng, tay, chân, tỉ lệ đầu thân (xem danh sách `UNSUPPORTED_SHAPE`, hiển thị trong UI).

`MpfbOutfit` ghi lại trọng số morph thân mỗi khung (sau `MpfbAvatar`), nên thanh tổng hợp hoạt động mà không cần sửa `MpfbAvatar`. Tắt bằng `driveBodyMorphs={false}`.

## 5. Dòng mount (điều phối viên chèn)

`src/avatar/MpfbAvatar.tsx`: thêm import và một dòng trong `MpfbModel`, ngay sau `<primitive object={rig.root} />` (cùng trong `<group scale={scale}>`):

```tsx
import { MpfbOutfit } from './outfit/MpfbOutfit';
// ...
<primitive object={rig.root} />
<MpfbOutfit rig={rig} look={look} />
```

`MpfbRig` có `root` và `morphMesh` nên khớp kiểu `OutfitRigLike`. Component không render gì vào cây React.

Nếu không muốn sửa `MpfbAvatar`: bọc `<MpfbAvatar/>` trong `<group ref={ref}>` rồi thêm `<MpfbOutfitOn target={ref} look={look} />` (đây là cách phòng thay đồ đang dùng).

`src/App.tsx` (mở phòng thay đồ; tạm dừng điều khiển di chuyển khi mở, khôi phục khi đóng theo cơ chế sẵn có của app):

```tsx
import { WardrobeRoom } from './wardrobe';
{wardrobeOpen && (
  <WardrobeRoom
    initialLook={look}
    appearance={appearance}
    onConfirm={(l) => { setLook(l); /* lưu qua src/fashion/persistence */ setWardrobeOpen(false); }}
    onCancel={() => setWardrobeOpen(false)}
  />
)}
```

Phím trong phòng: `1` đến `5` chuyển tab, `Ctrl+Z` hoàn tác, `Ctrl+Y` hoặc `Ctrl+Shift+Z` làm lại, `Ctrl+Enter` xác nhận, `Esc` hủy, `V` về góc nhìn chuẩn. Phím không kích hoạt khi đang gõ vào ô nhập (nhưng `Esc` và `Ctrl+...` vẫn hoạt động).

## 6. Kiểm thử đã chạy

`npx vitest run src/wardrobe src/avatar/outfit`: 73 test đạt (46 + 27). `tsc --noEmit` không báo lỗi trong hai thư mục này. Test hình học dùng đỉnh/skin thật từ ba tệp GLB (qua bộ đọc tối thiểu trong `glbBody.testutil.ts`) và một thân giả (`fakeBody.testutil.ts`).

## 7. Chưa kiểm chứng (không tuyên bố đạt)

- Chưa chạy trong trình duyệt: chưa xem ảnh nào của vỏ, shader `onBeforeCompile` chưa được biên dịch trên GPU, chưa đo hình ảnh xuyên thấu. Mọi con số độ dày và ngưỡng là ước lượng từ kích thước mesh, cần chỉnh bằng mắt.
- Chưa kiểm tra các animation đi, chạy, ngồi, giơ tay với vỏ: khi khớp gập mạnh (vai, nách, khuỷu, hông, đầu gối) vỏ cùng skin weights với da nên xuyên ít khi đứng yên nhưng có thể nhăn/xuyên khi gập; chưa có corrective morph (cần asset từ Blender).
- Váy, đầm, áo dài chỉ là xấp xỉ; hai đùi có thể chạm vỏ khi bước dài. Không có mô phỏng vải.
- Họa tiết, chữ, ảnh tải lên trên trang phục chưa được dựng lên vỏ (chỉ màu theo vùng và độ nhám/kim loại theo chất liệu vùng chính; một vỏ dùng một chất liệu).
- Mũ chưa dựng. Phụ kiện (kính, dây chuyền, đồng hồ, tóc) và socket theo hình thể chưa thuộc phần đã làm; cần mesh và điểm gắn riêng.
- Chiều dài xương (chân, tay, cổ) không đổi được nên không có cập nhật skinning/attachment.
- Bộ nhớ GPU: mỗi geometry vỏ có texture morph riêng (khoảng 4 MB với 14 517 đỉnh x 18 morph); bộ đồ 5 món + da khoảng 25 MB, chia sẻ giữa các nhân vật cùng bộ. Chưa đo thực tế.
- Giao diện `WardrobeRoom` chưa chạy thử (chưa mở trong trình duyệt, chưa thử cảm ứng); logic bên dưới được test.

## Hình thể bằng xương (tay, chân, cổ, lưng)

GLB MPFB không có morph cho tay, chân, cổ, lưng, nên các thanh này đổi tỷ lệ xương (`src/avatar/boneShape.ts`), dùng chung skeleton 53 xương của cả `male_real`, `female_real`, `chibi`.

- Dữ liệu: `look.body.arms.{left,right}.length`, `legs.{left,right}.length`, `torso.neckLength`, `torso.back` (đã có sẵn trong look nên look cũ không cần đổi phiên bản; trường thiếu được `validate` đưa về 0 = không đổi).
- Dài tay/chân/cổ: scale trục dọc xương gốc đoạn (upperarm, thigh, neck_01), xương con kế thừa; bàn tay, bàn chân, đầu bù ngược (gần đúng với bàn chân và đầu vì hướng giãn không trùng hẳn một trục). Hệ số = 1 + 0,3 x trọng số (tay, chân; tối đa +-15%), 1 + 0,4 x trọng số (cổ; kẹp 0,7 đến 1,25). Cong lưng: xoay spine_01..03 quanh trục ngang, tổng +-0,2 rad (dương gù, âm ưỡn).
- Chân và cổ làm đổi chiều cao thật: `shapedHeightM` (tầm mắt camera, Player.tsx) và `footDrop` (mặt sàn và độ cao hông trong `MpfbAvatar`, IK chân đọc chiều dài xương từ ma trận mỗi khung nên theo). Cong lưng không đổi chiều cao (sai lệch khoảng 1 cm, bỏ qua).
- Vỏ trang phục, hình xăm, phụ kiện bám skeleton nên tự theo; kiểm trong `boneShape.vitest.test.ts` trên 3 GLB thật.
- UI: tab Hình thể, nhóm "Tay, chân, cổ, lưng", chỉ hiện khi `modelSupportsBoneShape`/`rigSupportsBoneShape` đúng.
- Chưa làm/hạn chế: bắp tay, cẳng tay, đùi, bắp chân, cỡ bàn tay/chân vẫn cần morph. Khi tay/chân bẻ khớp mạnh, kéo giãn theo trục xương cha gây méo nhẹ ở khuỷu/gối (biên độ giới hạn 15% để hạn chế). Chưa kiểm bằng mắt trên trình duyệt ngoài e2e.
