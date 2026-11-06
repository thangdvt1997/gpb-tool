// Minimap góc màn hình + bản đồ lớn có tìm kiếm và chỉ đường. Xem docs/design/MINIMAP.md.
//
// Dữ liệu: buildMinimapSources (cùng nguồn với cảnh 3D). Vị trí và hướng nhân vật: playerPose (chỉ đọc).
// Không tự di chuyển nhân vật trừ khi người dùng bật "Tự đi theo tuyến".

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import type { Role, ZoneDef } from '../content/types';
import { useLayout } from '../layout/LayoutStore';
import { playerPose } from '../scene/controls/playerPose';
import { isTypingTarget } from '../scene/controls/useGtaControls';
import {
  buildMapModel,
  buildSearchIndex,
  createMapTransform,
  createViewTransform,
  iconAngle,
  mapRotation,
  northAngle,
  searchIndex,
  type MapCategory,
  type MapItem,
  type MapMode,
  type MapModel,
  type RouteResult,
} from './core/index.js';
import { drawMap } from './draw';
import { handleTrapKey } from './focusTrap';
import { buildMinimapSources } from './sources';
import { useNavigation, type Destination, type NavApi } from './useNavigation';
import './minimap.css';

/** Pixel trên mét của minimap theo mức zoom. */
const MINI_ZOOM = [3, 5, 8, 12] as const;
/** Hệ số zoom của bản đồ lớn so với mức vừa khung. */
const BIG_ZOOM = [1, 1.5, 2.5, 4] as const;
/** Phím di chuyển không được lọt xuống điều khiển nhân vật khi đang thao tác trong bản đồ lớn. */
const BLOCKED_CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyE',
  'KeyV',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

const CATEGORY_LABEL: Record<MapCategory, string> = {
  room: 'Phòng',
  desk: 'Khối bàn',
  core: 'Thang',
  door: 'Cửa',
  gate: 'Cổng an ninh',
  amenity: 'Tiện ích',
  reserved: 'Dự phòng',
  fixture: 'Khác',
};

const STATUS_TEXT: Record<Exclude<RouteResult['status'], 'ok'>, string> = {
  start_blocked:
    'Không xác định được chỗ đứng hợp lệ của bạn trên lưới đi lại (đang ở ngoài khu chữ L hoặc sát vật cản quá 1 m).',
  goal_blocked:
    'Đích nằm ngoài khu văn phòng chữ L hoặc bị vật cản che kín: không có chỗ đứng nào trong 1,5 m quanh đích.',
  unreachable:
    'Có chỗ đứng gần đích nhưng không nối được tới vị trí của bạn: lối đi bị chặn (đồ đạc, cửa) hoặc khe hẹp hơn 0,7 m.',
};

function formatDistance(m: number): string {
  return m < 10 ? `${m.toFixed(1).replace('.', ',')} m` : `${Math.round(m)} m`;
}

