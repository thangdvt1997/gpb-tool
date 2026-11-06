import type { InteractableDef, InteractPoint, Footprint } from '../registry';
import { getObjectState, setObjectState, type ObjectState, type ObjectStatePatch } from '../objectStates';
import { emitInteractEvent } from './interactEvents';
import { registerTicker } from './tickers';

/**
 * Cửa có bản lề. Góc quay (rad) có dấu: dương = quay về phía -n (xem swingDir).
 * Quy ước hình học: group ở bản lề, rotation.y = yaw + angle, lá cửa kéo dài theo local +x,
 * pháp tuyến local +z = n = (sin yaw, cos yaw).
 */
export type DoorPhase = 'closed' | 'opening' | 'open' | 'closing' | 'locked';

export interface DoorState {
  phase: DoorPhase;
  angle: number;
  /** Hướng quay đã chốt khi mở: +1 hoặc -1. */
  dir: 1 | -1;
  /** Giây còn lại trước khi tự đóng (chỉ khi open). */
  timer: number;
}

export interface DoorConfig {
  /** Góc mở tối đa (rad). */
  maxAngle: number;
  /** Tốc độ quay (rad/s). */
  speed: number;
  /** Tự đóng sau bao nhiêu giây khi mở. 0 = không tự đóng. */
  autoCloseAfter: number;
  /** Cho phép khóa/mở khóa bằng hành động. */
  lockable: boolean;
}

export const DOOR_DEFAULTS: DoorConfig = { maxAngle: (100 * Math.PI) / 180, speed: 2.2, autoCloseAfter: 8, lockable: false };

export const DOOR_INITIAL: DoorState = { phase: 'closed', angle: 0, dir: 1, timer: 0 };

export function doorOf(s: ObjectState): DoorState {
  return {
    phase: (s.phase as DoorPhase) ?? 'closed',
    angle: typeof s.angle === 'number' ? s.angle : 0,
    dir: s.dir === -1 ? -1 : 1,
    timer: typeof s.timer === 'number' ? s.timer : 0,
  };
}

/** Phía người đứng so với pháp tuyến n của cửa: +1 hoặc -1. Cửa mở về phía XA người. */
export function playerSideOf(px: number, pz: number, hinge: { x: number; z: number }, yaw: number): 1 | -1 {
  const d = (px - hinge.x) * Math.sin(yaw) + (pz - hinge.z) * Math.cos(yaw);
  return d >= 0 ? 1 : -1;
}

/** Hướng quay để lá cửa đi về phía xa người (xem phép tính trong tài liệu: dir = phía của người). */
export function swingDir(side: 1 | -1): 1 | -1 {
  return side;
}

export interface Body {
  x: number;
  z: number;
  r: number;
}

/** Đầu tự do của lá cửa ở góc angle. */
export function leafEnd(hinge: { x: number; z: number }, yaw: number, angle: number, length: number): { x: number; z: number } {
  const a = yaw + angle;
  return { x: hinge.x + length * Math.cos(a), z: hinge.z - length * Math.sin(a) };
}

/** Khoảng cách điểm tới đoạn thẳng. */
export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** Lá cửa ở góc angle có chạm vật thể tròn nào không (độ dày lá tính vào bán kính). */
export function doorBlocked(
  hinge: { x: number; z: number },
  yaw: number,
  angle: number,
  length: number,
  bodies: readonly Body[],
  thickness = 0.05,
): boolean {
  const e = leafEnd(hinge, yaw, angle, length);
  return bodies.some((b) => distToSegment(b.x, b.z, hinge.x, hinge.z, e.x, e.z) < b.r + thickness);
}

/** Bấm E: mở nếu đóng, đóng nếu mở, đảo chiều nếu đang chạy. Khóa thì không đổi. */
export function doorToggle(s: DoorState, side: 1 | -1): Partial<DoorState> | null {
  switch (s.phase) {
    case 'locked':
      return null;
    case 'closed':
      return { phase: 'opening', dir: swingDir(side), timer: 0 };
    case 'open':
    case 'opening':
      return { phase: 'closing', timer: 0 };
    case 'closing':
      return { phase: 'opening' };
  }
}

export function doorLock(s: DoorState): Partial<DoorState> | null {
  return s.phase === 'closed' ? { phase: 'locked', angle: 0 } : null;
}

export function doorUnlock(s: DoorState): Partial<DoorState> | null {
  return s.phase === 'locked' ? { phase: 'closed' } : null;
}

export type DoorTickEvent = 'opened' | 'closed' | 'blocked' | 'autoclose' | null;

/**
 * Một bước thời gian. blockedAt(angleMới) cho biết góc mới có bị chặn không.
 * Bị chặn khi mở: dừng tại chỗ (coi như mở). Bị chặn khi đóng: dừng và mở lại (không đẩy xuyên người).
 */
