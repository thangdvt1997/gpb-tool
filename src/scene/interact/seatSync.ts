import { getCharacterState, transitionCharacter } from './characterState';
import { getControls, subscribeControls } from '../controls/session';

/**
 * Đồng bộ trạng thái ngồi của điều khiển (useGtaPlayer báo qua setSeated) sang máy trạng thái nhân vật:
 * hành động ghế "Đứng dậy" và khóa đi bộ đọc characterState, nên khi nhân vật đã ngồi thật phải chuyển sang seated,
 * đứng dậy thì về walking. Không chuyển khi trạng thái hiện tại không cho (bảng TRANSITIONS).
 */
export function syncSeated(seated: boolean): void {
  const s = getCharacterState();
  if (seated && s !== 'seated') transitionCharacter('seated', 'controls');
  else if (!seated && s === 'seated') transitionCharacter('walking', 'controls');
}

/** Theo dõi getControls().seated. Trả hàm hủy. */
export function attachSeatSync(): () => void {
  let last = getControls().seated;
  syncSeated(last);
  return subscribeControls(() => {
    const seated = getControls().seated;
    if (seated === last) return;
    last = seated;
    syncSeated(seated);
  });
}
