import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

export interface GlassFrameProps {
  /** Chiều rộng ô kính (m), đo theo trục X cục bộ. */
  width: number;
  /** Chiều cao ô kính (m), đo theo trục Y cục bộ. */
  height: number;
  /** Tâm ô kính trong hệ toạ độ của nhóm cha. */
  position: [number, number, number];
  /** Khoảng cách giữa các thanh đứng (m). */
  mullionEvery: number;
  /** Khoảng cách giữa các thanh ngang (m). Mặc định 1.4 m. */
  transomEvery?: number;
  /** Góc quay quanh trục Y (rad), kính mặt hướng +Z khi bằng 0. */
  rotationY?: number;
  /** Màu khung nhôm. */
  frameColor?: string;
}

const MULLION_W = 0.06;
const FRAME_DEPTH = 0.1;

export interface FrameBar {
  x: number;
  y: number;
  sx: number;
  sy: number;
}

/**
 * Tính vị trí các thanh khung (hàm thuần, không dựng mesh).
 * Thanh đứng đặt đều theo mullionEvery, thanh ngang đều theo transomEvery.
 * Cạnh ngoài luôn có thanh, nên tổng số thanh là (n + 1) + (m + 1).
 */
export function frameBars(width: number, height: number, mullionEvery: number, transomEvery: number): FrameBar[] {
  const n = Math.max(1, Math.round(width / Math.max(mullionEvery, 0.01)));
  const m = Math.max(1, Math.round(height / Math.max(transomEvery, 0.01)));
  const bars: FrameBar[] = [];
  for (let i = 0; i <= n; i++) {
    bars.push({ x: -width / 2 + (i * width) / n, y: 0, sx: MULLION_W, sy: height });
  }
  for (let j = 0; j <= m; j++) {
    bars.push({ x: 0, y: -height / 2 + (j * height) / m, sx: width, sy: MULLION_W });
  }
  return bars;
}

/**
 * Khung nhôm mảnh (một InstancedMesh cho mọi thanh), kính phản chiếu nhẹ và lớp phủ mờ.
 * Không dùng transmission: dùng opacity thấp để giữ chi phí GPU ở mức tích hợp.
 */
export function GlassFrame({
  width,
  height,
  position,
  mullionEvery,
  transomEvery = 1.4,
  rotationY = 0,
  frameColor = '#3b4048',
}: GlassFrameProps) {
  const parts = useMemo(() => {
    const bars = frameBars(width, height, mullionEvery, transomEvery);
    const frameGeo = new THREE.BoxGeometry(1, 1, FRAME_DEPTH);
    const frameMat = new THREE.MeshStandardMaterial({
      color: frameColor,
      metalness: 0.6,
      roughness: 0.35,
    });
    const frame = new THREE.InstancedMesh(frameGeo, frameMat, bars.length);
    frame.castShadow = false;
    frame.receiveShadow = false;

    const m4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      pos.set(b.x, b.y, 0);
      scl.set(b.sx, b.sy, 1);
      m4.compose(pos, quat, scl);
      frame.setMatrixAt(i, m4);
    }
    frame.instanceMatrix.needsUpdate = true;

    const glassGeo = new THREE.PlaneGeometry(width, height);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#b7d0e0',
      metalness: 0,
      roughness: 0.04,
      transmission: 0,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      envMapIntensity: 0.3,
      reflectivity: 0.2,
      specularIntensity: 0.6,
      side: THREE.DoubleSide,
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.renderOrder = 2;

    // Lớp phủ mờ đặt hơi lệch về phía trong để tạo chiều sâu, không ghi depth.
    const hazeGeo = new THREE.PlaneGeometry(width, height);
    const hazeMat = new THREE.MeshBasicMaterial({
      color: '#c4d3dc',
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const haze = new THREE.Mesh(hazeGeo, hazeMat);
    haze.position.z = -0.04;
    haze.renderOrder = 3;

    return { frame, frameGeo, frameMat, glass, glassGeo, glassMat, haze, hazeGeo, hazeMat };
  }, [width, height, mullionEvery, transomEvery, frameColor]);

  useEffect(() => {
    return () => {
      parts.frameGeo.dispose();
      parts.frameMat.dispose();
      parts.glassGeo.dispose();
      parts.glassMat.dispose();
      parts.hazeGeo.dispose();
      parts.hazeMat.dispose();
      parts.frame.dispose();
    };
  }, [parts]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <primitive object={parts.frame} />
      <primitive object={parts.glass} />
      <primitive object={parts.haze} />
    </group>
  );
}
