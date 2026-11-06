import { api, type ApiResult } from '../ui/api';
import type { CheckinResult, MyCheckin, TodayBoard } from './types';

/** Trạng thái ghi danh của chính người đang đăng nhập (GET /api/it/checkins/me). */
export function getMyCheckin(): Promise<ApiResult<MyCheckin>> {
  return api<MyCheckin>('/api/it/checkins/me');
}

/**
 * Ghi danh cho tài khoản đang đăng nhập (POST /api/it/checkins).
 * Không gửi userId: máy chủ lấy từ cookie sid, nên không thể ghi danh thay người khác.
 */
export function postCheckin(): Promise<ApiResult<CheckinResult>> {
  return api<CheckinResult>('/api/it/checkins', {
    method: 'POST',
    body: JSON.stringify({ gate: 'lift7' }),
  });
}

/** Bảng ghi danh hôm nay. detail=true chỉ thành công với role it hoặc admin (người khác nhận 403). */
export function getTodayBoard(detail = false): Promise<ApiResult<TodayBoard>> {
  return api<TodayBoard>(`/api/it/checkins/today${detail ? '?detail=1' : ''}`);
}
