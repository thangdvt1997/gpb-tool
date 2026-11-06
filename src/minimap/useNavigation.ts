// Trạng thái chỉ đường: đích, tuyến, bật/tắt chỉ đường, tự đi (mặc định TẮT).
// - Lưới dựng lại có debounce khi vật cản / vùng đi lại đổi (signature của sources).
// - Tuyến tính lại có debounce khi lưới đổi hoặc nhân vật lệch khỏi tuyến.
// - Không di chuyển nhân vật trừ khi người dùng bật "Tự đi theo tuyến"; bấm phím di chuyển hoặc bấm vào cảnh thì tắt.

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { playerPose } from '../scene/controls/playerPose';
import { cancelWalkRequest, requestWalk } from '../scene/controls/walkRequest';
import {
  buildNavGrid,
  createDebouncer,
  findRoute,
  routeProgress,
  type MapItem,
  type NavGrid,
  type Rect,
  type RouteResult,
} from './core/index.js';
import type { MinimapSources } from './sources';

export const GRID_DEBOUNCE_MS = 300;
export const ROUTE_DEBOUNCE_MS = 150;
/** Lệch khỏi tuyến quá khoảng này (m) thì tính lại. */
export const OFF_ROUTE_M = 1.5;
/** Còn lại dưới khoảng này (m) thì coi là tới nơi. */
export const ARRIVE_M = 0.8;
const TICK_MS = 250;
const STALL_MS = 2000;

export interface Destination {
  /** Nhãn hiển thị: nhãn vật thể, hoặc "Điểm đã chọn trên bản đồ". */
  label: string;
  /** Mục trong dữ liệu (null nếu chọn điểm trên bản đồ). */
  item: MapItem | null;
  x: number;
  z: number;
  rect?: Rect;
}

export interface NavState {
  grid: NavGrid | null;
  dest: Destination | null;
  route: RouteResult | null;
  /** Tuyến đang chờ tính lại (lưới vừa đổi hoặc lệch tuyến). */
  stale: boolean;
  guidance: boolean;
  autoWalk: boolean;
  /** Lý do tự đi bị tắt gần nhất (để báo người dùng). */
  autoWalkStopped: string | null;
  remaining: number | null;
  arrived: boolean;
}

export interface NavApi extends NavState {
  setDestination: (d: Destination) => void;
  clearDestination: () => void;
  setGuidance: (on: boolean) => void;
  setAutoWalk: (on: boolean) => void;
  recomputeNow: () => void;
  /** Tuyến hiện tại cho vòng vẽ (không gây render). */
  routeRef: MutableRefObject<RouteResult | null>;
}

