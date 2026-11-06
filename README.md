# Test App · Prototype Phòng CNTT

Prototype theo `docs/PROMPT_phong_CNTT.md`: không gian 3D phòng CNTT, đi lại bằng WASD, click vật thể để mở panel (NOC, Service Desk, SOC), phân quyền theo vai trò.

Hệ thống được triển khai theo microservice: **mỗi module một container**. Chi tiết kiến trúc xem `docs/ARCHITECTURE.md`. Rà soát license xem `docs/OSS_REUSE.md` và `THIRD_PARTY.md`.

## Trạng thái hiện tại

- Frontend gọi API thật qua gateway: đăng ký, xác minh OTP, đăng nhập, phiên, trạng thái dịch vụ, đặt phòng, vinh danh, ticket, sự cố đang mở và tóm tắt SOC.
- Dữ liệu trạng thái dịch vụ và tóm tắt bảo mật vẫn là dữ liệu mẫu, đọc từ `services/it/mock/`.
- Đăng nhập Google và Microsoft đang tắt. Các biến `GOOGLE_*` và `MICROSOFT_*` để trống nên nút tương ứng bị vô hiệu hóa.
- Gửi mail mặc định ở chế độ `log`: mã OTP chỉ được ghi ra log container, không gửi đi.
- Ba service mới `games`, `karaoke`, `events` có API và dữ liệu riêng. Mã frontend trong `src/` chưa gọi `/api/games`, `/api/karaoke`, `/api/events`. Smoke test chưa phủ ba service này.

## Các container

| Container | Build từ | Dockerfile | Port | Vai trò |
|---|---|---|---|---|
| web | gốc repo | `docker/web.Dockerfile` | 127.0.0.1:18081 | nginx phục vụ bản build tĩnh của frontend (Vite `dist`), có SPA fallback |
| auth | `services/auth` | `docker/auth.Dockerfile` | 127.0.0.1:3001 | Node 20 + Express: đăng nhập, phiên, tenant, vai trò |
| it | `services/it` | `docker/it.Dockerfile` | 127.0.0.1:3002 | Node 20 + Express: trạng thái dịch vụ, ticket, sự cố, phòng họp, vinh danh |
| games | `services/games` | `docker/games.Dockerfile` | 127.0.0.1:3003 | Node 20 + Express: trò chơi giải trí (caro, quiz, bảng xếp hạng) |
| karaoke | `services/karaoke` | `docker/karaoke.Dockerfile` | 127.0.0.1:3004 | Node 20 + Express: bài hát, ghi điểm, bảng xếp hạng, lịch sử hát |
| events | `services/events` | `docker/events.Dockerfile` | 127.0.0.1:3005 | Node 20 + Express: sự kiện giao lưu văn nghệ, tiết mục, bình chọn |
| gateway | gốc repo | `docker/gateway.Dockerfile` | 127.0.0.1:18080 | nginx reverse proxy, điểm vào duy nhất |

Cả bảy container dùng `network_mode: host`. Lý do: máy chủ đã cạn dải mạng Docker, và mạng bridge mặc định không có DNS giữa các container nên không dùng tên service trong cấu hình. Web, auth, it, games, karaoke, events và gateway chỉ lắng nghe `127.0.0.1`. Compose không khai báo `ports:` và không đặt `HOST`. Không mở port nào ra ngoài theo thiết kế.

## Đường đi của request

```
Trình duyệt (laptop)
   │  SSH tunnel: 18080 trên laptop → 127.0.0.1:18080 trên máy chủ
   ▼
gateway  127.0.0.1:18080
   ├─ /api/health                              → gateway tự trả lời
   ├─ /api/auth/*                              → auth     127.0.0.1:3001
   ├─ /api/it/*, /api/rooms/*, /api/kudos/*    → it       127.0.0.1:3002
   ├─ /api/games/*                             → games    127.0.0.1:3003
   ├─ /api/karaoke/*                           → karaoke  127.0.0.1:3004
   ├─ /api/events/*                            → events   127.0.0.1:3005
   ├─ /api/*  (không khớp ở trên)              → 404 JSON
   └─ mọi đường dẫn còn lại                    → web      127.0.0.1:18081
```

Trong cấu hình nginx, các location `/api/games`, `/api/karaoke` và `/api/events` không có dấu `/` cuối, để cả đường dẫn gốc lẫn `/api/games/...` đều được proxy mà không bị 301 làm mất method POST. Tài liệu viết `/api/games/*` cho ngắn gọn.

## Chạy trên máy chủ

Build và chạy trên máy chủ, không chạy `docker` hoặc `npm install` trên laptop theo quy tắc đã chốt.

