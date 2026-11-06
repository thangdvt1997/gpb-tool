/** Sáu emote người dùng tự chọn. Chỉ tác động lên chính nhân vật, không nhắm vào người khác. */
export type UserEmoteId = 'dance_1' | 'dance_2' | 'kata' | 'punch_combo' | 'stance' | 'wave';

/** Năm emote nội bộ: scene phát cho NPC và đối thủ, người dùng không tự chọn được. */
export type InternalEmoteId = 'apologize' | 'startle' | 'hit' | 'down' | 'angry_stance';

/** Năm emote xã hội có mục tiêu (TASK 15). Cũng là nội bộ: phát qua module social, không có phím riêng. */
export type SocialEmoteId = 'wave_at' | 'handshake' | 'high_five' | 'bow' | 'point_at';

export type EmoteId = UserEmoteId | InternalEmoteId | SocialEmoteId;

/**
 * Tư thế một thời điểm. Cùng quy ước và cùng tên trường với AvatarPose trong
 * src/avatar/animation.ts nên có thể truyền thẳng vào applyPose của FallbackAvatar.
 * Góc tính bằng radian. Tay nghỉ hướng xuống: xoay X âm là đưa ra trước,
 * xoay Z dương là giơ sang trái, Z âm là giơ sang phải.
 */
export interface Pose {
  rootY: number;
  rootRotY: number;
  headRotZ: number;
  armLX: number;
  armLZ: number;
  armRX: number;
  armRZ: number;
  legLX: number;
  legRX: number;
}

export type PoseKey = keyof Pose;

export type EaseName = 'sine' | 'smooth' | 'out' | 'linear';

/** Một mốc tư thế. Trường vắng mặt coi như 0 (tư thế nghỉ). */
export interface Keyframe {
  /** Thời gian (giây) để chuyển từ mốc trước tới mốc này. */
  dur: number;
  pose: Partial<Pose>;
  /** Easing của đoạn dẫn tới mốc này. Mặc định 'sine'. */
  ease?: EaseName;
}

/** loop: lặp tới khi hủy. once: chạy một lần rồi về nghỉ. hold: giữ mốc cuối tới khi hủy. */
export type EmoteMode = 'loop' | 'once' | 'hold';

export interface EmoteDef {
  id: EmoteId;
  /** Nhãn tiếng Việt. */
  label: string;
  /** Phím tắt '1'..'6'. Chuỗi rỗng với emote nội bộ. */
  hotkey: string;
  /** true: emote nội bộ, không hiện trong bảng, không gắn phím, playEmote từ chối. */
  internal?: boolean;
  mode: EmoteMode;
  frames: readonly Keyframe[];
  /** Chỉ số mốc dùng làm tư thế tĩnh khi người dùng bật giảm chuyển động. */
  reducedFrame: number;
}

export type EmotePhase = 'idle' | 'playing';

export interface EmoteState {
  phase: EmotePhase;
  id: EmoteId | null;
  mode: EmoteMode | null;
  /** performance.now() lúc bắt đầu, 0 khi không phát. */
  startedAt: number;
}
