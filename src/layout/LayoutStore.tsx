import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ApiResult } from '../ui/api';
import { getLayoutState, moveItem, normalizeState, resetLayout } from './api';
import { asRotation } from './placement';
import type { LayoutItem, LayoutState, MoveEvent, Pose, PropRecord } from './types';

interface Snapshot extends LayoutState {
  /** Đã nhận dữ liệu từ máy chủ (qua GET hoặc sự kiện SSE 'state'). */
  loaded: boolean;
}

export interface LayoutActions {
  move: (id: string, pose: Pose) => Promise<ApiResult<{ item: LayoutItem; version: number }>>;
  reset: (id?: string) => Promise<ApiResult<{ version: number }>>;
}

export interface LayoutContextValue {
  items: Record<string, LayoutItem>;
  defaults: Record<string, Pose>;
  /** Vật thêm bằng trình biên tập (rỗng nếu máy chủ cũ). */
  props: Record<string, PropRecord>;
  version: number;
  loaded: boolean;
  /** Vị trí hiện thời: items[id] nếu đã di chuyển, không thì defaults[id]. undefined nếu chưa có dữ liệu. */
  poseOf: (id: string) => Pose | undefined;
  actions: LayoutActions;
}

const EMPTY: Snapshot = { items: {}, defaults: {}, version: 0, loaded: false };
const OFFLINE: ApiResult<never> = { ok: false, status: 0, error: 'Chưa kết nối dữ liệu bố cục' };

const NO_ACTIONS: LayoutActions = {
  move: async () => OFFLINE,
  reset: async () => OFFLINE,
};

const NO_PROPS: Record<string, PropRecord> = {};

const LayoutContext = createContext<LayoutContextValue>({
  items: {},
  defaults: {},
  props: NO_PROPS,
  version: 0,
  loaded: false,
  poseOf: () => undefined,
  actions: NO_ACTIONS,
});

/** Đọc JSON từ dữ liệu sự kiện. Trả null nếu hỏng hoặc không phải object. */
function parse<T>(raw: string): T | null {
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as T) : null;
  } catch {
    return null;
  }
}

/**
 * Giữ bố cục chung của mọi người. Một EventSource tới /api/layout/stream.
 * 'state' thay toàn bộ dữ liệu, 'move' cập nhật một vật, 'reset' tải lại toàn bộ.
 * Sự kiện có version không mới hơn thì bỏ qua. Thiếu version thì tải lại.
 */
export function LayoutProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  // Bản sao đồng bộ của snap, để handler SSE và actions luôn đọc giá trị mới nhất.
  const snapRef = useRef<Snapshot>(EMPTY);

  const commit = useCallback((next: Snapshot) => {
    snapRef.current = next;
    setSnap(next);
  }, []);

  const applyState = useCallback(
    (s: LayoutState) => {
      const cur = snapRef.current;
      // Bản đến muộn, cũ hơn dữ liệu đã có: bỏ qua.
      if (cur.loaded && s.version < cur.version) return;
      commit({ ...s, loaded: true });
    },
    [commit],
  );

  const refresh = useCallback(async () => {
    const r = await getLayoutState();
    if (r.ok) applyState(r.data);
  }, [applyState]);

  const applyMove = useCallback(
    (id: string, pose: Pose, movedBy: string | null, version: number) => {
      const cur = snapRef.current;
      if (!cur.loaded) {
        void refresh();
        return;
      }
      if (version <= cur.version) return;
      // Thiếu sự kiện ở giữa: tải lại toàn bộ thay vì đoán.
      if (version > cur.version + 1) {
        void refresh();
        return;
      }
      const item: LayoutItem = { x: pose.x, z: pose.z, rotation: pose.rotation, movedBy };
      commit({ ...cur, items: { ...cur.items, [id]: item }, version });
    },
    [commit, refresh],
  );

  useEffect(() => {
    void refresh();
    let es: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      es = new EventSource('/api/layout/stream');
      es.addEventListener('state', (ev: MessageEvent) => {
        const s = parse<LayoutState>(ev.data);
        if (s) applyState(normalizeState(s));
      });
      es.addEventListener('move', (ev: MessageEvent) => {
        const m = parse<MoveEvent>(ev.data);
        if (m) applyMove(m.id, { x: m.x, z: m.z, rotation: asRotation(m.rotation) }, m.movedBy ?? null, m.version);
      });
      es.addEventListener('reset', () => {
        void refresh();
      });
    }
    return () => {
      es?.close();
    };
  }, [applyState, applyMove, refresh]);

  const move = useCallback(
    async (id: string, pose: Pose) => {
      const r = await moveItem(id, pose);
      if (r.ok) {
        // Áp dụng ngay kết quả của mình. Sự kiện SSE cùng version sẽ bị bỏ qua.
        applyMove(id, { x: r.data.item.x, z: r.data.item.z, rotation: r.data.item.rotation }, r.data.item.movedBy, r.data.version);
      }
      return r;
    },
    [applyMove],
  );

  const reset = useCallback(
    async (id?: string) => {
      const r = await resetLayout(id);
      if (r.ok) void refresh();
      return r;
    },
    [refresh],
  );

  const actions = useMemo<LayoutActions>(() => ({ move, reset }), [move, reset]);

  const poseOf = useCallback(
    (id: string): Pose | undefined => {
      const it = snap.items[id];
      if (it) return it;
      return snap.defaults[id];
    },
    [snap],
  );

  const value = useMemo<LayoutContextValue>(
    () => ({
      items: snap.items,
      defaults: snap.defaults,
      props: snap.props ?? NO_PROPS,
      version: snap.version,
      loaded: snap.loaded,
      poseOf,
      actions,
    }),
    [snap, poseOf, actions],
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

/** Bố cục hiện thời và hành động move / reset. Phải nằm trong LayoutProvider. */
export function useLayout(): LayoutContextValue {
  return useContext(LayoutContext);
}
