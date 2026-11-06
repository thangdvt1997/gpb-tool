import type { InteractableDef, Footprint } from '../registry';
import { getObjectState, setObjectState, type ObjectState } from '../objectStates';
import { transitionCharacter, getCharacterState } from '../characterState';
import { emitInteractEvent } from './interactEvents';

/**
 * Đồ nhỏ (điện thoại, cốc, sách, bình nước): nhặt, cầm, đặt lại trên mặt phẳng hợp lệ, trả về chỗ cũ.
 * - Giới hạn một vật trên tay (getHeldItem quét các vật đã đăng ký).
 * - Đặt: validatePlacement kiểm tra nằm trọn trên mặt đặt (ổn định) và không chồng vật khác.
 * - Vật lý thả rơi tự do chưa làm (xem docs, mục chưa kiểm chứng).
 */
export interface ItemState {
  /** 'home' = chỗ gốc, 'hand' = trên tay, 'placed' = đã đặt ở x,y,z. */
  where: 'home' | 'hand' | 'placed';
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface Surface {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Cao độ mặt phẳng (m). */
  y: number;
}

export interface Placed {
  id: string;
  x: number;
  z: number;
  r: number;
}

export type PlaceResult =
  | { ok: true; surface: Surface; y: number }
  | { ok: false; reason: 'no_surface' | 'overlap' };

export function itemOf(s: ObjectState, home: { x: number; y: number; z: number }): ItemState {
  const w = s.where === 'hand' || s.where === 'placed' ? s.where : 'home';
  return {
    where: w,
    x: typeof s.x === 'number' ? s.x : home.x,
    y: typeof s.y === 'number' ? s.y : home.y,
    z: typeof s.z === 'number' ? s.z : home.z,
    yaw: typeof s.yaw === 'number' ? s.yaw : 0,
  };
}

/** Điểm đặt trước mặt người chơi (reach m). Quy ước yaw: nhìn = (sin yaw, cos yaw). */
export function placementSpot(p: { x: number; z: number; yaw: number }, reach = 0.7): { x: number; z: number } {
  return { x: p.x + Math.sin(p.yaw) * reach, z: p.z + Math.cos(p.yaw) * reach };
}

/**
 * Đặt vật bán kính r tại (x,z): phải nằm TRỌN trong một mặt đặt (không nhô ra mép = không đổ),
 * và không chồng vật đã đặt (khoảng cách tâm >= r + r').
 */
export function validatePlacement(
  x: number,
  z: number,
  r: number,
  surfaces: readonly Surface[],
  others: readonly Placed[],
): PlaceResult {
  const surface = surfaces.find((s) => x - r >= s.minX && x + r <= s.maxX && z - r >= s.minZ && z + r <= s.maxZ);
  if (!surface) return { ok: false, reason: 'no_surface' };
  if (others.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r)) return { ok: false, reason: 'overlap' };
  return { ok: true, surface, y: surface.y };
}

/** Kẹp điểm vào trong mặt đặt gần nhất để xem trước vẫn hiển thị (đỏ nếu chồng). */
export function snapToSurface(x: number, z: number, r: number, s: Surface): { x: number; z: number } {
  return {
    x: Math.min(Math.max(x, s.minX + r), s.maxX - r),
    z: Math.min(Math.max(z, s.minZ + r), s.maxZ - r),
  };
}

// ---- Một vật trên tay ----
const itemIds = new Set<string>();

export function getHeldItem(): string | null {
  for (const id of itemIds) if (getObjectState(id).where === 'hand') return id;
  return null;
}

export function pickupItem(id: string, home: { x: number; y: number; z: number }): boolean {
  if (getHeldItem() !== null) return false;
  if (getCharacterState() !== 'walking') return false;
  if (!transitionCharacter('holding', id)) return false;
  setObjectState(id, { where: 'hand' });
  void home;
  return true;
}

/** Thả/đặt/trả xong thì về đi lại. */
function finishHold(): void {
  if (getCharacterState() === 'holding') transitionCharacter('walking', 'item');
}

export function placeItem(id: string, x: number, y: number, z: number, yaw: number): void {
  setObjectState(id, { where: 'placed', x, y, z, yaw });
  finishHold();
}

export function returnItem(id: string, home: { x: number; y: number; z: number }): void {
  setObjectState(id, { where: 'home', x: home.x, y: home.y, z: home.z, yaw: 0 });
  finishHold();
}

export interface ItemOptions {
  id: string;
  label: string;
  home: { x: number; y: number; z: number };
  radius?: number;
  footprint: Footprint;
}

