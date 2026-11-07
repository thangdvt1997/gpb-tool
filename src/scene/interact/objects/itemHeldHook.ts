import { useSyncExternalStore } from 'react';
import { subscribeObjectStates } from '../objectStates';

/** Đọc một giá trị suy từ trạng thái vật, render lại khi trạng thái vật đổi. */
export function useObjectStateVersion<T>(read: () => T): T {
  return useSyncExternalStore(subscribeObjectStates, read, read);
}
