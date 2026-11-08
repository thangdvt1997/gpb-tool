import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { BAKED_MODEL_IDS, bakedClipUrl, loadBakedClips, type BakedModelId } from './bakedClips';

/** Crossfade mặc định giữa hai clip bake (giây), khớp DEFAULT_BLEND trong scene/motion/clipMap.ts. */
const FADE = 0.2;

export function bakedModelForUrl(url: string): BakedModelId | null {
  return BAKED_MODEL_IDS.find((id) => url.endsWith(`/${id}.glb`)) ?? null;
}

/** ?baked=0 tắt clip bake, buộc dùng tư thế procedural (để so sánh/gỡ lỗi). */
function enabled(): boolean {
  return typeof window === 'undefined' || !/[?&]baked=0\b/.test(window.location.search);
}

/** Clip người chơi đang dùng (MpfbModel của animation='locomotion' ghi mỗi khung; ?debug=controls đọc). */
export const playerClipDebug: { clip: string | null; source: 'baked' | 'procedural' } = { clip: null, source: 'procedural' };

export interface BakedPlayer {
  /** Tên clip đang phát ('' nếu không). */
  readonly current: string;
  /** Tốc độ phát clip hiện tại. */
  setTimeScale(s: number): void;
  /** Phát clip theo tên (crossfade). */
  play(name: string): void;
  /** Dừng mọi clip và trả xương về trạng thái trước khi phát (để tư thế procedural tiếp quản sạch). */
  stop(): void;
  /** Cập nhật mixer. Gọi mỗi khung khi đang dùng clip. */
  update(dt: number): void;
}

function createPlayer(root: THREE.Object3D, clips: Map<string, THREE.AnimationClip>): { player: BakedPlayer; dispose: () => void } {
  const mixer = new THREE.AnimationMixer(root);
  let current: THREE.AnimationAction | null = null;
  let currentName = '';
  return {
    player: {
      get current() {
        return currentName;
      },
      setTimeScale(sc) {
        if (current) current.timeScale = sc;
      },
      play(name) {
        if (name === currentName) return;
        const clip = clips.get(name);
        if (!clip) return;
        const next = mixer.clipAction(clip).reset();
        const def = clip.name;
        next.setLoop(/^(Idle|Walk|Run|Airborne|SeatedIdle|Wave|Dance)$/.test(def) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        next.clampWhenFinished = true;
        next.play();
        if (current) current.crossFadeTo(next, FADE, false);
        current = next;
        currentName = name;
      },
      stop() {
        if (currentName === '' && current === null) return;
        mixer.stopAllAction();
        current = null;
        currentName = '';
      },
      update(dt) {
        mixer.update(dt);
      },
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    },
  };
}

export interface BakedHandle {
  player: BakedPlayer;
  /** Tên các clip đã nạp. */
  names: ReadonlySet<string>;
}

/**
 * Nạp clip bake cho nhân vật MPFB; trả handle khi sẵn sàng, null khi chưa tải xong, tải lỗi hoặc bị tắt
 * (runtime rơi về tư thế procedural). Việc chọn clip theo khung do chooseBakedClip (bakedClips.ts) quyết định.
 */
export function useBakedPlayer(root: THREE.Object3D, url: string): BakedHandle | null {
  const [clips, setClips] = useState<Map<string, THREE.AnimationClip> | null>(null);
  useEffect(() => {
    const id = bakedModelForUrl(url);
    if (!id || !enabled()) return;
    let alive = true;
    void loadBakedClips(bakedClipUrl(id)).then((c) => {
      if (alive) setClips(c);
    });
    return () => {
      alive = false;
    };
  }, [url]);
  const built = useMemo(() => (clips ? { ...createPlayer(root, clips), names: new Set(clips.keys()) as ReadonlySet<string> } : null), [root, clips]);
  useEffect(() => () => built?.dispose(), [built]);
  return useMemo(() => (built ? { player: built.player, names: built.names } : null), [built]);
}
