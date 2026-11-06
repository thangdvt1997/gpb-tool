/** Tính vị trí camera chụp ảnh. Thuần, không import. Quy ước hướng như playerPose: nhìn = (sin yaw, cos yaw). */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface CamPose {
  position: Vec3;
  target: Vec3;
}
export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface FollowParams {
  /** Khoảng cách tới điểm nhìn (m). */
  dist: number;
  /** Góc ngẩng (rad), dương là nhìn từ trên xuống. */
  pitch: number;
  /** Lệch ngang so với hướng nhân vật (rad); 0 là sau lưng, PI là chính diện. */
  azimuthOffset: number;
  /** Độ cao điểm nhìn trên chân (m). */
  targetHeight: number;
}

export const FOLLOW_LIMITS = { minDist: 0.8, maxDist: 12, minPitch: -0.2, maxPitch: 1.3 } as const;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Camera quay quanh nhân vật (orbit). Chỉ đọc vị trí và hướng; không ghi gì vào nhân vật. */
export function computeFollowPose(player: { x: number; z: number; yaw: number }, p: FollowParams): CamPose {
  const dist = clamp(p.dist, FOLLOW_LIMITS.minDist, FOLLOW_LIMITS.maxDist);
  const pitch = clamp(p.pitch, FOLLOW_LIMITS.minPitch, FOLLOW_LIMITS.maxPitch);
  const az = player.yaw + p.azimuthOffset;
  const target = { x: player.x, y: p.targetHeight, z: player.z };
  const h = dist * Math.cos(pitch);
  return {
    target,
    position: {
      x: target.x - Math.sin(az) * h,
      y: Math.max(0.2, target.y + dist * Math.sin(pitch)),
      z: target.z - Math.cos(az) * h,
    },
  };
}

/** Kẹp vị trí camera tự do vào vùng cho phép. */
export function clampToBounds(v: Vec3, b: Bounds): Vec3 {
  return { x: clamp(v.x, b.minX, b.maxX), y: clamp(v.y, b.minY, b.maxY), z: clamp(v.z, b.minZ, b.maxZ) };
}

/** Di chuyển camera tự do theo hướng nhìn (yaw) rồi kẹp vùng. forward/right/up tính bằng m. */
export function stepFreeCamera(
  pos: Vec3,
  yaw: number,
  move: { forward: number; right: number; up: number },
  b: Bounds,
): Vec3 {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return clampToBounds(
    {
      // Hướng phải của (fx, fz) là (-fz, fx): yaw = PI nhìn -z thì phải là +x (có test).
      x: pos.x + fx * move.forward - fz * move.right,
      y: pos.y + move.up,
      z: pos.z + fz * move.forward + fx * move.right,
    },
    b,
  );
}

export interface FixedPreset {
  id: string;
  label: string;
  position: Vec3;
  target: Vec3;
  fov: number;
}
