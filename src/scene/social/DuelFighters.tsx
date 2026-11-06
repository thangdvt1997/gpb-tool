import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { cancelEmote, getEmoteState, playInternalEmote } from '../../emotes/player';
import { isEmoteId } from '../../emotes/library';
import type { Duel } from '../../duel/types';
import {
  computeFighterVisual,
  createFighterVisual,
  hitKey,
  hitTargetId,
  type FighterVisual,
  type Vec2,
} from './duelVisuals';

export interface DuelFightersProps {
  /** Dữ liệu duel do cha truyền vào. Component này không tự lấy và không gọi API. */
  duel: Duel | null;
  myId: string;
  /** Vị trí XZ theo id người dùng. Cha cập nhật tại chỗ, không tạo đối tượng mới mỗi khung hình. */
  positions: Readonly<Record<string, Vec2>>;
}

/** Thời gian chờ trước khi trở lại tư thế duy trì sau một cú hit (ms). */
const HIT_RESTORE_MS = 900;

/**
 * playEmote là bộ phát duy nhất của nhân vật mình, nên hiệu ứng qua nó chỉ áp lên mình.
 * Tư thế của đối thủ nằm ở getFoeVisual() và getFoeHitAt() để avatar đối thủ đọc.
 * Emote chỉ phát nếu thư viện có id đó (isEmoteId); chưa có thì bỏ qua êm.
 */
const foeVisual: FighterVisual = createFighterVisual();
const myVisual: FighterVisual = createFighterVisual();
let foeHitKey: string | null = null;
let foeHitAt = 0;

/** Tư thế hiện tại của đối thủ (đối tượng dùng chung, chỉ đọc). */
export function getFoeVisual(): Readonly<FighterVisual> {
  return foeVisual;
}

/** Tư thế hiện tại của mình (đối tượng dùng chung, chỉ đọc). locked = đang nằm đỡ. */
export function getMyVisual(): Readonly<FighterVisual> {
  return myVisual;
}

/** performance.now() lúc đối thủ bị trúng đòn gần nhất, 0 nếu chưa. */
export function getFoeHitAt(): number {
  return foeHitAt;
}

export function DuelFighters({ duel, myId, positions }: DuelFightersProps) {
  const mine = useRef<FighterVisual>(myVisual);
  const lastHold = useRef<string | null>(null);
  const lastKey = useRef<string | null>(null);
  const restoreAt = useRef(0);
  const seeded = useRef(false);

  // Gỡ component giữa trận thì nhả khóa, để người chơi không kẹt ở trạng thái nằm đỡ.
  useEffect(
    () => () => {
      myVisual.hold = null;
      myVisual.locked = false;
      foeVisual.hold = null;
      foeVisual.locked = false;
    },
    [],
  );

  useFrame(() => {
    const now = performance.now();
    const wall = Date.now();
    const foeId = duel === null ? null : duel.inviterId === myId ? duel.inviteeId : duel.inviterId;
    const me = positions[myId];
    const foe = foeId === null ? undefined : positions[foeId];

    computeFighterVisual(duel, myId, me, foe, wall, mine.current);
    if (foeId === null) {
      foeVisual.hold = null;
      foeVisual.locked = false;
    } else {
      computeFighterVisual(duel, foeId, foe, me, wall, foeVisual);
    }

    const key = hitKey(duel);
    if (!seeded.current) {
      // Đòn có sẵn lúc gắn component (vào lại trận) không phát lại.
      seeded.current = true;
      lastKey.current = key;
      foeHitKey = key;
    }

    const hold = mine.current.hold;
    if (hold !== lastHold.current) {
      lastHold.current = hold;
      restoreAt.current = 0;
      if (hold === null) {
        if (getEmoteState().phase === 'playing') cancelEmote();
      } else if (isEmoteId(hold)) {
        playInternalEmote(hold, now);
      }
    }

    if (key !== lastKey.current) {
      lastKey.current = key;
      if (duel !== null && hitTargetId(duel) === myId && isEmoteId('hit')) {
        playInternalEmote('hit', now);
        restoreAt.current = now + HIT_RESTORE_MS;
      }
    }
    if (key !== foeHitKey) {
      foeHitKey = key;
      if (duel !== null && foeId !== null && hitTargetId(duel) === foeId) foeHitAt = now;
    }

    // Sau hit, trở lại tư thế duy trì (stance, down...) nếu trận vẫn còn.
    if (restoreAt.current !== 0 && now >= restoreAt.current) {
      restoreAt.current = 0;
      if (hold !== null && isEmoteId(hold)) playInternalEmote(hold, now);
    }
  });

  return null;
}