const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function useNavigation(sources: MinimapSources): NavApi {
  // Lưới: dựng ngay lần đầu, sau đó debounce theo signature.
  const [gridSources, setGridSources] = useState(sources);
  const gridDebounce = useMemo(() => createDebouncer((s: MinimapSources) => setGridSources(s), GRID_DEBOUNCE_MS), []);
  useEffect(() => {
    if (sources.signature !== gridSources.signature) gridDebounce.call(sources);
  }, [sources, gridSources.signature, gridDebounce]);
  useEffect(() => () => gridDebounce.cancel(), [gridDebounce]);

  const grid = useMemo<NavGrid | null>(() => {
    if (gridSources.walkRects.length === 0) return null;
    return buildNavGrid({
      walkRects: gridSources.walkRects,
      obstacles: gridSources.obstacles,
      radius: gridSources.radius,
      cellSize: 0.2,
    });
  }, [gridSources]);

  const [dest, setDest] = useState<Destination | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeGrid, setRouteGrid] = useState<NavGrid | null>(null);
  const [offRouteStale, setOffRouteStale] = useState(false);
  const [guidance, setGuidance] = useState(true);
  const [autoWalk, setAutoWalkState] = useState(false);
  const [autoWalkStopped, setAutoWalkStopped] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [arrived, setArrived] = useState(false);

  const routeRef = useRef<RouteResult | null>(null);
  const destRef = useRef<Destination | null>(null);
  const gridRef = useRef<NavGrid | null>(grid);
  destRef.current = dest;
  gridRef.current = grid;

  const compute = useCallback(() => {
    const g = gridRef.current;
    const d = destRef.current;
    setOffRouteStale(false);
    if (!g || !d) {
      routeRef.current = null;
      setRoute(null);
      setRouteGrid(g);
      return;
    }
    const r = findRoute(g, { x: playerPose.x, z: playerPose.z }, { x: d.x, z: d.z, rect: d.rect });
    routeRef.current = r;
    setRoute(r);
    setRouteGrid(g);
  }, []);
  const routeDebounce = useMemo(() => createDebouncer(compute, ROUTE_DEBOUNCE_MS), [compute]);
  useEffect(() => () => routeDebounce.cancel(), [routeDebounce]);

  // Lưới đổi (layout đổi): tính lại có debounce. Đổi đích: tính ngay.
  useEffect(() => {
    if (destRef.current) routeDebounce.call();
  }, [grid, routeDebounce]);
  useEffect(() => {
    routeDebounce.cancel();
    setArrived(false);
    compute();
  }, [dest, compute, routeDebounce]);

  const stopAuto = useCallback((reason: string | null) => {
    setAutoWalkState((on) => {
      if (on) {
        cancelWalkRequest();
        setAutoWalkStopped(reason);
      }
      return false;
    });
  }, []);

  const setAutoWalk = useCallback(
    (on: boolean) => {
      if (on) {
        setAutoWalkStopped(null);
        setAutoWalkState(true);
      } else stopAuto(null);
    },
    [stopAuto],
  );

  // Người dùng tự điều khiển (phím di chuyển, bấm vào cảnh 3D): tắt tự đi.
  useEffect(() => {
    if (!autoWalk) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (MOVE_CODES.has(e.code)) stopAuto('Đã tắt tự đi vì bạn bấm phím di chuyển.');
    };
    const onPointer = (e: PointerEvent) => {
      if (e.target instanceof HTMLCanvasElement && !e.target.closest('.mm-root')) {
        stopAuto('Đã tắt tự đi vì bạn bấm vào cảnh.');
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [autoWalk, stopAuto]);

  // Nhịp 250 ms: quãng còn lại, tới nơi, lệch tuyến, tự đi.
  const issued = useRef<{ route: RouteResult; index: number } | null>(null);
  const lastMove = useRef({ x: playerPose.x, z: playerPose.z, t: 0 });
  useEffect(() => {
    const id = window.setInterval(() => {
      const r = routeRef.current;
      if (!r || r.status !== 'ok' || r.points.length === 0) {
        setRemaining(null);
        setArrived(false);
        return;
      }
      const p = routeProgress(r.points, playerPose.x, playerPose.z);
      setRemaining((prev) => (prev !== null && Math.abs(prev - p.remaining) < 0.05 ? prev : p.remaining));
      const done = p.remaining < ARRIVE_M && p.offRoute < ARRIVE_M;
      setArrived(done);
      if (done) {
        stopAuto(null);
        return;
      }
      if (p.offRoute > OFF_ROUTE_M && !routeDebounce.pending) {
        setOffRouteStale(true);
        routeDebounce.call();
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [routeDebounce, stopAuto]);

  // Tự đi: chỉ khi bật. Gửi từng điểm gấp của tuyến cho Player qua walkRequest (đoạn thẳng đã kiểm tra clearance).
  useEffect(() => {
    if (!autoWalk) {
      issued.current = null;
      return undefined;
    }
    const now = () => performance.now();
    lastMove.current = { x: playerPose.x, z: playerPose.z, t: now() };
    const id = window.setInterval(() => {
      const r = routeRef.current;
      if (!r || r.status !== 'ok' || r.points.length < 2) return;
      const p = routeProgress(r.points, playerPose.x, playerPose.z);
      const index = Math.min(r.points.length - 1, p.segment + 1);
      const target = r.points[index];
      if (!issued.current || issued.current.route !== r || issued.current.index !== index) {
        issued.current = { route: r, index };
        requestWalk({
          x: target.x,
          z: target.z,
          facingYaw: null,
          // Tới điểm gấp: xóa dấu đã gửi, nhịp sau gửi điểm kế tiếp theo tiến độ trên tuyến.
          onArrive: () => {
            if (issued.current?.route === r && issued.current.index === index) issued.current = null;
          },
        });
      }
      // Không nhúc nhích quá STALL_MS: Player đã bỏ đích (bị chặn hoặc bị hủy). Tắt tự đi, không ép tiếp.
      const moved = Math.hypot(playerPose.x - lastMove.current.x, playerPose.z - lastMove.current.z);
      if (moved > 0.1) lastMove.current = { x: playerPose.x, z: playerPose.z, t: now() };
      else if (now() - lastMove.current.t > STALL_MS) stopAuto('Đã tắt tự đi vì nhân vật không tiến thêm được.');
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [autoWalk, stopAuto]);

  const setDestination = useCallback((d: Destination) => setDest(d), []);
  const clearDestination = useCallback(() => {
    stopAuto(null);
    setDest(null);
  }, [stopAuto]);

  return {
    grid,
    dest,
    route,
    stale: offRouteStale || (dest !== null && routeGrid !== grid),
    guidance,
    autoWalk,
    autoWalkStopped,
    remaining,
    arrived,
    setDestination,
    clearDestination,
    setGuidance,
    setAutoWalk,
    recomputeNow: compute,
    routeRef,
  };
}
