// Hành động xã hội đang chạy trên avatar người khác (nhận qua social_play / sau khi lời mời được chấp nhận).
// Thuần, không phụ thuộc React/three: map (id, emote, mục tiêu) -> trạng thái, tự hết hạn rồi trả về locomotion.
import { EMOTES } from '../emotes/library';
import { emoteDurationSec } from '../emotes/player';
import { yawToward } from '../emotes/social/logic';
import type { EmoteId } from '../emotes/types';

export interface RemoteAction {
  emoteId: EmoteId;
  startedAt: number;
  endsAt: number;
  /** Điểm mà avatar quay mặt về (vị trí người nhận). */
  faceTo?: { x: number; z: number };
}

/** Trần thời lượng cho emote không tự kết thúc (loop/hold) để không kẹt mãi. */
export const MAX_REMOTE_ACTION_MS = 6000;

export class RemoteActions {
  private map = new Map<string, RemoteAction>();

  /** Bắt đầu hành động. Trả false nếu emote lạ. Hành động mới thay hành động cũ của cùng người. */
  play(id: string, emoteId: EmoteId, now: number, faceTo?: { x: number; z: number }): boolean {
    const def = EMOTES[emoteId];
    if (!def) return false;
    const dur = Math.min(emoteDurationSec(def) * 1000, MAX_REMOTE_ACTION_MS);
    this.map.set(id, { emoteId, startedAt: now, endsAt: now + dur, faceTo });
    return true;
  }

  /** Hành động hiện tại, hoặc null nếu không có/đã hết hạn (đồng thời dọn). */
  get(id: string, now: number): RemoteAction | null {
    const a = this.map.get(id);
    if (!a) return null;
    if (now >= a.endsAt) {
      this.map.delete(id);
      return null;
    }
    return a;
  }

  clear(id: string): void {
    this.map.delete(id);
  }

  clearAll(): void {
    this.map.clear();
  }
}

/** Yaw avatar khi đang làm hành động: quay về mục tiêu; không có mục tiêu thì giữ yaw mạng. */
export function actionYaw(a: RemoteAction | null, pos: { x: number; z: number }, netYaw: number): number {
  if (!a || !a.faceTo) return netYaw;
  return yawToward(pos, a.faceTo, netYaw);
}

/** Người đang ngồi hoặc không đứng yên thì không chạy hành động (pose mạng 'sit'/'walk'/...). */
export function canShowAction(anim: string): boolean {
  return anim === 'idle' || anim === 'emote';
}
