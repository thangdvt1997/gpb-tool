import { useCallback, useSyncExternalStore } from 'react';
import { getJson } from './api';
import { CHANNEL_TITLES, OFFICE_NAME } from './catalog';
import { isRecord } from './parse';
import type { RawRecord } from './parse';
import type { ChannelId } from './types';

/* ---------- Dữ liệu từng kênh ---------- */

export type ServiceState = 'ok' | 'warn' | 'down' | 'unknown';

export interface IncidentRow {
  title: string;
  severity: string;
  startedAt: string;
}

export interface ServiceRow {
  name: string;
  status: ServiceState;
}

export interface EventRow {
  title: string;
  startsAt: string;
  programCount: number;
}

export interface KudosRow {
  fromName: string;
  toName: string;
  message: string;
  createdAt: string;
}

export interface LeaderRow {
  userName: string;
  points: number;
  games: number;
}

export type ChannelRows =
  | { kind: 'incidents'; rows: IncidentRow[] }
  | { kind: 'services'; rows: ServiceRow[] }
  | { kind: 'events'; rows: EventRow[] }
  | { kind: 'kudos'; rows: KudosRow[] }
  | { kind: 'leaderboard'; rows: LeaderRow[] };

/** Nội dung một kênh. Kênh 6 không có dữ liệu (đồng hồ vẽ tại chỗ). */
export type ChannelContent = ChannelRows | { kind: 'error'; message: string };

export interface ChannelEntry {
  content: ChannelContent | null;
  updatedAt: number | null;
}

const REFRESH_MS = 30000;
const MAX_ROWS = 20;

/** Nguồn dữ liệu của từng kênh. Kênh 6 không gọi API. */
const SOURCES: Record<Exclude<ChannelId, 6>, string> = {
  1: '/api/it/incidents/open',
  2: '/api/it/services',
  3: '/api/events',
  4: '/api/kudos/board',
  5: '/api/games/leaderboard?kind=quiz',
};

