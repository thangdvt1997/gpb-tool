import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Pose } from './types';

const VALID_COLOR = '#2fbf71';
const INVALID_COLOR = '#e5484d';
const GHOST_OPACITY = 0.45;

export interface GhostMeshProps {
  /** Kích thước chưa xoay [rộng x, cao y, sâu z], mét. Lấy từ ZoneObject.size. */
  size: [number, number, number];
  pose: Pose;
  valid: boolean;
  /** Độ cao tâm hộp. Mặc định size[1] / 2 (đặt sát sàn). Nên truyền position[1] của vật thể. */
  centerY?: number;
}

/** Bóng không nhận sự kiện con trỏ, để không chặn thao tác bấm vào vật thể phía dưới. */
function ignoreRaycast(): void {}

/**
 * Hộp bóng mờ thể hiện vị trí định đặt: xanh khi hợp lệ, đỏ khi không.
 * Geometry và vật liệu tạo qua useMemo, không tạo mới trong mỗi lần render.
 */
export function GhostMesh({ size, pose, valid, centerY }: GhostMeshProps) {
  const [w, h, d] = size;
  const geometry = useMemo(() => new THREE.BoxGeometry(w, h, d), [w, h, d]);
  const validMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: VALID_COLOR, transparent: true, opacity: GHOST_OPACITY, depthWrite: false }),
    [],
  );
  const invalidMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: INVALID_COLOR, transparent: true, opacity: GHOST_OPACITY, depthWrite: false }),
    [],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    return () => {
      validMaterial.dispose();
      invalidMaterial.dispose();
    };
  }, [validMaterial, invalidMaterial]);

  return (
    <mesh
      geometry={geometry}
      material={valid ? validMaterial : invalidMaterial}
      position={[pose.x, centerY ?? h / 2, pose.z]}
      rotation={[0, (pose.rotation * Math.PI) / 180, 0]}
      raycast={ignoreRaycast}
      renderOrder={10}
    />
  );
}
