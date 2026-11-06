# AVATAR_SPEC: nhân vật 3D VRM cho gpb-tool

| Mục | Nội dung |
|---|---|
| Ngày | 2026-11-06 |
| Trạng thái | Đề xuất thiết kế. Chưa triển khai. |
| Phạm vi file | Chỉ tài liệu này. Không sửa `src/`, `services/`, `docker/`, `package.json`, `THIRD_PARTY.md`. |
| Ràng buộc phiên bản | three 0.169.0, @react-three/fiber 8.17.10, @react-three/drei 9.114.0 (theo `package.json`) |
| Thư viện avatar | @pixiv/three-vrm 3.5.5 (MIT) |

Cách đọc: các số về tam giác, đỉnh, draw call, kích thước file là ước tính để đặt ngưỡng. Chưa đo trong phiên này. Mục 11 liệt kê những gì chưa kiểm chứng.

## Hiện trạng repo

- Nhân vật hiện là capsule trong `src/scene/Player.tsx` (capsule bán kính 0.35, cao 0.9, đặt tại y = 0.9). Va chạm dùng `PLAYER_RADIUS` từ `src/scene/layout.ts`. Tốc độ `SPEED = 4`. Camera theo sau cách 10 m, cao 7 m.
- `docs/PROMPT_phong_CNTT.md` mục 8 đặt ngân sách: tổng asset tải lần đầu dưới 15 MB, dưới 150 draw call, tối đa 40 avatar cùng lúc trong một phòng, có LOD cho avatar ở xa.
- `THIRD_PARTY.md` chưa có asset avatar nào. `docs/OSS_REUSE.md` ghi @pixiv/three-vrm 3.5.5 ở mục "dự kiến dùng".

## Nguyên tắc chung

1. Mọi mesh, texture, animation phải là tài sản nguyên gốc của dự án, hoặc có nguồn và license ghi trong manifest (mục 9).
2. Không tạo nhân vật giống người thật. Không dùng ảnh người thật làm tham chiếu khi chưa có sự đồng ý.
3. Không gửi mesh hay texture qua mạng. Chỉ gửi id (mục 7).
4. Mỗi lựa chọn trong một lớp có id ổn định, để đồng bộ và cache.

## 0. Tóm tắt quyết định

| Hạng mục | Quyết định | Lý do |
|---|---|---|
| Định dạng | VRM 1.0 | Có humanoid, MToon, spring bone, expression chuẩn, hệ sinh thái VRoid |
| Thư viện | @pixiv/three-vrm 3.5.5, ghim chính xác | License MIT đã xác minh. Peer dependency `three >=0.137` |
| Nguồn mô hình | VRoid Studio cho thân, tóc, trang phục. Blender cho phụ kiện nhỏ | VRoid có sẵn tách bộ phận và xuất VRM. Phụ kiện nhỏ tách riêng để đổi không cần tải lại VRM |
| Cấu trúc file | Một VRM cho mỗi base body, chứa toàn bộ tóc và trang phục. Chọn bằng bật/tắt mesh | Nhiều người dùng chung ít file. Đổi kiểu không tải thêm |
| Phụ kiện | File GLB riêng (dưới 100 KB), gắn vào bone lúc chạy | Dùng chung và cache theo hash. Thêm phụ kiện không cần sửa VRM |
| Tóc | Shell (khối chính) + card (mái, tóc bay) + strip có spring bone (đuôi, tóc dài) | Cân bằng số đỉnh và độ đẹp |
| Da | MToon, shade color ấm, rim nhẹ | Chuẩn VRM. Kiểm soát bằng ΔE trên ba loại ánh sáng |
| Ngân sách | Bốn mức LOD, mức xa gộp thành một InstancedMesh | 40 avatar không thể mỗi người 10 draw call |

Ba điểm cần người dùng chốt:

1. **Ngân sách tải.** 8 MB mỗi nhân vật nhân 40 người là 320 MB, không khớp 15 MB tải lần đầu. Spec chỉ cho phép tối đa 2 base VRM đầy đủ, avatar xa dùng proxy hoặc placeholder (mục 1.6, 1.7). Cần chọn: nới ngân sách tải lần đầu, hoặc để avatar xa là placeholder.
2. **Draw call.** 40 avatar × 10 draw call vượt 150. Spec giới hạn LOD0 còn 4 avatar, phần xa gộp thành một draw call (mục 1.6). Con số cần đo.
3. **Giấy phép.** Yêu cầu ghi "VRM Public License 1.0 là license của three-vrm" không đúng. three-vrm là MIT (đã xác minh). VRM Public License 1.0 áp dụng cho từng file `.vrm` (mục 9).

---

## 1. Pipeline nhân vật

### 1.1 Nguồn mô hình gốc

| Tiêu chí | VRoid Studio | Blender + VRM add-on |
|---|---|---|
| Xuất VRM trực tiếp | Có | Cần add-on. License add-on chưa xác minh |
| Tóc, trang phục tách theo bộ phận | Có sẵn | Phải tự dựng từ đầu |
| MToon, spring bone, expression | Có sẵn khi xuất | Phải cấu hình từng cái |
| Tự do hình học | Hạn chế | Tự do |
| Chi phí | Miễn phí (theo PROMPT_phong_CNTT.md, điều khoản xem mục 9) | Blender là GPL theo PROMPT, chưa xác minh trong phiên |

Quyết định: VRoid Studio cho thân, mặt, tóc, áo, quần, giày. Blender cho phụ kiện nhỏ (cúc, ghim, khuy măng sét, đồng hồ, thẻ đeo), xuất GLB, không cần VRM.

### 1.2 Quy trình

1. Thiết kế trong VRoid Studio (bản Stable). Đặt tên nhân vật và điều khoản sử dụng trong metadata của file. Tác giả ghi là dự án. Điều khoản chi tiết ở mục 9.
2. Xuất VRM 1.0. Nếu xuất ra VRM 0.x, phải chuyển đổi trước khi đưa vào pipeline. Hàm `VRMUtils.rotateVRM0` có trong API reference (đã thấy trên trang tài liệu chính thức qua kết quả tìm kiếm, chưa chạy thử).
3. Kiểm tra đầu vào (mục 1.3). Đọc phần JSON của glTF để đếm, không cần render. Công cụ đề xuất: `gltf-transform inspect` (license chưa xác minh).
4. Tối ưu (mục 1.4).
5. Đóng gói: đặt tên file kèm hash nội dung, ví dụ `body-a.<sha8>.vrm`. Ghi bytes, sha256, số tam giác, số material, số texture vào manifest (mục 7.2).
6. Kiểm tra tự động (mục 8.1). Không đạt thì không xuất bản.
7. Đặt vào thư mục public của app hoặc CDN nội bộ. Cache lâu dài, nhờ hash trong tên file.

