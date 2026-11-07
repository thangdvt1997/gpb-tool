/**
 * Trạng thái phòng thay đồ: bản nháp, lịch sử hoàn tác, đề xuất chờ xác nhận, thông báo lý do. Thuần (reducer),
 * không chứa React hay three, nên test được. Mọi thay đổi trang phục đi qua avatar/outfit/compat để giữ bộ hợp lệ
 * trước đó khi tổ hợp không hỗ trợ (TASK 04 mục 7).
 */
import {
  ACCESSORY_SIZE_MAX,
  ACCESSORY_SIZE_MIN,
  GARMENT_GROUP_LABELS,
  MAX_RINGS,
  PATTERN_TEXT_MAX,
  getAccessory,
  getGarment,
  getPattern,
  type AccessoryCatalogSlot,
} from '../fashion/catalog';
import { cloneLook, DEFAULT_HEIGHT_CM, wearAcc } from '../fashion/defaults';
import { GARMENT_PALETTE, snapToPalette } from '../fashion/palette';
import { getPresetLook } from '../fashion/presets';
import { MAX_PATTERNS_PER_GARMENT, validate } from '../fashion/rules';
import {
  checkOutfit,
  hasBlockingIssue,
  proposeFitChange,
  proposeGarment,
  proposeOutfit,
  proposeTuck,
  type CompatIssue,
  type Proposal,
} from '../avatar/outfit/compat';
import {
  OUTFIT_SLOTS,
  type BodyFrame,
  type BodyStyle,
  type CharacterLook,
  type Fit,
  type AccessorySlot,
  type GarmentPattern,
  type GarmentZone,
  type HeadphoneWear,
  type Material,
  type PhoneState,
  type RingFinger,
  type Side,
  type OutfitSlot,
} from '../fashion/types';
import { convertBodyStyle, convertFrame, resetSliders, setSliderValue } from './shapeSliders';

export type WardrobeTab = 'presets' | 'outfit' | 'color' | 'shape' | 'style' | 'acc' | 'pattern';
export const WARDROBE_TABS: readonly { id: WardrobeTab; label: string; key: string }[] = [
  { id: 'presets', label: 'Bộ mẫu', key: '1' },
  { id: 'outfit', label: 'Trang phục', key: '2' },
  { id: 'color', label: 'Màu', key: '3' },
  { id: 'shape', label: 'Hình thể', key: '4' },
  { id: 'style', label: 'Kiểu tạo hình', key: '5' },
  { id: 'acc', label: 'Phụ kiện', key: '6' },
  { id: 'pattern', label: 'Họa tiết', key: '7' },
];

/** Số bước hoàn tác tối đa. */
export const MAX_HISTORY = 50;

export interface WardrobeState {
  /** Look lúc mở phòng thay đồ (để hủy và so sánh trước/sau). */
  original: CharacterLook;
  draft: CharacterLook;
  undoStack: CharacterLook[];
  redoStack: CharacterLook[];
  tab: WardrobeTab;
  slot: OutfitSlot;
  /** Đề xuất cần người dùng xác nhận (cởi món xung đột). */
  pending: Proposal | null;
  /** Thông báo gần nhất kèm gợi ý; rỗng là không có. */
  notice: { text: string; kind: 'info' | 'warn' | 'error'; issues: CompatIssue[] } | null;
  /** Đang so sánh: preview hiện original. */
  compare: boolean;
  /** Khoá gộp lịch sử: kéo liên tục một thanh trượt chỉ tạo một bước hoàn tác. */
  coalesce: string | null;
}

