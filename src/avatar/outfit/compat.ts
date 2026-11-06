/**
 * Ma trận tương thích và kiểm tra tổ hợp (TASK 04 mục 1, 4, 7). Thuần, dùng dữ liệu fashion/rules.
 * Nguyên tắc: không thử ghép mọi món tùy ý; tổ hợp không hỗ trợ thì giữ bộ hợp lệ trước đó, trả lý do và gợi ý.
 * Các ngưỡng hình thể là chính sách do ta đặt (chưa kiểm chứng bằng ảnh chụp từng tổ hợp), xem docs/design/WARDROBE.md.
 */
import { GARMENTS, getGarment, garmentsInGroup, type GarmentDef } from '../../fashion/catalog';
import { cloneLook, wear } from '../../fashion/defaults';
import { validate } from '../../fashion/rules';
import { OUTFIT_SLOTS, type BodyStyle, type CharacterLook, type Fit, type OutfitSlot } from '../../fashion/types';
import { shellClassOf, type SupportLevel } from './shellClass';

export type IssueCode =
  | 'no_shell'
  | 'limited'
  | 'fit_body'
  | 'tuck_body'
  | 'layer_fit'
  | 'wrong_slot'
  | 'unknown_garment';

export interface CompatIssue {
  slot: OutfitSlot;
  code: IssueCode;
  severity: 'error' | 'warn';
  /** Thông điệp tiếng Việt cho người dùng. */
  message: string;
  /** id món tương thích gợi ý (cùng nhóm). */
  suggestions: string[];
  /** Phom gợi ý thay thế. */
  suggestFit?: Fit;
}


/** Ngưỡng hình thể mà phom ôm không còn hỗ trợ (vỏ ôm dễ đâm xuyên khi thân phình). */
export const SLIM_LIMITS = { belly: 0.6, weight: 0.6, bodyFat: 0.7, hips: 0.8, chest: 0.8, muscle: 0.8, shoulderWidth: 0.8 } as const;
/** Ngưỡng bụng mà sơ vin không còn hỗ trợ. */
export const TUCK_BELLY_LIMIT = 0.7;

/** Mức hỗ trợ vỏ của một món trên một kiểu tạo hình. */
export function garmentSupport(def: Pick<GarmentDef, 'group' | 'kind'>, style: BodyStyle): { level: SupportLevel; reason: string } {
  const spec = shellClassOf(def);
  if (!spec || !spec.part) {
    return { level: 'unsupported', reason: spec?.note || 'Chưa có lớp vỏ cho loại món này, cần bổ sung mesh.' };
  }
  if (spec.support === 'limited') return { level: 'limited', reason: spec.note };
  // Chibi: đầu to thân ngắn nên cổ cao và tay dài lệch tỉ lệ, chỉ coi là hỗ trợ với ghi chú.
  if (style === 'chibi' && spec.neckU > 1.05) {
    return { level: 'limited', reason: 'Cổ cao trên thân chibi (cổ ngắn) chưa kiểm tra bằng ảnh, có thể che sát cằm.' };
  }
  return { level: 'supported', reason: '' };
}

function suggestionsFor(slot: OutfitSlot, style: BodyStyle, exceptId?: string): string[] {
  return garmentsInGroup(slot)
    .filter((g) => g.id !== exceptId && garmentSupport(g, style).level === 'supported')
    .slice(0, 3)
    .map((g) => g.id);
}

/** Kiểm tra phom của một món với hình thể hiện tại. */
function fitIssues(look: CharacterLook, slot: OutfitSlot): CompatIssue[] {
  const worn = look.outfit[slot];
  if (!worn) return [];
  const def = getGarment(worn.garmentId);
  if (!def) return [];
  const out: CompatIssue[] = [];
  const b = look.body;
  const t = b.torso;
  if (worn.fit === 'slim') {
    const over: string[] = [];
    if (t.belly > SLIM_LIMITS.belly) over.push('bụng');
    if (b.weight > SLIM_LIMITS.weight) over.push('cân nặng');
    if (b.bodyFat > SLIM_LIMITS.bodyFat) over.push('lượng mỡ');
    if (t.hips > SLIM_LIMITS.hips && (slot === 'bottom' || slot === 'onePiece')) over.push('hông');
    if (t.chest > SLIM_LIMITS.chest && slot !== 'bottom' && slot !== 'socks' && slot !== 'shoes') over.push('ngực');
    if (b.muscle > SLIM_LIMITS.muscle && slot !== 'bottom' && slot !== 'socks' && slot !== 'shoes') over.push('cơ bắp');
    if (t.shoulderWidth > SLIM_LIMITS.shoulderWidth && slot !== 'bottom' && slot !== 'socks' && slot !== 'shoes') over.push('vai');
    if (over.length > 0) {
      const alt: Fit | undefined = def.fits.includes('regular') ? 'regular' : def.fits.includes('oversized') ? 'oversized' : undefined;
      out.push({
        slot,
        code: 'fit_body',
        severity: 'error',
        message: `Phom ôm của "${def.name}" không hỗ trợ khi ${over.join(', ')} vượt ngưỡng; dễ xuyên da.`,
        suggestions: [],
        suggestFit: alt,
      });
    }
  }
  if (slot === 'inner' && worn.tucked && t.belly > TUCK_BELLY_LIMIT) {
    out.push({
      slot,
      code: 'tuck_body',
      severity: 'error',
      message: `Sơ vin "${def.name}" không hỗ trợ khi bụng lớn hơn ${TUCK_BELLY_LIMIT}; hãy thả áo.`,
      suggestions: [],
    });
  }
  return out;
}

