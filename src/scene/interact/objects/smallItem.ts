import type { InteractableDef, Footprint } from '../registry';
import { getObjectState, setObjectState, type ObjectState } from '../objectStates';
import { transitionCharacter, getCharacterState } from '../characterState';
import { emitInteractEvent } from './interactEvents';

/**
 * Đồ nhỏ (điện thoại, cốc, sách, bình nước): nhặt, cầm, đặt lại trên mặt phẳng hợp lệ, trả về chỗ cũ.
 * - Giới hạn một vật trên tay (getHeldItem quét các vật đã đăng ký).
 * - Đặt: validatePlacement kiểm tra nằm trọn trên mặt đặt (ổn định) và không chồng vật khác.
 * - Thả rơi: dropLanding chọn nơi hạ cánh (mặt đặt hợp lệ hoặc sàn trống), fallStep là rơi tự do theo trọng lực.
 * - Xem trước đặt: evaluatePlacement dùng chung cho hành động và hình xem trước xanh/đỏ (PlacePreview).
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

export interface PlacementEval {
  x: number;
  z: number;
  r: number;
  yaw: number;
  /** Cao độ mặt đặt được xét (để vẽ xem trước cả khi bị chặn). */
  surfaceY: number;
  res: PlaceResult;
}

/** Một nguồn sự thật cho "đặt ở đâu và có hợp lệ không": hành động Đặt xuống và hình xem trước cùng gọi hàm này. */
export function evaluatePlacement(
  player: { x: number; z: number; yaw: number },
  surface: Surface,
  r: number,
  allSurfaces: readonly Surface[],
  others: readonly Placed[],
): PlacementEval {
  const want = placementSpot(player);
  const snapped = snapToSurface(want.x, want.z, r, surface);
  return { x: snapped.x, z: snapped.z, r, yaw: player.yaw, surfaceY: surface.y, res: validatePlacement(snapped.x, snapped.z, r, allSurfaces, others) };
}

export const GRAVITY = 9.8;

export type DropResult =
  | { ok: true; x: number; y: number; z: number; onSurface: boolean }
  | { ok: false; reason: 'blocked' };

/**
 * Thả tự do tại (x,z): rơi xuống mặt đặt hợp lệ nếu có, ngược lại rơi xuống sàn (y=0) khi chỗ đó không bị chặn
 * (tường, đồ nội thất) và không đè lên đồ đã đặt trên sàn.
 */
export function dropLanding(
  x: number,
  z: number,
  r: number,
  surfaces: readonly Surface[],
  others: readonly Placed[],
  floorBlocked: (x: number, z: number) => boolean,
): DropResult {
  const onSurface = validatePlacement(x, z, r, surfaces, others);
  if (onSurface.ok) return { ok: true, x, y: onSurface.y, z, onSurface: true };
  if (surfaces.some((s) => x + r > s.minX && x - r < s.maxX && z + r > s.minZ && z - r < s.maxZ)) return { ok: false, reason: 'blocked' };
  if (floorBlocked(x, z) || others.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r)) return { ok: false, reason: 'blocked' };
  return { ok: true, x, y: 0, z, onSurface: false };
}

/** Một bước rơi tự do: trả độ cao và vận tốc mới; chạm đích thì dừng (landed). */
export function fallStep(y: number, vy: number, targetY: number, dt: number): { y: number; vy: number; landed: boolean } {
  if (y <= targetY) return { y: targetY, vy: 0, landed: true };
  const v = vy - GRAVITY * dt;
  const ny = y + v * dt;
  return ny <= targetY ? { y: targetY, vy: 0, landed: true } : { y: ny, vy: v, landed: false };
}

/** Bộ đánh giá xem trước theo id mặt đặt (đăng ký khi tạo surfaceInteractable). Trả null nếu không cầm gì. */
const previewers = new Map<string, () => PlacementEval | null>();
export function placementPreviewFor(surfaceId: string): PlacementEval | null {
  return previewers.get(surfaceId)?.() ?? null;
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
  /** (x,z) trên sàn có bị chặn (tường, nội thất) không; dùng cho hành động Thả rơi. Mặc định: không chặn. */
  floorBlocked?: (x: number, z: number) => boolean;
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
  previewers.set(o.id, () => {
    const id = getHeldItem();
    const info = id ? o.itemInfo(id) : null;
    return id && info ? evaluatePlacement(o.getPlayer(), o.surface, info.r, o.allSurfaces?.() ?? [o.surface], others(id)) : null;
  });
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
          const ev = evaluatePlacement(o.getPlayer(), o.surface, info.r, o.allSurfaces?.() ?? [o.surface], others(id));
          if (!ev.res.ok) return emitInteractEvent({ type: 'item.denied', id, x: ev.x, z: ev.z, data: { reason: ev.res.reason } });
          placeItem(id, ev.x, ev.res.y, ev.z, ev.yaw);
          emitInteractEvent({ type: 'item.place', id, x: ev.x, z: ev.z });
        },
      },
      {
        id: 'drop',
        label: 'Thả rơi',
        when: holding,
        run: () => {
          const id = getHeldItem();
          const info = id ? o.itemInfo(id) : null;
          if (!id || !info) return;
          const pl = o.getPlayer();
          const at = placementSpot(pl, 0.5);
          const res = dropLanding(at.x, at.z, info.r, o.allSurfaces?.() ?? [o.surface], others(id), o.floorBlocked ?? (() => false));
          if (!res.ok) return emitInteractEvent({ type: 'item.denied', id, x: at.x, z: at.z, data: { reason: res.reason } });
          placeItem(id, res.x, res.y, res.z, pl.yaw);
          emitInteractEvent({ type: 'item.place', id, x: res.x, z: res.z, data: { dropped: true } });
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
