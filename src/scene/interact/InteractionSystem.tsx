import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ZoneObject } from '../../content/types';
import { getControls, isTypingTarget, requestStand, ROOM_BOUNDS } from '../controls';
import { isAction } from '../controls/bindings';
import { playerPose } from '../controls/playerPose';
import { requestWalk } from '../controls/walkRequest';
import { isSolidObject, type Rect } from '../layout';
import { canFocusInState } from './characterState';
import { attachSeatSync } from './seatSync';
import {
  activateById,
  activateFocus,
  chooseMenuIndex,
  closeMenu,
  getFocusedId,
  isMenuOpen,
  publishFocus,
  setInteractBlocked,
  useInteractionSnapshot,
} from './controller';
import {
  availableActions,
  contextOf,
  getInteractable,
  isEnabled,
  listInteractables,
  registerBaseInteractable,
  registryVersion,
  type InteractableDef,
} from './registry';
import { approachPointOf, footprintOf, pickInteractable, rectOf } from './selection';
import { useInteractSettings } from './settings';

/** Vật phẳng sát sàn (sảnh, khu dự phòng, vạch lối vào) là vùng sàn, không phải vật để dùng. */
const FLAT_MAX_HEIGHT = 0.05;

/**
 * Vật mặc định của khu (it.json): vật có action, không phải vùng sàn phẳng.
 * Một hành động "Sử dụng <tên>" gọi onUse(id) (mở panel như trước). Vật đặc chặn tầm nhìn.
 * Giai đoạn sau đăng ký cùng id bằng registerInteractable để thay bằng hành vi riêng.
 */
export function zoneInteractables(objects: readonly ZoneObject[], onUse: (id: string) => void): InteractableDef[] {
  return objects
    .filter((o) => typeof o.action === 'string' && o.action.trim() !== '')
    .filter((o) => o.kind !== 'reserved' && o.size[1] > FLAT_MAX_HEIGHT)
    .map((o) => ({
      id: o.id,
      kind: o.kind,
      label: o.label,
      footprint: { cx: o.position[0], cz: o.position[2], hx: o.size[0] / 2, hz: o.size[2] / 2 },
      baseY: o.position[1] - o.size[1] / 2,
      height: o.size[1],
      occludes: isSolidObject(o),
      actions: [{ id: 'use', label: `Sử dụng ${o.label}`, run: () => onUse(o.id) }],
    }));
}

/** Đăng ký vật mặc định của khu vào lớp base, gỡ khi đổi khu hoặc unmount. */
export function useZoneInteractables(objects: readonly ZoneObject[], onUse: (id: string) => void): void {
  const onUseRef = useRef(onUse);
  onUseRef.current = onUse;
  useEffect(() => {
    const defs = zoneInteractables(objects, (id) => onUseRef.current(id));
    const offs = defs.map((d) => registerBaseInteractable(d));
    return () => offs.forEach((off) => off());
  }, [objects]);
}

/** Cửa sổ mất focus hoặc đang gõ trong ô nhập. */
function browserBlocked(): boolean {
  if (typeof document === 'undefined') return true;
  if (document.visibilityState === 'hidden' || !document.hasFocus()) return true;
  return isTypingTarget(document.activeElement);
}

function accept(def: InteractableDef): boolean {
  const ctx = contextOf(def);
  return isEnabled(def, ctx) && availableActions(def, ctx).length > 0;
}

const DIGIT = /^(?:Digit|Numpad)([1-9])$/;

/** Vật chờ dùng sau khi tự đi tới (bấm chuột từ xa). Hết hạn nếu tới nơi mà vật vẫn không thành focus. */
const PENDING_MS = 400;
let pendingUse: { id: string; until: number } | null = null;

interface SystemProps {
  /** false: ẩn gợi ý, bỏ qua E (ví dụ khi chuỗi ghi danh đang chạy). */
  enabled: boolean;
  /** id vật đang rê chuột (SceneContext), để gợi ý "Bấm chuột". */
  hovered?: string | null;
  /** Vật cản thêm (tường, vách) ngoài các vật đăng ký occludes. */
  occluders?: readonly Rect[];
}

/**
 * Hệ tương tác dùng chung. Mount một lần trong Canvas, THAY cho InteractTracker (cả hai cùng nghe E).
 * Mỗi khung: chọn đúng một vật theo playerPose, đẩy gợi ý sang controller, vẽ viền sáng.
 * Phím: E (một lần nhấn một hành động, phải nhả mới nhấn lại), 1..9 và Esc khi menu mở.
 */
