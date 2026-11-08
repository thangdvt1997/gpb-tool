import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { EditorAction, EditorState } from './core';
import { DOOR_WIDTH, PROP_CATALOG, propRects } from './props';

export interface PropsLayerProps {
  state: EditorState;
  dispatch: (a: EditorAction) => void;
}

/**
 * Vẽ các vật thêm bằng trình biên tập (hộp màu theo loại). Ngoài chế độ sắp xếp vẽ bản đã lưu; trong chế độ sắp xếp
 * vẽ bản nháp và bấm vào vật để nhấc lên kéo (như vật gốc). Tường có cửa vẽ thành hai đoạn và một thanh ngang phía trên.
 */
export function PropsLayer({ state, dispatch }: PropsLayerProps) {
  const poses = state.active ? state.draft : state.saved;
  const entries = useMemo(
    () => Object.entries(poses).filter(([id]) => state.env.props?.[id]),
    [poses, state.env.props],
  );
  const onPick = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    if (!state.active) return;
    e.stopPropagation();
    if (state.drag) return;
    dispatch({ type: 'select', id });
    dispatch({ type: 'dragStart' });
  };
  return (
    <group name="editor-props">
      {entries.map(([id, pose]) => {
        const kind = state.env.props![id];
        const def = PROP_CATALOG[kind];
        const [, h] = def.size;
        const selected = state.active && state.selectedId === id;
        const color = selected ? '#ffd166' : def.color;
        const rects = propRects(kind, pose);
        return (
          <group key={id} name={`prop-${id}`} onClick={onPick(id)}>
            {rects.map((r, i) => (
              <mesh key={i} position={[(r.minX + r.maxX) / 2, h / 2, (r.minZ + r.maxZ) / 2]} castShadow receiveShadow>
                <boxGeometry args={[r.maxX - r.minX, h, r.maxZ - r.minZ]} />
                <meshStandardMaterial color={color} />
              </mesh>
            ))}
            {def.wall && rects.length === 2 && <DoorHeader rects={rects} h={h} color={color} />}
          </group>
        );
      })}
    </group>
  );
}

/** Thanh ngang trên khoảng hở cửa (cao 0,4 m) để tường nhìn liền nhưng vẫn đi qua được bên dưới. */
function DoorHeader({ rects, h, color }: { rects: ReturnType<typeof propRects>; h: number; color: string }) {
  const [a, b] = rects;
  const horizontal = a.maxX < b.minX - 1e-6; // hai đoạn tách nhau theo x
  const cx = horizontal ? (a.maxX + b.minX) / 2 : (a.minX + a.maxX) / 2;
  const cz = horizontal ? (a.minZ + a.maxZ) / 2 : (a.maxZ + b.minZ) / 2;
  const sx = horizontal ? DOOR_WIDTH : a.maxX - a.minX;
  const sz = horizontal ? a.maxZ - a.minZ : DOOR_WIDTH;
  return (
    <mesh position={[cx, h - 0.2, cz]}>
      <boxGeometry args={[sx, 0.4, sz]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
