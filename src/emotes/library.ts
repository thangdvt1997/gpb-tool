import type { EmoteDef, EmoteId, InternalEmoteId, Keyframe, UserEmoteId } from './types';

/** Thời gian (giây) chuyển từ tư thế nghỉ vào mốc đầu và từ mốc cuối về nghỉ. */
export const LEAD_IN = 0.3;
export const LEAD_OUT = 0.4;

/** Nhịp nhảy 1: đưa tay lên cao luân phiên, nảy người. */
const DANCE_1: readonly Keyframe[] = [
  { dur: 0.4, pose: { rootY: 0.05, rootRotY: 0.25, headRotZ: 0.12, armLZ: 2.5, armRZ: -0.6, legLX: 0.2, legRX: -0.2 } },
  { dur: 0.4, pose: { rootY: 0.0, rootRotY: 0.0, headRotZ: 0.0, armLZ: 1.2, armRZ: -1.2 } },
  { dur: 0.4, pose: { rootY: 0.05, rootRotY: -0.25, headRotZ: -0.12, armLZ: 0.6, armRZ: -2.5, legLX: -0.2, legRX: 0.2 } },
  { dur: 0.4, pose: { rootY: 0.0, rootRotY: 0.0, headRotZ: 0.0, armLZ: 1.2, armRZ: -1.2 } },
];

/** Nhịp nhảy 2: lắc hông, vung tay ra trước sau. */
const DANCE_2: readonly Keyframe[] = [
  { dur: 0.3, pose: { rootY: 0.04, rootRotY: 0.45, headRotZ: -0.1, armLX: -0.9, armRX: 0.9, armLZ: 0.3, armRZ: -0.3, legLX: 0.25, legRX: -0.1 } },
  { dur: 0.3, pose: { rootY: 0.0, rootRotY: 0.0, armLX: 0.0, armRX: 0.0, armLZ: 0.5, armRZ: -0.5 } },
  { dur: 0.3, pose: { rootY: 0.04, rootRotY: -0.45, headRotZ: 0.1, armLX: 0.9, armRX: -0.9, armLZ: 0.3, armRZ: -0.3, legLX: -0.1, legRX: 0.25 } },
  { dur: 0.3, pose: { rootY: 0.0, rootRotY: 0.0, armLX: 0.0, armRX: 0.0, armLZ: 0.5, armRZ: -0.5 } },
];

/** Múa võ: chuỗi tư thế đứng tấn, đỡ, chém, thu thế. */
const KATA: readonly Keyframe[] = [
  { dur: 0.6, pose: { armLX: -0.3, armRX: -0.3, armLZ: 0.6, armRZ: -0.6, legLX: -0.35, legRX: 0.35 }, ease: 'smooth' },
  { dur: 0.5, pose: { rootRotY: 0.5, armLX: -1.5, armRX: -0.2, armLZ: 0.2, armRZ: -1.4, legLX: -0.4, legRX: 0.2 } },
  { dur: 0.5, pose: { rootRotY: -0.5, armLX: -0.2, armRX: -1.5, armLZ: 1.4, armRZ: -0.2, legLX: 0.2, legRX: -0.4 } },
  { dur: 0.7, pose: { rootY: 0.03, rootRotY: 0.0, headRotZ: 0.08, armLZ: 2.6, armRZ: -2.6, legLX: 0.0, legRX: 0.0 }, ease: 'smooth' },
  { dur: 0.5, pose: { rootRotY: 0.7, armLX: -1.6, armRX: -1.6, armLZ: 0.1, armRZ: -0.1, legLX: -0.5, legRX: 0.3 }, ease: 'out' },
  { dur: 0.8, pose: { rootRotY: 0.0, armLX: -0.2, armRX: -0.2, armLZ: 0.5, armRZ: -0.5, legLX: 0.0, legRX: 0.0 }, ease: 'smooth' },
];