export type WardrobeAction =
  | { type: 'tab'; tab: WardrobeTab }
  | { type: 'slot'; slot: OutfitSlot }
  | { type: 'wear'; slot: OutfitSlot; garmentId: string }
  | { type: 'takeOff'; slot: OutfitSlot }
  | { type: 'fit'; slot: OutfitSlot; fit: Fit }
  | { type: 'tuck'; tucked: boolean }
  | { type: 'color'; slot: OutfitSlot; zone: GarmentZone; hex: string }
  | { type: 'material'; slot: OutfitSlot; zone: GarmentZone; material: Material }
  | { type: 'slider'; id: string; value: number }
  | { type: 'resetSliders' }
  | { type: 'style'; style: BodyStyle }
  | { type: 'frame'; frame: BodyFrame }
  | { type: 'preset'; id: string }
  | { type: 'importLook'; look: CharacterLook; notes?: string[] }
  | { type: 'acc'; slot: AccessorySlot; itemId: string | null }
  | { type: 'accOpt'; slot: AccessorySlot; patch: AccessoryPatch }
  | { type: 'ring'; op: 'add'; itemId: string; hand: Side; finger: RingFinger }
  | { type: 'ring'; op: 'remove'; index: number }
  | { type: 'patternAdd'; slot: OutfitSlot; patternId: string }
  | { type: 'patternSet'; slot: OutfitSlot; index: number; patch: PatternPatch }
  | { type: 'patternRemove'; slot: OutfitSlot; index: number }
  | { type: 'confirmPending' }
  | { type: 'dismissPending' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'resetAll' }
  | { type: 'compare'; on: boolean }
  | { type: 'clearNotice' };

export interface AccessoryPatch {
  color?: string;
  material?: Material;
  size?: number;
  side?: Side | 'both';
  state?: PhoneState;
  wear?: HeadphoneWear;
}

export type PatternPatch = Partial<Pick<GarmentPattern, 'color' | 'scale' | 'rotation' | 'offsetX' | 'offsetY' | 'text' | 'zone'>>;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Ghi look mới qua validate (bỏ phụ kiện xung đột như cà vạt không sơ mi) rồi vào lịch sử; thông báo lý do nếu có. */
function commitAccessory(s: WardrobeState, next: CharacterLook): WardrobeState {
  const v = validate(next);
  const warns = v.warnings.filter((w) => w.code === 'slot_conflict').map((w) => w.message);
  const base = pushHistory(s, v.look);
  return { ...base, notice: warns.length ? { text: warns.join(' '), kind: 'warn', issues: [] } : null };
}

function fail(s: WardrobeState, text: string): WardrobeState {
  return { ...s, notice: { text, kind: 'error', issues: [] } };
}

export function initWardrobe(look: CharacterLook): WardrobeState {
  const clean = validate(look).look;
  return {
    original: cloneLook(clean),
    draft: cloneLook(clean),
    undoStack: [],
    redoStack: [],
    tab: 'presets',
    slot: 'inner',
    pending: null,
    notice: null,
    compare: false,
    coalesce: null,
  };
}

function pushHistory(s: WardrobeState, next: CharacterLook): WardrobeState {
  const undoStack = [...s.undoStack, s.draft].slice(-MAX_HISTORY);
  return { ...s, draft: next, undoStack, redoStack: [], pending: null };
}

/** Áp kết quả đề xuất vào state: ok -> ghi; needs-confirm -> chờ; rejected -> giữ nguyên kèm lý do. */
function applyProposal(s: WardrobeState, p: Proposal): WardrobeState {
  if (p.status === 'rejected') {
    return { ...s, pending: null, notice: { text: p.message, kind: 'error', issues: p.issues } };
  }
  if (p.status === 'needs-confirm') {
    return { ...s, pending: p, notice: { text: p.message, kind: 'warn', issues: p.issues } };
  }
  const warns = p.issues.filter((i) => i.severity === 'warn');
  const added = p.added.length > 0 ? `Đã tự thêm ${p.added.map((x) => GARMENT_GROUP_LABELS[x]).join(', ')} để đủ thân trên/dưới.` : '';
  const text = [added, ...warns.map((w) => w.message)].filter(Boolean).join(' ');
  const next = pushHistory(s, p.look);
  return { ...next, notice: text ? { text, kind: 'info', issues: warns } : null };
}

