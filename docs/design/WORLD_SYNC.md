# WORLD_SYNC: đồng bộ vị trí và presence (TASK 23, lát cắt 1)

Phạm vi lát cắt này: presence và pose (vị trí, hướng, nhãn animation) của nhân vật, phát cho người cùng tenant qua WebSocket. Chưa có: vật thể dùng chung (cửa, ghế), ngoại hình, prediction phía client, interest management theo khu, đo băng thông. Những phần đó thuộc các lát cắt sau của TASK 23 và task 24/26/27.

Mã: `services/world` (Node 20 ESM, Express 4.21.2, `ws` 8.18.0). Cổng 3011 theo DECISIONS.md mục 9. INTERACTIONS.md mục 9 còn ghi 3008, SSE và SQLite; lát cắt này dùng WebSocket và chưa dùng SQLite.

Quyết định 2026-11-06 (người điều phối chốt với người dùng): kênh realtime là WebSocket bằng thư viện `ws`. **Đã bỏ đường SSE** (`/api/world/stream`) và `POST /api/world/pose`, để chỉ có một đường ghi pose, một chỗ giới hạn tần suất và một chỗ kiểm Origin.

## Mô hình

- Room = tenant (`user.tenant.id` từ `/api/auth/me`). Người khác tenant không nhận tin của nhau.
- playerId = `user.id`. Mỗi người một entity; nhiều tab dùng chung entity và chung giới hạn pose.
- protocolVersion = 1 (trường `v` trong pose). Sai version trả `error protocol_version`.
- Server tick 100 ms: quét presence hết hạn, rồi gom mọi pose đã thay đổi thành một tin `poses` cho mỗi tenant. Không gửi scene graph hay xương.
- Server có quyền quyết định: client gửi pose mong muốn, server kẹp vào sàn chữ L và giới hạn tốc độ, trả lại pose đã nhận trong `ack`.

```
trình duyệt ──WS /api/world/ws (cookie, Origin)──▶ world ──GET /api/auth/me (cookie, 3 s)──▶ auth
     │  {type:'pose', v, seq, x, z, yaw, anim}       │ kiểm tra, kẹp, lưu bộ nhớ
     ◀── ack | error | snapshot | join | poses (mỗi tick) | leave | pong
```

## Bắt tay WebSocket

`GET /api/world/ws` với `Upgrade: websocket`. Thứ tự kiểm tra:

1. Đường dẫn khác `/api/world/ws`: HTTP 404, hủy socket.
2. Origin không được phép: HTTP 403, hủy socket (trình duyệt thấy mã 1006).
   - Luôn cho phép `https://gp.daisoncoop.com`. Thêm qua `ALLOWED_ORIGINS` (phân cách dấu phẩy).
   - `http://localhost:*`, `http://127.0.0.1:*`, `http://[::1]:*` chỉ được phép khi `NODE_ENV` khác `production` hoặc `WORLD_ALLOW_LOCALHOST=1`. Image đặt `NODE_ENV=production`.
   - Thiếu Origin hoặc `null` bị từ chối.
3. Quá 100 bắt tay đang chờ auth: HTTP 503.
4. Gọi `AUTH_URL/api/auth/me` với cookie, timeout 3 giây. Lỗi, timeout, phiên onboarding (403 của auth) hoặc thiếu tenant: nâng cấp rồi đóng mã **4401** `unauthenticated` (trình duyệt đọc được mã đóng, không đọc được status HTTP).
5. Quá 2 kết nối mỗi người: đóng **4429** `too_many_connections`. Quá 2000 tổng: đóng **1013** `server_full`.

Sau khi mở, mỗi 60 giây kiểm tra lại phiên. Auth từ chối rõ ràng (status khác 200, đổi user) thì đóng 4401; auth timeout hoặc lỗi mạng thì giữ kết nối. Cookie của kết nối nằm trong bộ nhớ tiến trình để làm việc này.

Chỉ `id` và tên hiển thị (tối đa 64 ký tự, bỏ ký tự điều khiển) rời khỏi service. Không có email, vai trò, phòng ban. Không gửi email.

## Tin nhắn

Mọi khung là văn bản JSON một object có `type`. Khung nhị phân: đóng **1003**. Khung quá 1 KB: đóng **1009** (`maxPayload` của `ws`, kiểm thêm trong `connection.js`). Quá 20 tin mỗi giây trên một kết nối (token bucket 20, nạp 20/giây): đóng **1008** `flood`.

