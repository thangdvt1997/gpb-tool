/**
 * Nối dịch vụ sao lưu vào các hệ thống thật của ứng dụng (settings store, PersistManager).
 * File này chạy trong trình duyệt; phần logic thuần nằm ở các file khác và có test.
 */
import type { PersistManager } from '../persist';
import { getSettings, updateSettings } from '../settings/store';
import { createRegistry } from './registry';
import { createBackupRing, createMemoryStorage, type KeyValueStorage } from './ring';
import { createLayoutDraftSection, createLookSection, createPersistSection, createSettingsSection, type LayoutDraftAdapter, type LookAdapter } from './sections';
import { createBackupService, type BackupService } from './service';
import type { BackupSection } from './types';

export interface DefaultBackupDeps extends LookAdapter {
  /** Có thì thêm phần persist (snapshot văn phòng + ảnh xăm nhúng). */
  persist?: PersistManager;
  /** Có thì thêm phần bố cục nháp. */
  layoutDraft?: LayoutDraftAdapter;
  /** Phần mở rộng khác (vd. xăm riêng). */
  extra?: readonly BackupSection[];
  /** Số bản giữ lại (mặc định 5). */
  max?: number;
  storage?: KeyValueStorage;
}

function pickStorage(): KeyValueStorage {
  try {
    const ls = window.localStorage;
    ls.setItem('gpb.backup.probe', '1');
    ls.removeItem('gpb.backup.probe');
    return ls;
  } catch {
    return createMemoryStorage(); // localStorage bị chặn: chỉ giữ trong phiên.
  }
}

export function createDefaultBackupService(deps: DefaultBackupDeps): BackupService {
  const registry = createRegistry();
  registry.register(createLookSection(deps));
  registry.register(
    createSettingsSection({
      getSettings,
      // updateSettings luôn sanitize; settings đầy đủ nên ghi đè các trường.
      setSettings: (s) => updateSettings({ mouse: s.mouse, bindings: s.bindings, volume: s.volume, hintsEnabled: s.hintsEnabled, highlightEnabled: s.highlightEnabled, controlMode: s.controlMode, touch: s.touch }),
    }),
  );
  const p = deps.persist;
  if (p) {
    registry.register(
      createPersistSection({
        async exportText() {
          const r = await p.exportSnapshot();
          return r.ok ? r.text : null;
        },
        async importText(text) {
          const r = await p.importSnapshot(text);
          if (!r.ok) throw new Error(r.error);
        },
      }),
    );
  }
  if (deps.layoutDraft) registry.register(createLayoutDraftSection(deps.layoutDraft));
  for (const s of deps.extra ?? []) registry.register(s);
  const ring = createBackupRing({ storage: deps.storage ?? pickStorage(), max: deps.max });
  return createBackupService({ registry, ring });
}