export function doorTick(
  s: DoorState,
  dt: number,
  cfg: DoorConfig,
  blockedAt: (angle: number) => boolean = () => false,
): { state: DoorState; event: DoorTickEvent } {
  const max = cfg.maxAngle;
  if (s.phase === 'opening') {
    const target = s.dir * max;
    const step = cfg.speed * dt;
    const next = s.angle + Math.sign(target - s.angle) * Math.min(step, Math.abs(target - s.angle));
    if (blockedAt(next)) {
      // Chưa nhích được chút nào thì coi như vẫn đóng, không để trạng thái "mở" với góc 0.
      const stuck = Math.abs(s.angle) < 1e-6;
      return { state: { ...s, phase: stuck ? 'closed' : 'open', timer: stuck ? 0 : cfg.autoCloseAfter }, event: 'blocked' };
    }
    if (next === target) return { state: { ...s, angle: next, phase: 'open', timer: cfg.autoCloseAfter }, event: 'opened' };
    return { state: { ...s, angle: next }, event: null };
  }
  if (s.phase === 'closing') {
    const step = cfg.speed * dt;
    const next = s.angle - Math.sign(s.angle) * Math.min(step, Math.abs(s.angle));
    if (blockedAt(next)) return { state: { ...s, phase: 'open', timer: cfg.autoCloseAfter }, event: 'blocked' };
    if (next === 0) return { state: { ...s, angle: 0, phase: 'closed', timer: 0 }, event: 'closed' };
    return { state: { ...s, angle: next }, event: null };
  }
  if (s.phase === 'open' && cfg.autoCloseAfter > 0) {
    const timer = s.timer - dt;
    if (timer <= 0) return { state: { ...s, phase: 'closing', timer: 0 }, event: 'autoclose' };
    return { state: { ...s, timer }, event: null };
  }
  return { state: s, event: null };
}

export interface DoorOptions {
  id: string;
  label?: string;
  /** Bản lề (toạ độ thế giới) và yaw cơ sở của lá cửa khi đóng. */
  hinge: { x: number; z: number };
  yaw: number;
  /** Chiều rộng lá cửa (m). */
  length: number;
  footprint: Footprint;
  config?: Partial<DoorConfig>;
  /** Vị trí người chơi, mặc định đọc playerPose (inject để test). */
  getPlayer: () => { x: number; z: number };
  /** Vật cản tròn khác cần tránh (người chơi luôn được tính). */
  getBodies?: () => readonly Body[];
  playerRadius?: number;
  startLocked?: boolean;
}

export function doorInteractable(o: DoorOptions): InteractableDef {
  const cfg = { ...DOOR_DEFAULTS, ...o.config };
  const ev = (type: Parameters<typeof emitInteractEvent>[0]['type']) =>
    emitInteractEvent({ type, id: o.id, x: o.hinge.x, z: o.hinge.z });
  const cur = () => doorOf(getObjectState(o.id));
  const apply = (p: Partial<DoorState> | null) => {
    if (p) setObjectState(o.id, p as ObjectStatePatch);
  };
  const point: InteractPoint = { x: o.footprint.cx, z: o.footprint.cz, yaw: o.yaw };
  return {
    id: o.id,
    kind: 'door',
    label: o.label ?? 'Cửa',
    footprint: o.footprint,
    height: 2.1,
    point,
    occludes: false,
    defaultState: { ...DOOR_INITIAL, phase: o.startLocked ? 'locked' : 'closed' },
    actions: [
      {
        id: 'toggle',
        label: (c) => {
          const p = doorOf(c.state).phase;
          return p === 'locked' ? 'Cửa đang khóa' : p === 'closed' || p === 'closing' ? 'Mở cửa' : 'Đóng cửa';
        },
        when: (c) => doorOf(c.state).phase !== 'locked',
        run: () => {
          const pl = o.getPlayer();
          const s = cur();
          const p = doorToggle(s, playerSideOf(pl.x, pl.z, o.hinge, o.yaw));
          apply(p);
          if (p) ev(p.phase === 'closing' ? 'door.close' : 'door.open');
        },
      },
      {
        id: 'knock',
        label: 'Cửa đang khóa',
        when: (c) => doorOf(c.state).phase === 'locked',
        run: () => ev('door.locked'),
      },
      {
        id: 'lock',
        label: 'Khóa cửa',
        when: (c) => cfg.lockable && doorOf(c.state).phase === 'closed',
        run: () => {
          apply(doorLock(cur()));
          ev('door.lock');
        },
      },
      {
        id: 'unlock',
        label: 'Mở khóa',
        when: (c) => cfg.lockable && doorOf(c.state).phase === 'locked',
        run: () => {
          apply(doorUnlock(cur()));
          ev('door.unlock');
        },
      },
    ],
  };
}

/** Đăng ký tick cho cửa (được ObjectsTicker gọi). Trả hàm hủy. */
export function registerDoorTicker(o: DoorOptions): () => void {
  const cfg = { ...DOOR_DEFAULTS, ...o.config };
  const r = o.playerRadius ?? 0.35;
  return registerTicker(o.id, (dt) => {
    const s = doorOf(getObjectState(o.id));
    if (s.phase === 'closed' || s.phase === 'locked') return;
    const pl = o.getPlayer();
    const bodies = [{ x: pl.x, z: pl.z, r }, ...(o.getBodies?.() ?? [])];
    const { state, event } = doorTick(s, dt, cfg, (a) => doorBlocked(o.hinge, o.yaw, a, o.length, bodies));
    setObjectState(o.id, { phase: state.phase, angle: state.angle, dir: state.dir, timer: state.timer });
    if (event === 'blocked') emitInteractEvent({ type: 'door.blocked', id: o.id, x: o.hinge.x, z: o.hinge.z });
    else if (event === 'closed') emitInteractEvent({ type: 'door.close', id: o.id, x: o.hinge.x, z: o.hinge.z, data: { settled: true } });
  });
}
