# Hành động xã hội có mục tiêu (TASK 15, phần còn thiếu)

Mã: `src/emotes/social/`. Năm emote mới trong `src/emotes/library.ts` (đều `internal`, không có phím, không vào bảng/bánh xe): `wave_at`, `handshake`, `high_five`, `bow`, `point_at`. Không đụng `punch_combo`, `kata`.

## Luật
- Không cần đồng ý: `wave_at` (tầm 8 m), `bow` (5 m), `point_at` (12 m). Phát ngay, báo `social_play`.
- Cần đồng ý: `handshake`, `high_five` (tầm 2,5 m). Gửi lời mời, người kia bấm Chấp nhận hoặc phím Y; Từ chối hoặc N.
- Mục tiêu: người gần nhất trong bán kính và nửa góc nhìn của hành động (60-80 độ), bỏ chính mình và người chồng lên (< 0,3 m).
- Lời mời hết hạn sau 15 s; chấp nhận muộn không có hiệu lực. Một bên đi xa quá tầm x 1,6 (hoặc mất vị trí) thì hủy, bên mời báo `social_cancel`.
- Mỗi người một lời mời chờ (đến hoặc đi). Lời đến thứ hai bị tự từ chối.
- Chặn khi: ngồi, nhảy (airborne), đang tương tác vật, mở editor, đang di chuyển, đang trong trận (`inMatch`), đang cooldown (3 s không cần đồng ý, 8 s cần đồng ý).
- Hướng: yaw = atan2(dx, dz). Người khởi xướng quay về mục tiêu; khi chấp nhận, cả hai quay về nhau (`facePair`).

## Máy trạng thái
`pending -> accepted | declined | expired | cancelled`, hàm thuần `reduceInvite`. Chỉ người được mời accept/decline, chỉ người mời cancel; trạng thái cuối bất biến.

## Nối world (đã làm)
`SocialTransport { selfId, send(to,msg), subscribe(handler) }`. Có `createLocalBus()` (một máy) và `createWorldSocialTransport` (`src/net/socialTransport.ts`, khi `?world=1`; `App.tsx` truyền vào `SocialBar`). Thông điệp: `social_invite {invite}`, `social_respond {inviteId, by, answer}`, `social_cancel {inviteId, by}`, `social_play {actionId, from, to, startTime}`, cộng `social.denied {code, inviteId?}` từ server. Server kiểm quyền `social.act` bằng `can()`, tần suất, khoảng cách (tầm × 1.6), hạn 15 s, bận, chặn, và chỉ chuyển tiếp tới `to`; xem WORLD_SYNC.md mục "Hành động xã hội". Thời điểm lời mời được quy về đồng hồ cục bộ ở bên nhận; `social.denied` thành decline để bên mời không bị kẹt.

## Mount (host làm)
```tsx
const session = useMemo(() => new SocialSession({ transport: createLocalBus().endpoint(myId), now: () => performance.now(),
  getPosition, play: playInternalEmote, face: setMyYaw, onRemotePlay }), []);
<SocialPrompt session={session} />   // và gọi session.start('handshake', ctx, self, peers) từ menu/phím
```
Cần thêm CSS cho `.social-prompt` (định vị) nếu muốn; hình thức nút lấy từ `ui-system.css`.

## Chưa kiểm chứng
Chưa chạy trong scene thật; tư thế procedural chưa xem bằng mắt (bắt tay không có IK nên hai tay không khớp nhau); transport mạng mới kiểm bằng test (ws thật + vitest), chưa thử hai trình duyệt thật; avatar từ xa chưa phát emote khi nhận `social_play` (host chưa truyền `onRemotePlay`); hướng yaw giả định mặt nhìn +Z.