Client gửi:

| type | Trường | Ghi chú |
|---|---|---|
| `pose` | `v:1, seq, x, z, yaw, anim?` | Tối đa 10 lần/giây mỗi người (gộp mọi tab) |
| `leave` | | Rời phòng ngay, phát `leave` reason `left` |
| `ping` | `t` (đồng hồ client) | Đo RTT; nhận `pong` |

Server gửi:

| type | Trường | Khi |
|---|---|---|
| `snapshot` | `v, tick, serverTime, self:{id}, ttlMs, players:[Player]` | Tin đầu tiên sau khi mở |
| `ack` | `seq, tick, accepted:{x,z,yaw,anim}, corrected` | Trả cho pose được nhận |
| `error` | `code, seq?, retryAfterMs?` | Pose hoặc tin bị từ chối; kết nối vẫn mở |
| `join` | `id, name, tick` | Người có pose đầu tiên |
| `poses` | `tick, serverTime, poses:[Player]` | Mỗi tick có thay đổi; gồm cả pose của chính mình |
| `leave` | `id, reason: 'timeout'\|'left'\|'disconnect', tick` | Hết hạn, gửi `leave`, hoặc đóng kết nối cuối của người đó |
| `pong` | `t, serverTime, tick` | Trả `ping` |

`Player = {id, name, x, z, yaw, anim, seq, t}`, `t` là thời điểm server nhận (ms).

Mã `error`: `invalid_json`, `invalid_message`, `unknown_type`, `protocol_version`, `invalid_seq`, `invalid_position`, `invalid_yaw`, `invalid_anim`, `stale_seq`, `rate_limited` (kèm `retryAfterMs`), `room_full` (quá 200 người mỗi tenant).

Luật pose:

- `x`, `z` (m, tọa độ three.js) và `yaw` (radian) phải là số hữu hạn. `yaw` đưa về [-π, π). Làm tròn 3 chữ số.
- `anim` thuộc `idle, walk, run, jump, fall, sit, emote`, mặc định `idle`. Trường lạ bị bỏ.
- `seq` nguyên 0..2^31-1, phải tăng dần; trùng hoặc cũ hơn trả `stale_seq` (gói trùng, sai thứ tự). Presence mới (sau khi rời hoặc hết hạn) nhận seq bất kỳ.
- Kẹp về điểm gần nhất trong 5 hình chữ nhật của chữ L (`src/scene/officeBounds.ts`, `OFFICE_L_PLAN_RECTS`). Đổi chữ L phía client thì phải sửa `services/world/src/pose.js`.
- Quãng đường tối đa mỗi cập nhật = 9 m/s × min(dt, 1 s) + 0.3 m (dt theo đồng hồ server). Vượt thì dừng ở điểm cho phép trên đoạn thẳng rồi kẹp lại; `corrected: true` báo client reconcile về `accepted`.
- Lần đầu vào được đặt ở điểm bất kỳ trong sàn.

Client nên: gửi pose khi di chuyển, tối đa 10 lần/giây; đứng yên thì gửi lại mỗi 5 s để không hết hạn; với người khác, nội suy theo `t` và teleport khi khoảng cách lớn hơn ngưỡng; bỏ `poses` có `tick` nhỏ hơn tick đã áp. Kết nối lại (đóng khác 4401) thì chờ có backoff và dùng `snapshot` mới; đóng 4401 thì chuyển về đăng nhập, không thử lại.

## HTTP còn lại

| Method | Đường dẫn | Trả về |
|---|---|---|
| GET | `/api/health` | `{ok, tick, connections, players}`, không cần đăng nhập |
| GET | `/api/world/presence` | Như `snapshot` kèm `ok`, xác thực mỗi request (401 khi lỗi) |

## Giới hạn và chống flood

- Pose: 10 token, nạp 10/giây mỗi người. Tin nhắn: 20/giây mỗi kết nối, vượt thì đóng 1008.
- Khung tối đa 1 KB. Tối đa 2 kết nối mỗi người, 2000 tổng, 100 bắt tay chờ auth.
- Kết nối có bộ đệm gửi quá 256 KB bị ngắt (backpressure). Ping giao thức 25 giây; không pong thì ngắt.
- Presence hết hạn sau 15 s không có pose; đóng kết nối cuối thì rời ngay.