/** Kích thước CSS của phần tử, cập nhật theo ResizeObserver. */
function useElementSize(ref: RefObject<HTMLElement>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function prepareCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.max(1, Math.round(w * dpr));
  const ph = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export interface MinimapProps {
  zone: ZoneDef;
  role?: Role;
  /** Phải khớp tham số cây của ITOffice (theme !== 'none'), để vật cản khớp cảnh. Mặc định false (theme 'none'). */
  plants?: boolean;
  /**
   * Áp vị trí bố cục (useLayout) cho vật di chuyển được. Mặc định false vì ITOffice hiện chưa áp bố cục vào
   * va chạm; bật khi cảnh đã dùng cùng bố cục, để minimap không lệch cảnh.
   */
  applyLayout?: boolean;
}

export function Minimap({ zone, role, plants = false, applyLayout = false }: MinimapProps) {
  const layout = useLayout();
  const layoutKey = applyLayout && layout.loaded ? layout.version : -1;
  const poseOf = layoutKey >= 0 ? layout.poseOf : undefined;
  const sources = useMemo(
    () => buildMinimapSources({ zone, role, plants, poseOf }),
    // layoutKey đổi khi bố cục đổi phiên bản; poseOf đọc snapshot mới nhất.
    [zone, role, plants, layoutKey],
  );
  const nav = useNavigation(sources);
  const model = useMemo(
    () =>
      buildMapModel({
        polygon: sources.polygon,
        floor: sources.walkRects,
        walls: sources.walls,
        items: sources.items,
        grid: nav.grid,
      }),
    [sources, nav.grid],
  );
  const index = useMemo(() => buildSearchIndex(sources.items), [sources.items]);

  const [mode, setMode] = useState<MapMode>('north');
  const [zoom, setZoom] = useState(1);
  const [open, setOpen] = useState(false);
  const openBtn = useRef<HTMLButtonElement>(null);
  /** Phần tử đang focus trước khi mở hộp thoại, để trả focus khi đóng. */
  const returnFocus = useRef<HTMLElement | null>(null);

  // Phím M mở / đóng bản đồ lớn (bỏ qua khi đang gõ).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyM' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      setOpen((v) => {
        if (!v) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        return !v;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    // Trả focus về nơi đã mở hộp (nút Bản đồ, hoặc phần tử đang focus lúc bấm M); nếu đã biến mất thì về nút Bản đồ.
    const back = returnFocus.current;
    returnFocus.current = null;
    if (back && back.isConnected) back.focus();
    else openBtn.current?.focus();
  }, []);

  return (
    <div className="mm-root">
      <MiniCanvas model={model} nav={nav} mode={mode} scale={MINI_ZOOM[zoom]} />
      <div className="mm-tools" role="toolbar" aria-label="Điều khiển minimap">
        <button
          type="button"
          className="mm-btn"
          onClick={() => setMode((m) => (m === 'north' ? 'heading' : 'north'))}
          aria-label={mode === 'north' ? 'Đang cố định hướng Bắc. Đổi sang xoay theo người' : 'Đang xoay theo người. Đổi sang cố định hướng Bắc'}
          title={mode === 'north' ? 'Bắc cố định' : 'Xoay theo người'}
        >
          {mode === 'north' ? 'B' : '↻'}
        </button>
        <button type="button" className="mm-btn" onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0} aria-label="Thu nhỏ minimap">
          −
        </button>
        <button
          type="button"
          className="mm-btn"
          onClick={() => setZoom((z) => Math.min(MINI_ZOOM.length - 1, z + 1))}
          disabled={zoom === MINI_ZOOM.length - 1}
          aria-label="Phóng to minimap"
        >
          +
        </button>
        <button ref={openBtn} type="button" className="mm-btn mm-btn-wide" onClick={() => {
            returnFocus.current = openBtn.current;
            setOpen(true);
          }}
          aria-haspopup="dialog" aria-expanded={open}>
          Bản đồ (M)
        </button>
      </div>
      {nav.dest && nav.guidance && <RouteLine nav={nav} compact />}
      {open && <BigMap model={model} nav={nav} index={index} onClose={close} />}
    </div>
  );
}

