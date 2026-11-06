import { getCharacterState, type CharacterState } from './characterState';
import {
  getObjectState,
  setObjectDefaults,
  setObjectState,
  subscribeObjectStates,
  type ObjectState,
  type ObjectStatePatch,
} from './objectStates';

/**
 * Sổ đăng ký vật tương tác: nơi duy nhất khai báo vật nào dùng được, dùng thế nào.
 * Không gắn logic lên từng mesh: mesh chỉ đọc trạng thái (getObjectState/useObjectState) để vẽ.
 *
 * Hai lớp:
 * - base: vật mặc định của khu (InteractTracker tạo từ it.json, hành động "Sử dụng" mở panel cũ).
 * - custom: registerInteractable từ giai đoạn sau. Cùng id thì custom thắng base.
 * Đơn vị: mét, radian, theo quy ước playerPose (hướng nhìn = (sin yaw, cos yaw)).
 */

/** Footprint trên sàn, hình chữ nhật thẳng trục: tâm (cx, cz), nửa cạnh (hx, hz). */
export interface Footprint {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
}

/** Điểm tương tác: chỗ nhân vật đứng/ngồi và hướng nhìn khi dùng vật. */
export interface InteractPoint {
  x: number;
  z: number;
  yaw: number;
}

export interface InteractContext {
  id: string;
  def: InteractableDef;
  state: ObjectState;
  character: CharacterState;
  /** Gộp patch vào trạng thái vật này (tắt cho setObjectState(id, ...)). */
  setState: (patch: ObjectStatePatch) => void;
}

export interface InteractAction {
  /** id duy nhất trong vật, ví dụ 'open', 'close', 'sit'. */
  id: string;
  /** Nhãn tiếng Việt cho gợi ý và menu, ví dụ 'Mở cửa'. Hàm thì tính theo trạng thái. */
  label: string | ((ctx: InteractContext) => string);
  /** Điều kiện theo trạng thái. Bỏ trống = luôn dùng được. */
  when?: (ctx: InteractContext) => boolean;
  run: (ctx: InteractContext) => void;
}

export interface InteractableDef {
  id: string;
  /** Loại vật: 'door', 'chair', 'computer', 'drawer', 'switch', 'tv', 'small_item', 'zone'... */
  kind: string;
  label: string;
  /** Footprint dùng đo khoảng cách, hướng nhìn và viền sáng. Bỏ trống thì dùng point (bán kính 0,25 m). */
  footprint?: Footprint;
  /** Đáy và chiều cao (m) cho viền sáng. Mặc định 0 và 1. */
  baseY?: number;
  height?: number;
  /** Khoảng cách tối đa (m) từ tâm nhân vật tới mép gần nhất. Mặc định INTERACT.range. */
  maxDistance?: number;
  /** Độ lệch hướng nhìn tối đa (rad). Mặc định INTERACT.maxAngle. */
  maxAngle?: number;
  point?: InteractPoint;
  actions: readonly InteractAction[];
  /** Trạng thái mặc định, ghi vào objectStates khi đăng ký. */
  defaultState?: ObjectStatePatch;
  /** false (hoặc hàm trả false) thì bỏ qua khi chọn. */
  enabled?: boolean | ((ctx: InteractContext) => boolean);
  /** Cộng ưu tiên khi hai vật sát nhau (m). Mặc định 0. */
  priority?: number;
  /** Chặn tầm nhìn tới vật khác (tường, bàn, phòng kính). Mặc định false. */
  occludes?: boolean;
}

/** Hành động đã tính nhãn, dùng cho gợi ý và menu. */
export interface ResolvedAction {
  id: string;
  label: string;
}

const base = new Map<string, InteractableDef>();
const custom = new Map<string, InteractableDef>();
let resolved: InteractableDef[] = [];
let version = 0;
const listeners = new Set<() => void>();

function rebuild(): void {
  const out: InteractableDef[] = [];
  base.forEach((d, id) => {
    if (!custom.has(id)) out.push(d);
  });
  custom.forEach((d) => out.push(d));
  resolved = out;
  version++;
  listeners.forEach((l) => l());
}

function add(map: Map<string, InteractableDef>, def: InteractableDef): () => void {
  if (def.defaultState) setObjectDefaults(def.id, def.defaultState);
  map.set(def.id, def);
  rebuild();
  return () => {
    // Chỉ gỡ nếu chưa bị đăng ký khác thay thế.
    if (map.get(def.id) === def) {
      map.delete(def.id);
      rebuild();
    }
  };
}

/**
 * Đăng ký vật tương tác. Cùng id đăng ký lại thì bản mới thay bản cũ.
 * Trả hàm hủy đăng ký (dùng làm cleanup của useEffect).
 */
export function registerInteractable(def: InteractableDef): () => void {
  return add(custom, def);
}

/** Lớp base: chỉ InteractTracker dùng cho vật mặc định của khu. */
export function registerBaseInteractable(def: InteractableDef): () => void {
  return add(base, def);
}

export function getInteractable(id: string): InteractableDef | undefined {
  return custom.get(id) ?? base.get(id);
}

/** Danh sách đã gộp (custom thắng base). Mảng giữ nguyên tham chiếu tới lần đổi sau. */
export function listInteractables(): readonly InteractableDef[] {
  return resolved;
}

export function registryVersion(): number {
  return version;
}

export function subscribeRegistry(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function contextOf(def: InteractableDef): InteractContext {
  return {
    id: def.id,
    def,
    state: getObjectState(def.id),
    character: getCharacterState(),
    setState: (patch) => setObjectState(def.id, patch),
  };
}

export function isEnabled(def: InteractableDef, ctx: InteractContext): boolean {
  const e = def.enabled;
  return e === undefined ? true : typeof e === 'function' ? e(ctx) : e;
}

/** Các hành động thỏa điều kiện hiện tại, theo thứ tự khai báo. Hành động đầu là hành động chính. */
export function availableActions(def: InteractableDef, ctx: InteractContext = contextOf(def)): InteractAction[] {
  return def.actions.filter((a) => (a.when ? a.when(ctx) : true));
}

export function actionLabel(a: InteractAction, ctx: InteractContext): string {
  return typeof a.label === 'function' ? a.label(ctx) : a.label;
}

/**
 * Nghe mọi thay đổi có thể làm đổi gợi ý: đăng ký vật hoặc trạng thái vật.
 * Trả hàm hủy.
 */
export function subscribe(cb: () => void): () => void {
  const a = subscribeRegistry(cb);
  const b = subscribeObjectStates(() => cb());
  return () => {
    a();
    b();
  };
}
