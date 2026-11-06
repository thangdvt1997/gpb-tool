# Luồng khởi động và ghi danh cổng tầng 7 (phòng CNTT)

Ngày: 2026-11-06. Đây là hợp đồng chung để ba agent làm song song. Ai làm phần nào thì theo mục 5.

## 1. Trải nghiệm

Khi người dùng đăng nhập và vào tầng CNTT lần đầu trong ngày (múi giờ UTC+7), cảnh mở đầu chạy như sau:

1. Nhân vật ở trong cabin thang máy tầng 7. Bảng số hiện "7". Cửa mở kèm tiếng chuông ngắn.
2. Nhân vật bước ra sảnh và đi tới bàn an ninh (`security_gate`) gần lối vào.
3. Bảo vệ (NPC) đứng dậy, đưa thiết bị quét về phía nhân vật. Tia quét chạy qua huy hiệu có tên người dùng.
4. Lớp phủ hiện "Đang ghi danh…", sau đó "Đã ghi danh lúc 08:12". Nếu lỗi thì hiện thông báo kèm nút thử lại.
5. Bảo vệ gật đầu, cổng mở, nhân vật được thả vào tầng.

Thời lượng mục tiêu khoảng 15 đến 20 giây. Nút "Bỏ qua" luôn hiển thị. Phím Esc hoặc Enter cũng bỏ qua.

Quy tắc:
- Chỉ chạy một lần mỗi ngày cho mỗi người. Nếu đã ghi danh hôm nay thì nhân vật xuất hiện thẳng ở sảnh, không có chuỗi cảnh.
- Ghi danh không chặn truy cập. Nếu lỗi mạng hoặc người dùng bỏ qua, nhân vật vẫn vào tầng, và bảng ghi danh hiện "Chưa ghi danh".
- Không nhận diện khuôn mặt và không dùng camera. "Quét" chỉ là hiệu ứng hình ảnh trên huy hiệu tên. Người được ghi danh luôn là tài khoản đang đăng nhập.
- Không thể ghi danh thay người khác.
- Tôn trọng `prefers-reduced-motion`: không đi bộ, chuyển cảnh bằng mờ dần, vẫn gọi API.

## 2. Hợp đồng API (service `it`, qua gateway `/api/it`)

Xác thực bằng cookie `sid`. Mỗi request kiểm tra lại với service auth, không cache. Ngày tính theo UTC+7, định dạng `YYYY-MM-DD`. Lỗi trả về theo khuôn `{ ok: false, error: "code" }` như các route hiện có.

**POST `/api/it/checkins`**
- Body tùy chọn `{ "gate": "lift7" }`. Mặc định `lift7`. Giá trị khác bị từ chối 400.
- 201 khi ghi danh mới: `{ ok: true, alreadyCheckedIn: false, checkin: { userId, name, department, day, at, gate } }`
- 200 khi đã ghi danh hôm nay: `{ ok: true, alreadyCheckedIn: true, checkin: <bản ghi cũ> }`
- 401 khi chưa đăng nhập. 403 khi `Sec-Fetch-Site` là `cross-site`.
- `at` là chuỗi ISO có offset `+07:00`.

**GET `/api/it/checkins/me`**
- `{ ok: true, day, checkedIn: boolean, checkin: <bản ghi> | null }`

**GET `/api/it/checkins/today`**
- Mọi người đăng nhập: `{ ok: true, day, count, byDepartment: [{ department, count }] }`. Không có tên.
- `?detail=1`: chỉ role `it` hoặc `admin` được xem thêm `items: [{ userId, name, department, at }]`. Người khác nhận 403.

**Lưu trữ:** bảng `checkins` trong SQLite của service `it` (thư mục `/data`), khóa duy nhất `(user_id, day)`. MVP không tự xóa.

## 3. Hợp đồng frontend

- `src/checkin/types.ts`: `CheckinRecord`, `MyCheckin`, `CheckinResult`, `TodayBoard`.
- `src/checkin/api.ts`: `getMyCheckin()`, `postCheckin()`, `getTodayBoard(detail?: boolean)`.
- `src/checkin/CheckinScanOverlay.tsx`: props `{ phase: 'scanning' | 'done' | 'already' | 'error'; name: string; at?: string; onSkip: () => void; onRetry?: () => void }`. Hiển thị ở góc dưới, không che nhân vật.
- `src/checkin/CheckinBoard.tsx`: panel HTML của bảng trong sảnh. Props `{ board: TodayBoard | null; detail: boolean }`. Mở từ `Panel.tsx` với action `checkin_board`.
- `src/checkin/checkin.css`: tiền tố class `ci-`.

