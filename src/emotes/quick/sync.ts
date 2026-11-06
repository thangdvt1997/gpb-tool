/** Giao diện đồng bộ trạng thái biểu cảm. Chưa nối mạng: mặc định không có sink. */
import type { QuickActionId } from './logic';

export interface EmoteSyncEvent {
  type: 'start' | 'end';
  actionId: QuickActionId;
  /** Đồng hồ cục bộ performance.now() (ms); lớp mạng sẽ đổi sang giờ máy chủ. */
  startTime: number;
  /** Tham số tùy chọn, hiện luôn rỗng. */
  parameters: Readonly<Record<string, never>>;
  /** Lý do kết thúc (chỉ với type 'end'). */
  endCause?: string;
}

export interface EmoteSyncSink { publish(event: EmoteSyncEvent): void }

let sink: EmoteSyncSink | null = null;

export function setEmoteSyncSink(next: EmoteSyncSink | null): void { sink = next; }
export function publishEmoteEvent(event: EmoteSyncEvent): void { sink?.publish(event); }