### 1.3 Kiểm tra đầu vào

| Hạng mục | Mục tiêu | Giới hạn cứng | Khi vượt |
|---|---|---|---|
| Phiên bản VRM | 1.0 (`VRMC_vrm.specVersion = "1.0"`) | Phải là 1.0 | Chuyển đổi, hoặc loại |
| Tam giác (toàn bộ, kể cả mesh ẩn) | ≤ 40.000 | 60.000 | Giảm card tóc, gộp mesh, decimate quần áo có kiểm tra bằng mắt |
| Đỉnh | ≤ 60.000 | 90.000 | Như trên |
| Số material (tổng) | ≤ 8 cho mỗi cấu hình | 12 | Gộp material cùng shader |
| Draw call ở cấu hình tối đa | ≤ 10 | 12 | Gộp mesh cùng material, tắt lớp không cần |
| Số file texture | ≤ 6 | 8 | Gộp atlas, giảm kích thước |
| Kích thước texture lớn nhất | 2048 cho mặt, 1024 cho thân, tóc, áo | 2048 | Resize |
| Bone (node skeleton) | ≤ 120 | 180 | Gỡ bone phụ. Giữ đủ bone bắt buộc của humanoid |
| Spring bone joint | ≤ 24 | 40 | Rút ngắn chuỗi |
| Expression (preset + custom) | ≤ 30 | 40 | Gộp custom |
| Kích thước file VRM sau nén | ≤ 6 MB | 8 MB | Nén KTX2, giảm texture |
| Material trong suốt (blend) | ≤ 2 | 3 | Chuyển sang alpha cutout (MASK) |
| Chiều cao | 1,55–1,80 m | 1,40–1,90 m | Chỉnh scale ở nguồn |
| Gốc toạ độ | Chân ở y = 0, tâm trước sau ở z = 0 | — | Căn lại ở nguồn |

Lưu ý: các mức tam giác trên là mục tiêu. Mô hình VRoid thật có thể vượt, cần đo khi có mô hình thật.

### 1.4 Tối ưu

- Gỡ bone không dùng, giữ đủ bone bắt buộc của humanoid VRM. Khi tải, gọi `VRMUtils.combineSkeletons` (API reference ghi là bước giảm số phép tính bone matrix mỗi khung). Lưu ý: nguồn thứ cấp và ví dụ `loader-plugin.html` trên nhánh dev dùng cách khác (`removeUnnecessaryVertices` + `removeUnnecessaryJoints`). Cần chốt một cách khi triển khai và đo lại.
- `VRMUtils.removeUnnecessaryVertices`: API reference mô tả là dọn morph texture thừa trên một số model (liên quan three.js issue 23095).
- Gộp mesh cùng material. Ví dụ: tất cả cúc áo và khuy trong một mesh, một material.
- Nén texture sang KTX2 (ETC1S cho màu, UASTC cho normal) qua `KHR_texture_basisu`. Cần `KTX2Loader` và transcoder (basis). Chưa xác minh trong phiên. Không nén thì một texture 2048 PNG có thể nặng vài MB, đây là nguyên nhân chính làm vượt 8 MB.
- Kích thước texture: mặt 2048, thân và tóc và áo 1024, phụ kiện 512.
- Xoá nội dung không dùng: material không gán, texture không dùng, expression rỗng.
- Giữ extension VRM: `VRMC_vrm`, `VRMC_springBone`, `VRMC_materials_mtoon`. Tên extension theo kiến thức chung, chưa đối chiếu lại trong phiên.
- Không decimate tự động quần áo mà không xem lại. Kiểm tra bằng mắt theo mục 8.2.
- Gộp atlas sau khi xuất từ VRoid là bước khó, vì VRoid tạo nhiều texture theo bộ phận. Dự kiến chấp nhận 6–8 texture, nén KTX2. Mục tiêu 4 atlas có thể không đạt. Đây là rủi ro (mục 11).

### 1.5 Tải trên web

```ts
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));
// Khi dùng texture KTX2: loader.setKTX2Loader(ktx2Loader)  (chưa xác minh trong phiên)

const gltf = await loader.loadAsync(url);   // url có hash trong tên file
const vrm: VRM = gltf.userData.vrm;
VRMUtils.combineSkeletons(gltf.scene);      // xem mục 1.4 về thứ tự gọi

// mỗi khung hình:
vrm.update(delta);

// khi rời phòng:
VRMUtils.deepDispose(gltf.scene);           // theo API reference, chưa chạy thử
```

Quy tắc tải:

- Mỗi base body chỉ tải mạng một lần. Cache theo hash trong bộ nhớ của trang. Không dùng localStorage cho file nhị phân.
- Nhiều avatar cùng base: cần chọn cách nhân bản. (a) Parse lại từ cùng một ArrayBuffer cho mỗi avatar, dùng chung texture object. (b) Clone scene bằng `SkeletonUtils.clone` và dựng lại trạng thái VRM (spring, expression) cho bản clone. Chưa xác minh cả hai. Chọn sau khi đo bộ nhớ GPU.
- Trong React Three Fiber có thể dùng `useLoader` kèm callback đăng ký plugin. Chưa xác minh trong phiên.
- Lỗi tải (404, hash sai, file hỏng): hiện capsule hoặc placeholder LOD3 thay vì bỏ trống. Ghi lỗi vào console có mã id.

### 1.6 Ngân sách LOD

Camera theo sau cách 10 m nên người chơi hiện tại không được rơi xuống LOD1 dù đứng xa camera hơn.

| Mức | Điều kiện chọn | Tam giác tối đa | Material tối đa | Draw call tối đa | Đổ bóng | Spring bone | Expression | Cập nhật animation |
|---|---|---|---|---|---|---|---|---|
| LOD0 | Chính người chơi, hoặc cách camera ≤ 6 m. Tối đa 4 avatar | 40.000 | 8 | 10 | Tối đa 2 avatar gần nhất | Đủ | Đủ | 60 Hz |
| LOD1 | 6–14 m. Tối đa 8 avatar | 15.000 | 4 | 5 | Không | Một nửa số chuỗi | Chớp, happy, aa | 30 Hz |
| LOD2 | 14–30 m. Tối đa 8 avatar | 5.000 | 1 | 1 | Không | Không | Chớp | 15 Hz |
| LOD3 | Trên 30 m, hoặc vượt hạn mức | Placeholder ≤ 500 tam giác, một InstancedMesh cho tất cả | 1 | 1 cho tất cả | Không | Không | Không | Không |

