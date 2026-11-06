import { api } from '../ui/api';
import type { ApiResult } from '../ui/api';
import type { DirectoryEntry, Duel, DuelMode, DuelStatus, Lasthit } from './types';

const BASE = '/api/games/duel';

/** Đổi mã HTTP và mã lỗi của server sang câu tiếng Việt. */
export function describeError(status: number, code: string): string {
  switch (status) {
    case 0:
      return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
    case 401:
      return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.';
    case 403:
      return 'Bạn không có quyền với thao tác này, hoặc người được mời không phải nhân viên đang hoạt động.';
    case 404:
      return 'Không tìm thấy trận hoặc lời mời. Có thể đã hết hạn, hãy tải lại.';
    case 409:
      return 'Bạn hoặc đối phương đã có trận hoặc lời mời đang chờ. Hãy xử lý cái cũ trước.';
    case 429:
      return 'Bạn thao tác quá nhanh. Thử lại sau ít giây.';
    case 400:
      // Backend games trả câu tiếng Việt trong `error` (không phải mã), nên nhận cả hai dạng.
      return code === 'cannot_invite_self' || /tự mời/i.test(code)
        ? 'Bạn không thể tự mời chính mình.'
        : 'Yêu cầu chưa hợp lệ. Thử lại.';
    default:
      return status >= 500 ? 'Máy chủ đang gặp lỗi. Thử lại sau.' : 'Yêu cầu chưa thành công. Thử lại.';
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v !== '') return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

function num(o: Record<string, unknown>, fallback: number, ...keys: string[]): number {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return fallback;
}

const STATUSES: DuelStatus[] = ['invited', 'active', 'finished', 'expired', 'cancelled'];

function toLastHit(v: unknown): Lasthit | null {
  if (!isRecord(v)) return null;
  const by = str(v, 'by');
  if (!by) return null;
  return { by, power: num(v, 1, 'power'), damage: num(v, 0, 'damage'), at: str(v, 'at') };
}

export function toDuel(o: Record<string, unknown>): Duel {
  const st = str(o, 'status');
  // Backend games trả hp: { inviter, invitee } (null khi dance) và down: { userId, downUntil } (null khi không ai nằm đỡ).
  const hp = isRecord(o.hp) ? o.hp : null;
  const down = isRecord(o.down) ? o.down : null;
  return {
    id: str(o, 'id') ?? '',
    mode: str(o, 'mode') === 'dance' ? 'dance' : 'fight',
    status: STATUSES.find((s) => s === st) ?? 'invited',
    inviterId: str(o, 'inviterId', 'inviter_id') ?? '',
    inviteeId: str(o, 'inviteeId', 'invitee_id') ?? '',
    createdAt: str(o, 'createdAt', 'created_at'),
    acceptedAt: str(o, 'acceptedAt', 'accepted_at'),
    endedAt: str(o, 'endedAt', 'ended_at'),
    winnerId: str(o, 'winnerId', 'winner_id'),
    hpInviter: hp ? num(hp, 100, 'inviter') : num(o, 100, 'hpInviter', 'hp_inviter'),
    hpInvitee: hp ? num(hp, 100, 'invitee') : num(o, 100, 'hpInvitee', 'hp_invitee'),
    downUserId: down ? str(down, 'userId') : str(o, 'downUserId', 'down_user_id'),
    downUntil: down ? str(down, 'downUntil') : str(o, 'downUntil', 'down_until'),
    lastHit: toLastHit(o.lastHit),
    inviterName: str(o, 'inviterName', 'inviter_name'),
    inviteeName: str(o, 'inviteeName', 'invitee_name'),
  };
}

async function call<T, R>(path: string, init: RequestInit | undefined, map: (data: T) => R): Promise<ApiResult<R>> {
  const r = await api<T>(path, { credentials: 'same-origin', ...init });
  if (r.ok) return { ok: true, data: map(r.data) };
  return { ok: false, status: r.status, error: describeError(r.status, r.error) };
}

const post = (body?: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body ?? {}) });

function duelOf(d: unknown): Duel {
  return toDuel(isRecord(d) && isRecord(d.duel) ? d.duel : isRecord(d) ? d : {});
}

const enc = encodeURIComponent;

export function inviteDuel(targetUserId: string, mode: DuelMode): Promise<ApiResult<Duel>> {
  return call<unknown, Duel>(`${BASE}/invite`, post({ targetUserId, mode }), duelOf);
}

export function getDuelInbox(): Promise<ApiResult<Duel[]>> {
  return call<unknown, Duel[]>(`${BASE}/inbox`, undefined, (d) => {
    const arr = Array.isArray(d) ? d : isRecord(d) ? (d.duels ?? d.items ?? d.inbox) : null;
    return Array.isArray(arr) ? arr.filter(isRecord).map(toDuel) : [];
  });
}

export function acceptDuel(duelId: string): Promise<ApiResult<Duel>> {
  return call<unknown, Duel>(`${BASE}/${enc(duelId)}/accept`, post(), duelOf);
}

export function declineDuel(duelId: string): Promise<ApiResult<Duel>> {
  return call<unknown, Duel>(`${BASE}/${enc(duelId)}/decline`, post(), duelOf);
}

export function hitDuel(duelId: string, power: 1 | 2 | 3): Promise<ApiResult<Duel>> {
  return call<unknown, Duel>(`${BASE}/${enc(duelId)}/hit`, post({ power }), duelOf);
}

export function forfeitDuel(duelId: string): Promise<ApiResult<Duel>> {
  return call<unknown, Duel>(`${BASE}/${enc(duelId)}/forfeit`, post(), duelOf);
}

export function leaveDuel(duelId: string): Promise<ApiResult<Duel>> {
  return call<unknown, Duel>(`${BASE}/${enc(duelId)}/leave`, post(), duelOf);
}

export function getDuel(duelId: string): Promise<ApiResult<Duel>> {
  return call<unknown, Duel>(`${BASE}/${enc(duelId)}`, undefined, duelOf);
}

/** Trận đang diễn ra của người đăng nhập, hoặc null. */
export function getActiveDuel(): Promise<ApiResult<Duel | null>> {
  return call<unknown, Duel | null>(`${BASE}/active`, undefined, (d) => {
    if (!isRecord(d)) return null;
    const inner = 'duel' in d ? d.duel : d;
    return isRecord(inner) && str(inner, 'id') ? toDuel(inner) : null;
  });
}

export function searchDirectory(query: string): Promise<ApiResult<DirectoryEntry[]>> {
  return call<unknown, DirectoryEntry[]>(`/api/auth/directory?query=${encodeURIComponent(query)}`, undefined, (d) => {
    const arr = Array.isArray(d) ? d : isRecord(d) ? (d.users ?? d.items ?? d.directory ?? d.entries) : null;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(isRecord)
      .map((o) => ({ id: str(o, 'id', 'userId') ?? '', name: str(o, 'name', 'displayName') ?? '', email: str(o, 'email') }))
      .filter((e) => e.id !== '' && e.name !== '');
  });
}

/** Lấy id người đăng nhập khi component cha không truyền currentUserId. */
export function getMyId(): Promise<ApiResult<string | null>> {
  return call<unknown, string | null>('/api/auth/me', undefined, (d) => {
    if (!isRecord(d)) return null;
    const u = isRecord(d.user) ? d.user : d;
    return str(u, 'id', 'userId');
  });
}