## Giới hạn đã biết

- Trạng thái chỉ trong bộ nhớ: mất khi restart (client kết nối lại và gửi pose là có lại). Nhiều tiến trình thì mỗi tiến trình một thế giới riêng, không đồng bộ; chỉ chạy một instance.
- Đăng xuất có hiệu lực với kết nối đang mở trong tối đa 60 giây. Auth sập lâu thì kết nối cũ vẫn giữ.
- Chưa giới hạn theo IP trước auth; chỉ có trần 100 bắt tay đang chờ.
- Chống gian lận ở mức tốc độ và sàn. Không kiểm tra va chạm tường trong, vật thể, hay cửa khóa.
- Một tenant là một phòng: chưa có interest management. `poses` gồm mọi người trong tenant.
- Chưa có client tích hợp, chưa đo RTT/jitter/băng thông thật, chưa test tải.

## Deploy (người điều phối thực hiện)

docker-compose.yml:

```yaml
  world:
    build:
      context: ./services/world
      dockerfile: Dockerfile
    image: gpb-tool/world:local
    network_mode: host
    restart: unless-stopped
    environment:
      PORT: "3011"
      HOST: 127.0.0.1
      AUTH_URL: http://127.0.0.1:3001
      # ALLOWED_ORIGINS: thêm origin khác nếu cần (mặc định đã có https://gp.daisoncoop.com)
```

deploy/nginx/gateway.conf: gateway **phải chuyển tiếp `Upgrade` và `Connection: upgrade`**, và giữ `Origin`, `Cookie` (nginx mặc định giữ hai header này). Thiếu `Upgrade` thì bắt tay thất bại. Không có `/` cuối.

Ở khối `http` (ngoài `server`), nếu chưa có:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

Trong `server`:

```nginx
    location /api/world {
        proxy_pass http://127.0.0.1:3011;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
```

Nếu Cloudflare đứng trước domain: bật WebSockets trong Network (mặc định bật). Trước khi deploy, kiểm tra cổng 3011 còn trống: `ss -ltnp | grep ':3011 '`.

## Kiểm thử

Đã chạy (thuần, không cần npm): `cd services/world && node --test test/*.test.js`, 26/26 đạt. Phủ: validate pose, kẹp sàn, giới hạn tốc độ, token bucket, presence hết hạn, seq cũ, tách tenant, kiểm Origin, chuẩn hóa user, luồng tin nhắn với kết nối giả (snapshot/join/poses/leave, rate_limited, flood 1008, khung > 1 KB 1009, nhị phân 1003, 2 kết nối mỗi người, leave khi đóng kết nối cuối, backpressure).

Chưa kiểm chứng (cần `npm install` trong image): bắt tay `ws` thật, mã 4401/403 trên dây, `maxPayload`, ping/pong, đồng bộ hai người, đi qua gateway. Chạy trên VPS sau deploy, `A` và `B` là cookie `sid` của hai tài khoản test cùng tenant (lấy `wscat` qua `npx`, chạy trên VPS):

```sh
curl -s http://127.0.0.1:3011/api/health
# Origin sai: mong đợi HTTP 403
curl -si -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Origin: https://evil.example' \
  http://127.0.0.1:3011/api/world/ws | head -1
# Không cookie: mở rồi đóng 4401
npx wscat -c ws://127.0.0.1:3011/api/world/ws -o https://gp.daisoncoop.com
# Cửa sổ 1 (A) nghe; cửa sổ 2 (B) gửi pose
npx wscat -c ws://127.0.0.1:3011/api/world/ws -o https://gp.daisoncoop.com -H "Cookie: sid=$A"
npx wscat -c ws://127.0.0.1:3011/api/world/ws -o https://gp.daisoncoop.com -H "Cookie: sid=$B"
#   > {"type":"pose","v":1,"seq":1,"x":-4,"z":3,"yaw":0,"anim":"walk"}   A thấy join rồi poses
#   > {"type":"pose","v":1,"seq":2,"x":500,"z":3,"yaw":0}                 ack corrected: true
#   > {"type":"ping","t":1}                                              pong
#   Ngắt B: A thấy leave reason disconnect. Mở kết nối thứ 3 của A: đóng 4429.
```