Quy tắc:

- LOD2 dùng một VRM proxy riêng cho mỗi base body: cùng humanoid, ≤ 5.000 tam giác, một material có vertex color (màu da, tóc, áo, quần, giày tô bằng đỉnh). Tệp proxy ≤ 1,5 MB.
- LOD3 là khối thấp đa giác tô màu theo áo, gộp vào một `InstancedMesh`. Mức này dùng cho avatar ở xa và phần vượt hạn mức.
- Ví dụ ngân sách một phòng: 4 × 10 + 8 × 5 + 8 × 1 + 1 = 89 draw call cho avatar. Phần còn lại (phòng, nội thất, UI) còn khoảng 61. Con số là ước tính. Cần đo.
- Bóng: mỗi avatar đổ bóng cộng thêm draw call trong pass bóng. Tính vào ngân sách khi đo.
- Hạn mức LOD0 là tham số có thể điều chỉnh. Nếu đo thấy quá chặt, giảm xuống 3 avatar.

### 1.7 Ngân sách tải

| Thành phần | Ngân sách | Tải khi nào |
|---|---|---|
| Phòng, nội thất, UI (không tính avatar) | Phần còn lại trong 15 MB | Lần đầu |
| Base body 1 (VRM đầy đủ) | ≤ 6 MB (giới hạn cứng 8 MB) | Lần đầu, vì người dùng cần thấy mình |
| Base body 2 (VRM đầy đủ) | ≤ 6 MB | Khi có người dùng trong phòng dùng base này |
| Proxy LOD2 của mỗi base | ≤ 1,5 MB | Khi có avatar ở LOD2 |
| Phụ kiện GLB | ≤ 100 KB mỗi file | Khi người dùng chọn |
| Placeholder LOD3 | ≤ 50 KB | Lần đầu |

Nếu phòng và nội thất dùng dưới 8 MB, tổng lần đầu vừa 15 MB. Nếu lớn hơn, tải base body 1 sau khi phòng đã hiện (lazy). Đây là quyết định cần chốt (mục 0).

---

## 2. Hệ thống tuỳ biến

### 2.1 Phân lớp

| Lớp | Nơi nằm | Ghi chú |
|---|---|---|
| `body` | Trong VRM của base | Da, cơ thể. Có nhiều tông |
| `face` | Trong VRM | Mặt, mắt, miệng. Biểu cảm gắn vào đây |
| `hair` | Trong VRM | Nhiều mesh, mỗi kiểu tóc một nhóm |
| `shirt`, `vest`, `bottom`, `shoes` | Trong VRM | Trang phục theo bộ phận |
| `acc` | GLB chạy lúc chạy, gắn vào bone | Kính, đồng hồ, cúc, ghim, cà vạt, nơ, khăn, thẻ, dây |
| `theme` | JSON preset | Tổ hợp id và màu |

Quy tắc đặt tên node trong VRM: `<lớp>.<id>`, ví dụ `hair.H01`, `shirt.white`, `vest.navy`. Tên ổn định để tra cứu theo id.

### 2.2 Cách đổi và chi phí

| Lớp | Cách đổi | Tải thêm | Chi phí render | Lựa chọn bước 1 | Lựa chọn đầy đủ |
|---|---|---|---|---|---|
| Da (thân) | Đổi màu hoặc texture MToon (mục 4) | Không | Không thêm draw | 6 tông | 6 tông × 2 dáng thân |
| Mặt | Đổi texture mặt, bật expression | Không | Không thêm draw | 2 mặt | 4 mặt |
| Màu mắt | Đổi material mắt | Không | Không thêm draw | 3 màu | 6 màu |
| Tóc | Bật/tắt mesh kiểu tóc, đổi màu material | Không | Chỉ kiểu đang bật | 3 kiểu (H01, H03, H05) × 4 màu | 10 kiểu × 6 màu |
| Áo sơ mi | Bật/tắt mesh, đổi material | Không | 1 draw | 2 màu (trắng, xanh nhạt) | 6 kiểu |
| Vest | Bật/tắt mesh, đổi material | Không | 1 draw | 2 màu (navy, xám) | 4 kiểu |
| Quần, váy | Bật/tắt mesh | Không | 1 draw | Quần tây | Quần tây, kaki, váy bút chì, váy xếp ly |
| Giày | Bật/tắt mesh | Không | 1 draw | Oxford | 3 kiểu |
| Phụ kiện | GLB runtime, gắn vào bone | ≤ 100 KB mỗi file | 1 draw mỗi cái | Kính, đồng hồ, thẻ đeo | 15 mục (mục 5) |
| Chủ đề | Preset JSON | Không | Theo các lớp | 2 chủ đề | 3–5 chủ đề |

Bước 1 có "2 trang phục" là hai bộ: công sở A (sơ mi trắng, vest navy, quần tây, giày oxford) và công sở B (sơ mi xanh nhạt, vest xám, quần tây, giày oxford).

### 2.3 Quy tắc đổi lớp lúc chạy

1. Bật/tắt bằng `object.visible`. Không tải lại file, không đổi skeleton.
2. Đổi material chỉ được dùng texture đã nạp sẵn. Không tạo texture mới trong vòng lặp render.
3. Phụ kiện gắn và gỡ bằng đổi parent (`bone.add`, `remove`). Không tạo mesh mới mỗi lần.
4. Mỗi lần đổi, cập nhật appearance state một lần, không đổi từng khung hình.
5. Lớp không tồn tại trong VRM (ví dụ kiểu tóc chưa có) thì bỏ qua và ghi log, không crash.

### 2.4 Chủ đề

Chủ đề là một preset JSON: tổ hợp id lớp và màu. Ví dụ:

- `office-a`: sơ mi trắng, vest navy, quần tây, giày oxford, kính tròn, đồng hồ bạc, thẻ đeo.
- `office-b`: sơ mi xanh nhạt, vest xám, cà vạt, đồng hồ đen, thẻ đeo đội.
- `duty-night`: áo polo, quần kaki, khăn quàng mỏng, thẻ đeo. Chủ đề trực đêm. Đây chỉ là gợi ý, chưa chốt.

Người dùng chọn chủ đề, sau đó có thể sửa từng lớp.

---

## 3. Tóc

### 3.1 Ba kỹ thuật

