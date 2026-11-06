/**
 * Logic focus thuần (không đụng DOM) để test được trong Node.
 */

/** Vị trí focus kế tiếp trong vòng Tab. current = -1 nghĩa là focus đang nằm ngoài danh sách. */
export function nextFocusIndex(length: number, current: number, backwards: boolean): number {
  if (length <= 0) return -1;
  if (current < 0 || current >= length) return backwards ? length - 1 : 0;
  if (backwards) return current === 0 ? length - 1 : current - 1;
  return current === length - 1 ? 0 : current + 1;
}

export interface TabItem {
  id: string;
  /** Giá trị tabindex; undefined = không đặt (theo thứ tự DOM). */
  tabIndex?: number;
  /** Thứ tự xuất hiện trong DOM. */
  domIndex: number;
  disabled?: boolean;
  hidden?: boolean;
}

/**
 * Thứ tự Tab theo quy tắc HTML: tabindex dương tăng dần trước, rồi tabindex 0/không đặt theo DOM.
 * tabindex âm, disabled, hidden bị loại.
 */
export function tabOrder(items: readonly TabItem[]): TabItem[] {
  const ok = items.filter(
    (i) => !i.disabled && !i.hidden && (i.tabIndex === undefined || i.tabIndex >= 0),
  );
  const positive = ok
    .filter((i) => (i.tabIndex ?? 0) > 0)
    .sort((a, b) => (a.tabIndex as number) - (b.tabIndex as number) || a.domIndex - b.domIndex);
  const natural = ok.filter((i) => (i.tabIndex ?? 0) === 0).sort((a, b) => a.domIndex - b.domIndex);
  return [...positive, ...natural];
}

/** Mục tiêu focus khi mở lớp: phần tử ưu tiên nếu còn dùng được, không thì phần tử đầu, không thì chính lớp. */
export function initialFocusTarget(
  orderedIds: readonly string[],
  preferredId?: string,
): { kind: 'item'; id: string } | { kind: 'container' } {
  if (preferredId && orderedIds.includes(preferredId)) return { kind: 'item', id: preferredId };
  if (orderedIds.length > 0) return { kind: 'item', id: orderedIds[0] };
  return { kind: 'container' };
}

export interface FocusLayer<T = unknown> {
  id: string;
  /** Phần tử đã có focus lúc mở lớp, để trả lại khi đóng. */
  opener: T | null;
}

/** Ngăn xếp lớp focus (modal/panel lồng nhau). Chỉ lớp trên cùng nhận Tab và Esc. */
export interface FocusStack<T = unknown> {
  push(id: string, opener: T | null): void;
  /**
   * Gỡ lớp theo id. restoreTo chỉ có giá trị khi lớp đó đang ở trên cùng
   * (đóng lớp dưới thì không được cướp focus của lớp trên).
   */
  remove(id: string): { restoreTo: T | null; wasTop: boolean } | null;
  top(): FocusLayer<T> | null;
  isTop(id: string): boolean;
  size(): number;
}

export function createFocusStack<T = unknown>(): FocusStack<T> {
  const layers: FocusLayer<T>[] = [];
  return {
    push(id, opener) {
      const i = layers.findIndex((l) => l.id === id);
      if (i >= 0) layers.splice(i, 1);
      layers.push({ id, opener });
    },
    remove(id) {
      const i = layers.findIndex((l) => l.id === id);
      if (i < 0) return null;
      const wasTop = i === layers.length - 1;
      const [layer] = layers.splice(i, 1);
      return { restoreTo: wasTop ? layer.opener : null, wasTop };
    },
    top: () => (layers.length ? layers[layers.length - 1] : null),
    isTop: (id) => layers.length > 0 && layers[layers.length - 1].id === id,
    size: () => layers.length,
  };
}

/** Esc đóng lớp trên cùng, trừ khi đang soạn IME hoặc lớp bị khóa (đang lưu). */
export function shouldCloseOnKey(
  key: string,
  opts: { isTop: boolean; composing?: boolean; locked?: boolean },
): boolean {
  return key === 'Escape' && opts.isTop && !opts.composing && !opts.locked;
}
