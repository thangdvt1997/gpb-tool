/**
 * API công khai của khung tương tác dùng chung. Giai đoạn sau (cửa, ghế, máy tính, ngăn kéo,
 * công tắc, TV, đồ nhỏ) chỉ import từ đây.
 */
export {
  registerInteractable,
  getInteractable,
  listInteractables,
  subscribe,
  subscribeRegistry,
  availableActions,
  type Footprint,
  type InteractPoint,
  type InteractAction,
  type InteractContext,
  type InteractableDef,
} from './registry';
export {
  getObjectState,
  setObjectState,
  setObjectDefaults,
  getObjectDefaults,
  resetObjectStates,
  changedObjectIds,
  subscribeObjectStates,
  useObjectState,
  type ObjectState,
  type ObjectStatePatch,
  type ObjectStateValue,
} from './objectStates';
export {
  CHARACTER_STATES,
  canTransition,
  transitionCharacter,
  resetCharacterState,
  getCharacterState,
  getCharacterSnapshot,
  isWalkLocked,
  canFocusInState,
  subscribeCharacterState,
  useCharacterState,
  type CharacterState,
  type CharacterSnapshot,
} from './characterState';
export {
  activateFocus,
  chooseAction,
  closeMenu,
  refreshFocus,
  getFocusedId,
  useInteractionSnapshot,
  type InteractionSnapshot,
  type PromptAction,
} from './controller';
export { getInteractSettings, updateInteractSettings, useInteractSettings, type InteractSettings } from './settings';
export { SELECT, INTERACT_DEFAULTS } from './selection';
export { InteractionSystem, useInteractionSelect, useZoneInteractables, zoneInteractables } from './InteractionSystem';
export { InteractionHud, InteractionHelp } from './InteractionHud';
