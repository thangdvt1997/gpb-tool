# SOCIAL: chat riêng, stand meeting, nhảy, hát chung, thi đấu võ thuật, meme

| Mục | Nội dung |
|---|---|
| Ngày | 2026-11-06 |
| Trạng thái | Đề xuất thiết kế. Chưa triển khai. Chờ duyệt mục 14. |
| Phạm vi file | Chỉ tài liệu này. Không sửa services/, src/, deploy/ hay docs/ khác. |
| Phụ thuộc | services/auth (3001, `/api/auth/me`), services/it (3002, bảng `bookings`), services/karaoke (3004), deploy/nginx/gateway.conf, DESIGN_V2.md (mục 1.5, 2.5, 5.3, 5.7), AVATAR_SPEC.md (mục 6), ONBOARDING_API.md (phiên `sid`/`osid`), DECISIONS.md |
| Đối tượng | Người triển khai social-service, agent frontend 3D, người duyệt quy định ứng xử |

Cách đọc: mục 1 chỉ mô tả điều đã đọc trong repo. Số liệu ở mục 8 và 13 là đề xuất để kiểm chứng, chưa đo. Mọi đường dẫn có tiền tố `/api/social` trừ khi ghi khác. INTERACTIONS.md chưa tồn tại trong `docs/design/` (đã kiểm tra), nên không có ràng buộc tương tác nào để đối chiếu.

---

## 0. Tóm tắt

- Thêm service mới `social-service` cổng 3010, tách khỏi các service hiện có. Gateway proxy `/api/social`. Mọi đường đi xác thực bằng cookie `sid` (scope full). `osid` bị từ chối.
- Thứ tự triển khai: chat riêng và stand meeting trước (pha 1), nhảy và hát chung (pha 2), thi đấu sau cùng (pha 3 và 4, chỉ sau khi bộ kiểm thử mục 11 đạt).
- Realtime: SSE cho chat, họp đứng, nhảy, lời mời (một kênh server đẩy xuống). WebSocket chỉ cho trận đấu, vì trận cần gửi lệnh lên server với độ trễ thấp.
- Thi đấu cần đồng thuận hai bên: lời mời có chấp nhận, từ chối, hết hạn 60 giây. Server là trọng tài. Client không gửi sát thương, chỉ gửi lệnh.
- Không có máu, vết thương hay âm thanh gây sợ. Đòn được thể hiện bằng khối, khớp và tia sáng. Người thua nằm đơ 30 giây rồi đứng dậy.
- Không tính điểm, không thưởng tiền, không quà đổi tiền. Hết 180 giây mà chưa KO thì hoà.
- Mọi tương tác có audit tối thiểu (ai, loại, lúc nào, đích nếu có). Không ghi nội dung.
- Chat riêng không được quét nội dung tự động. Hệ thống chỉ đọc tin khi người nhận báo cáo, và khi đó chỉ lưu bản chụp đúng tin đó.

Phát hiện cần chú ý:
- Không có service `world` trong repo. Các service hiện có: auth 3001, it 3002, games 3003, karaoke 3004, events 3005, display 3006, plants 3007. Cổng 3008 và 3010 chưa được dùng.
- ONBOARDING_API.md dành cổng 3006 cho "profile", nhưng 3006 là display. Cần sửa tài liệu đó khi triển khai profile.

---

## 1. Hiện trạng (đã đọc)

| Điểm | Vị trí | Ghi chú cho thiết kế |
|---|---|---|
| Các service | services/: auth, it, games, karaoke, events, display, plants | Mỗi service có SQLite riêng (better-sqlite3), đọc `PORT`, `HOST` (mặc định 127.0.0.1), `AUTH_URL`, `DATA_DIR` |
| Xác thực service văn phòng | services/karaoke/src/auth.js | Mỗi request gọi `AUTH_URL/api/auth/me`, forward Cookie, timeout 3 s, không cache. Social dùng lại mẫu này |
| Vai trò | services/it/src/auth.js (dòng 14), DESIGN_V2 5.7 | `employee`, `it`, `admin` |
| Mẫu SSE | services/display/src/sse.js | Heartbeat 25 s, retry 3 s, tối đa 2000 client, header `X-Accel-Buffering: no`, `Cache-Control: no-cache` |
| Gateway cho SSE | deploy/nginx/gateway.conf, block `/api/display` | `proxy_buffering off`, `proxy_cache off`, timeout đọc 3600 s |
| Gateway cho WebSocket | gateway.conf, cấp server | `map $http_upgrade`, `Upgrade` và `Connection` đã khai báo. Chưa có route WS nào |
| Gateway fallback | gateway.conf, `location /api/` | Trả 404 JSON. Route mới phải đặt trước dòng này |
| Đặt phòng họp | services/it/src/db.js, bảng `bookings` | Có `room_id`, `start_at`, `end_at`, `booked_by_id`. Social không đọc DB của it-service |
| API phòng | services/it/src/routes/rooms.js | `GET /api/rooms`, `/free`, `POST /book`. Chưa có API "đang bận" theo người |
| Karaoke | services/karaoke/README.md | Bài hát, `POST /api/karaoke/scores`, bảng xếp hạng chỉ tính `suspicious = 0`. Điểm do trình duyệt tính. Mọi vai trò hát được |
| Presence | toàn repo | Chưa có (ONBOARDING_API.md cũng ghi nhận). Social tự theo dõi `lastSeen` |
| Zone | DESIGN_V2 5.3 | Z01 Sảnh và Service Desk; Z02 và Z03 khu bàn; Z04 Khu Bắc và NOC; Z05 Lounge Đông có karaoke và sân khấu nhỏ; Z06 phòng họp và phòng riêng; Z07 lõi, WC, pantry; Z08 khu dự phòng; Z09 phòng máy chủ và SOC |
| Khu tiếp khách | Yêu cầu và DESIGN_V2 | Hiểu là Z01 |
| Panel | DESIGN_V2 1.5 | Nền trắng 0.92 hoặc xanh than 0.88, bo 12 px, vùng chạm 40 px, Esc đóng, Tab chuyển, focus 2 px |
| Trạng thái người dùng | DESIGN_V2 1.5 | Trực tuyến, bận, đang họp, vắng. Dùng chấm màu cộng chữ |
| Hoạt ảnh | AVATAR_SPEC 6.2 và 6.3 | Idle và Walk procedural. Wave và Dance dự kiến VRMA, nhưng mục 6.3 B cho phép procedural |
| Nội dung nhạy cảm | DESIGN_V2 2.5 | Không biểu tượng tôn giáo, không hình người thật, không chủ đề chính trị |

---

## 2. Ràng buộc bắt buộc và nơi thực thi

| Ràng buộc | Thực thi | Kiểm thử |
|---|---|---|
| Đấu chỉ khi hai bên đồng ý. Lời mời có chấp nhận, từ chối, hết hạn 60 s | 8.1, 8.8 | F1, F2, F3 |
| Người bật "không nhận thách đấu" không nhận lời mời | 8.9 | F12 |
| Không ai bị đưa vào trận | Trận chỉ tạo khi người nhận gọi `accept` | F1 |
| Không máu, không thương tích, không âm thanh gây sợ | 8.7 | V1, V2 |
| HP, KO 30 giây, người thua không nhận lệnh và đòn | 8.2, 8.1 | F4 |
| Meme nguyên gốc, không người thật, không nhân vật bản quyền | 9.1 | MM1 |
| Tối đa 3 phút, hết giờ thì hoà | 8.1 | F5 |
| Không điểm, không thưởng, không quà | 8.1 | Rà soát mã |
| Không đấu ở Z01 (khu tiếp khách) và Z09 (phòng máy chủ) | 8.9 | F11 |
| Không đấu khi đang họp (đặt phòng hoặc stand meeting) | 8.9 | F11, F19 |
| 3 trận mỗi giờ, hồi chiêu 2 phút | 8.9 | F10 |
| Chat: hai người, 7 ngày, chặn, 30 tin mỗi phút, báo cáo, không đọc ngoài phạm vi | 4.1 | C1 đến C6 |
| Audit tối thiểu, không ghi nội dung | 10.3 | C9 |

---

## 3. Kiến trúc

### 3.1 Chọn: service mới `social-service`, cổng 3010

Lý do:
- Không có service `world` trong repo, nên không có đích sẵn để gắn tính năng.
- Social có ba đặc thù khác các service hiện có: SSE, WebSocket cho trận, và các hẹn giờ (lượt họp, trận). Gắn vào một service khác sẽ làm lỗi lan sang các chức năng không liên quan.
- Trận đấu có vòng đời ngắn, tải đột biến. Tách riêng để giới hạn ảnh hưởng.
- 3010 chưa được dùng ở đâu trong repo.

Chi phí: thêm một process, một SQLite (`social.db`), một route gateway.

