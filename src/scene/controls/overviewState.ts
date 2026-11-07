import { useSyncExternalStore } from 'react';
import { cameraModes } from './gtaCamera';

/** true khi camera đang ở chế độ xem tổng thể (overview). Dùng để ẩn trần. Cập nhật theo cameraModes. */
export function useOverviewActive(): boolean {
  return useSyncExternalStore(
    (cb) => cameraModes.subscribe(cb),
    () => cameraModes.getMode() === 'overview',
    () => false,
  );
}

/** Trần chỉ hiện khi không ở chế độ xem tổng thể. Hàm thuần để test. */
export function ceilingVisible(mode: string): boolean {
  return mode !== 'overview';
}