Lặp lại qua gateway (`wss://gp.daisoncoop.com/api/world/ws`) để xác nhận nginx chuyển tiếp Upgrade.

---

# Lát cắt 2: lease, chat, vai trò, reconnect (TASK 24, 25a, 26, 27)

Cập nhật 2026-11-06. Mã: `services/world/src/{leases,chat,roles,sessions,profanity}.js` (điều phối trong `world.js`), client `src/net/*`. Tất cả trạng thái trong RAM của một tiến trình; restart mất hết (lease, phiên, nhật ký sự kiện, audit, vai trò ghi đè). Không có khóa nào sống sót qua restart, nên không có khóa mồ côi vô hạn.

**Chưa làm:** thoại theo khoảng cách (TASK 25 phần voice) bị chặn vì chưa có TURN/SFU; chat riêng 1-1; báo cáo (report) tin nhắn; phòng họp; lưu bền vững (SQLite) lịch sử, vai trò, audit; đa instance; UI quản lý thành viên; HTTP API cho vai trò (chỉ realtime); khách chưa đăng nhập (bắt tay vẫn bắt buộc đăng nhập, vai trò `guest` chỉ áp dụng cho tài khoản có role lạ/thiếu).

## Đối tượng và định danh

- Phòng = tenant. `playerId` = `user.id` (auth xác nhận). `sessionId` + `resumeToken` cấp mỗi lần kết nối (trong `snapshot.session`). `epoch` = mã lần chạy của server. `eseq` = số thứ tự sự kiện tin cậy trong phòng.
- Sự kiện tin cậy (có `eseq`, giữ 500 gần nhất mỗi phòng): `lease`, `edit.applied`, `chat` kênh `room`. Sự kiện tạm (không `eseq`): `poses`, `join`, `leave`, chat `near`.

## Snapshot (mở rộng)

`snapshot` thêm: `epoch, eseq, role, capabilities[], leases[], objects[], session{id,resumeToken,resumeTtlMs}, resumed`. `resumed` là `null` (kết nối không mang token) hoặc `{ok, reason?, restored[], lost[{resource,reason}], spawn{x,z,yaw}|null, full, events[]}`. Chỉ vai trò của chính mình được gửi lại; không lộ role tài khoản của người khác.

## Lease (TASK 24)

Resource: `seat:<id>`, `held:<id>`, `edit:<id>` (id `[A-Za-z0-9_-]{1,40}`). Quyền cần có (kiểm bằng `can` mỗi lần): `seat.use`, `object.use`, `layout.edit`. Có quyền vào phòng không đồng nghĩa giữ ghế.

| Client gửi | Trường | Trả về |
|---|---|---|
| `lease.acquire` | `resource, requestId, expectedRevision?` | `lease.result{op:'acquire', ok, lease{leaseId,fence,revision,expiresInMs}}` hoặc `error`: `occupied` (kèm `owner`), `already_seated`, `limit_reached`, `revision_conflict`, `forbidden`, `invalid_resource` |
| `lease.heartbeat` | `resource, leaseId, fence` | `lease.result{op:'heartbeat'}`; `lease_lost` nếu hết hạn, đổi chủ hoặc mất quyền |
| `lease.release` | `resource, leaseId, fence` | `ok` (`released:false` nếu đã nhả), `stale_token` nếu đã đổi chủ |
| `lease.query` | `resource` | trạng thái hiện tại |
| `lease.force` | `resource` | chỉ owner, có audit |
| `edit.commit` | `resource:'edit:..', leaseId, fence, patch{x?,z?,yaw?}, requestId, expectedRevision?` | `edit.result{ok, revision}`; lỗi `lease_lost`, `forbidden`, `invalid_patch`, `revision_conflict`, `rate_limited` |

Server phát `lease{resource, ownerId|null, ownerName, fence, revision, reason}` (reason: `acquired, released, expired, left, kicked, revoked, forced, session_reset`) và `edit.applied`.