### 3.2 Cấu trúc đề xuất

```
services/social/
  package.json          express, better-sqlite3, ws (ghim phiên bản khi triển khai)
  src/index.js          khởi động; PORT=3010, HOST=127.0.0.1, AUTH_URL, DATA_DIR
  src/auth.js           mẫu karaoke; thêm kiểm role và kiểm lại /me mỗi 60 s cho kết nối dài
  src/db.js             schema mục 4.2, 5, 6, 8, 10
  src/stream.js         hub SSE dùng chung (một kết nối mỗi tab)
  src/chat/             tin riêng, chặn, báo cáo
  src/meeting/          trạng thái cuộc họp đứng, hẹn giờ lượt
  src/dance/            giới hạn, phát sự kiện nhảy
  src/sing/             phòng hát chung
  src/fight/            trọng tài, WebSocket, máy trạng thái trận
  src/meme/             mẫu chữ, lọc từ khoá
  src/audit.js          ghi audit tối thiểu
  src/flags.js          cờ tính năng
  config/blocklist.txt  từ khoá bị loại (IT giữ, không đưa vào tài liệu)
  config/meme.json      hai mẫu chữ, hai emote
```

### 3.3 Gateway (đề xuất, chưa sửa)

Thêm trước `location /api/`:

```nginx
    # social: chat, họp đứng, nhảy, hát chung (SSE) và trận đấu (WebSocket), cổng 3010.
    # Không có dấu / cuối để không bị 301 làm mất POST.
    location /api/social {
        proxy_pass http://127.0.0.1:3010;
        proxy_buffering off;
        proxy_cache off;
        proxy_http_version 1.1;
        proxy_read_timeout 3600s;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
```

Khai báo lại `Host`, `X-Forwarded-*`, `Upgrade`, `Connection` trong location vì khai báo `proxy_set_header` ở location làm mất kế thừa từ cấp server. Ghi chú này giống block `/api/display`.

### 3.4 Phụ thuộc

- auth (3001): `GET /api/auth/me`. Gọi khi mở mọi request, và khi mở SSE hoặc WebSocket. Kết nối dài kiểm lại mỗi 60 s, nếu 401 thì đóng. Nhờ đó đăng xuất có hiệu lực trong 60 s.
- it (3002): cần endpoint nội bộ mới, không nằm dưới `/api/` nên gateway không chuyển tiếp: `GET /internal/rooms/busy?userId=`. Trả `{busy, until}` khi có bản ghi `bookings` với `booked_by_id = userId` và `start_at <= now < end_at`. Đề xuất, chưa có trong repo. Social cache kết quả 10 s.
- karaoke (3004): không đổi. Hát chung dùng `GET /api/karaoke/songs` và `POST /api/karaoke/scores` như hiện tại.

### 3.5 Cờ tính năng

Bảng `social_flags(key TEXT PRIMARY KEY, enabled INTEGER, updated_at INTEGER, updated_by TEXT)`.

| Key | Mặc định | Bật ở pha |
|---|---|---|
| `dm` | bật | 1 |
| `meeting` | bật | 1 |
| `dance` | tắt | 2 |
| `sing_group` | tắt | 2 |
| `fight` | tắt | 4 |
| `meme` | tắt | 4 |

Khi cờ tắt, endpoint trả 503 `feature_disabled` và client ẩn nút. Đổi cờ có hiệu lực ngay, không cần khởi động lại. Khi tắt `fight`, mọi trận đang chạy đóng với lý do `cancelled_admin`.

### 3.6 Quy ước chung

- Id có tiền tố: `DM-`, `MT-`, `IV-`, `FM-`, `SG-`, `RP-`. Phần random 128 bit.
- Thời gian: ms epoch (INTEGER), như ONBOARDING_API.md.
- Lỗi: `{ok:false, code, error}`. `error` là tiếng Việt, `code` ổn định để frontend xử lý.
- Body JSON tối đa 4 KB. Riêng nội dung chat tối đa 1000 ký tự.
- Giới hạn tốc độ: bảng `social_rate(bucket, count, window_end)`, cửa sổ cố định như ONBOARDING_API.md mục 6.3. Khóa theo id người dùng, không theo IP (gateway chỉ thấy 127.0.0.1).

---

## 4. Chat riêng

### 4.1 Quy tắc an toàn (bắt buộc)

1. Chỉ hai người trong thread thấy tin. Mọi sự kiện SSE liên quan tới thread chỉ gửi tới các kết nối của đúng hai user id đó.
2. Lịch sử 7 ngày. Mỗi tin có `expires_at = created_at + 7 ngày`. Mọi truy vấn lọc `expires_at > now`. Job dọn chạy mỗi giờ và xoá dòng hết hạn.
3. Chặn: nếu A chặn B, cả hai chiều đều không gửi được tin, và thread bị ẩn với cả hai. Lỗi trả về giống hệt nhau: 403 `dm_unavailable`. Như vậy không lộ trạng thái chặn. Người bị chặn không thấy người chặn trong danh sách chọn người.
4. Giới hạn 30 tin mỗi người mỗi 60 giây (cửa sổ cố định). Vượt: 429 `rate_limited` kèm `retryAfter`.
5. Báo cáo: người nhận có nút "Báo cáo" trên từng tin. Báo cáo lưu bản chụp đúng một tin đó (nội dung, id người gửi, thời điểm). Không chụp tin khác của thread. Bản chụp xoá khi báo cáo được đóng, hoặc sau 30 ngày, tuỳ điều kiện đến trước. Chỉ IT và admin xem danh sách báo cáo.
6. Không đọc ngoài phạm vi đã báo. Không quét nội dung chat tự động, không lọc từ khoá tin riêng. Lọc từ khoá chỉ áp dụng cho chuỗi công khai do người dùng đặt: tên hiển thị trong meme, tiêu đề họp đứng, tiêu đề phòng hát, tên trên biển. Lý do: quét mọi tin là đọc tin riêng của người khác.
7. Văn bản thuần. Không HTML, không tự tạo liên kết (tránh lừa đảo nội bộ). Ký tự điều khiển bị loại bỏ. Chuỗi rỗng hoặc chỉ khoảng trắng bị từ chối.
8. Nội dung tin không vào log, audit, metrics. Log chỉ có mã lỗi.
9. Trình duyệt không lưu nội dung tin trong localStorage hoặc IndexedDB. Chỉ lưu id thread đang mở trong sessionStorage.
10. Admin khoá chat tạm thời (mục 10.2): 403 `feature_locked`.
11. Người không có tin nào trong 7 ngày vẫn thấy thread trống. Không có thông báo "tin đã hết hạn".

### 4.2 Mô hình dữ liệu

```sql
CREATE TABLE IF NOT EXISTS dm_threads (
  id          TEXT PRIMARY KEY,
  user_low    TEXT NOT NULL,
  user_high   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  last_seq    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_low, user_high),
  CHECK (user_low < user_high)
);

CREATE TABLE IF NOT EXISTS dm_messages (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,   -- thứ tự toàn cục, cũng là SSE event id
  id          TEXT NOT NULL UNIQUE,
  thread_id   TEXT NOT NULL REFERENCES dm_threads(id),
  sender_id   TEXT NOT NULL,
  body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dm_msg_thread ON dm_messages (thread_id, seq);
CREATE INDEX IF NOT EXISTS idx_dm_msg_expiry ON dm_messages (expires_at);

CREATE TABLE IF NOT EXISTS dm_reads (
  thread_id      TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  last_read_seq  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS social_blocks (
  blocker_id  TEXT NOT NULL,
  blocked_id  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS social_reports (
  id                TEXT PRIMARY KEY,
  kind              TEXT NOT NULL CHECK (kind IN ('dm','fight','meme','activity')),
  reporter_id       TEXT NOT NULL,
  reported_user_id  TEXT,
  target_id         TEXT NOT NULL,         -- id tin, trận, lần meme, hoặc hoạt động; không FK vì có thể đã hết hạn
  snapshot_body     TEXT,                  -- chỉ có với kind = 'dm': bản chụp đúng một tin
  reason_code       TEXT NOT NULL CHECK (reason_code IN ('harass','insult','inappropriate','spam','other')),
  note              TEXT CHECK (note IS NULL OR length(note) <= 200),
  status            TEXT NOT NULL CHECK (status IN ('open','closed')),
  created_at        INTEGER NOT NULL,
  closed_at         INTEGER,
  closed_by         TEXT,
  purge_at          INTEGER NOT NULL       -- created_at + 30 ngày
);
```

Ghi chú:
- Thread tạo lười: mở chat chưa tạo dòng. Dòng `dm_threads` chỉ tạo khi gửi tin đầu tiên.
- Tin chưa đọc = số tin của thread có `seq > last_read_seq`, không do mình gửi, và còn hạn.
- Không lưu IP, user agent, thiết bị trong bảng chat.