export function InteractionSystem({ enabled, hovered = null, occluders }: SystemProps) {
  const latest = useRef({ enabled, hovered, occluders });
  latest.current = { enabled, hovered, occluders };
  const occCache = useRef<{ version: number; extra: readonly Rect[] | undefined; rects: Rect[] }>({
    version: -1,
    extra: undefined,
    rects: [],
  });

  // Ngồi thật (điều khiển) -> characterState seated, để ghế đưa ra "Đứng dậy".
  useEffect(() => attachSeatSync(), []);

  useFrame(() => {
    const l = latest.current;
    const off = !l.enabled || getControls().paused || !canFocusInState() || browserBlocked();
    setInteractBlocked(off);
    if (off) {
      publishFocus(null, false);
      return;
    }
    // Vật cản: tính lại khi sổ đăng ký hoặc danh sách thêm đổi, không phải mỗi khung.
    const c = occCache.current;
    const v = registryVersion();
    if (c.version !== v || c.extra !== l.occluders) {
      const rects: Rect[] = [];
      for (const d of listInteractables()) {
        const f = d.occludes ? footprintOf(d) : null;
        if (f) rects.push(rectOf(f));
      }
      if (l.occluders) rects.push(...l.occluders);
      occCache.current = { version: v, extra: l.occluders, rects };
    }
    const def = pickInteractable(listInteractables(), playerPose, getFocusedId(), occCache.current.rects, accept);
    publishFocus(def, def !== null && l.hovered === def.id);
    const p = pendingUse;
    if (p) {
      if (performance.now() > p.until) pendingUse = null;
      else if (def?.id === p.id) {
        pendingUse = null;
        activateFocus();
      }
    }
  });

  useEffect(() => {
    let eDown = false;
    const release = (): void => {
      eDown = false;
      closeMenu();
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (isAction(e.code, 'interact')) {
        // Đang ngồi: E để đứng dậy (như InteractTracker cũ).
        if (!e.repeat && !eDown && getControls().seated && !getControls().paused) {
          eDown = true;
          requestStand();
          e.preventDefault();
          return;
        }
        // Giữ phím: bỏ qua lặp tự động và mọi keydown cho tới khi nhả.
        if (e.repeat || eDown) {
          e.preventDefault();
          return;
        }
        eDown = true;
        if (activateFocus()) e.preventDefault();
        return;
      }
      if (!isMenuOpen()) return;
      const m = DIGIT.exec(e.code);
      if (m) {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) chooseMenuIndex(Number(m[1]) - 1);
        return;
      }
      if (isAction(e.code, 'cancel')) {
        // Esc đóng menu trước, không để lan sang Esc đóng panel / tạm dừng.
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (isAction(e.code, 'interact')) eDown = false;
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') release();
    };
    // Pha capture: chặn phím số/Esc của menu trước các phím tắt khác (biểu cảm, tạm dừng).
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', onVisibility);
      setInteractBlocked(true);
      publishFocus(null, false);
    };
  }, []);

  return <InteractHighlight />;
}

/** Viền sáng nhẹ quanh vật đang chọn (cạnh hộp bao, nhịp sáng chậm). Tắt được trong cài đặt. */
function InteractHighlight() {
  const { focus } = useInteractionSnapshot();
  const { highlight } = useInteractSettings();
  const geometry = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), []);
  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame(({ clock }) => {
    material.opacity = 0.55 + 0.3 * Math.sin(clock.elapsedTime * 3);
  });

  const def = focus && highlight ? getInteractable(focus.id) : undefined;
  const f = def ? footprintOf(def) : null;
  if (!def || !f) return null;
  const pad = 0.04;
  const h = def.height ?? 1;
  const y0 = def.baseY ?? 0;
  return (
    <lineSegments
      geometry={geometry}
      material={material}
      position={[f.cx, y0 + h / 2, f.cz]}
      scale={[f.hx * 2 + pad * 2, h + pad * 2, f.hz * 2 + pad * 2]}
      raycast={() => null}
      renderOrder={10}
    />
  );
}

/**
 * Hàm select cho SceneContext (bấm chuột trái vào vật), thay useInteractSelect.
 * - Vật đang là focus: chạy như phím E.
 * - Vật đã đăng ký nhưng ở xa hoặc lệch hướng: tự đi tới điểm tương tác, tới nơi thì chạy.
 * - Vật chưa đăng ký (vùng sàn) hoặc lúc tắt: giữ hành vi cũ, onSelect(id) ngay.
 */
export function useInteractionSelect(
  obstacles: readonly Rect[],
  enabled: boolean,
  onSelect: (id: string) => void,
): (id: string) => void {
  return useCallback(
    (id: string) => {
      const def = getInteractable(id);
      if (!enabled || !def) {
        onSelect(id);
        return;
      }
      if (activateById(id)) return;
      const p = approachPointOf(def, playerPose, obstacles, ROOM_BOUNDS);
      if (!p) {
        onSelect(id);
        return;
      }
      // Tới nơi: chờ vòng chọn của khung sau xác nhận vật là focus (vẫn qua kiểm tra tầm và vật cản) rồi mới chạy.
      requestWalk({
        x: p.x,
        z: p.z,
        facingYaw: p.yaw,
        onArrive: () => {
          pendingUse = { id, until: performance.now() + PENDING_MS };
        },
      });
    },
    [enabled, obstacles, onSelect],
  );
}
