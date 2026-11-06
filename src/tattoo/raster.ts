/**
 * Rasterizer thuần: tài liệu xăm -> bộ đệm RGBA (Uint8ClampedArray) theo UV, không phụ thuộc DOM nên test được trong node.
 * Canvas chỉ là lớp mỏng phía trên (drawDocToCanvas). Quy ước UV: gốc trên trái, v hướng xuống (khớp texture.flipY = false).
 * Mọi nét/con dấu bị cắt theo mask vùng da (lưới 64x64 từ glbUv); mép đảo UV được dilate vài pixel để lọc bilinear/mip
 * không lộ đường nối.
 */
import { boxContains, maskContains, type RegionMask, type Side, type SkinRegion, type UvBox } from './regions';
import type { StampItem, StrokeItem, TattooDoc, TattooItem } from './schema';
import { getStampTemplate, TEXT_TEMPLATE_ID } from './templates';

/** Nửa cạnh mẫu ở scale = 1, theo đơn vị UV. */
export const STAMP_BASE_UV = 0.08;

export type TattooQuality = 'low' | 'medium' | 'high';
export const QUALITY_RES: Record<TattooQuality, number> = { low: 1024, medium: 1024, high: 2048 };
export function resolutionFor(q: TattooQuality): number {
  return QUALITY_RES[q] ?? 1024;
}

export interface PixelRect { x: number; y: number; w: number; h: number }

/** Hộp UV -> hình chữ nhật pixel (làm tròn ra ngoài, kẹp trong canvas). */
export function uvBoxToRect(b: UvBox, size: number): PixelRect {
  const x0 = Math.max(0, Math.floor(b.u0 * size));
  const y0 = Math.max(0, Math.floor(b.v0 * size));
  const x1 = Math.min(size, Math.ceil(b.u1 * size));
  const y1 = Math.min(size, Math.ceil(b.v1 * size));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** Mask thuộc vùng (và bên nếu có). Bên null khớp mọi bên. */
export function masksFor(masks: readonly RegionMask[], region: SkinRegion, side: Side | null): RegionMask[] {
  return masks.filter((m) => m.region === region && (side === null || m.side === side));
}

export function inRegion(ms: readonly RegionMask[], u: number, v: number): boolean {
  for (const m of ms) if (maskContains(m, u, v)) return true;
  return false;
}

/**
 * Kẹp điểm vào đảo UV hợp lệ: nằm trong thì giữ nguyên, ngoài thì chuyển tới tâm ô lưới thuộc vùng gần nhất.
 * Trả null nếu vùng không có ô nào (chưa có mask).
 */
export function clampToIsland(ms: readonly RegionMask[], u: number, v: number, res = 64): { u: number; v: number } | null {
  u = Math.min(1, Math.max(0, u));
  v = Math.min(1, Math.max(0, v));
  if (inRegion(ms, u, v)) return { u, v };
  let best: { u: number; v: number } | null = null;
  let bd = Infinity;
  for (const m of ms) {
    if (!m.grid) {
      const cu = Math.min(m.box.u1, Math.max(m.box.u0, u)), cv = Math.min(m.box.v1, Math.max(m.box.v0, v));
      const d = (cu - u) ** 2 + (cv - v) ** 2;
      if (d < bd) { bd = d; best = { u: cu, v: cv }; }
      continue;
    }
    const x0 = Math.max(0, Math.floor(m.box.u0 * res)), x1 = Math.min(res - 1, Math.floor(m.box.u1 * res));
    const y0 = Math.max(0, Math.floor(m.box.v0 * res)), y1 = Math.min(res - 1, Math.floor(m.box.v1 * res));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (m.grid[y * res + x] !== 1) continue;
        const cu = (x + 0.5) / res, cv = (y + 0.5) / res;
        const d = (cu - u) ** 2 + (cv - v) ** 2;
        if (d < bd) { bd = d; best = { u: cu, v: cv }; }
      }
    }
  }
  return best;
}