### 4.3 API

Prefix `/api/social`. Cần `sid` (scope full).

| Method | Đường dẫn | Ai | Mô tả | Lỗi chính |
|---|---|---|---|---|
| GET | `/dm/threads` | mọi người | Thread của tôi, số chưa đọc, tên đối phương. Ẩn thread bị chặn | 401 |
| POST | `/dm/threads` | mọi người | Body `{peerId}`. Trả `{threadId}`. Chưa tạo dòng cho đến tin đầu | 403 `dm_unavailable` |
| GET | `/dm/threads/:id/messages?beforeSeq=&limit=` | thành viên | Tin còn hạn, mới nhất trước, `limit` tối đa 50 | 403 `dm_unavailable` |
| POST | `/dm/threads/:id/messages` | thành viên | Body `{body}`, 1 đến 1000 ký tự. Trả `{id, seq, createdAt}` | 400 `invalid_input`, 403, 429 `rate_limited`, 403 `feature_locked` |
| POST | `/dm/threads/:id/read` | thành viên | Body `{upToSeq}` | 400 |
| POST | `/dm/messages/:id/report` | thành viên, không phải người gửi tin | Body `{reasonCode, note?}`. Tạo báo cáo kèm bản chụp một tin | 409 `already_reported`, 403 |
| GET | `/blocks` | tôi | Danh sách người tôi chặn | 401 |
| POST | `/blocks` | tôi | Body `{userId}`. Không chặn chính mình | 400 |
| DELETE | `/blocks/:userId` | tôi | Bỏ chặn | 200 |
| GET | `/stream` | tôi | SSE chung cho mọi tính năng, mục 4.4 | 503 khi đủ 2000 kết nối |

### 4.4 Đồng bộ realtime: chọn SSE

Chọn SSE (Server-Sent Events) cho chat, và cho các sự kiện một chiều còn lại (họp đứng, nhảy, lời mời đấu, phòng hát).

Lý do:
- Chat chỉ cần server đẩy xuống. Gửi tin đi bằng POST, đơn giản và retry được.
- Repo đã có mẫu chạy được (`services/display/src/sse.js`), gateway đã cấu hình (block `/api/display`).
- Trình duyệt tự nối lại và gửi `Last-Event-ID`. Không cần giao thức riêng.
- Polling bị loại: 30 tin mỗi người mỗi phút, nhiều người cùng lúc. Polling 3 giây vừa tạo tải vừa để tin trễ tới 3 giây. Một kết nối SSE cho mỗi tab rẻ hơn.
- WebSocket không dùng cho chat để giữ một cơ chế cho các tính năng một chiều. Trận đấu là ngoại lệ, lý do ở mục 8.4.

Chi tiết:
- Header: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`.
- Sự kiện:
  - `dm.message`: `id` = seq; data `{threadId, id, seq, senderId, body, createdAt}`, chỉ gửi cho hai thành viên.
  - `dm.read`: `{threadId, userId, lastReadSeq}`.
  - `dm.revoked`: thread bị chặn hoặc khoá, client đóng thread.
  - `meeting.state`, `meeting.turn`, `meeting.queue`, `meeting.invite`: gửi cho người liên quan (lời mời) hoặc toàn bộ client (trạng thái vòng đứng, chỉ có tiêu đề, số người và tên host).
  - `dance.start`, `dance.stop`: gửi tới mọi client, client tự lọc theo khoảng cách.
  - `sing.state`, `fight.invite`, `fight.invite.update`, `fight.match`, `meme.show`, `flag.changed`.
- Heartbeat `: ping` mỗi 25 giây. `retry: 3000`.
- Nối lại: server đọc `Last-Event-ID`, phát lại tối đa 200 tin có `seq` lớn hơn, thuộc thread của người đó, còn hạn. Nếu còn nhiều hơn, client gọi GET messages để lấy phần còn lại.
- Hub trong bộ nhớ: `Map<userId, Set<res>>`. Một người mở nhiều tab đều nhận. Chạy một instance, đúng với cách chạy hiện tại (network_mode host).
- Giới hạn: 2000 kết nối (như display). Vượt: 503.
- Gửi tin: POST trả về sau khi ghi DB. SSE phát sau commit. Người gửi cũng nhận event qua SSE (đồng bộ tab khác). UI hiện tin ngay với id tạm, đối chiếu khi event tới.

### 4.5 Giao diện (panel)

- Điểm mở chat: bấm nhân vật trong 3D, mở thẻ người (panel neo gần nhân vật, theo DESIGN_V2 1.5). Thẻ có tên, trạng thái (trực tuyến, bận, đang họp, vắng), nút "Nhắn tin", "Thách đấu" (chỉ hiện khi cờ `fight` bật), "Chặn".
- Hộp thư: biểu tượng trên HUD góc dưới phải, kèm số chưa đọc. Desktop: hai cột, danh sách bên trái và khung chat bên phải. Điện thoại (dưới 400 px): một cột, nút Quay lại.
- Khung chat: rộng tối đa 360 px, không che hết 3D, có nút thu nhỏ. Esc đóng, Tab chuyển, nút gửi vùng chạm 40 px.
- Thông báo: chấm đỏ trên biểu tượng. Không có âm thanh mặc định.
- Nếu đối phương đang họp đứng hoặc đang đấu: khung hiện "Đang bận. Tin sẽ được xem sau." Vẫn cho gửi.
- Nút "Báo cáo" trên từng tin nhận được (vùng chạm 40 px). Form: chọn lý do (`harass`, `insult`, `inappropriate`, `spam`, `other`), ghi chú tuỳ chọn tối đa 200 ký tự, nút Gửi, xác nhận "Đã gửi cho IT".
- Khi đang đọc tin cũ, tin mới không tự cuộn xuống. Hiện nút "Tin mới".
- Không làm mờ hay che nội dung tự động.

---

## 5. Stand meeting (họp đứng)

### 5.1 Vị trí và quy định

- Hai điểm đứng cố định, toạ độ do đội 3D đặt:
  - N-1 ở Khu Bắc (Z04), trên sàn mở, không vào vùng NOC.
  - L-1 ở Sảnh (Z01), cạnh Service Desk, không chắn lối vào.
- Không đặt phòng họp kín. Họp đứng không tạo bản ghi trong `bookings`.
- Hình: vòng tròn bán kính 2 m, tối đa 12 vị trí, cách nhau 30 độ (khoảng 1.04 m giữa hai người gần nhau).
- Ai được tạo: mọi nhân viên (`employee`, `it`, `admin`). Một người chỉ là host của một cuộc họp cùng lúc.
- Tối đa 12 người, gồm host. Hàng đợi phát biểu tối đa 12 mục.
- MVP không truyền giọng nói và không ghi âm (mục 13). Lượt phát biểu là trạng thái hiển thị. Giọng nói diễn ra ở công cụ họp bên ngoài.
- Khi đang họp đứng: không nhảy (mục 6), không thách đấu, không nhận lời mời đấu. Chat vẫn dùng bình thường.

### 5.2 Quy trình

1. Tạo: host bấm "Họp đứng", chọn điểm (N-1 hoặc L-1), nhập tiêu đề tối đa 40 ký tự (lọc từ khoá, mục 9.2). `POST /meetings`. Trạng thái `open`.
2. Mời: host chọn tối đa 11 người (`POST /meetings/:id/invites`). Lời mời hết hạn sau 60 giây. Người nhận bấm Tham gia hoặc Bỏ qua. Người đã chặn host không nhận lời mời.
3. Vào: người chấp nhận được đi bộ tự động tới vị trí trống gần nhất trên vòng tròn. Đủ 12 thì từ chối: "Cuộc họp đã đủ người".
4. Bắt đầu: host bấm "Bắt đầu" (trạng thái `live`). Trước khi bắt đầu, người tham gia thấy vòng đứng và danh sách.
5. Hàng đợi: bấm "Xin phát biểu" (`POST /meetings/:id/queue`). Vào cuối hàng theo FIFO. Mỗi người tối đa một mục. Bấm "Rút" để rời hàng.
6. Lượt: người đầu hàng có lượt 60 giây. Máy chủ giữ `turnStartedAt` và `turnEndsAt`. Client đếm ngược theo `turnEndsAt` đã hiệu chỉnh độ lệch đồng hồ. Hết 60 giây, hoặc người nói bấm "Xong" (`POST /meetings/:id/turn/done`), thì chuyển sang người kế tiếp. Host có thể bỏ qua lượt hiện tại (`POST /meetings/:id/skip`).
7. Kết thúc: host bấm "Kết thúc", hoặc tự động khi:
   - còn dưới 2 người trong 60 giây;
   - đạt 30 phút tổng thời lượng;
   - hàng đợi trống liên tục 5 phút;
   - host rời cuộc họp. MVP không chuyển host.
8. Sau kết thúc: vòng đứng trống. Lưu tóm tắt (tiêu đề, số người tối đa đạt được, thời lượng, số lượt). Không lưu nội dung.

Hẹn giờ: máy chủ dùng một hẹn giờ cho mỗi cuộc họp, huỷ khi cuộc họp kết thúc. Khi khởi động lại, cuộc họp `live` đóng với lý do `server_restart`.

### 5.3 API

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/meetings` | Body `{spot, title}`, `spot` thuộc `{north, lobby}` |
| GET | `/meetings/active` | Danh sách `open` và `live` để vẽ vòng đứng |
| POST | `/meetings/:id/invites` | Body `{userIds[]}`, tối đa 11 và tổng không quá 12 |
| POST | `/meetings/:id/respond` | Body `{accept}` |
| POST | `/meetings/:id/start` | Chỉ host |
| POST | `/meetings/:id/queue` và DELETE | Xin phát biểu và rút |
| POST | `/meetings/:id/turn/done` | Người có lượt bấm Xong |
| POST | `/meetings/:id/skip` | Chỉ host |
| POST | `/meetings/:id/leave` | Rời. Host rời thì kết thúc |
| POST | `/meetings/:id/end` | Chỉ host |

