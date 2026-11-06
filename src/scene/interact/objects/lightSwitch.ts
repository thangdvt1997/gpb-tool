import { useSyncExternalStore } from 'react';
import type { InteractableDef, Footprint, InteractPoint } from '../registry';
import { getObjectState, setObjectState, subscribeObjectStates } from '../objectStates';
import { emitInteractEvent } from './interactEvents';

/**
 * Công tắc đèn theo nhóm/vùng. Trạng thái nhóm lưu ở objectStates id `lightgroup:<nhóm>` ({on}),
 * nên được lưu/đặt lại cùng các vật khác. Hệ đèn nghe bằng một trong ba cách:
 * isLightGroupOn(group), useLightGroup(group), hoặc sự kiện 'light.switch' (data.group, data.on).
 * Mặc định mọi nhóm bật.
 */
export const lightGroupId = (group: string) => `lightgroup:${group}`;

export function isLightGroupOn(group: string): boolean {
  return getObjectState(lightGroupId(group)).on !== false;
}

export function setLightGroup(group: string, on: boolean): void {
  setObjectState(lightGroupId(group), { on });
}

export function toggleLightGroup(group: string): boolean {
  const on = !isLightGroupOn(group);
  setLightGroup(group, on);
  return on;
}

export function useLightGroup(group: string): boolean {
  const id = lightGroupId(group);
  return useSyncExternalStore(
    (cb) => subscribeObjectStates((c) => (c === null || c === id) && cb()),
    () => isLightGroupOn(group),
    () => isLightGroupOn(group),
  );
}

/** Mức sáng đích (0..1) của một đèn thuộc nhóm; component damp theo giá trị này. */
export function lightTarget(on: boolean, base = 1): number {
  return on ? base : 0;
}

export interface SwitchOptions {
  id: string;
  label?: string;
  /** Nhóm đèn điều khiển (có thể nhiều). */
  groups: readonly string[];
  footprint: Footprint;
  point?: InteractPoint;
  baseY?: number;
}

export function switchInteractable(o: SwitchOptions): InteractableDef {
  const at = { x: o.footprint.cx, z: o.footprint.cz };
  const allOn = () => o.groups.every(isLightGroupOn);
  return {
    id: o.id,
    kind: 'switch',
    label: o.label ?? 'Công tắc đèn',
    footprint: o.footprint,
    baseY: o.baseY ?? 1.0,
    height: 0.25,
    point: o.point,
    maxDistance: 1.4,
    // Trạng thái công tắc phản ánh nhóm, để gợi ý cập nhật khi công tắc khác đổi cùng nhóm.
    defaultState: { on: true },
    actions: [
      {
        id: 'toggle',
        label: () => (allOn() ? 'Tắt đèn' : 'Bật đèn'),
        run: () => {
          const on = !allOn();
          for (const g of o.groups) {
            setLightGroup(g, on);
            emitInteractEvent({ type: 'light.switch', id: o.id, ...at, data: { group: g, on } });
          }
          setObjectState(o.id, { on });
        },
      },
    ],
  };
}