/** Nội suy đường gấp khúc [x0,y0,x1,y1...] thành các điểm cách nhau tối đa `step`. Một điểm vẫn cho một dấu chấm. */
export function densify(pts: readonly number[], step: number): number[] {
  const out: number[] = [];
  if (pts.length < 2) return out;
  step = Math.max(1e-6, step);
  out.push(pts[0], pts[1]);
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / step);
    for (let k = 1; k <= n; k++) out.push(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
  }
  return out;
}

/** Vùng phủ cục bộ (theo bbox) của một mục, giá trị 0..1. */
interface Coverage { x0: number; y0: number; w: number; h: number; a: Float32Array }

function newCoverage(x0: number, y0: number, x1: number, y1: number, size: number): Coverage | null {
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(size, Math.ceil(x1)); y1 = Math.min(size, Math.ceil(y1));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return null;
  return { x0, y0, w, h, a: new Float32Array(w * h) };
}

/** Chấm cọ tròn mép mềm 1px, lấy max để không cộng dồn độ đặc khi các chấm chồng nhau. */
function dab(c: Coverage, cx: number, cy: number, r: number, ok: (px: number, py: number) => boolean): void {
  const xa = Math.max(c.x0, Math.floor(cx - r - 1)), xb = Math.min(c.x0 + c.w - 1, Math.ceil(cx + r + 1));
  const ya = Math.max(c.y0, Math.floor(cy - r - 1)), yb = Math.min(c.y0 + c.h - 1, Math.ceil(cy + r + 1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const a = Math.min(1, Math.max(0, r - d + 0.5));
      if (a <= 0) continue;
      const i = (y - c.y0) * c.w + (x - c.x0);
      if (a > c.a[i] && ok(x, y)) c.a[i] = a;
    }
  }
}

function pathCoverage(paths: { pts: number[]; r: number }[], size: number, ok: (px: number, py: number) => boolean): Coverage | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of paths) {
    for (let i = 0; i + 1 < p.pts.length; i += 2) {
      minX = Math.min(minX, p.pts[i] - p.r); maxX = Math.max(maxX, p.pts[i] + p.r);
      minY = Math.min(minY, p.pts[i + 1] - p.r); maxY = Math.max(maxY, p.pts[i + 1] + p.r);
    }
  }
  const c = newCoverage(minX - 1, minY - 1, maxX + 1, maxY + 1, size);
  if (!c) return null;
  for (const p of paths) {
    const d = densify(p.pts, Math.max(0.5, p.r * 0.5));
    for (let i = 0; i + 1 < d.length; i += 2) dab(c, d[i], d[i + 1], Math.max(0.5, p.r), ok);
  }
  return c;
}

/** Hàm kiểm tra pixel nằm trong vùng của mục (tâm pixel -> UV -> mask). Chưa có mask thì không vẽ gì. */
function regionTest(masks: readonly RegionMask[], region: SkinRegion, side: Side | null, size: number): (x: number, y: number) => boolean {
  const ms = masksFor(masks, region, side);
  if (!ms.length) return () => false;
  return (x, y) => inRegion(ms, (x + 0.5) / size, (y + 0.5) / size);
}

function strokeCoverage(s: StrokeItem, masks: readonly RegionMask[], size: number): Coverage | null {
  const pts: number[] = [];
  for (let i = 0; i + 1 < s.points.length; i += 2) pts.push(s.points[i] * size, s.points[i + 1] * size);
  return pathCoverage([{ pts, r: s.size * size }], size, regionTest(masks, s.region, s.side, size));
}

/** Nguồn phủ chữ: alpha 8 bit w*h, do rasterText (canvas) hoặc test cung cấp. */
export interface TextBitmap { w: number; h: number; alpha: Uint8Array }
export type TextRasterizer = (text: string) => TextBitmap | null;

