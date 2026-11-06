import type { InteractableDef, InteractAction } from '../registry';
import { getObjectState, setObjectState, getObjectDefaults, changedObjectIds, type ObjectState } from '../objectStates';
import { getCharacterState, subscribeCharacterState } from '../characterState';
import { emitInteractEvent } from './interactEvents';

/**
 * Ghế: chiếm chỗ (occupant), xoay ghế (swivel). Việc đặt nhân vật vào ghế do callback sit/stand
 * (mặc định nối requestSit/requestStand ở index.ts). Tái dùng chairInteractables (../chairs.ts) qua wrapChairs.
 */
export const LOCAL_USER = 'me';

export interface ChairState {
  /** Người đang ngồi, '' = trống. */
  occupant: string;
  /** Góc xoay mặt ghế so với hướng gốc (rad), kẹp [-π, π]. */
  swivel: number;
}

export const CHAIR_INITIAL = { occupant: '', swivel: 0 } as const;

export function chairOf(s: ObjectState): ChairState {
  return { occupant: typeof s.occupant === 'string' ? s.occupant : '', swivel: typeof s.swivel === 'number' ? s.swivel : 0 };
}

/** Ngồi: chỉ khi trống (hoặc chính mình). null = bị từ chối. */
export function chairSit(s: ChairState, who: string): Partial<ChairState> | null {
  return s.occupant === '' || s.occupant === who ? { occupant: who } : null;
}

export function chairStand(s: ChairState, who: string): Partial<ChairState> | null {
  return s.occupant === who ? { occupant: '' } : null;
}

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Xoay ghế: ghế trống hoặc chính mình ngồi mới xoay được. */
export function chairSwivel(s: ChairState, who: string, delta: number): Partial<ChairState> | null {
  if (s.occupant !== '' && s.occupant !== who) return null;
  return { swivel: wrapPi(s.swivel + delta) };
}

export interface SeatPose {
  x: number;
  z: number;
  yaw: number;
}

/**
 * Chỗ đứng dậy: thử sau lưng, trái, phải, trước ghế. isFree kiểm tra khoảng trống (tường, bàn, người).
 * Quy ước yaw: hướng nhìn = (sin yaw, cos yaw).
 */
export function findStandSpot(seat: SeatPose, isFree: (x: number, z: number) => boolean, dist = 0.75): SeatPose | null {
  const fx = Math.sin(seat.yaw);
  const fz = Math.cos(seat.yaw);
  const dirs: Array<[number, number]> = [
    [-fx, -fz],
    [-fz, fx],
    [fz, -fx],
    [fx, fz],
  ];
  for (const [dx, dz] of dirs) {
    const x = seat.x + dx * dist;
    const z = seat.z + dz * dist;
    if (isFree(x, z)) return { x, z, yaw: seat.yaw };
  }
  return null;
}

export interface ChairHooks {
  sit: (seat: { id: string } & SeatPose) => void;
  stand: (spot: SeatPose) => void;
  isFree: (x: number, z: number) => boolean;
  who?: string;
}

/** Hành động ghế dùng chung: ngồi (đã chiếm chỗ), đứng dậy (kiểm tra khoảng trống), xoay. */
export function chairActions(id: string, seat: SeatPose, hooks: ChairHooks, sitAction?: InteractAction): InteractAction[] {
  const who = hooks.who ?? LOCAL_USER;
  const ev = (type: 'chair.sit' | 'chair.stand' | 'chair.swivel' | 'chair.denied') =>
    emitInteractEvent({ type, id, x: seat.x, z: seat.z });
  const cs = () => chairOf(getObjectState(id));
  return [
    {
      id: 'sit',
      label: sitAction?.label ?? 'Ngồi xuống',
      when: (c) => {
        // Chỗ ghi tên mình nhưng mình không ngồi (yêu cầu ngồi không thực hiện được): vẫn cho ngồi lại.
        const o = chairOf(c.state).occupant;
        return (o === '' || o === who) && c.character !== 'seated';
      },
      run: (c) => {
        const p = chairSit(cs(), who);
        if (!p) return ev('chair.denied');
        setObjectState(id, p);
        if (sitAction) sitAction.run(c);
        else hooks.sit({ id, ...seat });
        ev('chair.sit');
      },
    },
    {
      id: 'stand',
      label: 'Đứng dậy',
      when: (c) => chairOf(c.state).occupant === who && c.character === 'seated',
      run: () => {
        const spot = findStandSpot(seat, hooks.isFree);
        if (!spot) return ev('chair.denied'); // không có chỗ trống: giữ nguyên tư thế ngồi
        hooks.stand(spot);
        setObjectState(id, { occupant: '' });
        ev('chair.stand');
      },
    },
    {
      id: 'occupied',
      label: 'Ghế có người ngồi',
      when: (c) => {
        const o = chairOf(c.state).occupant;
        return o !== '' && o !== who;
      },
      run: () => ev('chair.denied'),
    },
    {
      id: 'swivel',
      label: 'Xoay ghế',
      when: (c) => {
        const o = chairOf(c.state).occupant;
        return o === '' || o === who;
      },
      run: () => {
        const p = chairSwivel(cs(), who, Math.PI / 4);
        if (p) {
          setObjectState(id, p);
          ev('chair.swivel');
        }
      },
    },
  ];
}

/** Ghế độc lập (ghế ngoài khối bàn). */
export function chairInteractable(o: { id: string; label?: string; seat: SeatPose; footprint: NonNullable<InteractableDef['footprint']> } & { hooks: ChairHooks }): InteractableDef {
  return {
    id: o.id,
    kind: 'chair',
    label: o.label ?? 'Ghế',
    footprint: o.footprint,
    height: 0.9,
    maxDistance: 1.3,
    point: o.seat,
    defaultState: CHAIR_INITIAL,
    actions: chairActions(o.id, o.seat, o.hooks),
  };
}

/**
 * Bọc các def từ chairInteractables(objects): giữ hành động ngồi gốc (requestSit tới chỗ đã tính),
 * thêm chiếm chỗ, đứng dậy có kiểm tra chỗ trống, xoay. seatOf cho tư thế ghế theo id.
 */
export function wrapChairs(
  defs: readonly InteractableDef[],
  seatOf: (def: InteractableDef) => SeatPose | null,
  hooks: ChairHooks,
): InteractableDef[] {
  const out: InteractableDef[] = [];
  for (const d of defs) {
    const seat = seatOf(d);
    if (!seat) {
      out.push(d);
      continue;
    }
    const sit = d.actions.find((a) => a.id === 'sit');
    out.push({ ...d, defaultState: CHAIR_INITIAL, actions: chairActions(d.id, seat, hooks, sit) });
  }
  return out;
}

/**
 * Khi nhân vật về trạng thái đi lại (đứng dậy bằng phím E của hệ thống), nhả mọi ghế mình đang chiếm.
 * Không nhả khi seated -> using_ui (dùng máy tính). Trả hàm hủy.
 */
export function bindSeatRelease(who: string = LOCAL_USER): () => void {
  return subscribeCharacterState(() => {
    if (getCharacterState() !== 'walking') return;
    for (const id of [...new Set([...changedObjectIds()])]) {
      const s = getObjectState(id);
      if (s.occupant === who && 'swivel' in getObjectDefaults(id)) setObjectState(id, { occupant: '' });
    }
  });
}
