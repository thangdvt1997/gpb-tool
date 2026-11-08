import { describe, expect, it } from 'vitest';
import { actionForKey, buildBatchOps, createEditorState, describeChanges, editorReducer, isDirty, validatePose, type EditorAction, type EditorEnv, type EditorState } from './core';
import { DOOR_WIDTH, isPropId, newPropId, propRects } from './props';
import { saveDraft, type SaveApi } from './save';
import type { LayoutState } from '../layout/types';
import { officeCoverage } from '../scene/officeBounds';

const sz = { w: 1, h: 1, d: 1, centerY: 0.5 };
const env: EditorEnv = { sizes: { a: sz }, fixed: [{ minX: -23, maxX: -22, minZ: -1, maxZ: 1 }], keepOut: [] };
const server: LayoutState = { items: {}, defaults: { a: { x: -25, z: 0, rotation: 0 } }, version: 4 };

const run = (s: EditorState, ...as: EditorAction[]) => as.reduce(editorReducer, s);
const start = () => run(createEditorState(env, 'it', server), { type: 'enter' });
const propIds = (s: EditorState) => Object.keys(s.draft).filter(isPropId);

describe('thêm vật', () => {
  it('thêm từ danh mục: chọn vật mới, hợp lệ, một bước hoàn tác', () => {
    const s = run(start(), { type: 'addProp', kind: 'table', id: 'p_aaaa01', at: { x: -25, z: 8 } });
    expect(propIds(s)).toEqual(['p_aaaa01']);
    expect(s.selectedId).toBe('p_aaaa01');
    const pose = s.draft.p_aaaa01;
    expect(validatePose(s.env, { ...s.draft }, 'p_aaaa01', pose).valid).toBe(true);
    expect(isDirty(s)).toBe(true);
    const u = run(s, { type: 'undo' });
    expect(propIds(u)).toEqual([]);
    expect(u.selectedId).toBeNull();
    expect(isDirty(u)).toBe(false);
    const r = run(u, { type: 'redo' });
    expect(propIds(r)).toEqual(['p_aaaa01']);
  });

  it('vật mới luôn nằm trong chữ L, không chồng vật cố định và vật khác', () => {
    let s = start();
    for (let i = 0; i < 12; i++) s = run(s, { type: 'addProp', kind: i % 2 ? 'chair' : 'cabinet', id: `p_bbbb${String(i).padStart(2, '0')}`, at: { x: -25, z: 0 } });
    expect(propIds(s)).toHaveLength(12);
    for (const id of propIds(s)) {
      const sizeOf = s.env.sizes[id];
      const p = s.draft[id];
      const half = p.rotation === 90 || p.rotation === 270 ? [sizeOf.d, sizeOf.w] : [sizeOf.w, sizeOf.d];
      const rect = { minX: p.x - half[0] / 2, maxX: p.x + half[0] / 2, minZ: p.z - half[1] / 2, maxZ: p.z + half[1] / 2 };
      expect(officeCoverage(rect)).toBe('inside');
      expect(validatePose(s.env, s.draft, id, p).valid).toBe(true);
    }
  });

  it('từ chối mã trùng, mã sai, loại lạ', () => {
    const s = run(start(), { type: 'addProp', kind: 'chair', id: 'p_cccc01', at: { x: -25, z: 8 } });
    expect(run(s, { type: 'addProp', kind: 'chair', id: 'p_cccc01' }).past).toHaveLength(s.past.length);
    expect(run(s, { type: 'addProp', kind: 'chair', id: 'bad' }).message).toMatch(/không hợp lệ/);
    expect(run(s, { type: 'addProp', kind: 'sofa' as never, id: 'p_cccc02' }).message).toMatch(/danh mục/);
  });

  it('vị trí kéo vào vật cố định bị từ chối; hai vật thêm không chồng nhau; hai tường được nối', () => {
    let s = run(start(), { type: 'addProp', kind: 'table', id: 'p_dddd01', at: { x: -25, z: 8 } });
    const t = s.draft.p_dddd01;
    s = run(s, { type: 'addProp', kind: 'chair', id: 'p_dddd02', at: { x: -25, z: 8 } });
    expect(validatePose(s.env, s.draft, 'p_dddd02', t).valid).toBe(false);
    expect(validatePose(s.env, s.draft, 'p_dddd01', { x: -22.5, z: 0, rotation: 0 }).valid).toBe(false);
    s = run(s, { type: 'addProp', kind: 'wall4', id: 'p_dddd03', at: { x: -25, z: 4 } });
    const w = s.draft.p_dddd03;
    s = run(s, { type: 'addProp', kind: 'wall2', id: 'p_dddd04', at: { x: -25, z: -6 } });
    expect(validatePose(s.env, s.draft, 'p_dddd04', { ...w, x: w.x + 1 }).valid).toBe(true); // chồng lên tường kia vẫn được
  });
});

