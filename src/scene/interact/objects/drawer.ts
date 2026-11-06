import type { InteractableDef, Footprint } from '../registry';
import { getObjectState, setObjectState, type ObjectState } from '../objectStates';
import { emitInteractEvent } from './interactEvents';

/**
 * Ngăn kéo: mỗi ngăn là một vật riêng (id `${cabinetId}:d${i}`), trạng thái { open, locked }.
 * Mỗi tủ chỉ một ngăn mở một lúc (mở ngăn mới thì đóng ngăn đang mở: tránh lật tủ).
 * Hành trình trượt (m) nằm ở cấu hình hình học, component tự damp theo open.
 */
export interface DrawerState {
  open: boolean;
  locked: boolean;
}

export function drawerOf(s: ObjectState): DrawerState {
  return { open: s.open === true, locked: s.locked === true };
}

export const drawerId = (cabinetId: string, i: number) => `${cabinetId}:d${i}`;

/**
 * Kế hoạch bấm một ngăn: trả patch cho các ngăn bị đổi, hoặc denied nếu khóa.
 * Đang mở -> đóng. Đang đóng -> mở và đóng mọi ngăn khác trong tủ.
 */
export function planDrawerToggle(
  siblings: readonly ({ id: string } & DrawerState)[],
  index: number,
): { denied: boolean; patches: Record<string, Partial<DrawerState>> } {
  const me = siblings[index];
  if (!me) return { denied: true, patches: {} };
  if (me.locked) return { denied: true, patches: {} };
  if (me.open) return { denied: false, patches: { [me.id]: { open: false } } };
  const patches: Record<string, Partial<DrawerState>> = { [me.id]: { open: true } };
  for (const s of siblings) if (s.id !== me.id && s.open) patches[s.id] = { open: false };
  return { denied: false, patches };
}

/** Vị trí trượt (m) từ tỷ lệ 0..1 và hành trình, kẹp trong giới hạn ray. */
export function drawerOffset(t: number, travel: number): number {
  return Math.min(Math.max(t, 0), 1) * travel;
}

export interface DrawerCabinetOptions {
  id: string;
  label?: string;
  count: number;
  footprint: Footprint;
  /** Chỉ số ngăn khóa mặc định. */
  locked?: readonly number[];
  at: { x: number; z: number };
  /** Footprint riêng từng ngăn (mặc định dùng chung của tủ). */
  yaw: number;
}

export function drawerInteractables(o: DrawerCabinetOptions): InteractableDef[] {
  const ids = Array.from({ length: o.count }, (_, i) => drawerId(o.id, i));
  const read = () => ids.map((id) => ({ id, ...drawerOf(getObjectState(id)) }));
  return ids.map((id, i) => ({
    id,
    kind: 'drawer',
    label: `${o.label ?? 'Ngăn kéo'} ${i + 1}`,
    footprint: o.footprint,
    baseY: 0.1 + (i * 0.7) / Math.max(o.count, 1),
    height: 0.7 / Math.max(o.count, 1),
    point: { x: o.at.x, z: o.at.z, yaw: o.yaw },
    // Ngăn thấp hơn ưu tiên thấp dần để chọn ổn định theo thứ tự.
    priority: -i * 0.01,
    defaultState: { open: false, locked: o.locked?.includes(i) ?? false },
    actions: [
      {
        id: 'toggle',
        label: (c) => (drawerOf(c.state).locked ? 'Ngăn kéo bị khóa' : drawerOf(c.state).open ? 'Đóng ngăn kéo' : 'Mở ngăn kéo'),
        run: () => {
          const plan = planDrawerToggle(read(), i);
          if (plan.denied) return emitInteractEvent({ type: 'drawer.locked', id, x: o.at.x, z: o.at.z });
          for (const [pid, patch] of Object.entries(plan.patches)) {
            setObjectState(pid, patch);
            emitInteractEvent({ type: patch.open ? 'drawer.open' : 'drawer.close', id: pid, x: o.at.x, z: o.at.z });
          }
        },
      },
    ],
  }));
}