/** Tập quyền: đấm luân phiên vào không khí, không có đích. */
const PUNCH_COMBO: readonly Keyframe[] = [
  { dur: 0.35, pose: { armLX: -1.0, armRX: -1.0, armLZ: 0.35, armRZ: -0.35, legLX: -0.2, legRX: 0.2 } },
  { dur: 0.14, pose: { rootRotY: -0.3, armLX: -1.55, armRX: -0.9, armLZ: 0.1, armRZ: -0.4, legLX: -0.2, legRX: 0.2 }, ease: 'out' },
  { dur: 0.2, pose: { rootRotY: 0.0, armLX: -1.0, armRX: -1.0, armLZ: 0.35, armRZ: -0.35, legLX: -0.2, legRX: 0.2 } },
  { dur: 0.14, pose: { rootRotY: 0.3, armLX: -0.9, armRX: -1.55, armLZ: 0.4, armRZ: -0.1, legLX: -0.2, legRX: 0.2 }, ease: 'out' },
  { dur: 0.2, pose: { rootRotY: 0.0, armLX: -1.0, armRX: -1.0, armLZ: 0.35, armRZ: -0.35, legLX: -0.2, legRX: 0.2 } },
  { dur: 0.14, pose: { rootRotY: -0.35, armLX: -1.55, armRX: -0.9, armLZ: 0.1, armRZ: -0.4, legLX: -0.2, legRX: 0.2 }, ease: 'out' },
  { dur: 0.14, pose: { rootRotY: 0.35, armLX: -0.9, armRX: -1.55, armLZ: 0.4, armRZ: -0.1, legLX: -0.2, legRX: 0.2 }, ease: 'out' },
  { dur: 0.35, pose: { rootRotY: 0.0, armLX: -1.0, armRX: -1.0, armLZ: 0.35, armRZ: -0.35, legLX: -0.2, legRX: 0.2 }, ease: 'smooth' },
];

/** Tấn: đứng thủ thế, giữ mốc cuối đến khi hủy. */
const STANCE: readonly Keyframe[] = [
  { dur: 0.5, pose: { rootY: -0.03, rootRotY: 0.35, armLX: -1.1, armRX: -1.1, armLZ: 0.35, armRZ: -0.35, legLX: -0.3, legRX: 0.3 }, ease: 'smooth' },
];

/** Vẫy tay: giơ tay phải, vẫy qua lại ba nhịp. */
const WAVE: readonly Keyframe[] = [
  { dur: 0.5, pose: { headRotZ: 0.05, armRZ: -2.6 }, ease: 'smooth' },
  { dur: 0.25, pose: { headRotZ: 0.08, armRZ: -2.95 } },
  { dur: 0.25, pose: { headRotZ: 0.02, armRZ: -2.3 } },
  { dur: 0.25, pose: { headRotZ: 0.08, armRZ: -2.95 } },
  { dur: 0.25, pose: { headRotZ: 0.02, armRZ: -2.3 } },
  { dur: 0.25, pose: { headRotZ: 0.05, armRZ: -2.6 } },
];

/** Xin lỗi (nội bộ): cúi nhẹ, giơ hai tay trước ngực, một lần. */
const APOLOGIZE: readonly Keyframe[] = [
  { dur: 0.35, pose: { rootY: -0.05, headRotZ: 0.15, armLX: -1.2, armRX: -1.2, armLZ: 0.3, armRZ: -0.3, legLX: -0.05, legRX: 0.05 }, ease: 'smooth' },
  { dur: 0.3, pose: { rootY: -0.06, headRotZ: 0.18, armLX: -1.3, armRX: -1.3, armLZ: 0.4, armRZ: -0.4, legLX: -0.05, legRX: 0.05 } },
  { dur: 0.3, pose: { rootY: -0.05, headRotZ: 0.15, armLX: -1.2, armRX: -1.2, armLZ: 0.3, armRZ: -0.3, legLX: -0.05, legRX: 0.05 } },
];

/** Giật mình (nội bộ): giật người lên, quay đầu về phía va chạm, rồi thả lỏng. Một lần. */
const STARTLE: readonly Keyframe[] = [
  { dur: 0.1, pose: { rootY: 0.05, rootRotY: 0.5, headRotZ: 0.2, armLX: -0.3, armRX: -0.3, armLZ: 0.5, armRZ: -0.5, legLX: 0.1, legRX: -0.1 }, ease: 'out' },
  { dur: 0.45, pose: { rootY: 0.0, rootRotY: 0.45, headRotZ: 0.15, armLX: -0.15, armRX: -0.15, armLZ: 0.35, armRZ: -0.35 }, ease: 'smooth' },
  { dur: 0.4, pose: { rootRotY: 0.2, headRotZ: 0.05, armLZ: 0.1, armRZ: -0.1 }, ease: 'smooth' },
];

