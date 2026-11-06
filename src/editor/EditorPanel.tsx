import { useMemo } from 'react';
import { diffPoses, GRID_STEPS, isDirty, type EditorAction, type EditorState } from './core';

export interface EditorPanelProps {
  state: EditorState;
  dispatch: (a: EditorAction) => void;
  onSave: () => void;
}

/**
 * Bảng điều khiển trình biên tập. Người không có quyền (khác it/admin) thấy thông báo chỉ xem.
 * Phím tắt (do useLayoutEditor cài): Ctrl+Z hoàn tác, Ctrl+Y / Ctrl+Shift+Z làm lại, Ctrl+S lưu,
 * R xoay, Delete đặt lại vật, mũi tên di chuyển (Shift = 5 bước), Esc hủy.
 */
export function EditorPanel({ state, dispatch, onSave }: EditorPanelProps) {
  const diff = useMemo(() => diffPoses(state.saved, state.draft, state.defaults), [state.saved, state.draft, state.defaults]);
  if (!state.canEdit) {
    return <p role="status">Bạn chỉ có quyền xem bố trí. Chỉ IT hoặc admin được sắp xếp nội thất.</p>;
  }
  if (!state.active) {
    return (
      <button type="button" onClick={() => dispatch({ type: 'enter' })}>
        Sắp xếp nội thất
      </button>
    );
  }
  const busy = state.saving;
  const sel = state.selectedId;
  return (
    <section aria-label="Trình biên tập bố trí" className="layout-editor-panel">
      <h2>Sắp xếp nội thất</h2>
      <p>{sel ? `Đang chọn: ${sel}` : 'Chọn một vật trong cảnh để sắp xếp.'}</p>
      <label>
        Bước lưới{' '}
        <select value={state.gridStep} disabled={busy} onChange={(e) => dispatch({ type: 'setGrid', step: Number(e.target.value) })}>
          {GRID_STEPS.map((g) => (
            <option key={g} value={g}>
              {g} m
            </option>
          ))}
        </select>
      </label>
      <label>
        <input type="checkbox" checked={state.snap} disabled={busy} onChange={() => dispatch({ type: 'toggleSnap' })} /> Bắt lưới
      </label>
      <div role="group" aria-label="Thao tác">
        <button type="button" disabled={busy || state.past.length === 0} onClick={() => dispatch({ type: 'undo' })}>
          Hoàn tác
        </button>
        <button type="button" disabled={busy || state.future.length === 0} onClick={() => dispatch({ type: 'redo' })}>
          Làm lại
        </button>
        <button type="button" disabled={busy || !sel} onClick={() => dispatch({ type: 'rotate' })}>
          Xoay 90° (R)
        </button>
        <button type="button" disabled={busy || !sel} onClick={() => dispatch({ type: 'resetItem' })}>
          Đặt lại vật
        </button>
        <button type="button" disabled={busy} onClick={() => dispatch({ type: 'resetAll' })}>
          Đặt lại tất cả
        </button>
      </div>
      <p>{diff.length === 0 ? 'Chưa có thay đổi.' : `${diff.length} vật đã đổi so với bản đã lưu: ${diff.map((d) => d.id).join(', ')}`}</p>
      <div role="group" aria-label="Lưu">
        <button type="button" disabled={busy || !isDirty(state)} onClick={onSave}>
          {busy ? 'Đang lưu...' : 'Lưu'}
        </button>
        <button type="button" disabled={busy} onClick={() => dispatch({ type: 'exit' })}>
          Hủy
        </button>
      </div>
      <p role="status" aria-live="polite">
        {state.message}
      </p>
    </section>
  );
}
