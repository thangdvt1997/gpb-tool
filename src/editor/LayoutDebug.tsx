import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Box3, Vector3 } from 'three';
import type { Rect } from '../scene/layout';
import type { EditorAction } from './core';

/** Cờ e2e: chỉ bật khi URL có ?debug=layout. */
export const LAYOUT_DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).getAll('debug').includes('layout');

export interface LayoutDebugHook {
  /** Tâm (x, z) thế giới của nhóm 'fx-<id>' trong scene graph (tivi, bảng, cây), hoặc null nếu chưa dựng. */
  meshCenter: (id: string) => { x: number; z: number } | null;
  /**
   * Khối ghép đã xoay theo bố cục (group 'rot-parts-<id>' / 'rot-desk-<id>' / 'rot-<id>'): rotation.y của group và hộp bao thế giới
   * của chính group đó. null nếu không có group nào mang tên đó.
   */
  rotated: (id: string) => Record<'parts' | 'desk' | 'decor', { rotationY: number; box: { minX: number; maxX: number; minZ: number; maxZ: number } } | null>;
  /** Tên mọi group xoay (rot-*) đang có trong cảnh, để kiểm không vẽ hai lần. */
  rotatedNames: () => string[];
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
      rotated: (id) => {
        const get = (name: string) => {
          const g = scene.getObjectByName(name);
          if (!g) return null;
          box.setFromObject(g);
          if (box.isEmpty()) return null;
          return { rotationY: g.rotation.y, box: { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z } };
        };
        return { parts: get(`rot-parts-${id}`), desk: get(`rot-desk-${id}`), decor: get(`rot-${id}`) };
      },
      rotatedNames: () => {
        const names: string[] = [];
        scene.traverse((o) => { if (o.name.startsWith('rot-')) names.push(o.name); });
        return names;
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
