import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Rect } from '../scene/layout';
import { snapToGrid } from './floorPointer';
import { useLayout } from './LayoutStore';
import { isMovable, MOVABLE_IDS } from './movable';
import { checkPlacement, nextRotation, rectOfPose, type PlacementCheck } from './placement';
import type { Pose } from './types';

export interface MoveSize {
  /** Chiều rộng theo x, chưa xoay, mét. */
  w: number;
  /** Chiều sâu theo z, chưa xoay, mét. */
  d: number;
}

export interface MoveModeConfig {
  /**
   * Footprint vật cố định (dùng fixedRectsOf). Phải đã loại vật di chuyển được,
   * nếu không vật đó sẽ tự chặn chính nó.
   */
  fixed: readonly Rect[];
  /** Footprint thang máy, thang bộ, lối vào (dùng keepOutRectsOf). Kiểm tra theo bán kính 1,5 m quanh tâm. */
  keepOut: readonly Rect[];
  /**
   * Kích thước chưa xoay của vật di chuyển được (lấy từ ZoneObject.size: w = size[0], d = size[2]).
   * Trả undefined nếu chưa biết: vật đó không di chuyển được và không được tính là vật chắn.
   */
  sizeOf: (id: string) => MoveSize | undefined;
}

export interface MoveState {
  /** Id vật đang di chuyển, null nếu không ở chế độ di chuyển. */
  movingId: string | null;
  /** Vị trí và hướng của bóng (thế giới). null nếu không di chuyển. */
  pose: Pose | null;
  /** Vị trí bóng có hợp lệ theo kiểm tra phía client không. */
  valid: boolean;
  /** Lý do chưa hợp lệ (phía client), tiếng Việt. */
  reason: string | null;
  /** Lỗi từ máy chủ ở lần đặt gần nhất. Xoá khi thao tác mới. */
  error: string | null;
  /** Đang chờ máy chủ trả lời lần đặt. */
  busy: boolean;
}

export interface MoveMode {
  state: MoveState;
  /** Bắt đầu di chuyển vật thể, bóng đặt tại vị trí hiện thời. */
  startMove: (id: string) => void;
  /**
   * Con trỏ trên sàn, toạ độ thế giới chưa bắt lưới (từ floorPointer.worldPointFromRay).
   * Chỉ cập nhật bóng khi đổi ô lưới 0,5 m.
   */
  track: (worldX: number, worldZ: number) => void;
  /** Xoay bóng thêm 90°. */
  rotate: () => void;
  /** Gửi vị trí lên máy chủ. Trả true nếu được nhận. Không gửi nếu kiểm tra phía client chưa đạt. */
  place: () => Promise<boolean>;
  /** Huỷ chế độ di chuyển. */
  cancel: () => void;
}

const IDLE: MoveState = { movingId: null, pose: null, valid: false, reason: null, error: null, busy: false };

/**
 * Chế độ di chuyển: chọn vật, xem bóng theo con trỏ, xoay, đặt hoặc huỷ.
 * Kiểm tra phía client chỉ là sơ bộ, server vẫn quyết định.
 * Phải gọi bên trong LayoutProvider.
 */
