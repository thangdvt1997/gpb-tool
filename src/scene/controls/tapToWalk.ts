/**
 * Chạm để đi: quyết định một lần chạm lên sàn có tính là "chạm để đi" hay không (hàm thuần).
 * Chuột và bút giữ hành vi cũ (click sàn, kéo quá 5 px không tính). Chỉ pointerType 'touch' bị siết:
 * phải bật cài đặt touch.tapToWalk, nhả trong 250 ms và lệch dưới 10 px, để kéo xoay camera không thành lệnh đi.
 */
export const TAP_MAX_MS = 250;
export const TAP_MAX_MOVE_PX = 10;

export interface PointerDownRecord {
  pointerType: string;
  t: number;
  x: number;
  y: number;
}

export function isTapToWalk(
  down: PointerDownRecord | null,
  up: { t: number; x: number; y: number },
  tapToWalkEnabled: boolean,
): boolean {
  if (down === null || down.pointerType !== 'touch') return true;
  if (!tapToWalkEnabled) return false;
  const ms = up.t - down.t;
  if (!(ms >= 0 && ms < TAP_MAX_MS)) return false;
  return Math.hypot(up.x - down.x, up.y - down.y) < TAP_MAX_MOVE_PX;
}
