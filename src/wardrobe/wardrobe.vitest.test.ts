import { boneShapeOf } from '../avatar/boneShape';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cloneLook, makeDefaultLook, wear } from '../fashion/defaults';
import { PRESETS } from '../fashion/presets';
import { BODY_LIMITS_BY_STYLE, validate } from '../fashion/rules';
import { checkOutfit, hasBlockingIssue } from '../avatar/outfit/compat';
import { deriveBodyMorphWeights } from '../avatar/outfit/bodyMorphs';
import { findBodyMesh } from '../avatar/outfit/MpfbOutfitOn';
import { colorSignature, structureSignature } from '../avatar/outfit/MpfbOutfit';
import {
  SHAPE_SLIDERS,
  UNSUPPORTED_SHAPE,
  convertBodyStyle,
  convertFrame,
  getSlider,
  resetSliders,
  setSliderValue,
} from './shapeSliders';
import {
  MAX_HISTORY,
  applyPresetKeepBody,
  canConfirm,
  initWardrobe,
  isDirty,
  previewLook,
  relaxFits,
  wardrobeKey,
  wardrobeReducer,
  type WardrobeAction,
  type WardrobeState,
} from './wardrobeState';

function run(s: WardrobeState, ...actions: WardrobeAction[]): WardrobeState {
  return actions.reduce(wardrobeReducer, s);
}

