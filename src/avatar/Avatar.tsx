import { useMemo } from 'react';
import type { Appearance } from './appearance';
import type { AvatarAnimation } from './animation';
import type { CharacterLook } from '../fashion/types';
import { appearanceToLook } from '../fashion/migrate';
import { FallbackAvatar } from './FallbackAvatar';
import { MpfbAvatar } from './MpfbAvatar';
import { VrmAvatar } from './VrmAvatar';

export interface AvatarProps {
  appearance: Appearance;
  /** Tên hiển thị trên thẻ tên của nhân vật dự phòng. */
  displayName?: string;
  /** Hoạt ảnh: idle (thở), walk (bước đi), wave (vẫy tay), dance (nảy người). */
  animation?: AvatarAnimation;
  /**
   * Đường dẫn tệp .vrm. Có giá trị thì thử tải VRM; nếu tệp không có hoặc lỗi
   * thì tự động dùng nhân vật dự phòng. Không truyền thì luôn dùng nhân vật dự phòng.
   */
  url?: string;
  /** true: dùng tư thế từ bộ phát emote. Chỉ bật cho nhân vật của chính người chơi. Mặc định false. */
  emote?: boolean;
  /**
   * Ngoại hình mới (fashion). Có giá trị thì dùng mô hình người MPFB (public/models/*.glb) theo
   * look.bodyStyle và look.body.frame, morph thân theo look.body. Lỗi tải thì về nhân vật dự phòng.
   */
  look?: CharacterLook | null;
  /** true: dùng MPFB kể cả khi chưa có look (look suy ra từ appearance bằng appearanceToLook). */
  mpfb?: boolean;
}

/**
 * Nhân vật người chơi. Thứ tự: url (VRM) > look hoặc mpfb (MPFB) > nhân vật hình học dự phòng.
 * VRM và MPFB đều tự về FallbackAvatar khi đang tải hoặc tải lỗi.
 */
export function Avatar({ appearance, displayName, animation = 'idle', url, emote = false, look, mpfb = false }: AvatarProps) {
  const useMpfb = !url && (Boolean(look) || mpfb);
  const resolvedLook = useMemo<CharacterLook | null>(() => {
    if (!useMpfb) return null;
    return look ?? appearanceToLook(appearance).look;
  }, [useMpfb, look, appearance]);

  if (url) {
    return (
      <VrmAvatar url={url} appearance={appearance} displayName={displayName} animation={animation} emote={emote} />
    );
  }
  if (useMpfb) {
    return (
      <MpfbAvatar appearance={appearance} look={resolvedLook} displayName={displayName} animation={animation} emote={emote} />
    );
  }
  return <FallbackAvatar appearance={appearance} displayName={displayName} animation={animation} emote={emote} />;
}
