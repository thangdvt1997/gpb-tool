// Lõi thuần của trình biên tập bố trí (TASK 17): reducer, kiểm tra hợp lệ, diff, quyền.
// Không chạm React, three hay mạng. Toạ độ thế giới three.js (mét), cùng hệ với src/layout.
import type { Role, ZoneObject } from '../content/types';
import { directionFromKey, stepOnGrid, type Direction } from '../a11y/keyboardMove';
import { fixedRectsOf, keepOutRectsOf } from '../layout/footprints';
import { isMovable } from '../layout/movable';
import { checkPlacement, nextRotation, rectOfPose } from '../layout/placement';
import type { LayoutState, Pose } from '../layout/types';
import type { Rect } from '../scene/layout';
import { officeCoverage } from '../scene/officeBounds';

export { directionFromKey };
export type { Direction };

/** Số bước hoàn tác tối đa; bước cũ nhất bị bỏ khi vượt. */
export const HISTORY_LIMIT = 100;
/** Máy chủ làm tròn toạ độ tới 0,1 m, nên bước lưới là bội của 0,1. */
export const GRID_STEPS: readonly number[] = [0.1, 0.2, 0.5, 1];
export const DEFAULT_GRID = 0.5;

export type Poses = Record<string, Pose>;

/** Dữ liệu tĩnh của cảnh dùng để kiểm tra va chạm. Tạo bằng buildEditorEnv. */
export interface EditorEnv {
  /** Kích thước chưa xoay của từng vật di chuyển được. */
  sizes: Record<string, { w: number; h: number; d: number; centerY: number }>;
  fixed: readonly Rect[];
  keepOut: readonly Rect[];
}

export function buildEditorEnv(objects: readonly ZoneObject[]): EditorEnv {
  const sizes: EditorEnv['sizes'] = {};
  for (const o of objects) {
    if (!isMovable(o.id)) continue;
    sizes[o.id] = { w: o.size[0], h: o.size[1], d: o.size[2], centerY: o.position[1] };
  }
  return { sizes, fixed: fixedRectsOf(objects), keepOut: keepOutRectsOf(objects) };
}

/** Chỉ it và admin được sửa; vai trò khác chỉ xem. */
export function canEditLayout(role: Role | null | undefined): boolean {
  return role === 'it' || role === 'admin';
}

export interface Preview {
  pose: Pose;
  valid: boolean;
  reason: string | null;
}

export interface EditorState {
  env: EditorEnv;
  canEdit: boolean;
  active: boolean;
  defaults: Poses;
  /** Bản đã lưu trên máy chủ (items đè lên defaults). */
  saved: Poses;
  savedVersion: number;
  /** Bản nháp đang sửa. */
  draft: Poses;
  selectedId: string | null;
  gridStep: number;
  snap: boolean;
  past: Poses[];
  future: Poses[];
  /** Đang kéo: lưu bản nháp trước khi kéo, chỉ đẩy vào lịch sử khi thả hợp lệ. */
  drag: { id: string; before: Poses } | null;
  preview: Preview | null;
  saving: boolean;
  /** Thông báo cho aria-live. */
  message: string;
}

/** Bản đã lưu = defaults đè bởi items của máy chủ. */
export function effectivePoses(s: Pick<LayoutState, 'items' | 'defaults'>, ids: readonly string[] = Object.keys(s.defaults)): Poses {
  const out: Poses = {};
  for (const id of ids) {
    const p = s.items[id] ?? s.defaults[id];
    if (p) out[id] = { x: p.x, z: p.z, rotation: p.rotation };
  }
  return out;
}

export function createEditorState(env: EditorEnv, role: Role | null | undefined, server?: LayoutState): EditorState {
  const saved = server ? effectivePoses(server) : {};
  return {
    env,
    canEdit: canEditLayout(role),
    active: false,
    defaults: server ? { ...server.defaults } : {},
    saved,
    savedVersion: server?.version ?? 0,
    draft: { ...saved },
    selectedId: null,
    gridStep: DEFAULT_GRID,
    snap: true,
    past: [],
    future: [],
    drag: null,
    preview: null,
    saving: false,
    message: '',
  };
}

export function samePose(a: Pose | undefined, b: Pose | undefined): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6 && a.rotation === b.rotation;
}

export interface DiffEntry {
  id: string;
  from: Pose;
  to: Pose;
  /** true khi bản nháp trở về đúng vị trí mặc định. */
  toDefault: boolean;
}

