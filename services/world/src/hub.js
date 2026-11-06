// Hub kết nối tách theo tenant, không phụ thuộc thư viện transport.
// conn cần: send(text), bufferedAmount (số byte chờ gửi), close(code, reason), terminate().
// Người khác tenant không bao giờ nhận tin của nhau.

export function encode(msg) {
  return JSON.stringify(msg);
}

export function createHub({ maxClients, maxPerUser, maxBufferBytes }) {
  const rooms = new Map(); // tenantId -> Set(client)
  const perUser = new Map(); // `${tenantId}:${userId}` -> số kết nối
  let total = 0;
  let closing = false;

  const keyOf = (user) => `${user.tenantId}:${user.id}`;

  /** Thêm kết nối. Trả {client} hoặc {error: 'server_full' | 'too_many_connections'}. */
  function add(user, conn) {
    if (closing || total >= maxClients) return { error: 'server_full' };
    const key = keyOf(user);
    if ((perUser.get(key) || 0) >= maxPerUser) return { error: 'too_many_connections' };
    const client = { user, conn, open: true };
    let set = rooms.get(user.tenantId);
    if (!set) {
      set = new Set();
      rooms.set(user.tenantId, set);
    }
    set.add(client);
    total += 1;
    perUser.set(key, (perUser.get(key) || 0) + 1);
    return { client };
  }

  /** Bỏ kết nối. Trả true nếu đây là kết nối cuối của người đó (người đó đã rời hẳn). */
  function remove(client) {
    if (!client.open) return false;
    client.open = false;
    const set = rooms.get(client.user.tenantId);
    if (set) {
      set.delete(client);
      if (set.size === 0) rooms.delete(client.user.tenantId);
    }
    total -= 1;
    const key = keyOf(client.user);
    const n = (perUser.get(key) || 1) - 1;
    if (n <= 0) {
      perUser.delete(key);
      return true;
    }
    perUser.set(key, n);
    return false;
  }

  // Gửi một chuỗi đã mã hóa. Bộ đệm vượt ngưỡng (client không đọc kịp) thì ngắt hẳn kết nối.
  function sendRaw(client, text) {
    if (!client.open) return;
    if ((client.conn.bufferedAmount || 0) > maxBufferBytes) {
      try {
        client.conn.terminate();
      } catch {
        // Bỏ qua.
      }
      return;
    }
    try {
      client.conn.send(text);
    } catch {
      // Lỗi gửi: transport sẽ phát close và người gọi remove().
    }
  }

  function send(client, msg) {
    sendRaw(client, encode(msg));
  }

  /** Phát cho mọi kết nối của tenant. Mã hóa JSON một lần. */
  function broadcast(tenantId, msg) {
    const set = rooms.get(tenantId);
    if (!set) return;
    const text = encode(msg);
    for (const c of [...set]) sendRaw(c, text);
  }

  /** Phát cho kết nối trong tenant thỏa pred(client). Dùng cho chat theo khoảng cách và lọc chặn. */
  function broadcastWhere(tenantId, msg, pred) {
    const set = rooms.get(tenantId);
    if (!set) return;
    const text = encode(msg);
    for (const c of [...set]) if (pred(c)) sendRaw(c, text);
  }

  /** Mọi kết nối của một người. */
  function clientsOf(user) {
    const out = [];
    for (const c of rooms.get(user.tenantId) || []) if (c.user.id === user.id) out.push(c);
    return out;
  }

  /**
   * Đóng mọi kết nối của một người ngay (thay phiên, kick). Gỡ khỏi hub trước nên onClose muộn của
   * kết nối cũ không bị tính là "người đó đã rời". Trả số kết nối đã đóng.
   */
  function closeUser(user, code, reason) {
    const list = clientsOf(user);
    for (const c of list) {
      c.replaced = true;
      remove(c);
      try {
        c.conn.close(code, reason);
      } catch {
        // Bỏ qua.
      }
    }
    return list.length;
  }

  function forEach(fn) {
    for (const set of rooms.values()) for (const c of [...set]) fn(c);
  }

  function closeAll(code, reason) {
    closing = true;
    forEach((c) => {
      try {
        c.conn.close(code, reason);
      } catch {
        // Bỏ qua.
      }
    });
  }

  return { add, remove, send, broadcast, broadcastWhere, clientsOf, closeUser, forEach, closeAll, size: () => total };
}
