import { BOARD_IDS, CHANNEL_IDS, CHANNEL_TITLES, TV_IDS, isBoardId, isTvId } from './catalog';
import type { BoardId, BoardState, Channel, ChannelId, Point, Stroke, Tv, TvId, VersionResult } from './types';

/* Kiểm tra và chuẩn hoá dữ liệu nhận từ mạng (REST và SSE). Dữ liệu không đúng hình dạng trả về null. */

export type RawRecord = Record<string, unknown>;

export interface ParsedState {
  tvs: Partial<Record<TvId, Tv>>;
  boards: Partial<Record<BoardId, BoardState>>;
  channels: Channel[];
}

export function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isPoint(value: unknown): value is Point {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function textOf(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

/** Nhận số kênh dạng number hoặc chuỗi số ('3'). Ngoài 1 đến 6 thì trả về null. */
export function toChannelId(value: unknown): ChannelId | null {
  const n: unknown = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !(CHANNEL_IDS as readonly number[]).includes(n)) return null;
  return n as ChannelId;
}

export function parseTv(raw: unknown): Tv | null {
  if (!isRecord(raw)) return null;
  const on = raw.on;
  const channel = toChannelId(raw.channel);
  if (typeof on !== 'boolean' || channel === null) return null;
  return { on, channel, updatedAt: textOf(raw.updatedAt), updatedBy: textOf(raw.updatedBy) };
}

export function parseStroke(raw: unknown): Stroke | null {
  if (!isRecord(raw)) return null;
  const points = raw.points;
  const color = raw.color;
  const width = raw.width;
  if (!Array.isArray(points) || typeof color !== 'string' || typeof width !== 'number' || !Number.isFinite(width)) {
    return null;
  }
  const id = raw.id;
  const stroke: Stroke = {
    points: points.filter(isPoint),
    color,
    width,
    userName: textOf(raw.userName),
  };
  if (typeof id === 'string') stroke.id = id;
  return stroke;
}

export function parseBoard(raw: unknown): BoardState | null {
  if (!isRecord(raw)) return null;
  const version = raw.version;
  const strokes = raw.strokes;
  if (!isVersion(version) || !Array.isArray(strokes)) return null;
  const parsed: Stroke[] = [];
  for (const item of strokes) {
    const stroke = parseStroke(item);
    if (stroke) parsed.push(stroke);
  }
  return { version, strokes: parsed };
}

export function parseState(raw: unknown): ParsedState | null {
  if (!isRecord(raw)) return null;
  const tvsRaw = raw.tvs;
  const boardsRaw = raw.boards;
  const channelsRaw = raw.channels;

  const tvs: Partial<Record<TvId, Tv>> = {};
  if (isRecord(tvsRaw)) {
    for (const id of TV_IDS) {
      const tv = parseTv(tvsRaw[id]);
      if (tv) tvs[id] = tv;
    }
  }

  const boards: Partial<Record<BoardId, BoardState>> = {};
  if (isRecord(boardsRaw)) {
    for (const id of BOARD_IDS) {
      const board = parseBoard(boardsRaw[id]);
      if (board) boards[id] = board;
    }
  }

  const channels: Channel[] = [];
  if (Array.isArray(channelsRaw)) {
    for (const item of channelsRaw) {
      if (!isRecord(item)) continue;
      const id = toChannelId(item.id);
      if (id === null) continue;
      channels.push({ id, name: textOf(item.name, CHANNEL_TITLES[id]) });
    }
  }

  return { tvs, boards, channels };
}

export function parseVersionBody(raw: unknown): VersionResult | null {
  if (!isRecord(raw)) return null;
  const version = raw.version;
  return isVersion(version) ? { version } : null;
}

/** Sự kiện SSE 'tv': {tvId, on, channel, updatedAt, updatedBy}. */
export function parseTvEvent(raw: unknown): { tvId: TvId; tv: Tv } | null {
  if (!isRecord(raw)) return null;
  const tvId = raw.tvId;
  if (typeof tvId !== 'string' || !isTvId(tvId)) return null;
  const tv = parseTv(raw);
  return tv ? { tvId, tv } : null;
}

/** Sự kiện SSE 'stroke': {boardId, version, stroke}. */
export function parseStrokeEvent(raw: unknown): { boardId: BoardId; version: number; stroke: Stroke } | null {
  if (!isRecord(raw)) return null;
  const boardId = raw.boardId;
  const version = raw.version;
  if (typeof boardId !== 'string' || !isBoardId(boardId) || !isVersion(version)) return null;
  const stroke = parseStroke(raw.stroke);
  return stroke ? { boardId, version, stroke } : null;
}

/** Sự kiện SSE 'clear': {boardId, version}. */
export function parseClearEvent(raw: unknown): { boardId: BoardId; version: number } | null {
  if (!isRecord(raw)) return null;
  const boardId = raw.boardId;
  const version = raw.version;
  if (typeof boardId !== 'string' || !isBoardId(boardId) || !isVersion(version)) return null;
  return { boardId, version };
}
