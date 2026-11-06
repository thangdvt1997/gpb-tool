/**
 * Phản ứng của NPC và động vật khi bị va hoặc bị đấm (MOVEMENT_EMOTES mục 3).
 * Kiểu NpcKind không có 'human' nên không thể dùng để tác động lên người thật.
 */

export type NpcKind = 'npc' | 'animal';
export type NpcCause = 'bump' | 'punch';
export type NpcEmote = 'hit' | 'startle' | 'angry_stance';

const REACTION_MS = 1200;
/** Tác động liên tiếp trong khoảng này thì bỏ qua, tránh nháy. */
const MIN_GAP_MS = 400;

interface Slot {
  emote: NpcEmote;
  until: number;
  startedAt: number;
}

export interface NpcReactionState {
  slots: Map<string, Slot>;
  punches: Map<string, number>;
}

export function createNpcReactionState(): NpcReactionState {
  return { slots: new Map<string, Slot>(), punches: new Map<string, number>() };
}

/**
 * Chọn phản ứng. Va thì startle. Bị đấm: động vật từ cú thứ hai trở đi thì angry_stance,
 * còn lại hit. Không dùng ngẫu nhiên nên lặp lại được.
 */
export function pickNpcEmote(kind: NpcKind, cause: NpcCause, punchCount: number): NpcEmote {
  if (cause === 'bump') return 'startle';
  if (kind === 'animal' && punchCount >= 2) return 'angry_stance';
  return 'hit';
}

/** Ghi nhận một tác động. Trả phản ứng mới, hoặc null nếu bị bỏ qua. */
export function triggerNpcReaction(
  state: NpcReactionState,
  npcId: string,
  kind: NpcKind,
  cause: NpcCause,
  nowMs: number,
): NpcEmote | null {
  const cur = state.slots.get(npcId);
  if (cur !== undefined && nowMs - cur.startedAt < MIN_GAP_MS) return null;
  let count = state.punches.get(npcId) ?? 0;
  if (cause === 'punch') {
    count += 1;
    state.punches.set(npcId, count);
  }
  const emote = pickNpcEmote(kind, cause, count);
  state.slots.set(npcId, { emote, until: nowMs + REACTION_MS, startedAt: nowMs });
  return emote;
}

/** Phản ứng đang hiện của NPC, hoặc null nếu đã hết. Gọi được trong useFrame. */
export function getNpcReaction(state: NpcReactionState, npcId: string, nowMs: number): NpcEmote | null {
  const s = state.slots.get(npcId);
  if (s === undefined) return null;
  if (nowMs >= s.until) {
    state.slots.delete(npcId);
    return null;
  }
  return s.emote;
}