/**
 * Hạ phom các món gây lỗi hình thể sang phom gợi ý (dùng khi áp bộ mẫu lên hình thể lớn).
 * Trả look đã sửa và danh sách thông báo; lặp tối đa vài vòng để không treo.
 */
export function relaxFits(look: CharacterLook): { look: CharacterLook; changes: string[] } {
  let cur = look;
  const changes: string[] = [];
  for (let round = 0; round < 4; round++) {
    const issues = checkOutfit(cur).filter((i) => i.severity === 'error');
    if (issues.length === 0) break;
    const next = cloneLook(cur);
    let changed = false;
    for (const i of issues) {
      const worn = next.outfit[i.slot];
      if (!worn) continue;
      if (i.code === 'tuck_body' && worn.tucked) {
        worn.tucked = false;
        changes.push(i.message);
        changed = true;
      } else if (i.suggestFit && worn.fit !== i.suggestFit) {
        worn.fit = i.suggestFit;
        changes.push(`${i.message} Đã đổi sang phom ${i.suggestFit}.`);
        changed = true;
      }
    }
    if (!changed) break;
    cur = next;
  }
  return { look: cur, changes };
}

/** Áp bộ mẫu: lấy trang phục, phụ kiện, tóc, hình xăm từ bộ mẫu; giữ hình thể, mặt, da, sẹo của người dùng. */
export function applyPresetKeepBody(current: CharacterLook, presetId: string): { look: CharacterLook; changes: string[] } | null {
  const preset = getPresetLook(presetId, current.bodyStyle);
  if (!preset) return null;
  const merged = cloneLook(current);
  merged.outfit = preset.outfit;
  merged.accessories = preset.accessories;
  merged.hair = preset.hair;
  merged.tattoos = preset.tattoos;
  merged.meta = { ...current.meta, presetId };
  const valid = validate(merged).look;
  return relaxFits(valid);
}

