/**
 * Chọn tư thế nhân vật khi chụp ảnh. Danh sách lấy từ bộ biểu cảm có sẵn (EMOTE_ORDER), không thêm clip mới;
 * tư thế giữ là khung đứng yên (reducedFrame) của emote.
 */
import { EMOTES, EMOTE_ORDER } from '../emotes/library';
import type { Pose, UserEmoteId } from '../emotes/types';

export interface PhotoPoseOption {
  id: UserEmoteId;
  label: string;
}

/** Các tư thế chọn được, theo thứ tự bánh xe nhanh. */
export function photoPoseOptions(): PhotoPoseOption[] {
  return EMOTE_ORDER.map((id) => ({ id, label: EMOTES[id].label }));
}

/** Id hợp lệ trong danh sách chọn (loại emote nội bộ và chuỗi lạ). */
export function isPhotoPose(v: string): v is UserEmoteId {
  return (EMOTE_ORDER as readonly string[]).includes(v);
}

/** Tư thế tĩnh (một phần) của emote khi chụp: khung reducedFrame, kẹp chỉ số trong biên. */
export function heldPoseOf(id: UserEmoteId): Partial<Pose> {
  const def = EMOTES[id];
  const i = Math.min(def.frames.length - 1, Math.max(0, def.reducedFrame));
  return def.frames[i]!.pose;
}
