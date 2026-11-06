import { api, type ApiResult } from '../ui/api';
import type { CareAction, CareResponse, PlantLogEntry, PlantStateResponse } from './types';

/** Thân phản hồi của GET /api/plants/:id/log: danh sách nằm trong trường log. */
interface PlantLogResponse {
  log: PlantLogEntry[];
}

/** Đường dẫn cây: mã cây được mã hóa để không phá URL. */
function plantPath(id: string, suffix: string): string {
  return `/api/plants/${encodeURIComponent(id)}${suffix}`;
}

/** Trạng thái tất cả cây trong văn phòng (GET /api/plants/state). */
export function getPlantState(): Promise<ApiResult<PlantStateResponse>> {
  return api<PlantStateResponse>('/api/plants/state');
}

/**
 * Chăm một cây (POST /api/plants/:id/care).
 * Lỗi 409 nghĩa là đang hồi chiêu hoặc không có việc cần làm; thông báo lấy từ máy chủ.
 */
export function carePlant(id: string, action: CareAction): Promise<ApiResult<CareResponse>> {
  return api<CareResponse>(plantPath(id, '/care'), {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

/**
 * Nhật ký chăm sóc của một cây (GET /api/plants/:id/log).
 * Máy chủ trả { log: [...] }; hàm này bóc trường log và trả thẳng mảng.
 */
export function getPlantLog(id: string): Promise<ApiResult<PlantLogEntry[]>> {
  return api<PlantLogResponse>(plantPath(id, '/log')).then((r): ApiResult<PlantLogEntry[]> => {
    if (!r.ok) return r;
    return { ok: true, data: Array.isArray(r.data?.log) ? r.data.log : [] };
  });
}
