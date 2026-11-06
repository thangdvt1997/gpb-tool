/** Registry các phần dữ liệu sao lưu. Phần mở rộng (xăm, ghi chú...) đăng ký tại đây. */
import type { BackupSection } from './types';

const ID_RE = /^[a-z][a-z0-9_-]{0,31}$/;

export interface BackupRegistry {
  register(section: BackupSection): void;
  unregister(id: string): void;
  get(id: string): BackupSection | undefined;
  list(): BackupSection[];
  ids(): string[];
}

export function createRegistry(initial: readonly BackupSection[] = []): BackupRegistry {
  const map = new Map<string, BackupSection>();
  const reg: BackupRegistry = {
    register(section) {
      if (!ID_RE.test(section.id)) throw new Error(`id phần không hợp lệ: ${section.id}`);
      if (map.has(section.id)) throw new Error(`Phần đã đăng ký: ${section.id}`);
      if (!Number.isInteger(section.version) || section.version < 0) throw new Error(`version không hợp lệ: ${section.id}`);
      // Chuỗi migrate phải liên tục: có bước cho mọi n từ 0 (hoặc bước thấp nhất) tới version-1.
      const steps = Object.keys(section.migrations).map(Number);
      for (const n of steps) {
        if (!Number.isInteger(n) || n < 0 || n >= section.version) throw new Error(`bước migrate ${n} ngoài khoảng của ${section.id}`);
      }
      map.set(section.id, section);
    },
    unregister(id) {
      map.delete(id);
    },
    get: (id) => map.get(id),
    list: () => [...map.values()],
    ids: () => [...map.keys()],
  };
  for (const s of initial) reg.register(s);
  return reg;
}
