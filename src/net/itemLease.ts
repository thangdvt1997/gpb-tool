// Cầu nối lease vật cầm (TASK 24, kind `held`) giữa hành động "Cầm" của đồ nhỏ và world service. Chỉ chạy khi bật ?world=1.
// Luồng: bấm Cầm -> lease.acquire `held:<id>` -> chỉ khi server cấp lease (có leaseId và fence) mới chạy hành động cầm gốc.
// Đặt/thả/trả (vật rời tay) -> lease.release. Mất lease khi đang cầm (hết hạn, thu hồi) -> trả vật về chỗ cũ.
// Không có world (không gắn cầu nối) thì hành động cầm giữ nguyên hành vi cũ.
import { announce } from '../a11y';
import { getObjectState, subscribeObjectStates } from '../scene/interact/objectStates';
import { contextOf, getInteractable, listInteractables, subscribeRegistry, type InteractAction } from '../scene/interact/registry';
import { emitInteractEvent } from '../scene/interact/objects/interactEvents';
import { getHeldItem, returnItem } from '../scene/interact/objects/smallItem';
import type { ServerMessage } from './protocol';
import type { SeatClientLike, SeatLeaseOptions } from './seatLease';

export type ItemClientLike = SeatClientLike;
export type ItemLeaseOptions = Omit<SeatLeaseOptions, 'seatGraceMs'>;

export const MSG_ITEM_BUSY = 'Vật này đang có người cầm';

/** Tên resource của server: `held:<id>`, id khớp [A-Za-z0-9_-]{1,40}. */
export function heldResource(itemId: string): string {
  const id = itemId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || '_';
  return `held:${id}`;
}

const ERROR_TEXT: Record<string, string> = {
  occupied: MSG_ITEM_BUSY,
  forbidden: 'Bạn không có quyền cầm vật này',
  limit_reached: 'Bạn đang cầm một vật khác',
  rate_limited: 'Thao tác quá nhanh, thử lại sau',
};

type Run = InteractAction['run'];

/** Gắn cầu nối. Trả hàm gỡ (khôi phục run gốc, trả lease đang giữ). */
export function attachItemLease(client: ItemClientLike, o: ItemLeaseOptions = {}): () => void {
  const notify = o.notify ?? ((m: string) => void announce(m, 'assertive'));
  const setTimer = o.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = o.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const acquireTimeoutMs = o.acquireTimeoutMs ?? 5000;

  const wrapped = new Map<InteractAction, Run>();
  const pending = new Map<string, { id: string; timer: unknown; run: () => void }>(); // theo requestId
  const busy = new Set<string>(); // item id đang chờ phản hồi
  const held = new Map<string, string>(); // resource -> item id đang giữ lease

  const deny = (id: string, text: string) => {
    notify(text);
    emitInteractEvent({ type: 'item.denied', id, x: 0, z: 0, data: { reason: 'lease' } });
  };

  function drop(resource: string, release: boolean) {
    if (!held.delete(resource)) return;
    if (release) client.release(resource);
  }

  function tryPick(id: string, orig: Run) {
    const def = getInteractable(id);
    if (!def) return;
    const resource = heldResource(id);
    const go = () => {
      orig(contextOf(getInteractable(id) ?? def));
      if (getHeldItem() === id) held.set(resource, id);
      else client.release(resource); // cầm gốc bị từ chối (đang bận tay...): trả lease ngay
    };
    if (client.state !== 'connected') return deny(id, 'Chưa kết nối phòng nên chưa thể cầm');
    if (client.ownedLeases().some((l) => l.resource === resource && l.leaseId)) return go();
    if (busy.has(id)) return;
    busy.add(id);
    const requestId = client.acquire(resource);
    const timer = setTimer(() => {
      pending.delete(requestId);
      busy.delete(id);
      deny(id, 'Máy chủ chưa phản hồi, chưa thể cầm');
    }, acquireTimeoutMs);
    pending.set(requestId, { id, timer, run: go });
  }

  function onAcquireResult(m: Extract<ServerMessage, { type: 'lease.result' }>) {
    const p = m.requestId ? pending.get(m.requestId) : undefined;
    if (!p || !m.requestId) return;
    pending.delete(m.requestId);
    clearTimer(p.timer);
    busy.delete(p.id);
    const l = m.lease;
    if (m.ok && l && l.ownerId === client.selfId && l.leaseId && typeof l.fence === 'number') {
      p.run();
      return;
    }
    deny(p.id, ERROR_TEXT[m.error ?? ''] ?? 'Không cầm được, thử lại sau');
  }

  /** Mất lease đang giữ: bỏ khóa cục bộ, báo, và trả vật về chỗ cũ nếu vẫn đang cầm. */
  function loseHeld(resource: string) {
    const id = held.get(resource);
    if (id === undefined) return;
    drop(resource, false);
    notify('Bạn không còn quyền cầm vật này');
    if (getObjectState(id).where === 'hand') {
      const d = getInteractable(id)?.defaultState;
      const home = { x: Number(d?.x ?? 0), y: Number(d?.y ?? 0), z: Number(d?.z ?? 0) };
      returnItem(id, home);
    }
  }

  const offMsg = client.onMessage((m) => {
    if (m.type === 'lease.result') {
      if (m.op === 'acquire') onAcquireResult(m);
      else if (!m.ok && m.resource && (m.error === 'lease_lost' || m.error === 'stale_token')) loseHeld(m.resource);
    } else if (m.type === 'snapshot') {
      const mine = new Set(m.leases.filter((l) => l.ownerId === m.self.id).map((l) => l.resource));
      for (const r of [...held.keys()]) if (!mine.has(r)) loseHeld(r);
    } else if (m.type === 'lease' && held.has(m.resource) && m.ownerId !== client.selfId) {
      loseHeld(m.resource);
    }
  });

  // Vật rời tay (đặt, thả, trả) thì trả lease.
  const offState = subscribeObjectStates(() => {
    for (const [resource, id] of [...held]) if (getObjectState(id).where !== 'hand') drop(resource, true);
  });

  function wrapAll() {
    for (const def of listInteractables()) {
      if (def.kind !== 'small_item') continue;
      for (const a of def.actions) {
        if (a.id !== 'pickup' || wrapped.has(a)) continue;
        const orig = a.run;
        wrapped.set(a, orig);
        (a as { run: Run }).run = () => tryPick(def.id, orig);
      }
    }
  }
  wrapAll();
  const offReg = subscribeRegistry(wrapAll);

  return () => {
    offMsg();
    offState();
    offReg();
    for (const p of pending.values()) clearTimer(p.timer);
    pending.clear();
    busy.clear();
    for (const r of [...held.keys()]) drop(r, true);
    for (const [a, orig] of wrapped) (a as { run: Run }).run = orig;
    wrapped.clear();
  };
}
