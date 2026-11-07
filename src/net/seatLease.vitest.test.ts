import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachSeatLease, seatResource, type SeatClientLike } from './seatLease';
import type { LeaseView, ServerMessage } from './protocol';
import { registerInteractable, getInteractable, contextOf } from '../scene/interact/registry';
import { chairInteractable } from '../scene/interact/objects/chair';
import { getObjectState } from '../scene/interact/objectStates';
import { resetCharacterState, transitionCharacter } from '../scene/interact/characterState';

class FakeClient implements SeatClientLike {
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

function setup() {
  const sits: string[] = [];
  const stands: number[] = [];
  const def = chairInteractable({
    id: 'chair-1',
    seat: { x: 1, z: 1, yaw: 0 },
    footprint: { cx: 1, cz: 1, hx: 0.3, hz: 0.3 },
    hooks: { sit: (s) => sits.push(s.id), stand: () => stands.push(1), isFree: () => true },
  });
  const off = registerInteractable(def);
  const client = new FakeClient();
  const notes: string[] = [];
  const detach = attachSeatLease(client, { notify: (m) => notes.push(m), setTimer: () => 0, clearTimer: () => undefined });
  const sit = () => getInteractable('chair-1')!.actions.find((a) => a.id === 'sit')!.run(contextOf(getInteractable('chair-1')!));
  return { sits, stands, client, notes, sit, detach, cleanup: () => (detach(), off()) };
}

const grant = (resource: string, requestId: string) => ({
  type: 'lease.result', op: 'acquire', requestId, resource, ok: true,
  lease: { resource, ownerId: 'u1', leaseId: 'L1', fence: 7, revision: 1 },
});

describe('seatLease: ngồi chỉ khi server cấp lease', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    resetCharacterState();
    ctx = setup();
  });
  afterEach(() => ctx.cleanup());

  it('tên resource hợp lệ với server', () => {
    expect(seatResource('chair-1')).toBe('seat:chair-1');
    expect(seatResource('a.b:c')).toBe('seat:a_b_c');
    expect(seatResource('x'.repeat(60)).length).toBe(5 + 40);
  });

  it('gửi acquire, chưa ngồi cho tới khi có lease.result ok', () => {
    ctx.sit();
    expect(ctx.client.sent).toEqual([{ op: 'acquire', resource: 'seat:chair-1' }]);
    expect(ctx.sits).toEqual([]);
    ctx.client.push(grant('seat:chair-1', 'r1'));
    expect(ctx.sits).toEqual(['chair-1']);
  });

  it('ghế người khác giữ: hiện "Ghế đã có người", không ngồi, khóa ghế', () => {
    ctx.sit();
    ctx.client.push({ type: 'lease.result', op: 'acquire', requestId: 'r1', resource: 'seat:chair-1', ok: false, error: 'occupied', owner: { id: 'u2', name: 'B' } });
    expect(ctx.notes).toEqual(['Ghế đã có người']);
    expect(ctx.sits).toEqual([]);
    expect(getObjectState('chair-1').occupant).toBe('u2');
    ctx.sit();
    expect(ctx.sits).toEqual([]);
  });

  it('lease cấp cho người khác không được coi là của mình', () => {
    ctx.sit();
    ctx.client.push({ ...grant('seat:chair-1', 'r1'), lease: { resource: 'seat:chair-1', ownerId: 'u2', leaseId: 'L', fence: 1, revision: 1 } });
    expect(ctx.sits).toEqual([]);
  });

  it('chưa kết nối thì không gửi và không ngồi', () => {
    ctx.client.state = 'reconnecting';
    ctx.sit();
    expect(ctx.client.sent).toEqual([]);
    expect(ctx.sits).toEqual([]);
    expect(ctx.notes.length).toBe(1);
  });

  it('đứng dậy (seated -> walking) thì trả lease', () => {
    ctx.sit();
    ctx.client.push(grant('seat:chair-1', 'r1'));
    ctx.client.owned = [{ resource: 'seat:chair-1', ownerId: 'u1', leaseId: 'L1', fence: 7, revision: 1 }];
    transitionCharacter('seated', 'test');
    expect(ctx.client.sent.some((s) => s.op === 'release')).toBe(false);
    transitionCharacter('walking', 'test');
    expect(ctx.client.sent[ctx.client.sent.length - 1]).toEqual({ op: 'release', resource: 'seat:chair-1' });
  });

  it('người khác nhả ghế thì mở lại; gỡ cầu nối khôi phục hành vi gốc', () => {
    ctx.client.push({ type: 'lease', resource: 'seat:chair-1', ownerId: 'u2', fence: 2, revision: 2, reason: 'acquired' });
    expect(getObjectState('chair-1').occupant).toBe('u2');
    ctx.client.push({ type: 'lease', resource: 'seat:chair-1', ownerId: null, fence: 3, revision: 3, reason: 'released' });
    expect(getObjectState('chair-1').occupant).toBe('');
    ctx.detach();
    ctx.sit();
    expect(ctx.sits).toEqual(['chair-1']);
    expect(ctx.client.sent).toEqual([]);
  });
});
