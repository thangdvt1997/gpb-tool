// Gắn WebSocket server (thư viện `ws`) vào HTTP server của Express, đường dẫn WS_PATH.
// Thứ tự bắt tay: đường dẫn → Origin → số bắt tay đang chờ → auth (cookie, 3 s) → nâng cấp.
// Origin sai bị từ chối bằng HTTP 403 trước khi nâng cấp. Auth lỗi thì nâng cấp rồi đóng mã 4401,
// vì trình duyệt không đọc được status HTTP của bắt tay hỏng nhưng đọc được mã đóng.

import { STATUS_CODES } from 'node:http';
import { WebSocketServer } from 'ws';
import {
  CLOSE,
  MAX_FRAME_BYTES,
  MAX_PENDING_HANDSHAKES,
  REVALIDATE_MS,
  WS_PATH,
  WS_PING_MS,
} from './config.js';
import { createConnectionHandler } from './connection.js';
import { isAllowedOrigin } from './origin.js';

function reject(socket, status) {
  try {
    socket.write(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  } catch {
    // Bỏ qua.
  }
  socket.destroy();
}

export function attachWorldSocket({ server, config, world, hub, authClient }) {
  const wss = new WebSocketServer({
    noServer: true,
    // Khung lớn hơn 1 KB: `ws` đóng kết nối với mã 1009.
    maxPayload: MAX_FRAME_BYTES,
    perMessageDeflate: false,
    clientTracking: false,
  });
  let pending = 0;

  server.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    const path = String(req.url || '').split('?')[0];
    if (path !== WS_PATH) return reject(socket, 404);
    if (!isAllowedOrigin(req.headers.origin, config)) return reject(socket, 403);
    if (pending >= MAX_PENDING_HANDSHAKES) return reject(socket, 503);

    const cookie = typeof req.headers.cookie === 'string' ? req.headers.cookie : '';
    pending += 1;
    let user = null;
    try {
      user = await authClient.verify(cookie);
    } finally {
      pending -= 1;
    }
    if (socket.destroyed) return;
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, user, cookie, req));
  });

  function onConnection(ws, user, cookie, req) {
    ws.on('error', () => {});
    if (!user) return ws.close(CLOSE.UNAUTHENTICATED, 'unauthenticated');

    const conn = {
      alive: true,
      send: (text) => ws.send(text),
      get bufferedAmount() {
        return ws.bufferedAmount;
      },
      close: (code, reason) => ws.close(code, reason),
      terminate: () => ws.terminate(),
      ping: () => ws.ping(),
    };
    // Bị chủ phòng kick: chặn kết nối lại trong thời gian chờ.
    if (world.isKicked(user)) return ws.close(CLOSE.KICKED, 'kicked');
    // Chính sách nhiều tab: tab mới thay phiên cũ (đóng socket cũ với mã 4409).
    world.takeover(user);
    // Mở phiên TRƯỚC khi vào hub để sự kiện nhả lease của phiên cũ không đến trước snapshot.
    // Resume token và eseq cuối nằm trong query (token dùng một lần, có hạn, chỉ có giá trị với đúng người đã đăng nhập).
    const q = new URL(req.url, 'http://x').searchParams;
    const last = q.get('last');
    const opened = world.openSession(user, {
      resumeToken: q.get('resume') || undefined,
      lastEventSeq: last !== null && /^\d{1,12}$/.test(last) ? Number(last) : undefined,
    });
    const added = hub.add(user, conn);
    if (added.error) {
      world.abortSession(user);
      const code = added.error === 'server_full' ? CLOSE.SERVER_FULL : CLOSE.TOO_MANY_CONNECTIONS;
      return ws.close(code, added.error);
    }
    const client = added.client;
    const handler = createConnectionHandler({ world, hub, client });
    // snapshot là tin đầu tiên; mọi broadcast sau đó chạy ở vòng sự kiện sau nên không chen trước.
    hub.send(client, { ...world.snapshot(user), ...opened });

    // Kiểm tra lại phiên định kỳ. Chỉ đóng khi auth từ chối rõ ràng; auth chập chờn (timeout) thì giữ.
    const revalidate = setInterval(() => {
      authClient
        .fetchUser(cookie)
        .then((u) => {
          if (!u || u.id !== user.id || u.tenantId !== user.tenantId) {
            ws.close(CLOSE.UNAUTHENTICATED, 'unauthenticated');
          }
        })
        .catch(() => {});
    }, REVALIDATE_MS);
    revalidate.unref();

    ws.on('pong', () => {
      conn.alive = true;
    });
    ws.on('message', (data, isBinary) => handler.onMessage(data, isBinary));
    ws.on('close', () => {
      clearInterval(revalidate);
      handler.onClose();
    });
  }

  // Ping giao thức: kết nối không trả pong trong một chu kỳ bị ngắt (mạng rớt im lặng).
  const pinger = setInterval(() => {
    hub.forEach((c) => {
      if (!c.conn.alive) return c.conn.terminate();
      c.conn.alive = false;
      try {
        c.conn.ping();
      } catch {
        // Bỏ qua.
      }
    });
  }, WS_PING_MS);
  pinger.unref();

  function close() {
    clearInterval(pinger);
    hub.closeAll(CLOSE.SHUTDOWN, 'shutdown');
    wss.close();
  }

  return { close };
}
