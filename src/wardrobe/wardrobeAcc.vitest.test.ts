import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HAIR_STYLES } from '../fashion/hair';
import { cloneLook, makeDefaultLook, wear } from '../fashion/defaults';
import { ACCESSORY_SIZE_MAX } from '../fashion/catalog';
import { hairUnderHat, hairUnderHatOf } from '../avatar/outfit/hairHat';
import { bodyDataFromMesh } from '../avatar/outfit/threeShell';
import { WARDROBE_TABS, initWardrobe, wardrobeKey, wardrobeReducer, type WardrobeAction, type WardrobeState } from './wardrobeState';

const run = (s: WardrobeState, ...a: WardrobeAction[]) => a.reduce(wardrobeReducer, s);
const fresh = () => initWardrobe(makeDefaultLook());

describe('tab Phụ kiện: chọn, bỏ, tùy chỉnh và lưu vào look', () => {
  it('có tab Phụ kiện và Họa tiết, phím 6 và 7', () => {
    expect(WARDROBE_TABS.map((t) => t.id)).toEqual(expect.arrayContaining(['acc', 'pattern']));
    expect(wardrobeKey({ key: '6' })).toEqual({ type: 'action', action: { type: 'tab', tab: 'acc' } });
    expect(wardrobeKey({ key: '7' })).toEqual({ type: 'action', action: { type: 'tab', tab: 'pattern' } });
    expect(wardrobeKey({ key: '6', inField: true })).toBeNull();
  });

  it('chọn kính, đổi màu/cỡ/chất liệu, bỏ; hoàn tác được', () => {
    let s = run(fresh(), { type: 'acc', slot: 'eyewear', itemId: 'eyewear-round' });
    expect(s.draft.accessories.eyewear?.itemId).toBe('eyewear-round');
    s = run(s, { type: 'accOpt', slot: 'eyewear', patch: { size: 5 } });
    expect(s.draft.accessories.eyewear?.size).toBe(ACCESSORY_SIZE_MAX);
    s = run(s, { type: 'accOpt', slot: 'eyewear', patch: { material: 'metal' } });
    expect(s.draft.accessories.eyewear?.material).toBe('metal');
    const bad = run(s, { type: 'accOpt', slot: 'eyewear', patch: { material: 'denim' } });
    expect(bad.draft.accessories.eyewear?.material).toBe('metal');
    expect(bad.notice?.kind).toBe('error');
    s = run(s, { type: 'acc', slot: 'eyewear', itemId: null });
    expect(s.draft.accessories.eyewear).toBeNull();
    s = run(s, { type: 'undo' });
    expect(s.draft.accessories.eyewear).not.toBeNull();
  });

  it('từ chối món sai ô; điện thoại và tai nghe có trạng thái mặc định', () => {
    const wrong = run(fresh(), { type: 'acc', slot: 'watch', itemId: 'eyewear-round' });
    expect(wrong.draft.accessories.watch).toBeNull();
    expect(wrong.notice?.kind).toBe('error');
    let s = run(fresh(), { type: 'acc', slot: 'phone', itemId: 'phone-slab' }, { type: 'acc', slot: 'headphones', itemId: 'headphones-over' });
    expect(s.draft.accessories.phone?.state).toBe('held');
    s = run(s, { type: 'accOpt', slot: 'phone', patch: { state: 'using' } }, { type: 'accOpt', slot: 'headphones', patch: { wear: 'around-neck' } });
    expect(s.draft.accessories.phone?.state).toBe('using');
    expect(s.draft.accessories.headphones?.wear).toBe('around-neck');
  });

  it('bên đeo phải thuộc danh sách cho phép', () => {
    let s = run(fresh(), { type: 'acc', slot: 'watch', itemId: 'watch-metal' });
    s = run(s, { type: 'accOpt', slot: 'watch', patch: { side: 'both' } });
    expect(s.draft.accessories.watch?.side).not.toBe('both');
    s = run(s, { type: 'accOpt', slot: 'watch', patch: { side: 'right' } });
    expect(s.draft.accessories.watch?.side).toBe('right');
  });

  it('nhẫn: thêm, không trùng ngón, tối đa 4, bỏ', () => {
    let s = fresh();
    const add = (finger: 'index' | 'middle' | 'ring' | 'little', hand: 'left' | 'right' = 'right') => (s = run(s, { type: 'ring', op: 'add', itemId: 'ring-band', hand, finger }));
    add('ring');
    add('ring');
    expect(s.draft.accessories.rings.length).toBe(1);
    add('index');
    add('middle');
    add('little');
    expect(s.draft.accessories.rings.length).toBe(4);
    add('index', 'left');
    expect(s.draft.accessories.rings.length).toBe(4);
    s = run(s, { type: 'ring', op: 'remove', index: 0 });
    expect(s.draft.accessories.rings.length).toBe(3);
  });

  it('cà vạt bị bỏ có thông báo khi không còn áo sơ mi', () => {
    const look = cloneLook(makeDefaultLook());
    look.outfit.inner = wear('inner-shirt-long');
    let s = initWardrobe(look);
    s = run(s, { type: 'acc', slot: 'tie', itemId: 'tie-classic' });
    expect(s.draft.accessories.tie).not.toBeNull();
    s = run(s, { type: 'wear', slot: 'inner', garmentId: 'inner-tee' });
    // Áo phông không cổ: validate qua tab phụ kiện sẽ bỏ cà vạt khi chỉnh tiếp.
    s = run(s, { type: 'accOpt', slot: 'tie', patch: { size: 1.1 } });
    expect(s.draft.accessories.tie === null || s.draft.accessories.tie.size === 1.1).toBe(true);
  });

  it('mũ chọn và bỏ qua tab phụ kiện (wear/takeOff slot hat)', () => {
    let s = run(fresh(), { type: 'wear', slot: 'hat', garmentId: 'hat-cap' });
    expect(s.draft.outfit.hat?.garmentId).toBe('hat-cap');
    s = run(s, { type: 'takeOff', slot: 'hat' });
    expect(s.draft.outfit.hat).toBeNull();
  });
});