| Kỹ thuật | Mô tả | Tam giác (ước tính) | Đỉnh (ước tính) | Material | Spring joint | Ghi chú |
|---|---|---|---|---|---|---|
| Shell (khối vỏ) | Lưới kín ôm đầu, có texture tóc | 1.500–4.000 | 900–2.500 | 1 | 0 | Rẻ nhất cho tóc ngắn, có khối rõ. Đường chân tóc phải căn kỹ |
| Card (mảng alpha) | Mỗi cụm sợi là một quad có alpha | 600–2.400 (300–1.200 card) | 1.200–4.800 khi không chia đỉnh | 1 (alpha cutout) | 0 | Đẹp cho tóc mái, tóc bay. Răng cưa ở cạnh. Dùng MASK tránh sắp xếp trong suốt |
| Strip (dải) | Dải nhiều đoạn, skinned theo bone tóc | 2.000–6.000 | 2.000–6.000 | 1 | 4–16 (theo chuỗi) | Tóc dài, đuôi ngựa. Có thể đong đưa theo spring |
| Spring bone | Vật lý CPU trên chuỗi bone, có collider | Không tính tam giác | Không tính đỉnh | — | Là chính nó | Chi phí theo số joint mỗi khung |

Chưa xác minh: spring bone của kiểu tóc đang bị ẩn có vẫn được tính mỗi khung không. Nếu có, phải tắt chuỗi của kiểu bị ẩn. Cần kiểm tra với three-vrm 3.5.5.

### 3.2 Khuyến nghị kết hợp

- Shell làm khối chính (một material).
- Card cho tóc mái và tóc bay (một material riêng, MASK).
- Strip có spring cho đuôi và tóc dài.
- Mỗi kiểu tóc tối đa 3 material.

Hạn mức tóc theo mức:

| Mức | Thành phần | Tam giác tối đa | Spring joint tối đa |
|---|---|---|---|
| LOD0 | Shell, card, strip | 7.000 | 8 |
| LOD1 | Shell, strip (không card) | 2.500 | 4 |
| LOD2 (proxy) | Không có mesh tóc riêng. Màu tóc qua vertex color | 0 | 0 |

### 3.3 Mười kiểu tóc

Bước 1 lấy H01, H03, H05.

| Mã | Kiểu | Kỹ thuật | Tam giác LOD0 | Spring joint | Bước |
|---|---|---|---|---|---|
| H01 | Ngắn gọn, rẽ ngôi | Shell + card mái | 2.500–3.500 | 0 | 1 |
| H02 | Ngắn vuốt ngược | Shell | 1.500–2.500 | 0 | 2 |
| H03 | Bob ngang vai | Shell + strip + spring | 3.500–5.000 | 4 | 1 |
| H04 | Bob ngắn đến cằm | Shell + strip + spring | 3.000–4.000 | 2 | 2 |
| H05 | Đuôi ngựa cao | Shell + strip đuôi + spring | 4.000–5.500 | 6 | 1 |
| H06 | Búi cao | Shell + card + spring | 3.000–4.000 | 2 | 2 |
| H07 | Mái ngang, tóc ngắn | Shell + card mái | 2.000–3.000 | 0 | 2 |
| H08 | Xoăn ngắn | Card nhiều (1.000–1.500 card) | 2.000–3.000 | 0 | 2 |
| H09 | Dài thẳng | Shell + strip + spring | 5.000–6.500 | 8 | 3 |
| H10 | Dài uốn sóng | Shell + strip + spring | 5.500–7.000 | 8 | 3 |

### 3.4 Kiểm chứng tóc

- Tóc không xuyên cổ và vai ở tư thế đầu nghiêng 30 độ và cúi 20 độ.
- Spring không rung (biên độ dao động dừng trong 2 giây sau khi đứng yên).
- Số joint thực tế khớp với bảng trên. Kiểm bằng cách đếm trong JSON.

---

## 4. Da

### 4.1 Sáu tông

Giá trị hex là điểm khởi đầu, cần hiệu chỉnh bằng so sánh ảnh (mục 8.2). Giá trị đã chọn để L* không quá cao, tránh cảm giác trắng bệch.

| Mã | Tên | Albedo khởi đầu (sRGB) | Shade gợi ý |
|---|---|---|---|
| S1 | Rất sáng | #F5D3BC | Ấm, hơi đỏ, tối hơn 25% |
| S2 | Sáng | #EBBE9C | Ấm, hơi cam |
| S3 | Trung bình sáng | #DBA27C | Ấm |
| S4 | Trung bình | #C4875E | Ấm, bão hoà hơn |
| S5 | Nâu | #9A6341 | Đỏ nâu |
| S6 | Sẫm | #683F27 | Đỏ nâu, tối hơn |

### 4.2 Vật liệu

- Mặc định dùng MToon (chuẩn VRM). Tên tham số theo VRMC_materials_mtoon, chưa đối chiếu lại: `shadeColorFactor`, `shadingToonyFactor`, `shadingShiftFactor`, `rimLightingMixFactor`, `parametricRimColorFactor`.
- Shade color lấy từ màu da, dịch về đỏ hoặc cam, tăng bão hoà 10–20%, giảm sáng 20–30%. Không dùng xám làm shade.
- Rim trên da ở mức thấp (0,1–0,2), màu ấm.
- Bước 3 có thể thử MeshPhysicalMaterial với albedo, normal, roughness, và sheen rất thấp ấm để gợi lớp tơ da. Hiệu quả chưa biết.

### 4.3 "Giả subsurface"

Đây không phải subsurface scattering thật. Ba cách xấp xỉ:

1. Shade ấm: vùng tối có sắc đỏ, gợi ánh sáng xuyên qua mô.
2. Rim ấm nhẹ ở cạnh, không mạnh.
3. Nếu chọn đường standard, dùng sheen ấm rất thấp.

Không gọi kết quả là SSS trong tài liệu hay trong UI.

### 4.4 Chống tẩy trắng dưới đèn văn phòng

Nguyên nhân thường gặp: ánh sáng trắng cường độ cao, ambient lớn, shade lấy màu xám, tone mapping làm sáng quá.

Quy tắc:

- L* của albedo (CIELAB) không vượt 88 cho bất kỳ tông nào.
- Key light cường độ ≤ 1,0 (tuỳ scene). Ambient và hemisphere tổng ≤ 0,6.
- Tone mapping bật. Chọn ACESFilmic hoặc Neutral. Tên hằng trong three 0.169 chưa xác minh.
- Shade không lấy từ màu đèn trắng.
- Kiểm bằng ba loại ánh sáng ở mục 4.5.

