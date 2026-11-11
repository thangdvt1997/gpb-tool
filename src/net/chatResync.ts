// Bù tin chat phòng sau khi kết nối lại (TASK 25a, 27).
import type { Snapshot } from './protocol';

/** Snapshot thứ hai trở đi là kết nối lại; nếu server không phát lại được sự kiện bị lỡ thì phải tải lịch sử chat. */
export function needsChatHistory(snapshotIndex: number, resumed: Snapshot['resumed']): boolean {
  return snapshotIndex > 0 && !(resumed?.ok && !resumed.full);
}

/** Gộp lịch sử vào danh sách đang có: bỏ tin trùng id, xếp theo thời điểm (sort ổn định), giữ max tin cuối. */
export function mergeChatHistory<T extends { id: string; at: number }>(prev: T[], history: T[], max: number): T[] {
  const have = new Set(prev.map((c) => c.id));
  const older = history.filter((x) => !have.has(x.id));
  return [...older, ...prev].sort((a, b) => a.at - b.at).slice(-max);
}
