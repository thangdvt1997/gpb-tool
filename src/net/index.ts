// Client đồng bộ nhiều người (TASK 23 đến 27). Xem docs/design/WORLD_SYNC.md.
export { useWorld, type WorldApi } from './useWorld';
export { RemotePlayers } from './RemotePlayers';
export { ChatPanel } from './ChatPanel';
export { ConnectionBanner } from './ConnectionBanner';
export { PoseSender } from './PoseSender';
export { worldEnabled, shouldSendPose } from './poseThrottle';
export { attachSeatLease, seatResource } from './seatLease';
export { MemberPanel } from './MemberPanel';
export { createWorldSocialTransport, type SocialNetDeps } from './socialTransport';
export { createAppearanceSender, useAppearanceSync } from './appearanceSync';
export { VoicePanel } from './voice/VoicePanel';