function textOf(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function serviceState(value: unknown): ServiceState {
  return value === 'ok' || value === 'warn' || value === 'down' ? value : 'unknown';
}

/** Chuẩn hoá danh sách thô theo đúng kênh. Trường thiếu thì dùng giá trị mặc định, không ném lỗi. */
function normalize(channel: Exclude<ChannelId, 6>, list: RawRecord[]): ChannelRows {
  switch (channel) {
    case 1:
      return {
        kind: 'incidents',
        rows: list.map((r) => ({
          title: textOf(r.title, 'Sự cố'),
          severity: textOf(r.severity, '—'),
          startedAt: textOf(r.startedAt),
        })),
      };
    case 2:
      return {
        kind: 'services',
        rows: list.map((r) => ({ name: textOf(r.name, 'Dịch vụ'), status: serviceState(r.status) })),
      };
    case 3:
      return {
        kind: 'events',
        rows: list.map((r) => ({
          title: textOf(r.title, 'Sự kiện'),
          startsAt: textOf(r.startsAt),
          programCount: numberOf(r.programCount),
        })),
      };
    case 4:
      return {
        kind: 'kudos',
        rows: list.map((r) => ({
          fromName: textOf(r.fromName, '?'),
          toName: textOf(r.toName, '?'),
          message: textOf(r.message),
          createdAt: textOf(r.createdAt),
        })),
      };
    case 5:
      return {
        kind: 'leaderboard',
        rows: list.map((r) => ({
          userName: textOf(r.userName, 'Ẩn danh'),
          points: numberOf(r.points),
          games: numberOf(r.games),
        })),
      };
  }
}

async function fetchContent(channel: Exclude<ChannelId, 6>): Promise<ChannelContent> {
  const r = await getJson(SOURCES[channel]);
  if (!r.ok) return { kind: 'error', message: r.error };
  const data = r.data;
  if (!Array.isArray(data)) return { kind: 'error', message: 'Dữ liệu không đúng định dạng' };
  return normalize(channel, data.filter(isRecord).slice(0, MAX_ROWS));
}

/* ---------- Kho dữ liệu kênh dùng chung ----------
 * Nhiều tivi cùng kênh chỉ gọi API một lần mỗi 30 giây. Hết người xem thì huỷ bộ đếm giờ.
 */

const IDLE: ChannelEntry = { content: null, updatedAt: null };
const entries = new Map<Exclude<ChannelId, 6>, ChannelEntry>();
const signatures = new Map<Exclude<ChannelId, 6>, string>();
const listeners = new Map<Exclude<ChannelId, 6>, Set<() => void>>();
const timers = new Map<Exclude<ChannelId, 6>, ReturnType<typeof setInterval>>();

function readEntry(channel: ChannelId): ChannelEntry {
  if (channel === 6) return IDLE;
  return entries.get(channel) ?? IDLE;
}

async function refresh(channel: Exclude<ChannelId, 6>): Promise<void> {
  const next = await fetchContent(channel);
  if (!listeners.has(channel)) return; // không còn ai xem thì bỏ kết quả
  const prev = entries.get(channel) ?? IDLE;
  // Lỗi tạm thời khi đã có dữ liệu cũ: giữ dữ liệu cũ.
  if (next.kind === 'error' && prev.content !== null && prev.content.kind !== 'error') return;
  const sig = JSON.stringify(next);
  // Dữ liệu không đổi thì không báo cho người xem, tránh vẽ lại texture.
  if (signatures.get(channel) === sig) return;
  signatures.set(channel, sig);
  entries.set(channel, {
    content: next,
    updatedAt: next.kind === 'error' ? prev.updatedAt : Date.now(),
  });
  listeners.get(channel)?.forEach((notify) => notify());
}

function subscribeChannel(channel: ChannelId, notify: () => void): () => void {
  if (channel === 6) return () => undefined;
  const ch: Exclude<ChannelId, 6> = channel;
  let set = listeners.get(ch);
  if (!set) {
    set = new Set();
    listeners.set(ch, set);
  }
  set.add(notify);
  if (set.size === 1) {
    void refresh(ch);
    timers.set(
      ch,
      setInterval(() => {
        void refresh(ch);
      }, REFRESH_MS),
    );
  }
  return () => {
    const current = listeners.get(ch);
    if (!current) return;
    current.delete(notify);
    if (current.size === 0) {
      listeners.delete(ch);
      const timer = timers.get(ch);
      if (timer !== undefined) clearInterval(timer);
      timers.delete(ch);
    }
  };
}

/**
 * Dữ liệu của một kênh, làm mới mỗi 30 giây. Đổi kênh hoặc unmount thì huỷ đăng ký.
 * active = false (ví dụ tivi đang tắt) thì không tải gì.
 */
export function useChannelData(channel: ChannelId, active = true): ChannelEntry {
  const subscribe = useCallback(
    (notify: () => void) => (active ? subscribeChannel(channel, notify) : () => undefined),
    [channel, active],
  );
  const snapshot = useCallback(() => (active ? readEntry(channel) : IDLE), [channel, active]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/* ---------- Vẽ lên canvas ---------- */

const FONT_FAMILY = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
const COLOR = {
  bg: '#0b1020',
  fg: '#e5e7eb',
  muted: '#94a3b8',
  line: '#26324d',
  ok: '#22c55e',
  warn: '#facc15',
  down: '#ef4444',
  unknown: '#64748b',
};

const SERVICE_LABEL: Record<ServiceState, string> = {
  ok: 'Bình thường',
  warn: 'Cảnh báo',
  down: 'Gián đoạn',
  unknown: 'Chưa rõ',
};

const SERVICE_COLOR: Record<ServiceState, string> = {
  ok: COLOR.ok,
  warn: COLOR.warn,
  down: COLOR.down,
  unknown: COLOR.unknown,
};

const EMPTY_TEXT: Record<ChannelRows['kind'], string> = {
  incidents: 'Không có sự cố đang mở',
  services: 'Chưa có dữ liệu dịch vụ',
  events: 'Chưa có sự kiện',
  kudos: 'Chưa có vinh danh',
  leaderboard: 'Chưa có điểm xếp hạng',
};

interface RowView {
  main: string;
  sub?: string;
  right?: string;
  dot?: string;
}

interface TextStyle {
  size: number;
  weight: number;
  color: string;
  align?: CanvasTextAlign;
}

function fontOf(size: number, weight: number): string {
  return `${weight} ${Math.round(size)}px ${FONT_FAMILY}`;
}

/** Cắt chữ kèm dấu … để vừa maxW. Phải đặt font trước khi gọi. */
function fit(ctx: CanvasRenderingContext2D, value: string, maxW: number): string {
  if (maxW <= 0) return '';
  if (ctx.measureText(value).width <= maxW) return value;
  let out = value;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxW) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxW: number,
  style: TextStyle,
): void {
  ctx.font = fontOf(style.size, style.weight);
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align ?? 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(fit(ctx, value, maxW), x, y);
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function rowsOf(content: ChannelRows): RowView[] {
  switch (content.kind) {
    case 'incidents':
      return content.rows.map((r) => ({
        main: r.title,
        sub: `Mức ${r.severity}`,
        right: fmtDateTime(r.startedAt),
        dot: COLOR.warn,
      }));
    case 'services':
      return content.rows.map((r) => ({
        main: r.name,
        right: SERVICE_LABEL[r.status],
        dot: SERVICE_COLOR[r.status],
      }));
    case 'events':
      return content.rows.map((r) => ({
        main: r.title,
        sub: `${r.programCount} tiết mục`,
        right: fmtDateTime(r.startsAt),
      }));
    case 'kudos':
      return content.rows.map((r) => ({
        main: `${r.fromName} gửi cho ${r.toName}`,
        sub: r.message,
        right: fmtDate(r.createdAt),
      }));
    case 'leaderboard':
      return content.rows.map((r, i) => ({
        main: `${i + 1}. ${r.userName}`,
        sub: `${r.games} trận`,
        right: `${r.points} điểm`,
      }));
  }
}

function drawRow(ctx: CanvasRenderingContext2D, row: RowView, y: number, W: number, pad: number, u: number): void {
  const x1 = W - pad;
  const rightMax = (W - pad * 2) * 0.4;
  const textX = row.dot ? pad + 18 * u : pad;

  let rightW = 0;
  if (row.right) {
    ctx.font = fontOf(14 * u, 500);
    const rightText = fit(ctx, row.right, rightMax);
    rightW = ctx.measureText(rightText).width;
    ctx.fillStyle = COLOR.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(rightText, x1, y + 2 * u);
  }

  const mainMax = x1 - textX - (rightW > 0 ? rightW + 10 * u : 0);
  drawLine(ctx, row.main, textX, y, mainMax, { size: 17 * u, weight: 600, color: COLOR.fg });
  if (row.sub) {
    drawLine(ctx, row.sub, textX, y + 19 * u, x1 - textX, { size: 13 * u, weight: 400, color: COLOR.muted });
  }
  if (row.dot) {
    const r = 5 * u;
    ctx.fillStyle = row.dot;
    ctx.beginPath();
    ctx.arc(pad + r, y + 10 * u, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRows(
  ctx: CanvasRenderingContext2D,
  rows: RowView[],
  empty: string,
  top: number,
  bottom: number,
  W: number,
  pad: number,
  u: number,
): void {
  const innerW = W - pad * 2;
  if (rows.length === 0) {
    drawLine(ctx, empty, pad, top, innerW, { size: 16 * u, weight: 500, color: COLOR.muted });
    return;
  }
  const rowH = 36 * u;
  const capacity = Math.max(1, Math.floor((bottom - top) / rowH));
  const overflow = rows.length > capacity;
  const shown = overflow ? capacity - 1 : rows.length;
  for (let i = 0; i < shown; i++) {
    drawRow(ctx, rows[i], top + i * rowH, W, pad, u);
  }
  if (overflow) {
    drawLine(ctx, `+ ${rows.length - shown} mục khác`, pad, top + shown * rowH, innerW, {
      size: 13 * u,
      weight: 500,
      color: COLOR.muted,
    });
  }
}

function drawList(
  ctx: CanvasRenderingContext2D,
  channel: Exclude<ChannelId, 6>,
  content: ChannelContent | null,
  W: number,
  H: number,
): void {
  const u = H / 288;
  const pad = 14 * u;
  const innerW = W - pad * 2;

  drawLine(ctx, CHANNEL_TITLES[channel], pad, pad, innerW, { size: 24 * u, weight: 700, color: COLOR.fg });
  const ruleY = pad + 36 * u;
  ctx.fillStyle = COLOR.line;
  ctx.fillRect(pad, ruleY, innerW, Math.max(1, 2 * u));

  const top = ruleY + 10 * u;
  const bottom = H - pad;

  if (content === null) {
    drawLine(ctx, 'Đang tải dữ liệu…', pad, top, innerW, { size: 16 * u, weight: 500, color: COLOR.muted });
    return;
  }
  if (content.kind === 'error') {
    drawLine(ctx, 'Không tải được dữ liệu', pad, top, innerW, { size: 17 * u, weight: 600, color: COLOR.warn });
    drawLine(ctx, content.message, pad, top + 24 * u, innerW, { size: 13 * u, weight: 400, color: COLOR.muted });
    return;
  }
  drawRows(ctx, rowsOf(content), EMPTY_TEXT[content.kind], top, bottom, W, pad, u);
}

/** Kênh 6: tên văn phòng, giờ (cập nhật theo từng giây khi người gọi vẽ lại), ngày. */
function drawWelcome(ctx: CanvasRenderingContext2D, W: number, H: number, now: Date): void {
  const u = H / 288;
  const maxW = W - 32 * u;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = COLOR.muted;
  ctx.font = fontOf(18 * u, 500);
  ctx.fillText(fit(ctx, `Chào mừng đến ${OFFICE_NAME}`, maxW), W / 2, H * 0.2);

  const time = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  let size = Math.min(H * 0.28, 72 * u);
  ctx.font = fontOf(size, 700);
  while (size > 16 * u && ctx.measureText(time).width > maxW) {
    size -= 4 * u;
    ctx.font = fontOf(size, 700);
  }
  ctx.fillStyle = COLOR.fg;
  ctx.fillText(time, W / 2, H * 0.5);

  const date = now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  ctx.fillStyle = COLOR.muted;
  ctx.font = fontOf(18 * u, 500);
  ctx.fillText(fit(ctx, date, maxW), W / 2, H * 0.8);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

/** Vẽ nội dung kênh lên canvas. Nền tối, chữ lớn, tiêu đề tiếng Việt. */
export function renderChannel(
  ctx: CanvasRenderingContext2D,
  channel: ChannelId,
  content: ChannelContent | null,
  W: number,
  H: number,
  now: Date = new Date(),
): void {
  ctx.save();
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, W, H);
  if (channel === 6) {
    drawWelcome(ctx, W, H, now);
  } else {
    drawList(ctx, channel, content, W, H);
  }
  ctx.restore();
}

/** Tivi tắt: màu đen với đốm sáng nhẹ. Tivi bật: vẽ kênh hiện tại. */
export function paintTv(
  ctx: CanvasRenderingContext2D,
  on: boolean,
  channel: ChannelId,
  content: ChannelContent | null,
  W: number,
  H: number,
): void {
  if (on) {
    renderChannel(ctx, channel, content, W, H);
    return;
  }
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  const cx = W * 0.3;
  const cy = H * 0.25;
  const glare = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.55);
  glare.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  glare.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glare;
  ctx.fillRect(0, 0, W, H);
}