describe('shapeSliders: thanh hình thể', () => {
  it('khoảng có tác dụng nằm trong giới hạn dữ liệu, ở cả hai kiểu và hai mesh', () => {
    for (const style of ['realistic', 'chibi'] as const) {
      for (const frame of ['male', 'female'] as const) {
        for (const d of SHAPE_SLIDERS) {
          const full = d.range(style, frame);
          const eff = d.effective(style, frame);
          expect(eff.min, `${d.id} ${style}`).toBeGreaterThanOrEqual(full.min);
          expect(eff.max, `${d.id} ${style}`).toBeLessThanOrEqual(full.max);
          expect(eff.max).toBeGreaterThanOrEqual(eff.min);
        }
      }
    }
  });

  it('giới hạn chibi khác realistic (chiều cao, vai, đầu)', () => {
    const h = getSlider('heightCm');
    expect(h?.range('realistic', 'male').min).toBe(155);
    expect(h?.range('chibi', 'male').max).toBe(130);
    expect(getSlider('shoulderWidth')?.effective('chibi', 'male').max).toBeLessThan(getSlider('shoulderWidth')?.effective('realistic', 'male').max ?? 0);
    expect(getSlider('headSize')?.effective('chibi', 'male').max).toBeGreaterThan(getSlider('headSize')?.effective('realistic', 'male').max ?? 0);
  });

  it('mỗi thanh đẩy tới chỗ có thật: chiều cao hoặc ít nhất một morph thân đổi trọng số', () => {
    const base = makeDefaultLook();
    const w0 = deriveBodyMorphWeights(base);
    for (const d of SHAPE_SLIDERS) {
      const eff = d.effective('realistic', 'male');
      const target = Math.abs(eff.max) >= Math.abs(eff.min) ? eff.max : eff.min;
      const next = setSliderValue(base, d.id, target);
      if (d.id === 'heightCm') {
        expect(next.body.heightCm).toBe(Math.round(target));
        continue;
      }
      if (d.support === 'bone') {
        expect(JSON.stringify(boneShapeOf(next)), d.id).not.toBe(JSON.stringify(boneShapeOf(base)));
        continue;
      }
      const w1 = deriveBodyMorphWeights(next);
      const changed = Object.keys(w0).some((k) => w0[k as keyof typeof w0] !== w1[k as keyof typeof w1]);
      expect(changed, d.id).toBe(true);
    }
  });

  it('kẹp theo khoảng có tác dụng: eo to và bụng âm không ghi được', () => {
    const base = makeDefaultLook();
    expect(setSliderValue(base, 'waist', 0.8).body.torso.waist).toBe(0);
    expect(setSliderValue(base, 'waist', -0.8).body.torso.waist).toBeCloseTo(-0.8, 5);
    expect(setSliderValue(base, 'belly', -1).body.torso.belly).toBe(0);
    expect(setSliderValue(base, 'heightCm', 999).body.heightCm).toBe(BODY_LIMITS_BY_STYLE.realistic.heightCm.male.max);
  });

  it('không sửa look gốc; id lạ và số hỏng trả nguyên tham chiếu', () => {
    const base = makeDefaultLook();
    const next = setSliderValue(base, 'chest', 0.5);
    expect(next).not.toBe(base);
    expect(base.body.torso.chest).toBe(0);
    expect(setSliderValue(base, 'khong-co', 1)).toBe(base);
    expect(setSliderValue(base, 'chest', Number.NaN)).toBe(base);
  });

  it('danh sách chưa hỗ trợ còn bắp tay/đùi/bàn tay; cổ, lưng, dài tay, dài chân đã có thanh xương', () => {
    const ids = UNSUPPORTED_SHAPE.map((u) => u.id);
    for (const id of ['arms', 'legs']) expect(ids).toContain(id);
    for (const id of ['neckLength', 'back', 'armLength', 'legLength']) expect(getSlider(id)?.support).toBe('bone');
    for (const u of UNSUPPORTED_SHAPE) expect(getSlider(u.id)).toBeUndefined();
  });

  it('đặt lại về mặc định theo chiều cao truyền vào', () => {
    let l = setSliderValue(makeDefaultLook(), 'belly', 0.7);
    l = setSliderValue(l, 'heightCm', 190);
    const r = resetSliders(l, 170);
    expect(r.body.torso.belly).toBe(0);
    expect(r.body.heightCm).toBe(170);
  });

  it('chuyển kiểu giữ tỉ lệ: chiều cao theo vị trí tương đối, giữ trang phục, hợp lệ', () => {
    let l = makeDefaultLook();
    l = setSliderValue(l, 'heightCm', 200); // cao nhất realistic nam
    l = setSliderValue(l, 'shoulderWidth', 0.9);
    const c = convertBodyStyle(l, 'chibi');
    expect(c.bodyStyle).toBe('chibi');
    expect(c.body.heightCm).toBe(BODY_LIMITS_BY_STYLE.chibi.heightCm.male.max);
    expect(c.body.torso.shoulderWidth).toBeLessThanOrEqual(BODY_LIMITS_BY_STYLE.chibi.torso.shoulderWidth.max);
    expect(c.outfit.inner?.garmentId).toBe(l.outfit.inner?.garmentId);
    expect(validate(c).warnings.filter((w) => w.code === 'clamped')).toEqual([]);
    const mid = convertBodyStyle(makeDefaultLook(), 'chibi');
    expect(mid.body.heightCm).toBeGreaterThan(BODY_LIMITS_BY_STYLE.chibi.heightCm.male.min);
    expect(mid.body.heightCm).toBeLessThan(BODY_LIMITS_BY_STYLE.chibi.heightCm.male.max);
    expect(convertBodyStyle(mid, 'chibi')).toBe(mid);
  });

  it('khứ hồi realistic -> chibi -> realistic vẫn trong giới hạn', () => {
    const l = setSliderValue(makeDefaultLook(), 'heightCm', 185);
    const back = convertBodyStyle(convertBodyStyle(l, 'chibi'), 'realistic');
    const r = BODY_LIMITS_BY_STYLE.realistic.heightCm.male;
    expect(back.body.heightCm).toBeGreaterThanOrEqual(r.min);
    expect(back.body.heightCm).toBeLessThanOrEqual(r.max);
    expect(Math.abs(back.body.heightCm - 185)).toBeLessThanOrEqual(3);
  });

  it('đổi mesh nam/nữ kẹp chiều cao theo khoảng mới', () => {
    const l = setSliderValue(makeDefaultLook(), 'heightCm', 200);
    const f = convertFrame(l, 'female');
    expect(f.body.frame).toBe('female');
    expect(f.body.heightCm).toBe(BODY_LIMITS_BY_STYLE.realistic.heightCm.female.max);
    expect(convertFrame(f, 'female')).toBe(f);
  });
});

