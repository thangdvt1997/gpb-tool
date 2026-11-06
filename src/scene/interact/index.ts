export {
  INTERACT,
  INTERACT_VERB,
  approachOf,
  evaluate,
  isReady,
  kindOf,
  pickFocus,
  targetsOf,
  type InteractKind,
  type InteractTarget,
} from './geometry';
export { InteractTracker, useInteractSelect } from './InteractTracker';
export { InteractHelp, InteractPrompt } from './InteractPrompt';
export { useInteractSnapshot } from './store';
// Khung mới (thay InteractTracker, InteractPrompt, InteractHelp): xem docs/design/INTERACTIONS.md.
export { InteractionLayer } from './InteractionLayer';
export { useInteractionSelect, InteractionSystem } from './InteractionSystem';
export { InteractionHud, InteractionHelp } from './InteractionHud';