/** Minimap tròn góc màn hình, tâm là nhân vật. */
function MiniCanvas({ model, nav, mode, scale }: { model: MapModel; nav: NavApi; mode: MapMode; scale: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(wrap);
  const live = useRef({ model, nav, mode, scale });
  live.current = { model, nav, mode, scale };

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || size.w === 0 || size.h === 0) return undefined;
    let raf = 0;
    const frame = () => {
      const { model: m, nav: n, mode: md, scale: s } = live.current;
      const ctx = prepareCanvas(cv, size.w, size.h);
      if (ctx) {
        const yaw = playerPose.yaw;
        const view = createViewTransform({
          center: { x: playerPose.x, z: playerPose.z },
          scale: s,
          width: size.w,
          height: size.h,
          rotation: mapRotation(md, yaw),
        });
        drawMap(ctx, {
          model: m,
          view,
          width: size.w,
          height: size.h,
          player: { x: playerPose.x, z: playerPose.z },
          playerAngle: iconAngle(md, yaw),
          northAngle: northAngle(md, yaw),
          route: n.routeRef.current,
          showRoute: n.guidance,
          dest: n.dest,
          labelMinScale: 8,
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size.w, size.h]);

  return (
    <div ref={wrap} className="mm-mini">
      <canvas ref={canvas} className="mm-canvas" role="img" aria-label="Minimap: vị trí và hướng của bạn, mũi tên đỏ chỉ hướng Bắc" />
    </div>
  );
}

/** Dòng trạng thái chỉ đường. */
function RouteLine({ nav, compact = false }: { nav: NavApi; compact?: boolean }) {
  const d = nav.dest;
  if (!d) return null;
  const r = nav.route;
  let text: string;
  if (!r || nav.stale) text = 'Đang tính lại tuyến…';
  else if (r.status !== 'ok') text = compact ? 'Không có đường tới đích' : STATUS_TEXT[r.status];
  else if (nav.arrived) text = 'Đã tới nơi';
  else text = `Còn ${formatDistance(nav.remaining ?? r.length)} theo tuyến`;
  return (
    <p className={compact ? 'mm-route-line mm-route-compact' : 'mm-route-line'} role="status" aria-live="polite">
      <strong>{d.label}</strong>
      <span> · {text}</span>
      {!compact && r?.status === 'ok' && r.goalSnapped && d.rect && <span> · Dừng ở chỗ đứng sát đích.</span>}
    </p>
  );
}

interface BigMapProps {
  model: MapModel;
  nav: NavApi;
  index: ReturnType<typeof buildSearchIndex>;
  onClose: () => void;
}

function BigMap({ model, nav, index, onClose }: BigMapProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchIndex(index, query, 12), [index, query]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const choose = useCallback(
    (it: MapItem) => {
      nav.setDestination({ label: it.label, item: it, x: it.center.x, z: it.center.z, rect: it.rect });
    },
    [nav],
  );

  // Esc đóng bản đồ; phím di chuyển không lọt xuống điều khiển nhân vật (keyup vẫn lọt để không kẹt phím).
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Focus trap: Tab xoay vòng trong hộp.
    if (e.key === 'Tab') {
      handleTrapKey(e, dialogRef.current);
      e.stopPropagation();
      return;
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      onClose();
      return;
    }
    if (BLOCKED_CODES.has(e.code) || e.code === 'KeyM') e.stopPropagation();
  };

  const pickAnother = () => {
    searchRef.current?.focus();
    searchRef.current?.select();
  };

  const r = nav.route;
  const failed = nav.dest !== null && r !== null && !nav.stale && r.status !== 'ok';

  return (
    <div className="mm-overlay" onKeyDown={onKeyDown}>
      <div ref={dialogRef} className="mm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="mm-dialog-head">
          <h2 id={titleId}>Bản đồ văn phòng</h2>
          <button type="button" className="mm-btn mm-btn-wide" onClick={onClose}>
            Đóng (Esc)
          </button>
        </header>
        <div className="mm-dialog-body">
          <section className="mm-side" aria-label="Tìm và chỉ đường">
            <label className="mm-search">
              <span>Tìm phòng, mã phòng hoặc bàn</span>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && results[0]) choose(results[0]);
                }}
                placeholder="vd: Phòng họp 2, mr2, desk_B3"
                autoComplete="off"
              />
            </label>
            <SearchResults query={query} results={results} indexSize={index.length} onChoose={choose} selectedId={nav.dest?.item?.id ?? null} />

            {nav.dest ? (
              <div className="mm-route">
                <RouteLine nav={nav} />
                {nav.autoWalkStopped && <p className="mm-note">{nav.autoWalkStopped}</p>}
                {failed && (
                  <button type="button" className="mm-btn mm-btn-wide" onClick={pickAnother}>
                    Chọn đích khác
                  </button>
                )}
                <label className="mm-check">
                  <input type="checkbox" checked={nav.guidance} onChange={(e) => nav.setGuidance(e.target.checked)} />
                  Hiện chỉ đường trên bản đồ
                </label>
                <label className="mm-check">
                  <input type="checkbox" checked={nav.worldMarkers} onChange={(e) => nav.setWorldMarkers(e.target.checked)} />
                  Hiện cột đích và đường đi trong thế giới 3D
                </label>
                <label className="mm-check">
                  <input
                    type="checkbox"
                    checked={nav.autoWalk}
                    disabled={r?.status !== 'ok' || nav.arrived}
                    onChange={(e) => nav.setAutoWalk(e.target.checked)}
                  />
                  Tự đi theo tuyến (bấm phím di chuyển để dừng)
                </label>
                <button type="button" className="mm-btn mm-btn-wide" onClick={nav.clearDestination}>
                  Xóa đích
                </button>
              </div>
            ) : (
              <p className="mm-note">Chưa chọn đích. Chọn một kết quả tìm kiếm hoặc bấm vào bản đồ.</p>
            )}
          </section>
          <BigCanvas model={model} nav={nav} />
        </div>
      </div>
    </div>
  );
}