### 4.5 Kiểm chứng ba loại ánh sáng

| Tên | Màu đèn xấp xỉ (sRGB, ước tính) | Mục đích |
|---|---|---|
| Trắng 4000K | Key ≈ #FFD1A3 | Kiểm tra tẩy trắng |
| Vàng 2700K | Key ≈ #FFA757 | Kiểm tra da bị ấm quá |
| Neon | Hai nguồn #FF2BD6 và #00E5FF | Kiểm tra màu bị lệch khi màu đèn bão hoà |

Giá trị này là xấp xỉ theo bảng nhiệt độ màu. Chưa đo bằng thiết bị. Cần hiệu chỉnh bằng ảnh tham chiếu có thẻ màu chuẩn.

Tiêu chí đạt (chi tiết ở mục 8.2):

- ΔE2000 trung bình trên vùng da ≤ 4 so với tham chiếu, dưới cùng ánh sáng.
- L* vùng da lệch không quá 6 so với tham chiếu.
- Tẩy trắng: L* render lớn hơn L* gốc quá 8, hoặc chroma giảm quá 30%. Đây là lỗi.

---

## 5. Trang phục và phụ kiện

### 5.1 Bảng mục

Đỉnh tối đa là ước tính khoảng 1,6 lần tam giác. Kích thước là kích thước hiển thị trên nhân vật cao 1,7 m.

| Mục | Kích thước tối thiểu hoặc đường kính | Tam giác tối đa | Đỉnh tối đa | Bone gắn | Cách gắn | Ghi chú |
|---|---|---|---|---|---|---|
| Áo sơ mi (thân, tay) | Theo cơ thể | 6.000 | 9.600 | Theo skin | Trong VRM | Cổ đứng hoặc cổ bẻ. Cúc là mesh riêng (mục 5.2) |
| Cúc áo sơ mi | Ø 8 mm, dày 2 mm | 96 mỗi cúc, ≤ 800 tổng cho 8 cúc | 63 mỗi cúc (sphere 8 × 6) | spine (hoặc chest nếu có) | Mesh gộp, một material, GLB runtime | 6 cúc thân, số có thể đổi theo kiểu |
| Vest | Theo cơ thể | 6.000 | 9.600 | Theo skin | Trong VRM | Cúc vest là 2 mesh |
| Váy | Dài tới gối | 4.000 | 6.400 | Theo skin, gốc hips | Trong VRM | Spring 2–4 ở viền |
| Quần tây | Theo cơ thể | 3.000 | 4.800 | Theo skin | Trong VRM | — |
| Giày (mỗi chiếc) | Theo bàn chân | 1.500 | 2.400 | foot | Trong VRM | Đế không xuyên sàn: y ≥ 0 |
| Thắt lưng | Rộng 30–35 mm | 600 | 1.000 | hips | Trong VRM, hoặc GLB | Khoá là mesh nhỏ riêng |
| Cà vạt | Rộng nút 40–50 mm, dài hiển thị 350–450 mm | 500 | 800 | spine hoặc chest | GLB runtime | Spring 2. Một material |
| Nơ bướm | Rộng 60–80 mm | 300 | 480 | neck | GLB runtime | — |
| Khăn quàng | Rộng 120–150 mm, dài 700–900 mm | 1.500 | 2.400 | neck | GLB runtime | Spring 4. Tuỳ chọn bước 2 |
| Kính | Gọng rộng 130–140 mm, tròng Ø 40–48 mm | 1.000 (gọng 800, tròng 200) | 1.600 | head, sát mắt | GLB runtime | Tròng là material blend duy nhất. Không đổ bóng |
| Đồng hồ | Mặt Ø 35–40 mm, dây rộng 18–20 mm | 400 | 640 | hand, cổ tay trái | GLB runtime | — |
| Khuy măng sét (mỗi cái) | Ø 10 mm | 96 | 63 | hand, cổ tay | GLB runtime | Hai cái, một mỗi cổ tay |
| Bảng tên (đế) | 60 × 20 mm | 100 | 160 | chest | GLB runtime + HTML overlay cho chữ | Chữ không vẽ vào texture (mục 5.3) |
| Thẻ đeo | 54 × 86 mm | 200 | 320 | chest, treo từ dây | GLB runtime | Một material. Chữ bằng 2–3 mẫu atlas |
| Dây treo thẻ | Rộng 10–12 mm, dài 450 mm | 200 | 320 | neck đến chest | GLB runtime | Ống 6 cạnh, 12 đoạn. Spring 2 |
| Ghim cài áo | Ø 12–15 mm, cao 8 mm | 120 | 200 | chest, phía ngực trái | GLB runtime | Ước tính đặt cách tâm thân khoảng 50–70 mm về phía tay trái của nhân vật, cao hơn cúc trên cùng khoảng 40 mm. Chỉnh theo mô hình |

### 5.2 Cúc và khuy: số lượng và vị trí

- Cúc thân sơ mi: 6 cái, cùng x (sai lệch ≤ 1 mm), khoảng cách liên tiếp 45–55 mm (sai lệch ≤ 3 mm). Cúc đầu cách cổ áo khoảng 30 mm.
- Cúc vest: 2 cái.
- Khuy măng sét: 2 cái, một mỗi cổ tay.
- Mỗi cúc nằm sát bề mặt thân: cách 1–2 mm, không xuyên sâu hơn 2 mm, không lơ lửng quá 5 mm.
- Kiểm tự động: đếm mesh có tiền tố `btn.`, so số lượng với cấu hình. Kiểm vị trí bằng hộp bao (bounding box) giao với thân.
- Kiểm bằng mắt: cúc có thẳng hàng không, khi đi và khi đứng.

### 5.3 Chữ trên bảng tên và thẻ

- Chữ không vẽ vào texture riêng cho từng người. Chữ hiển thị bằng HTML overlay (ví dụ `Html` của drei) bám theo vị trí đầu nhân vật. Mesh bảng chỉ là đế.
- Cỡ chữ tối thiểu 14 px, theo PROMPT_phong_CNTT.md mục 4 (chữ tiếng Việt có dấu).
- Thẻ đeo: chữ tên dùng HTML overlay. Chỉ dùng texture atlas cho logo đội (2–3 mẫu, không chứa tên người).

---

## 6. Biểu cảm và chuyển động

### 6.1 Biểu cảm

