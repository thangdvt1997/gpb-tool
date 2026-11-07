# TASK 02 — Bước cố định, state machine locomotion, bậc/dốc

Mã: `src/scene/motion/` (hàm thuần + 1 hook). Test: `npx vitest run src/scene/motion` (47 test, đạt).

## Thành phần
| File | Nội dung |
|---|---|
| `fixedStep.ts` | `FixedStepper` (60 Hz mặc định, tối đa 5 bước/khung, kẹp dt 0,1 s, pause/resume), `FixedStepRunner` giữ tư thế trước/sau + `render` nội suy theo `alpha`, bỏ nội suy khi dịch chuyển tức thời > 2 m |
| `locomotionFsm.ts` | 12 trạng thái, `LOCO_TRANSITIONS`, `LOCO_DEFS` (minTime, ưu tiên, autoExit), `stepLocomotionFsm`, sự kiện ra |
| `clipMap.ts` | trạng thái -> tên clip (+ tên thay thế), `blendTime(from,to)`, `resolveClip`, `planCrossfade`, `missingClips` |
| `floorHeight.ts` | `HeightBox`, `resolveFloorHeight`, `canStepTo`, `settleOnGround`, `stepHeight`/`maxSlope`, `floorConfigForHeight` |
| `useFixedStepMotion.ts` | hook cắm vào `useFrame`, tạm dừng khi tab ẩn/blur |

## State machine
Trạng thái: idle, walk, run, jumpStart, airborne, land, sitDown, seated, standUp, interact, emote, stunned.
- Mỗi tick tối đa một chuyển; phải nằm trong bảng. Chuyển "mềm" cần `timeIn >= minTime`; chuyển "cứng" (choáng, mất chạm đất, hủy emote bằng di chuyển/nhảy, nhảy) bỏ qua minTime.
- Nhiều đề nghị cùng tick: ưu tiên cao thắng (stunned 100 > standUp/sitDown > seated > interact > jumpStart > airborne > land > emote > run > walk > idle).
- Trễ tốc độ: vào đi 0,3 m/s, thôi đi 0,15; vào chạy 4,2, thôi chạy 3,9.
- Điều kiện: nhảy chỉ từ idle/walk/run/land/emote (`canLocoJump`); ngồi chỉ khi chạm đất, tốc độ <= 4,4, từ idle/walk/land; emote chỉ từ idle; interact từ idle/walk/seated và quay về `returnTo`.
- Yêu cầu bị từ chối phát `rejected` (không im lặng).
- Sự kiện: `enter`/`exit`, `footstep` (L/R luân phiên theo quãng đường 0,75 m đi, 1,1 m chạy), `jump`, `land{impact}`, `rejected`.

Quy ước đầu vào `LocoInput`: `grounded`/`vy`/`jumped` lấy từ motor (`MotionState.grounded`, `vy`, `jumped`), `speed` = `MotionState.speed`, `moveIntent` = có phím/joystick, `stunned` = `isLocked()` hiện có (`getMyVisual().locked`). `sitRequested`/`standRequested`/`interactRequested` map từ `takeSeatRequest()` và `characterState` (seated/interacting).

## Clip
Repo chưa có clip rig thật cho các trạng thái này; `resolveClip` rơi về tư thế procedural (`'locomotion'` của `src/avatar/animation.ts`), emote trả `none` (nhường `emotes/player`). Blend mặc định 0,2 s; ghi đè theo cặp (vào choáng 0,05, vào nhảy 0,06, ngồi 0,2-0,25). Chỉ một clip điều khiển chân tại một lúc, `overlapLegs` báo khoảng crossfade giữa hai clip chân (phải dừng clip cũ sau fade). Clip `interact` chỉ thân trên (`drivesLegs: false`).

