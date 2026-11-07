// Cầu nối lease ghế (TASK 24) giữa hành động ngồi trong cảnh và world service. Chỉ chạy khi bật ?world=1.
// Không sửa Player.tsx/controls: bọc `run` của hành động "sit" trên các vật kind 'chair' đã đăng ký ở sổ tương tác
// (sửa tại chỗ để cleanup của registerObjects vẫn gỡ đúng def gốc).
// Luồng: bấm Ngồi -> lease.acquire -> chỉ khi server cấp lease (có leaseId và fence) mới chạy hành động ngồi gốc.
// Heartbeat do WorldClient tự gửi cho lease đang giữ. Đứng dậy (characterState về walking sau khi đã ngồi) -> lease.release.
import { announce } from '../a11y';
import { getCharacterState, subscribeCharacterState } from '../scene/interact/characterState';
import { getObjectState, setObjectState } from '../scene/interact/objectStates';
import { contextOf, getInteractable, listInteractables, subscribeRegistry, type InteractAction } from '../scene/interact/registry';
import { emitInteractEvent } from '../scene/interact/objects/interactEvents';
import { LOCAL_USER } from '../scene/interact/objects/chair';
import type { LeaseView, ServerMessage } from './protocol';

/** Phần của WorldClient mà cầu nối cần (để test bằng giả lập). */
export interface SeatClientLike {
  state: string;
  selfId: string | null;
  acquire(resource: string): string;
  release(resource: string): void;
  ownedLeases(): LeaseView[];
  onMessage(fn: (m: ServerMessage) => void): () => void;
}

export interface SeatLeaseOptions {
  /** Thông báo cho người dùng (mặc định: aria-live). */
  notify?: (message: string) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  /** Chờ server trả lease.result (ms). */
  acquireTimeoutMs?: number;
  /** Cấp lease xong mà không thấy ngồi trong khoảng này thì trả lease (ms). */
  seatGraceMs?: number;
}

export const MSG_OCCUPIED = 'Ghế đã có người';

/** Tên resource của server: `seat:<id>`, id khớp [A-Za-z0-9_-]{1,40}. */
export function seatResource(chairId: string): string {
  const id = chairId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || '_';
  return `seat:${id}`;
}

const ERROR_TEXT: Record<string, string> = {
  occupied: MSG_OCCUPIED,
  already_seated: 'Bạn đang ngồi ở ghế khác',
  forbidden: 'Bạn không có quyền ngồi ghế',
  limit_reached: 'Bạn đang giữ quá nhiều chỗ',
  rate_limited: 'Thao tác quá nhanh, thử lại sau',
};

type Run = InteractAction['run'];