Luật: một ghế một người; mỗi người tối đa 1 ghế, 1 vật cầm, 3 khóa chỉnh sửa; `fence` tăng ngặt trong phòng, `revision` tăng mỗi lần đổi chủ. Hết hạn theo giờ server: TTL 15 s (`WORLD_LEASE_TTL_MS`), client nên heartbeat mỗi 5 s. Retry cùng `requestId` trả đúng kết quả cũ (`duplicate:true`); chủ gọi lại acquire chỉ gia hạn. Mất kết nối cuối: lease giữ thêm ân hạn 30 s (`WORLD_LEASE_GRACE_MS`) rồi nhả khi tick quét; gửi `leave` thì nhả ngay. `edit.commit` chỉ chấp nhận khi vai trò hiện tại còn `layout.edit` VÀ token còn hiệu lực, nên client cũ mang token hết hạn hoặc editor vừa bị thu hồi bị từ chối; client phải áp lại `objects` từ server (trạng thái server thắng). Tối đa 500 vật có trạng thái mỗi phòng.

## Chat chữ (TASK 25a)

| type | Trường | Ghi chú |
|---|---|---|
| `chat` | `channel:'room'\|'near', text, clientMsgId` | server trả `chat.ack{clientMsgId,id,at}` rồi phát `chat{id,channel,from{id,name},text,at}` |
| `chat.history` | `beforeId?, limit?` | trả `chat.history{messages}` (chỉ kênh room, tối đa 50, bỏ người đã chặn) |
| `chat.block` | `target, on` | chặn/bỏ chặn người; chỉ ảnh hưởng thứ mình nhận |

Server quyết định người nhận: `room` = cả phòng, `near` = người có pose trong bán kính 10 m (`WORLD_CHAT_NEAR_RADIUS`) quanh vị trí server của người gửi (chưa có pose thì `no_position`). `from` do server gán. Giới hạn: 250 ký tự (sau khi bỏ ký tự điều khiển/đảo chiều/độ rộng 0), burst 5 rồi 1 tin/2 giây (`rate_limited` + `retryAfterMs`), từ cấm (bản sao `services/auth/profanity.js`) trả `content_rejected`, trùng `clientMsgId` không phát lại. Lịch sử: 100 tin `room` mỗi phòng trong RAM, `near` không lưu. Không HTML: client phải render như chữ. Lỗi: `forbidden` (guest), `muted`, `invalid_channel`, `empty`, `too_long`.

## Vai trò và quyền (TASK 26)

Vai trò phòng: `owner > editor > member > guest`. Ánh xạ ban đầu từ role tài khoản (`/api/auth/me` `user.role`, giữ nội bộ, không phát cho người khác): `admin→owner`, `it→editor`, `employee→member`, `moderator→member`, khác/thiếu→`guest`. Chủ phòng ghi đè được bằng `role.set` (RAM). Hàm dùng chung `can(actor, action, resource)` trong `roles.js`; mọi message đi qua nó, vai trò đọc lại mỗi lần nên thu hồi có hiệu lực ngay.

| Quyền | guest | member | editor | owner |
|---|---|---|---|---|
| room.view, room.join, pose.send, chat.read | x | x | x | x |
| chat.send, seat.use, object.use | | x | x | x |
| layout.edit | | | x | x |
| member.kick, member.mute, role.set, audit.view, lease.force_release | | | | x |

Ràng buộc: khác phòng → `cross_room`; không tác động chính mình (`cannot_target_self`) hoặc owner khác (`cannot_target_owner`); `role.set` không cấp `owner` (`cannot_grant_owner`) nên không mất/đổi owner cuối cùng; mute chặn `chat.send`. Chưa có chuyển quyền owner. Hạ vai trò nhả ngay lease không còn quyền (`revoked`) và gửi `role{role,capabilities}` cho người đó.

| Client gửi | Kết quả |
|---|---|
| `mod.kick{target}` | `mod.result`; nhả lease, hủy phiên, đóng socket mục tiêu **4403**, chặn vào lại `WORLD_KICK_COOLDOWN_MS` (5 phút) |
| `mod.mute{target,on?,durationMs?}` | mặc định 10 phút, tối đa 24 giờ; mục tiêu nhận `muted` |
| `role.set{target,role}` | `mod.result` |
| `audit.list{limit?}` | `audit.list{entries}`; chỉ owner |

Mục tiêu phải đang trong phòng (`target_not_found`). Audit trong RAM, 500 mục mỗi phòng: `{at, actor, action, target, result, requestId, detail?}`; ghi cả lần bị từ chối; không ghi nội dung chat hay token.

## Reconnect và phiên (TASK 27)

