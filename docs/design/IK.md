# TASK 03 - IK tay chân và căn tư thế tương tác

Mã: `src/avatar/ik/**`. Test: `npx vitest run src/avatar/ik` (28 test).

## 1. Xương thật của rig MPFB game_engine

Đọc JSON chunk của GLB bằng node (fs, không thư viện; script mẫu ở cuối tài liệu).
Cả ba tệp `male_real.glb`, `female_real.glb`, `chibi.glb` có một skin, 53 khớp, cùng tên và cấu trúc cha-con:

```
Root
  pelvis
    spine_01 > spine_02 > spine_03
      clavicle_l > upperarm_l > lowerarm_l > hand_l > {index,middle,pinky,ring,thumb}_01_l > _02_l > _03_l
      clavicle_r > upperarm_r > lowerarm_r > hand_r > (5 ngón như trên, hậu tố _r)
      neck_01 > head
    thigh_l > calf_l > foot_l > ball_l
    thigh_r > calf_r > foot_r > ball_r
```

Chuỗi IK: tay `upperarm_*` / `lowerarm_*` / `hand_*`; chân `thigh_*` / `calf_*` / `foot_*`; hông `pelvis`.
Tên trùng khớp bảng mặc định trong `boneMap.ts`; có bí danh dự phòng (mixamo, LeftUpLeg, ...) và dự phòng theo cấu trúc (con xương đầu tiên).

## 2. Kiến trúc

| Tệp | Vai trò |
|---|---|
| `twoBoneSolver.ts` | Giải tích hai xương (luật cos) trên vector: pole, kẹp góc trong [min, π], ngoài tầm thì duỗi thẳng, NaN-safe |
| `boneMap.ts` | Ánh xạ tên xương -> `LimbBones` |
| `limbChain.ts` | Áp kết quả lên `THREE.Bone` (xoay tối thiểu trong không gian thế giới), trộn slerp theo trọng số, hướng bàn tay/chân tùy chọn, khôi phục tư thế gốc |
| `controller.ts` | `LimbIKController`: mục tiêu từng chi, trọng số làm mượt, công tắc từng solver, foot-IK theo sàn, hông |
| `posture.ts` | `applySeatPose`, `releaseSeatPose`, `reachTo` |
| `useLimbIK.ts` | Hook R3F |

Thứ tự mỗi khung: animation ghi tư thế -> (hook) `setup` ghi mục tiêu -> `controller.update(dt)`:
khôi phục xương nếu animation không ghi đè -> cập nhật ma trận -> hông (ghế hoặc sàn) -> từng chi.
Mục tiêu ở không gian thế giới. Không cấp phát trong vòng lặp (vector/quaternion dùng chung ở module).

Giới hạn khớp: gối `KNEE_LIMITS` (góc trong 0,45..π rad), khuỷu `ELBOW_LIMITS` (0,4..π). Góc trong không vượt π nên không ưỡn ngược; phía gập do pole quyết định. Chưa có giới hạn xoay khớp gốc (vai/hông) và xoắn.

Blend: `weights[id]` tiến về đích theo `1 - exp(-blendRate*dt)`. Đặt `target.active = false` thì blend về 0, vị trí cuối được giữ nên không giật về gốc tọa độ. Trọng số 0 không chạm xương.

Foot IK (`controller.ground = { sampler, maxPelvisDrop, maxPelvisRaise, maxFootTilt, smoothRate }`): `sampler(x, z, out)` trả độ cao + pháp tuyến sàn (hàm độ cao hoặc raycast do nơi gọi cung cấp). Độ lệch sàn mỗi chân so với sàn dưới gốc rig; hông dịch theo chân thấp nhất trong giới hạn; mắt cá cộng độ lệch của chân; chân nhấc cao hơn mắt cá nghỉ (vung) bị giảm trọng số (smoothstep 2..8 cm).

Ngồi: `applySeatPose(ctrl, {anchor, yaw, floorY}, {left, right})`. Hông -> anchor + 0,10 m; chân đặt trước ghế (hướng nhìn `(sin yaw, cos yaw)`), gối pole ra trước; tay lên điểm bàn nếu trong tầm (không thì tắt). `releaseSeatPose` để đứng dậy (blend về animation).

Với tay: `reachTo(ctrl, 'armL', point)` trả false và tắt mục tiêu nếu quá tầm; pole mặc định khuỷu hướng xuống.