---

## 6. Nhảy nhót

### 6.1 Sáu điệu (hoạt ảnh tối giản, nguyên gốc)

Mỗi điệu là chuỗi keyframe procedural trong code, theo AVATAR_SPEC mục 6.3 B. Không dùng điệu có sẵn, không sao chép động tác từ bài hát hay video nào. Không có tệp animation bên ngoài nên không có rủi ro license.

| # | Tên | Hoạt ảnh | Thời lượng vòng |
|---|---|---|---|
| 1 | Nhún gối | Hạ hông rồi nâng, hai tay buông thõng | 2 s |
| 2 | Lắc vai | Xoay vai theo nhịp, đầu lắc nhẹ | 2 s |
| 3 | Bước chân | Bước trái phải, thân nghiêng theo bước | 2 s |
| 4 | Xoay tay | Hai tay xoay vòng quanh vai | 2 s |
| 5 | Nhảy tại chỗ | Nhảy nhẹ 6 cm, gối gập khi tiếp đất | 1.5 s |
| 6 | Chữ V | Giơ hai tay hình chữ V rồi hạ xuống | 2.5 s |

Mỗi lần chạy tối đa 8 giây, rồi dừng ở cuối vòng gần nhất.

### 6.2 Kích hoạt

- Phím: khi không đang nhập chat, phím 1 đến 6 bắt đầu điệu tương ứng. Phím X hoặc Esc dừng. Mọi phím di chuyển (mũi tên, WASD) cũng dừng ngay.
- Nút: nút "Nhảy" trên HUD mở menu sáu nút (vùng chạm 40 px). Trên cảm ứng, dùng menu này.
- Nút DỪNG luôn hiện khi đang nhảy, ngay trên nhân vật và trên HUD. Dừng tức thời, không chờ hết vòng, không có hộp xác nhận.

### 6.3 Ai thấy

- Người ở cùng khu cho phép (Z02, Z03, Z04, Z05, Z08) và cách không quá 8 m thấy nhân vật nhảy. Kèm nhãn nhỏ "Đang nhảy: Nhún gối" trong 2 giây đầu. Không âm thanh.
- Người xa hơn không thấy điệu, chỉ thấy nhân vật đứng.
- Cài đặt "Ẩn hiệu ứng nhảy của người khác": người đó thấy các nhân vật khác đứng yên.
- Giảm chuyển động (theo hệ điều hành hoặc cài đặt trong game): điệu hiển thị một khung tĩnh (tư thế cuối) cùng nhãn, không chuyển động.

### 6.4 Không gây khó chịu

- Không nhảy ở Z01, Z06, Z07, Z09. Không nhảy khi đang họp đứng, đang đấu, hoặc bị khoá tính năng.
- Cooldown: bắt đầu điệu tối đa mỗi 3 giây. Vượt: 429 `dance_cooldown`.
- Điệu tự dừng sau 8 giây. Không có chế độ lặp vô hạn.
- Máy chủ phát `dance.start` tối đa một lần mỗi 3 giây cho mỗi người.
- Di chuyển hoặc đổi khu thì huỷ điệu.
- Nút Dừng là lối thoát duy nhất cần thiết. Không ép ai làm theo, không che màn hình.

### 6.5 API

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/dance` | Body `{id}`, `id` từ 1 đến 6. 200 `{startedAt, endsAt}`. 409 `dance_unavailable` (khu, họp, đấu). 429 `dance_cooldown` |
| POST | `/dance/stop` | Dừng ngay |

Vị trí và khu do client báo. Máy chủ chỉ kiểm tra theo khu báo cáo, để chặn nhầm. Đây không phải chống gian lận (mục 14).

---

## 7. Hát chung trong karaoke (tham chiếu, không thiết kế lại)

### 7.1 Hiện có

`services/karaoke` (3004): danh sách bài, `POST /api/karaoke/scores`, bảng xếp hạng top 20, lịch sử cá nhân, cờ `suspicious`. Điểm do trình duyệt tính bằng pitchy. Mọi vai trò hát được. Không đổi.

"Phòng karaoke" trong DESIGN_V2 là khu Z05 Lounge Đông, không phải phòng kín. Chỗ hát là sân khấu nhỏ và góc karaoke trong Z05.

### 7.2 Thêm: chế độ hát chung

- Người muốn hát chung mở "Hát chung" từ màn hình karaoke, chọn bài trong danh sách hiện có. Phòng chờ `SG-` mở 60 giây. Ai đứng trong Z05 gần sân khấu có thể tham gia.
- Tối đa 8 người hát. Host bấm Bắt đầu. Máy chủ phát `sing.state` với `startAt = now + 3000` ms. Mọi client bắt đầu nhạc và chấm điểm từ cùng mốc, đã hiệu chỉnh độ lệch đồng hồ.
- Mỗi người chấm điểm trên trình duyệt và gửi `POST /api/karaoke/scores` như hiện nay (không đổi schema, vẫn chịu giới hạn 30 lượt mỗi giờ). Đồng thời gửi điểm tới social để tổng hợp bảng phòng.
- Bảng điểm phòng hiện sau bài, xếp theo điểm trong phiên đó. Lưu trong bộ nhớ, mất khi phòng kết thúc. Bảng xếp hạng chính của karaoke không đổi.
- Không mở hát chung khi đang họp đứng hoặc đang đấu. Cờ `sing_group` tắt cho đến pha 2.
- Nếu một người mất kết nối giữa bài, người đó bị loại khỏi bảng điểm phòng. Không ảnh hưởng người khác.

### 7.3 API social cho hát chung

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/sing/rooms` | Body `{songId}`. Tạo phòng, host là người đầu tiên |
| POST | `/sing/rooms/:id/join` | Tham gia khi phòng còn mở và chưa đủ 8 |
| POST | `/sing/rooms/:id/start` | Chỉ host |
| POST | `/sing/rooms/:id/score` | Body `{score, accuracy}`, cùng khoảng giá trị như karaoke (0 đến 100, 0 đến 1) |

---

## 8. Thi đấu võ thuật

### 8.1 Máy trạng thái

Trạng thái lời mời:

| Mã | Tên hiển thị | Ý nghĩa |
|---|---|---|
| `invited` | Mời | Đã gửi, chờ người nhận, tối đa 60 s |
| `declined` | Từ chối | Người nhận từ chối |
| `expired` | Hết hạn | Quá 60 s không trả lời |
| `cancelled` | Huỷ | Người mời huỷ, hoặc điều kiện không còn đủ |
| `accepted` | Chấp nhận | Tạo trận, chuyển sang `preparing` |

Trạng thái trận:

| Mã | Tên hiển thị | Mô tả |
|---|---|---|
| `idle` | Chờ | Không có trận. Đây là trạng thái mặc định của mỗi người |
| `preparing` | Chuẩn bị | 3 giây. Hai nhân vật đi tới hai góc đối diện của vòng đấu, đếm ngược 3, 2, 1, Đấu. Không nhận đòn. Điều kiện được kiểm lại. Lỗi thì `cancelled` |
| `fighting` | Đấu | Tối đa 180 giây. Nhận lệnh, tính đòn |
| `ko` | KO | HP một bên về 0. Người thua nằm đơ 30 giây, không nhận lệnh và đòn. Người thắng ở tư thế chiến thắng. Kết quả chốt tại đây. Meme hiện (mục 9) |
| `ended` | Kết thúc | Sau 30 giây người thua đứng dậy. Màn kết quả 5 giây. Hồi chiêu 120 giây cho cả hai |

