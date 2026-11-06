// Cửa thang Tây mở kèm chuông khi có đồng nghiệp ghi danh vào tầng.
// Không có kênh presence, nên đọc số người ghi danh hôm nay (GET /api/it/checkins/today, không có tên)
// mỗi POLL_MS. Số tăng so với lần trước thì rung chuông thang Tây. Lần đọc đầu chỉ lấy mốc.
// Chỉ đọc khi tab đang hiện. Lượt ghi danh của chính người dùng được bỏ qua bằng rebase().

import { useCallback, useEffect, useRef } from 'react';
import { getTodayBoard } from '../../checkin/api';
import { ringWestLift } from './rig';

const POLL_MS = 45_000;

export function useArrivalChime(enabled: boolean): { rebase: () => void } {
  const last = useRef<number | null>(null);
  const skipNext = useRef(false);

  const read = useCallback(async () => {
    const r = await getTodayBoard(false);
    if (!r.ok) return;
    const n = r.data.count;
    const prev = last.current;
    last.current = n;
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    if (prev !== null && n > prev) ringWestLift();
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    void read();
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void read();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, read]);

  /** Gọi sau khi chính người dùng ghi danh: lần đọc tới chỉ cập nhật mốc, không rung chuông. */
  const rebase = useCallback(() => {
    skipNext.current = true;
  }, []);

  return { rebase };
}