/** Dính đòn (nội bộ): ngả người ra sau, tay vung ngược, loạng choạng rồi đứng lại. Một lần. */
const HIT: readonly Keyframe[] = [
  { dur: 0.12, pose: { rootY: -0.05, rootRotY: -0.3, headRotZ: -0.25, armLX: 0.5, armRX: 0.5, armLZ: 0.6, armRZ: -0.6, legLX: 0.25, legRX: -0.15 }, ease: 'out' },
  { dur: 0.4, pose: { rootY: -0.03, rootRotY: -0.2, headRotZ: -0.15, armLX: 0.25, armRX: 0.25, armLZ: 0.4, armRZ: -0.4, legLX: 0.15, legRX: -0.1 }, ease: 'smooth' },
  { dur: 0.4, pose: { rootY: -0.01, rootRotY: -0.08, headRotZ: -0.05, armLZ: 0.15, armRZ: -0.15 }, ease: 'smooth' },
];

/** Ngã xuống (nội bộ): ngồi bệt, chân duỗi trước, tay đặt gần thân, đầu cúi. Giữ đến khi hủy. */
const DOWN: readonly Keyframe[] = [
  { dur: 0.6, pose: { rootY: -0.4, headRotZ: 0.2, armLX: -0.3, armRX: -0.3, armLZ: 0.25, armRZ: -0.25, legLX: -1.3, legRX: -1.3 }, ease: 'smooth' },
];

/** Thủ thế giận dữ (nội bộ): đứng rộng, hai nắm đấm giơ cao, nghiêng đầu. Giữ đến khi hủy. */
const ANGRY_STANCE: readonly Keyframe[] = [
  { dur: 0.35, pose: { rootY: -0.05, rootRotY: 0.2, headRotZ: -0.1, armLX: -1.3, armRX: -1.3, armLZ: 0.5, armRZ: -0.5, legLX: -0.45, legRX: 0.45 }, ease: 'out' },
];

/** Vẫy chào người khác: giơ tay phải cao hơn, nghiêng đầu nhẹ, vẫy hai nhịp. Căn hướng do module social lo. */
const WAVE_AT: readonly Keyframe[] = [
  { dur: 0.4, pose: { headRotZ: 0.06, armRX: -0.3, armRZ: -2.7 }, ease: 'smooth' },
  { dur: 0.22, pose: { headRotZ: 0.1, armRX: -0.3, armRZ: -3.0 } },
  { dur: 0.22, pose: { headRotZ: 0.03, armRX: -0.3, armRZ: -2.4 } },
  { dur: 0.22, pose: { headRotZ: 0.1, armRX: -0.3, armRZ: -3.0 } },
  { dur: 0.3, pose: { headRotZ: 0.04, armRX: -0.3, armRZ: -2.6 }, ease: 'smooth' },
];

/** Bắt tay: đưa tay phải ra trước ngang eo, nhấp lên xuống hai lần. */
const HANDSHAKE: readonly Keyframe[] = [
  { dur: 0.45, pose: { rootY: -0.01, headRotZ: 0.04, armRX: -1.25, armRZ: -0.25 }, ease: 'smooth' },
  { dur: 0.18, pose: { armRX: -1.05, armRZ: -0.25 } },
  { dur: 0.18, pose: { armRX: -1.4, armRZ: -0.25 } },
  { dur: 0.18, pose: { armRX: -1.05, armRZ: -0.25 } },
  { dur: 0.18, pose: { armRX: -1.4, armRZ: -0.25 } },
  { dur: 0.3, pose: { armRX: -1.25, armRZ: -0.25 }, ease: 'smooth' },
];

/** Đập tay: giơ tay phải lên ngang đầu, chìa ra, đập một nhịp rồi thu về. */
const HIGH_FIVE: readonly Keyframe[] = [
  { dur: 0.35, pose: { headRotZ: 0.05, armRX: -0.5, armRZ: -2.3 }, ease: 'smooth' },
  { dur: 0.12, pose: { rootY: 0.02, headRotZ: 0.08, armRX: -0.9, armRZ: -2.5 }, ease: 'out' },
  { dur: 0.3, pose: { armRX: -0.5, armRZ: -2.3 }, ease: 'smooth' },
];

/** Cúi chào: gập người (hạ rootY, nghiêng đầu), hai tay áp trước thân, giữ ngắn rồi đứng thẳng. */
const BOW: readonly Keyframe[] = [
  { dur: 0.5, pose: { rootY: -0.07, headRotZ: 0.22, armLX: -0.5, armRX: -0.5, armLZ: 0.15, armRZ: -0.15, legLX: -0.05, legRX: 0.05 }, ease: 'smooth' },
  { dur: 0.5, pose: { rootY: -0.07, headRotZ: 0.22, armLX: -0.5, armRX: -0.5, armLZ: 0.15, armRZ: -0.15, legLX: -0.05, legRX: 0.05 } },
];