Kết quả trận:

| Result | Khi nào | Tính giới hạn 3 trận/giờ |
|---|---|---|
| `win_ko` | HP một bên về 0 | Có |
| `win_forfeit_disconnect` | Một bên không phản hồi 10 giây (mục 8.6) | Có |
| `win_forfeit_quit` | Một bên bấm Bỏ cuộc | Có |
| `timeout_draw` | Hết 180 giây, HP cả hai lớn hơn 0 | Có |
| `draw_ko` | HP cả hai về 0 trong cùng một tick | Có |
| `cancelled` | Huỷ trước khi vào `fighting`, hoặc máy chủ khởi động lại | Không |

Trận được tính vào giới hạn khi bước vào `fighting`. Không có điểm, không tiền, không quà trong mọi kết quả.

Sơ đồ:

```
mời --chấp nhận--> chuẩn bị --3 s--> đấu --HP = 0--> KO --30 s--> kết thúc
mời --từ chối / hết 60 s / huỷ--> từ chối | hết hạn | huỷ
chuẩn bị --điều kiện hỏng--> huỷ
đấu --180 s--> hoà --> kết thúc
đấu --mất kết nối 10 s--> thắng do mất kết nối --> kết thúc
đấu --HP cùng về 0--> hoà KO (cả hai nằm 30 s) --> kết thúc
```

### 8.2 Bảng thông số

Chung:

| Mục | Giá trị |
|---|---|
| HP tối đa | 100 mỗi bên, không hồi trong trận |
| Tick máy chủ | 20 lần mỗi giây (50 ms) |
| Chuẩn bị | 3 giây |
| Thời lượng tối đa | 180 giây |
| Vòng đấu | Vuông 4 m x 4 m ở sàn trống khu Z05 |
| Khoảng cách bắt đầu | 2.0 m |
| Di chuyển | 1.5 m/s, không ra khỏi vòng |
| KO | Người thua nằm đơ 30 giây |
| Hết giờ | Hoà |
| Gợi ý chậm | Sau 40 giây không có đòn trúng, hiện "Chưa có đòn trúng". Không kết thúc sớm |

Đòn cơ bản:

| Đòn | Sát thương | Tung đòn (telegraph) | Tầm | Hồi chiêu | Né | Đỡ |
|---|---|---|---|---|---|---|
| Đấm thẳng (jab) | 5 | 350 ms | 1.2 m | 800 ms | Cửa sổ 300 ms, xem quy tắc dưới | Giảm 70%, nhận 2 |
| Móc (hook) | 9 | 500 ms | 1.2 m | 1800 ms | Cửa sổ 300 ms | Giảm 70%, nhận 3 |
| Né (dodge) | 0 | 0 | Không | 1200 ms | Hoạt động 300 ms, di chuyển 0.6 m | Không áp dụng |
| Đỡ (block) | 0 | 0 | Không | 500 ms sau khi thả | Giữ tối đa 1000 ms | Giảm 70% khi giữ lúc chạm |
| Di chuyển | 0 | Không | Không | Không | Không | Không |

Quy tắc đòn:
- Gọi T là thời điểm đòn chạm, bằng lúc tung cộng thời gian tung. Né thành công khi T nằm trong khoảng [d, d + 300 ms], với d là lúc lệnh né được ghi nhận sau khi bù trễ (mục 8.5).
  - Jab: né từ +50 ms đến +350 ms so với lúc bắt đầu tung.
  - Hook: né từ +200 ms đến +500 ms.
- Đỡ: giữ đỡ tại thời điểm chạm thì giảm sát thương. Thả trước thời điểm chạm thì nhận đủ.
- Trúng: khoảng cách lúc chạm không quá 1.2 m. Ngoài tầm là `miss`.
- Kết quả gửi về client: `hit`, `block`, `dodge`, `miss`.
- Đòn đang tung không huỷ được. Hồi chiêu tính từ lúc nhận lệnh.
- Không combo, không đòn đặc biệt, không hồi máu. Mục tiêu là đơn giản và dễ kiểm chứng.

Ước lượng cân bằng (chưa đo):
- Mỗi người tung 1 đòn mỗi 1.5 giây (0.67 đòn mỗi giây), 70% jab và 30% hook, 50% trúng.
- Sát thương trung bình mỗi đòn: 0.7 x 5 + 0.3 x 9 = 6.2. Mỗi giây: 0.33 đòn trúng x 6.2 ≈ 2.1 sát thương.
- Ước lượng KO sau khoảng 50 đến 70 giây, đã trừ né và đỡ. Nếu đo thực tế khác, điều chỉnh sát thương, giữ nguyên 180 giây.

### 8.3 Điều khiển

| Hành động | Phím (máy tính) | Nút cảm ứng |
|---|---|---|
| Di chuyển | Mũi tên hoặc WASD | Joystick ảo ở góc dưới trái, vùng 120 px |
| Đấm thẳng | J | Nút "Thẳng" |
| Móc | K | Nút "Móc" |
| Né | L hoặc Shift | Nút "Né" |
| Đỡ (giữ) | Space | Nút "Đỡ", giữ để đỡ |
| Bỏ cuộc | Esc, rồi xác nhận | Nút "Bỏ cuộc", rồi xác nhận |

- Mọi nút có vùng chạm 40 px. Tab chuyển giữa các nút, focus 2 px.
- Trước trận có màn hướng dẫn 10 giây, bỏ qua được.
- Hộp xác nhận nằm trong trang, không dùng hộp thoại của trình duyệt.

### 8.4 Đồng bộ hai máy và trọng tài server

- Kênh: WebSocket tại `/api/social/fight/ws?matchId=FM-...`. Gateway đã khai báo Upgrade cấp server.
- Lý do chọn WebSocket cho trận: mỗi lệnh phải đi lên server với độ trễ thấp. POST cho mỗi lệnh tốn một vòng HTTP và không giữ trạng thái. SSE chỉ dùng cho lời mời và thông báo trận.
- Xác thực khi upgrade: `sid` trong cookie. User phải là một trong hai người của trận. Kiểm `Origin` khớp origin của gateway (chống WebSocket hijacking từ trang khác). Kiểm lại `/me` mỗi 60 giây.
- Client gửi lên:
  - `{t:'in', seq, a:'jab'|'hook'|'dodge'|'guard_on'|'guard_off'|'move', dx?, dy?, rtt?}`
  - `{t:'ping', ts}`
- Server gửi xuống:
  - `{t:'st', tick, hp:{me,op}, pos:{me,op}, ev:[{k, by, dmg?}], left}`, tối đa 20 khung mỗi giây, chỉ khi có thay đổi
  - `{t:'ko', loser, reason}`
  - `{t:'end', result, reason}`
- Trọng tài: máy chủ giữ toàn bộ trạng thái (vị trí, HP, hồi chiêu, đòn đang tung, cửa sổ né, trạng thái đỡ). Client không gửi HP, sát thương hay kết quả né. Trường lạ bị bỏ, và không đóng kết nối.
- Dự đoán phía client chỉ ảnh hưởng hình ảnh: animation của mình chạy ngay khi bấm. Kết quả trúng hoặc né hiện khi server xác nhận. Vị trí đối thủ nội suy theo `st`.
- Thứ tự: `seq` tăng dần. Lệnh có `seq` nhỏ hơn hoặc bằng lệnh đã xử lý bị bỏ.
- Giới hạn: 30 lệnh mỗi giây cho mỗi người. Lệnh vượt bị bỏ. Vượt 200 lệnh mỗi giây liên tục 3 giây thì đóng kết nối và tính như mất kết nối.
- Tải: 20 trận đồng thời là khoảng 40 kết nối, mỗi kết nối tối đa 20 khung/giây x 300 byte. Không đáng kể. Giới hạn cứng 20 trận đồng thời. Trận thứ 21 nhận 503 `fight_busy`.

### 8.5 Độ trễ chấp nhận

- Phản hồi cục bộ (animation khi bấm): dưới 50 ms, không chờ server.
- Kết quả trúng hoặc né từ server: RTT cộng tối đa một tick (50 ms). Mục tiêu: RTT P95 dưới 200 ms là đủ để chơi.
- RTT từ 200 đến 400 ms: hiện biểu tượng "mạng chậm". Trận vẫn chạy.
- RTT trên 400 ms liên tục 5 giây: hiện "Kết nối yếu, trận có thể bị huỷ nếu mất kết nối".
- Bù trễ cho né: client báo `rtt` trong lệnh. Máy chủ cộng nửa RTT, tối đa 150 ms, vào thời điểm nhận lệnh né. Giới hạn 150 ms ngăn lợi dụng.
- Hệ quả: với RTT 200 ms, người phản ứng sau 250 ms khi thấy tung đòn vẫn né được jab (cửa sổ 300 ms). Kiểm chứng ở mục 11.

