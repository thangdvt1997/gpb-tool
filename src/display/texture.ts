import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

const MIN_TEX_H = 64;
const MAX_TEX_H = 2048;

/** Chiều cao pixel của texture theo tỉ lệ kích thước [rộng, cao] (mét) và chiều rộng cho trước. */
export function pixelHeight(size: readonly [number, number], width: number): number {
  const [w, h] = size;
  const ratio = w > 0 && h > 0 ? h / w : 9 / 16;
  return Math.min(MAX_TEX_H, Math.max(MIN_TEX_H, Math.round(width * ratio)));
}

/**
 * Canvas 2D và CanvasTexture gắn với nó. Texture được giải phóng khi unmount.
 * Người dùng vẽ lên ctx rồi đặt texture.needsUpdate = true. Hook không tự vẽ lại theo khung hình.
 */
export function useScreenTexture(
  width: number,
  height: number,
): { ctx: CanvasRenderingContext2D | null; texture: THREE.CanvasTexture } {
  const canvas = useMemo(() => {
    const el = document.createElement('canvas');
    el.width = width;
    el.height = height;
    return el;
  }, [width, height]);

  const ctx = useMemo(() => canvas.getContext('2d'), [canvas]);

  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    return t;
  }, [canvas]);

  useEffect(() => () => texture.dispose(), [texture]);

  return { ctx, texture };
}