function stampCoverage(s: StampItem, masks: readonly RegionMask[], size: number, text?: TextRasterizer): Coverage | null {
  const ok = regionTest(masks, s.region, s.side, size);
  const half = STAMP_BASE_UV * s.scale * size;
  const cx = s.u * size, cy = s.v * size;
  const cos = Math.cos(s.rotation), sin = Math.sin(s.rotation);
  const fx = s.flipX ? -1 : 1;
  if (s.templateId === TEXT_TEMPLATE_ID) {
    const bm = text?.(s.text);
    if (!bm || bm.w <= 0 || bm.h <= 0) return null;
    // Cạnh dài của chữ khớp 2*half; mẫu chữ rộng hơn cao nên lấy theo chiều rộng.
    const k = (2 * half) / Math.max(bm.w, bm.h);
    const hw = (bm.w * k) / 2, hh = (bm.h * k) / 2;
    const rad = Math.hypot(hw, hh);
    const c = newCoverage(cx - rad, cy - rad, cx + rad, cy + rad, size);
    if (!c) return null;
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const px = c.x0 + x, py = c.y0 + y;
        if (!ok(px, py)) continue;
        // Ngược phép quay + lật để lấy mẫu bitmap.
        const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
        const lx = (dx * cos + dy * sin) * fx, ly = -dx * sin + dy * cos;
        const bx = (lx + hw) / k - 0.5, by = (ly + hh) / k - 0.5;
        if (bx < -0.5 || by < -0.5 || bx > bm.w - 0.5 || by > bm.h - 0.5) continue;
        const x0 = Math.floor(bx), y0 = Math.floor(by), tx = bx - x0, ty = by - y0;
        const g = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= bm.w || yy >= bm.h ? 0 : bm.alpha[yy * bm.w + xx] / 255);
        c.a[y * c.w + x] = g(x0, y0) * (1 - tx) * (1 - ty) + g(x0 + 1, y0) * tx * (1 - ty) + g(x0, y0 + 1) * (1 - tx) * ty + g(x0 + 1, y0 + 1) * tx * ty;
      }
    }
    return c;
  }
  const t = getStampTemplate(s.templateId);
  if (!t) return null;
  const paths = t.paths.map((p) => {
    const pts: number[] = [];
    for (let i = 0; i + 1 < p.pts.length; i += 2) {
      const lx = p.pts[i] * fx * half, ly = p.pts[i + 1] * half;
      pts.push(cx + lx * cos - ly * sin, cy + lx * sin + ly * cos);
    }
    return { pts, r: Math.max(0.5, p.width * half) };
  });
  return pathCoverage(paths, size, ok);
}

export function itemCoverage(it: TattooItem, masks: readonly RegionMask[], size: number, text?: TextRasterizer): Coverage | null {
  return it.type === 'stroke' ? strokeCoverage(it, masks, size) : stampCoverage(it, masks, size, text);
}

function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Hợp coverage vào bộ đệm lớp (straight alpha). erase = trừ alpha. */
function composite(buf: Uint8ClampedArray, size: number, c: Coverage, ink: string, opacity: number, erase: boolean): void {
  const [r, g, b] = hexRgb(ink);
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const a = c.a[y * c.w + x] * opacity;
      if (a <= 0) continue;
      const i = ((c.y0 + y) * size + (c.x0 + x)) * 4;
      const da = buf[i + 3] / 255;
      if (erase) { buf[i + 3] = Math.round(da * (1 - a) * 255); continue; }
      const oa = a + da * (1 - a);
      if (oa <= 0) continue;
      buf[i] = Math.round((r * a + buf[i] * da * (1 - a)) / oa);
      buf[i + 1] = Math.round((g * a + buf[i + 1] * da * (1 - a)) / oa);
      buf[i + 2] = Math.round((b * a + buf[i + 2] * da * (1 - a)) / oa);
      buf[i + 3] = Math.round(oa * 255);
    }
  }
}

