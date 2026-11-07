import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachItemLease, heldResource, type ItemClientLike } from './itemLease';
import type { LeaseView, ServerMessage } from './protocol';
import { registerInteractable, getInteractable, contextOf } from '../scene/interact/registry';
import { itemInteractable, clearItemRegistry, getHeldItem, placeItem, returnItem } from '../scene/interact/objects/smallItem';
import { getObjectState, resetObjectStates } from '../scene/interact/objectStates';
import { resetCharacterState, getCharacterState } from '../scene/interact/characterState';

class FakeClient implements ItemClientLike {
  state = 'connected';
  selfId: string | null = 'u1';
  sent: { op: string; resource: string }[] = [];
  owned: LeaseView[] = [];
  private fns = new Set<(m: ServerMessage) => void>();
  private n = 0;
  acquire(resource: string) {
    this.sent.push({ op: 'acquire', resource });
    return `r${++this.n}`;
  }
  release(resource: string) {
    this.sent.push({ op: 'release', resource });
    this.owned = this.owned.filter((l) => l.resource !== resource);
  }
  ownedLeases() {
    return this.owned;
  }
  onMessage(fn: (m: ServerMessage) => void) {
    this.fns.add(fn);
    return () => void this.fns.delete(fn);
  }
  push(m: unknown) {
    this.fns.forEach((f) => f(m as ServerMessage));
  }
}

const home = { x: 0.5, y: 0.8, z: 0.5 };
const grant = (resource: string, requestId: string, owner = 'u1') => ({
  type: 'lease.result', op: 'acquire', requestId, resource, ok: true,
  lease: { resource, ownerId: owner, leaseId: 'L1', fence: 3, revision: 1 },
});

describe('itemLease: chỉ cầm khi server cấp lease', () => {
  let client: FakeClient;
  let notes: string[];
  let detach: () => void;
  let off: () => void;
  const pick = () => getInteractable('cup')!.actions.find((a) => a.id === 'pickup')!.run(contextOf(getInteractable('cup')!));

  beforeEach(() => {
    clearItemRegistry();
    resetObjectStates();
    resetCharacterState();
    off = registerInteractable(itemInteractable({ id: 'cup', label: 'Cốc', home, footprint: { cx: 0.5, cz: 0.5, hx: 0.05, hz: 0.05 } }));
    client = new FakeClient();
    notes = [];
    detach = attachItemLease(client, { notify: (m) => notes.push(m), setTimer: () => 0, clearTimer: () => undefined });
  });
  afterEach(() => {
    detach();
    off();
  });

  it('tên resource hợp lệ với server', () => {
    expect(heldResource('sample_cup')).toBe('held:sample_cup');
    expect(heldResource('a.b')).toBe('held:a_b');
  });

  it('gửi acquire, chưa cầm cho tới khi có lease', () => {
    pick();
    expect(client.sent).toEqual([{ op: 'acquire', resource: 'held:cup' }]);
    expect(getHeldItem()).toBeNull();
    client.push(grant('held:cup', 'r1'));
    expect(getHeldItem()).toBe('cup');
    expect(getCharacterState()).toBe('holding');
  });

  it('người khác đang cầm: báo, không cầm', () => {
    pick();
    client.push({ type: 'lease.result', op: 'acquire', requestId: 'r1', resource: 'held:cup', ok: false, error: 'occupied', owner: { id: 'u2', name: 'B' } });
    expect(getHeldItem()).toBeNull();
    expect(notes).toEqual(['Vật này đang có người cầm']);
  });

  it('lease cấp cho người khác không được coi là của mình', () => {
    pick();
    client.push(grant('held:cup', 'r1', 'u2'));
    expect(getHeldItem()).toBeNull();
  });

  it('chưa kết nối thì không gửi và không cầm', () => {
    client.state = 'reconnecting';
    pick();
    expect(client.sent).toEqual([]);
    expect(getHeldItem()).toBeNull();
    expect(notes.length).toBe(1);
  });

  it('đặt xuống thì trả lease', () => {
    pick();
    client.push(grant('held:cup', 'r1'));
    placeItem('cup', 1, 0.8, 1, 0);
    expect(client.sent[client.sent.length - 1]).toEqual({ op: 'release', resource: 'held:cup' });
  });

  it('mất lease khi đang cầm: trả vật về chỗ cũ và báo', () => {
    pick();
    client.push(grant('held:cup', 'r1'));
    client.push({ type: 'lease.result', op: 'heartbeat', resource: 'held:cup', ok: false, error: 'lease_lost' });
    expect(getObjectState('cup').where).toBe('home');
    expect(getHeldItem()).toBeNull();
    expect(notes).toEqual(['Bạn không còn quyền cầm vật này']);
    // đã bỏ khóa cục bộ: trả về chỗ cũ không gửi release thừa
    expect(client.sent.filter((s) => s.op === 'release')).toEqual([]);
  });

  it('gỡ cầu nối: khôi phục hành vi gốc, cầm được không cần lease', () => {
    detach();
    pick();
    expect(client.sent).toEqual([]);
    expect(getHeldItem()).toBe('cup');
    returnItem('cup', home);
  });
});