/** Gắn cầu nối. Trả hàm gỡ (khôi phục run gốc, trả lease đang giữ). */
export function attachSeatLease(client: SeatClientLike, o: SeatLeaseOptions = {}): () => void {
  const notify = o.notify ?? ((m: string) => void announce(m, 'assertive'));
  const setTimer = o.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = o.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const acquireTimeoutMs = o.acquireTimeoutMs ?? 5000;
  const seatGraceMs = o.seatGraceMs ?? 4000;

  const wrapped = new Map<InteractAction, Run>(); // action đã bọc -> run gốc
  const idOfResource = new Map<string, string>();
  const pending = new Map<string, { id: string; resource: string; timer: unknown; run: () => void }>(); // theo requestId
  const busy = new Set<string>(); // chair id đang chờ phản hồi
  const held = new Map<string, { id: string; seen: boolean; timer: unknown }>(); // theo resource

  const deny = (id: string, text: string) => {
    notify(text);
    emitInteractEvent({ type: 'chair.denied', id });
  };

  function dropHeld(resource: string, release: boolean) {
    const h = held.get(resource);
    if (!h) return;
    clearTimer(h.timer);
    held.delete(resource);
    if (release) client.release(resource);
    if (getObjectState(h.id).occupant === LOCAL_USER) setObjectState(h.id, { occupant: '' });
  }

  function trySit(id: string, orig: Run) {
    const def = getInteractable(id);
    if (!def) return;
    const resource = seatResource(id);
    idOfResource.set(resource, id);
    const go = () => orig(contextOf(getInteractable(id) ?? def));
    if (client.state !== 'connected') return deny(id, 'Chưa kết nối phòng nên chưa thể ngồi');
    if (client.ownedLeases().some((l) => l.resource === resource && l.leaseId)) return go();
    if (busy.has(id)) return;
    busy.add(id);
    const requestId = client.acquire(resource);
    const timer = setTimer(() => {
      pending.delete(requestId);
      busy.delete(id);
      deny(id, 'Máy chủ chưa phản hồi, chưa thể ngồi');
    }, acquireTimeoutMs);
    pending.set(requestId, { id, resource, timer, run: go });
  }

  function onAcquireResult(m: Extract<ServerMessage, { type: 'lease.result' }>) {
    const p = m.requestId ? pending.get(m.requestId) : undefined;
    if (!p || !m.requestId) return;
    pending.delete(m.requestId);
    clearTimer(p.timer);
    busy.delete(p.id);
    const l = m.lease;
    // Chỉ ngồi khi server cấp lease cho chính mình, có leaseId và fence.
    if (m.ok && l && l.ownerId === client.selfId && l.leaseId && typeof l.fence === 'number') {
      const h = { id: p.id, seen: false, timer: null as unknown };
      h.timer = setTimer(() => {
        if (!h.seen && getCharacterState() !== 'seated') dropHeld(p.resource, true);
      }, seatGraceMs);
      held.set(p.resource, h);
      p.run();
      return;
    }
    if (m.error === 'occupied' && m.owner) setObjectState(p.id, { occupant: m.owner.id });
    deny(p.id, ERROR_TEXT[m.error ?? ''] ?? 'Không ngồi được, thử lại sau');
  }

  /** Lease của ghế do người khác giữ/nhả: phản ánh vào trạng thái ghế để hành động Ngồi tự khóa. */
  function applyLease(l: { resource: string; ownerId: string | null }) {
    const id = idOfResource.get(l.resource);
    if (!id) return;
    const cur = getObjectState(id).occupant;
    if (l.ownerId && l.ownerId !== client.selfId) {
      if (cur !== l.ownerId) setObjectState(id, { occupant: l.ownerId });
      if (held.has(l.resource)) loseSeat(l.resource);
    } else if (!l.ownerId && cur !== '' && cur !== LOCAL_USER) {
      setObjectState(id, { occupant: '' });
    }
  }

  /** Mất lease đang giữ (hết hạn, bị thu hồi, đổi chủ): bỏ khóa cục bộ, báo, và đứng dậy nếu đang ngồi. */
  function loseSeat(resource: string) {
    const h = held.get(resource);
    if (!h) return;
    dropHeld(resource, false);
    notify('Bạn không còn giữ ghế này');
    const def = getInteractable(h.id);
    const stand = def?.actions.find((a) => a.id === 'stand');
    if (def && stand && getCharacterState() === 'seated') stand.run(contextOf(def));
  }

  const offMsg = client.onMessage((m) => {
    if (m.type === 'lease.result') {
      if (m.op === 'acquire') onAcquireResult(m);
      else if (!m.ok && m.resource && (m.error === 'lease_lost' || m.error === 'stale_token')) loseSeat(m.resource);
    } else if (m.type === 'lease') {
      if (m.resource.startsWith('seat:')) applyLease(m);
    } else if (m.type === 'snapshot') {
      // Snapshot là nguồn sự thật: lease không còn của mình thì bỏ.
      const mine = new Set(m.leases.filter((l) => l.ownerId === m.self.id).map((l) => l.resource));
      for (const r of [...held.keys()]) if (!mine.has(r)) loseSeat(r);
      for (const l of m.leases) if (l.resource.startsWith('seat:')) applyLease(l);
    }
  });

  const offChar = subscribeCharacterState(() => {
    const s = getCharacterState();
    for (const [resource, h] of [...held]) {
      if (s === 'seated') h.seen = true;
      else if (s === 'walking' && h.seen) dropHeld(resource, true); // đứng dậy: trả lease
    }
  });

  function wrapAll() {
    for (const def of listInteractables()) {
      if (def.kind !== 'chair') continue;
      idOfResource.set(seatResource(def.id), def.id);
      for (const a of def.actions) {
        if (a.id !== 'sit' || wrapped.has(a)) continue;
        const orig = a.run;
        wrapped.set(a, orig);
        (a as { run: Run }).run = () => trySit(def.id, orig);
      }
    }
  }
  wrapAll();
  const offReg = subscribeRegistry(wrapAll);

  return () => {
    offMsg();
    offChar();
    offReg();
    for (const p of pending.values()) clearTimer(p.timer);
    pending.clear();
    busy.clear();
    for (const r of [...held.keys()]) dropHeld(r, true);
    for (const [a, orig] of wrapped) (a as { run: Run }).run = orig;
    wrapped.clear();
  };
}