Danh sách preset VRM 1.0 đã đối chiếu với đặc tả trên GitHub (`specification/VRMC_vrm-1.0/expressions.md`): happy, angry, sad, relaxed, surprised, aa, ih, ou, ee, oh, blink, blinkLeft, blinkRight, lookUp, lookDown, lookLeft, lookRight, neutral. Custom expression được hỗ trợ và không được trùng tên preset. VRM 1.0 không có preset lông mày.

| Biểu cảm | Tên | Giá trị | Dùng cho |
|---|---|---|---|
| Chớp mắt | `blink`, hoặc `blinkLeft` và `blinkRight` | 0–1 | Chớp định kỳ 3–6 giây, mỗi lần 0,12 giây |
| Cười | `happy` | 0,3–0,8 | Chào hỏi, tương tác |
| Buồn | `sad` | 0–0,6 | Trạng thái cảm xúc |
| Ngạc nhiên | `surprised` | 0–1 | Sự kiện |
| Giận | `angry` | 0–0,6 | Sự kiện |
| Nhìn | `lookLeft`, `lookRight`, `lookUp`, `lookDown` | — | Nhìn theo mục tiêu (lookAt) |
| Miệng khi nói (tuỳ chọn) | `aa`, `ih`, `ou`, `ee`, `oh` | 0–1 | Lip-sync khi có voice, bước 3 |
| Lông mày | Custom: `browUp`, `browDown`, `browInnerUp` | 0–1 | Không có preset |
| Trung tính | `neutral` | — | Dự phòng |

### 6.2 Animation

| Clip | Thời lượng | Lặp | Nguồn đề xuất | Bước |
|---|---|---|---|---|
| Idle (thở, đổi trọng, chớp, nhìn theo) | 6–8 giây | Có | Procedural trong code (mục 6.3 B) | 1 |
| Walk (đi bộ) | Chu kỳ 0,8–1,0 giây | Có | Procedural, đong đưa theo tốc độ | 1 |
| Wave (vẫy tay) | 1,5–2,0 giây | Một lần | Tự làm, VRMA (mục 6.3 A) | 3 |
| Dance (nhảy) | 4–8 giây | Có | Tự làm, VRMA (mục 6.3 A) | 3 |

### 6.3 Nguồn animation

**A. Tự làm và xuất VRMA (khuyến nghị).** Keyframe trong Blender hoặc công cụ VRM animation, xuất VRMA. Đọc bằng `@pixiv/three-vrm-animation`. Package tồn tại, README không nêu license (mục 9). Chưa xác minh tên API loader và hàm tạo clip trong phiên.

**B. Procedural trong code.** Thở, đổi trọng, nhìn theo mục tiêu, đong đưa tay theo tốc độ. Không có asset, không có rủi ro license. Dùng cho idle và walk bước 1.

**C. Mixamo (Adobe).** Không đề xuất làm nguồn chính:

- Kết quả tìm kiếm cho thấy FAQ chính thức nói nhân vật và animation dùng được thương mại, gồm game. Trang FAQ trả 403 khi đọc trực tiếp, nên chưa đối chiếu nguyên văn.
- Các bài cộng đồng nêu rủi ro: cấm phân phối file thô (FBX, animation). Trong web app, clip đóng gói vào bundle có thể bị coi là phân phối file thô.
- Adobe có thể đổi điều khoản.
- Nếu vẫn dùng: retarget sang VRM của dự án, không dùng nhân vật Mixamo. Ghi phiên bản điều khoản đã đọc vào manifest. Không tải file thô vào repo công khai.

**D. Thư viện CC0.** Kiểm tra từng gói. Chưa xác minh gói nào có clip người chuyển động dưới CC0.

### 6.4 Chuyển cảnh

- Idle và walk đổi theo tốc độ: walk khi |v| > 0,1 m/s, idle khi thấp hơn. Crossfade 0,2–0,3 giây.
- Tốc độ phát của walk: `clamp(|v| / SPEED, 0.6, 1.4)`, với `SPEED = 4` từ `Player.tsx`.
- Wave và dance: một lần hoặc lặp theo sự kiện. Khi dance, khoá di chuyển.
- Đổi chủ đề không reset animation.

---

## 7. Đồng bộ đa người chơi

### 7.1 Dữ liệu avatar

Ví dụ JSON, khoảng 300–500 byte:

```json
{
  "v": 1,
  "body": "body-a",
  "skin": "S3",
  "face": "face-01",
  "eyes": "eye-03",
  "hair": { "style": "H03", "color": "#3B2A1F" },
  "shirt": "shirt-white",
  "vest": "vest-navy",
  "bottom": "pants-tailored",
  "shoes": "shoes-oxford-01",
  "acc": ["glasses-round-01", "watch-silver-01", "badge-std-01"],
  "theme": "office-a"
}
```

Quy tắc kiểm tra phía server (khi triển khai):

- Mọi id phải có trong manifest. Id lạ bị từ chối, trả về mặc định.
- Màu khớp `^#[0-9A-Fa-f]{6}$`.
- Số phụ kiện tối đa 6.
- Kích thước JSON tối đa 1 KB.
- Thay đổi appearance tối đa 1 lần mỗi 5 giây cho mỗi người dùng.

### 7.2 Manifest

Manifest liệt kê mọi tài sản, do build tạo ra:

```json
{
  "id": "hair.H03",
  "kind": "hair",
  "file": "bodies/body-a.<sha8>.vrm",
  "node": "hair.H03",
  "sha256": "<đầy đủ>",
  "bytes": 0,
  "license": "project-original",
  "source": "VRoid Studio, tự tạo"
}
```

Phụ kiện GLB có `file` trỏ tới GLB riêng. Mỗi tài sản có trường `license` và `source`. Đây là nguồn để cập nhật THIRD_PARTY.md sau này.

### 7.3 Luồng

1. Người dùng vào phòng: nhận danh sách appearance JSON của người khác.
2. Mỗi base body tải một lần, cache theo hash.
3. Dựng avatar: bật các lớp theo JSON, gắn phụ kiện theo id.
4. Khi người khác đổi appearance: nhận JSON mới, cập nhật lớp thay đổi. Không tải lại toàn bộ.
5. Presence (vị trí, hướng) đi kênh riêng, không gửi kèm appearance.
6. Thiếu manifest hoặc id lạ: hiện mặc định, ghi log, không dừng.

### 7.4 Không gửi mesh

Không gửi mesh hay texture qua socket. Chỉ gửi id và màu. Mọi tài sản lấy từ HTTP có cache.

---

## 8. Tiêu chí kiểm chứng

### 8.1 Tự động

Chạy ở bước build hoặc test, không chạy trong phiên này.

