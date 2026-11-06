import { useEffect } from 'react';
import { paintTv, useChannelData } from './channels';
import { useDisplay } from './DisplayStore';
import { pixelHeight, useScreenTexture } from './texture';
import type { ChannelId, TvId } from './types';

const TV_TEX_W = 512;
const FRAME_DEPTH = 0.04;

export interface TvScreenProps {
  tvId: TvId;
  position: [number, number, number];
  rotation?: [number, number, number];
  /** [rộng, cao] của màn hình, đơn vị mét. */
  size: [number, number];
  onClick?: (tvId: TvId) => void;
}

/**
 * Tivi trong 3D. Màn hình là một plane có CanvasTexture.
 * Chỉ vẽ lại khi bật tắt, đổi kênh hoặc dữ liệu kênh đổi. Kênh 6 vẽ lại mỗi giây để cập nhật đồng hồ.
 */
export function TvScreen({ tvId, position, rotation, size, onClick }: TvScreenProps) {
  const { tvs } = useDisplay();
  const tv = tvs[tvId];
  const on = tv?.on === true;
  const channel: ChannelId = tv?.channel ?? 1;
  const { content } = useChannelData(channel, on);
  const texH = pixelHeight(size, TV_TEX_W);
  const { ctx, texture } = useScreenTexture(TV_TEX_W, texH);

  useEffect(() => {
    if (!ctx) return;
    const paint = () => {
      paintTv(ctx, on, channel, content, TV_TEX_W, texH);
      texture.needsUpdate = true;
    };
    paint();
    if (!on || channel !== 6) return;
    const timer = setInterval(paint, 1000);
    return () => clearInterval(timer);
  }, [ctx, texture, on, channel, content, texH]);

  const [w, h] = size;
  return (
    <group position={position} rotation={rotation} onClick={() => onClick?.(tvId)}>
      <mesh position={[0, 0, -FRAME_DEPTH / 2]}>
        <boxGeometry args={[w + 0.08, h + 0.08, FRAME_DEPTH]} />
        <meshStandardMaterial color="#111318" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}