Yêu cầu: Docker và Docker Compose v2 trên máy chủ; SSH key hoặc ssh-agent trên laptop để đăng nhập máy chủ (script không dùng mật khẩu).

### Cách 1: script triển khai

```bash
HOST=<ip-may-chu> SSH_USER=<user> REMOTE_DIR=/opt/gpb-tool bash scripts/deploy-remote.sh
```

Script đóng gói repo (loại `node_modules`, `dist`, `data`, `.git`, log và `.env*`), gửi lên `REMOTE_DIR` trên máy chủ, rồi chạy `docker compose build`, `docker compose up -d` và kiểm tra `/api/health`.

### Cách 2: thủ công trên máy chủ

```bash
cd /opt/gpb-tool
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:18080/api/health
```

### File cấu hình thật (.env)

Tùy chọn. Nếu không có `.env`, Compose dùng giá trị mặc định. Để đặt giá trị riêng, tạo `/opt/gpb-tool/.env` trên máy chủ từ `.env.example` và sửa giá trị. Script deploy không gửi `.env` từ laptop và không ghi đè file này trên máy chủ.

## Triển khai đồng thời 9 container

Trên máy chủ, trong thư mục repo đã đặt:

```bash
cd /opt/gpb-tool
docker compose build && docker compose up -d
```

Lệnh `build` tạo lại image của cả chín service (`web`, `auth`, `it`, `games`, `karaoke`, `events`, `display`, `plants`, `gateway`). Lệnh `up -d` áp dụng cho cả chín cùng lúc, và Compose chỉ tạo lại container có image hoặc cấu hình thay đổi. Các volume `auth-data`, `it-data`, `games-data`, `karaoke-data`, `events-data`, `display-data` và `plants-data` được giữ nguyên.

Sau khi chạy:

- `docker compose ps`: cả chín container phải ở trạng thái running. Chỉ web và gateway có healthcheck.
- `curl -fsS http://127.0.0.1:18080/api/health`: chỉ chứng minh gateway đang sống, không chứng minh auth và it sẵn sàng.
- `sh scripts/smoke.sh` (xem mục Kiểm thử nhanh): kiểm tra các luồng chính qua auth và it. Script chưa kiểm tra games, karaoke và events.

Trong lúc auth khởi động lại, it, games, karaoke, events, display và plants không cache phiên nên mọi request cần đăng nhập trả 401. Người đang dùng có thể bị đưa về màn hình đăng nhập tạm thời.

## Truy cập từ laptop qua SSH tunnel

```bash
ssh -L 18080:127.0.0.1:18080 <user>@<ip-may-chu>
```

Giữ cửa sổ SSH mở, rồi mở `http://127.0.0.1:18080` trên laptop.

## Kiểm thử nhanh

`scripts/smoke.sh` kiểm tra các luồng chính sau khi triển khai: sức khỏe gateway, đăng ký và xác minh OTP, đăng nhập bằng cookie, phân quyền, đặt phòng, vinh danh, ticket, sự cố và đăng xuất. Script chỉ dùng `curl`, `grep`, `sed`, `awk`, `mktemp` và `date`, không cần `jq`.

```bash
SMOKE_EMAIL=... SMOKE_PASSWORD=... SMOKE_OTP=... sh scripts/smoke.sh
```

Chạy từ thư mục repo trên máy chủ, hoặc trên laptop khi đã mở SSH tunnel tới `127.0.0.1:18080`. Dùng tài khoản thử, không dùng mật khẩu công việc.

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `GATEWAY` | không | Mặc định `http://127.0.0.1:18080` |
| `SMOKE_EMAIL` | có | Email thử. Dùng địa chỉ mới cho mỗi lần chạy |
| `SMOKE_PASSWORD` | có | 10 đến 128 ký tự |
| `SMOKE_OTP` | không | Mã 6 số gửi tới `SMOKE_EMAIL`. Thiếu thì chỉ chạy bước 1 đến 5 |
| `SMOKE_EXPECT_ROLE` | không | `employee` (mặc định), `it` hoặc `admin`. Phải khớp vai trò đã đặt |

Quy trình thường dùng:

1. Chạy lần đầu chỉ với `SMOKE_EMAIL` và `SMOKE_PASSWORD`. Bước 5 tạo tài khoản và gửi mã.
2. Lấy mã. Với `MAIL_MODE=log`, trên máy chủ chạy `docker compose logs auth | grep 'mail:log'`. Với `MAIL_MODE=smtp`, xem hộp thư của `SMOKE_EMAIL`.
3. Chạy lại với `SMOKE_OTP=<mã>`.
4. Để kiểm tra quyền IT: sau bước 1, đặt vai trò bằng `docker compose exec auth node scripts/admin.js set-role <email> it`, rồi chạy lại với `SMOKE_EXPECT_ROLE=it`.