/** Danh sách vật khác nhau giữa bản đã lưu và bản nháp, theo thứ tự id. */
export function diffPoses(saved: Poses, draft: Poses, defaults: Poses = {}): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (const id of Object.keys(draft).sort()) {
    const from = saved[id];
    const to = draft[id];
    if (from && !samePose(from, to)) out.push({ id, from, to, toDefault: samePose(defaults[id], to) });
  }
  return out;
}

export function isDirty(s: EditorState): boolean {
  return diffPoses(s.saved, s.draft, s.defaults).length > 0;
}

/** Làm tròn về 0,1 m như máy chủ, để bản nháp khớp bản sẽ lưu. */
export function quantize(v: number): number {
  return Math.round(v * 10) / 10 + 0;
}

function snapValue(v: number, step: number): number {
  return quantize(Math.round(v / step) * step);
}

/**
 * Kiểm tra vị trí của vật id trong bản poses: nằm trọn trong chữ L, không vào vùng cấm,
 * không chồng/quá sát vật cố định và các vật di chuyển khác. Dùng lại checkPlacement và officeCoverage.
 */
export function validatePose(env: EditorEnv, poses: Poses, id: string, pose: Pose): { valid: boolean; reason: string | null } {
  const size = env.sizes[id];
  if (!size) return { valid: false, reason: 'Vật này không sửa được.' };
  const rect = rectOfPose(pose, size.w, size.d);
  if (officeCoverage(rect) !== 'inside') return { valid: false, reason: 'Ra ngoài phạm vi văn phòng hình chữ L.' };
  const movables: Rect[] = [];
  for (const [oid, p] of Object.entries(poses)) {
    const sz = env.sizes[oid];
    if (oid !== id && sz) movables.push(rectOfPose(p, sz.w, sz.d));
  }
  return checkPlacement(rect, { fixed: env.fixed, keepOut: env.keepOut, movables });
}

export type EditorAction =
  | { type: 'enter' }
  /** Đồng bộ dữ liệu máy chủ khi KHÔNG biên tập (SSE, tải lần đầu). Bỏ qua nếu đang biên tập. */
  | { type: 'sync'; server: LayoutState; env?: EditorEnv; role?: Role | null }
  | { type: 'exit' } // hủy: bỏ bản nháp, về bản đã lưu
  | { type: 'select'; id: string | null }
  | { type: 'nudge'; dir: Direction; steps?: number }
  | { type: 'moveTo'; x: number; z: number }
  | { type: 'rotate' }
  | { type: 'dragStart' }
  | { type: 'dragMove'; x: number; z: number }
  | { type: 'dragEnd' }
  | { type: 'dragCancel' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'resetItem'; id?: string }
  | { type: 'resetAll' }
  | { type: 'setGrid'; step: number }
  | { type: 'toggleSnap' }
  | { type: 'saveStart' }
  /** Lưu xong: bản nháp trở thành bản đã lưu. */
  | { type: 'saveDone'; version: number }
  /** Lưu lỗi (không phải xung đột): giữ nguyên nháp. */
  | { type: 'saveFailed'; message: string }
  /** Xung đột 409: nạp lại máy chủ, giữ phần nháp mà người dùng đã sửa. */
  | { type: 'conflict'; server: LayoutState; id: string };

/** Đẩy bản nháp hiện tại vào lịch sử (có giới hạn) và xoá làm lại. */
function pushHistory(s: EditorState, before: Poses): Pick<EditorState, 'past' | 'future'> {
  const past = [...s.past, before];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, future: [] };
}

const nameOf = (id: string) => id;

function deny(s: EditorState, message: string): EditorState {
  return { ...s, message };
}

