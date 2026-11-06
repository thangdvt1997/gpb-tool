/** Kết quả gọi API: ok kèm dữ liệu, hoặc lỗi kèm mã HTTP và thông báo tiếng Việt. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** Gọi API cùng origin (gateway). Không lưu gì phía client. */
export async function api<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const body = (await res.json().catch(() => null)) as unknown;
    if (res.ok) return { ok: true, data: body as T };
    const msg =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Lỗi ${res.status}`;
    return { ok: false, status: res.status, error: msg };
  } catch {
    return { ok: false, status: 0, error: 'Không kết nối được máy chủ' };
  }
}

export interface Notice {
  kind: 'ok' | 'err';
  text: string;
}