describe('wardrobeState: reducer', () => {
  const start = () => initWardrobe(makeDefaultLook());

  it('mặc món hợp lệ ghi vào bản nháp và lịch sử; hoàn tác/làm lại', () => {
    const s1 = run(start(), { type: 'wear', slot: 'outer', garmentId: 'outer-blazer' });
    expect(s1.draft.outfit.outer?.garmentId).toBe('outer-blazer');
    expect(s1.undoStack.length).toBe(1);
    const s2 = run(s1, { type: 'undo' });
    expect(s2.draft.outfit.outer).toBeNull();
    const s3 = run(s2, { type: 'redo' });
    expect(s3.draft.outfit.outer?.garmentId).toBe('outer-blazer');
  });

  it('mặc mũ (mesh procedural gắn xương head) được chấp nhận và vào lịch sử', () => {
    const s0 = start();
    const s1 = run(s0, { type: 'wear', slot: 'hat', garmentId: 'hat-cap' });
    expect(s1.draft.outfit.hat?.garmentId).toBe('hat-cap');
    expect(s1.undoStack.length).toBe(1);
  });

  it('đầm cần xác nhận: chưa áp tới khi đồng ý; "giữ nguyên" không đổi gì', () => {
    const s1 = run(start(), { type: 'wear', slot: 'onePiece', garmentId: 'onepiece-dress-office' });
    expect(s1.pending?.status).toBe('needs-confirm');
    expect(s1.draft.outfit.onePiece).toBeNull();
    const keep = run(s1, { type: 'dismissPending' });
    expect(keep.pending).toBeNull();
    expect(keep.draft.outfit.bottom).not.toBeNull();
    const ok = run(s1, { type: 'confirmPending' });
    expect(ok.draft.outfit.onePiece?.garmentId).toBe('onepiece-dress-office');
    expect(ok.draft.outfit.bottom).toBeNull();
    expect(ok.undoStack.length).toBe(1);
  });

  it('cởi áo ngoài được; cởi áo trong thì rules tự thêm áo phông và báo', () => {
    const withOuter = run(start(), { type: 'wear', slot: 'outer', garmentId: 'outer-bomber' });
    expect(run(withOuter, { type: 'takeOff', slot: 'outer' }).draft.outfit.outer).toBeNull();
    const s = run(start(), { type: 'takeOff', slot: 'inner' });
    expect(s.draft.outfit.inner?.garmentId).toBe('inner-tee');
    expect(s.notice?.text).toContain('Áo trong');
  });

  it('đổi màu kéo về bảng màu; vùng/chất liệu sai bị từ chối', () => {
    const s1 = run(start(), { type: 'color', slot: 'inner', zone: 'body', hex: '#fe0000' });
    expect(s1.draft.outfit.inner?.colors.body).toMatch(/^#[0-9a-f]{6}$/);
    expect(s1.draft.outfit.inner?.colors.body).not.toBe('#fe0000');
    const bad = run(start(), { type: 'color', slot: 'inner', zone: 'sole', hex: '#ffffff' });
    expect(bad.notice?.kind).toBe('error');
    const badMat = run(start(), { type: 'material', slot: 'inner', zone: 'body', material: 'metal' });
    expect(badMat.notice?.kind).toBe('error');
    const okMat = run(start(), { type: 'material', slot: 'inner', zone: 'body', material: 'knit' });
    expect(okMat.draft.outfit.inner?.materials.body === 'knit' || okMat.notice?.kind === 'error').toBe(true);
  });

  it('kéo thanh trượt liên tục chỉ tạo một bước hoàn tác; hành động khác ngắt gộp', () => {
    let s = start();
    for (const v of [0.1, 0.2, 0.3, 0.4]) s = run(s, { type: 'slider', id: 'chest', value: v });
    expect(s.undoStack.length).toBe(1);
    expect(s.draft.body.torso.chest).toBeCloseTo(0.4, 5);
    s = run(s, { type: 'tab', tab: 'outfit' }, { type: 'slider', id: 'chest', value: 0.6 });
    expect(s.undoStack.length).toBe(2);
    s = run(s, { type: 'undo' });
    expect(s.draft.body.torso.chest).toBeCloseTo(0.4, 5);
  });

  it('thanh hình thể bị từ chối khi làm phom ôm không còn hỗ trợ, giữ giá trị cũ', () => {
    const slim = run(start(), { type: 'fit', slot: 'inner', fit: 'slim' });
    expect(slim.draft.outfit.inner?.fit).toBe('slim');
    const s = run(slim, { type: 'slider', id: 'belly', value: 0.9 });
    expect(s.draft.body.torso.belly).toBe(0);
    expect(s.notice?.kind).toBe('error');
    expect(s.notice?.text).toContain('Giữ hình thể cũ');
    const reg = run(start(), { type: 'slider', id: 'belly', value: 0.9 });
    expect(reg.draft.body.torso.belly).toBeCloseTo(0.9, 5);
  });

  it('lịch sử bị chặn ở MAX_HISTORY', () => {
    let s = start();
    for (let i = 0; i < MAX_HISTORY + 20; i++) {
      s = run(s, { type: 'color', slot: 'inner', zone: 'body', hex: i % 2 ? '#ffffff' : '#22272e' });
    }
    expect(s.undoStack.length).toBeLessThanOrEqual(MAX_HISTORY);
  });

  it('đổi kiểu tạo hình: nháp chuyển sang chibi; đổi lại realistic; hoàn tác được', () => {
    const s1 = run(start(), { type: 'style', style: 'chibi' });
    expect(s1.draft.bodyStyle).toBe('chibi');
    expect(s1.draft.body.heightCm).toBeLessThanOrEqual(130);
    const s2 = run(s1, { type: 'undo' });
    expect(s2.draft.bodyStyle).toBe('realistic');
    expect(run(s1, { type: 'style', style: 'chibi' })).toBe(s1);
  });

  it('bộ mẫu giữ hình thể người dùng, đổi trang phục; mọi bộ mẫu dùng được ở cả hai kiểu', () => {
    let base = setSliderValue(makeDefaultLook(), 'heightCm', 183);
    base = setSliderValue(base, 'chest', 0.4);
    for (const style of ['realistic', 'chibi'] as const) {
      const cur = style === 'chibi' ? convertBodyStyle(base, 'chibi') : base;
      for (const p of PRESETS) {
        const r = applyPresetKeepBody(cur, p.id);
        expect(r, p.id).not.toBeNull();
        if (!r) continue;
        expect(r.look.body.heightCm).toBe(cur.body.heightCm);
        expect(r.look.body.torso.chest).toBe(cur.body.torso.chest);
        expect(r.look.meta.presetId).toBe(p.id);
        expect(hasBlockingIssue(checkOutfit(r.look)), `${p.id} ${style}`).toBe(false);
      }
    }
    expect(applyPresetKeepBody(base, 'khong-co')).toBeNull();
  });

  it('áp bộ mẫu lên hình thể bụng lớn tự hạ phom ôm và báo thay đổi', () => {
    const l = makeDefaultLook();
    l.body.torso.belly = 0.9;
    l.outfit.inner = wear('inner-tee', { fit: 'slim' });
    const r = relaxFits(l);
    expect(r.look.outfit.inner?.fit).not.toBe('slim');
    expect(r.changes.length).toBeGreaterThan(0);
    expect(hasBlockingIssue(checkOutfit(r.look))).toBe(false);
  });

  it('so sánh trước/sau, đặt lại, trạng thái bẩn và xác nhận', () => {
    let s = run(start(), { type: 'wear', slot: 'outer', garmentId: 'outer-bomber' });
    expect(isDirty(s)).toBe(true);
    expect(previewLook(s).outfit.outer?.garmentId).toBe('outer-bomber');
    s = run(s, { type: 'compare', on: true });
    expect(previewLook(s).outfit.outer).toBeNull();
    s = run(s, { type: 'compare', on: false }, { type: 'resetAll' });
    expect(isDirty(s)).toBe(false);
    expect(canConfirm(s)).toBe(true);
    const pending = run(start(), { type: 'wear', slot: 'onePiece', garmentId: 'onepiece-dress-office' });
    expect(canConfirm(pending)).toBe(false);
  });

  it('draft không chia sẻ tham chiếu với look ban đầu', () => {
    const look = makeDefaultLook();
    const s = initWardrobe(look);
    s.draft.outfit.inner = null;
    expect(look.outfit.inner).not.toBeNull();
    expect(cloneLook(look)).toEqual(look);
  });
});

describe('wardrobeKey: phím truy cập', () => {
  it('Esc hủy, Ctrl+Enter xác nhận, Ctrl+Z/Shift+Z/Y', () => {
    expect(wardrobeKey({ key: 'Escape' })).toEqual({ type: 'cancel' });
    expect(wardrobeKey({ key: 'Enter', ctrlKey: true })).toEqual({ type: 'confirm' });
    expect(wardrobeKey({ key: 'z', ctrlKey: true })).toEqual({ type: 'action', action: { type: 'undo' } });
    expect(wardrobeKey({ key: 'Z', ctrlKey: true, shiftKey: true })).toEqual({ type: 'action', action: { type: 'redo' } });
    expect(wardrobeKey({ key: 'y', metaKey: true })).toEqual({ type: 'action', action: { type: 'redo' } });
  });
  it('phím số chuyển tab, bỏ qua khi đang gõ vào ô nhập', () => {
    expect(wardrobeKey({ key: '4' })).toEqual({ type: 'action', action: { type: 'tab', tab: 'shape' } });
    expect(wardrobeKey({ key: '4', inField: true })).toBeNull();
    expect(wardrobeKey({ key: 'v' })).toEqual({ type: 'resetView' });
    expect(wardrobeKey({ key: 'q' })).toBeNull();
  });
});

describe('MpfbOutfit: chữ ký và tìm thân', () => {
  it('chữ ký cấu trúc không đổi khi chỉ đổi màu; đổi khi đổi món/phom/sơ vin/kiểu', () => {
    const a = makeDefaultLook();
    const b = cloneLook(a);
    const w = b.outfit.inner;
    if (w) w.colors.body = '#000000';
    expect(structureSignature(b)).toBe(structureSignature(a));
    expect(colorSignature(b)).not.toBe(colorSignature(a));
    const c = cloneLook(a);
    if (c.outfit.inner) c.outfit.inner.fit = 'oversized';
    expect(structureSignature(c)).not.toBe(structureSignature(a));
    const d = cloneLook(a);
    d.bodyStyle = 'chibi';
    expect(structureSignature(d)).not.toBe(structureSignature(a));
    expect(structureSignature(null)).toBe('none');
  });

  it('findBodyMesh chọn SkinnedMesh có morph bodyBelly và bỏ vỏ trang phục', () => {
    const root = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    const shell = new THREE.SkinnedMesh(geo);
    shell.name = 'outfit:inner';
    shell.morphTargetDictionary = { bodyBelly: 0 };
    const body = new THREE.SkinnedMesh(geo);
    body.name = 'male_real';
    body.morphTargetDictionary = { bodyBelly: 12 };
    const other = new THREE.SkinnedMesh(geo);
    other.morphTargetDictionary = { eyeBlink_L: 0 };
    root.add(shell, other, body);
    expect(findBodyMesh(root)).toBe(body);
    expect(findBodyMesh(new THREE.Group())).toBeNull();
  });
});
