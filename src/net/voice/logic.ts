// Logic thuần của thoại WebRTC (TASK 25b): chọn peer, gain theo khoảng cách/phòng, máy trạng thái kết nối, trễ thử lại.
// Không đụng DOM/WebRTC để test được bằng vitest.
import { distanceGain, occlusionFor, type DistanceModel } from '../../audio/spatial/pure';

/** Số peer tối đa của mesh P2P (mỗi người gửi tới tối đa chừng này luồng). */
export const MAX_PEERS = 6;
/** Bắt đầu nối khi vào trong bán kính này (m); phải nhỏ hơn bán kính tín hiệu của server (40). */
export const ENTER_RADIUS = 25;
/** Đã nối thì giữ tới bán kính này (trễ, tránh nối rồi ngắt liên tục ở biên). */
export const KEEP_RADIUS = 30;
/** Mô hình suy giảm theo khoảng cách: rõ trong 1.5 m, nhỏ dần tới 0 ở 25 m. */
export const VOICE_MODEL: DistanceModel = { refDistance: 1.5, maxDistance: 25, rolloff: 1, model: 'linear' };
/** Mã "phòng" cho khoảng mở (ngoài mọi phòng kín). */
export const OPEN_AREA = 'open';

export interface Point {
  x: number;
  z: number;
}
export interface Candidate extends Point {
  id: string;
  /** Mã phòng chứa người đó (OPEN_AREA nếu ở khoảng mở). */
  room: string;
}
export interface SelfInfo extends Point {
  room: string;
}

export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.z - b.z);
const sameClosedRoom = (a: string, b: string): boolean => a === b && a !== OPEN_AREA;

/**
 * Chọn tối đa `max` peer: ưu tiên người cùng phòng kín (nghe rõ trong phòng họp), sau đó gần nhất.
 * Người đang nối (current) được giữ tới KEEP_RADIUS, người mới chỉ vào khi trong ENTER_RADIUS. Hòa thì theo id để ổn định.
 */
export function pickPeers(
  self: SelfInfo,
  others: readonly Candidate[],
  current: ReadonlySet<string>,
  max = MAX_PEERS,
  enter = ENTER_RADIUS,
  keep = KEEP_RADIUS,
): string[] {
  const scored: { id: string; room: boolean; d: number }[] = [];
  for (const o of others) {
    if (!Number.isFinite(o.x) || !Number.isFinite(o.z)) continue;
    const d = dist(self, o);
    const room = sameClosedRoom(self.room, o.room);
    const limit = current.has(o.id) ? keep : enter;
    if (room || d <= limit) scored.push({ id: o.id, room, d });
  }
  scored.sort((a, b) => (a.room === b.room ? 0 : a.room ? -1 : 1) || a.d - b.d || (a.id < b.id ? -1 : 1));
  return scored.slice(0, Math.max(0, max)).map((s) => s.id);
}

/** Gain nghe một peer: cùng phòng kín thì rõ hoàn toàn; còn lại theo khoảng cách, qua tường thì nhỏ hơn và bị lọc thấp. */
export function voiceGain(d: number, selfRoom: string, peerRoom: string): { gain: number; cutoffHz: number } {
  if (sameClosedRoom(selfRoom, peerRoom)) return { gain: 1, cutoffHz: occlusionFor('x', 'x').cutoffHz };
  const occ = occlusionFor(selfRoom, peerRoom);
  return { gain: distanceGain(d, VOICE_MODEL) * occ.gain, cutoffHz: occ.cutoffHz };
}

/** Chỉ một phía (id nhỏ hơn) tạo offer, để hai bên không đồng thời offer (glare). */
export function shouldInitiate(selfId: string, peerId: string): boolean {
  return selfId < peerId;
}

export type PeerState = 'idle' | 'offering' | 'answering' | 'connecting' | 'connected' | 'failed' | 'closed';
export type PeerEvent =
  | 'local_offer'
  | 'remote_offer'
  | 'answer'
  | 'ice_connected'
  | 'ice_disconnected'
  | 'ice_failed'
  | 'timeout'
  | 'bye'
  | 'close';

/**
 * Máy trạng thái một kết nối peer. 'closed' và 'failed' là trạng thái cuối của một lần gọi (phải tạo lần gọi mới).
 * ice_disconnected khi đang connected chỉ về 'connecting' (có thể tự phục hồi); timeout ép về 'failed'.
 */
