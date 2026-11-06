import { useCallback, useSyncExternalStore } from 'react';
import type { Settings } from './schema';
import { getSettings, resetSettings, subscribeSettings, updateSettings } from './store';

/** Đọc cài đặt hiện tại và nhận hàm cập nhật. Snapshot chỉ đổi khi giá trị đổi. */
export function useSettings(): {
  settings: Settings;
  update: typeof updateSettings;
  reset: typeof resetSettings;
} {
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  return { settings, update: updateSettings, reset: resetSettings };
}

/** Đọc một phần cài đặt bằng selector; nên trả giá trị nguyên thủy để tránh render thừa. */
export function useSetting<T>(select: (s: Settings) => T): T {
  const get = useCallback(() => select(getSettings()), [select]);
  return useSyncExternalStore(subscribeSettings, get, get);
}
