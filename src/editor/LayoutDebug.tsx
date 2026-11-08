import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Box3, Vector3 } from 'three';
import type { Rect } from '../scene/layout';
import type { EditorAction } from './core';

/** Cờ e2e: chỉ bật khi URL có ?debug=layout. */
export const LAYOUT_DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'layout';

export interface LayoutDebugHook {
  /** Tâm (x, z) thế giới của nhóm 'fx-<id>' trong scene graph (tivi, bảng, cây), hoặc null nếu chưa dựng. */
  meshCenter: (id: string) => { x: number; z: number } | null;
  /** Chọn vật trong trình biên tập (thay cho bấm chuột vào cảnh). */
  select: (id: string) => void;
  /** Vật cản mà nhân vật dùng (ITOffice.obstacles). */
  obstacles: () => Rect[];
}

type W = Window & { __gpbLayout?: LayoutDebugHook; __gpbLayoutObstacles?: readonly Rect[] };

/** Đặt trong Canvas. Hook e2e window.__gpbLayout (?debug=layout): đọc vị trí mesh theo scene graph, chọn vật. */
export function LayoutDebug({ dispatch }: { dispatch: (a: EditorAction) => void }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (!LAYOUT_DEBUG) return;
    const w = window as W;
    const box = new Box3();
    const c = new Vector3();
    w.__gpbLayout = {
      meshCenter: (id) => {
        const g = scene.getObjectByName(`fx-${id}`);
        if (!g) return null;
        box.setFromObject(g);
        if (box.isEmpty()) return null;
        box.getCenter(c);
        return { x: c.x, z: c.z };
      },
      select: (id) => dispatch({ type: 'select', id }),
      obstacles: () => [...(w.__gpbLayoutObstacles ?? [])],
    };
    return () => {
      delete w.__gpbLayout;
    };
  }, [scene, dispatch]);
  return null;
}