export function itemInteractable(o: ItemOptions): InteractableDef {
  itemIds.add(o.id);
  const at = { x: o.home.x, z: o.home.z };
  return {
    id: o.id,
    kind: 'small_item',
    label: o.label,
    footprint: o.footprint,
    baseY: o.home.y,
    height: 0.25,
    maxDistance: 1.5,
    priority: 0.3,
    defaultState: { where: 'home', x: o.home.x, y: o.home.y, z: o.home.z, yaw: 0 },
    // Đồ đang cầm hoặc đã nhấc đi khỏi chỗ gốc thì không chọn ở chỗ gốc nữa (đặt xuống: chọn theo footprint mới nếu có).
    enabled: (c) => c.state.where !== 'hand' && getHeldItem() === null,
    actions: [
      {
        id: 'pickup',
        label: `Cầm ${o.label.toLowerCase()}`,
        when: () => getHeldItem() === null && getCharacterState() === 'walking',
        run: () => {
          if (pickupItem(o.id, o.home)) emitInteractEvent({ type: 'item.pickup', id: o.id, ...at });
          else emitInteractEvent({ type: 'item.denied', id: o.id, ...at });
        },
      },
    ],
  };
}

export interface SurfaceOptions {
  /** Id vật của mặt đặt (bàn, kệ). */
  id: string;
  label: string;
  surface: Surface;
  footprint: Footprint;
  getPlayer: () => { x: number; z: number; yaw: number };
  /** Bán kính và nhà của vật theo id (để kiểm tra chồng và trả về). */
  itemInfo: (itemId: string) => { r: number; home: { x: number; y: number; z: number } } | null;
  allSurfaces?: () => readonly Surface[];
}

/** Ưu tiên chọn mặt đặt: cầm đồ thì cao hơn máy in, ngăn kéo cùng chỗ; không cầm thì thấp. */
export const SURFACE_PRIORITY_HOLDING = 1;
export const SURFACE_PRIORITY_IDLE = -0.2;

/** Vật "mặt đặt": hành động Đặt xuống / Trả về chỗ cũ khi đang cầm đồ. */
export function surfaceInteractable(o: SurfaceOptions): InteractableDef {
  const holding = () => getHeldItem() !== null;
  const others = (exceptId: string): Placed[] => {
    const out: Placed[] = [];
    for (const id of itemIds) {
      if (id === exceptId) continue;
      const info = o.itemInfo(id);
      const s = getObjectState(id);
      if (info && s.where === 'placed' && typeof s.x === 'number' && typeof s.z === 'number') out.push({ id, x: s.x, z: s.z, r: info.r });
    }
    return out;
  };
  return {
    id: o.id,
    kind: 'surface',
    label: o.label,
    footprint: o.footprint,
    baseY: o.surface.y - 0.05,
    height: 0.1,
    // Mặt đặt nằm chung chỗ với vật khác (máy in, ngăn kéo trên tủ): khi đang cầm đồ thì "Đặt xuống" phải thắng,
    // nếu không người dùng không bao giờ đặt được. Không cầm thì nhường (getter đọc mỗi lần chọn vật).
    get priority() {
      return holding() ? SURFACE_PRIORITY_HOLDING : SURFACE_PRIORITY_IDLE;
    },
    actions: [
      {
        id: 'place',
        label: 'Đặt xuống',
        when: holding,
        run: () => {
          const id = getHeldItem();
          const info = id ? o.itemInfo(id) : null;
          if (!id || !info) return;
          const pl = o.getPlayer();
          const want = placementSpot(pl);
          const snapped = snapToSurface(want.x, want.z, info.r, o.surface);
          const res = validatePlacement(snapped.x, snapped.z, info.r, o.allSurfaces?.() ?? [o.surface], others(id));
          if (!res.ok) return emitInteractEvent({ type: 'item.denied', id, x: snapped.x, z: snapped.z, data: { reason: res.reason } });
          placeItem(id, snapped.x, res.y, snapped.z, pl.yaw);
          emitInteractEvent({ type: 'item.place', id, x: snapped.x, z: snapped.z });
        },
      },
      {
        id: 'return',
        label: 'Trả về chỗ cũ',
        when: holding,
        run: () => {
          const id = getHeldItem();
          const info = id ? o.itemInfo(id) : null;
          if (!id || !info) return;
          returnItem(id, info.home);
          emitInteractEvent({ type: 'item.return', id, x: info.home.x, z: info.home.z });
        },
      },
    ],
  };
}

/**
 * Đăng ký đồ nhỏ và tự đăng ký lại khi vật được đặt chỗ mới, để footprint (chọn vật) đi theo vị trí hiện tại.
 * Trả hàm hủy.
 */
export function registerItem(o: ItemOptions, register: (def: InteractableDef) => () => void, subscribeState: (cb: () => void) => () => void): () => void {
  let off = register(itemInteractable(o));
  let lastKey = '';
  const unsub = subscribeState(() => {
    const st = itemOf(getObjectState(o.id), o.home);
    const key = st.where === 'hand' ? 'hand' : `${st.x.toFixed(3)},${st.z.toFixed(3)}`;
    if (key === lastKey) return;
    lastKey = key;
    if (st.where === 'hand') return;
    const r = o.radius ?? 0.06;
    off();
    off = register(itemInteractable({ ...o, footprint: { cx: st.x, cz: st.z, hx: r, hz: r } }));
  });
  return () => {
    unsub();
    off();
  };
}

export function clearItemRegistry(): void {
  itemIds.clear();
}
