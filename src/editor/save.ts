// Lưu bản nháp qua API bố cục hiện có (src/layout/api.ts). Xung đột 409: tải lại và báo.
import { getLayoutState, moveItem, resetLayout } from '../layout/api';
import type { LayoutState, Pose } from '../layout/types';
import type { ApiResult } from '../ui/api';
import { diffPoses, type EditorState } from './core';

/** Phần API cần dùng; mặc định là API thật, test truyền bản giả. */
export interface SaveApi {
  move: (id: string, pose: Pose) => Promise<ApiResult<{ version: number }>>;
  reset: (id: string) => Promise<ApiResult<{ version: number }>>;
  load: () => Promise<ApiResult<LayoutState>>;
}

export const realApi: SaveApi = { move: moveItem, reset: resetLayout, load: getLayoutState };

export type SaveOutcome =
  | { kind: 'ok'; version: number; count: number }
  | { kind: 'nothing' }
  | { kind: 'conflict'; id: string; server: LayoutState | null; message: string }
  | { kind: 'error'; id: string; message: string };

/**
 * Ghi từng vật đã đổi. Vật về đúng mặc định dùng reset (server xoá khỏi items); còn lại dùng move.
 * Thứ tự có thể gây 409 giả (vật A chờ vật B nhường chỗ), nên 409 được thử lại một lượt sau khi
 * các vật khác đã ghi. Còn 409 thì tải lại bản máy chủ và trả 'conflict'.
 */
export async function saveDraft(state: EditorState, api: SaveApi = realApi): Promise<SaveOutcome> {
  const diff = diffPoses(state.saved, state.draft, state.defaults);
  if (diff.length === 0) return { kind: 'nothing' };
  let pending = diff;
  let version = state.savedVersion;
  let done = 0;
  for (let pass = 0; pass < 2 && pending.length > 0; pass++) {
    const retry: typeof pending = [];
    for (const e of pending) {
      const r = e.toDefault ? await api.reset(e.id) : await api.move(e.id, e.to);
      if (r.ok) {
        version = r.data.version;
        done++;
      } else if (r.status === 409 && pass === 0) {
        retry.push(e);
      } else if (r.status === 409) {
        const loaded = await api.load();
        return { kind: 'conflict', id: e.id, server: loaded.ok ? loaded.data : null, message: r.error };
      } else {
        return { kind: 'error', id: e.id, message: r.error };
      }
    }
    pending = retry;
  }
  return { kind: 'ok', version, count: done };
}
