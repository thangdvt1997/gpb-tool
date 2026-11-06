import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { worldPointFromRay } from '../layout/floorPointer';
import { GhostMesh } from '../layout/GhostMesh';
import { PLAY_HALF } from '../layout/placement';
import type { EditorAction, EditorState } from './core';
import { gridSegments } from './gridLines';

const LINE_Y = 0.02;

/** Lưới 3D nằm sát sàn, chỉ trong phạm vi chữ L. Chỉ render khi chế độ sắp xếp đang bật. */
export function EditorGrid({ step }: { step: number }) {
  const geometry = useMemo(() => {
    const seg = gridSegments(step);
    const pos = new Float32Array((seg.length / 4) * 6);
    for (let i = 0, j = 0; i < seg.length; i += 4, j += 6) {
      pos.set([seg[i], LINE_Y, seg[i + 1], seg[i + 2], LINE_Y, seg[i + 3]], j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [step]);
  const material = useMemo(() => new THREE.LineBasicMaterial({ color: '#4f7cff', transparent: true, opacity: 0.35, depthWrite: false }), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return <lineSegments geometry={geometry} material={material} raycast={() => {}} renderOrder={9} />;
}

export interface EditorLayerProps {
  state: EditorState;
  dispatch: (a: EditorAction) => void;
}

/**
 * Lớp cảnh của trình biên tập: lưới, bóng GhostMesh cho vật đang chọn (xanh hợp lệ, đỏ không hợp lệ)
 * và mặt phẳng vô hình trên sàn nhận kéo (dragMove khi di chuyển, dragEnd khi thả).
 * Việc bắt đầu kéo do vật thể gọi dispatch select + dragStart khi người dùng bấm vào nó.
 */
export function EditorLayer({ state, dispatch }: EditorLayerProps) {
  const { selectedId, preview, draft, env } = state;
  const size = selectedId ? env.sizes[selectedId] : undefined;
  if (!state.active) return null;
  const pose = preview?.pose ?? (selectedId ? draft[selectedId] : undefined);
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!state.drag) return;
    const p = worldPointFromRay(e.ray);
    if (p) dispatch({ type: 'dragMove', x: p.x, z: p.z });
  };
  return (
    <group>
      <EditorGrid step={state.gridStep} />
      {size && pose && (
        <GhostMesh size={[size.w, size.h, size.d]} pose={pose} valid={preview ? preview.valid : true} centerY={size.centerY} />
      )}
      {state.drag && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.01, 0]}
          onPointerMove={onMove}
          onPointerUp={() => dispatch({ type: 'dragEnd' })}
        >
          <planeGeometry args={[PLAY_HALF.x * 2 + 2, PLAY_HALF.z * 2 + 2]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
    </group>
  );
}
