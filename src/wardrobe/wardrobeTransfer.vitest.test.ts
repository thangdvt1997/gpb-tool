import { describe, it, expect } from 'vitest';
import type { CharacterLook } from '../fashion/types';
import { GARMENTS, garmentsInGroup } from '../fashion/catalog';
import { PRESETS } from '../fashion/presets';
import { applyPresetKeepBody } from './wardrobeState';
import { colorFamily, colorsIn, filterGarments, garmentColorFamilies, stylesIn, NO_FILTER } from './garmentFilter';
import { exportLookChecked, importLookChecked } from './lookTransfer';
import { initWardrobe, wardrobeReducer } from './wardrobeState';
import { DEFAULT_LOOK } from '../fashion/defaults';

describe('lọc tủ đồ theo phong cách và màu', () => {
  it('họ màu cơ bản', () => {
    expect(colorFamily('#000000')).toBe('black');
    expect(colorFamily('#ffffff')).toBe('white');
    expect(colorFamily('#808080')).toBe('gray');
    expect(colorFamily('#d02020')).toBe('red');
    expect(colorFamily('#2060d0')).toBe('blue');
    expect(colorFamily('#20a040')).toBe('green');
    expect(colorFamily('không phải màu')).toBeNull();
  });

  it('không lọc thì giữ nguyên; lọc phong cách chỉ trả món có thẻ đó', () => {
    const all = GARMENTS;
    expect(filterGarments(all, NO_FILTER)).toHaveLength(all.length);
    const styles = stylesIn(all);
    expect(styles.length).toBeGreaterThan(1);
    for (const st of styles) {
      const r = filterGarments(all, { style: st, color: null });
      expect(r.length).toBeGreaterThan(0);
      expect(r.every((g) => g.styles.includes(st))).toBe(true);
    }
  });

  it('lọc màu: mọi món trả về có họ màu đó; tổ hợp phong cách + màu là giao', () => {
    const all = GARMENTS;
    const colors = colorsIn(all);
    expect(colors.length).toBeGreaterThan(1);
    for (const c of colors) {
      const r = filterGarments(all, { style: null, color: c });
      expect(r.length).toBeGreaterThan(0);
      expect(r.every((g) => garmentColorFamilies(g).includes(c))).toBe(true);
    }
    const both = filterGarments(all, { style: 'office', color: colors[0] });
    expect(both.every((g) => g.styles.includes('office') && garmentColorFamilies(g).includes(colors[0]))).toBe(true);
  });

  it('mỗi nhóm đồ đều lọc được bằng phong cách hiện có', () => {
    for (const g of ['inner', 'bottom', 'shoes'] as const) {
      const list = garmentsInGroup(g);
      for (const st of stylesIn(list)) expect(filterGarments(list, { style: st, color: null }).length).toBeGreaterThan(0);
    }
  });
});

describe('xuất/nhập JSON nhân vật có checksum', () => {
  const look = applyPresetKeepBody(structuredClone(DEFAULT_LOOK) as CharacterLook, PRESETS[0].id)!.look;

  it('xuất rồi nhập lại: checksum khớp, look giữ nguyên', async () => {
    const json = await exportLookChecked(look);
    expect(JSON.parse(json).checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    const r = await importLookChecked(json);
    expect(r.checksum).toBe('ok');
    expect(r.result.ok).toBe(true);
    if (r.result.ok) expect(r.result.look.outfit).toEqual(look.outfit);
  });

  it('sửa tay nội dung thì checksum không khớp và bị từ chối', async () => {
    const o = JSON.parse(await exportLookChecked(look));
    o.look.meta.name = 'Bị sửa';
    const r = await importLookChecked(JSON.stringify(o));
    expect(r.checksum).toBe('mismatch');
    expect(r.result.ok).toBe(false);
  });

  it('tệp không có checksum vẫn nhập được (đánh dấu missing); rác thì lỗi', async () => {
    const o = JSON.parse(await exportLookChecked(look));
    delete o.checksum;
    const r = await importLookChecked(JSON.stringify(o));
    expect(r.checksum).toBe('missing');
    expect(r.result.ok).toBe(true);
    expect((await importLookChecked('{không phải json')).result.ok).toBe(false);
    expect((await importLookChecked('')).result.ok).toBe(false);
  });

  it('reducer importLook ghi vào draft và hoàn tác được', async () => {
    const st = initWardrobe(DEFAULT_LOOK);
    const next = wardrobeReducer(st, { type: 'importLook', look });
    expect(next.draft.outfit).toEqual(look.outfit);
    expect(next.undoStack.length).toBe(1);
    const back = wardrobeReducer(next, { type: 'undo' });
    expect(back.draft.outfit).toEqual(st.draft.outfit);
  });
});