## Bậc thấp / dốc
`stepHeight` mặc định 0,3 m, `maxSlope` 40°, tỉ lệ theo chiều cao (kẹp 1,4-2,1 m). **Văn phòng hiện phẳng: không có bậc, dốc hay cầu thang trong dữ liệu cảnh (`Rect` 2D, sàn y = 0).** Module chỉ là hạ tầng; chưa nối vào `stepMotion` (không sửa được `controls/**`).

## Dòng mount
Vòng cập nhật nằm ở `src/scene/controls/index.ts` (`useGtaPlayer`, `useFrame` quanh dòng `stepMotion(motion, input, dt, PLAYER_RADIUS, obstacles, ROOM_BOUNDS)`), không phải `Player.tsx`. Điều phối viên thay bằng:

```ts
const fixed = useFixedStepMotion({
  enabled: enabled && !ctl.paused,            // đưa ra ngoài useFrame, dùng ref
  read: (o) => { o.x = motion.pos.x; o.y = motion.pos.y; o.z = motion.pos.z; o.yaw = motion.yaw; },
  step: (h, first) => {
    input.jump = jump && first;               // nhảy chỉ tiêu ở bước đầu
    stepMotion(motion, input, h, PLAYER_RADIUS, obstacles, ROOM_BOUNDS);
    if (auto && ap) ap.after(motion, h);
  },
  onRender: (r) => { renderPose.x = r.x; renderPose.y = r.y; renderPose.z = r.z; renderPose.yaw = r.yaw; },
});
// sau teleport/hồi sinh/đứng dậy: fixed.snap();
```
Trong `Player.tsx` `useFrame`, đổi `g.position.set(p.x,p.y,p.z)` / `g.rotation.y` sang `renderPose`. Việc đọc input/quy hướng camera vẫn chạy mỗi khung, chỉ `stepMotion` chạy trong `step`. `stepLocomotion(playerLocomotion, ...)` và camera nên dùng `renderPose`.

## Chưa kiểm chứng
- Chưa chạy trong trình duyệt; hook `useFixedStepMotion` chỉ qua tsc, không có test render.
- Mô phỏng 30/60/120/144 FPS chỉ kiểm bằng `stepMotion` thuần (dung sai 1 mm trên 2 s), chưa đo trên thiết bị.
- Camera hiện đọc `positionRef` (60 Hz); cần đọc `renderPose` để tránh rung trên màn hình 120-144 Hz.
- FSM chưa nối vào Avatar/âm thanh; chưa có clip thật, chưa có IK (task 03).
- Chưa có sweep/CCD, cầu thang, vật cản thấp trong cảnh; `floorHeight` chưa tích hợp `stepMotion`.
- Jump buffer/coyote time chưa làm.

## Nguồn input interact/stunned (lần lặp 2)

- `interact`: nghe bus `onInteractEvent` (scene/interact/objects/interactEvents), không sửa module interact. Hành động thật (mở cửa, bật đèn, nhặt đồ, in, rót nước...) bật xung 0,6 s (`src/scene/controls/locoPulses.ts`). Bỏ qua `*.denied`, `*.blocked`, `*.locked` và `chair.*` (ngồi do session ghế quyết định). Chỉ vào interact khi chạm đất và không nhảy; nhảy luôn thắng. `locoBlendInputs` nhận thêm dữ kiện chạm đất thật để interact/stunned không che tư thế trên không.
- `stunned`: nguồn thật duy nhất là `isLocked()` của `useGtaPlayer` (Player.tsx nối `getMyVisual().locked`, tức nằm đỡ khi trúng đòn trong duel). Repo chưa có cơ chế đẩy hay va chạm mạnh/knockback nên chưa nối nguồn đó; `requestStun(pulses, now, giây)` là điểm nối sẵn, chưa có nơi gọi.
- Hoạt ảnh: `clipForState` (clipMap) vẫn rơi về tư thế procedural khi chưa có clip (tập clip rỗng), hành vi hiển thị không đổi. `ControlsDebug.locoClip` cho biết nguồn ('procedural' | 'clip' | 'none'). Avatar chưa có AnimationMixer nên chưa phát clip thật.
