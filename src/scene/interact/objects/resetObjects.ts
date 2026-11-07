import { resetObjectStates } from '../objectStates';
import { getCharacterState, transitionCharacter } from '../characterState';
import { closeComputerUi, getComputerUi } from './computerUi';

/**
 * Nút "Đặt lại vật": đưa cửa, ngăn kéo, đèn, rèm, TV, đồ nhỏ... về trạng thái ban đầu.
 * Không chạy khi đang ngồi, dùng giao diện hoặc sắp xếp (tránh bỏ mặc nhân vật giữa hai trạng thái).
 * Đang cầm đồ thì thả tay (đồ về chỗ gốc cùng đợt đặt lại) rồi về đi lại.
 */
export function canResetObjects(): boolean {
  const s = getCharacterState();
  return s === 'walking' || s === 'holding';
}

export function resetAllObjects(): boolean {
  if (!canResetObjects()) return false;
  if (getComputerUi() !== null) closeComputerUi();
  resetObjectStates();
  if (getCharacterState() === 'holding') transitionCharacter('walking', 'reset');
  return true;
}
