/**
 * API chọn vật và di chuyển bằng bàn phím / nút bấm (thay thế kéo thả).
 *
 * TRẠNG THÁI: CHƯA CÓ chế độ sắp xếp trong ứng dụng; module này chỉ là lớp logic thuần, chưa ai gọi.
 * Khi chế độ sắp xếp được làm, UI dùng lại: select -> step/setCell -> confirm | cancel.
 * Cùng API phục vụ bàn phím (mũi tên), người chỉ dùng một con trỏ (nút trái/phải/lên/xuống) và nhập số.
 * Module không chạm vào cảnh; kiểm tra va chạm do bên gọi truyền qua isValid.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export type Direction = 'left' | 'right' | 'up' | 'down';

export interface GridConfig {
  /** Kích thước ô lưới (m), > 0. */
  cell: number;
  /** Giới hạn vùng đặt (m), tùy chọn. */
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

const DIR: Record<Direction, Vec2> = {
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
  up: { x: 0, z: -1 },
  down: { x: 0, z: 1 },
};

/** Ánh xạ phím mũi tên sang hướng; undefined nếu không phải. */
export function directionFromKey(key: string): Direction | undefined {
  switch (key) {
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    default:
      return undefined;
  }
}

function snap(v: number, cell: number): number {
  const r = Math.round(v / cell) * cell;
  return Math.abs(r) < 1e-9 ? 0 : Math.round(r * 1e6) / 1e6;
}

export function snapToGrid(p: Vec2, grid: GridConfig): Vec2 {
  return { x: snap(p.x, grid.cell), z: snap(p.z, grid.cell) };
}

function clampToBounds(p: Vec2, grid: GridConfig): Vec2 {
  const b = grid.bounds;
  if (!b) return p;
  return {
    x: Math.min(b.maxX, Math.max(b.minX, p.x)),
    z: Math.min(b.maxZ, Math.max(b.minZ, p.z)),
  };
}

/**
 * Một bước theo lưới. Từ vị trí lệch lưới, bước đầu hút về ô lưới gần nhất theo hướng đó.
 * steps > 1 cho bước lớn (ví dụ Shift+mũi tên).
 */
export function stepOnGrid(from: Vec2, dir: Direction, grid: GridConfig, steps = 1): Vec2 {
  if (!(grid.cell > 0)) throw new Error('cell phải > 0');
  const d = DIR[dir];
  const axis = d.x !== 0 ? 'x' : 'z';
  const sign = d.x !== 0 ? d.x : d.z;
  const cellsF = from[axis] / grid.cell;
  const onGrid = Math.abs(cellsF - Math.round(cellsF)) < 1e-6;
  const base = onGrid ? Math.round(cellsF) : sign > 0 ? Math.ceil(cellsF) : Math.floor(cellsF);
  const target = onGrid ? base + sign * steps : base + sign * (steps - 1);
  const out: Vec2 = { x: from.x, z: from.z };
  out[axis] = snap(target * grid.cell, grid.cell);
  return clampToBounds(out, grid);
}

export type MovePhase = 'idle' | 'selected' | 'moving';

export interface MoveSession {
  phase: MovePhase;
  id: string | null;
  /** Vị trí gốc, dùng để hủy. */
  origin: Vec2 | null;
  /** Vị trí đề xuất hiện tại. */
  pos: Vec2 | null;
  /** Vị trí đề xuất có hợp lệ theo isValid; chỉ xác nhận được khi true. */
  valid: boolean;
  /** Nội dung cho aria-live sau thao tác gần nhất. */
  message: string;
}

export type MoveResult =
  | { type: 'committed'; id: string; from: Vec2; to: Vec2 }
  | { type: 'cancelled'; id: string; restore: Vec2 }
  | { type: 'rejected'; reason: string };

export interface MoveController {
  state(): MoveSession;
  /** Chọn vật để di chuyển; vị trí hiện tại được hút vào lưới làm vị trí đề xuất. */
  select(id: string, position: Vec2, label?: string): MoveSession;
  /** Bước theo hướng (phím mũi tên hoặc nút). */
  step(dir: Direction, steps?: number): MoveSession;
  /** Nhập số: đặt tới ô lưới (cellX, cellZ). */
  setCell(cellX: number, cellZ: number): MoveSession;
  /** Xác nhận (Enter). Từ chối nếu vị trí không hợp lệ. */
  confirm(): MoveResult;
  /** Hủy (Esc), trả về vị trí gốc. */
  cancel(): MoveResult;
}

export interface MoveControllerOptions {
  grid: GridConfig;
  /** Kiểm tra vị trí đề xuất. Mặc định luôn hợp lệ. */
  isValid?: (id: string, pos: Vec2) => boolean;
  /** Mô tả vị trí cho thông báo; mặc định theo ô lưới. */
  describe?: (pos: Vec2) => string;
}

const IDLE: MoveSession = { phase: 'idle', id: null, origin: null, pos: null, valid: false, message: '' };

export function createMoveController(opts: MoveControllerOptions): MoveController {
  let s: MoveSession = { ...IDLE };
  let name = '';
  const isValid = opts.isValid ?? (() => true);
  const where =
    opts.describe ??
    ((p: Vec2) => `ô ${Math.round(p.x / opts.grid.cell)}, ${Math.round(p.z / opts.grid.cell)}`);

  const propose = (pos: Vec2): MoveSession => {
    const valid = isValid(s.id as string, pos);
    s = {
      ...s,
      phase: 'moving',
      pos,
      valid,
      message: `${name} tại ${where(pos)}${valid ? '' : ', vị trí không hợp lệ'}`,
    };
    return s;
  };

  return {
    state: () => s,
    select(id, position, label) {
      name = label ?? id;
      const at = clampToBounds(snapToGrid(position, opts.grid), opts.grid);
      s = {
        phase: 'selected',
        id,
        origin: position,
        pos: at,
        valid: isValid(id, at),
        message: `Đã chọn ${name} tại ${where(at)}. Dùng mũi tên để di chuyển, Enter để xác nhận, Esc để hủy`,
      };
      return s;
    },
    step(dir, steps = 1) {
      if (s.phase === 'idle' || !s.pos) return s;
      return propose(stepOnGrid(s.pos, dir, opts.grid, steps));
    },
    setCell(cx, cz) {
      if (s.phase === 'idle') return s;
      const c = opts.grid.cell;
      return propose(clampToBounds({ x: snap(cx * c, c), z: snap(cz * c, c) }, opts.grid));
    },
    confirm() {
      if (s.phase === 'idle' || !s.pos || !s.origin || s.id === null) {
        return { type: 'rejected', reason: 'Chưa chọn vật' };
      }
      if (!s.valid) {
        s = { ...s, message: `Không thể đặt ${name} tại ${where(s.pos)}: vị trí không hợp lệ` };
        return { type: 'rejected', reason: 'Vị trí không hợp lệ' };
      }
      const res: MoveResult = { type: 'committed', id: s.id, from: s.origin, to: s.pos };
      s = { ...IDLE, message: `Đã đặt ${name} tại ${where(res.to)}` };
      return res;
    },
    cancel() {
      if (s.phase === 'idle' || !s.origin || s.id === null) {
        return { type: 'rejected', reason: 'Chưa chọn vật' };
      }
      const res: MoveResult = { type: 'cancelled', id: s.id, restore: s.origin };
      s = { ...IDLE, message: `Đã hủy, ${name} giữ nguyên vị trí` };
      return res;
    },
  };
}
