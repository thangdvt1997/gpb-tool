import { useEffect, useState } from 'react';
import type { Role } from '../content/types';
import { getTodayBoard } from '../checkin/api';
import { CheckinBoard } from '../checkin/CheckinBoard';
import type { TodayBoard } from '../checkin/types';

/** Tải bảng ghi danh hôm nay. Chỉ role it và admin xin danh sách chi tiết. */
export function CheckinBoardBody({ role }: { role: Role }) {
  const detail = role === 'it' || role === 'admin';
  const [board, setBoard] = useState<TodayBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getTodayBoard(detail).then((r) => {
      if (!alive) return;
      if (r.ok) setBoard(r.data);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [detail]);

  if (error) return <p className="denied">Không tải được bảng ghi danh ({error}). Thử lại sau.</p>;
  return <CheckinBoard board={board} detail={detail} />;
}