function step(s: WardrobeState, a: WardrobeAction): WardrobeState {
  switch (a.type) {
    case 'tab':
      return { ...s, tab: a.tab };
    case 'slot':
      return { ...s, slot: a.slot };
    case 'wear':
      return applyProposal({ ...s, slot: a.slot }, proposeGarment(s.draft, a.slot, a.garmentId));
    case 'takeOff': {
      const next = cloneLook(s.draft);
      next.outfit[a.slot] = null;
      return applyProposal(s, proposeOutfit(s.draft, next));
    }
    case 'fit':
      return applyProposal(s, proposeFitChange(s.draft, a.slot, a.fit));
    case 'tuck':
      return applyProposal(s, proposeTuck(s.draft, a.tucked));
    case 'color': {
      const worn = s.draft.outfit[a.slot];
      if (!worn) return s;
      const def = getGarment(worn.garmentId);
      if (!def || !def.zones.includes(a.zone)) return { ...s, notice: { text: 'Món này không có vùng màu đó.', kind: 'error', issues: [] } };
      const next = cloneLook(s.draft);
      const w = next.outfit[a.slot];
      if (!w) return s;
      w.colors[a.zone] = snapToPalette(a.hex, GARMENT_PALETTE, worn.colors[a.zone] ?? '#ffffff');
      return { ...pushHistory(s, next), notice: null };
    }
    case 'material': {
      const worn = s.draft.outfit[a.slot];
      const def = worn ? getGarment(worn.garmentId) : undefined;
      if (!worn || !def) return s;
      const allowed = def.materials[a.zone] ?? [];
      if (!allowed.includes(a.material)) {
        return { ...s, notice: { text: `Chất liệu ${a.material} không hợp lệ cho vùng này của "${def.name}".`, kind: 'error', issues: [] } };
      }
      const next = cloneLook(s.draft);
      const w = next.outfit[a.slot];
      if (!w) return s;
      w.materials[a.zone] = a.material;
      return { ...pushHistory(s, next), notice: null };
    }
    case 'slider': {
      const next = setSliderValue(s.draft, a.id, a.value);
      if (next === s.draft) return s;
      // Hình thể mới có thể làm phom ôm/sơ vin không còn hỗ trợ: từ chối và giữ giá trị cũ kèm lý do.
      const issues = checkOutfit(next).filter((i) => i.severity === 'error' && (i.code === 'fit_body' || i.code === 'tuck_body'));
      if (issues.length > 0) {
        const first = issues[0];
        return { ...s, notice: { text: `Giữ hình thể cũ: ${first.message}`, kind: 'error', issues } };
      }
      const key = `slider:${a.id}`;
      if (s.coalesce === key) return { ...s, draft: next, redoStack: [], pending: null, notice: null };
      return { ...pushHistory(s, next), notice: null, coalesce: key };
    }
    case 'resetSliders': {
      const next = resetSliders(s.draft, DEFAULT_HEIGHT_CM[s.draft.bodyStyle][s.draft.body.frame]);
      return { ...pushHistory(s, next), notice: null };
    }
    case 'style': {
      if (a.style === s.draft.bodyStyle) return s;
      const next = convertBodyStyle(s.draft, a.style);
      const issues = checkOutfit(next).filter((i) => i.severity === 'error');
      if (issues.length > 0) {
        return { ...s, notice: { text: `Giữ kiểu hiện tại: ${issues[0].message}`, kind: 'error', issues } };
      }
      const warns = checkOutfit(next).filter((i) => i.severity === 'warn');
      const base = pushHistory(s, next);
      return { ...base, notice: warns.length ? { text: warns.map((w) => w.message).join(' '), kind: 'info', issues: warns } : null };
    }
    case 'frame': {
      if (a.frame === s.draft.body.frame) return s;
      return { ...pushHistory(s, convertFrame(s.draft, a.frame)), notice: null };
    }
    case 'preset': {
      const r = applyPresetKeepBody(s.draft, a.id);
      if (!r) return { ...s, notice: { text: 'Bộ mẫu không tồn tại.', kind: 'error', issues: [] } };
      const next = pushHistory(s, r.look);
      return { ...next, notice: r.changes.length ? { text: r.changes.join(' '), kind: 'info', issues: [] } : null };
    }
    case 'importLook': {
      const next = pushHistory(s, cloneLook(a.look));
      const warns = (a.notes ?? []).join(' ');
      return { ...next, notice: { text: warns ? `Đã nhập nhân vật. ${warns}` : 'Đã nhập nhân vật từ tệp JSON.', kind: warns ? 'warn' : 'info', issues: [] } };
    }
    case 'acc': {
      const next = cloneLook(s.draft);
      const store = next.accessories as unknown as Record<string, unknown>;
      if (a.itemId === null) {
        if (!store[a.slot]) return s;
        store[a.slot] = null;
        return commitAccessory(s, next);
      }
      const def = getAccessory(a.itemId);
      if (!def || def.slot !== (a.slot as AccessoryCatalogSlot)) return fail(s, 'Phụ kiện không thuộc ô này.');
      const base = wearAcc(a.itemId);
      store[a.slot] = a.slot === 'phone' ? { ...base, state: 'held' } : a.slot === 'headphones' ? { ...base, wear: 'on-ears' } : base;
      return commitAccessory(s, next);
    }
    case 'accOpt': {
      const next = cloneLook(s.draft);
      const cur = (next.accessories as unknown as Record<string, Record<string, unknown> | null>)[a.slot];
      if (!cur) return s;
      const def = getAccessory(String(cur.itemId));
      if (!def) return s;
      const p = a.patch;
      if (p.material !== undefined) {
        if (!def.materials.includes(p.material)) return fail(s, `Chất liệu ${p.material} không hợp lệ cho "${def.name}".`);
        cur.material = p.material;
      }
      if (p.color !== undefined) cur.color = snapToPalette(p.color, GARMENT_PALETTE, String(cur.color));
      if (p.size !== undefined) cur.size = clamp(p.size, ACCESSORY_SIZE_MIN, ACCESSORY_SIZE_MAX);
      if (p.side !== undefined) {
        if (!def.sides.includes(p.side)) return fail(s, `"${def.name}" không đeo được bên này.`);
        cur.side = p.side;
      }
      if (p.state !== undefined && a.slot === 'phone') cur.state = p.state;
      if (p.wear !== undefined && a.slot === 'headphones') cur.wear = p.wear;
      return { ...pushHistory(s, next), notice: null };
    }
    case 'ring': {
      const next = cloneLook(s.draft);
      if (a.op === 'remove') {
        if (a.index < 0 || a.index >= next.accessories.rings.length) return s;
        next.accessories.rings.splice(a.index, 1);
        return { ...pushHistory(s, next), notice: null };
      }
      const def = getAccessory(a.itemId);
      if (!def || def.slot !== 'ring') return fail(s, 'Không phải nhẫn.');
      if (next.accessories.rings.length >= MAX_RINGS) return fail(s, `Tối đa ${MAX_RINGS} nhẫn.`);
      if (next.accessories.rings.some((r) => r.hand === a.hand && r.finger === a.finger)) return fail(s, 'Ngón này đã có nhẫn.');
      next.accessories.rings.push({ itemId: a.itemId, color: def.defaultColor, material: def.defaultMaterial, hand: a.hand, finger: a.finger });
      return { ...pushHistory(s, next), notice: null };
    }
    case 'patternAdd': {
      const worn = s.draft.outfit[a.slot];
      const def = worn ? getGarment(worn.garmentId) : undefined;
      const pat = getPattern(a.patternId);
      if (!worn || !def || !pat) return fail(s, 'Ô này đang trống hoặc họa tiết không có.');
      if (def.patternZones.length === 0) return fail(s, `"${def.name}" không cho đặt họa tiết.`);
      if (worn.patterns.length >= MAX_PATTERNS_PER_GARMENT) return fail(s, `Tối đa ${MAX_PATTERNS_PER_GARMENT} họa tiết mỗi món.`);
      const next = cloneLook(s.draft);
      const zone = def.patternZones.includes('body') ? 'body' : def.patternZones[0];
      next.outfit[a.slot]?.patterns.push({ patternId: pat.id, zone, color: '#1f2328', scale: 1, rotation: 0, offsetX: 0, offsetY: 0, text: pat.allowsText ? 'GP' : '' });
      return { ...pushHistory(s, next), notice: null };
    }
    case 'patternSet': {
      const worn = s.draft.outfit[a.slot];
      const def = worn ? getGarment(worn.garmentId) : undefined;
      if (!worn || !def || !worn.patterns[a.index]) return s;
      const next = cloneLook(s.draft);
      const w = next.outfit[a.slot];
      const p = w?.patterns[a.index];
      if (!w || !p) return s;
      const q = a.patch;
      if (q.zone !== undefined) {
        if (!def.patternZones.includes(q.zone)) return fail(s, 'Vùng này không cho đặt họa tiết.');
        p.zone = q.zone;
      }
      if (q.color !== undefined) p.color = snapToPalette(q.color, GARMENT_PALETTE, p.color);
      if (q.scale !== undefined) p.scale = clamp(q.scale, 0.3, 3);
      if (q.rotation !== undefined) p.rotation = clamp(q.rotation, -180, 180);
      if (q.offsetX !== undefined) p.offsetX = clamp(q.offsetX, -1, 1);
      if (q.offsetY !== undefined) p.offsetY = clamp(q.offsetY, -1, 1);
      if (q.text !== undefined) p.text = getPattern(p.patternId)?.allowsText ? q.text.slice(0, PATTERN_TEXT_MAX) : '';
      const key = `pattern:${a.slot}:${a.index}`;
      if (s.coalesce === key) return { ...s, draft: next, redoStack: [], pending: null, notice: null };
      return { ...pushHistory(s, next), notice: null, coalesce: key };
    }
    case 'patternRemove': {
      const worn = s.draft.outfit[a.slot];
      if (!worn || !worn.patterns[a.index]) return s;
      const next = cloneLook(s.draft);
      next.outfit[a.slot]?.patterns.splice(a.index, 1);
      return { ...pushHistory(s, next), notice: null };
    }
    case 'confirmPending': {
      if (!s.pending || s.pending.status !== 'needs-confirm') return s;
      return { ...pushHistory(s, s.pending.look), notice: null };
    }
    case 'dismissPending':
      return { ...s, pending: null, notice: { text: 'Giữ nguyên bộ đang mặc.', kind: 'info', issues: [] } };
    case 'undo': {
      const prev = s.undoStack[s.undoStack.length - 1];
      if (!prev) return s;
      return { ...s, draft: prev, undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, s.draft], pending: null, notice: null };
    }
    case 'redo': {
      const nxt = s.redoStack[s.redoStack.length - 1];
      if (!nxt) return s;
      return { ...s, draft: nxt, redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, s.draft], pending: null, notice: null };
    }
    case 'resetAll':
      return { ...pushHistory(s, cloneLook(s.original)), notice: null };
    case 'compare':
      return { ...s, compare: a.on };
    case 'clearNotice':
      return { ...s, notice: null };
  }
}

