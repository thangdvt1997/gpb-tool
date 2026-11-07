// Logic thuần của "Tự đi theo tuyến": quyết định gửi điểm kế tiếp cho Player và khi nào phải dừng.
// Không đụng DOM hay playerPose; hook useNavigation đưa vị trí, đồng hồ và sự kiện vào, nhận lại hành động.
//
// Dừng khi: bấm phím di chuyển, bấm vào cảnh 3D, kẹt (không nhúc nhích quá STALL_MS), tới nơi, hết tuyến.

import { routeProgress } from './navgrid.js';

/** Không nhích quá mức này (m) trong STALL_MS thì coi là kẹt. */
export const STALL_MOVE_M = 0.1;
export const STALL_MS = 2000;
/** Còn lại dưới khoảng này (m) thì coi là tới nơi. */
export const AUTOWALK_ARRIVE_M = 0.8;
/** Cách điểm gấp dưới khoảng này (m) thì coi là đã tới điểm đó (lớn hơn ngưỡng 0,2 m của Player). */
export const WAYPOINT_REACHED_M = 0.3;

/** Phím di chuyển (KeyboardEvent.code) làm tắt tự đi. */
export const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export const STOP_TEXT = {
  key: 'Đã tắt tự đi vì bạn bấm phím di chuyển.',
  scene: 'Đã tắt tự đi vì bạn bấm vào cảnh.',
  stall: 'Đã tắt tự đi vì nhân vật không tiến thêm được.',
  arrived: null,
  no_route: 'Đã tắt tự đi vì không còn tuyến.',
};

/** Trạng thái ban đầu khi bật tự đi tại vị trí pos, thời điểm now (ms). */
export function createAutoWalk(pos, now) {
  return { issuedRoute: null, issuedIndex: -1, lastX: pos.x, lastZ: pos.z, lastMoveAt: now };
}

/** Phím này có làm tắt tự đi không. */
export function isMoveKey(code) {
  return MOVE_CODES.has(code);
}

/** Bấm chuột/chạm vào canvas của cảnh (không phải canvas trong minimap) thì tắt tự đi. */
export function isSceneClick({ isCanvas, insideMinimap }) {
  return Boolean(isCanvas) && !insideMinimap;
}

/** Báo Player đã tới điểm gấp đã gửi: nhịp sau gửi điểm kế tiếp. */
export function markArrivedAtPoint(state, route, index) {
  if (state.issuedRoute === route && state.issuedIndex === index) {
    state.issuedRoute = null;
    state.issuedIndex = -1;
  }
}

/**
 * Một nhịp. Ghi vào state (bộ nhớ đã gửi, mốc nhúc nhích).
 * @returns {{ type: 'none' } | { type: 'walk', x: number, z: number, index: number } | { type: 'stop', reason: string }}
 */
export function stepAutoWalk(state, { route, x, z, now }) {
  if (!route || route.status !== 'ok' || route.points.length < 2) return { type: 'stop', reason: 'no_route' };
  const p = routeProgress(route.points, x, z);
  if (p.remaining < AUTOWALK_ARRIVE_M && p.offRoute < AUTOWALK_ARRIVE_M) return { type: 'stop', reason: 'arrived' };

  // Kẹt: không nhích quá STALL_MOVE_M trong STALL_MS (Player đã bỏ đích vì bị chặn). Không ép tiếp.
  if (Math.hypot(x - state.lastX, z - state.lastZ) > STALL_MOVE_M) {
    state.lastX = x;
    state.lastZ = z;
    state.lastMoveAt = now;
  } else if (now - state.lastMoveAt > STALL_MS) {
    return { type: 'stop', reason: 'stall' };
  }

  let index = Math.min(route.points.length - 1, p.segment + 1);
  // Player coi là tới điểm gấp khi còn dưới 0,2 m, nên có thể dừng ngay trước góc khi tiến độ trên tuyến vẫn ở
  // đoạn cũ. Nếu cứ gửi lại điểm đó thì kẹt vĩnh viễn: đã ở trong WAYPOINT_REACHED_M thì sang điểm kế tiếp.
  while (index < route.points.length - 1 && Math.hypot(route.points[index].x - x, route.points[index].z - z) < WAYPOINT_REACHED_M) index++;
  if (state.issuedRoute === route && state.issuedIndex === index) return { type: 'none' };
  state.issuedRoute = route;
  state.issuedIndex = index;
  const t = route.points[index];
  return { type: 'walk', x: t.x, z: t.z, index };
}
