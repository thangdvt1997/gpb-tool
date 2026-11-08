import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Role, ZoneObject } from '../content/types';
import { useLayout } from '../layout/LayoutStore';
import { actionForKey, buildEditorEnv, createEditorState, editorReducer, type EditorAction } from './core';
import { newPropId, propBlockers } from './props';
import type { Rect } from '../scene/layout';
import { realApi, saveDraft, type SaveApi } from './save';

/** Phần tử đang gõ chữ thì không bắt phím tắt. */
function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/**
 * Hook phiên biên tập: nối reducer với LayoutProvider (nguồn dữ liệu đã lưu), API lưu và phím tắt.
 * Khi chưa vào chế độ sắp xếp, bản đã lưu theo kịp dữ liệu máy chủ; khi đã vào, không bị SSE ghi đè nháp.
 */
export function useLayoutEditor(objects: readonly ZoneObject[], role: Role | null | undefined, api: SaveApi = realApi) {
  const layout = useLayout();
  const env = useMemo(() => buildEditorEnv(objects), [objects]);
  const [state, dispatch] = useReducer(editorReducer, undefined, () => createEditorState(env, role));
  const stateRef = useRef(state);
  stateRef.current = state;

  const save = useCallback(async () => {
    const s = stateRef.current;
    if (!s.active || s.saving) return;
    dispatch({ type: 'saveStart' });
    const r = await saveDraft(s, api);
    if (r.kind === 'ok') dispatch({ type: 'saveDone', version: r.version });
    else if (r.kind === 'conflict' && r.server) dispatch({ type: 'conflict', server: r.server, id: r.id });
    else if (r.kind === 'conflict') dispatch({ type: 'saveFailed', message: `Xung đột khi lưu ${r.id} và không tải lại được bố cục.` });
    else if (r.kind === 'error') dispatch({ type: 'saveFailed', message: `Lưu ${r.id} thất bại: ${r.message}` });
    else dispatch({ type: 'saveFailed', message: 'Không có thay đổi để lưu.' });
  }, [api]);

  // Đồng bộ dữ liệu máy chủ khi chưa biên tập; reducer bỏ qua nếu đang biên tập.
  useEffect(() => {
    if (!layout.loaded) return;
    dispatch({ type: 'sync', server: { items: layout.items, defaults: layout.defaults, props: layout.props, version: layout.version }, env, role });
  }, [layout.loaded, layout.version, layout.items, layout.defaults, layout.props, env, role]);

  useEffect(() => {
    if (!state.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const intent = actionForKey(e);
      if (!intent) return;
      e.preventDefault();
      if (intent.type === 'save') void save();
      else if (intent.type === 'duplicate') dispatch({ type: 'duplicate', id: newPropId() });
      else dispatch(intent as EditorAction);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.active, save]);

  // Hộp va chạm của vật thêm ĐÃ LƯU (nháp chưa lưu chưa chặn đường, tránh kẹt nhân vật trong tường nháp).
  const blockers = useMemo<Rect[]>(() => propBlockers(state.saved, state.env.props), [state.saved, state.env.props]);

  return { state, dispatch, save, blockers };
}
