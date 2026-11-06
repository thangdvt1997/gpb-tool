import {
  type Settings,
  type ImportResult,
  STORAGE_KEY_V2,
  LEGACY_CONTROLS_KEY,
  LEGACY_INTERACT_KEY,
  defaultSettings,
  migrate,
  migrateLegacy,
  sanitize,
  importJson,
  exportJson,
} from './schema';

/** Kho cài đặt dùng chung: đọc/ghi localStorage (bọc try/catch), thông báo cho người nghe khi đổi. */

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function load(): Settings {
  const v2 = readJson(STORAGE_KEY_V2);
  if (v2 !== null) return migrate(v2);
  const c = readJson(LEGACY_CONTROLS_KEY);
  const i = readJson(LEGACY_INTERACT_KEY);
  if (c !== null || i !== null) return migrateLegacy(c, i);
  return defaultSettings();
}

function save(s: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(s));
  } catch {
    /* bị chặn lưu trữ: chỉ giữ trong phiên */
  }
}

let snap: Settings = load();
const listeners = new Set<() => void>();

function commit(next: Settings): void {
  snap = next;
  save(snap);
  listeners.forEach((l) => l());
}

export function getSettings(): Settings {
  return snap;
}

export function subscribeSettings(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Cập nhật một phần; kết quả luôn qua kiểm tra và kẹp. Phím trùng bị đưa về mặc định,
 * nên giao diện cần gọi rebind() trước để báo lỗi rồi mới truyền bindings vào đây.
 */
export function updateSettings(patch: Partial<Omit<Settings, 'version'>>): void {
  commit(sanitize({ ...snap, ...patch }));
}

export function resetSettings(): void {
  commit(defaultSettings());
}

export function exportSettings(): string {
  return exportJson(snap);
}

export function importSettings(text: string): ImportResult {
  const r = importJson(text);
  if (r.ok) commit(r.settings);
  return r;
}