/** Kiểm tra toàn bộ bộ đồ đang mặc. Không sửa look. */
export function checkOutfit(look: CharacterLook): CompatIssue[] {
  const issues: CompatIssue[] = [];
  const style = look.bodyStyle;
  for (const slot of OUTFIT_SLOTS) {
    const worn = look.outfit[slot];
    if (!worn) continue;
    const def = getGarment(worn.garmentId);
    if (!def) {
      issues.push({ slot, code: 'unknown_garment', severity: 'error', message: 'Món không có trong danh mục.', suggestions: suggestionsFor(slot, style) });
      continue;
    }
    if (def.group !== slot) {
      issues.push({ slot, code: 'wrong_slot', severity: 'error', message: `"${def.name}" thuộc nhóm ${def.group}, không mặc ở ô ${slot}.`, suggestions: suggestionsFor(slot, style) });
      continue;
    }
    const sup = garmentSupport(def, style);
    if (sup.level === 'unsupported') {
      issues.push({ slot, code: 'no_shell', severity: 'error', message: `"${def.name}": ${sup.reason}`, suggestions: suggestionsFor(slot, style, def.id) });
    } else if (sup.level === 'limited') {
      issues.push({ slot, code: 'limited', severity: 'warn', message: `"${def.name}": ${sup.reason}`, suggestions: [] });
    }
    issues.push(...fitIssues(look, slot));
  }
  // Áo ngoài phải không ôm hơn áo trong dày: tránh áo trong bung ra ngoài áo khoác.
  const inner = look.outfit.inner;
  const outer = look.outfit.outer;
  if (inner && outer) {
    const innerDef = getGarment(inner.garmentId);
    const outerDef = getGarment(outer.garmentId);
    const innerSpec = innerDef ? shellClassOf(innerDef) : undefined;
    const thickInner = !!innerSpec && innerSpec.thickness >= 0.005;
    const outerFits = outerDef?.fits ?? [];
    const altFit: Fit | undefined = outerFits.includes('regular') ? 'regular' : outerFits.includes('oversized') ? 'oversized' : undefined;
    if (innerDef && outerDef && outer.fit === 'slim' && thickInner) {
      issues.push({
        slot: 'outer',
        code: 'layer_fit',
        severity: 'error',
        message: `Áo ngoài phom ôm không đủ rộng để che "${innerDef.name}" dày; chọn phom thường hoặc rộng.`,
        suggestions: [],
        suggestFit: altFit,
      });
    } else if (innerDef && outerDef && outer.fit === 'slim' && inner.fit === 'oversized') {
      issues.push({
        slot: 'outer',
        code: 'layer_fit',
        severity: 'warn',
        message: 'Áo trong phom rộng dưới áo ngoài phom ôm có thể lồi qua áo ngoài.',
        suggestions: [],
        suggestFit: altFit,
      });
    }
  }
  return issues;
}

