# Task 14 — Âm thanh không gian và phản hồi tương tác

Mã: `src/audio/spatial/` (pure.ts, synth.ts, manager.ts, react.tsx, index.ts, spatial.vitest.test.ts).
Âm tổng hợp hoàn toàn bằng Web Audio (không có file mẫu, không vướng giấy phép, không có tiếng người).

## Thành phần
- **Bus**: master, ambient, sfx, ui, voice (voice để dành task 25). Mỗi bus có volume và mute, lưu localStorage khóa `gpb.audio.spatial.v1`.
- **Nguồn 3D**: PannerNode (HRTF mặc định), refDistance/maxDistance/rolloff theo từng sự kiện (`SFX_SPECS`). Ngoài maxDistance thì không phát.
- **Qua tường/vùng**: `occlusionFor(vùngNguồn, vùngListener)`. Khác vùng thì lọc thấp 700 Hz và gain 0,55. Không raycast. Vùng lấy từ `audioZoneAt(audioZoneRects(objects), x, z)` ở `src/scene/audioZones.ts`; truyền vào `getZone` của listener và `zone` khi gọi `play`.
- **Sự kiện**: footstep (3 bề mặt tile/carpet/stairs, biến thiên ngẫu nhiên), door, drawer, switch, chair, printer, waterCooler, tv, uiClick (không spatial).
- **Voice stealing**: tối đa 12 voice; cướp voice ưu tiên thấp nhất rồi xa nhất rồi cũ nhất; voice mới kém hơn thì bị từ chối. Cooldown theo sự kiện và vị trí chặn spam.
- **Bước chân**: `updateFootsteps(speed, dt, grounded, surface)`, quãng bước 0,75 m (đi) tới 1,1 m (chạy), luân phiên chân, không phát khi đứng yên hoặc trên không.
- **Autoplay**: AudioContext chỉ tạo trong `unlock()` (pointerdown/keydown đầu tiên). `status` phản ánh trạng thái thật (`locked|running|suspended|unsupported`); UI nên hiện nút "Bật âm thanh" khi khác `running`.
- **Tab ẩn**: `setHidden(true)` dừng voice, suspend context, bỏ qua yêu cầu phát; quay lại không phát dồn.
- **Reduce-motion**: âm thiết yếu thấp (bước chân, ghế) hạ còn 0,6 gain.
- **Trợ năng**: `manager.lastCaption` giữ mô tả chữ cho cửa, máy in, TV, cây nước... (hiển thị qua LiveRegion nếu muốn).

## Dòng mount (điều phối viên chèn)
App.tsx, trong `<Canvas>`:
```tsx
import { SpatialAudioListener } from './audio/spatial';
<SpatialAudioListener getZone={(x, z) => audioZoneAt(audioRects, x, z)} />
```
Player.tsx (trong useFrame, sau khi có vận tốc ngang `speed`, `grounded`):
```tsx
import { getSpatialAudio } from '../audio/spatial';
getSpatialAudio().updateFootsteps(speed, dt, grounded, 'tile');
```
ITOffice.tsx / khung tương tác, chỉ khi hành động thành công:
```tsx
getSpatialAudio().play('door', { position: [x, y, z], zone });  // drawer, switch, chair, printer, waterCooler, tv
```
UI: `const { status, unlock, setVolume, setMuted } = useSpatialAudio();` và `playUi()` khi click nút; nút bật âm khi `status !== 'running'`.
Không bật hai hệ cùng lúc với `AmbientAudio` cho ambient; ambient hiện tại vẫn do `src/audio/engine.ts` đảm nhiệm (chưa nối vào bus ambient của module này).

## Kiểm thử
`npx vitest run src/audio/spatial`: 21 test (logic thuần và manager với mock AudioContext).

## Chưa kiểm chứng (cần trình duyệt)
- Nghe thực tế: cân bằng âm lượng, độ tự nhiên của âm tổng hợp, hướng HRTF khi xoay camera.
- Chính sách autoplay trên Safari/iOS, hành vi suspend/resume khi ẩn tab.
- Mức lọc qua tường (700 Hz, 0,55) cần chỉnh tai; cone hướng (`coneGain`) mới có hàm thuần, chưa nối vào panner.
- Ambient loop chưa hợp nhất vào bus ambient; kiểm tra không tăng nguồn sau nhiều lần vào/ra cảnh (dispose đã có test với mock).