Mã thoát: 0 khi không có bước FAIL, 1 khi có FAIL, 2 khi thiếu hoặc sai biến môi trường. Nếu có bước SKIP, script vẫn thoát 0 nhưng kết quả ghi rõ là chưa đầy đủ.

Điều cần biết:

- Script tạo dữ liệu thật trên hệ thống: tài khoản thử, một lượt đặt phòng (khung giờ từ 1 đến 3 giờ sau), một vinh danh và một ticket tiêu đề "smoke test". Dọn lại bằng tay nếu cần.
- Mỗi người chỉ gửi một vinh danh mỗi ngày theo giờ Việt Nam. Chạy lại trong cùng ngày với cùng tài khoản thì bước 12a trả 429.
- Đăng ký lại email đã xác minh trả 409 và không sinh mã mới. Mã OTP chỉ dùng một lần và hết hạn sau 10 phút. Gửi lại mã phải chờ 60 giây, nếu không sẽ trả 429.
- Nếu `GATEWAY` là `http://` mà `COOKIE_SECURE=true`, cookie `sid` có thể không được lưu. Khi đó bước 6 báo không nhận được cookie. Kiểm thử qua SSH tunnel thì để `COOKIE_SECURE=false`.

## Biến môi trường

| Biến | Container | Mặc định | Ý nghĩa |
|---|---|---|---|
| `MAIL_MODE` | auth | `log` | `log`: không gửi mail, mã OTP chỉ in ra log container. `smtp`: gửi thật qua `SMTP_*`. Giá trị khác `log` và `smtp` làm auth không khởi động |
| `COOKIE_SECURE` | auth | `false` | Đặt `true` khi truy cập qua HTTPS. Hiện truy cập qua SSH tunnel HTTP nên để `false` |
| `PUBLIC_BASE_URL` | auth | `http://127.0.0.1:18080` | URL người dùng thấy, dùng cho link callback SSO |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | auth | rỗng (`587`, `false`) | Chỉ dùng khi `MAIL_MODE=smtp`. Khi đó bắt buộc có `SMTP_HOST` và `MAIL_FROM`, thiếu thì auth không khởi động |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | auth | rỗng | Đăng nhập Google. Cần đủ cả hai giá trị, để trống thì nút bị vô hiệu hóa |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT` | auth | rỗng, `common` | Đăng nhập Microsoft (Entra ID). `common` cho cả tài khoản công ty và cá nhân |
| `AUTH_URL` | it, games, karaoke, events | `http://127.0.0.1:3001` | Địa chỉ auth để các service kiểm tra phiên qua `/api/auth/me` |

`PORT` và `DATA_DIR` được cố định trong `docker-compose.yml`: auth 3001, it 3002, games 3003, karaoke 3004, events 3005, dữ liệu ở `/data`. Không đổi các port này nếu không sửa `deploy/nginx/gateway.conf` tương ứng. Các giá trị này không cần đặt trong `.env`.

### Gửi mail thật qua Gmail cá nhân

Đặt trong `/opt/gpb-tool/.env` trên máy chủ, không đưa vào repo:

```
MAIL_MODE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<địa chỉ Gmail>
SMTP_PASS=<mật khẩu ứng dụng của Google>
MAIL_FROM=<địa chỉ Gmail>
```

`SMTP_PASS` phải là mật khẩu ứng dụng (cần bật xác minh 2 bước), không phải mật khẩu đăng nhập Gmail. Port 587 dùng STARTTLS, nên để `SMTP_SECURE=false`. Sau khi sửa `.env`, chạy `docker compose up -d auth` và kiểm tra log auth có dòng `mail=smtp`.

## Vai trò

Vai trò lưu trong bảng `users` của auth. Mặc định là `employee` khi đăng ký. Người dùng không tự khai vai trò. Đặt vai trò bằng lệnh trên máy chủ:

```bash
docker compose exec auth node scripts/admin.js set-role <email> <employee|it|admin>
```

Vai trò có hiệu lực ở request kế tiếp, không cần đăng nhập lại. Giao diện chỉ hiển thị vai trò mới sau khi tải lại trang.

| Vai trò | Quyền theo code hiện tại |
|---|---|
| `employee` | Mặc định. Dùng khu vực chung, Service Desk (tạo ticket), đặt phòng, bảng vinh danh, tường NOC (chỉ đọc). Gọi `/api/it/security/summary` nhận 403. Chơi games, hát karaoke, đăng ký tiết mục và bình chọn sự kiện. Tạo hoặc đóng sự kiện, hoặc xem kết quả khi sự kiện chưa đóng, nhận 403 |
| `it` | Như `employee`, thêm Phòng SOC trên giao diện và tóm tắt SOC qua API. Tạo và đóng sự kiện, xem kết quả khi sự kiện chưa đóng |
| `admin` | Hiện giống `it`. Chưa có quyền riêng nào trong code |

