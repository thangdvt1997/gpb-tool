import type { Role } from '../content/types';

/** Giai đoạn sinh trưởng do máy chủ tính. */
export type PlantStage = 'seedling' | 'growing' | 'flowering' | 'mature' | 'wilted';

/** Tình trạng tổng hợp, dùng cho nhãn và kiểu lá. */
export type PlantStatus = 'healthy' | 'thirsty' | 'pests' | 'wilting';

/** Hành động gửi lên máy chủ (POST /api/plants/:id/care). */
export type CareAction = 'water' | 'remove_pests' | 'pick_flowers' | 'prune_leaves' | 'fertilize';

export interface Plant {
  id: string;
  name: string;
  species: string;
  stage: PlantStage;
  /** 0 đến 100. */
  health: number;
  /** 0 đến 100. */
  water: number;
  /** Số sâu hiện có. */
  pests: number;
  /** Số hoa hiện có. */
  flowers: number;
  /** Số lá hiện có. */
  leaves: number;
  ageDays: number;
  status: PlantStatus;
  /** Việc cần làm, dạng chữ do máy chủ tạo. */
  needs: string[];
  updatedAt: string;
}

export interface PlantStateResponse {
  plants: Plant[];
  serverTime: string;
}

export interface CareResponse {
  plant: Plant;
  message: string;
}

export interface PlantLogEntry {
  userName: string;
  action: CareAction;
  at: string;
}

/** Dụng cụ trên thanh chọn. Mỗi dụng cụ tương ứng đúng một hành động chăm sóc. */
export const PLANT_TOOLS = ['can', 'pest', 'scissors-flower', 'shears', 'fertilizer'] as const;
export type PlantTool = (typeof PLANT_TOOLS)[number];

export const TOOL_ACTION: Record<PlantTool, CareAction> = {
  can: 'water',
  pest: 'remove_pests',
  'scissors-flower': 'pick_flowers',
  shears: 'prune_leaves',
  fertilizer: 'fertilize',
};

/** Nhãn dụng cụ trên thanh chọn. */
export const TOOL_LABEL: Record<PlantTool, string> = {
  can: 'Bình nước',
  pest: 'Bắt sâu',
  'scissors-flower': 'Hái hoa',
  shears: 'Kéo tỉa lá',
  fertilizer: 'Bón phân',
};

/** Động từ đứng sau tên người chăm trong nhật ký. */
export const ACTION_LABEL: Record<CareAction, string> = {
  water: 'đã tưới nước',
  remove_pests: 'đã bắt sâu',
  pick_flowers: 'đã hái hoa',
  prune_leaves: 'đã tỉa lá',
  fertilize: 'đã bón phân',
};

export const STAGE_LABEL: Record<PlantStage, string> = {
  seedling: 'Cây con',
  growing: 'Đang lớn',
  flowering: 'Đang ra hoa',
  mature: 'Trưởng thành',
  wilted: 'Đã tàn',
};

export const STATUS_LABEL: Record<PlantStatus, string> = {
  healthy: 'Khỏe',
  thirsty: 'Thiếu nước',
  pests: 'Có sâu',
  wilting: 'Đang héo',
};

/** Vai trò được chăm cây. Hiện mọi vai trò đều được; đổi ở đây nếu có quy định khác. */
export const CARE_ROLES: readonly Role[] = ['employee', 'it', 'admin'];

/** Giới hạn hiển thị. Lá: dữ liệu tới 24 nhưng chỉ vẽ tối đa 12 để nhẹ. */
export const PLANT_LIMITS = {
  maxLeaves: 24,
  maxLeavesDrawn: 12,
  maxFlowers: 8,
  maxPests: 5,
} as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Số đếm nguyên không âm. Giá trị không hợp lệ (NaN, vô cực) thành 0. */
export function countOf(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** Số đếm đã kẹp trong khoảng [0, max]. */
export function safeCount(value: number, max: number): number {
  return clamp(countOf(value), 0, max);
}