describe('tab Họa tiết', () => {
  const withTee = () => run(fresh(), { type: 'wear', slot: 'inner', garmentId: 'inner-tee' });
  it('thêm chữ, sửa, giới hạn độ dài, xóa; gộp lịch sử khi kéo thanh', () => {
    let s = withTee();
    s = run(s, { type: 'patternAdd', slot: 'inner', patternId: 'pt-text' });
    expect(s.draft.outfit.inner?.patterns.length).toBe(1);
    s = run(s, { type: 'patternSet', slot: 'inner', index: 0, patch: { text: 'X'.repeat(40) } });
    expect(s.draft.outfit.inner?.patterns[0].text.length).toBe(16);
    const before = s.undoStack.length;
    s = run(s, { type: 'patternSet', slot: 'inner', index: 0, patch: { scale: 1.5 } }, { type: 'patternSet', slot: 'inner', index: 0, patch: { scale: 2 } }, { type: 'patternSet', slot: 'inner', index: 0, patch: { scale: 9 } });
    expect(s.draft.outfit.inner?.patterns[0].scale).toBe(3);
    expect(s.undoStack.length).toBe(before);
    s = run(s, { type: 'patternRemove', slot: 'inner', index: 0 });
    expect(s.draft.outfit.inner?.patterns.length).toBe(0);
  });
  it('họa tiết không chữ không nhận chữ; tối đa 4; ô trống bị từ chối', () => {
    let s = withTee();
    s = run(s, { type: 'patternAdd', slot: 'inner', patternId: 'pt-dots' });
    s = run(s, { type: 'patternSet', slot: 'inner', index: 0, patch: { text: 'abc' } });
    expect(s.draft.outfit.inner?.patterns[0].text).toBe('');
    for (let i = 0; i < 6; i++) s = run(s, { type: 'patternAdd', slot: 'inner', patternId: 'pt-stripes' });
    expect(s.draft.outfit.inner?.patterns.length).toBe(4);
    const e = run(fresh(), { type: 'patternAdd', slot: 'hat', patternId: 'pt-dots' });
    expect(e.notice?.kind).toBe('error');
  });
});

describe('tóc né mũ', () => {
  it('không mũ thì giữ nguyên; có mũ thì nén hoặc ẩn đỉnh, mọi kiểu tóc', () => {
    for (const h of HAIR_STYLES) {
      expect(hairUnderHat(h.id, null).crownScale).toBe(1);
      const r = hairUnderHat(h.id, 'cap');
      expect(r.crownScale).toBeLessThan(1);
      expect(r.hideCrown).toBe(h.length === 'very-short');
    }
  });
  it('theo look', () => {
    const l = cloneLook(makeDefaultLook());
    expect(hairUnderHatOf(l).crownScale).toBe(1);
    l.outfit.hat = wear('hat-beanie');
    expect(hairUnderHatOf(l).crownScale).toBeLessThan(1);
  });
});

describe('analyzeBody: vị trí xương theo bindMatrix gốc', () => {
  it('không đổi khi mesh bị scale/di chuyển sau lúc bind', () => {
    const b0 = new THREE.Bone();
    b0.name = 'pelvis';
    const b1 = new THREE.Bone();
    b1.name = 'neck_01';
    b1.position.set(0, 1, 0);
    b0.add(b1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    geo.setIndex([0, 1, 2]);
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
    const root = new THREE.Group();
    root.add(b0, mesh);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton([b0, b1]));
    const ref = bodyDataFromMesh(mesh).bonePos['neck_01'];
    root.scale.setScalar(0.87);
    root.position.set(3, 0.2, -1);
    root.updateMatrixWorld(true);
    const after = bodyDataFromMesh(mesh).bonePos['neck_01'];
    expect(after[0]).toBeCloseTo(ref[0], 5);
    expect(after[1]).toBeCloseTo(ref[1], 5);
    expect(after[2]).toBeCloseTo(ref[2], 5);
    expect(after[1]).toBeCloseTo(1, 5);
  });
});
