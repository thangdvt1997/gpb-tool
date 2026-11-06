import { createContext, useContext } from 'react';
import * as THREE from 'three';

export type ObjState = 'idle' | 'hover' | 'active';

/** Trạng thái chọn và rê chuột dùng chung cho mọi vật thể trong scene. */
export interface SceneState {
  selected: string | null;
  hovered: string | null;
  select: (id: string) => void;
  hover: (id: string | null) => void;
  unhover: (id: string) => void;
}

export const SceneContext = createContext<SceneState>({
  selected: null,
  hovered: null,
  select: () => {},
  hover: () => {},
  unhover: () => {},
});

export function useScene(): SceneState {
  return useContext(SceneContext);
}

export function stateOf(id: string | undefined, selected: string | null, hovered: string | null): ObjState {
  if (id === undefined) return 'idle';
  if (id === selected) return 'active';
  if (id === hovered) return 'hover';
  return 'idle';
}

const ACTIVE_COLOR = '#4f8cff';
const WHITE = new THREE.Color('#ffffff');

/** Màu theo trạng thái: giữ màu nền, sáng hơn khi rê chuột, xanh khi đang chọn. */
export function toneFor(base: string, state: ObjState): string {
  if (state === 'active') return ACTIVE_COLOR;
  if (state === 'hover') return new THREE.Color(base).lerp(WHITE, 0.3).getStyle();
  return base;
}
