/** Khoảng tối thiểu giữa hai lần gửi tư thế (ms): 10 lần/giây. */
export const POSE_INTERVAL_MS = 100;
/** Đứng yên vẫn gửi nhịp để server không coi là mất (ms). */
export const POSE_KEEPALIVE_MS = 2000;

/** Quyết định gửi tư thế: đủ khoảng cách thời gian và (có đổi vị trí/hướng hoặc tới nhịp giữ kết nối). */
export function shouldSendPose(
  last: { t: number; x: number; z: number; yaw: number },
  p: { x: number; z: number; yaw: number },
  now: number,
): boolean {
  const dt = now - last.t;
  if (dt < POSE_INTERVAL_MS) return false;
  const moved = !(Math.abs(p.x - last.x) < 0.005 && Math.abs(p.z - last.z) < 0.005 && Math.abs(p.yaw - last.yaw) < 0.01);
  return moved || dt >= POSE_KEEPALIVE_MS;
}

/** Bật đồng bộ nhiều người: VITE_WORLD_ENABLED=1 lúc build hoặc ?world=1 (service world chưa deploy). */
export function worldEnabled(envFlag: string | undefined, search: string): boolean {
  return envFlag === '1' || new URLSearchParams(search).get('world') === '1';
}
