import { EMOTES } from '../library';
import { cancelEmote, getEmoteState, playEmote } from '../player';
import { QUICK_ACTIONS, canStart, shouldCancel } from './logic';
import type { CancelCause, QuickActionId, QuickContext, StartCheck } from './logic';
import { publishEmoteEvent } from './sync';

const cooldownUntil = new Map<QuickActionId, number>();
let active: QuickActionId | null = null;

/** Hành động nhanh đang chạy (null nếu rảnh hoặc emote đã tự kết thúc). */
export function getActiveQuick(): QuickActionId | null {
  if (active !== null && getEmoteState().id !== EMOTES[active].id) {
    publishEmoteEvent({ type: 'end', actionId: active, startTime: 0, parameters: {}, endCause: 'finished' });
    active = null;
  }
  return active;
}

export function startQuick(id: QuickActionId, ctx: QuickContext, nowMs: number = performance.now()): StartCheck {
  const action = QUICK_ACTIONS.find((a) => a.id === id);
  const check = canStart(action, ctx, nowMs, cooldownUntil.get(id) ?? 0);
  if (!check.ok || !action) return check;
  if (getActiveQuick() === id && EMOTES[action.emoteId].mode === 'hold') {
    cancelQuick('user');
    return { ok: true };
  }
  if (active !== null) cancelQuick('user');
  playEmote(action.emoteId, nowMs);
  active = id;
  cooldownUntil.set(id, nowMs + action.cooldownSec * 1000);
  publishEmoteEvent({ type: 'start', actionId: id, startTime: nowMs, parameters: {} });
  return { ok: true };
}

/** Báo sự kiện có thể hủy; chỉ hủy nếu chính sách của hành động đang chạy cho phép. */
export function notifyCause(cause: CancelCause): void {
  const id = getActiveQuick();
  const action = QUICK_ACTIONS.find((a) => a.id === id);
  if (action && shouldCancel(action, cause)) cancelQuick(cause);
}

export function cancelQuick(cause: CancelCause): void {
  if (active === null) return;
  const id = active;
  active = null;
  cancelEmote();
  publishEmoteEvent({ type: 'end', actionId: id, startTime: 0, parameters: {}, endCause: cause });
}
