import { api, type ApiResult } from '../ui/api';
import { asRotation } from './placement';
import type { LayoutItem, LayoutState, Pose } from './types';

const BASE = '/api/layout';

interface MoveBody {
  ok?: boolean;
  item?: LayoutItem;
  version?: number;
  error?: string;
}

interface ResetBody {
  ok?: boolean;
  version?: number;
  error?: string;
}

export interface MoveResult {
  item: LayoutItem;
  version: number;
}

/** Chuẩn hoá góc xoay trong items và defaults về Rotation hợp lệ. */
export function normalizeState(s: LayoutState): LayoutState {
  const items: Record<string, LayoutItem> = {};
  for (const [id, it] of Object.entries(s.items ?? {})) {
    items[id] = { ...it, rotation: asRotation(it.rotation) };
  }
  const defaults: Record<string, Pose> = {};
  for (const [id, p] of Object.entries(s.defaults ?? {})) {
    defaults[id] = { x: p.x, z: p.z, rotation: asRotation(p.rotation) };
  }
  return { items, defaults, version: Number(s.version) || 0 };
}

/** Tải toàn bộ bố cục: items, defaults, version. */
export async function getLayoutState(): Promise<ApiResult<LayoutState>> {
  const r = await api<LayoutState>(`${BASE}/state`);
  if (!r.ok) return r;
  if (!r.data || typeof r.data !== 'object') {
    return { ok: false, status: 200, error: 'Dữ liệu bố cục không hợp lệ' };
  }
  return { ok: true, data: normalizeState(r.data) };
}

/**
 * Đặt vật thể về pose (x, z thế giới, rotation). Server có thể từ chối:
 * 409 vướng, 403 bàn làm việc, 429 quá nhanh. Lỗi trả về trong error.
 */
export async function moveItem(id: string, pose: Pose): Promise<ApiResult<MoveResult>> {
  const r = await api<MoveBody>(`${BASE}/move`, {
    method: 'POST',
    body: JSON.stringify({ id, x: pose.x, z: pose.z, rotation: pose.rotation }),
  });
  if (!r.ok) return r;
  const b = r.data;
  if (!b || b.ok === false || !b.item || typeof b.version !== 'number') {
    // HTTP 200 nhưng nội dung báo lỗi hoặc thiếu trường.
    return { ok: false, status: 200, error: b?.error ?? 'Phản hồi không hợp lệ từ máy chủ' };
  }
  return {
    ok: true,
    data: { item: { ...b.item, rotation: asRotation(b.item.rotation) }, version: b.version },
  };
}

/** Đặt lại về vị trí mặc định: một vật (truyền id) hoặc toàn bộ (không truyền). Chỉ it và admin. */
export async function resetLayout(id?: string): Promise<ApiResult<{ version: number }>> {
  const r = await api<ResetBody>(`${BASE}/reset`, {
    method: 'POST',
    body: JSON.stringify(id ? { id } : {}),
  });
  if (!r.ok) return r;
  const b = r.data;
  if (!b || b.ok === false || typeof b.version !== 'number') {
    return { ok: false, status: 200, error: b?.error ?? 'Phản hồi không hợp lệ từ máy chủ' };
  }
  return { ok: true, data: { version: b.version } };
}
