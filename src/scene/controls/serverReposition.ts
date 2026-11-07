// Máy chủ ghi đè vị trí nhân vật (ack corrected, snapshot resume có spawn): đặt yêu cầu vào đây,
// useCameraSafety lấy ở khung kế tiếp, đặt lại vị trí, dừng quán tính và cho camera nhảy thẳng tới chỗ mới.
// Chỉ giữ yêu cầu mới nhất.

export interface ServerReposition {
  x: number;
  z: number;
  /** Hướng thân (rad, quy ước playerPose). Bỏ qua nếu không phải số hữu hạn. */
  yaw?: number;
}

let pending: ServerReposition | null = null;

/** Nhận vị trí từ máy chủ. Tọa độ không hữu hạn bị bỏ. Trả true nếu đã nhận. */
export function pushServerReposition(r: ServerReposition): boolean {
  if (!Number.isFinite(r.x) || !Number.isFinite(r.z)) return false;
  pending = { x: r.x, z: r.z, yaw: typeof r.yaw === 'number' && Number.isFinite(r.yaw) ? r.yaw : undefined };
  return true;
}

export function takeServerReposition(): ServerReposition | null {
  const r = pending;
  pending = null;
  return r;
}
