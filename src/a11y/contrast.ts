/** Kiểm tra tương phản WCAG 2.x và kích thước vùng chạm. Thuần, test được trong Node. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/** Hỗ trợ #rgb, #rrggbb, #rrggbbaa, rgb()/rgba(). null nếu không parse được. */
export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const h = m[1];
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) {
    const h = m[1];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: m[2] ? parseInt(m[2], 16) / 255 : undefined,
    };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const clamp = (n: number) => Math.max(0, Math.min(255, n));
    let a: number | undefined;
    if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: clamp(+m[1]), g: clamp(+m[2]), b: clamp(+m[3]), a };
  }
  return null;
}

/** Trộn màu có alpha lên nền đặc. */
export function composite(fg: Rgb, bg: Rgb): Rgb {
  const a = fg.a ?? 1;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  };
}

export function relativeLuminance(c: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

export function contrastRatio(fg: Rgb, bg: Rgb): number {
  const l1 = relativeLuminance(composite(fg, bg));
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export type ContrastKind = 'text' | 'large-text' | 'ui';

/** Ngưỡng: chữ thường AA 4.5 / AAA 7; chữ lớn AA 3 / AAA 4.5; thành phần giao diện 3. */
export function requiredRatio(kind: ContrastKind, level: 'AA' | 'AAA' = 'AA'): number {
  if (kind === 'text') return level === 'AA' ? 4.5 : 7;
  if (kind === 'large-text') return level === 'AA' ? 3 : 4.5;
  return 3;
}

/** Chữ lớn theo WCAG: >= 24px, hoặc >= 18.66px đậm (700+). */
export function isLargeText(fontPx: number, bold: boolean): boolean {
  return fontPx >= 24 || (bold && fontPx >= 18.66);
}

export interface ContrastResult {
  ratio: number;
  required: number;
  pass: boolean;
}

/** Trả null nếu một trong hai màu không parse được (không đoán). Nền phải đặc. */
export function checkContrast(
  fg: string,
  bg: string,
  kind: ContrastKind = 'text',
  level: 'AA' | 'AAA' = 'AA',
): ContrastResult | null {
  const f = parseColor(fg);
  const b = parseColor(bg);
  if (!f || !b) return null;
  const ratio = contrastRatio(f, b);
  const required = requiredRatio(kind, level);
  return { ratio: Math.round(ratio * 100) / 100, required, pass: ratio >= required };
}

/** WCAG 2.2 AA (2.5.8): tối thiểu 24x24 CSS px; khuyến nghị 44x44. */
export const TOUCH_TARGET = { minAA: 24, recommended: 44 } as const;

export interface TargetResult {
  pass: boolean;
  recommended: boolean;
  width: number;
  height: number;
}

export function checkTouchTarget(width: number, height: number): TargetResult {
  return {
    pass: width >= TOUCH_TARGET.minAA && height >= TOUCH_TARGET.minAA,
    recommended: width >= TOUCH_TARGET.recommended && height >= TOUCH_TARGET.recommended,
    width,
    height,
  };
}
