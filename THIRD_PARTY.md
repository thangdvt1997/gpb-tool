# THIRD_PARTY

Danh sách thư viện, image và asset bên thứ ba. Phiên bản lấy từ `package.json` (root, `services/auth/package.json`, `services/it/package.json`), các dependency đều ghim phiên bản chính xác. Repo chưa có `package-lock.json`: khi có lock file (sau `npm install` trên máy chủ), cập nhật license theo lock file. Chi tiết cách xác minh và các mục còn mâu thuẫn xem `docs/OSS_REUSE.md`.

## Thư viện (npm)

| Gói | Phiên bản | License | Dùng ở | Ghi chú |
|---|---|---|---|---|
| express | 4.21.2 | MIT | auth, it | npm registry |
| better-sqlite3 | 11.7.0 | MIT | auth, it | npm registry |
| bcryptjs | 2.4.3 | MIT | auth | npm registry |
| nodemailer | 6.9.16 | MIT-0 (npm) / MIT (file LICENSE) | auth | Không khớp giữa hai nguồn, chờ pháp chế xác nhận |
| openid-client | 5.7.1 | MIT | auth | npm registry |
| react | 18.3.1 | MIT | web | npm registry |
| react-dom | 18.3.1 | MIT | web | npm registry |
| three | 0.169.0 | MIT | web | npm registry |
| @react-three/fiber | 8.17.10 | MIT | web | npm registry |
| @react-three/drei | 9.114.0 | MIT | web | npm registry |
| vite | 5.4.11 | MIT | web (build) | npm registry |
| @vitejs/plugin-react | 4.3.4 | MIT | web (build) | npm registry |
| typescript | 5.6.3 | Apache-2.0 | web (build) | npm registry |
| @types/react | 18.3.12 | MIT (theo kiến thức chung) | web (build) | Chưa xác minh |
| @types/react-dom | 18.3.1 | MIT (theo kiến thức chung) | web (build) | Chưa xác minh |
| @types/three | 0.169.0 | MIT (theo kiến thức chung) | web (build) | Chưa xác minh |

`services/auth` khai báo bcryptjs, better-sqlite3, express, nodemailer và openid-client. `services/it` khai báo better-sqlite3 và express. Tất cả đã có trong bảng trên.

## Image nền

| Image | Tag | License | Ghi chú |
|---|---|---|---|
| node | 20-alpine | MIT (lõi Node.js) | Thư viện đi kèm có license riêng, chưa kiểm tra từng cái |
| nginx | 1.27-alpine | BSD-2-Clause | LICENSE trên GitHub `nginx/nginx` |
| libstdc++ (gói apk, auth và it) | theo image | Chưa xác minh (theo kiến thức chung: GPL-3.0 kèm GCC Runtime Library Exception) | Runtime của better-sqlite3 |

## Asset

Chưa có asset bên ngoài trong prototype. Khi thêm asset, ghi nguồn, tác giả và license vào đây.