Lưu ý: API tạo sự cố `POST /api/it/incidents` hiện không kiểm tra vai trò. Mọi tài khoản đã đăng nhập đều gọi được (xem Lưu ý vận hành).

Games và karaoke không kiểm tra vai trò. Events chỉ kiểm tra vai trò ở ba thao tác: tạo sự kiện, đóng sự kiện, và xem kết quả khi sự kiện chưa đóng.

## Lưu ý vận hành

- **Auth chỉ lắng nghe 127.0.0.1.** `services/auth/index.js` gọi `app.listen(config.port, '127.0.0.1')`, nên cổng 3001 chỉ nhận kết nối từ chính máy chủ. Compose không khai báo `ports:`.
- **Chế độ mail log.** Mã OTP xác minh đăng ký được ghi vào log của container auth, không gửi đi. Chỉ dùng để thử nghiệm nội bộ. Xem log bằng `docker compose logs auth`.
- **Google và Microsoft đang tắt.** Các biến `GOOGLE_*` và `MICROSOFT_*` để trống. Để bật, cần client ID và secret thật, `PUBLIC_BASE_URL` đúng, và đăng ký redirect URI tương ứng ở nhà cung cấp (xem `services/auth/README.md`).
- **Tạo sự cố không kiểm tra vai trò.** `POST /api/it/incidents` cho phép mọi tài khoản đã đăng nhập tạo sự cố P1 hoặc P2. Giao diện hiện không có form này, nhưng API vẫn mở. Cần thêm kiểm tra vai trò trước khi dùng thật.
- **Giới hạn nằm trong bộ nhớ.** Khóa đăng nhập sai (auth) và token xác nhận sự cố (it) mất khi container khởi động lại. Chỉ chạy một instance mỗi service.
- **Dữ liệu nằm trong volume.** `auth-data`, `it-data`, `games-data`, `karaoke-data` và `events-data` giữ dữ liệu của từng service. `docker compose down -v` xóa cả năm volume và toàn bộ dữ liệu. Sao lưu trước khi làm việc này trên máy chủ thật.
- **Health check chỉ kiểm tra gateway.** `/api/health` trả lời từ gateway và không gọi auth hay các service khác. Kiểm tra thêm bằng `docker compose ps`, log của từng container, và `scripts/smoke.sh`.
- **Dữ liệu là mẫu.** Trạng thái dịch vụ và tóm tắt SOC đọc từ `services/it/mock/`. Thay bằng nguồn thật khi có yêu cầu.
- **Chưa có kiểm thử tự động.** Chưa có kiểm thử đơn vị hay tích hợp. `scripts/smoke.sh` chỉ là kiểm thử nhanh sau triển khai.
- **Chưa có `package-lock.json`.** Các Dockerfile dùng `npm install`, nên phiên bản dependency gián tiếp có thể khác giữa các lần build.

## Cấu trúc thư mục

```
docker/                       Dockerfile của 7 container, và file ignore riêng cho auth, it, games, karaoke, events
docker-compose.yml            7 service, network_mode: host, volume auth-data, it-data, games-data, karaoke-data, events-data
deploy/nginx/web.conf         cấu hình nginx cho frontend
deploy/nginx/gateway.conf     cấu hình nginx reverse proxy
scripts/deploy-remote.sh      đóng gói và triển khai qua SSH
scripts/smoke.sh              kiểm thử nhanh sau triển khai, qua gateway
.env.example                  mẫu biến môi trường (không chứa secret)
src/                          mã nguồn frontend (React, React Three Fiber)
index.html, vite.config.ts    cấu hình build frontend
services/auth/                service xác thực, gồm scripts/admin.js quản trị
services/it/                  service IT, gồm dữ liệu mẫu trong services/it/mock
services/games/               service trò chơi giải trí (caro, quiz, bảng xếp hạng), gồm câu hỏi trong src/data
services/karaoke/             service karaoke (bài hát, ghi điểm, lịch sử hát), gồm danh sách bài hát trong src/data
services/events/              service sự kiện giao lưu văn nghệ (tiết mục, bình chọn)
docs/                         kiến trúc (ARCHITECTURE.md) và rà soát OSS (OSS_REUSE.md)
THIRD_PARTY.md                danh sách thư viện và image bên thứ ba
```
