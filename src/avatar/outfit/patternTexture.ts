/**
 * Vẽ họa tiết và chữ của món đồ lên canvas (texture in lên mặt trước thân, xem setShellPattern).
 * Hàm vẽ chỉ cần giao diện 2D tối thiểu nên test được bằng ngữ cảnh giả.
 * Canvas phủ một hình vuông trên thân (tâm ngực); họa tiết lặp (sọc, ô, chấm...) phủ cả hình vuông,
 * chữ và hình đơn lẻ đặt theo offsetX/offsetY, scale, rotation của GarmentPattern.
 */
import { getPattern } from '../../fashion/catalog';
import type { GarmentPattern } from '../../fashion/types';

export const PATTERN_CANVAS_SIZE = 512;

/** Tập con của CanvasRenderingContext2D mà hàm vẽ dùng. */
export interface Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(a: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  fillText(t: string, x: number, y: number): void;
  measureText(t: string): { width: number };
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Vẽ một họa tiết vào ô [0,S]x[0,S]. Trả số lệnh vẽ đã thực hiện (để test). */
export function drawPattern(ctx: Ctx2D, p: GarmentPattern, S = PATTERN_CANVAS_SIZE): boolean {
  const def = getPattern(p.patternId);
  if (!def) return false;
  const k = def.params;
  ctx.save();
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.color;
  const sc = Math.max(0.2, p.scale);
  ctx.translate(S / 2 + p.offsetX * S * 0.5, S / 2 - p.offsetY * S * 0.5);
  ctx.rotate((p.rotation * Math.PI) / 180);
  const R = S * 0.8; // vùng vẽ quanh tâm đủ phủ khi xoay
  switch (def.kind) {
    case 'stripes':
    case 'pinstripe': {
      const n = Math.max(2, Math.round((k.lines ?? 10) / sc));
      const step = R / n;
      const w = step * Math.min(0.95, k.width ?? 0.5);
      for (let i = 0; i < n; i++) ctx.fillRect(-R / 2, -R / 2 + i * step, R, w);
      break;
    }
    case 'check':
    case 'gingham':
    case 'grid': {
      const n = Math.max(2, Math.round((k.cells ?? 8) / sc));
      const step = R / n;
      const w = step * Math.min(0.95, k.width ?? 0.15);
      ctx.globalAlpha = def.kind === 'gingham' ? 0.5 : 1;
      for (let i = 0; i < n; i++) {
        ctx.fillRect(-R / 2 + i * step, -R / 2, w, R);
        ctx.fillRect(-R / 2, -R / 2 + i * step, R, w);
      }
      break;
    }
    case 'dots': {
      const n = Math.max(2, Math.round((k.cells ?? 12) / sc));
      const step = R / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          ctx.beginPath();
          ctx.arc(-R / 2 + (i + 0.5 + (j % 2) * 0.5) * step, -R / 2 + (j + 0.5) * step, step * (k.radius ?? 0.22), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'chevron':
    case 'waves': {
      const n = Math.max(2, Math.round((k.lines ?? 8) / sc));
      const step = R / n;
      const amp = step * (k.amplitude ?? 0.3);
      ctx.lineWidth = Math.max(2, step * 0.22);
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        const y0 = -R / 2 + i * step;
        ctx.moveTo(-R / 2, y0);
        const segs = 24;
        for (let s = 1; s <= segs; s++) {
          const x = -R / 2 + (R * s) / segs;
          const ph = (s / segs) * (k.frequency ?? 6) * Math.PI * 2;
          const y = def.kind === 'waves' ? Math.sin(ph) * amp : (s % 2 ? -amp : amp);
          ctx.lineTo(x, y0 + y);
        }
        ctx.stroke();
      }
      break;
    }
    case 'triangles': {
      const n = Math.max(2, Math.round((k.cells ?? 10) / sc));
      const step = R / n;
      const f = k.fill ?? 0.6;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const x = -R / 2 + i * step;
          const y = -R / 2 + j * step;
          ctx.beginPath();
          ctx.moveTo(x + step / 2, y + step * (1 - f) / 2);
          ctx.lineTo(x + step * (1 - (1 - f) / 2), y + step * (1 - (1 - f) / 2));
          ctx.lineTo(x + step * (1 - f) / 2, y + step * (1 - (1 - f) / 2));
          ctx.closePath();
          ctx.fill();
        }
      }
      break;
    }
    case 'camo-abstract': {
      const r = rng(k.seed ?? 7);
      const n = Math.round((k.blobs ?? 5) * 5 / sc);
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.arc((r() - 0.5) * R, (r() - 0.5) * R, S * (0.04 + r() * 0.08) * sc, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'color-block': {
      ctx.rotate(((k.angle ?? 0) * Math.PI) / 180);
      ctx.fillRect(-R / 2, -R / 2 + R * (k.split ?? 0.5), R, R);
      break;
    }
    case 'leaf-outline': {
      const r = rng(k.seed ?? 3);
      const n = Math.max(2, Math.round((k.cells ?? 5) / sc));
      const step = R / n;
      ctx.lineWidth = Math.max(2, S * (k.stroke ?? 0.04) * 0.5);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const cx = -R / 2 + (i + 0.5) * step;
          const cy = -R / 2 + (j + 0.5) * step;
          const a = r() * Math.PI * 2;
          const L = step * 0.35;
          ctx.beginPath();
          ctx.moveTo(cx - Math.cos(a) * L, cy - Math.sin(a) * L);
          ctx.lineTo(cx + Math.cos(a - 0.5) * L, cy + Math.sin(a - 0.5) * L);
          ctx.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L);
          ctx.lineTo(cx + Math.cos(a + 0.5) * L, cy + Math.sin(a + 0.5) * L);
          ctx.closePath();
          ctx.stroke();
        }
      }
      break;
    }
    case 'text': {
      const text = p.text.trim();
      if (!text) break;
      let size = S * (k.size ?? 0.3) * sc;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(size)}px sans-serif`;
      while (size > 14 && ctx.measureText(text).width > S * 0.9) {
        size -= 6;
        ctx.font = `bold ${Math.round(size)}px sans-serif`;
      }
      ctx.fillText(text, 0, 0);
      break;
    }
  }
  ctx.restore();
  return true;
}

/** Vẽ toàn bộ họa tiết (theo thứ tự) lên canvas trong suốt. Trả số họa tiết đã vẽ. */
export function drawPatterns(ctx: Ctx2D, patterns: readonly GarmentPattern[], S = PATTERN_CANVAS_SIZE): number {
  ctx.clearRect(0, 0, S, S);
  let n = 0;
  for (const p of patterns) if (drawPattern(ctx, p, S)) n++;
  return n;
}

/** Họa tiết áp lên thân (mặt trước): chỉ vùng 'body' của áo; họa tiết ở vùng khác chưa in lên vỏ. */
export function bodyPatterns(patterns: readonly GarmentPattern[]): GarmentPattern[] {
  return patterns.filter((p) => p.zone === 'body');
}

export function patternSignature(patterns: readonly GarmentPattern[]): string {
  return JSON.stringify(bodyPatterns(patterns));
}