- Bắt tay: `/api/world/ws?resume=<token>&last=<eseq>`. Token dùng một lần (xoay mỗi kết nối), gắn đúng người đã đăng nhập, sống 120 s kể từ lúc mất kết nối cuối (`WORLD_RESUME_TTL_MS`). Cookie vẫn là danh tính; token chỉ chứng minh "phiên trước của chính bạn".
- Có token hợp lệ: lease còn trong ân hạn được giữ và gia hạn (`restored`); lease đã mất liệt kê trong `lost` (client đứng dậy/tay trống, báo người dùng); `spawn` là pose cuối đã qua kẹp sàn (client gửi lại làm pose đầu, server kẹp lại một lần nữa); `events` là sự kiện tin cậy bị lỡ nếu khoảng trống còn nằm trong nhật ký 500 mục, ngược lại `full:true` (dùng snapshot, bỏ trạng thái cục bộ). `last` lớn hơn eseq hiện tại (server restart) cũng là `full`.
- Token sai/hết hạn hoặc không có token: phiên mới sạch, lease cũ của người đó được nhả (`session_reset`), `resumed` là `{ok:false}` hoặc `null`.
- Nhiều tab: tab mới thay phiên cũ; socket cũ bị đóng **4409** `replaced_by_new_session`, một avatar duy nhất, không phát `leave`. Client nhận 4409/4403/4401 không tự thử lại.
- Phát hiện mất kết nối: ping giao thức 25 s phía server; client gửi `ping` mỗi 10 s và coi là chết nếu 25 s không nhận gì (đóng 4000 rồi reconnect).
- Client: backoff mũ 0.5 s → 15 s với equal jitter, tối đa 12 lần rồi `disconnected` (thử lại thủ công). Trạng thái: `connecting, connected, reconnecting, resyncing, disconnected, authExpired, replaced, kicked`; chỉ `connected` mới cho gửi pose/acquire/edit/mod. Chỉ `chat`, `chat.block`, `lease.release` được xếp hàng (tối đa 20 tin, 30 s) và gửi lại sau snapshot; pose/acquire/commit bị bỏ vì server thắng sau resync. Hàng đợi chat an toàn vì có `clientMsgId` (server khử trùng).

### Bảng tình huống

| Tình huống | Hành vi mong đợi | Kết quả (test tự động) |
|---|---|---|
| Rớt mạng ngắn (< 30 s) có token | giữ ghế, nhận sự kiện lỡ, spawn tại vị trí cuối | đạt (`session.test.js`) |
| Rớt mạng quá ân hạn | ghế nhả, người khác ngồi được; quay lại thì `lost` và không ghi đè | đạt |
| Token sai, của người khác, hết hạn | phiên mới sạch, `resumed.ok=false` | đạt |
| Nhật ký thiếu / server restart | `full:true`, dùng snapshot | đạt (đơn vị `eventLog`) |
| Tab mới | socket cũ 4409, không `leave` giả | đạt, kể cả qua `ws` thật |
| Bị kick | 4403, lease nhả, không vào lại 5 phút | đạt qua `ws` thật |
| Auth hết hạn | 4401, client `authExpired`, không retry | đạt (client giả lập) |
| Chat gửi lúc offline | xếp hàng, gửi lại sau resync, khử trùng | đạt (client giả lập) |
| Thu hồi editor khi đang giữ khóa | lease nhả, commit sau đó `forbidden` | đạt |

Thời gian phục hồi đo thật: chưa đo (test dùng đồng hồ giả). `WorldClient.lastRecoveryMs` ghi lại thời gian từ lúc mất đến lúc có snapshot để đo khi chạy thật.

## Gắn vào ứng dụng (chưa gắn; App.tsx ngoài phạm vi)

```tsx
const world = useWorld({ enabled: loggedIn });          // trong App
<ConnectionBanner world={world} />                        // ngoài Canvas
<ChatPanel world={world} />                               // ngoài Canvas
<RemotePlayers world={world} />                           // trong Canvas
// vòng lặp Player: world.client.current?.sendPose({seq, x, z, yaw, anim}) tối đa 10 lần/giây
```

Các giới hạn chưa kiểm chứng: bắt tay thật qua gateway nginx, hai trình duyệt thật, quy ước hướng `yaw` của Avatar (RemotePlayers gán `rotation.y = yaw`), ngoại hình người khác (đang dùng ngoại hình mặc định).