## 4. Hợp đồng 3D

Object id mới trong `src/content/zones/it.json`:
- `lift7_east` (kind `elevator`): cụm thang máy bên phải hành lang giữa (ô xanh trên bản vẽ người dùng). Chuỗi cảnh dùng cụm này.
- `lift7_west` (kind `elevator`): cụm thang máy bên trái hành lang giữa. Chỉ có cửa mở kèm chuông, không có chuỗi cảnh.
- `security_gate` (kind `security_gate`): khu bảo vệ (ô đỏ trên bản vẽ), ở giao lộ hành lang ngay sau cửa `lift7_east`. Gồm bàn an ninh, cổng xoay, thiết bị quét.
- `checkin_board` (kind `checkin_board`): bảng ghi danh trên tường sảnh.

Đường đi của chuỗi cảnh (mũi tên xanh lá trên bản vẽ): từ cửa `lift7_east` ra, qua khu bảo vệ, rẽ trái dọc hành lang giữa về phía tây, thả nhân vật tại điểm cuối khoảng pixel (285, 275).

Các id này cố định, không đưa vào `movable.js`. Toạ độ quy đổi theo `docs/FLOORPLAN_IT.md` và hiệu chỉnh bằng vật thể đã có trong `it.json`. Không chồng footprint vật khác, và không đặt vật thể lên hành lang giữa trừ khi cần cho đường đi.

`src/scene/entry/EntrySequence.tsx`: props `{ userName: string; checkedIn: boolean; onFinish: (result: 'checked' | 'skipped' | 'error') => void }`. `ITOffice` mount component này khi người dùng chưa ghi danh hôm nay. Component dùng `src/checkin/api.ts` và `CheckinScanOverlay`.

## 5. Phân quyền file (không ghi chồng)

- **Agent backend**: `services/it/**` (route `checkins`, migration bảng, đăng ký route trong `app.js`, test). Có thể thêm kiểm tra chỉ đọc vào `scripts/api-test.sh`.
- **Agent 3D**: `src/scene/**`, `src/scene/entry/**`, `src/content/zones/it.json`, `src/env/**` (chỉ phần đăng ký tương tác `checkin_board`), `docs/FLOORPLAN_IT.md`.
- **Agent UI**: `src/checkin/**`, `src/ui/Panel.tsx` (chỉ thêm case `checkin_board`), `src/ui/CheckinPanel.tsx` nếu cần.
- **Không ai sửa**: `src/auth/**`, `src/onboarding/**` (agent UI-AUTH đang làm), `services/auth/**`, `docker-compose.yml`, `deploy/nginx/gateway.conf`. Nếu thiếu route trong gateway thì báo lại trong báo cáo, không tự sửa.

## 6. Thiết kế hình ảnh

- Dùng biến màu từ `src/theme/tokens.ts`. Không hardcode màu. Màu thương hiệu là placeholder, theo quyết định của người dùng.
- Cửa thang máy: thép chải, phản chiếu nhẹ, đèn số tầng dạng LED.
- Bảo vệ: đồng phục tối giản, có huy hiệu. Thiết bị quét có tia sáng mờ.
- Lớp phủ ghi danh: thẻ bo 16px, chữ rõ, tiếng Việt, giờ theo UTC+7. Animation nhẹ, tôn trọng reduced-motion.
- Draw call: tái dùng vật liệu, dùng `InstancedMesh` khi lặp. Tổng cảnh vẫn trong trần 200 (DECISIONS mục 11).

## 7. Không làm trong đợt này

- Nhận diện khuôn mặt, thẻ từ thật, máy chấm công thật.
- Thông báo đẩy, email cho quản lý.
- Ghi danh ra về.

## 8. Tiêu chí chấp nhận

- **API**: POST lần đầu trả 201. Lần hai trả 200 với `alreadyCheckedIn: true`. Không đăng nhập trả 401. Cross-site trả 403. `GET today` không có tên với người thường.
- **UI**: lần đầu trong ngày có chuỗi cảnh. Bỏ qua vẫn vào tầng. Lỗi mạng hiện nút thử lại. Reduced-motion không có đi bộ.
- **Build**: `tsc` và `vite build` xanh trên VPS.

## 9. Quy tắc làm việc

- Không chạy `npm install`, `tsc`, `vite build` hay `docker` trên máy cục bộ. Máy sẽ nặng. Kiểm tra bằng đọc code. Build do người điều phối chạy trên VPS.
- Không commit, không push.
