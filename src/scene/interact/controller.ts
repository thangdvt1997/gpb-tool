import { useSyncExternalStore } from 'react';
import { actionLabel, availableActions, contextOf, type InteractableDef } from './registry';

/**
 * Bộ xử lý hành động và cầu nối giữa cảnh 3D (InteractionSystem, trong Canvas) với giao diện
 * (InteractionHud, ngoài Canvas).
 * - InteractionSystem gọi publishFocus mỗi khung hình. Snapshot chỉ đổi khi vật, nhãn, menu
 *   hoặc trạng thái chuột đổi, nên ghi mỗi khung không gây render.
 * - activateFocus: hành vi phím E (cũng dùng cho nút cảm ứng và bấm vào gợi ý): một hành động
 *   thì chạy ngay, nhiều hành động thì mở menu; E lần nữa khi menu đang mở thì đóng menu.
 */
export interface PromptAction {
  id: string;
  label: string;
}

export interface InteractionSnapshot {
  /** Vật đang được chọn. null = ẩn gợi ý. */
  focus: { id: string; label: string; kind: string } | null;
  /** Hành động đầu tiên thỏa điều kiện hiện tại (nhãn gợi ý). */
  primary: PromptAction | null;
  /** Số hành động thỏa điều kiện. Lớn hơn 1 thì E mở menu. */
  actionCount: number;
  /** Menu đang mở cho vật focus. null = đóng. */
  menu: readonly PromptAction[] | null;
  /** Chuột đang nằm trên đúng vật đó. */
  pointer: boolean;
}

const EMPTY: InteractionSnapshot = { focus: null, primary: null, actionCount: 0, menu: null, pointer: false };
let snap: InteractionSnapshot = EMPTY;
let snapKey = '';
let focusDef: InteractableDef | null = null;
let pointerOn = false;
let menuFor: string | null = null;
let blocked = false;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function subscribeInteraction(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getInteractionSnapshot(): InteractionSnapshot {
  return snap;
}

function resolveActions(def: InteractableDef): PromptAction[] {
  const ctx = contextOf(def);
  return availableActions(def, ctx).map((a) => ({ id: a.id, label: actionLabel(a, ctx) }));
}

function rebuild(): void {
  const def = focusDef;
  if (!def) {
    menuFor = null;
    if (snap !== EMPTY) {
      snap = EMPTY;
      snapKey = '';
      emit();
    }
    return;
  }
  const actions = resolveActions(def);
  if (menuFor !== null && (menuFor !== def.id || actions.length === 0)) menuFor = null;
  const menuOpen = menuFor === def.id;
  // Khóa so sánh: chỉ phát sự kiện khi nội dung hiển thị đổi.
  let key = `${def.id}\u0001${def.label}\u0001${def.kind}\u0001${pointerOn ? 1 : 0}\u0001${menuOpen ? 1 : 0}`;
  for (const a of actions) key += `\u0002${a.id}\u0003${a.label}`;
  if (key === snapKey) return;
  snapKey = key;
  snap = {
    focus: { id: def.id, label: def.label, kind: def.kind },
    primary: actions[0] ?? null,
    actionCount: actions.length,
    menu: menuOpen ? actions : null,
    pointer: pointerOn,
  };
  emit();
}

/** Mỗi khung: vật đang chọn (hoặc null) và chuột có đang trên vật đó không. */
export function publishFocus(def: InteractableDef | null, pointer: boolean): void {
  focusDef = def;
  pointerOn = def !== null && pointer;
  rebuild();
}

/** Tính lại gợi ý ngay (sau khi trạng thái vật đổi), không chờ khung sau. */
export function refreshFocus(): void {
  rebuild();
}

export function getFocusedId(): string | null {
  return focusDef?.id ?? null;
}

/** Mất focus trình duyệt, đang gõ, tạm dừng: chặn mọi kích hoạt và đóng menu. */
export function setInteractBlocked(b: boolean): void {
  if (blocked === b) return;
  blocked = b;
  if (b) closeMenu();
}

export function isInteractBlocked(): boolean {
  return blocked;
}

export function isMenuOpen(): boolean {
  return menuFor !== null;
}

export function closeMenu(): void {
  if (menuFor === null) return;
  menuFor = null;
  rebuild();
}

function runAction(def: InteractableDef, actionId: string): boolean {
  // Kiểm tra lại điều kiện lúc chạy: trạng thái có thể đã đổi từ khi mở menu.
  const ctx = contextOf(def);
  const a = availableActions(def, ctx).find((x) => x.id === actionId);
  if (!a) return false;
  menuFor = null;
  try {
    a.run(ctx);
  } catch (err) {
    console.error(`[interact] hành động ${def.id}/${a.id} lỗi`, err);
  }
  rebuild();
  return true;
}

/** Hành vi phím E. Trả true nếu đã làm gì đó (để gọi preventDefault). */
export function activateFocus(): boolean {
  if (blocked) return false;
  const def = focusDef;
  if (!def) return false;
  if (menuFor !== null) {
    closeMenu();
    return true;
  }
  const ctx = contextOf(def);
  const actions = availableActions(def, ctx);
  const first = actions[0];
  if (!first) return false;
  if (actions.length === 1) return runAction(def, first.id);
  menuFor = def.id;
  rebuild();
  return true;
}

/** Chọn một hành động của vật đang focus (từ menu, chuột hoặc phím số). */
export function chooseAction(actionId: string): boolean {
  if (blocked || !focusDef) return false;
  return runAction(focusDef, actionId);
}

/** Phím số trong menu: index bắt đầu từ 0. */
export function chooseMenuIndex(index: number): boolean {
  const item = snap.menu?.[index];
  return item ? chooseAction(item.id) : false;
}

/** Bấm chuột vào vật: chỉ chạy khi vật đó đang là focus (trong tầm, không bị che). */
export function activateById(id: string): boolean {
  if (focusDef?.id !== id) return false;
  return activateFocus();
}

export function useInteractionSnapshot(): InteractionSnapshot {
  return useSyncExternalStore(subscribeInteraction, getInteractionSnapshot, getInteractionSnapshot);
}
