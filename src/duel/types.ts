export type DuelMode = 'fight' | 'dance';
export type DuelStatus = 'invited' | 'active' | 'finished' | 'expired' | 'cancelled';

export interface Lasthit {
  by: string;
  power: number;
  damage: number;
  at: string | null;
}

export interface Duel {
  id: string;
  mode: DuelMode;
  status: DuelStatus;
  inviterId: string;
  inviteeId: string;
  createdAt: string | null;
  acceptedAt: string | null;
  endedAt: string | null;
  winnerId: string | null;
  hpInviter: number;
  hpInvitee: number;
  /** Người đang nằm đỡ (trận fight), null nếu không có. */
  downUserId: string | null;
  /** ISO có offset +07:00. */
  downUntil: string | null;
  lastHit: Lasthit | null;
  /** Tên nếu server có trả kèm; hợp đồng không bắt buộc. */
  inviterName: string | null;
  inviteeName: string | null;
}

export interface DirectoryEntry {
  id: string;
  name: string;
  email: string | null;
}

export const DUEL_MAX_HP = 100;
export const INVITE_TTL_MS = 30_000;
