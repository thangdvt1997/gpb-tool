import { useEffect, useMemo, useRef, useState } from 'react';
import { describeChanges, GRID_STEPS, isDirty, type EditorAction, type EditorState } from './core';
import { isPropId, newPropId, PROP_CATALOG, PROP_KINDS, type PropKind } from './props';

export interface EditorPanelProps {
  state: EditorState;
  dispatch: (a: EditorAction) => void;
  onSave: () => void;
  /** Bản nháp cục bộ chờ người dùng quyết định (từ useLayoutEditor). */
  pendingDraft?: { applied: number; skipped: number; savedAt: number } | null;
  onResumeDraft?: () => void;
  onDiscardDraft?: () => void;
}

/**
 * Bảng điều khiển trình biên tập. Người không có quyền (khác it/admin) thấy thông báo chỉ xem.
 * Phím tắt (do useLayoutEditor cài): Ctrl+Z hoàn tác, Ctrl+Y / Ctrl+Shift+Z làm lại, Ctrl+S lưu,
 * R xoay, Delete xóa vật thêm (vật gốc thì đặt lại), Ctrl+D nhân bản, mũi tên di chuyển (Shift = 5 bước), Esc hủy.
 */
export function EditorPanel({ state, dispatch, onSave, pendingDraft, onResumeDraft, onDiscardDraft }: EditorPanelProps) {
  const changes = useMemo(() => describeChanges(state), [state.saved, state.draft, state.defaults, state.env]);
  const [kind, setKind] = useState<PropKind>('table');
  const resumeRef = useRef<HTMLButtonElement>(null);
  const asking = !state.active && !!pendingDraft && !!onResumeDraft && !!onDiscardDraft;
  useEffect(() => {
    if (asking) resumeRef.current?.focus();
  }, [asking]);
  if (!state.canEdit) {
    return <p role="status">Bạn chỉ có quyền xem bố trí. Chỉ IT hoặc admin được sắp xếp nội thất.</p>;
  }
  if (asking && pendingDraft) {
    const when = pendingDraft.savedAt ? ` (lưu lúc ${new Date(pendingDraft.savedAt).toLocaleString('vi-VN')})` : '';
    return (
      <section role="alertdialog" aria-label="Bản nháp bố trí chưa lưu" aria-describedby="layout-draft-desc" className="layout-editor-panel layout-draft-prompt">
        <p id="layout-draft-desc">
          Có bản nháp bố trí chưa lưu với {pendingDraft.applied} thay đổi{when}. Bạn muốn làm gì?
        </p>
        <button type="button" ref={resumeRef} onClick={onResumeDraft}>
          Tiếp tục bản nháp
        </button>
        <button type="button" onClick={onDiscardDraft}>
          Bỏ bản nháp
        </button>
      </section>
    );
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
  const selKind = sel ? state.env.props?.[sel] : undefined;
  const selIsWall = !!selKind && PROP_CATALOG[selKind].wall;
  const selDoor = !!(sel && state.draft[sel]?.door);
  return (
    <section aria-label="Trình biên tập bố trí" className="layout-editor-panel">
      <h2>Sắp xếp nội thất</h2>
      <p>{sel ? `Đang chọn: ${selKind ? PROP_CATALOG[selKind].label + ' (' + sel + ')' : sel}` : 'Chọn một vật trong cảnh để sắp xếp.'}</p>
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
      <div role="group" aria-label="Thêm vật">
        <label>
          Loại vật{' '}
          <select value={kind} disabled={busy} onChange={(e) => setKind(e.target.value as PropKind)}>
            {PROP_KINDS.map((k) => (
              <option key={k} value={k}>
                {PROP_CATALOG[k].label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={busy} onClick={() => dispatch({ type: 'addProp', kind, id: newPropId() })}>
          Thêm vật
        </button>
        <button type="button" disabled={busy || !sel} onClick={() => dispatch({ type: 'duplicate', id: newPropId() })}>
          Nhân bản vật đang chọn (Ctrl+D)
        </button>
        <button type="button" disabled={busy || !sel || !isPropId(sel)} onClick={() => dispatch({ type: 'delete' })}>
          Xóa vật đang chọn (Delete)
        </button>
        <button type="button" disabled={busy || !selIsWall} onClick={() => dispatch({ type: 'toggleDoor' })}>
          {selDoor ? 'Bỏ cửa khỏi tường đang chọn' : 'Thêm cửa vào tường đang chọn'}
        </button>
      </div>
      <p>{changes.length === 0 ? 'Chưa có thay đổi.' : `${changes.length} vật đã đổi so với bản đã lưu: ${changes.join(', ')}`}</p>
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
