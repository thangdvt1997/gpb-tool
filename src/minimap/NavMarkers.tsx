// Marker chỉ đường trong thế giới 3D (đặt BÊN TRONG <Canvas>): cột sáng ở đích và dải mỏng trên sàn dọc tuyến.
// Đọc trạng thái từ navStore (store ngoài React) vì R3F không chuyển context qua Canvas.
// Dải tuyến là một BufferGeometry (một draw call); dựng lại khi tuyến đổi, giải phóng geometry cũ.
// Chỉ vẽ khi người dùng bật chỉ đường và marker thế giới; không ảnh hưởng va chạm hay điều khiển.

import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide } from 'three';
import { useNavSnapshot } from './navStore';
import { buildRouteStrip } from './routeStrip';

const ROUTE_COLOR = '#2fd0ff';
const GOAL_COLOR = '#ffd23f';
const PILLAR_HEIGHT = 2.4;

export function NavMarkers() {
  const nav = useNavSnapshot();
  const visible = nav.guidance && nav.worldMarkers;

  const geometry = useMemo(() => {
    if (!visible || nav.points.length < 2) return null;
    const strip = buildRouteStrip(nav.points);
    if (strip.indices.length === 0) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(strip.positions, 3));
    g.setIndex(new BufferAttribute(strip.indices, 1));
    g.computeBoundingSphere();
    return g;
    // nav.version đổi mỗi khi tuyến đổi.
  }, [visible, nav.points, nav.version]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!visible) return null;
  return (
    <group name="nav-markers" raycast={() => null}>
      {geometry && (
        <mesh geometry={geometry} renderOrder={5} frustumCulled={false} raycast={() => null}>
          <meshBasicMaterial color={ROUTE_COLOR} transparent opacity={0.85} depthWrite={false} side={DoubleSide} toneMapped={false} />
        </mesh>
      )}
      {nav.goal && (
        <group position={[nav.goal.x, 0, nav.goal.z]}>
          <mesh position={[0, PILLAR_HEIGHT / 2, 0]} renderOrder={6} raycast={() => null}>
            <cylinderGeometry args={[0.22, 0.22, PILLAR_HEIGHT, 20, 1, true]} />
            <meshBasicMaterial color={GOAL_COLOR} transparent opacity={0.35} depthWrite={false} side={DoubleSide} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6} raycast={() => null}>
            <ringGeometry args={[0.28, 0.4, 32]} />
            <meshBasicMaterial color={GOAL_COLOR} transparent opacity={0.9} depthWrite={false} side={DoubleSide} toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}
