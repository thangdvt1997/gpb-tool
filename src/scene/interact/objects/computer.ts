import type { InteractableDef, Footprint, InteractPoint } from '../registry';
import { getObjectState, setObjectState, type ObjectState } from '../objectStates';
import { LOCAL_USER, chairOf } from './chair';
import { emitInteractEvent } from './interactEvents';

/** Máy tính: bật/tắt màn hình, đăng nhập giả, đổi hình nền, ghi chú, tài liệu giả lập. */
export interface ComputerState {
  on: boolean;
  /** '' = chưa đăng nhập. */
  user: string;
  wallpaper: number;
  note: string;
  doc: number;
}

export const COMPUTER_INITIAL = { on: false, user: '', wallpaper: 0, note: '', doc: 0 } as const;
export const WALLPAPER_COUNT = 4;
export const NOTE_MAX = 500;
export const SAMPLE_DOCS: readonly string[] = ['Báo cáo tuần', 'Kế hoạch quý', 'Danh sách việc cần làm'];

export function computerOf(s: ObjectState): ComputerState {
  return {
    on: s.on === true,
    user: typeof s.user === 'string' ? s.user : '',
    wallpaper: typeof s.wallpaper === 'number' ? s.wallpaper : 0,
    note: typeof s.note === 'string' ? s.note : '',
    doc: typeof s.doc === 'number' ? s.doc : 0,
  };
}

/** Tắt màn hình thì đăng xuất luôn. */
export function computerPower(s: ComputerState): Partial<ComputerState> {
  return s.on ? { on: false, user: '' } : { on: true };
}

/** Dùng máy: đánh thức (bật màn hình) và đăng nhập nếu chưa; đã sẵn sàng thì không đổi gì (null). */
export function computerWake(s: ComputerState, name: string): Partial<ComputerState> | null {
  const patch: Partial<ComputerState> = {};
  if (!s.on) patch.on = true;
  if (!s.on || s.user === '') patch.user = name.trim().slice(0, 24) || 'khach';
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Đóng giao diện: máy về nghỉ (tắt màn hình, đăng xuất). Đã nghỉ thì null. Ghi chú vẫn giữ. */
export function computerSleep(s: ComputerState): Partial<ComputerState> | null {
  return s.on || s.user !== '' ? { on: false, user: '' } : null;
}

/** Đăng nhập giả: chỉ khi đang bật, tên rỗng thì dùng 'khach'. */
export function computerLogin(s: ComputerState, name: string): Partial<ComputerState> | null {
  if (!s.on || s.user !== '') return null;
  return { user: name.trim().slice(0, 24) || 'khach' };
}

export function computerLogout(s: ComputerState): Partial<ComputerState> | null {
  return s.user === '' ? null : { user: '' };
}

export function computerWallpaper(s: ComputerState, delta = 1): Partial<ComputerState> {
  return { wallpaper: (((s.wallpaper + delta) % WALLPAPER_COUNT) + WALLPAPER_COUNT) % WALLPAPER_COUNT };
}

export function computerNote(s: ComputerState, text: string): Partial<ComputerState> | null {
  return s.user === '' ? null : { note: text.slice(0, NOTE_MAX) };
}

export function computerDoc(s: ComputerState, delta = 1): Partial<ComputerState> {
  const n = SAMPLE_DOCS.length;
  return { doc: (((s.doc + delta) % n) + n) % n };
}

/** Màn hình phát sáng: tắt = 0; chờ đăng nhập = dịu; đã đăng nhập = sáng. */
export function screenGlow(s: ComputerState): { color: number; intensity: number } {
  if (!s.on) return { color: 0x050505, intensity: 0 };
  if (s.user === '') return { color: 0x3a6ea5, intensity: 0.7 };
  return { color: [0x4a90d9, 0x2e8b57, 0x8e5bd9, 0xd98b4a][s.wallpaper % 4], intensity: 1.1 };
}

/** Điều kiện dùng: đứng trong bán kính trước bàn, hoặc đang ngồi đúng ghế gắn với máy. */
export function canUseComputer(
  player: { x: number; z: number },
  stand: { x: number; z: number },
  radius: number,
  seatedAtLinkedChair: boolean,
): boolean {
  return seatedAtLinkedChair || Math.hypot(player.x - stand.x, player.z - stand.z) <= radius;
}

export interface ComputerOptions {
  id: string;
  label?: string;
  footprint: Footprint;
  point: InteractPoint;
  /** Chỗ đứng hợp lệ trước bàn. */
  standAt: { x: number; z: number };
  standRadius?: number;
  /** Ghế gắn với máy (id vật ghế). */
  chairId?: string;
  getPlayer: () => { x: number; z: number };
  /** Mở giao diện máy tính trong ứng dụng + đưa camera gần màn hình (nối ở lớp UI). */
  openUi: (id: string) => void;
  who?: string;
}

export function computerInteractable(o: ComputerOptions): InteractableDef {
  const who = o.who ?? LOCAL_USER;
  const cur = () => computerOf(getObjectState(o.id));
  const usable = () =>
    canUseComputer(
      o.getPlayer(),
      o.standAt,
      o.standRadius ?? 1.1,
      o.chairId !== undefined && chairOf(getObjectState(o.chairId)).occupant === who,
    );
  const at = { x: o.footprint.cx, z: o.footprint.cz };
  const ev = (type: 'computer.on' | 'computer.off' | 'computer.login' | 'computer.logout') =>
    emitInteractEvent({ type, id: o.id, ...at });
  return {
    id: o.id,
    kind: 'computer',
    label: o.label ?? 'Máy tính',
    footprint: o.footprint,
    height: 0.5,
    baseY: 0.72,
    point: o.point,
    defaultState: COMPUTER_INITIAL,
    enabled: () => usable(),
    actions: [
      {
        id: 'use',
        label: 'Dùng máy tính',
        // Luôn dùng được khi đứng đúng chỗ: tự bật màn hình và đăng nhập rồi mở giao diện.
        run: () => {
          const p = computerWake(cur(), who);
          if (p) {
            const wasOn = cur().on;
            setObjectState(o.id, p);
            if (!wasOn) ev('computer.on');
            if (p.user !== undefined) ev('computer.login');
          }
          o.openUi(o.id);
        },
      },
      {
        id: 'login',
        label: 'Đăng nhập',
        when: (c) => computerOf(c.state).on && computerOf(c.state).user === '',
        run: () => {
          const p = computerLogin(cur(), who);
          if (p) {
            setObjectState(o.id, p);
            ev('computer.login');
            o.openUi(o.id);
          }
        },
      },
      {
        id: 'power',
        label: (c) => (computerOf(c.state).on ? 'Tắt màn hình' : 'Bật màn hình'),
        run: () => {
          const s = cur();
          setObjectState(o.id, computerPower(s));
          ev(s.on ? 'computer.off' : 'computer.on');
        },
      },
      {
        id: 'logout',
        label: 'Đăng xuất',
        when: (c) => computerOf(c.state).user !== '',
        run: () => {
          const p = computerLogout(cur());
          if (p) {
            setObjectState(o.id, p);
            ev('computer.logout');
          }
        },
      },
    ],
  };
}
