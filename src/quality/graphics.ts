// Áp dụng thật ba tùy chọn đồ họa của TASK 13: texture tier, LOD khoảng cách, AO giả (quầng bóng tiếp xúc).
// Phần thuần (không cần WebGL) để vitest được; phần gắn vào cảnh nằm ở GraphicsApplier.tsx.

import * as THREE from 'three';
import type { QualityConfig } from './levels';

export type TextureTier = QualityConfig['textureTier'];

export interface TextureParams {
  /** Cạnh dài tối đa (px) của ảnh nguồn; ảnh lớn hơn bị hạ xuống. */
  maxSize: number;
  /** Anisotropy mong muốn (bị chặn bởi giới hạn GPU). */
  anisotropy: number;
}

/** Mức texture → tham số. Thấp: 1024 px, anisotropy 1. Trung bình: 2048 px, 4. Cao: 4096 px, 16 (trần GPU). */
export function textureParamsFor(tier: TextureTier): TextureParams {
  if (tier <= 0) return { maxSize: 1024, anisotropy: 1 };
  if (tier === 1) return { maxSize: 2048, anisotropy: 4 };
  return { maxSize: 4096, anisotropy: 16 };
}

type Sized = { width: number; height: number };
type Drawable = (HTMLImageElement | HTMLCanvasElement | ImageBitmap) & Sized;

interface TierUserData {
  gpbTier?: number;
  gpbOrig?: Drawable;
  gpbBaseAniso?: number;
}

function isDrawable(img: unknown): img is Drawable {
  if (!img || typeof img !== 'object') return false;
  const o = img as { width?: unknown; height?: unknown; data?: unknown };
  return typeof o.width === 'number' && typeof o.height === 'number' && o.data === undefined;
}

export type Resizer = (src: Drawable, w: number, h: number) => Drawable | null;

/** Hạ ảnh bằng canvas 2D; null nếu không có DOM/ngữ cảnh. */
export const canvasResize: Resizer = (src, w, h) => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
  return c;
};