function commit(s: EditorState, id: string, pose: Pose, verb: string): EditorState {
  const check = validatePose(s.env, s.draft, id, pose);
  if (!check.valid) return deny(s, `Không thể ${verb} ${nameOf(id)}: ${check.reason}`);
  if (samePose(s.draft[id], pose)) return s;
  return {
    ...s,
    ...pushHistory(s, s.draft),
    draft: { ...s.draft, [id]: pose },
    message: `${nameOf(id)} tại ${pose.x}, ${pose.z}, xoay ${pose.rotation} độ`,
  };
}

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  if (a.type === 'enter') {
    if (!s.canEdit) return deny(s, 'Chỉ IT hoặc admin mới được sửa bố trí.');
    return { ...s, active: true, message: 'Đã vào chế độ sắp xếp nội thất.' };
  }
  if (a.type === 'sync') {
    if (s.active) return s;
    const base = createEditorState(a.env ?? s.env, a.role === undefined ? (s.canEdit ? 'it' : null) : a.role, a.server);
    return { ...base, gridStep: s.gridStep, snap: s.snap, message: s.message };
  }
  if (a.type === 'conflict') return rebase(s, a.server, a.id);
  if (a.type === 'saveDone') {
    return {
      ...s,
      saved: { ...s.draft },
      savedVersion: a.version,
      past: [],
      future: [],
      saving: false,
      message: 'Đã lưu bố trí.',
    };
  }
  if (a.type === 'saveFailed') return { ...s, saving: false, message: a.message };
  if (!s.active) return s;
  if (s.saving) return s; // khoá thao tác khi đang lưu

  switch (a.type) {
    case 'exit':
      return { ...s, active: false, draft: { ...s.saved }, past: [], future: [], drag: null, preview: null, selectedId: null, message: 'Đã hủy, bố trí giữ như bản đã lưu.' };
    case 'select':
      if (a.id !== null && !s.env.sizes[a.id]) return deny(s, 'Vật này không sửa được.');
      return { ...s, selectedId: a.id, drag: null, preview: null, message: a.id ? `Đã chọn ${nameOf(a.id)}.` : 'Đã bỏ chọn.' };
    case 'setGrid': {
      if (!Number.isFinite(a.step) || a.step <= 0) return deny(s, 'Bước lưới phải lớn hơn 0.');
      const step = Math.min(5, Math.max(0.1, quantize(a.step)));
      return { ...s, gridStep: step, message: `Bước lưới ${step} m.` };
    }
    case 'toggleSnap':
      return { ...s, snap: !s.snap, message: s.snap ? 'Tắt bắt lưới.' : 'Bật bắt lưới.' };
    case 'undo': {
      if (s.drag || s.past.length === 0) return deny(s, 'Không còn bước để hoàn tác.');
      const prev = s.past[s.past.length - 1];
      return { ...s, draft: prev, past: s.past.slice(0, -1), future: [...s.future, s.draft], message: 'Đã hoàn tác.' };
    }
    case 'redo': {
      if (s.drag || s.future.length === 0) return deny(s, 'Không còn bước để làm lại.');
      const next = s.future[s.future.length - 1];
      return { ...s, draft: next, future: s.future.slice(0, -1), past: [...s.past, s.draft], message: 'Đã làm lại.' };
    }
    case 'resetItem': {
      const id = a.id ?? s.selectedId;
      if (!id || !s.defaults[id] || !s.env.sizes[id]) return deny(s, 'Chưa chọn vật để đặt lại.');
      if (samePose(s.draft[id], s.defaults[id])) return deny(s, `${nameOf(id)} đã ở vị trí mặc định.`);
      return { ...s, ...pushHistory(s, s.draft), draft: { ...s.draft, [id]: { ...s.defaults[id] } }, message: `Đã đặt lại ${nameOf(id)} về mặc định.` };
    }
    case 'resetAll': {
      const draft: Poses = {};
      for (const id of Object.keys(s.draft)) draft[id] = s.defaults[id] ? { ...s.defaults[id] } : s.draft[id];
      if (diffPoses(s.draft, draft).length === 0) return deny(s, 'Mọi vật đã ở vị trí mặc định.');
      return { ...s, ...pushHistory(s, s.draft), draft, message: 'Đã đặt lại toàn bộ về mặc định.' };
    }
    case 'saveStart':
      return isDirty(s) ? { ...s, saving: true, message: 'Đang lưu...' } : deny(s, 'Không có thay đổi để lưu.');
    default:
      break;
  }

  // Các thao tác cần vật đang chọn.
  const id = s.selectedId;
  if (!id) return deny(s, 'Chưa chọn vật.');
  const cur = s.draft[id];
  if (!cur) return deny(s, 'Vật chưa có dữ liệu vị trí.');

  switch (a.type) {
    case 'nudge': {
      const base = s.drag && s.preview ? s.preview.pose : cur;
      let x: number;
      let z: number;
      if (s.snap) {
        const p = stepOnGrid({ x: base.x, z: base.z }, a.dir, { cell: s.gridStep }, a.steps ?? 1);
        x = quantize(p.x);
        z = quantize(p.z);
      } else {
        const n = (a.steps ?? 1) * s.gridStep;
        x = quantize(base.x + (a.dir === 'left' ? -n : a.dir === 'right' ? n : 0));
        z = quantize(base.z + (a.dir === 'up' ? -n : a.dir === 'down' ? n : 0));
      }
      return commit(s, id, { ...cur, x, z }, 'di chuyển');
    }
    case 'moveTo': {
      if (!Number.isFinite(a.x) || !Number.isFinite(a.z)) return deny(s, 'Toạ độ phải là số.');
      const x = s.snap ? snapValue(a.x, s.gridStep) : quantize(a.x);
      const z = s.snap ? snapValue(a.z, s.gridStep) : quantize(a.z);
      return commit(s, id, { ...cur, x, z }, 'di chuyển');
    }
    case 'rotate':
      return commit(s, id, { ...cur, rotation: nextRotation(cur.rotation) }, 'xoay');
    case 'dragStart':
      return { ...s, drag: { id, before: s.draft }, preview: { pose: cur, valid: true, reason: null }, message: `Đang kéo ${nameOf(id)}.` };
    case 'dragMove': {
      if (!s.drag || !Number.isFinite(a.x) || !Number.isFinite(a.z)) return s;
      const x = s.snap ? snapValue(a.x, s.gridStep) : quantize(a.x);
      const z = s.snap ? snapValue(a.z, s.gridStep) : quantize(a.z);
      const pose = { ...cur, x, z };
      if (s.preview && samePose(s.preview.pose, pose)) return s;
      // Chỉ cập nhật preview, chưa động vào lịch sử: kéo liên tục không sinh hàng nghìn bước.
      return { ...s, preview: { pose, ...validatePose(s.env, s.draft, id, pose) } };
    }
    case 'dragEnd': {
      if (!s.drag || !s.preview) return { ...s, drag: null, preview: null };
      const { pose, valid, reason } = s.preview;
      if (!valid) return { ...s, drag: null, preview: null, message: `Thả không hợp lệ: ${reason}. Vật về chỗ cũ.` };
      if (samePose(cur, pose)) return { ...s, drag: null, preview: null };
      return {
        ...s,
        ...pushHistory(s, s.drag.before), // một bước duy nhất cho cả lần kéo
        draft: { ...s.draft, [id]: pose },
        drag: null,
        preview: null,
        message: `${nameOf(id)} tại ${pose.x}, ${pose.z}`,
      };
    }
    case 'dragCancel':
      return { ...s, drag: null, preview: null, message: 'Đã hủy kéo.' };
    default:
      return s;
  }
}