describe('xóa và nhân bản', () => {
  const withTable = () => run(start(), { type: 'addProp', kind: 'table', id: 'p_eeee01', at: { x: -25, z: 8 } });

  it('Delete xóa vật thêm đang chọn, hoàn tác khôi phục', () => {
    const s = run(withTable(), { type: 'delete' });
    expect(propIds(s)).toEqual([]);
    expect(s.selectedId).toBeNull();
    const u = run(s, { type: 'undo' });
    expect(propIds(u)).toEqual(['p_eeee01']);
  });

  it('Delete trên vật gốc vẫn là đặt lại về mặc định (không xóa vật gốc)', () => {
    let s = run(start(), { type: 'select', id: 'a' }, { type: 'nudge', dir: 'up' });
    expect(s.draft.a.z).not.toBe(0);
    s = run(s, { type: 'delete' });
    expect(s.draft.a).toEqual({ x: -25, z: 0, rotation: 0 });
    expect('a' in s.draft).toBe(true);
  });

  it('lưu sau khi thêm rồi xóa trong cùng phiên không gửi gì', () => {
    const s = run(withTable(), { type: 'delete' });
    expect(buildBatchOps(s)).toEqual([]);
  });

  it('nhân bản sinh vật mới cùng loại, cạnh vật gốc, không chồng', () => {
    const s = run(withTable(), { type: 'duplicate', id: 'p_eeee02' });
    expect(propIds(s).sort()).toEqual(['p_eeee01', 'p_eeee02']);
    expect(s.env.props!.p_eeee02).toBe('table');
    expect(s.selectedId).toBe('p_eeee02');
    expect(validatePose(s.env, s.draft, 'p_eeee02', s.draft.p_eeee02).valid).toBe(true);
    expect(s.draft.p_eeee02).not.toEqual(s.draft.p_eeee01);
  });

  it('nhân bản vật gốc không phải cây bị từ chối; thiếu mã bị từ chối', () => {
    const s = run(start(), { type: 'select', id: 'a' }, { type: 'duplicate', id: 'p_ffff01' });
    expect(s.message).toMatch(/không nhân bản/);
    expect(run(withTable(), { type: 'duplicate' }).message).toMatch(/Thiếu mã/);
  });

  it('phím: Delete -> xóa, Ctrl+D -> nhân bản', () => {
    expect(actionForKey({ key: 'Delete' })).toEqual({ type: 'delete' });
    expect(actionForKey({ key: 'd', ctrlKey: true })).toEqual({ type: 'duplicate' });
    expect(actionForKey({ key: 'D', metaKey: true })).toEqual({ type: 'duplicate' });
  });

  it('newPropId sinh mã hợp lệ và khác nhau', () => {
    const ids = new Set(Array.from({ length: 50 }, newPropId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(isPropId(id)).toBe(true);
  });
});

describe('tường ngăn và cửa', () => {
  const withWall = () => run(start(), { type: 'addProp', kind: 'wall4', id: 'p_gggg01', at: { x: -25, z: 8 } });

  it('thêm cửa/bỏ cửa, hoàn tác được; vật không phải tường không có cửa', () => {
    let s = run(withWall(), { type: 'toggleDoor' });
    expect(s.draft.p_gggg01.door).toBe(true);
    s = run(s, { type: 'undo' });
    expect(s.draft.p_gggg01.door).toBeFalsy();
    s = run(s, { type: 'redo' }, { type: 'toggleDoor' });
    expect(s.draft.p_gggg01.door).toBeFalsy();
    const t = run(start(), { type: 'addProp', kind: 'chair', id: 'p_gggg02', at: { x: -25, z: 8 } }, { type: 'toggleDoor' });
    expect(t.message).toMatch(/Chỉ tường/);
  });

  it('hộp va chạm: tường liền một hộp, có cửa tách hai hộp chừa khoảng hở DOOR_WIDTH (cả hai hướng)', () => {
    const solid = propRects('wall4', { x: 0, z: 0, rotation: 0 });
    expect(solid).toHaveLength(1);
    expect(solid[0].maxX - solid[0].minX).toBeCloseTo(4);
    const door = propRects('wall4', { x: 0, z: 0, rotation: 0, door: true });
    expect(door).toHaveLength(2);
    expect(door[1].minX - door[0].maxX).toBeCloseTo(DOOR_WIDTH);
    expect(door[0].minX).toBeCloseTo(-2);
    expect(door[1].maxX).toBeCloseTo(2);
    const rot = propRects('wall4', { x: 1, z: 2, rotation: 90, door: true });
    expect(rot).toHaveLength(2);
    expect(rot[1].minZ - rot[0].maxZ).toBeCloseTo(DOOR_WIDTH);
    expect(rot[0].minZ).toBeCloseTo(0);
    expect(rot[0].maxX - rot[0].minX).toBeCloseTo(0.15);
    expect(propRects('table', { x: 0, z: 0, rotation: 0, door: true })).toHaveLength(1);
  });

  it('cửa nằm trong thao tác lưu', () => {
    const s = run(withWall(), { type: 'toggleDoor' });
    expect(buildBatchOps(s)).toEqual([{ op: 'put', id: 'p_gggg01', kind: 'wall4', x: s.draft.p_gggg01.x, z: s.draft.p_gggg01.z, rotation: 0, door: true }]);
  });
});

describe('lưu nguyên tử', () => {
  const dirtyState = () =>
    run(start(), { type: 'addProp', kind: 'cabinet', id: 'p_hhhh01', at: { x: -25, z: 8 } }, { type: 'select', id: 'a' }, { type: 'nudge', dir: 'up' });

  const okLoad = { ok: true as const, data: server };
  const noLegacy = () => {
    throw new Error('không được gọi từng vật');
  };

  it('gửi mọi thay đổi trong đúng một request batch', async () => {
    const calls: unknown[] = [];
    const api: SaveApi = {
      move: noLegacy as never,
      reset: noLegacy as never,
      load: async () => okLoad,
      batch: async (ops) => {
        calls.push(ops);
        return { ok: true, data: { version: 9 } };
      },
    };
    const r = await saveDraft(dirtyState(), api);
    expect(r).toEqual({ kind: 'ok', version: 9, count: 2 });
    expect(calls).toHaveLength(1);
    expect((calls[0] as { op: string }[]).map((o) => o.op)).toEqual(['put', 'move']);
  });

  it('409: không ghi gì, tải lại và trả conflict', async () => {
    const api: SaveApi = { move: noLegacy as never, reset: noLegacy as never, load: async () => okLoad, batch: async () => ({ ok: false, status: 409, error: 'vướng' }) };
    const r = await saveDraft(dirtyState(), api);
    expect(r.kind).toBe('conflict');
  });

  it('lỗi khác (401/500) báo lỗi, không thử từng vật', async () => {
    const api: SaveApi = { move: noLegacy as never, reset: noLegacy as never, load: async () => okLoad, batch: async () => ({ ok: false, status: 401, error: 'Chưa đăng nhập' }) };
    const r = await saveDraft(dirtyState(), api);
    expect(r).toMatchObject({ kind: 'error', message: 'Chưa đăng nhập' });
  });

  it('máy chủ cũ (404): chỉ đổi vị trí vật gốc thì quay về lưu từng vật; có vật thêm thì báo lỗi', async () => {
    const moved: string[] = [];
    const old: SaveApi = {
      move: async (id) => (moved.push(id), { ok: true, data: { version: 5 } }),
      reset: noLegacy as never,
      load: async () => okLoad,
      batch: async () => ({ ok: false, status: 404, error: 'Không tìm thấy' }),
    };
    const onlyMove = run(start(), { type: 'select', id: 'a' }, { type: 'nudge', dir: 'up' });
    expect(await saveDraft(onlyMove, old)).toMatchObject({ kind: 'ok', version: 5 });
    expect(moved).toEqual(['a']);
    expect(await saveDraft(dirtyState(), old)).toMatchObject({ kind: 'error' });
  });

  it('xung đột 409 giữ vật thêm của người dùng, bỏ vật người dùng xóa', () => {
    const saved: LayoutState = { ...server, props: { p_iiii01: { kind: 'chair', x: -25, z: 8, rotation: 0 }, p_iiii02: { kind: 'plant', x: -25, z: 11, rotation: 0 } } };
    let s = run(createEditorState(env, 'it', saved), { type: 'enter' });
    s = run(s, { type: 'select', id: 'p_iiii01' }, { type: 'delete' }, { type: 'addProp', kind: 'table', id: 'p_iiii03', at: { x: -25, z: 4 } });
    const fresh: LayoutState = { ...saved, version: 8 };
    const c = editorReducer(s, { type: 'conflict', server: fresh, id: 'p_iiii01' });
    expect(Object.keys(c.draft).filter(isPropId).sort()).toEqual(['p_iiii02', 'p_iiii03']);
    expect(c.savedVersion).toBe(8);
    expect(describeChanges(c)).toEqual(['xóa Ghế', 'thêm Bàn họp nhỏ']);
  });

  it('createEditorState từ dữ liệu máy chủ dựng được vật thêm, sửa vật đã lưu vào lô put', () => {
    const saved: LayoutState = { ...server, props: { p_jjjj01: { kind: 'wall2', x: -25, z: 8, rotation: 0, door: true } } };
    let s = run(createEditorState(env, 'it', saved), { type: 'enter' }, { type: 'select', id: 'p_jjjj01' });
    expect(s.draft.p_jjjj01.door).toBe(true);
    expect(isDirty(s)).toBe(false);
    s = run(s, { type: 'toggleDoor' });
    expect(buildBatchOps(s)).toMatchObject([{ op: 'put', id: 'p_jjjj01', door: false }]);
  });
});
