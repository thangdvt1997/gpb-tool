import { useEffect, useMemo, type DependencyList } from 'react';
import * as THREE from 'three';

/** Bộ ba số [x, y, z]. Đơn vị mét hoặc radian tùy ngữ cảnh. */
export type Vec3 = [number, number, number];

/**
 * Tạo tài nguyên three.js theo deps và tự dispose khi deps đổi hoặc khi unmount.
 * Dùng cho geometry và material do component tạo ra.
 */
export function useOwned<T extends { dispose: () => void }>(factory: () => T, deps: DependencyList): T {
  const value = useMemo(factory, deps);
  useEffect(() => {
    return () => value.dispose();
  }, [value]);
  return value;
}

/** Tách #rrggbb thành ba kênh 0..255. Chuỗi sai dạng trả về xám trung tính. */
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Trộn màu a với màu b theo tỉ lệ t (0 là a, 1 là b). */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** Làm tối (amount < 0, tới -1 là đen) hoặc sáng (amount > 0, tới 1 là trắng) một màu. */
export function shade(hex: string, amount: number): string {
  return amount >= 0 ? mixHex(hex, '#ffffff', amount) : mixHex(hex, '#000000', -amount);
}

/**
 * Vật liệu chuẩn cho một màu. metallic bật độ bóng kim loại (dùng cho vàng, khuy, kính).
 * glossy dùng cho da giày: roughness 0,35 và lớp phủ clearcoat 0,2.
 */
export function useStdMaterial(
  color: string,
  metallic: boolean = false,
  glossy: boolean = false,
): THREE.MeshStandardMaterial {
  return useOwned(() => {
    if (glossy) {
      return new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.3 });
    }
    return new THREE.MeshStandardMaterial({
      color,
      roughness: metallic ? 0.3 : 0.7,
      metalness: metallic ? 0.7 : 0.0,
    });
  }, [color, metallic, glossy]);
}

/** Các thuộc tính định vị dùng chung cho mọi khối. */
interface PlacementProps {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  color: string;
  metallic?: boolean;
  /** Chỉ Box dùng: bề mặt bóng như da giày. */
  glossy?: boolean;
}

/** Khối hộp chữ nhật. size là [rộng, cao, sâu]. */
export function Box({
  size,
  position,
  rotation,
  scale,
  color,
  metallic,
  glossy,
}: PlacementProps & { size: Vec3 }) {
  const [w, h, d] = size;
  const geometry = useOwned(() => new THREE.BoxGeometry(w, h, d), [w, h, d]);
  const material = useStdMaterial(color, metallic ?? false, glossy ?? false);
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow
    />
  );
}

/**
 * Khối cầu. thetaLength mặc định là nửa cầu trên của hình cầu (π), giảm xuống để tạo nắp tóc.
 */
export function Sphere({
  radius,
  thetaLength = Math.PI,
  segments = 16,
  position,
  rotation,
  scale,
  color,
  metallic,
}: PlacementProps & { radius: number; thetaLength?: number; segments?: number }) {
  const geometry = useOwned(
    () => new THREE.SphereGeometry(radius, segments * 2, segments, 0, Math.PI * 2, 0, thetaLength),
    [radius, thetaLength, segments],
  );
  const material = useStdMaterial(color, metallic ?? false);
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow
    />
  );
}

/**
 * Hình trụ, hoặc nón khi radiusTop bằng 0. Đặt thetaLength nhỏ hơn 2π để có nửa trụ.
 * Trục cao theo Y, như CylinderGeometry của three.js.
 */
export function Cylinder({
  radiusTop,
  radiusBottom,
  height,
  thetaStart = 0,
  thetaLength = Math.PI * 2,
  radialSegments = 16,
  position,
  rotation,
  scale,
  color,
  metallic,
}: PlacementProps & {
  radiusTop: number;
  radiusBottom: number;
  height: number;
  thetaStart?: number;
  thetaLength?: number;
  radialSegments?: number;
}) {
  const geometry = useOwned(
    () =>
      new THREE.CylinderGeometry(
        radiusTop,
        radiusBottom,
        height,
        radialSegments,
        1,
        false,
        thetaStart,
        thetaLength,
      ),
    [radiusTop, radiusBottom, height, thetaStart, thetaLength, radialSegments],
  );
  const material = useStdMaterial(color, metallic ?? false);
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow
    />
  );
}

/** Vòng xuyến. Mặc định nằm trong mặt XY (vòng quay quanh trục Z). arc giới hạn độ dài cung. */
export function Torus({
  radius,
  tube,
  arc = Math.PI * 2,
  radialSegments = 8,
  tubularSegments = 24,
  position,
  rotation,
  scale,
  color,
  metallic,
}: PlacementProps & {
  radius: number;
  tube: number;
  arc?: number;
  radialSegments?: number;
  tubularSegments?: number;
}) {
  const geometry = useOwned(
    () => new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments, arc),
    [radius, tube, arc, radialSegments, tubularSegments],
  );
  const material = useStdMaterial(color, metallic ?? false);
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow
    />
  );
}
