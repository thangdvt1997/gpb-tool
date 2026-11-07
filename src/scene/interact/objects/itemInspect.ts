import { subscribeObjectStates } from '../objectStates';
import { getCharacterState } from '../characterState';
import { holdPause } from '../../controls/session';
import { getHeldItem } from './smallItem';

/**
 * Chế độ "quan sát" đồ nhỏ đang cầm: vật được đưa ra trước camera và xoay bằng chuột kéo hoặc phím.
 * - Camera KHÔNG bị di chuyển: holdPause khóa nhân vật và đầu vào camera, nên thoát ra camera đúng chỗ cũ.
 * - Tự thoát khi vật không còn trên tay (đặt, trả, thả, mất lease).
 * Module thuần (không three): ItemMesh đọc getInspect mỗi khung, HUD dùng subscribeInspect.
 */
export interface InspectState {
  active: boolean;
  /** Góc xoay quanh trục đứng và trục ngang (rad). */
  yaw: number;
  pitch: number;
}

export const INSPECT_VIEW = { distance: 0.55, scale: 2.4, maxPitch: 1.4, keyRate: 2.2, dragRate: 0.012 } as const;

let state: InspectState = { active: false, yaw: 0, pitch: 0 };
let releaseHold: (() => void) | null = null;
let offStates: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit(next: InspectState): void {
  state = next;
  listeners.forEach((l) => l());
}

export function getInspect(): InspectState {
  return state;
}

export function subscribeInspect(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Bắt đầu quan sát: chỉ khi đang cầm vật (trạng thái nhân vật 'holding'). */
export function startInspect(): boolean {
  if (state.active) return true;
  if (getHeldItem() === null || getCharacterState() !== 'holding') return false;
  releaseHold = holdPause('item-inspect');
  offStates = subscribeObjectStates(() => {
    if (state.active && getHeldItem() === null) stopInspect();
  });
  emit({ active: true, yaw: 0, pitch: 0 });
  return true;
}

export function stopInspect(): void {
  if (!state.active) return;
  releaseHold?.();
  releaseHold = null;
  offStates?.();
  offStates = null;
  emit({ active: false, yaw: 0, pitch: 0 });
}

export function toggleInspect(): boolean {
  if (state.active) {
    stopInspect();
    return false;
  }
  return startInspect();
}

function wrap(a: number): number {
  const t = Math.PI * 2;
  return ((((a + Math.PI) % t) + t) % t) - Math.PI;
}

/** Xoay thêm (rad). Chỉ có tác dụng khi đang quan sát. */
export function rotateInspect(dYaw: number, dPitch: number): void {
  if (!state.active) return;
  const pitch = Math.min(INSPECT_VIEW.maxPitch, Math.max(-INSPECT_VIEW.maxPitch, state.pitch + dPitch));
  emit({ active: true, yaw: wrap(state.yaw + dYaw), pitch });
}

/** Phím xoay: mũi tên và WASD. Trả hướng (-1/0/1) trên hai trục, null nếu không phải phím xoay. */
export function inspectKeyAxis(code: string): { yaw: number; pitch: number } | null {
  switch (code) {
    case 'ArrowLeft':
    case 'KeyA':
      return { yaw: -1, pitch: 0 };
    case 'ArrowRight':
    case 'KeyD':
      return { yaw: 1, pitch: 0 };
    case 'ArrowUp':
    case 'KeyW':
      return { yaw: 0, pitch: -1 };
    case 'ArrowDown':
    case 'KeyS':
      return { yaw: 0, pitch: 1 };
    default:
      return null;
  }
}

/** Vị trí đặt vật trước camera: cách `distance` theo hướng nhìn (dir đã chuẩn hóa). */
export function inspectAnchor(
  cam: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  distance: number = INSPECT_VIEW.distance,
): { x: number; y: number; z: number } {
  return { x: cam.x + dir.x * distance, y: cam.y + dir.y * distance, z: cam.z + dir.z * distance };
}
