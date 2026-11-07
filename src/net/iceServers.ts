// Lấy iceServers cho thoại WebRTC (TASK 25b) từ world: credential TURN ngắn hạn, không hardcode.
// Server trả 401 khi chưa đăng nhập, 503 khi chưa cấu hình TURN; khi đó trả null để người gọi
// tắt thoại thay vì thử kết nối không có relay.

export interface IceCredentials {
  iceServers: RTCIceServer[];
  /** Thời điểm (ms epoch) nên lấy lại, sớm hơn hạn 20%. */
  refreshAt: number;
}

export async function fetchIceServers(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
  url = '/api/world/turn',
): Promise<IceCredentials | null> {
  let res: Response;
  try {
    res = await fetchImpl(url, { credentials: 'include', cache: 'no-store' });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { ok?: boolean; iceServers?: unknown; ttlSec?: unknown } | null;
  if (!body || body.ok !== true || !Array.isArray(body.iceServers)) return null;
  const servers = body.iceServers.filter(
    (s): s is RTCIceServer =>
      !!s && typeof s === 'object' && typeof (s as RTCIceServer).username === 'string' && typeof (s as RTCIceServer).credential === 'string' && !!(s as RTCIceServer).urls,
  );
  if (servers.length === 0) return null;
  const ttl = typeof body.ttlSec === 'number' && body.ttlSec > 0 ? body.ttlSec : 600;
  return { iceServers: servers, refreshAt: now() + ttl * 800 };
}
