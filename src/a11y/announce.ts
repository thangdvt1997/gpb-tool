/**
 * Kho thông báo aria-live dùng chung. Chỉ cho sự kiện quan trọng (lưu, lỗi, kết quả tương tác);
 * KHÔNG dùng cho dữ liệu mỗi frame: có chống trùng và giới hạn tần suất.
 */

export type Politeness = 'polite' | 'assertive';

export interface Announcement {
  id: number;
  message: string;
  politeness: Politeness;
}

export interface AnnouncerOptions {
  /** Cùng nội dung trong khoảng này (ms) bị bỏ. Mặc định 1500. */
  dedupeMs?: number;
  /** Tối thiểu giữa hai thông báo polite (ms). Mặc định 300; assertive không bị giới hạn. */
  minGapMs?: number;
  now?: () => number;
}

export interface Announcer {
  announce(message: string, politeness?: Politeness): boolean;
  subscribe(fn: (a: Announcement) => void): () => void;
  last(): Announcement | null;
}

export function createAnnouncer(options: AnnouncerOptions = {}): Announcer {
  const dedupeMs = options.dedupeMs ?? 1500;
  const minGapMs = options.minGapMs ?? 300;
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<(a: Announcement) => void>();
  const recent = new Map<string, number>();
  let seq = 0;
  let lastPolite = -Infinity;
  let latest: Announcement | null = null;
  return {
    announce(message, politeness = 'polite') {
      const text = message.trim();
      if (!text) return false;
      const t = now();
      const seen = recent.get(text);
      if (seen !== undefined && t - seen < dedupeMs) return false;
      if (politeness === 'polite' && t - lastPolite < minGapMs) return false;
      recent.set(text, t);
      if (recent.size > 50) {
        for (const [k, v] of recent) if (t - v >= dedupeMs) recent.delete(k);
      }
      if (politeness === 'polite') lastPolite = t;
      const a: Announcement = { id: ++seq, message: text, politeness };
      latest = a;
      listeners.forEach((fn) => fn(a));
      return true;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    last: () => latest,
  };
}

/** Bộ thông báo dùng chung toàn ứng dụng. */
export const announcer = createAnnouncer();
export const announce = (message: string, politeness?: Politeness) =>
  announcer.announce(message, politeness);
