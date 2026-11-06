import { useLayoutEffect, useMemo } from 'react';
import { useDisplay } from './DisplayStore';
import { BOARD_W, BoardPainter } from './drawStrokes';
import { pixelHeight, useScreenTexture } from './texture';
import type { BoardId, Stroke } from './types';

const NO_STROKES: readonly Stroke[] = [];

export interface WhiteboardScreenProps {
  boardId: BoardId;
  position: [number, number, number];
  rotation?: [number, number, number];
  /** [rộng, cao] của mặt bảng, đơn vị mét. */
  size: [number, number];
  onClick?: (boardId: BoardId) => void;
}

/**
 * Bảng vẽ trong 3D, hiển thị nét realtime lên CanvasTexture 1024 px rộng.
 * Thêm nét thì chỉ vẽ phần mới. Clear thì vẽ lại từ đầu. Không dùng requestAnimationFrame.
 */
export function WhiteboardScreen({ boardId, position, rotation, size, onClick }: WhiteboardScreenProps) {
  const { boards } = useDisplay();
  const strokes = boards[boardId]?.strokes ?? NO_STROKES;
  const texH = pixelHeight(size, BOARD_W);
  const { ctx, texture } = useScreenTexture(BOARD_W, texH);
  const painter = useMemo(() => (ctx ? new BoardPainter(ctx, BOARD_W, texH) : null), [ctx, texH]);

  useLayoutEffect(() => {
    if (!painter) return;
    painter.sync(strokes);
    texture.needsUpdate = true;
  }, [painter, strokes, texture]);

  const [w, h] = size;
  return (
    <group position={position} rotation={rotation} onClick={() => onClick?.(boardId)}>
      <mesh position={[0, 0, -0.015]}>
        <boxGeometry args={[w + 0.06, h + 0.06, 0.03]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}
