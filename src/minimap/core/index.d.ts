// Kiểu TypeScript cho lõi JS thuần (src/minimap/core/*.js). Giữ khớp với các file .js cùng thư mục.

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export interface XZ {
  x: number;
  z: number;
}
export interface UV {
  u: number;
  v: number;
}

// geometry.js
export const EPS: number;
export function rectArea(r: Rect): number;
export function overlapArea(a: Rect, b: Rect): number;
export function inflateRect(r: Rect, m: number): Rect;
export function rectFromCenter(cx: number, cz: number, w: number, d: number): Rect;
export function distPointRect(x: number, z: number, r: Rect): number;
export function pointInRects(x: number, z: number, rects: readonly Rect[], eps?: number): boolean;
export function squareCovered(cx: number, cz: number, half: number, rects: readonly Rect[]): boolean;
export const CLEAR_TOL: number;
export function circleCovered(cx: number, cz: number, radius: number, rects: readonly Rect[]): boolean;
export function distSegmentRect(ax: number, az: number, bx: number, bz: number, r: Rect): number;
export function rectsBounds(rects: readonly Rect[]): Rect;
export function polygonBounds(points: ReadonlyArray<readonly [number, number]>): Rect;
export function segmentIntersectsRect(ax: number, az: number, bx: number, bz: number, r: Rect): boolean;
export function polylineLength(points: readonly XZ[]): number;

// transform.js
export type MapMode = 'north' | 'heading';
export interface MapTransform {
  bounds: Rect;
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  worldToMap(x: number, z: number): UV;
  mapToWorld(u: number, v: number): XZ;
}
export interface ViewTransform {
  center: XZ;
  scale: number;
  width: number;
  height: number;
  rotation: number;
  worldToMap(x: number, z: number): UV;
  mapToWorld(u: number, v: number): XZ;
}
export function wrapAngle(a: number): number;
export function createMapTransform(opts: { bounds: Rect; width: number; height: number; padding?: number }): MapTransform;
export function headingAngle(yaw: number): number;
export function mapRotation(mode: MapMode, yaw: number): number;
export function iconAngle(mode: MapMode, yaw: number): number;
export function northAngle(mode: MapMode, yaw: number): number;
export function createViewTransform(opts: {
  center: XZ;
  scale: number;
  width: number;
  height: number;
  rotation?: number;
}): ViewTransform;

// navgrid.js
export interface NavGrid {
  originX: number;
  originZ: number;
  cols: number;
  rows: number;
  cellSize: number;
  radius: number;
  walk: Uint8Array;
  /** Ô khe hẹp: điểm đứng được thay cho tâm ô. */
  anchors: Map<number, XZ>;
  walkRects: Rect[];
  obstacles: Rect[];
  bounds: Rect;
}
export type RouteStatus = 'ok' | 'start_blocked' | 'goal_blocked' | 'unreachable';
export interface RouteResult {
  status: RouteStatus;
  points: XZ[];
  length: number;
  startSnapped: boolean;
  goalSnapped: boolean;
  goal: XZ | null;
}
export interface Destination extends XZ {
  rect?: Rect;
}
export function buildNavGrid(input: {
  walkRects: readonly Rect[];
  obstacles?: readonly Rect[];
  radius: number;
  cellSize?: number;
}): NavGrid;
export function cellIndexAt(grid: NavGrid, x: number, z: number): number;
export function cellCenter(grid: NavGrid, idx: number): XZ;
export function isPointClear(grid: NavGrid, x: number, z: number): boolean;
export function segmentClear(grid: NavGrid, a: XZ, b: XZ): boolean;
export function astar(grid: NavGrid, start: number, goal: number): number[] | null;
export function costField(grid: NavGrid, start: number): Float64Array;
export function nearestWalkable(grid: NavGrid, x: number, z: number, maxDist: number): number;
export function smoothPath(grid: NavGrid, points: readonly XZ[]): XZ[];
export function findRoute(
  grid: NavGrid,
  start: XZ,
  dest: Destination,
  opts?: { startSnap?: number; goalSnap?: number },
): RouteResult;
export function routeProgress(points: readonly XZ[], x: number, z: number): { remaining: number; offRoute: number; segment: number };

// search.js
export interface MapItem {
  id: string;
  label: string;
  kind: string;
  category?: MapCategory;
  squad?: string;
  capacity?: number;
  rect: Rect;
  center: XZ;
  isEntrance?: boolean;
}
export interface SearchEntry {
  item: MapItem;
  id: string;
  idRaw: string;
  label: string;
  squad: string;
}
export function normalizeText(s: unknown): string;
export function buildSearchIndex(items: readonly MapItem[]): SearchEntry[];
export function searchIndex(index: readonly SearchEntry[], query: string, limit?: number): MapItem[];

// debounce.js
export interface Debouncer<A extends unknown[]> {
  call(...args: A): void;
  flush(): void;
  cancel(): void;
  readonly pending: boolean;
}
export function createDebouncer<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout },
): Debouncer<A>;

// mapModel.js
export type MapCategory = 'room' | 'desk' | 'core' | 'door' | 'gate' | 'amenity' | 'reserved' | 'fixture';
export interface MapModel {
  bounds: Rect;
  polygon: ReadonlyArray<readonly [number, number]>;
  floor: readonly Rect[];
  walls: readonly Rect[];
  items: Array<MapItem & { category: MapCategory }>;
  doors: Array<MapItem & { category: MapCategory }>;
  walkable: Rect[];
}
export function categoryOfKind(kind: string): MapCategory;
export function walkableRects(grid: NavGrid): Rect[];
export function buildMapModel(input: {
  polygon: ReadonlyArray<readonly [number, number]>;
  floor: readonly Rect[];
  walls?: readonly Rect[];
  items?: readonly MapItem[];
  grid?: NavGrid | null;
}): MapModel;

// autowalk.js
export type AutoWalkStopReason = 'key' | 'scene' | 'stall' | 'arrived' | 'no_route';
export interface AutoWalkState {
  issuedRoute: RouteResult | null;
  issuedIndex: number;
  lastX: number;
  lastZ: number;
  lastMoveAt: number;
}
export type AutoWalkAction =
  | { type: 'none' }
  | { type: 'walk'; x: number; z: number; index: number }
  | { type: 'stop'; reason: AutoWalkStopReason };
export const STALL_MOVE_M: number;
export const STALL_MS: number;
export const AUTOWALK_ARRIVE_M: number;
export const MOVE_CODES: ReadonlySet<string>;
export const STOP_TEXT: Record<AutoWalkStopReason, string | null>;
export function createAutoWalk(pos: XZ, now: number): AutoWalkState;
export function isMoveKey(code: string): boolean;
export function isSceneClick(o: { isCanvas: boolean; insideMinimap: boolean }): boolean;
export function markArrivedAtPoint(state: AutoWalkState, route: RouteResult, index: number): void;
export function stepAutoWalk(state: AutoWalkState, input: { route: RouteResult | null; x: number; z: number; now: number }): AutoWalkAction;
