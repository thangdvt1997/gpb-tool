// Lưu bản nháp qua API bố cục hiện có (src/layout/api.ts). Xung đột 409: tải lại và báo.
import { getLayoutState, moveItem, resetLayout } from '../layout/api';
import type { LayoutState, Pose } from '../layout/types';
import { api as http, type ApiResult } from '../ui/api';
import { buildBatchOps, diffPoses, type BatchOp, type EditorState } from './core';

/** Phần API cần dùng; mặc định là API thật, test truyền bản giả. */
export interface SaveApi {
  move: (id: string, pose: Pose) => Promise<ApiResult<{ version: number }>>;
  reset: (id: string) => Promise<ApiResult<{ version: number }>>;
  load: () => Promise<ApiResult<LayoutState>>;
  /** Lưu nguyên tử: toàn bộ thao tác trong một yêu cầu, máy chủ chấp nhận hết hoặc không ghi gì. Có thể vắng (máy chủ cũ, test). */
  batch?: (ops: BatchOp[]) => Promise<ApiResult<{ version: number }>>;
}

/** POST /api/layout/batch. 409: cả lô bị từ chối, không ghi gì. */
export async function batchLayout(ops: BatchOp[]): Promise<ApiResult<{ version: number }>> {
  const r = await http<{ ok?: boolean; version?: number; error?: string }>('/api/layout/batch', {
    method: 'POST',
    body: JSON.stringify({ ops }),
  });
  if (!r.ok) return r;
  if (!r.data || r.data.ok === false || typeof r.data.version !== 'number') {
    return { ok: false, status: 200, error: r.data?.error ?? 'Phản hồi không hợp lệ từ máy chủ' };
  }
  return { ok: true, data: { version: r.data.version } };
}

export const realApi: SaveApi = { move: moveItem, reset: resetLayout, load: getLayoutState, batch: batchLayout };

export type SaveOutcome =
  | { kind: 'ok'; version: number; count: number }
  | { kind: 'nothing' }
  | { kind: 'conflict'; id: string; server: LayoutState | null; message: string }
  | { kind: 'error'; id: string; message: string };

/**
 * Lưu bản nháp. Có api.batch: một yêu cầu duy nhất, nguyên tử (409 thì không ghi gì, tải lại máy chủ báo xung đột).
 * Máy chủ cũ chưa có endpoint batch (404/405) và bản nháp chỉ đổi vị trí vật gốc: quay về cách cũ, từng vật.
 * Bản nháp có thêm/xóa vật thì bắt buộc dùng batch (cách cũ không làm được), lỗi báo rõ.
 */
export async function saveDraft(state: EditorState, api: SaveApi = realApi): Promise<SaveOutcome> {
  const ops = buildBatchOps(state);
  if (ops.length === 0) return { kind: 'nothing' };
  if (!api.batch) return saveEachItem(state, api);
  const r = await api.batch(ops);
  if (r.ok) return { kind: 'ok', version: r.data.version, count: ops.length };
  const legacyOk = ops.every((o) => o.op === 'move' || o.op === 'reset');
  if ((r.status === 404 || r.status === 405) && legacyOk) return saveEachItem(state, api);
  const id = ops[0].id;
  if (r.status === 409) {
    const loaded = await api.load();
    return { kind: 'conflict', id, server: loaded.ok ? loaded.data : null, message: r.error };
  }
  return { kind: 'error', id, message: r.error };
}

/**
 * Ghi từng vật đã đổi. Vật về đúng mặc định dùng reset (server xoá khỏi items); còn lại dùng move.
 * Thứ tự có thể gây 409 giả (vật A chờ vật B nhường chỗ), nên 409 được thử lại một lượt sau khi
 * các vật khác đã ghi. Còn 409 thì tải lại bản máy chủ và trả 'conflict'.
 */
async function saveEachItem(state: EditorState, api: SaveApi): Promise<SaveOutcome> {
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
