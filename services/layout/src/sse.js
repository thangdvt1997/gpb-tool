// Hub SSE: giữ danh sách client đang mở trong bộ nhớ và phát sự kiện tới tất cả.
// App không cài middleware nén nào. Nếu sau này thêm nén, phải bỏ qua route /api/layout/stream.

const HEARTBEAT_MS = 25_000;
const RETRY_MS = 3_000;
const DEFAULT_MAX_CLIENTS = 2000;

function frame(event, data) {
  // JSON.stringify chỉ gọi một lần cho mỗi sự kiện, rồi ghi cùng chuỗi cho mọi client.
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Trả false nếu ghi lỗi (client đã đóng hoặc socket hỏng). Người gọi sẽ bỏ client đó.
function writeTo(res, text) {
  try {
    res.write(text);
    return true;
  } catch {
    return false;
  }
}

export function createSseHub({ maxClients = DEFAULT_MAX_CLIENTS, heartbeatMs = HEARTBEAT_MS } = {}) {
  const clients = new Set();
  let closing = false;

  // Comment heartbeat giữ kết nối khỏi bị proxy hoặc trình duyệt coi là treo.
  const heartbeat = setInterval(() => {
    for (const res of clients) {
      if (!writeTo(res, ': ping\n\n')) clients.delete(res);
    }
  }, heartbeatMs);
  heartbeat.unref();

  // Mở luồng cho một client. getState được gọi đồng bộ trước khi thêm client vào Set,
  // nên không có sự kiện nào lọt giữa snapshot ban đầu và danh sách nhận.
  // Trả false khi đã đủ client hoặc đang dừng service (người gọi trả 503).
  function open(res, getState) {
    if (closing || clients.size >= maxClients) return false;

    const initial = frame('state', getState());

    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    if (res.socket) res.socket.setNoDelay(true);

    writeTo(res, `retry: ${RETRY_MS}\n\n${initial}`);
    clients.add(res);

    const drop = () => clients.delete(res);
    res.on('close', drop);
    res.on('error', drop);
    return true;
  }

  function broadcast(event, data) {
    const text = frame(event, data);
    for (const res of clients) {
      if (!writeTo(res, text)) clients.delete(res);
    }
  }

  // Dùng khi dừng service: kết thúc mọi luồng để server.close() không chờ mãi.
  function closeAll() {
    closing = true;
    clearInterval(heartbeat);
    for (const res of clients) {
      try {
        res.end();
      } catch {
        // Bỏ qua: client đã đóng.
      }
    }
    clients.clear();
  }

  return { open, broadcast, closeAll };
}
