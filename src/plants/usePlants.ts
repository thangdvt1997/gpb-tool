import { useSyncExternalStore } from 'react';
import type { ApiResult } from '../ui/api';
import { carePlant, getPlantState } from './api';
import type { CareAction, CareResponse, Plant } from './types';

/** Chu kỳ làm mới trạng thái cây (mili giây). */
export const PLANT_POLL_MS = 10_000;

export interface PlantsState {
  plants: Plant[];
  serverTime: string | null;
  /** Tải lại ngay. Hàm có tham chiếu ổn định. */
  refresh: () => Promise<void>;
  /** Đã có ít nhất một lần thử tải (thành công hoặc không). */
  loaded: boolean;
  error: string | null;
}

interface Snapshot {
  plants: Plant[];
  serverTime: string | null;
  loaded: boolean;
  error: string | null;
}

const INITIAL: Snapshot = { plants: [], serverTime: null, loaded: false, error: null };

// Kho dùng chung: mọi component gọi usePlants() cùng đọc một kho và chỉ có một chu kỳ tải.
let snapshot: Snapshot = INITIAL;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let requestSeq = 0;

function publish(next: Snapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/**
 * Giữ tham chiếu cũ cho cây không đổi dữ liệu, để PlantMesh không dựng lại khi chỉ có cây khác đổi.
 * Nếu danh sách không đổi gì, trả về đúng mảng cũ.
 */
function keepStable(prev: Plant[], next: Plant[]): Plant[] {
  const prevById = new Map<string, Plant>();
  prev.forEach((p) => prevById.set(p.id, p));
  const merged = next.map((p) => {
    const old = prevById.get(p.id);
    return old && JSON.stringify(old) === JSON.stringify(p) ? old : p;
  });
  const same = merged.length === prev.length && merged.every((p, i) => p === prev[i]);
  return same ? prev : merged;
}

/**
 * Tải lại trạng thái cây ngay. Chỉ kết quả của yêu cầu mới nhất được áp dụng,
 * nên kết quả cũ đến muộn không ghi đè dữ liệu vừa chăm xong.
 */
export function refreshPlants(): Promise<void> {
  const seq = ++requestSeq;
  return getPlantState().then((r) => {
    if (seq !== requestSeq) return;
    if (r.ok) {
      const list = Array.isArray(r.data?.plants) ? r.data.plants : [];
      publish({
        plants: keepStable(snapshot.plants, list),
        serverTime: r.data?.serverTime ?? null,
        loaded: true,
        error: null,
      });
    } else {
      publish({ ...snapshot, loaded: true, error: r.error });
    }
  });
}

/**
 * Chăm một cây. Khi thành công, cập nhật ngay cây đó trong kho rồi tải lại toàn bộ.
 * Dùng hàm này thay cho carePlant trực tiếp để mọi nơi hiển thị cùng thấy kết quả.
 */
export async function carePlantAndSync(id: string, action: CareAction): Promise<ApiResult<CareResponse>> {
  const r = await carePlant(id, action);
  if (r.ok && r.data?.plant) {
    const updated = r.data.plant;
    const next = snapshot.plants.map((p) => (p.id === updated.id ? updated : p));
    publish({ ...snapshot, plants: keepStable(snapshot.plants, next) });
  }
  void refreshPlants();
  return r;
}

function startPolling(): void {
  void refreshPlants();
  timer = setInterval(() => {
    void refreshPlants();
  }, PLANT_POLL_MS);
}

function stopPolling(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) startPolling();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopPolling();
  };
}

function getSnapshot(): Snapshot {
  return snapshot;
}

/**
 * Trạng thái cây realtime. Tải mỗi 10 giây khi có component dùng hook.
 * Khi không còn component nào dùng, interval được dọn.
 */
export function usePlants(): PlantsState {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    plants: snap.plants,
    serverTime: snap.serverTime,
    refresh: refreshPlants,
    loaded: snap.loaded,
    error: snap.error,
  };
}
