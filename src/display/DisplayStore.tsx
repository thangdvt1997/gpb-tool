import { useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { displayApi } from './api';
import type { DisplayResult } from './api';
import { parseClearEvent, parseState, parseStrokeEvent, parseTvEvent } from './parse';
import type { ParsedState } from './parse';
import type {
  BoardId,
  BoardState,
  Channel,
  Stroke,
  StrokeInput,
  Tv,
  TvId,
  TvPatch,
  VersionResult,
} from './types';

/*
 * Kho trạng thái dùng chung, đặt ở mức module (không dùng React context).
 * Lý do: R3F 8 không chuyển context qua <Canvas>, nên tivi trong 3D phải đọc kho này trực tiếp.
 * Chỉ có một EventSource cho cả ứng dụng. Số lần mở đếm theo số nơi đang dùng (acquire/release).
 */

const STREAM_URL = '/api/display/stream';
const RECONNECT_MS = 5000;

interface Snapshot extends ParsedState {
  connected: boolean;
}

export interface DisplayActions {
  setTv: (tvId: TvId, patch: TvPatch) => Promise<DisplayResult<Tv>>;
  sendStroke: (boardId: BoardId, input: StrokeInput) => Promise<DisplayResult<VersionResult>>;
  clearBoard: (boardId: BoardId) => Promise<DisplayResult<VersionResult>>;
}

export interface DisplayValue {
  tvs: Partial<Record<TvId, Tv>>;
  boards: Partial<Record<BoardId, BoardState>>;
  channels: Channel[];
  connected: boolean;
  actions: DisplayActions;
}

let snapshot: Snapshot = { tvs: {}, boards: {}, channels: [], connected: false };
const listeners = new Set<() => void>();
let source: EventSource | null = null;
let users = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let refreshing: Promise<void> | null = null;

function commit(next: Snapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Snapshot {
  return snapshot;
}

function parseJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function replaceState(parsed: ParsedState, connected: boolean): void {
  commit({ tvs: parsed.tvs, boards: parsed.boards, channels: parsed.channels, connected });
}

/** Tải lại toàn bộ trạng thái. Gọi khi phát hiện mất sự kiện (khoảng trống version). */
function refreshState(): Promise<void> {
  if (refreshing === null) {
    refreshing = displayApi
      .getState()
      .then((r) => {
        if (r.ok) replaceState(r.data, snapshot.connected);
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

function applyTv(tvId: TvId, tv: Tv): void {
  commit({ ...snapshot, tvs: { ...snapshot.tvs, [tvId]: tv } });
}

/**
 * Thêm một nét. Version phải lớn hơn version đang có. Bỏ qua nét trùng.
 * Nếu version nhảy cóc (mất sự kiện) hoặc chưa có bảng, tải lại toàn bộ trạng thái.
 */
function applyStroke(boardId: BoardId, version: number, stroke: Stroke): void {
  const board = snapshot.boards[boardId];
  if (!board || version > board.version + 1) {
    void refreshState();
    return;
  }
  if (version <= board.version) return;
  if (stroke.id !== undefined && board.strokes.some((s) => s.id === stroke.id)) return;
  commit({
    ...snapshot,
    boards: { ...snapshot.boards, [boardId]: { version, strokes: [...board.strokes, stroke] } },
  });
}

function applyClear(boardId: BoardId, version: number): void {
  const board = snapshot.boards[boardId];
  if (!board || version > board.version + 1) {
    void refreshState();
    return;
  }
  if (version <= board.version) return;
  commit({ ...snapshot, boards: { ...snapshot.boards, [boardId]: { version, strokes: [] } } });
}

function scheduleReopen(): void {
  if (reconnectTimer !== null || users === 0) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (users > 0 && source === null) open();
  }, RECONNECT_MS);
}

function open(): void {
  const es = new EventSource(STREAM_URL);
  source = es;

  es.onopen = () => {
    if (source === es && !snapshot.connected) commit({ ...snapshot, connected: true });
  };

  // EventSource tự nối lại khi lỗi mạng. Chỉ mở lại thủ công khi trình duyệt đã đóng hẳn (CLOSED).
  es.onerror = () => {
    if (source !== es) return;
    if (snapshot.connected) commit({ ...snapshot, connected: false });
    if (es.readyState === EventSource.CLOSED) {
      es.close();
      source = null;
      scheduleReopen();
    }
  };

  es.addEventListener('state', (ev: MessageEvent) => {
    if (source !== es) return;
    const parsed = parseState(parseJson(ev.data));
    if (parsed) replaceState(parsed, true);
  });

  es.addEventListener('tv', (ev: MessageEvent) => {
    if (source !== es) return;
    const event = parseTvEvent(parseJson(ev.data));
    if (event) applyTv(event.tvId, event.tv);
  });

  es.addEventListener('stroke', (ev: MessageEvent) => {
    if (source !== es) return;
    const event = parseStrokeEvent(parseJson(ev.data));
    if (event) applyStroke(event.boardId, event.version, event.stroke);
  });

  es.addEventListener('clear', (ev: MessageEvent) => {
    if (source !== es) return;
    const event = parseClearEvent(parseJson(ev.data));
    if (event) applyClear(event.boardId, event.version);
  });
}

function close(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (source !== null) {
    source.close();
    source = null;
  }
  if (snapshot.connected) commit({ ...snapshot, connected: false });
}

function acquire(): void {
  users += 1;
  if (users === 1) open();
}

function release(): void {
  users = Math.max(0, users - 1);
  if (users === 0) close();
}

const actions: DisplayActions = {
  async setTv(tvId, patch) {
    const r = await displayApi.setTv(tvId, patch);
    if (r.ok) applyTv(tvId, r.data);
    return r;
  },
  async sendStroke(boardId, input) {
    const r = await displayApi.postStroke(boardId, input);
    // Áp dụng ngay theo version server trả về. Sự kiện SSE của chính nét này sau đó bị bỏ qua vì trùng version.
    if (r.ok) {
      applyStroke(boardId, r.data.version, {
        points: input.points.slice(),
        color: input.color,
        width: input.width,
        userName: '',
      });
    }
    return r;
  },
  async clearBoard(boardId) {
    const r = await displayApi.clearBoard(boardId);
    if (r.ok) applyClear(boardId, r.data.version);
    return r;
  },
};

/**
 * Giữ kết nối SSE suốt vòng đời ứng dụng, kể cả khi không có panel nào mở.
 * Bọc một lần ở gốc. Hook useDisplay cũng tự giữ kết nối nên bọc hay không đều chạy đúng.
 */
export function DisplayProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    acquire();
    return release;
  }, []);
  return <>{children}</>;
}

/** Trạng thái tivi, bảng, kênh và kết nối, cùng ba hành động. Dùng được cả trong <Canvas>. */
export function useDisplay(): DisplayValue {
  useEffect(() => {
    acquire();
    return release;
  }, []);
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    tvs: snap.tvs,
    boards: snap.boards,
    channels: snap.channels,
    connected: snap.connected,
    actions,
  };
}
