// Lõi thuần của trình biên tập bố trí (TASK 17): reducer, kiểm tra hợp lệ, diff, quyền.
// Không chạm React, three hay mạng. Toạ độ thế giới three.js (mét), cùng hệ với src/layout.
import type { Role, ZoneObject } from '../content/types';
import { directionFromKey, stepOnGrid, type Direction } from '../a11y/keyboardMove';
import { fixedRectsOf, keepOutRectsOf } from '../layout/footprints';
import { isMovable } from '../layout/movable';
import { checkPlacement, inflate, nextRotation, overlaps, rectOfPose, SAFE_GAP } from '../layout/placement';
import type { LayoutState, Pose, PropRecord } from '../layout/types';
import { duplicateKindOf, isPropId, isPropKind, MAX_PROPS, PROP_CATALOG, PROP_GAP, propRects, type PropKind } from './props';
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
  /** Loại của từng vật thêm (id p_...). Không có khi chưa có vật thêm. */
  props?: Record<string, PropKind>;
}

/** Thêm kích thước và loại của các vật thêm vào env (id đã có thì giữ nguyên). */
export function withProps(env: EditorEnv, props: Record<string, { kind: string }> | undefined): EditorEnv {
  if (!props) return env;
  let out = env;
  for (const [id, p] of Object.entries(props)) {
    if (!isPropKind(p.kind) || out.sizes[id]) continue;
    out = addPropToEnv(out, id, p.kind);
  }
  return out;
}

function addPropToEnv(env: EditorEnv, id: string, kind: PropKind): EditorEnv {
  const [w, h, d] = PROP_CATALOG[kind].size;
  return { ...env, sizes: { ...env.sizes, [id]: { w, h, d, centerY: h / 2 } }, props: { ...env.props, [id]: kind } };
}

/**
 * Vật di chuyển được mà it.json không có (tivi, bảng, cây dựng từ itFixtures.ts). Máy chủ biết kích thước qua zone.json;
 * thiếu ở đây thì client không thấy chúng là vật cản và đặt vật mới đè lên (máy chủ từ chối 409).
 * Kích thước khớp services/layout/data/zone.json.
 */
export const FIXTURE_SIZES: Readonly<Record<string, { w: number; h: number; d: number; centerY: number }>> = {
  tv_lobby: { w: 1.2, h: 0.7, d: 0.1, centerY: 1.5 },
  tv_lounge: { w: 1.45, h: 0.83, d: 0.1, centerY: 1.5 },
  tv_meeting: { w: 1.2, h: 0.7, d: 0.1, centerY: 1.5 },
  whiteboard_mr1: { w: 2, h: 1.2, d: 0.1, centerY: 1.4 },
  design_board: { w: 2, h: 1.2, d: 0.1, centerY: 1.4 },
  plant_lobby: { w: 0.8, h: 1.2, d: 0.8, centerY: 0.6 },
  plant_lounge_a: { w: 0.8, h: 1.2, d: 0.8, centerY: 0.6 },
  plant_lounge_b: { w: 0.8, h: 1.2, d: 0.8, centerY: 0.6 },
  plant_meeting: { w: 0.8, h: 1.2, d: 0.8, centerY: 0.6 },
  plant_north: { w: 0.8, h: 1.2, d: 0.8, centerY: 0.6 },
};

