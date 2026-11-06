/**
 * Yêu cầu nhân vật tự đi tới một điểm (ví dụ khi bấm chuột vào vật thể ở xa).
 * Module điều khiển (Player / controls) gọi takeWalkRequest() mỗi khung hình.
 * - Khi tới nơi: đặt yaw về facingYaw (nếu có), rồi gọi onArrive().
 * - Nếu người chơi bấm phím di chuyển trong lúc đi: hủy yêu cầu, không gọi onArrive().
 * Chỉ giữ một yêu cầu tại một thời điểm; yêu cầu mới thay yêu cầu cũ.
 */
export interface WalkRequest {
  x: number;
  z: number;
  /** Hướng nhìn sau khi tới nơi, theo quy ước của playerPose. null = giữ nguyên. */
  facingYaw: number | null;
  onArrive?: () => void;
}

let pending: WalkRequest | null = null;

export function requestWalk(req: WalkRequest): void {
  pending = req;
}

export function takeWalkRequest(): WalkRequest | null {
  const r = pending;
  pending = null;
  return r;
}

export function cancelWalkRequest(): void {
  pending = null;
}
