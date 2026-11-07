import { useEffect, useRef, useState } from 'react';
import { announce } from '../../a11y';
import { playInternalEmote } from '../player';
import { playerPose } from '../../scene/controls/playerPose';
import { requestWalk } from '../../scene/controls/walkRequest';
import { getControls } from '../../scene/controls/session';
import { SOCIAL_ACTIONS, type Peer, type SocialDenyReason } from './logic';
import { SocialSession } from './session';
import { SocialPrompt } from './SocialPrompt';
import type { EmoteId } from '../types';
import { createLocalBus, type SocialTransport } from './transport';

/** Câu báo khi không thực hiện được (đọc qua aria-live). */
export const DENY_TEXT: Partial<Record<SocialDenyReason, string>> = {
  no_target: 'Không có ai ở gần trong tầm nhìn.',
  busy: 'Đang chờ trả lời một lời mời khác.',
  cooldown: 'Chờ một chút rồi thử lại.',
  sitting: 'Đứng dậy trước đã.',
  airborne: 'Đang nhảy.',
  moving: 'Dừng lại trước đã.',
  in_match: 'Đang trong trận.',
  too_far: 'Người đó ở quá xa.',
  editor_open: 'Đóng trình sắp xếp trước đã.',
  interacting: 'Đang dùng vật.',
};

export interface SocialBarProps {
  selfId: string;
  /** Người khác đang thấy được (vị trí thế giới). Không có world thì rỗng. */
  getPeers: () => readonly Peer[];
  nameOf?: (id: string) => string;
  transport?: SocialTransport;
  /** Đang sắp xếp nội thất: ẩn thanh nút (panel trình biên tập ở cùng góc), vẫn giữ phiên để nhận lời mời. */
  editorOpen?: boolean;
  /** Người khác làm hành động hướng về mình: host phát emote trên avatar từ xa của họ. `self` là vị trí của mình để avatar quay mặt về. */
  onRemotePlay?: (fromId: string, emoteId: EmoteId, self: { x: number; z: number }) => void;
}

/**
 * Thanh hành động xã hội (TASK 15) và hộp lời mời đến. Không chứa múa võ/tập quyền (chờ quyết định).
 * Transport mặc định là bus cục bộ; khi có world thì truyền transport mạng (docs/design/EMOTES_SOCIAL.md).
 */
export function SocialBar({ selfId, getPeers, nameOf, transport, editorOpen = false, onRemotePlay }: SocialBarProps) {
  const remotePlayRef = useRef(onRemotePlay);
  remotePlayRef.current = onRemotePlay;
  // Tạo trong effect: dispose() gỡ đăng ký transport, StrictMode chạy cleanup rồi effect lại nên cần phiên mới.
  const [session, setSession] = useState<SocialSession | null>(null);
  useEffect(() => {
    const t = transport ?? createLocalBus().endpoint(selfId);
    const s = new SocialSession({
      transport: t,
      now: () => performance.now(),
      getPosition: (id) => (id === selfId ? { x: playerPose.x, z: playerPose.z } : getPeers().find((p) => p.id === id)),
      play: (id) => playInternalEmote(id),
      onRemotePlay: (from, emoteId) => remotePlayRef.current?.(from, emoteId, { x: playerPose.x, z: playerPose.z }),
      face: (yaw) => requestWalk({ x: playerPose.x, z: playerPose.z, facingYaw: yaw }),
    });
    setSession(s);
    return () => s.dispose();
  }, [selfId, transport, getPeers]);

  const start = (id: (typeof SOCIAL_ACTIONS)[number]['id']) => {
    if (!session) return;
    const ctl = getControls();
    const r = session.start(
      id,
      { speed: 0, airborne: false, sitting: ctl.seated, editorOpen, interacting: false, inMatch: false },
      { x: playerPose.x, z: playerPose.z, yaw: playerPose.yaw },
      getPeers(),
    );
    if (!r.ok) announce(DENY_TEXT[r.reason] ?? 'Không thực hiện được.', 'polite');
    else if (r.mode === 'invited') announce('Đã gửi lời mời, chờ trả lời.', 'polite');
  };

  return (
    <>
      <div className="social-bar" role="group" aria-label="Hành động với người khác" hidden={editorOpen}>
        {SOCIAL_ACTIONS.map((a) => (
          <button key={a.id} type="button" className="btn btn-ghost small" onClick={() => start(a.id)}>
            {a.label}
          </button>
        ))}
      </div>
      {session && <SocialPrompt session={session} nameOf={nameOf} />}
    </>
  );
}