export function buildEditorEnv(objects: readonly ZoneObject[]): EditorEnv {
  const sizes: EditorEnv['sizes'] = {};
  for (const o of objects) {
    if (!isMovable(o.id)) continue;
    sizes[o.id] = { w: o.size[0], h: o.size[1], d: o.size[2], centerY: o.position[1] };
  }
  for (const [id, sz] of Object.entries(FIXTURE_SIZES)) {
    if (!sizes[id] && isMovable(id)) sizes[id] = sz;
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
export function effectivePoses(s: Pick<LayoutState, 'items' | 'defaults'> & { props?: LayoutState['props'] }, ids: readonly string[] = Object.keys(s.defaults)): Poses {
  const out: Poses = {};
  for (const id of ids) {
    const p = s.items[id] ?? s.defaults[id];
    if (p) out[id] = { x: p.x, z: p.z, rotation: p.rotation };
  }
  for (const [id, p] of Object.entries(s.props ?? {})) {
    if (isPropKind(p.kind)) out[id] = propPose(p);
  }
  return out;
}

function propPose(p: Pose | PropRecord): Pose {
  return p.door ? { x: p.x, z: p.z, rotation: p.rotation, door: true } : { x: p.x, z: p.z, rotation: p.rotation };
}

export function createEditorState(env0: EditorEnv, role: Role | null | undefined, server?: LayoutState): EditorState {
  const saved = server ? effectivePoses(server) : {};
  const env = withProps(env0, server?.props);
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
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6 && a.rotation === b.rotation && !!a.door === !!b.door;
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
    if (isPropId(id)) continue; // vật thêm đi theo buildBatchOps
    const from = saved[id];
    const to = draft[id];
    if (from && !samePose(from, to)) out.push({ id, from, to, toDefault: samePose(defaults[id], to) });
  }
  return out;
}

/** Thao tác gửi lên máy chủ trong một yêu cầu batch (POST /api/layout/batch). */
export type BatchOp =
  | { op: 'move'; id: string; x: number; z: number; rotation: Pose['rotation'] }
  | { op: 'reset'; id: string }
  | { op: 'put'; id: string; kind: PropKind; x: number; z: number; rotation: Pose['rotation']; door: boolean }
  | { op: 'remove'; id: string };

/** Mọi thay đổi giữa bản đã lưu và bản nháp: xóa, thêm/sửa vật thêm, rồi di chuyển/đặt lại vật gốc. */
export function buildBatchOps(s: Pick<EditorState, 'saved' | 'draft' | 'defaults' | 'env'>): BatchOp[] {
  const ops: BatchOp[] = [];
  for (const id of Object.keys(s.saved).sort()) {
    if (isPropId(id) && !s.draft[id]) ops.push({ op: 'remove', id });
  }
  for (const id of Object.keys(s.draft).sort()) {
    const kind = s.env.props?.[id];
    if (!isPropId(id) || !kind) continue;
    const to = s.draft[id];
    if (!samePose(s.saved[id], to)) ops.push({ op: 'put', id, kind, x: to.x, z: to.z, rotation: to.rotation, door: !!to.door });
  }
  for (const e of diffPoses(s.saved, s.draft, s.defaults)) {
    ops.push(e.toDefault ? { op: 'reset', id: e.id } : { op: 'move', id: e.id, x: e.to.x, z: e.to.z, rotation: e.to.rotation });
  }
  return ops;
}

export function isDirty(s: EditorState): boolean {
  return buildBatchOps(s).length > 0;
}

/** Mô tả ngắn các thay đổi cho người dùng: id vật gốc đã đổi, "thêm X", "sửa X", "xóa X". */
export function describeChanges(s: Pick<EditorState, 'saved' | 'draft' | 'defaults' | 'env'>): string[] {
  const label = (id: string) => PROP_CATALOG[s.env.props?.[id] ?? 'table'].label;
  return buildBatchOps(s).map((o) => {
    if (o.op === 'remove') return `xóa ${label(o.id)}`;
    if (o.op === 'put') return `${s.saved[o.id] ? 'sửa' : 'thêm'} ${label(o.id)}`;
    return o.id;
  });
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
  const selfProp = isPropId(id);
  const selfWall = selfProp && !!env.props && PROP_CATALOG[env.props[id]]?.wall;
  const movables: Rect[] = [];
  const others: Rect[] = [];
  for (const [oid, p] of Object.entries(poses)) {
    const sz = env.sizes[oid];
    if (oid === id || !sz) continue;
    const r = rectOfPose(p, sz.w, sz.d);
    if (!selfProp || !isPropId(oid)) movables.push(r); // gốc-gốc, gốc-thêm, thêm-gốc: giữ SAFE_GAP như cũ
    else if (!(selfWall && PROP_CATALOG[env.props?.[oid] ?? 'table']?.wall)) others.push(r); // hai tường được chạm/nối nhau
  }
  const base = checkPlacement(rect, { fixed: env.fixed, keepOut: env.keepOut, movables });
  if (!base.valid) return base;
  for (const r of others) {
    if (overlaps(rect, r)) return { valid: false, reason: 'Chồng lên vật khác.' };
    if (overlaps(rect, inflate(r, PROP_GAP))) return { valid: false, reason: `Cần cách vật khác tối thiểu ${PROP_GAP} m.` };
  }
  return base;
}

/**
 * Tìm chỗ trống gần anchor (lưới 0,5 m, gần nhất trước) cho vật id đã có trong env.sizes.
 * null nếu không còn chỗ nào hợp lệ.
 */
export function findFreeSpot(env: EditorEnv, poses: Poses, id: string, anchor: { x: number; z: number }, rotation: Pose['rotation'] = 0): Pose | null {
  const STEP = 0.5;
  const cx = Math.round(anchor.x / STEP) * STEP;
  const cz = Math.round(anchor.z / STEP) * STEP;
  const cands: Array<{ x: number; z: number; d: number }> = [];
  for (let x = -29; x <= 29; x += STEP) {
    for (let z = -15; z <= 15; z += STEP) cands.push({ x, z, d: Math.hypot(x - cx, z - cz) });
  }
  cands.sort((a, b) => a.d - b.d);
  for (const c of cands) {
    const pose: Pose = { x: quantize(c.x), z: quantize(c.z), rotation };
    if (validatePose(env, poses, id, pose).valid) return pose;
  }
  return null;
}

export type EditorAction =
  | { type: 'enter' }
  /** Đồng bộ dữ liệu máy chủ khi KHÔNG biên tập (SSE, tải lần đầu). Bỏ qua nếu đang biên tập. */
  | { type: 'sync'; server: LayoutState; env?: EditorEnv; role?: Role | null }
  /** Khôi phục bản nháp cục bộ (đã áp lên máy chủ bằng applyDraft) và vào chế độ biên tập. */
  | { type: 'restoreDraft'; env: EditorEnv; draft: Poses; message: string }
  | { type: 'exit' } // hủy: bỏ bản nháp, về bản đã lưu
  | { type: 'select'; id: string | null }
  | { type: 'nudge'; dir: Direction; steps?: number }
  | { type: 'moveTo'; x: number; z: number }
  | { type: 'rotate' }
  /** Thêm vật mới từ danh mục. id do nơi phát hành sinh (newPropId) để reducer thuần. at: điểm neo tìm chỗ trống. */
  | { type: 'addProp'; kind: PropKind; id: string; at?: { x: number; z: number } }
  /** Nhân bản vật đang chọn thành vật thêm mới. */
  | { type: 'duplicate'; id?: string }
  /** Xóa vật thêm đang chọn; vật gốc thì đặt lại về mặc định (như trước). */
  | { type: 'delete' }
  /** Thêm hoặc bỏ cửa của đoạn tường ngăn đang chọn. */
  | { type: 'toggleDoor' }
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

/** Giữ vật đang chọn nếu còn trong bản nháp mới; vật thêm đã biến mất (hoàn tác thêm) thì bỏ chọn. */
function keepSel(s: EditorState, draft: Poses): string | null {
  return s.selectedId && draft[s.selectedId] ? s.selectedId : null;
}

function deny(s: EditorState, message: string): EditorState {
  return { ...s, message };
}

const labelOf = (s: EditorState, id: string): string => {
  const k = s.env.props?.[id];
  return k ? PROP_CATALOG[k].label : nameOf(id);
};

/** Thêm vật loại kind tại chỗ trống gần anchor; chọn vật mới; một bước hoàn tác. */
function insertProp(s: EditorState, kind: PropKind, id: string, anchor: { x: number; z: number }, rotation: Pose['rotation'], door: boolean, okMsg: string): EditorState {
  if (!isPropId(id) || s.draft[id] || s.env.sizes[id]) return deny(s, 'Mã vật mới không hợp lệ hoặc đã có.');
  if (Object.keys(s.draft).filter(isPropId).length >= MAX_PROPS) return deny(s, `Đã đủ ${MAX_PROPS} vật thêm, hãy xóa bớt.`);
  const env = addPropToEnv(s.env, id, kind);
  const pose = findFreeSpot(env, s.draft, id, anchor, rotation);
  if (!pose) return deny(s, 'Không còn chỗ trống hợp lệ để đặt vật mới.');
  const placed: Pose = door ? { ...pose, door: true } : pose;
  return {
    ...s,
    env,
    ...pushHistory(s, s.draft),
    draft: { ...s.draft, [id]: placed },
    selectedId: id,
    drag: null,
    preview: null,
    message: `${okMsg} tại ${placed.x}, ${placed.z}.`,
  };
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
  if (a.type === 'restoreDraft') {
    if (!s.canEdit || s.active) return s;
    return { ...s, env: a.env, draft: a.draft, active: true, past: [], future: [], drag: null, preview: null, selectedId: null, message: a.message };
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
      return { ...s, draft: prev, past: s.past.slice(0, -1), future: [...s.future, s.draft], selectedId: keepSel(s, prev), message: 'Đã hoàn tác.' };
    }
    case 'redo': {
      if (s.drag || s.future.length === 0) return deny(s, 'Không còn bước để làm lại.');
      const next = s.future[s.future.length - 1];
      return { ...s, draft: next, future: s.future.slice(0, -1), past: [...s.past, s.draft], selectedId: keepSel(s, next), message: 'Đã làm lại.' };
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
    case 'addProp': {
      if (!isPropKind(a.kind)) return deny(s, 'Loại vật không có trong danh mục.');
      return insertProp(s, a.kind, a.id, a.at ?? { x: 0, z: 0 }, 0, false, `Đã thêm ${PROP_CATALOG[a.kind].label}`);
    }
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
    case 'delete': {
      if (!isPropId(id)) return editorReducer(s, { type: 'resetItem' });
      const draft = { ...s.draft };
      delete draft[id];
      return { ...s, ...pushHistory(s, s.draft), draft, selectedId: null, drag: null, preview: null, message: `Đã xóa ${labelOf(s, id)}.` };
    }
    case 'duplicate': {
      const kind = s.env.props?.[id] ?? duplicateKindOf(id);
      if (!kind) return deny(s, 'Vật gốc của văn phòng không nhân bản được.');
      if (!a.id) return deny(s, 'Thiếu mã cho vật mới.');
      return insertProp(s, kind, a.id, { x: cur.x, z: cur.z }, cur.rotation, !!cur.door && isPropId(id), `Đã nhân bản ${PROP_CATALOG[kind].label}`);
    }
    case 'toggleDoor': {
      const kind = s.env.props?.[id];
      if (!kind || !PROP_CATALOG[kind].wall) return deny(s, 'Chỉ tường ngăn mới có cửa.');
      const door = !cur.door;
      return {
        ...s,
        ...pushHistory(s, s.draft),
        draft: { ...s.draft, [id]: { ...cur, door } },
        message: door ? `Đã thêm cửa vào ${labelOf(s, id)}.` : `Đã bỏ cửa khỏi ${labelOf(s, id)}.`,
      };
    }
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
  // Vật thêm: giữ cái người dùng thêm/sửa, bỏ cái người dùng xóa.
  for (const o of buildBatchOps(s)) {
    if (o.op === 'put') draft[o.id] = s.draft[o.id];
    else if (o.op === 'remove') delete draft[o.id];
  }
  return {
    ...s,
    env: withProps(s.env, server.props),
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
    if (k === 'd') return { type: 'duplicate' };
    return null;
  }
  if (k === 'r') return { type: 'rotate' };
  if (k === 'Delete' || k === 'Backspace') return { type: 'delete' };
  if (k === 'Escape') return { type: 'exit' };
  const dir = directionFromKey(k);
  if (dir) return { type: 'nudge', dir, steps: e.shiftKey ? 5 : 1 };
  return null;
}

/** Kết quả áp bản nháp cục bộ lên trạng thái hiện tại. */
export interface AppliedDraft {
  env: EditorEnv;
  draft: Poses;
  /** Số vật áp được, số vật bỏ vì không còn hợp lệ. */
  applied: number;
  skipped: number;
}

/**
 * Áp bản nháp lên bản đã lưu hiện tại: vật nào không còn tồn tại hoặc đặt sai (va chạm, ngoài vùng) thì bỏ.
 * Trả null nếu kết quả không khác bản đã lưu (không còn gì để khôi phục).
 */
export function applyDraft(s: Pick<EditorState, 'env' | 'saved'>, d: { items: Record<string, Pose>; props?: Record<string, string>; removed?: string[] }): AppliedDraft | null {
  let env = s.env;
  const draft: Poses = { ...s.saved };
  let applied = 0;
  let skipped = 0;
  const cand: string[] = [];
  for (const id of d.removed ?? []) {
    if (isPropId(id) && draft[id]) {
      delete draft[id];
      applied++;
    }
  }
  for (const id of Object.keys(d.items).sort()) {
    const pose = d.items[id];
    const kind = d.props?.[id];
    if (isPropId(id)) {
      if (!isPropKind(kind) || (!env.props?.[id] && Object.keys(draft).filter(isPropId).length >= MAX_PROPS)) {
        skipped++;
        continue;
      }
      if (!env.props?.[id]) env = addPropToEnv(env, id, kind);
    } else if (!env.sizes[id] || !draft[id]) {
      skipped++;
      continue;
    }
    if (samePose(draft[id], pose)) continue;
    cand.push(id);
    draft[id] = pose;
  }
  // Kiểm tra trên bản đã áp đủ (hai vật đổi chỗ nhau không bị coi là chồng giữa chừng); vật sai thì trả về như cũ.
  for (const id of cand) {
    if (validatePose(env, draft, id, draft[id]).valid) {
      applied++;
    } else {
      skipped++;
      if (s.saved[id]) draft[id] = s.saved[id];
      else delete draft[id];
    }
  }
  if (applied === 0) return null;
  return { env, draft, applied, skipped };
}