| Kiểm tra | Cách đo | Ngưỡng | Khi lỗi |
|---|---|---|---|
| Tam giác, đỉnh | Đọc JSON glTF và cộng số phần tử | Theo mục 1.3 | Không xuất bản |
| Số material, texture | Đếm trong JSON | Theo mục 1.3 | Gộp hoặc giảm |
| Kích thước texture lớn nhất | Đọc header ảnh | ≤ 2048 | Resize |
| Kích thước file | Đo bytes | ≤ 6 MB (cứng 8 MB) | Nén KTX2 |
| Bone bắt buộc | Kiểm humanoid | Đủ | Không xuất bản |
| Spring joint, expression | Đếm | Theo mục 1.3 | Rút gọn |
| Material trong suốt | Đếm BLEND | ≤ 2 (LOD0) | Chuyển MASK |
| Draw call theo cấu hình và LOD | `renderer.info.render.calls` trên scene thử | Theo mục 1.6 | Gộp mesh, giảm LOD |
| Chân và chiều cao | Hộp bao | Chân y ∈ [0; 0,01]. Cao 1,4–1,9 m | Căn lại |
| Số cúc và vị trí | Đếm `btn.*` và đo khoảng cách | Theo mục 5.2 | Sửa nguồn |
| License metadata | Đọc `VRMC_vrm` | Có trường license, không để trống, tác giả là dự án | Không xuất bản |
| Thời gian nạp đến lần vẽ đầu | Đo trên máy tham chiếu | ≤ 2 s (ước tính, chưa đo) | Giảm kích thước |
| FPS với 40 avatar | Đo trên máy tham chiếu | ≥ 45 FPS (ước tính, chưa đo) | Điều chỉnh LOD |

Máy tham chiếu chưa định nghĩa. Cần chọn một máy văn phòng cấu hình thấp để làm chuẩn.

### 8.2 Thị giác

Bộ ảnh mẫu:

- 6 tông da × 3 loại ánh sáng = 18 ảnh.
- 2 bộ trang phục × 3 loại ánh sáng = 6 ảnh.
- 3 kiểu tóc × 1 loại ánh sáng = 3 ảnh.

Cài đặt chụp: camera cố định, pose đứng thẳng, nền xám trung tính 18%, độ phân giải 1024 × 1024. Chụp bằng headless browser (ví dụ Playwright). Chưa dùng trong phiên này.

So sánh:

- Da: ΔE2000 trung bình ≤ 4 so với tham chiếu. Tham chiếu là tấm màu da chuẩn hoặc bảng màu có thẻ màu, chụp dưới cùng ánh sáng. Không dùng ảnh người thật chưa có sự đồng ý.
- Hồi quy: SSIM ≥ 0,95 giữa các commit cho khung cố định.

Checklist kiểm bằng mắt (đạt hoặc không đạt):

- [ ] Cúc đủ số lượng và thẳng hàng.
- [ ] Ghim nằm phía ngực trái, không xuyên áo.
- [ ] Kính không xuyên mũi hoặc mắt.
- [ ] Dây treo thẻ không xuyên thân khi đứng và khi đi.
- [ ] Tóc không xuyên cổ và vai ở đầu nghiêng 30 độ.
- [ ] Giày không xuyên sàn, không lơ lửng.
- [ ] Khăn và cà vạt không xuyên bụng khi đi.
- [ ] Mắt chớp đồng đều hai bên.
- [ ] Sáu tông da phân biệt được dưới đèn neon.
- [ ] Chi tiết vải trắng không mất dưới 4000K.

---

## 9. Giấy phép

Trạng thái: "Đã xác minh" nghĩa là đã đọc nguồn trong phiên này. "Đã xác minh một phần" nghĩa là chỉ đọc được tóm tắt hoặc kết quả tìm kiếm. "Chưa xác minh" nghĩa là chưa đọc được nguồn chính thức.

| Mục | Nội dung | Trạng thái | Nguồn và ghi chú |
|---|---|---|---|
| @pixiv/three-vrm | MIT, Copyright (c) 2019–2026 pixiv Inc. | Đã xác minh | LICENSE trên nhánh `dev` của GitHub pixiv/three-vrm. Chưa đối chiếu tag 3.5.5 cụ thể |
| @pixiv/three-vrm 3.5.5 và three 0.169 | Peer dependency `three >=0.137`. devDependency `three ^0.180.0` | Đã xác minh khai báo. Chưa chạy thử | `packages/three-vrm/package.json` nhánh `dev`. Chưa cài trong phiên |
| VRM Public License 1.0 | Giấy phép riêng cho file VRM, ban hành 05/08/2021. Không phải MIT. Quyền thương mại, phân phối, chỉnh sửa do Licensor bật trong cài đặt từng file. Có ràng buộc về avatar (ví dụ giới hạn người được biểu diễn, giới hạn nội dung bạo lực, tình dục nếu Licensor bật) | Đã xác minh một phần. Đọc tóm tắt, chưa đọc toàn văn | https://vrm.dev/en/licenses/1.0/index.html. Áp dụng cho từng file `.vrm`, không cho thư viện |
| Đặc tả VRM 1.0 (vrm-c/vrm-specification) | Preset expression đã xác minh. License của repo đặc tả chưa xác minh (đường dẫn LICENSE.md trả 404) | Một phần | `specification/VRMC_vrm-1.0/expressions.md` |
| VRoid Studio | Model tự làm bản Stable có thể dùng thương mại theo trang trợ giúp pixiv. Tác giả đặt điều khoản riêng cho từng model. Texture hoặc mẫu mua theo điều khoản bên cung cấp. Ứng dụng tạo avatar từ mesh VRoid cần giấy phép riêng, trừ khi chỉ dùng cá nhân | Đã xác minh một phần, từ kết quả tìm kiếm. Trang trợ giúp và Terms trả 403 | Trợ giúp: "Can I use the models created with VRoid Studio Stable Ver. for commercial purposes?". Bản EULA trên Steam (2018) mâu thuẫn một phần, không dùng làm căn cứ |
| Model VRoid Hub của người khác | — | Chưa xác minh | Trong bước 1 không dùng. Chỉ dùng khi đọc được điều khoản từng file và ghi vào manifest |
| Mixamo (Adobe) | Theo kết quả tìm kiếm, FAQ chính thức nói dùng thương mại được, gồm game. Cộng đồng nêu cấm phân phối file thô. Điều khoản có thể đổi | Chưa xác minh nguyên văn | https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html trả 403. Không dùng làm nguồn chính (mục 6.3 C) |
| @pixiv/three-vrm-animation (VRMA) | Package có tồn tại. README không nêu license | Chưa xác minh license | https://raw.githubusercontent.com/pixiv/three-vrm/dev/packages/three-vrm-animation/README.md |
| three.js 0.169.0 | MIT | Đã ghi trong THIRD_PARTY.md từ phiên trước. Không kiểm lại trong phiên này | THIRD_PARTY.md |
| VRM add-on cho Blender | — | Chưa xác minh | Kiểm trước khi dùng |
| Blender | GPL theo PROMPT_phong_CNTT.md, chỉ là công cụ | Chưa xác minh trong phiên | docs/PROMPT_phong_CNTT.md mục 4 |
| Công cụ nén (gltf-transform, KTX-Software toktx) | Chưa xác minh (theo kiến thức chung: MIT và Apache-2.0) | Chưa xác minh | Kiểm trước khi đưa vào pipeline |
| Asset bên thứ ba (texture, phụ kiện, animation CC0) | Chưa có | Chưa xác minh | Mỗi file ghi nguồn, tác giả, license, URL, ngày tải. Ghi vào manifest và THIRD_PARTY.md |
| Quy tắc nguyên gốc | Mọi nhân vật do dự án tạo. Metadata tác giả ghi dự án. Không có tên hoặc ảnh người thật | Quy tắc nội bộ | — |