### 8.6 Mất kết nối

- Client gửi ping mỗi 1 giây. Máy chủ coi là mất kết nối khi không nhận khung nào trong 10 giây, hoặc khi WebSocket đóng và không nối lại trong 10 giây.
- Trong thời gian chờ 10 giây, nhân vật người mất kết nối đứng yên và không nhận đòn mới. Đối thủ không được lợi.
- Quá 10 giây: trận kết thúc `win_forfeit_disconnect`, đối thủ thắng. Màn hình hiện lý do: "Đối thủ không phản hồi quá 10 giây. Bạn thắng." Người mất kết nối khi nối lại thấy: "Bạn mất kết nối quá 10 giây. Trận đã kết thúc."
- Nối lại trong 10 giây: kết nối lại với cùng `matchId`. Máy chủ gửi `st` đầy đủ. Trận tiếp tục, không phạt.
- Lạm dụng: ai bị `win_forfeit_disconnect` do mình ba lần trong 24 giờ bị khoá thi đấu 24 giờ.
- Máy chủ khởi động lại giữa trận: trận đóng `cancelled`, không tính giới hạn, không ai thắng.

### 8.7 Hoạt ảnh và hình ảnh

- Nhân vật thi đấu là khối và khớp: thân là hộp, đầu là khối, tay chân là trụ nối bằng khớp (khoảng 12 khớp). Màu áo và màu tóc lấy từ `appearance` để người xem nhận ra người. Không có mặt chi tiết, không có texture da, không có vết thương, không đổ máu.
- Đòn: tia sáng hình sao hoặc vệt ngắn khi trúng. Đỡ có viền sáng. Né có vệt mờ phía sau nhân vật.
- Găng tay là khối tròn một màu.
- KO: nhân vật ngã thẳng ra sàn, nằm đơ, có biểu tượng "zzz" nhỏ trên đầu. Không đặt góc máy cận cảnh.
- Thanh HP: màu xanh lá, vàng, rồi đỏ nhạt khi thấp. Không dùng đỏ đậm, không dùng chữ liên quan tới máu.
- Âm thanh: mặc định tắt. Khi bật chỉ có tiếng "bộp" ngắn, âm lượng thấp. Không có tiếng la hét, tiếng va đập mạnh, tiếng hò reo lớn.
- Camera không rung. Giảm chuyển động: không chuyển cảnh.
- Vòng đấu: sàn xanh than, đèn nhẹ, biển "Vòng đấu văn phòng". Không có logo, không có hình người thật.

### 8.8 API

| Method | Đường dẫn | Mô tả | Lỗi |
|---|---|---|---|
| POST | `/fight/invites` | Body `{targetId}`. 201 `{inviteId, expiresAt}` | 403 `fight_unavailable` (chung cho mọi lý do của bên kia), 429 `rate_limited`, 429 `fight_cooldown` (lý do của chính người mời) |
| POST | `/fight/invites/:id/accept` | Người nhận. 200 `{matchId}` | 409 `invite_expired`, 403 `fight_unavailable` |
| POST | `/fight/invites/:id/decline` | Người nhận | 200 |
| POST | `/fight/invites/:id/cancel` | Người mời | 200 |
| GET | `/fight/status` | `{matchesLastHour, cooldownUntil, canFight}` của tôi | 401 |
| GET | `/fight/history?limit=` | Lịch sử của tôi, tối đa 50 | 401 |
| WS | `/fight/ws?matchId=` | Mục 8.4 | 403 `origin`, 401, 404 |

Lịch sử trận (`fight_matches`): `id`, `a_id`, `b_id`, `started_at`, `ended_at`, `duration_ms`, `result`, `winner_id` (null khi hoà), `end_reason`. Không lưu chuỗi đòn, không lưu số đòn.

### 8.9 Điều kiện mời

Kiểm ở ba thời điểm: khi tạo lời mời, khi chấp nhận, và khi bước vào `preparing`. Không đấu nếu:

1. Một bên không online: `lastSeen` quá 60 giây.
2. Người nhận bật "không nhận thách đấu".
3. Một bên đang trong cuộc họp đứng (`open` hoặc `live`), với bất kỳ vai trò nào.
4. Một bên đang có bản ghi đặt phòng họp đang diễn ra (`/internal/rooms/busy`), hoặc khu báo cáo là Z06.
5. Một bên đang ở Z01 hoặc Z09 (khu tiếp khách, phòng máy chủ). Khu cho phép để mời và chấp nhận: Z02, Z03, Z04, Z05, Z08.
6. Hai bên đã chặn nhau (một trong hai chiều).
7. Người mời đã đủ 3 trận trong 60 phút gần nhất, hoặc một bên đang hồi chiêu 120 giây sau trận.
8. Một bên bị khoá tính năng, hoặc cờ `fight` tắt.
9. Một bên đang có lời mời khác (mỗi người một lời mời mở tại một thời điểm), hoặc đang đấu.
10. Người mời đã bị từ chối hai lần liên tiếp bởi cùng người nhận: không được mời người đó trong 24 giờ.
11. Người mời đã gửi quá 5 lời mời trong 60 phút.

Trận diễn ra tại vòng đấu ở Z05. Khi chuẩn bị, hai người đi bộ tới hai góc của vòng đấu. Không tới đủ trong 60 giây thì trận huỷ `cancelled`.

Thông báo lỗi: các lý do 1, 2, 3, 4, 5, 6, 8, 9 trả về chung `fight_unavailable`. Không tiết lộ lý do phía đối phương. Lý do của chính người mời (cooldown, giới hạn) hiện rõ.

Người đang đấu không nhận lời mời họp đứng, và người đang họp không nhận lời mời đấu.

---

## 9. Meme giữa phòng

### 9.1 Cơ chế

- Khi trận kết thúc bằng `ko` hoặc `draw_ko`, máy chủ chọn một mẫu chữ và một emote, rồi phát `meme.show` cho người đang ở Z05 trong bán kính 12 m.
- Khung chữ nổi trên đầu người thua, 4 giây, nền trắng đục theo DESIGN_V2 1.5, chữ 14 px, tối đa 60 ký tự.
- Emote: biểu tượng SVG tự vẽ, hiện 2 giây. Hai emote có sẵn:
  - E1: "zzz" (người thua đang nghỉ).
  - E2: giọt mồ hôi nhỏ (nhẹ, không chảy máu).
- Tối đa 2 mẫu chữ. Mẫu do người dùng tạo không có trong MVP.

Mẫu chữ (nguyên gốc, dùng tên hiển thị đã lọc):
- M1: "KO! {loser} nghỉ 30 giây theo luật văn phòng. Mời một ly nước."
- M2: "Tỷ số cuối: {winner} thắng. {loser} xin nghỉ trưa sớm."

Ràng buộc:
- Không dùng hình người thật, ảnh chụp, meme nổi tiếng, nhân vật có bản quyền, câu thoại từ phim, game hay bài hát.
- Không hiện meme ở Z01, Z06, Z07, Z09, trong họp đứng, hoặc trong trận khác.
- Chỉ dùng tên hiển thị (không dùng họ tên đầy đủ hay email).

### 9.2 Đảm bảo không xúc phạm

- Lọc tên hiển thị trước khi chèn vào mẫu. Chuẩn hoá: chữ thường, bỏ dấu, gộp ký tự lặp, đổi chữ giống số (0 thành o, 1 thành i, 3 thành e, 4 thành a, 5 thành s, 7 thành t, 8 thành b, @ thành a). Nếu có từ khoá bị loại thì dùng "Đồng nghiệp".
- Danh sách từ khoá bị loại được giữ trong `config/blocklist.txt`, IT quản lý. Tài liệu này không liệt kê từ cụ thể. Nhóm loại:
  1. Xúc phạm trí tuệ và ngoại hình.
  2. Bạo lực và chấn thương (từ chỉ máu, gãy xương, giết, đánh chết và biến thể).
  3. Tình dục và ngôn từ thô tục.
  4. Phân biệt giới, vùng miền, dân tộc, tôn giáo, chính trị.
  5. Đe doạ và quấy rối nhắm vào người cụ thể.
  6. Thông tin cá nhân (số điện thoại, email, số định danh) bằng biểu thức chính quy.
- Lọc áp dụng cho: tên trong meme, tiêu đề họp đứng, tiêu đề phòng hát, tên biển và tên phòng do người dùng nhập. Không áp dụng cho chat riêng (mục 4.1, điều 6).
- Danh sách từ khoá tải lại khi IT cập nhật file (không cần khởi động lại toàn service).

### 9.3 Tắt