function SearchResults({
  query,
  results,
  indexSize,
  onChoose,
  selectedId,
}: {
  query: string;
  results: MapItem[];
  indexSize: number;
  onChoose: (it: MapItem) => void;
  selectedId: string | null;
}) {
  if (indexSize === 0) return <p className="mm-empty">Chưa có dữ liệu phòng hoặc bàn trong bố cục.</p>;
  if (query.trim() === '') return <p className="mm-empty">Nhập tên phòng, mã phòng (vd mr1) hoặc mã bàn (vd desk_B3).</p>;
  if (results.length === 0) return <p className="mm-empty">Không có phòng hoặc bàn nào khớp “{query.trim()}” trong dữ liệu bố cục.</p>;
  return (
    <ul className="mm-results" aria-label="Kết quả tìm kiếm">
      {results.map((it) => (
        <li key={it.id}>
          <button type="button" className={it.id === selectedId ? 'mm-result is-selected' : 'mm-result'} onClick={() => onChoose(it)}>
            <span className="mm-result-label">{it.label}</span>
            <span className="mm-result-meta">
              {CATEGORY_LABEL[it.category ?? 'fixture']} · {it.id}
              {it.capacity ? ` · ${it.capacity} chỗ` : ''}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Bản đồ lớn, cố định hướng Bắc. Kéo để dời, nút hoặc con lăn để zoom, bấm (không kéo) để chọn điểm đích. */
function BigCanvas({ model, nav }: { model: MapModel; nav: NavApi }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(wrap);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [center, setCenter] = useState(() => ({
    x: (model.bounds.minX + model.bounds.maxX) / 2,
    z: (model.bounds.minZ + model.bounds.maxZ) / 2,
  }));

  const view = useMemo(() => {
    if (size.w === 0 || size.h === 0) return null;
    const fit = createMapTransform({ bounds: model.bounds, width: size.w, height: size.h, padding: 16 });
    return createViewTransform({ center, scale: fit.scale * BIG_ZOOM[zoomIdx], width: size.w, height: size.h });
  }, [model.bounds, size.w, size.h, center, zoomIdx]);

  const live = useRef({ model, nav, view });
  live.current = { model, nav, view };

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || size.w === 0 || size.h === 0) return undefined;
    let raf = 0;
    const frame = () => {
      const { model: m, nav: n, view: v } = live.current;
      const ctx = prepareCanvas(cv, size.w, size.h);
      if (ctx && v) {
        drawMap(ctx, {
          model: m,
          view: v,
          width: size.w,
          height: size.h,
          player: { x: playerPose.x, z: playerPose.z },
          playerAngle: iconAngle('north', playerPose.yaw),
          northAngle: 0,
          route: n.routeRef.current,
          showRoute: n.guidance,
          dest: n.dest,
          labelMinScale: 9,
          highlightId: n.dest?.item?.id ?? null,
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size.w, size.h]);

  // Kéo để dời (chuột và cảm ứng qua Pointer Events). Di chuyển dưới 6 px coi là bấm.
  const drag = useRef<{ id: number; u: number; v: number; moved: boolean; cx: number; cz: number } | null>(null);
  const localUV = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { u: e.clientX - r.left, v: e.clientY - r.top };
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = localUV(e);
    drag.current = { id: e.pointerId, u: p.u, v: p.v, moved: false, cx: center.x, cz: center.z };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !view) return;
    const p = localUV(e);
    const du = p.u - d.u;
    const dv = p.v - d.v;
    if (!d.moved && Math.hypot(du, dv) < 6) return;
    d.moved = true;
    setCenter({ x: d.cx - du / view.scale, z: d.cz - dv / view.scale });
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || d.moved || !view) return;
    const p = localUV(e);
    const w = view.mapToWorld(p.u, p.v);
    const dest: Destination = { label: 'Điểm đã chọn trên bản đồ', item: null, x: w.x, z: w.z };
    nav.setDestination(dest);
  };
  const onWheel = (e: ReactWheelEvent<HTMLCanvasElement>) => {
    setZoomIdx((z) => Math.max(0, Math.min(BIG_ZOOM.length - 1, z + (e.deltaY < 0 ? 1 : -1))));
  };
  // Bàn phím khi canvas có focus: mũi tên dời 2 m, + / - zoom.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const step = 2;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const mv = moves[e.key];
    if (mv) {
      e.preventDefault();
      setCenter((c) => ({ x: c.x + mv[0], z: c.z + mv[1] }));
    } else if (e.key === '+' || e.key === '=') setZoomIdx((z) => Math.min(BIG_ZOOM.length - 1, z + 1));
    else if (e.key === '-') setZoomIdx((z) => Math.max(0, z - 1));
  };

  return (
    <section className="mm-big" aria-label="Bản đồ lớn">
      <div ref={wrap} className="mm-big-canvas-wrap">
        <canvas
          ref={canvas}
          className="mm-canvas mm-big-canvas"
          tabIndex={0}
          role="img"
          aria-label="Bản đồ văn phòng chữ L, hướng Bắc lên trên. Bấm để chọn điểm đích, kéo hoặc dùng phím mũi tên để dời, + và - để zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (drag.current = null)}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="mm-big-tools" role="toolbar" aria-label="Điều khiển bản đồ lớn">
        <button type="button" className="mm-btn" onClick={() => setZoomIdx((z) => Math.max(0, z - 1))} disabled={zoomIdx === 0} aria-label="Thu nhỏ">
          −
        </button>
        <button
          type="button"
          className="mm-btn"
          onClick={() => setZoomIdx((z) => Math.min(BIG_ZOOM.length - 1, z + 1))}
          disabled={zoomIdx === BIG_ZOOM.length - 1}
          aria-label="Phóng to"
        >
          +
        </button>
        <button type="button" className="mm-btn mm-btn-wide" onClick={() => setCenter({ x: playerPose.x, z: playerPose.z })}>
          Về vị trí của tôi
        </button>
        <button
          type="button"
          className="mm-btn mm-btn-wide"
          onClick={() => {
            setZoomIdx(0);
            setCenter({ x: (model.bounds.minX + model.bounds.maxX) / 2, z: (model.bounds.minZ + model.bounds.maxZ) / 2 });
          }}
        >
          Toàn cảnh
        </button>
      </div>
      <p className="mm-legend">
        <span className="mm-key mm-key-walk" /> Khu đi lại <span className="mm-key mm-key-room" /> Phòng
        <span className="mm-key mm-key-door" /> Cửa <span className="mm-key mm-key-bound" /> Ranh giới chữ L (không phải tường)
        <span className="mm-key mm-key-wall" /> Tường ngoài
      </p>
    </section>
  );
}