export function hasBlockingIssue(issues: readonly CompatIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

/** Một dòng ma trận: món × kiểu tạo hình. */
export interface MatrixRow {
  garmentId: string;
  name: string;
  group: OutfitSlot;
  kind: string;
  realistic: SupportLevel;
  chibi: SupportLevel;
  note: string;
}

/** Ma trận tương thích mọi món trong catalog. */
export function compatibilityMatrix(): MatrixRow[] {
  return GARMENTS.map((g) => {
    const a = garmentSupport(g, 'realistic');
    const c = garmentSupport(g, 'chibi');
    return {
      garmentId: g.id,
      name: g.name,
      group: g.group,
      kind: g.kind,
      realistic: a.level,
      chibi: c.level,
      note: a.reason || c.reason,
    };
  });
}

export type ProposalStatus = 'ok' | 'needs-confirm' | 'rejected';

export interface Proposal {
  status: ProposalStatus;
  /** Look sẽ dùng: ok -> look mới; needs-confirm -> look đề xuất (chưa áp); rejected -> look trước đó nguyên vẹn. */
  look: CharacterLook;
  /** Slot bị cởi do xung đột (chỉ khi needs-confirm). */
  removed: OutfitSlot[];
  /** Slot được hệ thống tự thêm để đủ thân trên/dưới (người dùng để trống). */
  added: OutfitSlot[];
  issues: CompatIssue[];
  /** Thông điệp tổng hợp tiếng Việt. */
  message: string;
}

function diffOutfit(requested: CharacterLook, validated: CharacterLook): { removed: OutfitSlot[]; added: OutfitSlot[] } {
  const removed: OutfitSlot[] = [];
  const added: OutfitSlot[] = [];
  for (const s of OUTFIT_SLOTS) {
    if (requested.outfit[s] && !validated.outfit[s]) removed.push(s);
    if (!requested.outfit[s] && validated.outfit[s]) added.push(s);
  }
  return { removed, added };
}

/**
 * Đề xuất thay đổi bộ đồ. Quy trình: kiểm tra slot, mức hỗ trợ vỏ, rồi chạy validate() để biết món nào bị cởi vì xung đột.
 * - Có lỗi chặn (không hỗ trợ, phom quá hình thể): 'rejected', trả lại look trước đó cùng lý do và gợi ý.
 * - Có món bị cởi: 'needs-confirm', UI hỏi người dùng; không tự áp.
 * - Còn lại: 'ok'.
 */
export function proposeOutfit(previous: CharacterLook, requested: CharacterLook): Proposal {
  const validated = validate(requested).look;
  const { removed, added } = diffOutfit(requested, validated);
  const issues = checkOutfit(validated);
  if (hasBlockingIssue(issues)) {
    const first = issues.find((i) => i.severity === 'error');
    return {
      status: 'rejected',
      look: previous,
      removed: [],
      added: [],
      issues,
      message: `Giữ bộ cũ: ${first?.message ?? 'tổ hợp không hỗ trợ.'}`,
    };
  }
  if (removed.length > 0) {
    const names = removed.map((s) => getGarment(requested.outfit[s]?.garmentId ?? '')?.name ?? s).join(', ');
    return {
      status: 'needs-confirm',
      look: validated,
      removed,
      added,
      issues,
      message: `Mặc món này sẽ cởi: ${names} (xung đột).`,
    };
  }
  return { status: 'ok', look: validated, removed: [], added, issues, message: '' };
}

/** Đề xuất mặc một món vào slot (giữ phom hiện tại của slot nếu món mới cho phép). */
export function proposeGarment(previous: CharacterLook, slot: OutfitSlot, garmentId: string): Proposal {
  const def = getGarment(garmentId);
  if (!def) {
    return reject(previous, { slot, code: 'unknown_garment', severity: 'error', message: 'Món không có trong danh mục.', suggestions: suggestionsFor(slot, previous.bodyStyle) });
  }
  if (def.group !== slot) {
    return reject(previous, { slot, code: 'wrong_slot', severity: 'error', message: `"${def.name}" thuộc nhóm ${def.group}, không mặc ở ô ${slot}.`, suggestions: suggestionsFor(slot, previous.bodyStyle) });
  }
  const sup = garmentSupport(def, previous.bodyStyle);
  if (sup.level === 'unsupported') {
    return reject(previous, { slot, code: 'no_shell', severity: 'error', message: `"${def.name}": ${sup.reason}`, suggestions: suggestionsFor(slot, previous.bodyStyle, def.id) });
  }
  const next = cloneLook(previous);
  const prevFit = previous.outfit[slot]?.fit;
  next.outfit[slot] = wear(garmentId, prevFit && def.fits.includes(prevFit) ? { fit: prevFit } : {});
  return proposeOutfit(previous, next);
}

/** Đề xuất đổi phom của món đang mặc. */
export function proposeFitChange(previous: CharacterLook, slot: OutfitSlot, fit: Fit): Proposal {
  const worn = previous.outfit[slot];
  const def = worn ? getGarment(worn.garmentId) : undefined;
  if (!worn || !def) return reject(previous, { slot, code: 'unknown_garment', severity: 'error', message: 'Ô này đang trống.', suggestions: [] });
  if (!def.fits.includes(fit)) {
    return reject(previous, { slot, code: 'fit_body', severity: 'error', message: `"${def.name}" không có phom ${fit}.`, suggestions: [], suggestFit: def.defaultFit });
  }
  const next = cloneLook(previous);
  const w = next.outfit[slot];
  if (w) w.fit = fit;
  return proposeOutfit(previous, next);
}

/** Đề xuất bật/tắt sơ vin. */
export function proposeTuck(previous: CharacterLook, tucked: boolean): Proposal {
  const worn = previous.outfit.inner;
  if (!worn) return reject(previous, { slot: 'inner', code: 'unknown_garment', severity: 'error', message: 'Chưa mặc áo trong.', suggestions: [] });
  const next = cloneLook(previous);
  if (next.outfit.inner) next.outfit.inner.tucked = tucked;
  const res = proposeOutfit(previous, next);
  // validate() âm thầm hạ sơ vin không hỗ trợ; ở đây coi đó là từ chối có lý do.
  if (tucked && res.status !== 'rejected' && !res.look.outfit.inner?.tucked) {
    const def = getGarment(worn.garmentId);
    return reject(previous, {
      slot: 'inner',
      code: 'tuck_body',
      severity: 'error',
      message: `"${def?.name ?? 'Áo'}" không sơ vin được (món không hỗ trợ hoặc chưa có quần).`,
      suggestions: [],
    });
  }
  return res;
}

function reject(previous: CharacterLook, issue: CompatIssue): Proposal {
  return { status: 'rejected', look: previous, removed: [], added: [], issues: [issue], message: `Giữ bộ cũ: ${issue.message}` };
}
