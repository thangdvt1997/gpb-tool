/**
 * Bus sự kiện đơn giản của tương tác vật. Hệ âm thanh (và hệ đèn) nghe sau, không phụ thuộc ngược vào vật.
 * Sự kiện chỉ là dữ liệu thuần: type + id vật + vị trí (để âm thanh theo khoảng cách) + dữ liệu thêm.
 */
export type InteractEventType =
  | 'door.open' | 'door.close' | 'door.locked' | 'door.lock' | 'door.unlock' | 'door.blocked'
  | 'chair.sit' | 'chair.stand' | 'chair.swivel' | 'chair.denied'
  | 'computer.on' | 'computer.off' | 'computer.login' | 'computer.logout'
  | 'drawer.open' | 'drawer.close' | 'drawer.locked'
  | 'light.switch'
  | 'tv.on' | 'tv.off' | 'tv.channel' | 'tv.volume'
  | 'curtain.move'
  | 'item.pickup' | 'item.place' | 'item.return' | 'item.denied'
  | 'printer.queue' | 'printer.start' | 'printer.done' | 'printer.jam' | 'printer.clear'
  | 'water.cup' | 'water.pour' | 'water.done' | 'water.denied';

export interface InteractEvent {
  type: InteractEventType;
  id: string;
  /** Vị trí phát âm (m, toạ độ thế giới). Bỏ trống nếu không biết. */
  x?: number;
  z?: number;
  data?: Readonly<Record<string, string | number | boolean>>;
}

type Listener = (e: InteractEvent) => void;
const listeners = new Set<Listener>();

export function emitInteractEvent(e: InteractEvent): void {
  // Sao chép để listener tự hủy trong lúc phát không làm hỏng vòng lặp.
  [...listeners].forEach((l) => l(e));
}

/** Nghe mọi sự kiện. Trả hàm hủy. */
export function onInteractEvent(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Nghe một số loại sự kiện (khớp chính xác hoặc tiền tố như 'door.'). */
export function onInteractEventType(types: readonly string[], cb: Listener): () => void {
  return onInteractEvent((e) => {
    if (types.some((t) => (t.endsWith('.') ? e.type.startsWith(t) : e.type === t))) cb(e);
  });
}

export function clearInteractListeners(): void {
  listeners.clear();
}
