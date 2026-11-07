// Hook quan sát/điều khiển cho e2e nhiều người: window.__gpbWorld. Chỉ mount khi bật ?world=1 VÀ URL có debug=world hoặc debug=controls.
// Chỉ đọc trạng thái world, cộng sit(id)/stand() gọi hành động tương tác sẵn có (đi qua cầu nối lease).
import { useEffect, useRef } from 'react';
import { requestStand } from '../scene/controls/session';
import { contextOf, getInteractable, listInteractables } from '../scene/interact/registry';
import { getObjectState } from '../scene/interact/objectStates';
import { getCharacterState } from '../scene/interact/characterState';
import type { WorldApi } from './useWorld';

export interface WorldDebug {
  state: string;
  selfId: string | null;
  role: string;
  players: { id: string; name: string; x: number; z: number }[];
  chat: { from: string; text: string; channel: string; status: string }[];
  leases: { resource: string; ownerId: string | null }[];
  chairs: string[];
  character: string;
  occupant(chairId: string): string;
  sit(chairId: string): boolean;
  stand(): boolean;
  standViaAction(): boolean;
  /** Đóng WebSocket hiện tại (giả lập rớt mạng); client tự kết nối lại và resume. */
  dropSocket(): void;
}

export function debugWorldEnabled(search: string): boolean {
  // 'controls' đi kèm vì hook điều khiển (window.__gpbControls) chỉ bật khi debug đúng bằng 'controls'.
  const v = new URLSearchParams(search).get('debug');
  return v === 'world' || v === 'controls';
}

export function WorldDebugHook({ world }: { world: Pick<WorldApi, 'state' | 'client' | 'remote' | 'players' | 'leases' | 'chat' | 'role'> }) {
  const ref = useRef(world);
  ref.current = world;
  useEffect(() => {
    if (typeof window === 'undefined' || !debugWorldEnabled(window.location.search)) return undefined;
    const w = window as unknown as { __gpbWorld?: WorldDebug };
    const d: WorldDebug = {
      get state() { return ref.current.state; },
      get selfId() { return ref.current.client.current?.selfId ?? null; },
      get role() { return ref.current.role; },
      get players() {
        const r = ref.current.remote;
        return r.ids().map((id) => {
          const s = r.sampleNow(id, Date.now());
          return { id, name: r.nameOf(id), x: s?.x ?? NaN, z: s?.z ?? NaN };
        });
      },
      get chat() { return ref.current.chat.map((c) => ({ from: c.from.name, text: c.text, channel: c.channel, status: c.status })); },
      get leases() { return Object.values(ref.current.leases).map((l) => ({ resource: l.resource, ownerId: l.ownerId })); },
      get chairs() { return listInteractables().filter((i) => i.kind === 'chair').map((i) => i.id); },
      get character() { return getCharacterState(); },
      occupant: (id) => String(getObjectState(id).occupant ?? ''),
      sit(id) {
        const def = getInteractable(id);
        const a = def?.actions.find((x) => x.id === 'sit');
        if (!def || !a) return false;
        a.run(contextOf(def));
        return true;
      },
      stand() {
        requestStand();
        return true;
      },
      standViaAction() {
        for (const def of listInteractables()) {
          const a = def.kind === 'chair' ? def.actions.find((x) => x.id === 'stand') : undefined;
          if (a && getObjectState(def.id).occupant) { a.run(contextOf(def)); return true; }
        }
        return false;
      },
      dropSocket() {
        const c = ref.current.client.current as unknown as { sock?: { close(code?: number, reason?: string): void } | null } | null;
        c?.sock?.close(4000, 'e2e drop');
      },
    };
    w.__gpbWorld = d;
    return () => { delete w.__gpbWorld; };
  }, []);
  return null;
}
