// Store ngoài React cho trạng thái chỉ đường, dùng chung giữa Minimap (ngoài Canvas) và NavMarkers (trong Canvas).
// R3F không chuyển React context qua Canvas, nên dùng store module + useSyncExternalStore.
// Snapshot là đối tượng bất biến: mỗi lần đổi tạo đối tượng mới (so sánh bằng tham chiếu).

import { useSyncExternalStore } from 'react';

export interface NavMarkerSnapshot {
  /** Đích (tâm đứng cuối tuyến) trong world, null nếu không có đích hoặc tuyến không hợp lệ. */
  goal: { x: number; z: number } | null;
  /** Các điểm gấp của tuyến, bắt đầu từ chỗ đứng lúc tính. Rỗng nếu không có tuyến. */
  points: ReadonlyArray<{ x: number; z: number }>;
  /** Người dùng bật chỉ đường. */
  guidance: boolean;
  /** Người dùng bật marker trong thế giới 3D. */
  worldMarkers: boolean;
  /** Tăng mỗi khi tuyến đổi (kể cả cùng số điểm). */
  version: number;
}

export const EMPTY_NAV_SNAPSHOT: NavMarkerSnapshot = {
  goal: null,
  points: [],
  guidance: true,
  worldMarkers: true,
  version: 0,
};

let snapshot: NavMarkerSnapshot = EMPTY_NAV_SNAPSHOT;
const listeners = new Set<() => void>();

export function getNavSnapshot(): NavMarkerSnapshot {
  return snapshot;
}

export function subscribeNav(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Cập nhật một phần; không phát sự kiện nếu không có gì đổi (so tham chiếu từng trường). */
export function setNavSnapshot(patch: Partial<Omit<NavMarkerSnapshot, 'version'>>): void {
  const next: NavMarkerSnapshot = { ...snapshot, ...patch };
  const same =
    next.goal === snapshot.goal &&
    next.points === snapshot.points &&
    next.guidance === snapshot.guidance &&
    next.worldMarkers === snapshot.worldMarkers;
  if (same) return;
  snapshot = { ...next, version: snapshot.version + 1 };
  for (const fn of Array.from(listeners)) fn();
}

/** Về trạng thái rỗng (Minimap gỡ khỏi cây). */
export function resetNavSnapshot(): void {
  snapshot = { ...EMPTY_NAV_SNAPSHOT, version: snapshot.version + 1 };
  for (const fn of Array.from(listeners)) fn();
}

export function useNavSnapshot(): NavMarkerSnapshot {
  return useSyncExternalStore(subscribeNav, getNavSnapshot, getNavSnapshot);
}
