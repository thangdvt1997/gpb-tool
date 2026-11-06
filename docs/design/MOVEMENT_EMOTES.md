# Điều khiển nhân vật, emote và phản ứng va chạm

Ngày: 2026-11-06. Hợp đồng cho agent chuyển động. Agent này chỉ bắt đầu khi agent cảnh 3D đã xong, vì cùng dùng `Player.tsx` và `ITOffice.tsx`.

## 1. Điều khiển kiểu GTA

- `W` và `S`: tiến và lùi theo hướng nhìn của nhân vật. `A` và `D`: đi ngang trái và phải, không xoay.
- Xoay nhân vật bằng chuột: giữ chuột phải và kéo ngang. Không xoay bằng phím, không dùng phím mũi tên.
- `Shift` để chạy. `Space` để nhảy. `E` để dùng vật thể khi đứng gần và hướng về vật.
- Camera bám sau nhân vật. Kéo chuột trái để xoay camera quanh nhân vật, cuộn để zoom. Không cho camera xuyên tường.
- Click chuột trái lên sàn để nhân vật tự đi tới điểm đó. Click chuột trái lên vật thể ở xa thì nhân vật đi tới trước rồi mới dùng vật.
- Khi nhân vật đang thực hiện emote thì phím di chuyển hủy emote, trừ emote đứng yên.

## 2. Emote (hiệu ứng cá nhân)

Chỉ tác động lên chính nhân vật. Không có emote nào nhắm vào người khác.

| Id | Tên hiển thị | Ghi chú |
|---|---|---|
| `dance_1`, `dance_2` | Nhảy | Vòng lặp, hủy khi di chuyển |
| `kata` | Múa võ | Chuỗi tư thế, không lặp |
| `punch_combo` | Tập quyền | Đấm không trúng ai, shadow boxing |
| `stance` | Tấn | Đứng thủ thế, giữ đến khi bấm lại |
| `wave` | Vẫy tay | Một lần |

- Phím tắt `1` đến `6`, hoặc bảng chọn emote `EmotePanel`.
- Bộ animation: dùng keyframe tự làm trên bộ xương VRM đang có (`src/avatar/animation.ts`), hoặc bộ có giấy phép mở như CC0. Không dùng bộ animation thương mại có bản quyền.

## 3. Va chạm

- Hai nhân vật không đi xuyên nhau. Va vào ai thì bị chặn lại.
- Người đi va: tự động phát cử chỉ xin lỗi (`apologize`), một lần.
- Người bị va: khựng một nhịp và quay đầu nhìn (`startle`). Đây là phản ứng duy nhất. Không sợ hãi, không giận, không bị đứng yên.
- Giới hạn: cùng một cặp người, `startle` chỉ hiện một lần mỗi 60 giây.
- Người bị va có tùy chọn tắt phản ứng. Tùy chọn này lưu tại `auth` (xem mục 5). Mặc định bật.
- NPC và động vật: có thể đấm, đá, nhận phản ứng `hit`, `startle`, hoặc `angry_stance`. Không ảnh hưởng đến người thật.

## 4. Thi đấu và nhảy chung

- Dùng `docs/design/DUEL_CONSENT.md`. Chỉ khi cả hai đồng ý.
- Khi trận `fight` bắt đầu, hai nhân vật quay mặt vào nhau. Mỗi đòn trúng (`lastHit` từ server) phát animation `hit` cho người bị trúng.
- Người nằm đỡ (`down`) nằm xuống, không di chuyển, không đấm, và đứng dậy khi hết `downUntil`.
- Trận `dance`: hai người đứng cạnh nhau và cùng phát `dance_1` hoặc `dance_2`.

## 5. Thay đổi phía `auth` (do agent kiểm duyệt đang làm, không sửa ở đây)

Agent chuyển động cần hai endpoint sau. Nếu chưa có thì báo lại, không tự thêm:
- `GET /api/auth/directory?query=`: nhân viên đang hoạt động, đăng nhập bắt buộc. Trả `id`, `name`, `department`. Không trả email.
- `POST /api/auth/profile/preferences` với body `{ reactBump: boolean }`. Lưu tùy chọn phản ứng va chạm. Trả về `{ ok: true, preferences }`.

## 6. Hiệu năng và draw call

- Tổng cảnh vẫn trong trần 200 draw call (DECISIONS mục 11).
- Emote và va chạm không được tạo vật liệu mới trong vòng lặp render. Dùng chung vật liệu và tái dùng đối tượng.

## 7. Phân quyền file

- Agent chuyển động: `src/scene/Player.tsx`, `src/scene/ITOffice.tsx` (chỉ gắn các hệ mới), `src/avatar/animation.ts`, `src/emotes/**` (mới), `src/ui/EmotePanel.tsx` (mới), và gắn `DuelPanel` vào `src/ui/Panel.tsx` hoặc vào giao diện chính.
- Không sửa `src/checkin/**`, `src/moderation/**`, `src/auth/**`, `src/onboarding/**`, `services/**`.

## 8. Tiêu chí chấp nhận

- Điều khiển: W, A, S, D, Shift, Space hoạt động, camera không xuyên tường.
- Emote: năm đến sáu emote, phím tắt 1 đến 6 hoạt động, di chuyển hủy emote lặp.
- Va chạm: không xuyên nhau, `startle` cách nhau tối thiểu 60 giây cho cùng cặp, tắt được trong tùy chọn.
- Thi đấu: đúng luật trong `DUEL_CONSENT.md`.
- Không có emote nhắm vào người thật khi họ chưa đồng ý.