/** Reducer: mọi hành động khác thanh trượt ngắt việc gộp lịch sử. */
export function wardrobeReducer(s: WardrobeState, a: WardrobeAction): WardrobeState {
  const r = step(s, a);
  if (a.type === 'slider' || a.type === 'patternSet' || r.coalesce === null) return r;
  return { ...r, coalesce: null };
}

/** Look hiển thị trong xem trước (so sánh thì hiện bản gốc). */
export function previewLook(s: WardrobeState): CharacterLook {
  return s.compare ? s.original : s.draft;
}

/** Có thay đổi so với lúc mở. */
export function isDirty(s: WardrobeState): boolean {
  return JSON.stringify(s.draft) !== JSON.stringify(s.original);
}

/** Bộ đang mặc còn lỗi chặn (không được xác nhận). */
export function canConfirm(s: WardrobeState): boolean {
  return !s.pending && !hasBlockingIssue(checkOutfit(s.draft));
}

/** Ô trang phục mà người dùng có thể cởi (các ô còn lại luôn phải có đồ, xem rules.ts). */
export const REMOVABLE_SLOTS: readonly OutfitSlot[] = ['outer', 'socks', 'hat', 'onePiece'];
export const ALL_SLOTS = OUTFIT_SLOTS;

/* ------------------------------------------------------------------ */
/* Phím tắt                                                            */
/* ------------------------------------------------------------------ */

export interface KeyInfo {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  /** Phần tử đang focus là ô nhập (input, select, textarea). */
  inField?: boolean;
}

export type KeyIntent =
  | { type: 'action'; action: WardrobeAction }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'resetView' };

/** Phím tắt phòng thay đồ: Esc hủy, Ctrl+Enter xác nhận, Ctrl+Z/Y hoàn tác, 1-7 chuyển tab, V về góc nhìn chuẩn. */
export function wardrobeKey(k: KeyInfo): KeyIntent | null {
  const mod = !!(k.ctrlKey || k.metaKey);
  const key = k.key.toLowerCase();
  if (key === 'escape') return { type: 'cancel' };
  if (mod && key === 'enter') return { type: 'confirm' };
  if (mod && key === 'z') return { type: 'action', action: { type: k.shiftKey ? 'redo' : 'undo' } };
  if (mod && key === 'y') return { type: 'action', action: { type: 'redo' } };
  if (k.inField || mod) return null;
  const tab = WARDROBE_TABS.find((t) => t.key === key);
  if (tab) return { type: 'action', action: { type: 'tab', tab: tab.id } };
  if (key === 'v') return { type: 'resetView' };
  return null;
}