- Cài đặt người xem "Tắt meme giữa phòng": người bật không thấy khung chữ và emote. Không ảnh hưởng người khác.
- Cài đặt người thua "Không hiện meme khi tôi thua": mặc định tắt (meme hiện). Khi bật, máy chủ không phát meme cho trận đó.
- Cờ `meme` toàn cục: admin tắt được.

---

## 10. Quy định ứng xử và quản trị

### 10.1 Báo cáo

| Loại | Ai báo | Thông tin gửi IT và admin | Giữ đến |
|---|---|---|---|
| Tin chat | Người nhận | Bản chụp một tin, lý do, ghi chú tối đa 200 ký tự | Đến khi đóng, tối đa 30 ngày |
| Trận đấu | Người thi đấu | Id trận, lý do. Không có chuỗi đòn | Theo lịch sử trận, 180 ngày |
| Meme | Người xem | Id lần meme, lý do | 30 ngày |
| Hoạt động (nhảy, họp, hát) | Bất kỳ ai | Id đối tượng, lý do | 30 ngày |

- Trạng thái báo cáo: `open` rồi `closed`. Hành động khi đóng: `dismiss`, `warn`, `lock`.
- Người báo cáo không nhận kết quả trong MVP.
- Chặn có hiệu lực ngay với chat, lời mời đấu và lời mời họp. Người bị chặn không biết ai đã chặn.

### 10.2 Khoá tạm và tắt toàn cục

- Khoá tạm theo tính năng (`dm`, `fight`, `meeting`, `dance`, `sing`, hoặc `all_social`) cho một người. IT khoá tối đa 3 ngày, admin tối đa 30 ngày. Lý do chọn từ danh sách mã. Người bị khoá thấy "Tính năng đang tạm khoá. Liên hệ IT." Không tiết lộ người báo cáo.
- Tắt toàn cục: admin đổi cờ qua `PUT /admin/flags`. Các kết nối đang mở nhận `flag.changed`. Trận đang chạy đóng với lý do `cancelled_admin`.

