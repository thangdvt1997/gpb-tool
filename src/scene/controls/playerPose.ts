/**
 * Vị trí và hướng hiện tại của nhân vật người chơi.
 * Chỉ module điều khiển (Player / controls) được ghi vào đây, mỗi khung hình.
 * Nơi khác chỉ đọc.
 * Quy ước: hướng nhìn = (sin yaw, cos yaw). yaw = π nhìn về phía -z.
 */
export const playerPose = { x: 0, z: 0, yaw: Math.PI };