/** Kích thước đích khi hạ ảnh để cạnh dài ≤ maxSize (giữ tỉ lệ, tối thiểu 1). Không hạ thì trả nguyên. */
export function fitSize(w: number, h: number, maxSize: number): { w: number; h: number } {
  const m = Math.max(w, h);
  if (m <= maxSize) return { w, h };
  const k = maxSize / m;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Texture có áp tier được không (ảnh thường; bỏ qua nén sẵn, dữ liệu thô, cube, video, render target). */
export function isTierable(tex: THREE.Texture): boolean {
  const t = tex as THREE.Texture & { isCompressedTexture?: boolean; isDataTexture?: boolean; isCubeTexture?: boolean; isVideoTexture?: boolean; isRenderTargetTexture?: boolean; isData3DTexture?: boolean };
  if (t.isCompressedTexture || t.isDataTexture || t.isCubeTexture || t.isVideoTexture || t.isRenderTargetTexture || t.isData3DTexture) return false;
  return true;
}

/**
 * Áp mức texture lên một texture: anisotropy = min(mức, trần GPU) và hạ ảnh nguồn nếu lớn hơn maxSize.
 * Ảnh gốc được giữ trong userData nên nâng mức lại thì khôi phục được. Trả true nếu có thay đổi (đã đặt needsUpdate).
 * Idempotent: gọi lại cùng tier là bỏ qua ngay.
 */
export function applyTextureTier(tex: THREE.Texture, tier: TextureTier, maxGpuAnisotropy: number, resize: Resizer = canvasResize): boolean {
  if (!isTierable(tex)) return false;
  const ud = tex.userData as TierUserData;
  if (ud.gpbTier === tier) return false;
  const p = textureParamsFor(tier);
  let changed = false;
  let resized = false;
  if (ud.gpbBaseAniso === undefined) ud.gpbBaseAniso = tex.anisotropy;
  const aniso = Math.max(1, Math.min(p.anisotropy, maxGpuAnisotropy || 1));
  if (tex.anisotropy !== aniso) { tex.anisotropy = aniso; changed = true; }

  const cur = tex.image as unknown;
  const orig = ud.gpbOrig ?? (isDrawable(cur) ? cur : undefined);
  // CanvasTexture do mã vẽ lại liên tục: không thay ảnh (chỉ chỉnh anisotropy).
  if (orig && !(tex as THREE.Texture & { isCanvasTexture?: boolean }).isCanvasTexture) {
    const { w, h } = fitSize(orig.width, orig.height, p.maxSize);
    const shown = tex.image as unknown as Sized | undefined;
    if (w !== (shown?.width ?? 0) || h !== (shown?.height ?? 0)) {
      if (w === orig.width && h === orig.height) {
        tex.image = orig;
        delete ud.gpbOrig;
        changed = true;
        resized = true;
      } else {
        const c = resize(orig, w, h);
        if (c) {
          ud.gpbOrig = orig;
          tex.image = c;
          changed = true;
          resized = true;
        }
      }
    }
  }
  ud.gpbTier = tier;
  // Đổi kích thước ảnh nguồn: phải giải phóng texture GPU cũ (bộ nhớ texStorage cố định cỡ), rồi tải lại.
  if (resized) tex.dispose();
  if (changed) tex.needsUpdate = true;
  return changed;
}

/** Áp tier lên mọi texture của một vật liệu (map, normalMap, roughnessMap, ...). Trả số texture đã đổi. */
export function applyTierToMaterial(mat: THREE.Material, tier: TextureTier, maxGpuAnisotropy: number, resize: Resizer = canvasResize): number {
  let n = 0;
  for (const v of Object.values(mat as unknown as Record<string, unknown>)) {
    if (v && (v as THREE.Texture).isTexture && applyTextureTier(v as THREE.Texture, tier, maxGpuAnisotropy, resize)) n++;
  }
  return n;
}

// ---------- LOD khoảng cách ----------

/** Khoảng cách (m) mà vật chi tiết có khoảng gốc `base` còn hiện, theo hệ số lodDistanceScale của mức. */
export function lodRange(base: number, scale: number): number {
  return Math.max(0, base * scale);
}

/** Hiện hay ẩn theo khoảng cách. Có trễ 8% quanh ngưỡng để không nhấp nháy khi đứng sát ranh. */
export function lodVisible(distance: number, base: number, scale: number, wasVisible: boolean): boolean {
  const r = lodRange(base, scale);
  return wasVisible ? distance <= r * 1.08 : distance <= r * 0.92;
}

/** Khoảng cách từ điểm tới hộp (0 nếu nằm trong hộp). */
export function distanceToBox(p: THREE.Vector3, b: THREE.Box3): number {
  const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x);
  const dy = Math.max(b.min.y - p.y, 0, p.y - b.max.y);
  const dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Khoảng cách gốc (m) gắn vào userData.lodDetail của vật chi tiết nhỏ (cây, băng rôn). */
export const LOD_BASE = { plant: 26, banner: 24 } as const;

// ---------- AO giả ----------

/**
 * Quầng AO từ hình học bóng tiếp xúc: mỗi ô (4 đỉnh) nở ra `spread` lần quanh tâm ô, alpha nhân `alphaScale`.
 * Chồng lên bóng tiếp xúc thì tạo vùng tối mềm rộng hơn quanh chân vật (giống AO), không tốn shadow map.
 */
export function buildAoHaloGeometry(src: THREE.BufferGeometry, spread = 1.7, alphaScale = 0.55): THREE.BufferGeometry {
  const g = src.clone();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const col = g.getAttribute('color') as THREE.BufferAttribute | undefined;
  for (let q = 0; q + 3 < pos.count; q += 4) {
    let cx = 0, cz = 0;
    for (let i = 0; i < 4; i++) { cx += pos.getX(q + i); cz += pos.getZ(q + i); }
    cx /= 4; cz /= 4;
    for (let i = 0; i < 4; i++) {
      pos.setX(q + i, cx + (pos.getX(q + i) - cx) * spread);
      pos.setZ(q + i, cz + (pos.getZ(q + i) - cz) * spread);
      if (col) col.setW(q + i, col.getW(q + i) * alphaScale);
    }
  }
  pos.needsUpdate = true;
  if (col) col.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

// ---------- Trạng thái quan sát (hook e2e + HUD) ----------

export interface GraphicsState {
  textureTier: TextureTier;
  lodDistanceScale: number;
  ambientOcclusion: boolean;
  /** Anisotropy thực của texture mẫu đầu tiên tìm thấy (null nếu cảnh chưa có texture). */
  sampleAnisotropy: number | null;
  /** Anisotropy lớn nhất trong các texture của cảnh. */
  maxAnisotropy: number;
  /** Cạnh dài lớn nhất của ảnh texture trong cảnh (px). */
  maxTextureSize: number;
  texturesTotal: number;
  lodTotal: number;
  lodHidden: number;
  aoHalos: number;
  aoVisible: number;
}

declare global {
  interface Window { __gpbGfx?: GraphicsState }
}
