import { useEffect, useRef, useState } from 'react';
import { getActiveDuel, getMyId } from '../../duel/api';
import type { Duel } from '../../duel/types';
import { DuelFighters } from './DuelFighters';
import { hitKey } from './duelVisuals';
import type { SocialWorld } from './world';

const POLL_MS = 3000;
const MAX_BACKOFF_MS = 30_000;

/** Chữ ký những trường ảnh hưởng hiển thị. Giống nhau thì không setState, tránh render lại mỗi 3 giây. */
function signature(d: Duel | null): string {
  if (d === null) return '';
  return [d.id, d.status, d.mode, d.hpInviter, d.hpInvitee, d.downUserId ?? '', d.downUntil ?? '', hitKey(d) ?? ''].join('|');
}

/** id người đăng nhập: dùng prop nếu có, nếu không thì hỏi /api/auth/me đúng một lần. */
export function useSelfId(userId: string | undefined): string | null {
  const [fetched, setFetched] = useState<string | null>(null);
  useEffect(() => {
    if (userId !== undefined) return undefined;
    let alive = true;
    void getMyId().then((r) => {
      if (alive && r.ok) setFetched(r.data);
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  return userId ?? fetched;
}

/**
 * Hỏi trận đang diễn ra mỗi 3 giây khi tab hiển thị. Chuỗi setTimeout nên không bao giờ chồng request;
 * lỗi thì giãn dần (tối đa 30 giây). Tab ẩn thì dừng hẳn, hiện lại thì hỏi ngay.
 * enabled=false (cha đã truyền duel) thì không gửi request nào.
 */
function useActiveDuel(enabled: boolean): Duel | null {
  const [duel, setDuel] = useState<Duel | null>(null);
  const sig = useRef('');
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    let timer: number | null = null;
    let failures = 0;
    const clear = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    const tick = async () => {
      timer = null;
      const r = await getActiveDuel();
      if (!alive) return;
      if (r.ok) {
        failures = 0;
        const s = signature(r.data);
        if (s !== sig.current) {
          sig.current = s;
          setDuel(r.data);
        }
      } else {
        failures += 1;
      }
      if (document.visibilityState === 'visible') {
        timer = window.setTimeout(() => void tick(), Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS));
      }
    };
    const onVisibility = () => {
      clear();
      if (document.visibilityState === 'visible') void tick();
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      clear();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);
  return duel;
}

export interface DuelLayerProps {
  world: SocialWorld;
  myId: string | null;
  /**
   * Trận do cha truyền vào (ví dụ HUD đã poll sẵn). Có giá trị (kể cả null) thì layer này KHÔNG gọi API,
   * để cả trang chỉ có một luồng poll. Bỏ trống (undefined) thì tự poll.
   */
  duel?: Duel | null;
}

/** Gắn DuelFighters. State poll nằm ở đây nên ITOffice không render lại khi trận đổi. */
export function DuelLayer({ world, myId, duel }: DuelLayerProps) {
  const polled = useActiveDuel(myId !== null && duel === undefined);
  if (myId === null) return null;
  return <DuelFighters duel={duel === undefined ? polled : duel} myId={myId} positions={world.positions} />;
}