export function nextPeerState(s: PeerState, e: PeerEvent): PeerState {
  if (s === 'closed') return 'closed';
  if (e === 'close' || e === 'bye') return 'closed';
  if (s === 'failed') return e === 'local_offer' || e === 'remote_offer' ? s : 'failed';
  switch (e) {
    case 'local_offer':
      return s === 'idle' ? 'offering' : s;
    case 'remote_offer':
      return s === 'idle' ? 'answering' : s;
    case 'answer':
      return s === 'offering' ? 'connecting' : s;
    case 'ice_connected':
      return s === 'connecting' || s === 'answering' || s === 'offering' ? 'connected' : s;
    case 'ice_disconnected':
      return s === 'connected' ? 'connecting' : s;
    case 'ice_failed':
      return 'failed';
    case 'timeout':
      return s === 'connected' ? s : 'failed';
    default:
      return s;
  }
}

/** Thời gian chờ tối đa để một lần gọi đạt connected. */
export const CONNECT_TIMEOUT_MS = 15_000;

/** Chờ trước khi thử nối lại sau lần thất bại thứ n (n>=1): 3 s, 6 s, 12 s... tối đa 30 s. */
export function retryDelayMs(failures: number): number {
  return Math.min(30_000, 3000 * 2 ** Math.max(0, failures - 1));
}

/** Mã phòng kín chứa điểm (chỉ các khu có tường: họp, karaoke, server, soc); ngoài ra là OPEN_AREA. */
export interface RoomRect {
  zone: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
const CLOSED_ZONES = new Set(['meeting', 'karaoke', 'server', 'soc']);
export function roomAt(rects: readonly RoomRect[], x: number, z: number): string {
  const i = rects.findIndex((r) => CLOSED_ZONES.has(r.zone) && x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
  return i < 0 ? OPEN_AREA : `${rects[i]!.zone}#${i}`;
}

/** Nhãn nút mic và thông báo trợ năng. */
export function micLabel(on: boolean): string {
  return on ? 'Tắt mic' : 'Bật mic';
}
export function micAnnouncement(on: boolean): string {
  return on ? 'Đã bật mic. Bạn đang nói chuyện với người ở gần.' : 'Đã tắt mic.';
}

const PRIVATE_IP = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.|f[cd][0-9a-f]{2}:|fe80:)/i;
/** Hạn mức ứng viên ICE giữ lại theo loại, để SDP vừa khung tín hiệu (máy có nhiều card mạng/docker cho SDP hơn 10 KB). */
export const SDP_CANDIDATE_QUOTA = { relay: 3, srflx: 2, host: 3 } as const;

/**
 * Rút gọn SDP: bỏ ứng viên TCP, giữ tối đa quota mỗi loại (relay/srflx/host), host có địa chỉ công khai hoặc mDNS ưu tiên
 * hơn host mạng riêng. Giữ nguyên mọi dòng khác và thứ tự các dòng được giữ.
 */
export function compactSdp(sdp: string, quota: { relay: number; srflx: number; host: number } = SDP_CANDIDATE_QUOTA): string {
  const lines = sdp.split(/\r\n/);
  interface Cand { index: number; kind: 'relay' | 'srflx' | 'host'; rank: number }
  const cands: Cand[] = [];
  lines.forEach((line, index) => {
    if (!line.startsWith('a=candidate:')) return;
    const f = line.split(' ');
    const proto = (f[2] ?? '').toLowerCase();
    const ip = f[4] ?? '';
    const typ = f[f.indexOf('typ') + 1];
    if (proto !== 'udp' || (typ !== 'relay' && typ !== 'srflx' && typ !== 'host')) {
      cands.push({ index, kind: 'host', rank: -1 }); // sẽ bị bỏ
      return;
    }
    cands.push({ index, kind: typ, rank: typ === 'host' && PRIVATE_IP.test(ip) ? 1 : 0 });
  });
  const drop = new Set<number>();
  const used = { relay: 0, srflx: 0, host: 0 };
  const ordered = [...cands].filter((c) => c.rank >= 0).sort((a, b) => a.rank - b.rank || a.index - b.index);
  for (const c of cands) if (c.rank < 0) drop.add(c.index);
  for (const c of ordered) {
    if (used[c.kind] >= quota[c.kind]) drop.add(c.index);
    else used[c.kind] += 1;
  }
  return lines.filter((_, i) => !drop.has(i)).join('\r\n');
}