/** Chồng src (cùng kích thước) lên dst bằng "over". */
function overLayer(dst: Uint8ClampedArray, src: Uint8ClampedArray): void {
  for (let i = 0; i < dst.length; i += 4) {
    const sa = src[i + 3] / 255;
    if (sa <= 0) continue;
    const da = dst[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    for (let k = 0; k < 3; k++) dst[i + k] = Math.round((src[i + k] * sa + dst[i + k] * da * (1 - sa)) / oa);
    dst[i + 3] = Math.round(oa * 255);
  }
}

/**
 * Chống tràn đường nối: lan màu + alpha sang pixel trong suốt kề bên `iterations` lần (lấy hàng xóm đặc nhất).
 * Nhờ vậy lọc bilinear/mipmap ở mép đảo UV không trộn với màu trong suốt đen.
 */
export function dilateEdges(data: Uint8ClampedArray, size: number, iterations: number): void {
  for (let it = 0; it < iterations; it++) {
    const src = data.slice();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        if (src[i + 3] !== 0) continue;
        let bj = -1, ba = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            const j = (ny * size + nx) * 4;
            if (src[j + 3] > ba) { ba = src[j + 3]; bj = j; }
          }
        }
        if (bj >= 0) { data[i] = src[bj]; data[i + 1] = src[bj + 1]; data[i + 2] = src[bj + 2]; data[i + 3] = src[bj + 3]; }
      }
    }
  }
}

export interface RenderOptions {
  text?: TextRasterizer;
  /** Số vòng dilate mép (mặc định 3 ở 1024, tỉ lệ theo kích thước). */
  dilate?: number;
  /** Chỉ vẽ một số vùng (khi xoá vùng xem trước). */
}

/** Vẽ cả tài liệu ra bộ đệm RGBA size x size (nền trong suốt). */
export function renderDoc(doc: TattooDoc, masks: readonly RegionMask[], size: number, opts: RenderOptions = {}): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  for (const layer of doc.layers) {
    if (!layer.visible || !layer.items.length) continue;
    const buf = new Uint8ClampedArray(size * size * 4);
    for (const it of layer.items) {
      const c = itemCoverage(it, masks, size, opts.text);
      if (c) composite(buf, size, c, it.ink, it.opacity, it.type === 'stroke' && it.erase);
    }
    overLayer(out, buf);
  }
  dilateEdges(out, size, opts.dilate ?? Math.max(1, Math.round((3 * size) / 1024)));
  return out;
}

/** Có pixel nào đặc không (để biết có xăm hay không). */
export function hasInk(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
  return false;
}

/** Điểm UV có hợp lệ cho vùng không (dùng cho UI trước khi nhận điểm). */
export function pointAllowed(masks: readonly RegionMask[], region: SkinRegion, side: Side | null, u: number, v: number): boolean {
  const ms = masksFor(masks, region, side);
  return ms.some((m) => boxContains(m.box, u, v)) && inRegion(ms, u, v);
}

/** Tạo canvas (DOM hoặc OffscreenCanvas); null nếu môi trường không có. */
export function createCanvas(size: number): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size);
  return null;
}

/** Vẽ chữ bằng font hệ thống lên canvas phụ, trả alpha. Không có canvas thì null (mẫu chữ bị bỏ qua). */
export const canvasTextRasterizer: TextRasterizer = (text) => {
  const fontPx = 96;
  const probe = createCanvas(8) as HTMLCanvasElement | null;
  const pctx = probe?.getContext?.('2d') as CanvasRenderingContext2D | null | undefined;
  if (!pctx) return null;
  const font = `700 ${fontPx}px system-ui, "Segoe UI", Arial, sans-serif`;
  pctx.font = font;
  const w = Math.max(8, Math.min(2048, Math.ceil(pctx.measureText(text).width) + 16));
  const h = fontPx + 32;
  const cv = createCanvas(1) as HTMLCanvasElement;
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 8, h / 2);
  const img = ctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = img[i * 4 + 3];
  return { w, h, alpha };
};

/** Vẽ bộ đệm lên canvas 2D (xoá trước). */
export function drawDocToCanvas(doc: TattooDoc, masks: readonly RegionMask[], canvas: HTMLCanvasElement | OffscreenCanvas, opts: RenderOptions = {}): void {
  const size = canvas.width;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return;
  const data = renderDoc(doc, masks, size, { text: canvasTextRasterizer, ...opts });
  ctx.clearRect(0, 0, size, size);
  ctx.putImageData(new ImageData(data, size, size), 0, 0);
}