export function useMoveMode(config: MoveModeConfig): MoveMode {
  const layout = useLayout();
  const [state, setState] = useState<MoveState>(IDLE);
  // Bản sao đồng bộ để hàm gọi từ sự kiện pointer, từ promise và từ effect luôn thấy giá trị mới nhất.
  const stateRef = useRef<MoveState>(IDLE);
  const configRef = useRef(config);
  const layoutRef = useRef(layout);
  configRef.current = config;
  layoutRef.current = layout;

  const commit = useCallback((next: MoveState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  /** Kiểm tra một pose của vật id với vị trí hiện thời của các vật di chuyển khác. */
  const evaluate = useCallback((id: string, pose: Pose): PlacementCheck => {
    const cfg = configRef.current;
    const lay = layoutRef.current;
    const size = cfg.sizeOf(id);
    if (!size) return { valid: false, reason: 'Không xác định được kích thước vật thể.' };
    const movables: Rect[] = [];
    for (const other of MOVABLE_IDS) {
      if (other === id) continue;
      const s = cfg.sizeOf(other);
      const p = lay.poseOf(other);
      if (s && p) movables.push(rectOfPose(p, s.w, s.d));
    }
    return checkPlacement(rectOfPose(pose, size.w, size.d), {
      fixed: cfg.fixed,
      keepOut: cfg.keepOut,
      movables,
    });
  }, []);

  const startMove = useCallback(
    (id: string) => {
      if (stateRef.current.busy) return;
      if (!isMovable(id)) {
        commit({ ...IDLE, error: 'Vật thể này không di chuyển được.' });
        return;
      }
      const size = configRef.current.sizeOf(id);
      const pose = layoutRef.current.poseOf(id);
      if (!size || !pose) {
        commit({ ...IDLE, error: 'Chưa có kích thước hoặc vị trí của vật thể này.' });
        return;
      }
      const check = evaluate(id, pose);
      commit({ movingId: id, pose, valid: check.valid, reason: check.reason, error: null, busy: false });
    },
    [commit, evaluate],
  );

  const track = useCallback(
    (worldX: number, worldZ: number) => {
      const cur = stateRef.current;
      if (!cur.movingId || !cur.pose || cur.busy) return;
      const x = snapToGrid(worldX);
      const z = snapToGrid(worldZ);
      // Cùng ô lưới: không đổi gì, không setState.
      if (x === cur.pose.x && z === cur.pose.z) return;
      const pose: Pose = { x, z, rotation: cur.pose.rotation };
      const check = evaluate(cur.movingId, pose);
      commit({ ...cur, pose, valid: check.valid, reason: check.reason, error: null });
    },
    [commit, evaluate],
  );

  const rotate = useCallback(() => {
    const cur = stateRef.current;
    if (!cur.movingId || !cur.pose || cur.busy) return;
    const pose: Pose = { ...cur.pose, rotation: nextRotation(cur.pose.rotation) };
    const check = evaluate(cur.movingId, pose);
    commit({ ...cur, pose, valid: check.valid, reason: check.reason, error: null });
  }, [commit, evaluate]);

  const cancel = useCallback(() => {
    if (stateRef.current.busy) return;
    commit(IDLE);
  }, [commit]);

  const place = useCallback(async (): Promise<boolean> => {
    const cur = stateRef.current;
    if (!cur.movingId || !cur.pose || cur.busy) return false;
    if (!cur.valid) {
      // Chưa hợp lệ phía client: không gửi, chỉ báo lý do.
      commit({ ...cur, error: cur.reason ?? 'Vị trí chưa hợp lệ.' });
      return false;
    }
    const id = cur.movingId;
    const pose = cur.pose;
    commit({ ...cur, busy: true, error: null });
    const r = await layoutRef.current.actions.move(id, pose);
    if (r.ok) {
      commit(IDLE);
      return true;
    }
    commit({ ...stateRef.current, busy: false, error: r.error });
    return false;
  }, [commit]);

  // Khi vật khác được di chuyển (sự kiện SSE), kiểm tra lại bóng đang hiển thị.
  useEffect(() => {
    const cur = stateRef.current;
    if (!cur.movingId || !cur.pose || cur.busy) return;
    const check = evaluate(cur.movingId, cur.pose);
    if (check.valid !== cur.valid || check.reason !== cur.reason) {
      commit({ ...cur, valid: check.valid, reason: check.reason });
    }
  }, [layout.items, layout.defaults, evaluate, commit]);

  return useMemo<MoveMode>(
    () => ({ state, startMove, track, rotate, place, cancel }),
    [state, startMove, track, rotate, place, cancel],
  );
}
