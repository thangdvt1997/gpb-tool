import { isRecord, parseState, parseTv, parseVersionBody } from './parse';
import type { ParsedState } from './parse';
import type { BoardId, StrokeInput, Tv, TvId, TvPatch, VersionResult } from './types';

/** Kết quả gọi API. Lỗi mạng hoặc HTTP đều thành ok: false, không ném ngoại lệ. */
export type DisplayResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const BASE = '/api/display';
const INVALID_RESPONSE = 'Phản hồi của máy chủ không hợp lệ';

function messageFor(status: number, body: unknown): string {
  const serverError = isRecord(body) ? body.error : undefined;
  if (typeof serverError === 'string' && serverError.trim() !== '') return serverError;
  if (status === 401 || status === 403) return 'Bạn không có quyền thực hiện thao tác này';
  if (status === 404) return 'Không tìm thấy mục này';
  if (status === 409) return 'Dữ liệu vừa thay đổi, thử lại sau';
  if (status === 429) return 'Thao tác quá nhanh, thử lại sau';
  if (status >= 500) return 'Máy chủ đang gặp lỗi, thử lại sau';
  return `Lỗi ${status}`;
}

/** Gọi API cùng origin (gateway). Cookie phiên được trình duyệt gửi kèm mặc định. */
async function call<T>(
  path: string,
  init: RequestInit | undefined,
  parse: (raw: unknown) => T | null,
): Promise<DisplayResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    return { ok: false, status: 0, error: 'Không kết nối được máy chủ' };
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, status: res.status, error: messageFor(res.status, body) };
  const data = parse(body);
  if (data === null) return { ok: false, status: res.status, error: INVALID_RESPONSE };
  return { ok: true, data };
}

function postJson(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const displayApi = {
  /** GET /api/display/state: toàn bộ trạng thái tivi, bảng và kênh. */
  getState(): Promise<DisplayResult<ParsedState>> {
    return call(`${BASE}/state`, undefined, parseState);
  },

  /** POST /api/display/tv/:tvId: bật, tắt hoặc đổi kênh. */
  setTv(tvId: TvId, patch: TvPatch): Promise<DisplayResult<Tv>> {
    return call(`${BASE}/tv/${encodeURIComponent(tvId)}`, postJson(patch), (raw) =>
      isRecord(raw) ? parseTv(raw.tv) : null,
    );
  },

  /** POST /api/display/board/:boardId/strokes: gửi một nét. 409 nghĩa là bảng đã đầy. */
  postStroke(boardId: BoardId, input: StrokeInput): Promise<DisplayResult<VersionResult>> {
    const body = { points: input.points, color: input.color, width: input.width };
    return call(`${BASE}/board/${encodeURIComponent(boardId)}/strokes`, postJson(body), parseVersionBody);
  },

  /** POST /api/display/board/:boardId/clear: xoá bảng (chỉ it và admin). */
  clearBoard(boardId: BoardId): Promise<DisplayResult<VersionResult>> {
    return call(`${BASE}/board/${encodeURIComponent(boardId)}/clear`, postJson({}), parseVersionBody);
  },
};

/** GET tuỳ ý cho dữ liệu kênh. Trả về dữ liệu thô, người gọi tự kiểm tra hình dạng. */
export function getJson(path: string): Promise<DisplayResult<unknown>> {
  return call<unknown>(path, undefined, (raw) => raw);
}