Đổi hình thể: chiều dài đoạn được đo lại từ ma trận mỗi lần giải; gọi `ctrl.recalibrate()` sau khi đổi morph/scale để đo lại độ cao mắt cá.

## 3. Dòng mount (chèn vào `MpfbModel` trong MpfbAvatar.tsx, SAU `useFrame` hiện có ghi pose)

```tsx
import { useLimbIK } from './ik';
// ... ngay sau khối useFrame(...) hiện tại:
const limbIK = useLimbIK(rig.root);
```

Thêm tùy chọn nối ghế/sàn (ví dụ trong callback setup):

```tsx
useLimbIK(rig.root, (c) => { /* ghi c.targets / applySeatPose(c, ...) theo session */ });
```

Không dùng priority > 0 (tắt render tự động của R3F); thứ tự do đăng ký useFrame cùng priority. Nếu cần foot IK: `limbIK.ground = {...}`.

## 3b. Cập nhật (ngồi, cầm, bật mặc định)

- IK trong MpfbAvatar BẬT mặc định; tắt bằng `?ik=0`. Căn cứ: e2e "?ik=1: cảnh render không lỗi console" và `e2e-new/23-ik.spec.ts` (ngồi ghế, hook `?debug=ik` -> `window.__gpbIK`: frames, sitFrames, nanBones, pelvisY, floorY, footY) đều PASS.
- Ngồi nối vào MpfbAvatar: animation `sit` (hoặc `locomotion` có `playerLocomotion.sit > 0.5`) -> `applySeatPose` với điểm neo = gốc nhân vật (x, z), mặt ghế 0,46 m trên sàn, yaw theo hướng nhóm. Tay lên bàn: `deskHandPoints(anchor, yaw, deskY)` có sẵn nhưng CHƯA nối trong app (avatar chưa biết độ cao bàn); có test.
- `grip.ts`: `FingerGrip(handBone)` khép ngón (trục gập dò tự động), `gripAt(ctrl, fingers, 'L'|'R', socket, 'cup'|'phone')` đưa cổ tay tới socket (lùi `palmOffset`). CHƯA nối với hệ vật cầm trong app; có test trên 3 GLB thật.
- Chibi: chân ngắn nhưng với tới sàn theo test; cần xem bằng mắt.

## 4. Chưa kiểm chứng

- Chưa chạy trên GLB thật trong trình duyệt; test dùng chuỗi `THREE.Bone` dựng tay (tên và tỷ lệ gần MPFB).
- MpfbAvatar ghi tư thế procedural bằng quaternion chứ không dùng mixer; giả định nó ghi lại quaternion mỗi khung các xương chi (nếu không, `restore()` xử lý bằng so sánh giá trị đã ghi). Xương `foot_*`/`hand_*` có được ghi hay không chưa kiểm tra.
- Độ cao mắt cá nghỉ đo lúc dựng so với gốc rig; nếu animation nhún `rootY` thì phát hiện pha vung có thể lệch.
- Chưa có: khóa chân (foot locking) ở pha tiếp đất, nhả khóa khi nhảy/đổi nền, grip profile cầm cốc/điện thoại, debug vẽ ray/pole, giới hạn xoắn cánh tay, miền hình thể được hỗ trợ (chưa đo trên 3 hình thể thật).
- Raycast xuống sàn chưa có sẵn; chỉ có giao diện `GroundSampler`.
- Ghế: `pelvisAboveSeat` 0,10 m và `ankleHeight` 0,08 m là giá trị ước lượng, chưa đối chiếu hình học ghế thật (`interact/chairs.ts`, `geometry.ts`: seat `{x, z, yaw}`; chưa có độ cao mặt ghế/bàn trong đó).
- Chưa đo sai số tại điểm tiếp xúc trên model thật, chưa chụp ảnh trước/sau.

## Phụ lục: script liệt kê xương

```js
// node glb.mjs file.glb
import fs from 'fs';
const b = fs.readFileSync(process.argv[2]);
const j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString());
const set = new Set(j.skins[0].joints), par = {};
j.nodes.forEach((n, i) => (n.children || []).forEach((c) => (par[c] = i)));
const pr = (i, d) => { if (!set.has(i)) return; console.log('  '.repeat(d) + j.nodes[i].name); (j.nodes[i].children || []).forEach((c) => pr(c, d + 1)); };
[...set].filter((i) => !set.has(par[i])).forEach((i) => pr(i, 0));
```
