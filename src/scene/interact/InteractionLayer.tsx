import { useEffect, useMemo } from 'react';
import type { ZoneObject } from '../../content/types';
import { chairInteractables } from './chairs';
import { InteractionSystem, useZoneInteractables } from './InteractionSystem';
import { registerBaseInteractable } from './registry';

interface LayerProps {
  /** zone.objects của khu hiện tại. */
  objects: readonly ZoneObject[];
  /** false: ẩn gợi ý và bỏ qua E (ví dụ khi chuỗi ghi danh đang chạy). */
  enabled: boolean;
  hovered?: string | null;
  /** Dùng vật (mở panel), giống onSelect trước đây. */
  onUse: (id: string) => void;
}

/**
 * Thay thế trọn bộ InteractTracker trong Canvas: đăng ký vật của khu và ghế vào sổ, rồi mount
 * InteractionSystem (hệ duy nhất nghe phím E). Không mount cùng lúc với InteractTracker.
 */
export function InteractionLayer({ objects, enabled, hovered = null, onUse }: LayerProps) {
  useZoneInteractables(objects, onUse);
  const chairs = useMemo(() => chairInteractables(objects), [objects]);
  useEffect(() => {
    const offs = chairs.map((d) => registerBaseInteractable(d));
    return () => offs.forEach((off) => off());
  }, [chairs]);
  return <InteractionSystem enabled={enabled} hovered={hovered} />;
}
