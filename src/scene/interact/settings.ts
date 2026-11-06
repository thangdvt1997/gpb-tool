import { useSyncExternalStore } from 'react';
import { getSettings, subscribeSettings, updateSettings } from '../../settings';

/**
 * Tùy chọn hiển thị của hệ tương tác. Dữ liệu nằm ở src/settings (gpb.settings.v2):
 * - highlight = highlightEnabled: viền sáng quanh vật đang chọn.
 * - keyHints = hintsEnabled: dòng hướng dẫn phím và ký hiệu "E —" trên gợi ý.
 * Khóa cũ gpb.interact.settings.v1 chỉ được kho trung tâm đọc để migrate.
 */
export interface InteractSettings {
  highlight: boolean;
  keyHints: boolean;
}

let snap: InteractSettings = { highlight: getSettings().highlightEnabled, keyHints: getSettings().hintsEnabled };

/** Snapshot ổn định: chỉ đổi tham chiếu khi giá trị đổi (cần cho useSyncExternalStore). */
export function getInteractSettings(): InteractSettings {
  const s = getSettings();
  if (snap.highlight !== s.highlightEnabled || snap.keyHints !== s.hintsEnabled) {
    snap = { highlight: s.highlightEnabled, keyHints: s.hintsEnabled };
  }
  return snap;
}

export function updateInteractSettings(patch: Partial<InteractSettings>): void {
  const s = getSettings();
  updateSettings({
    highlightEnabled: patch.highlight ?? s.highlightEnabled,
    hintsEnabled: patch.keyHints ?? s.hintsEnabled,
  });
}

export function subscribeInteractSettings(cb: () => void): () => void {
  return subscribeSettings(cb);
}

export function useInteractSettings(): InteractSettings {
  return useSyncExternalStore(subscribeInteractSettings, getInteractSettings, getInteractSettings);
}