/**
 * Xung đột 409: nạp bản máy chủ mới. Vật người dùng chưa sửa lấy theo máy chủ; vật đã sửa giữ bản nháp
 * (có thể vẫn xung đột, người dùng tự xử lý). Lịch sử bị xoá vì nền đã đổi.
 */
function rebase(s: EditorState, server: LayoutState, id: string): EditorState {
  const fresh = effectivePoses(server);
  const draft: Poses = { ...fresh };
  for (const e of diffPoses(s.saved, s.draft, s.defaults)) draft[e.id] = e.to;
  return {
    ...s,
    defaults: { ...server.defaults },
    saved: fresh,
    savedVersion: server.version,
    draft,
    past: [],
    future: [],
    drag: null,
    preview: null,
    saving: false,
    message: `Xung đột khi lưu ${nameOf(id)}: có người đã đổi bố trí. Đã tải lại bản mới, giữ thay đổi của bạn để kiểm tra lại.`,
  };
}

/** Ánh xạ phím sang hành động. Trả null nếu không xử lý. */
export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export type KeyIntent = EditorAction | { type: 'save' };

export function actionForKey(e: KeyLike): KeyIntent | null {
  const mod = !!(e.ctrlKey || e.metaKey);
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod) {
    if (k === 'z') return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
    if (k === 'y') return { type: 'redo' };
    if (k === 's') return { type: 'save' };
    return null;
  }
  if (k === 'r') return { type: 'rotate' };
  if (k === 'Delete' || k === 'Backspace') return { type: 'resetItem' };
  if (k === 'Escape') return { type: 'exit' };
  const dir = directionFromKey(k);
  if (dir) return { type: 'nudge', dir, steps: e.shiftKey ? 5 : 1 };
  return null;
}
