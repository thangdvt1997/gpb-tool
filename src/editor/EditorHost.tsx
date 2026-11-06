import type { ReactNode } from 'react';
import type { Role, ZoneObject } from '../content/types';
import { useLayoutEditor } from './useLayoutEditor';

export type LayoutEditorApi = ReturnType<typeof useLayoutEditor>;

/**
 * Chạy useLayoutEditor bên trong LayoutProvider và đưa kết quả cho cây con (render prop), để cùng một phiên
 * biên tập dùng được cả trong Canvas (EditorLayer) lẫn HUD (EditorPanel).
 */
export function LayoutEditorHost({ objects, role, children }: { objects: readonly ZoneObject[]; role: Role; children: (ed: LayoutEditorApi) => ReactNode }) {
  const ed = useLayoutEditor(objects, role);
  return <>{children(ed)}</>;
}