| Method | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/admin/flags` | it, admin | Xem cờ |
| PUT | `/admin/flags` | admin | Body `{key, enabled}` |
| GET | `/admin/reports?status=open` | it, admin | Danh sách báo cáo |
| POST | `/admin/reports/:id/close` | it, admin | Body `{action}`: `dismiss`, `warn`, `lock` |
| POST | `/admin/locks` | it (tối đa 3 ngày), admin (tối đa 30 ngày) | Body `{userId, feature, days, code}` |
| DELETE | `/admin/locks/:id` | it, admin | Gỡ khoá |

IT xem được nội dung báo cáo chat nhưng không tự đổi cờ toàn cục. Admin làm được mọi việc.

### 10.3 Audit tối thiểu

Bảng `social_audit(id, at, actor_id, kind, target_id NULL, code NULL)`.

Các `kind`: `dm.send` (target là id thread), `dm.block`, `dm.unblock`, `dm.report`, `meeting.create`, `meeting.join`, `dance.start`, `sing.create`, `fight.invite`, `fight.accept`, `fight.decline`, `fight.start`, `fight.end` (target là id trận, code là result), `admin.flag`, `admin.lock`, `admin.report.close`.

- Không ghi: nội dung tin, tiêu đề, ghi chú báo cáo, nội dung meme, số đòn, toạ độ.
- Giữ 90 ngày, xoá tự động.
- Log ứng dụng: chỉ mã lỗi và thời gian xử lý. Không body, không cookie, không id tin.

### 10.4 Giữ dữ liệu

| Dữ liệu | Thời hạn | Ghi chú |
|---|---|---|
| Tin chat | 7 ngày | Job dọn mỗi giờ |
| Bản chụp báo cáo chat | Đến khi đóng, tối đa 30 ngày | Mục 14 |
| Lịch sử trận | 180 ngày | Tên, kết quả, thời lượng. Không nội dung |
| Audit | 90 ngày | Mục 14 |
| Tóm tắt họp đứng | 90 ngày | Tiêu đề, số người, thời lượng, số lượt |
| Phòng hát chung | Trong bộ nhớ | Mất khi kết thúc |

Sao lưu: nếu có sao lưu `social.db`, bản sao không được giữ tin chat quá 7 ngày. Cách làm: loại bảng `dm_messages` khỏi bản sao, hoặc giữ bản sao ngắn hơn 7 ngày. Chốt với người vận hành sao lưu (mục 14).

---

## 11. Kiểm thử

Toàn bộ là kế hoạch. Chưa chạy gì trong phiên này. Chạy ở môi trường test, không chạm sản xuất. Tài khoản thử do đội tạo trong môi trường test, không dùng tài khoản thật, không ghi mật khẩu vào tài liệu.

### 11.1 Trận đấu (F)

| ID | Kịch bản | Kỳ vọng |
|---|---|---|
| F1 | A mời, B chấp nhận | `accepted`, rồi `preparing` 3 s, rồi `fighting`. Cả hai nhận `fight.match` |
| F2 | B từ chối | `declined`. A không vào trận. Không bị tính giới hạn |
| F3 | B không trả lời 60 s | `expired`. Không tạo trận. Không tính gì cho B |
| F4 | HP một bên về 0 | `ko`. Người thua nhận 0 lệnh và 0 đòn trong 30 s. Sau 30 s `ended`. Meme hiện |
| F5 | Hết 180 s, HP cả hai lớn hơn 0 | `timeout_draw`. Không điểm, không quà |
| F6 | Hai đòn cùng tick làm HP cả hai về 0 | `draw_ko`. Cả hai nằm 30 s |
| F7 | Client ngừng ping 10 s | `win_forfeit_disconnect`. Đối thủ thắng. Lý do hiển thị |
| F7b | Mất kết nối rồi nối lại trong 10 s | Trận tiếp tục. Không đòn trong thời gian chờ |
| F8 | Né jab khi bắt đầu tung +50 ms và +350 ms | `dodge`. Né tại +20 ms hoặc +400 ms thì `hit` |
| F8b | Né hook khi bắt đầu tung +200 ms và +500 ms | `dodge`. Né tại +150 ms thì `hit` |
| F9 | Giữ đỡ lúc chạm | Jab nhận 2, hook nhận 3. Thả trước lúc chạm thì nhận đủ |
| F10 | Giới hạn | Trận thứ 4 trong 60 phút: 429. Trong 120 s sau trận: 429 `fight_cooldown` |
| F11 | Một bên ở Z01, Z06, Z09, đang họp, hoặc có bản đặt phòng | 403 `fight_unavailable`, không lộ lý do cho bên kia |
| F12 | Người nhận bật "không nhận thách đấu" | Không có lời mời. Người mời nhận 403 chung |
| F13 | Máy chủ khởi động lại giữa trận | `cancelled`. Không tính giới hạn |
| F14 | Client gửi `dmg`, `hp`, `result` | Bị bỏ. HP không đổi |
| F15 | WebSocket với `Origin` khác | 403 |
| F16 | 50 lệnh trong 1 s | 30 được xử lý. Phần còn lại bị bỏ. Kết nối không đóng |
| F17 | Hết phiên giữa trận | WebSocket đóng trong 60 s. Đối thủ thắng sau 10 s |
| F18 | Một bên bị khoá `fight` | Lời mời bị từ chối 403 |
| F19 | Lời mời họp đứng tới người đang đấu, hoặc lời mời đấu tới người đang họp | Từ chối |

### 11.2 Chat (C) và đồng bộ (S)

| ID | Kịch bản | Kỳ vọng |
|---|---|---|
| C1 | A gửi, B đang kết nối SSE | B nhận trong 1 s |
| C2 | Người thứ ba kết nối SSE | Không nhận event của thread A-B |
| C3 | 31 tin trong 60 s | Tin thứ 31: 429 kèm `retryAfter`. Sau cửa sổ gửi được |
| C4 | A chặn B | B gửi: 403 `dm_unavailable`. A gửi: 403. Thread ẩn. Bỏ chặn thì khôi phục |
| C5 | Tin hơn 7 ngày | Không có trong GET. Job xoá trong 1 giờ |
| C6 | Báo cáo một tin | Bản chụp chỉ có một tin. Không phải IT hoặc admin: 403. Bản chụp xoá khi đóng hoặc sau 30 ngày |
| C7 | Nội dung `<script>`; 1001 ký tự; chuỗi rỗng | Hiện dạng chữ. 1001: 400. Rỗng: 400 |
| C8 | Ngắt SSE, nhận 5 tin mới, nối lại | Nhận đủ 5 tin qua `Last-Event-ID`, không trùng |
| C9 | Gửi tin, đọc log và audit | Không có nội dung, cookie, hay id tin |
| C10 | Hai tab cùng người | Tin đến cả hai tab |
| S1 | Đăng xuất | SSE và WebSocket đóng trong 60 s |
| S2 | Khởi động lại social | Client nối lại, backoff 3 s, 6 s, tối đa 30 s |
| S3 | Đồng hồ lệch 800 ms | Hẹn giờ lượt họp và `startAt` lệch không quá 100 ms sau khi hiệu chỉnh |
| S4 | Chỉ có `osid` | `/api/social/*` và WebSocket trả 401 (hợp đồng như ONBOARDING_API.md mục 6.1) |

### 11.3 Họp, nhảy, hát, meme, thị giác và độ trễ

- Họp (M): M1 điểm ngoài danh sách 400. M2 13 người 400. M3 FIFO đúng thứ tự. M4 một người hai mục hàng đợi 409. M5 hết 60 s chuyển lượt. M6 còn 1 người 60 s thì kết thúc. M7 đủ 30 phút thì kết thúc. M8 host rời thì kết thúc.
- Nhảy (D): D1 cooldown 3 s. D2 tự dừng sau 8 s. D3 nút Dừng dừng ngay. D4 di chuyển huỷ điệu. D5 không nhảy ở Z01, Z06, Z07, Z09, khi họp hoặc đấu.
- Hát chung (K): K1 hai client lệch không quá 100 ms sau `startAt`. K2 điểm vào karaoke không đổi. K3 tối đa 8 người.
- Meme (MM): MM1 tên chứa từ khoá thành "Đồng nghiệp". MM2 người xem tắt thì không thấy. MM3 người thua tắt thì trận đó không có meme. MM4 không hiện trong họp đứng.
- Thị giác (V): V1 chụp các khung KO, trúng, né, đỡ. Script đếm pixel đỏ đậm trên thân nhân vật, ngưỡng do đội thiết kế đặt. Không có texture vết thương, không mặt chi tiết. V2 mười người nội bộ xem video 60 giây và đánh giá có gây khó chịu hay không.
- Độ trễ và tải (L): L1 giả lập RTT 200 ms. Né jab với phản ứng 250 ms, thành công không dưới 90% số lần thử. L2 20 trận đồng thời: CPU dưới 20% trên host mục tiêu, P95 xử lý lệnh phía server dưới 50 ms. L3 2000 kết nối SSE, heartbeat ổn định.

---

## 12. Lộ trình triển khai

| Pha | Nội dung | Điều kiện qua pha | Cờ bật |
|---|---|---|---|
| 0 | Khung service 3010, auth, DB, audit, cờ, test hợp đồng S4. Gateway theo mục 3.3 | Khung test xanh | Không |
| 1 | Chat riêng (mục 4), họp đứng (mục 5), báo cáo và chặn | C1 đến C10, M1 đến M8, S1 đến S4 đạt. Quy định ứng xử đã duyệt (mục 14) | `dm`, `meeting` |
| 2 | Nhảy (mục 6) và hát chung (mục 7) | D1 đến D5, K1 đến K3 đạt. Đo tải | `dance`, `sing_group` |
| 3 | Thi đấu bản nội bộ: chỉ tài khoản thử trên môi trường test, meme tắt | F1 đến F19, L1, L2, V1 đạt. V2 đạt | `fight` tắt ở sản xuất |
| 4 | Thi đấu cho nhóm thí điểm | Pháp chế đã ký (mục 14). Theo dõi báo cáo hai tuần không có sự cố nghiêm trọng | `fight`, `meme` |

Thứ tự theo yêu cầu: chat và họp đứng trước, nhảy sau, thi đấu cuối cùng sau kiểm thử.

Điểm dừng: không mở pha 3 cho người dùng thật khi chưa có duyệt mục 14.

Phạm vi tài liệu này: không đổi gateway, không đổi service nào. Các thay đổi nêu trên là đề xuất cho đợt triển khai.

---

## 13. Mặc định đã chọn

Các điểm mơ hồ được chọn theo mặc định, không hỏi lại:

1. Chat: tin tối đa 1000 ký tự, văn bản thuần, không tự tạo liên kết, không quét nội dung tự động.
2. Online: `lastSeen` trong 60 giây, cập nhật từ kết nối SSE hoặc request.
3. Thách đấu: mời và chấp nhận chỉ khi cả hai ở Z02, Z03, Z04, Z05 hoặc Z08. Trận diễn ra tại vòng đấu Z05. Không tới đủ trong 60 giây thì huỷ.
4. Không kết thúc sớm khi ít đòn. Chỉ hiện gợi ý sau 40 giây.
5. Họp đứng: không có giọng nói trong app. Host rời thì kết thúc. Tối đa 30 phút. Hàng đợi trống 5 phút thì kết thúc.
6. Nhảy: tự dừng sau 8 giây. Cooldown 3 giây. Tắt ở Z01, Z06, Z07, Z09.
7. Meme: mặc định hiện. Người thua tắt được cho trận của mình. Người xem tắt được cho mình.
8. Âm thanh trận: mặc định tắt.
9. Giới hạn lời mời: tối đa 5 lời mời mỗi 60 phút. Từ chối hai lần liên tiếp thì 24 giờ không mời người đó.
10. Bỏ cuộc giữa trận: nút có xác nhận, tính là thua, không điểm.
11. Mất kết nối lặp lại: ba lần `win_forfeit_disconnect` do một người trong 24 giờ thì khoá thi đấu 24 giờ.
12. Khoá tạm: IT tối đa 3 ngày, admin tối đa 30 ngày.
13. Hát chung: tối đa 8 người, sảnh chờ 60 giây, bắt đầu sau 3 giây.
14. Giữ dữ liệu: theo bảng mục 10.4.
15. Meme: bán kính 12 m.
16. Giảm chuyển động: nhảy là một khung tĩnh, không rung camera.
17. Chống câu giờ: chỉ gợi ý, không kết thúc sớm.

---

## 14. Cần người dùng và pháp chế duyệt

Trước pha 1:
- Quy định ứng xử nội bộ: ai quyết định khoá, thời hạn, quy trình khiếu nại. Đề xuất: IT đề xuất, admin quyết.
- Giữ bản chụp tin bị báo cáo tối đa 30 ngày, là ngoại lệ so với 7 ngày. Pháp chế xác nhận. Nếu không chấp nhận: giảm xuống 7 ngày, và báo cáo phải gửi trong thời hạn đó.
- Audit ghi cặp người nhắn tin (ai, thread, thời điểm) trong 90 ngày. Pháp chế và nhân sự xác nhận. Có thể giảm xuống 30 ngày.
- Sao lưu `social.db`: chốt cách loại tin khỏi bản sao.
- Giới hạn 12 người và 30 phút họp đứng.

Trước pha 3:
- Danh sách từ khoá (IT giữ, pháp chế xem các nhóm).
- Hai mẫu meme và hai emote.
- Thi đấu là hoạt động nội bộ tự nguyện, không có tiền, điểm, quà. Pháp chế xem quy chế công ty và an toàn lao động khi có hoạt động thể chất trong văn phòng.
- Vị trí và kích thước vòng đấu Z05 (đội 3D). Ranh giới với khu karaoke.

Trước pha 4:
- Quyết định nhóm thí điểm (ai, bao nhiêu người, thời gian).

Ghi nhận rủi ro:
- Vị trí và khu do client báo (nhảy, thi đấu). Đây là lớp chống nhầm, không chống gian lận. Chấp nhận cho nội bộ, hoặc chuyển sang kiểm tra phía server khi có dữ liệu vị trí.
- Bù trễ né dùng `rtt` do client báo (tối đa 150 ms). Có thể bị lợi dụng ở mức nhỏ.

---

## 15. Giới hạn của tài liệu

- Số liệu (HP, sát thương, cửa sổ né, thời gian) là đề xuất để kiểm chứng, chưa đo trên máy thật.
- Không có service `world` trong repo. Cổng 3008 và 3010 chưa được dùng. Thiết kế chọn 3010 cho social.
- Endpoint `/internal/rooms/busy` của it-service chưa có. Đến khi có, điều kiện 4 của mục 8.9 chỉ dựa trên vị trí client báo (Z06).
- Chưa có danh bạ nhân viên trong repo. Mục 4.5 giả định mở chat từ thẻ người trong 3D. Tìm theo tên cần endpoint danh bạ (chưa xác nhận).
- Chưa có presence. Social tự tính `lastSeen`.
- Chưa có spec cho nhân vật khối và khớp (chế độ thi đấu). AVATAR_SPEC mô tả VRM đầy đủ. Đội 3D cần viết thêm.
- Chưa có kiểm tra thực tế gateway với SSE và WebSocket cho route mới.
- ONBOARDING_API.md dành cổng 3006 cho profile, nhưng 3006 đang là display. Cần sửa tài liệu đó.
- Không đọc file nào ngoài danh sách trong phần đầu tài liệu. Không chạy npm, docker hay ssh.
