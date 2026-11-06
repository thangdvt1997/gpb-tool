import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { playerPose } from '../controls/playerPose';
import { requestWalk } from '../controls/walkRequest';
import { isAction } from '../controls/bindings';
import { getControls, isTypingTarget, requestSit, requestStand, ROOM_BOUNDS } from '../controls';
import type { Rect } from '../layout';
import { approachOf, INTERACT_VERB, isReady, pickFocus, type InteractTarget } from './geometry';
import { setInteractActivator, setInteractFocus } from './store';

interface TrackerProps {
  targets: readonly InteractTarget[];
  /** false: ẩn hướng dẫn và bỏ qua phím E (ví dụ khi chuỗi ghi danh đang chạy). */
  enabled: boolean;
  /** id vật đang rê chuột (SceneContext). */
  hovered: string | null;
  /** Thực hiện action của vật, giống bấm chuột vào vật trước đây (mở panel). */
  onUse: (id: string) => void;
}

/** Thẻ gợi ý khi đang ngồi. */
const STAND_FOCUS = { id: '__stand', label: '', verb: 'Đứng dậy' } as const;

/**
 * Mỗi khung hình: tìm vật đủ điều kiện dùng ngay (trong tầm với và trước mặt) theo playerPose,
 * đẩy sang store cho thẻ hướng dẫn. Phím E: dùng vật đó (ghế: ngồi xuống); đang ngồi thì E để đứng dậy.
 * Tạm dừng thì ẩn gợi ý và bỏ qua E. Không vẽ gì trong cảnh.
 */
export function InteractTracker({ targets, enabled, hovered, onUse }: TrackerProps) {
  const latest = useRef({ targets, enabled, hovered, onUse });
  latest.current = { targets, enabled, hovered, onUse };

  useFrame(() => {
    const l = latest.current;
    const c = getControls();
    if (!l.enabled || c.paused) {
      setInteractFocus(null, false);
      return;
    }
    if (c.seated) {
      setInteractFocus(STAND_FOCUS, false);
      return;
    }
    const f = pickFocus(l.targets, playerPose);
    setInteractFocus(
      f && { id: f.id, label: f.label, verb: INTERACT_VERB[f.kind] },
      f !== null && l.hovered === f.id,
    );
  });

  useEffect(() => {
    const tryUse = (): boolean => {
      const l = latest.current;
      const c = getControls();
      if (!l.enabled || c.paused) return false;
      if (c.seated) {
        requestStand();
        return true;
      }
      const f = pickFocus(l.targets, playerPose);
      if (!f) return false;
      if (f.kind === 'chair' && f.seat) {
        requestSit({ id: f.id, x: f.seat.x, z: f.seat.z, yaw: f.seat.yaw });
        return true;
      }
      l.onUse(f.id);
      return true;
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!isAction(e.code, 'interact') || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (tryUse()) e.preventDefault();
    };
    setInteractActivator(() => {
      tryUse();
    });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      setInteractActivator(null);
      setInteractFocus(null, false);
    };
  }, []);

  return null;
}

/**
 * Hàm select cho SceneContext: bấm chuột trái vào vật có tương tác.
 * - Đủ điều kiện (hoặc đang ngồi): dùng ngay.
 * - Chưa đủ: requestWalk tới điểm đứng trước vật, quay mặt vào vật, tới nơi mới dùng.
 * Vật không nằm trong targets (vùng sàn phẳng) và lúc tắt tương tác: giữ hành vi cũ (onSelect ngay).
 */
export function useInteractSelect(
  targets: readonly InteractTarget[],
  obstacles: readonly Rect[],
  enabled: boolean,
  onSelect: (id: string) => void,
): (id: string) => void {
  const byId = useMemo(() => new Map(targets.map((t) => [t.id, t] as const)), [targets]);

  return useCallback(
    (id: string) => {
      const t = byId.get(id);
      if (!enabled || !t) {
        onSelect(id);
        return;
      }
      if (getControls().paused) return;
      if (getControls().seated || isReady(t, playerPose)) {
        onSelect(id);
        return;
      }
      const a = approachOf(t, playerPose, obstacles, ROOM_BOUNDS);
      requestWalk({ x: a.x, z: a.z, facingYaw: a.yaw, onArrive: () => onSelect(id) });
    },
    [byId, enabled, obstacles, onSelect],
  );
}
