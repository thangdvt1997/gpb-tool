/**
 * Nguồn input cho trạng thái interact/stunned của FSM locomotion (TASK 02). Hàm thuần, thời gian truyền vào (giây).
 *
 * interact: chỉ NGHE bus sự kiện tương tác vật (scene/interact/objects/interactEvents), không sửa module đó.
 *   Sự kiện hành động thật (mở cửa, bật đèn, nhặt đồ...) bật một xung INTERACT_PULSE giây. Sự kiện từ chối
 *   (*.denied, *.blocked, *.locked) và ghế (chair.*, ngồi/đứng đã do session ghế quyết định) không tính.
 * stunned: nguồn thật duy nhất hiện có là khóa nhân vật từ ngoài (isLocked của useGtaPlayer, Player.tsx nối với
 *   getMyVisual().locked = đang nằm đỡ khi trúng đòn trong duel). Không có cơ chế đẩy/va chạm mạnh/knockback nào
 *   trong điều khiển nên KHÔNG bịa nguồn đó. requestStun là điểm nối sẵn cho nguồn như vậy sau này (chưa có nơi gọi).
 */
import type { InteractEventType } from '../interact/objects/interactEvents';

export const INTERACT_PULSE = 0.6;

export interface LocoPulses {
  interactUntil: number;
  stunUntil: number;
}

export function createLocoPulses(): LocoPulses {
  return { interactUntil: 0, stunUntil: 0 };
}

/** Sự kiện này có phải người chơi vừa dùng vật (làm hành động thật) không. */
export function isUseEvent(type: InteractEventType | string): boolean {
  if (type.startsWith('chair.')) return false;
  if (/\.(denied|blocked|locked)$/.test(type)) return false;
  return true;
}

export function noteInteractEvent(p: LocoPulses, type: InteractEventType | string, now: number): boolean {
  if (!isUseEvent(type)) return false;
  p.interactUntil = Math.max(p.interactUntil, now + INTERACT_PULSE);
  return true;
}

/** Điểm nối cho nguồn choáng sau này (đẩy, va chạm mạnh). Chưa có nơi gọi. */
export function requestStun(p: LocoPulses, now: number, seconds: number): void {
  if (seconds > 0) p.stunUntil = Math.max(p.stunUntil, now + seconds);
}

export function interactActive(p: LocoPulses, now: number): boolean {
  return now < p.interactUntil;
}

export function stunActive(p: LocoPulses, now: number): boolean {
  return now < p.stunUntil;
}
