import type { SocialMessage } from '../emotes/social/logic';

// Giao thức message của world service (xem docs/design/WORLD_SYNC.md). Chỉ kiểu dữ liệu, không logic.

export interface PlayerState {
  id: string;
  name: string;
  x: number;
  z: number;
  yaw: number;
  anim: string;
  seq: number;
  /** Tùy chọn: ngoại hình (world chưa gửi ở phiên bản hiện tại; client chuẩn hóa nếu có). */
  appearance?: unknown;
  /** Thời điểm server nhận pose (ms, đồng hồ server). */
  t: number;
}

export interface LeaseView {
  resource: string;
  ownerId: string | null;
  ownerName?: string | null;
  leaseId?: string | null;
  fence: number;
  revision: number;
  expiresInMs?: number;
}

export interface ResumeResult {
  ok: boolean;
  reason?: string;
  restored?: string[];
  lost?: { resource: string; reason: string }[];
  spawn?: { x: number; z: number; yaw: number } | null;
  /** true: khoảng trống quá lớn, bỏ trạng thái cục bộ và dùng snapshot. */
  full: boolean;
  events?: ServerMessage[];
}

export interface Snapshot {
  type: 'snapshot';
  v: number;
  tick: number;
  serverTime: number;
  self: { id: string };
  ttlMs: number;
  players: PlayerState[];
  epoch: string;
  eseq: number;
  role: Role;
  capabilities: string[];
  leases: LeaseView[];
  objects: { resource: string; revision: number; x?: number; z?: number; yaw?: number }[];
  session?: { id: string; resumeToken: string; resumeTtlMs: number };
  resumed?: ResumeResult | null;
}

export type Role = 'guest' | 'member' | 'editor' | 'owner';
/** Một dòng của danh sách thành viên (chỉ owner nhận). */
export interface MemberInfo {
  id: string;
  name: string;
  role: Role;
  muted: boolean;
}

export type ChatChannel = 'room' | 'near';

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  from: { id: string; name: string };
  text: string;
  at: number;
}

/** Tin server gửi. Các trường không dùng ở client giữ lỏng. */
export type ServerMessage =
  | Snapshot
  | { type: 'ack'; seq: number; tick: number; accepted: { x: number; z: number; yaw: number; anim: string }; corrected: boolean }
  | { type: 'error'; code: string; seq?: number; requestId?: string; clientMsgId?: string; retryAfterMs?: number }
  | { type: 'join'; id: string; name: string; tick: number }
  | { type: 'poses'; tick: number; serverTime: number; poses: PlayerState[] }
  | { type: 'leave'; id: string; reason: string; tick: number }
  | { type: 'pong'; t: number | null; serverTime: number; tick: number }
  | ({ type: 'lease'; eseq?: number; reason: string } & LeaseView)
  | { type: 'lease.result'; op: string; requestId?: string; resource?: string; ok: boolean; error?: string; lease?: LeaseView; owner?: { id: string; name: string } }
  | { type: 'edit.applied'; eseq?: number; resource: string; revision: number; x?: number; z?: number; yaw?: number; by: string }
  | { type: 'edit.result'; requestId?: string; resource: string; ok: boolean; error?: string; revision?: number }
  | ({ type: 'chat'; eseq?: number } & ChatMessage)
  | { type: 'chat.ack'; clientMsgId: string; id: string; at: number; duplicate?: boolean }
  | { type: 'chat.history'; requestId?: string; messages: ChatMessage[] }
  | { type: 'chat.block'; ok: boolean; blocked?: string[]; error?: string }
  | { type: 'role'; role: Role; capabilities: string[] }
  | { type: 'muted'; on: boolean; durationMs: number }
  | { type: 'mod.result'; op: string; requestId?: string; ok: boolean; error?: string }
  | { type: 'member.list'; requestId?: string; members: MemberInfo[] }
  | { type: 'audit.list'; entries: Record<string, unknown>[] }
  /** TASK 15: server chuyển tiếp thông điệp xã hội; social.denied khi server từ chối (xa quá, bận, quá nhanh...). */
  | SocialMessage
  | { type: 'social.denied'; code: string; inviteId?: string; retryAfterMs?: number };

// Mã đóng kết nối của world.
export const CLOSE_CODES = {
  UNAUTHENTICATED: 4401,
  KICKED: 4403,
  REPLACED: 4409,
  TOO_MANY: 4429,
  SERVER_FULL: 1013,
  GOING_AWAY: 1001,
  POLICY: 1008,
} as const;
