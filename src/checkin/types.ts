/** Cổng ghi danh hợp lệ. MVP chỉ có thang máy tầng 7. */
export type CheckinGate = 'lift7';

/** Một bản ghi ghi danh. `at` là chuỗi ISO có offset +07:00. `day` dạng YYYY-MM-DD (UTC+7). */
export interface CheckinRecord {
  userId: string;
  name: string;
  department: string;
  day: string;
  at: string;
  gate: CheckinGate;
}

/** Phản hồi GET /api/it/checkins/me. */
export interface MyCheckin {
  ok: true;
  day: string;
  checkedIn: boolean;
  checkin: CheckinRecord | null;
}

/** Phản hồi POST /api/it/checkins: 201 khi mới, 200 khi đã ghi danh hôm nay. */
export interface CheckinResult {
  ok: true;
  alreadyCheckedIn: boolean;
  checkin: CheckinRecord;
}

export interface DepartmentCount {
  department: string;
  count: number;
}

/** Mục chi tiết trong bảng. Chỉ có khi `detail=1` và role it hoặc admin. */
export interface TodayItem {
  userId: string;
  name: string;
  department: string;
  at: string;
}

/** Phản hồi GET /api/it/checkins/today. */
export interface TodayBoard {
  ok: true;
  day: string;
  count: number;
  byDepartment: DepartmentCount[];
  items?: TodayItem[];
}
