import { isPoint } from './parse';
import type { Point, Stroke } from './types';

/* Vẽ nét dùng chung cho bảng trên tivi (WhiteboardScreen) và bảng trong DisplayPanel. */

/** Chiều rộng logic của mọi bảng. Độ dày nét đo theo chiều rộng này. */
export const BOARD_W = 1024;
export const BOARD_BG = '#f8fafc';
const DEFAULT_INK = '#111827';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_WIDTH = 64;

/** Sáu màu cố định của bảng vẽ. */
export const INK_PALETTE: readonly { hex: string; name: string }[] = [
  { hex: '#111827', name: 'Đen' },
  { hex: '#2563eb', name: 'Xanh dương' },
  { hex: '#dc2626', name: 'Đỏ' },
  { hex: '#16a34a', name: 'Xanh lá' },
  { hex: '#d97706', name: 'Cam' },
  { hex: '#7c3aed', name: 'Tím' },
];

/** Ba mức độ dày, đo px trên bảng rộng BOARD_W. */
export const INK_WIDTHS: readonly { px: number; name: string }[] = [
  { px: 3, name: 'Mảnh' },
  { px: 6, name: 'Vừa' },
  { px: 12, name: 'Đậm' },
];

/** Phần của nét cần để vẽ (không cần userName hay id). */
export type StrokeStyle = Pick<Stroke, 'points' | 'color' | 'width'>;

export function paintBoard(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, W, H);
}

/** Vẽ một nét dạng polyline, đầu và góc nối tròn. Nét một điểm vẽ thành chấm tròn. */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: StrokeStyle, W: number, H: number): void {
  const pts: Point[] = stroke.points.filter(isPoint);
  if (pts.length === 0) return;
  const width = Number.isFinite(stroke.width) ? Math.min(Math.max(stroke.width, 1), MAX_WIDTH) : INK_WIDTHS[1].px;
  const color = HEX_COLOR.test(stroke.color) ? stroke.color : DEFAULT_INK;
  const lineWidth = width * (W / BOARD_W);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (pts.length === 1) {
    ctx.arc(pts[0][0] * W, pts[0][1] * H, lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.moveTo(pts[0][0] * W, pts[0][1] * H);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i][0] * W, pts[i][1] * H);
  }
  ctx.stroke();
}

/** Vẽ các nét từ chỉ số `from` đến hết. */
export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly StrokeStyle[],
  W: number,
  H: number,
  from = 0,
): void {
  for (let i = from; i < strokes.length; i++) {
    drawStroke(ctx, strokes[i], W, H);
  }
}

/**
 * Giữ canvas của một bảng khớp với danh sách nét.
 * Thêm nét thì chỉ vẽ phần mới. Nét bị xoá (clear, hoặc nhận state mới) thì vẽ lại từ đầu.
 * Đồng nhất theo tham chiếu phần tử: danh sách mới có cùng phần tử ở vị trí cuối đã vẽ thì coi như chỉ thêm.
 */
export class BoardPainter {
  private drawn = 0;
  private last: Stroke | undefined = undefined;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly W: number,
    private readonly H: number,
  ) {
    paintBoard(ctx, W, H);
  }

  sync(strokes: readonly Stroke[]): void {
    const keep = this.drawn === 0 || (this.drawn <= strokes.length && strokes[this.drawn - 1] === this.last);
    let from = this.drawn;
    if (!keep) {
      paintBoard(this.ctx, this.W, this.H);
      from = 0;
    }
    drawStrokes(this.ctx, strokes, this.W, this.H, from);
    this.drawn = strokes.length;
    this.last = strokes[strokes.length - 1];
  }
}