/** Chỉ tay: duỗi thẳng tay phải ra trước, giữ trong chốc lát. */
const POINT_AT: readonly Keyframe[] = [
  { dur: 0.35, pose: { headRotZ: 0.04, armRX: -1.55, armRZ: -0.1 }, ease: 'out' },
  { dur: 0.8, pose: { headRotZ: 0.04, armRX: -1.55, armRZ: -0.1 } },
  { dur: 0.1, pose: { headRotZ: 0.04, armRX: -1.5, armRZ: -0.1 } },
];

/** Thư viện mười sáu emote. Dữ liệu tĩnh, dùng chung, không đổi lúc chạy. */
export const EMOTES: Readonly<Record<EmoteId, EmoteDef>> = {
  dance_1: { id: 'dance_1', label: 'Nhảy 1', hotkey: '1', mode: 'loop', frames: DANCE_1, reducedFrame: 0 },
  dance_2: { id: 'dance_2', label: 'Nhảy 2', hotkey: '2', mode: 'loop', frames: DANCE_2, reducedFrame: 0 },
  kata: { id: 'kata', label: 'Múa võ', hotkey: '3', mode: 'once', frames: KATA, reducedFrame: 3 },
  punch_combo: { id: 'punch_combo', label: 'Tập quyền', hotkey: '4', mode: 'once', frames: PUNCH_COMBO, reducedFrame: 1 },
  stance: { id: 'stance', label: 'Tấn', hotkey: '5', mode: 'hold', frames: STANCE, reducedFrame: 0 },
  wave: { id: 'wave', label: 'Vẫy tay', hotkey: '6', mode: 'once', frames: WAVE, reducedFrame: 0 },
  apologize: { id: 'apologize', label: 'Xin lỗi', hotkey: '', internal: true, mode: 'once', frames: APOLOGIZE, reducedFrame: 0 },
  startle: { id: 'startle', label: 'Giật mình', hotkey: '', internal: true, mode: 'once', frames: STARTLE, reducedFrame: 0 },
  hit: { id: 'hit', label: 'Dính đòn', hotkey: '', internal: true, mode: 'once', frames: HIT, reducedFrame: 0 },
  down: { id: 'down', label: 'Ngã xuống', hotkey: '', internal: true, mode: 'hold', frames: DOWN, reducedFrame: 0 },
  angry_stance: { id: 'angry_stance', label: 'Thủ thế giận', hotkey: '', internal: true, mode: 'hold', frames: ANGRY_STANCE, reducedFrame: 0 },
  wave_at: { id: 'wave_at', label: 'Vẫy chào', hotkey: '', internal: true, mode: 'once', frames: WAVE_AT, reducedFrame: 0 },
  handshake: { id: 'handshake', label: 'Bắt tay', hotkey: '', internal: true, mode: 'once', frames: HANDSHAKE, reducedFrame: 0 },
  high_five: { id: 'high_five', label: 'Đập tay', hotkey: '', internal: true, mode: 'once', frames: HIGH_FIVE, reducedFrame: 0 },
  bow: { id: 'bow', label: 'Cúi chào', hotkey: '', internal: true, mode: 'once', frames: BOW, reducedFrame: 0 },
  point_at: { id: 'point_at', label: 'Chỉ tay', hotkey: '', internal: true, mode: 'once', frames: POINT_AT, reducedFrame: 0 },
};

/** Thứ tự hiển thị và thứ tự phím 1 đến 6. Chỉ gồm emote người dùng, không có emote nội bộ. */
export const EMOTE_ORDER: readonly UserEmoteId[] = ['dance_1', 'dance_2', 'kata', 'punch_combo', 'stance', 'wave'];

export function isEmoteId(value: string): value is EmoteId {
  return Object.prototype.hasOwnProperty.call(EMOTES, value);
}


/** Năm emote nội bộ. Scene phát qua playInternalEmote. */
export const INTERNAL_EMOTE_IDS: readonly InternalEmoteId[] = ['apologize', 'startle', 'hit', 'down', 'angry_stance'];

export function isInternalEmote(id: EmoteId): boolean {
  return EMOTES[id].internal === true;
}