Khuyến nghị cài đặt VRM cho model của dự án: đặt phân phối lại (redistribution) là không cho phép, để không ai lấy model đi dùng. Quyền thương mại theo chính sách công ty, ghi rõ trong metadata.

---

## 10. Lộ trình

### Bước 1: nhân vật cơ bản

- 1 base body, 6 tông da, 2 mặt, 3 màu mắt.
- 2 bộ trang phục: công sở A và công sở B (mục 2.2).
- 3 kiểu tóc: H01, H03, H05.
- 3 phụ kiện GLB: kính, đồng hồ, thẻ đeo.
- Idle và walk procedural. Biểu cảm chớp và happy.
- Nạp theo id, appearance JSON (mục 7). Tối đa 4 avatar LOD0, một người dùng chính.
- Đạt mục 8.1 cho LOD0 và LOD2 (proxy có thể tạm bỏ qua nếu chưa làm).
- Đạt checklist mục 8.2 với 2 trang phục × 3 kiểu tóc, và bộ ảnh 6 tông × 3 ánh sáng.

Tiêu chí dừng: toàn bộ checklist 8.2 đạt và đo được FPS trên máy tham chiếu.

### Bước 2: tuỳ biến đầy đủ

- 2 base body. 10 kiểu tóc, 6 màu tóc.
- 6 áo sơ mi, 4 vest, 4 quần hoặc váy, 3 giày.
- 15 phụ kiện theo mục 5, gồm cúc, ghim, khuy măng sét, cà vạt, nơ, khăn, dây treo thẻ.
- 3–5 chủ đề.
- LOD1, LOD2 (proxy), LOD3 (InstancedMesh).
- Manifest, hash, cache. Kiểm tự động trong CI.

### Bước 3: chuyển động và biểu cảm

- Clip wave và dance (VRMA tự làm).
- Lông mày custom. Lip-sync (tuỳ chọn).
- Nhìn theo mục tiêu. Crossfade giữa các state.
- Đo hiệu năng trên máy tham chiếu, điều chỉnh LOD.
- Thử MeshPhysicalMaterial cho da nếu cần (mục 4.2).

---

## 11. Những gì chưa kiểm chứng trong phiên này

- Không chạy npm nên chưa cài three-vrm 3.5.5. Các tên API (`VRMLoaderPlugin`, `VRMUtils.combineSkeletons`, `removeUnnecessaryVertices`, `removeUnnecessaryJoints`, `deepDispose`, `rotateVRM0`, `vrm.update`, `gltf.userData.vrm`) lấy từ API reference trên trang tài liệu và kết quả tìm kiếm, chưa chạy thử.
- Thứ tự gọi `combineSkeletons` và `removeUnnecessaryJoints` mâu thuẫn giữa các nguồn. Chưa chốt.
- Không render ảnh, không đo tam giác, đỉnh, draw call, kích thước file. Mọi số trong spec là ước tính hoặc giả định.
- Không xác minh trong phiên: tên hằng tone mapping trong three 0.169, hướng phía trước của VRM 1.0 (theo kiến thức chung là +Z), tên tham số MToon, tên extension `VRMC_*` (theo kiến thức chung), KTX2Loader trong GLTFLoader 0.169.
- Trang VRoid Studio help và Terms (403), Mixamo FAQ (403), LICENSE của đặc tả VRM (404): chưa đọc nguyên văn.
- VRM Public License 1.0: đọc tóm tắt từ trang vrm.dev, không đọc toàn văn.
- Không xác minh license của VRM add-on cho Blender, gltf-transform, KTX-Software, `@pixiv/three-vrm-animation`.
- Không xác minh gói animation CC0 nào có clip người chuyển động.
- Không kiểm tra hiệu ứng thực tế của đèn văn phòng. Giá trị màu đèn là xấp xỉ.
- Không kiểm tra spring bone của kiểu tóc đang ẩn có được tính mỗi khung không.
- Không kiểm tra cách nhân bản nhiều avatar từ một base (mục 1.5). Chưa đo bộ nhớ GPU.
- Nhánh `dev` của three-vrm có ví dụ WebGPU (`@pixiv/three-vrm/nodes`). Dự án dùng WebGL. Cần xác nhận MToon WebGL là đường mặc định.

---

## 12. Điểm tích hợp (chưa làm, dành cho bước triển khai sau)

Các file sẽ cần sửa khi triển khai. Phiên này không sửa:

- `src/scene/Player.tsx`: thay capsule bằng avatar. Giữ capsule làm proxy va chạm (`PLAYER_RADIUS`).
- `package.json`: thêm `@pixiv/three-vrm` ghim chính xác `3.5.5`. Thêm `three/addons` đã có sẵn trong three 0.169.
- `THIRD_PARTY.md`: thêm three-vrm (MIT), và từng asset có nguồn và license.
- `docs/OSS_REUSE.md`: cập nhật trạng thái của three-vrm sang đã xác minh (license) và chưa xác minh (chạy thử).
- `services/` (theo phạm vi agent khác): lưu appearance JSON, phục vụ manifest, kiểm id.
- `docker/` hoặc cấu hình nginx: phục vụ tài sản có hash với cache lâu. Chỉ là ghi chú.
