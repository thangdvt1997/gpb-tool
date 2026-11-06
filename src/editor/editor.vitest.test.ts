import { describe, expect, it } from 'vitest';
import {
  actionForKey, canEditLayout, createEditorState, diffPoses, editorReducer, HISTORY_LIMIT, isDirty, validatePose,
  type EditorAction, type EditorEnv, type EditorState,
} from './core';
import { gridSegments, MAX_GRID_SEGMENTS } from './gridLines';
import { saveDraft, type SaveApi } from './save';
import type { LayoutState } from '../layout/types';

const sz = { w: 1, h: 1, d: 1, centerY: 0.5 };
const env: EditorEnv = {
  sizes: { a: sz, b: sz },
  fixed: [{ minX: -23, maxX: -22, minZ: -1, maxZ: 1 }],
  keepOut: [],
};
const server: LayoutState = {
  items: {},
  defaults: { a: { x: -25, z: 0, rotation: 0 }, b: { x: -25, z: 5, rotation: 0 } },
  version: 3,
};

function run(s: EditorState, ...as: EditorAction[]): EditorState {
  return as.reduce(editorReducer, s);
}
function started(role: 'it' | 'employee' = 'it'): EditorState {
  return run(createEditorState(env, role, server), { type: 'enter' }, { type: 'select', id: 'a' });
}

describe('quyền', () => {
  it('chỉ it/admin sửa được', () => {
    expect(canEditLayout('it')).toBe(true);
    expect(canEditLayout('admin')).toBe(true);
    expect(canEditLayout('employee')).toBe(false);
    expect(canEditLayout('moderator')).toBe(false);
    expect(canEditLayout(null)).toBe(false);
  });
  it('người khác không vào được chế độ sửa', () => {
    const s = run(createEditorState(env, 'employee', server), { type: 'enter' });
    expect(s.active).toBe(false);
    expect(s.message).toMatch(/IT/);
  });
});

describe('di chuyển và kiểm tra', () => {
  it('nudge theo lưới', () => {
    const s = run(started(), { type: 'nudge', dir: 'down' });
    expect(s.draft.a).toEqual({ x: -25, z: 0.5, rotation: 0 });
    expect(isDirty(s)).toBe(true);
  });
  it('tắt snap thì nhích đúng bước', () => {
    const s = run(started(), { type: 'toggleSnap' }, { type: 'setGrid', step: 0.2 }, { type: 'nudge', dir: 'down' });
    expect(s.draft.a.z).toBe(0.2);
  });
  it('bước lưới không hợp lệ bị từ chối, giá trị lẻ làm tròn 0,1', () => {
    expect(run(started(), { type: 'setGrid', step: 0 }).gridStep).toBe(0.5);
    expect(run(started(), { type: 'setGrid', step: 0.26 }).gridStep).toBe(0.3);
  });
  it('moveTo bắt lưới', () => {
    expect(run(started(), { type: 'moveTo', x: -24.8, z: 2.8 }).draft.a).toMatchObject({ x: -25, z: 3 });
  });
  it('chặn ra ngoài chữ L', () => {
    const s = run(started(), { type: 'moveTo', x: -9, z: -10 });
    expect(s.draft.a.x).toBe(-25);
    expect(s.message).toMatch(/chữ L/);
    expect(s.past).toHaveLength(0);
  });
  it('chặn va vật cố định và vật khác', () => {
    expect(validatePose(env, {}, 'a', { x: -22.5, z: 0, rotation: 0 }).valid).toBe(false);
    const s = run(started(), { type: 'moveTo', x: -25, z: 5 });
    expect(s.draft.a.z).toBe(0);
  });
  it('xoay đổi footprint khi kiểm tra', () => {
    const wide: EditorEnv = { ...env, sizes: { a: { ...sz, w: 4, d: 1 } } };
    // Xoay 90 độ làm bề rộng thành 4 theo z: chạm vật cố định ở z -1..1 từ x -23.
    expect(validatePose(wide, {}, 'a', { x: -20.4, z: 0, rotation: 0 }).valid).toBe(false);
    expect(validatePose(wide, {}, 'a', { x: -20.4, z: 0, rotation: 90 }).valid).toBe(true);
  });
  it('rotate vòng 4 lần về 0', () => {
    const s = run(started(), { type: 'rotate' }, { type: 'rotate' }, { type: 'rotate' }, { type: 'rotate' });
    expect(s.draft.a.rotation).toBe(0);
    expect(s.past).toHaveLength(4);
  });
  it('chưa chọn vật thì không làm gì', () => {
    const s = run(run(createEditorState(env, 'it', server), { type: 'enter' }), { type: 'rotate' });
    expect(s.past).toHaveLength(0);
  });
});

describe('lịch sử', () => {
  it('undo/redo', () => {
    let s = run(started(), { type: 'nudge', dir: 'down' }, { type: 'nudge', dir: 'down' });
    s = run(s, { type: 'undo' });
    expect(s.draft.a.z).toBe(0.5);
    s = run(s, { type: 'redo' });
    expect(s.draft.a.z).toBe(1);
  });
  it('thao tác mới xoá làm lại', () => {
    const s = run(started(), { type: 'nudge', dir: 'down' }, { type: 'undo' }, { type: 'nudge', dir: 'up' });
    expect(s.future).toHaveLength(0);
  });
  it('giới hạn độ dài', () => {
    let s = started();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) s = run(s, { type: 'rotate' });
    expect(s.past).toHaveLength(HISTORY_LIMIT);
  });
  it('kéo liên tục là một bước', () => {
    let s = run(started(), { type: 'dragStart' });
    for (let i = 1; i <= 30; i++) s = run(s, { type: 'dragMove', x: -25, z: i * 0.1 });
    expect(s.past).toHaveLength(0);
    s = run(s, { type: 'dragEnd' });
    expect(s.past).toHaveLength(1);
    expect(s.draft.a.z).toBe(3); // bắt lưới 0,5, vị trí cuối z = 3
  });
  it('thả ở chỗ không hợp lệ thì về chỗ cũ, không thêm bước', () => {
    let s = run(started(), { type: 'dragStart' }, { type: 'dragMove', x: -25, z: 5 });
    expect(s.preview?.valid).toBe(false);
    s = run(s, { type: 'dragEnd' });
    expect(s.draft.a.z).toBe(0);
    expect(s.past).toHaveLength(0);
  });
  it('undo một lần hoàn lại cả lần kéo', () => {
    const s = run(started(), { type: 'dragStart' }, { type: 'dragMove', x: -25, z: 2 }, { type: 'dragEnd' }, { type: 'undo' });
    expect(s.draft.a.z).toBe(0);
  });
});

describe('đặt lại, diff, hủy', () => {
  it('resetItem và resetAll', () => {
    let s = run(started(), { type: 'nudge', dir: 'down' }, { type: 'select', id: 'b' }, { type: 'rotate' });
    expect(diffPoses(s.saved, s.draft, s.defaults).map((d) => d.id)).toEqual(['a', 'b']);
    s = run(s, { type: 'resetItem' });
    expect(diffPoses(s.saved, s.draft).map((d) => d.id)).toEqual(['a']);
    s = run(s, { type: 'resetAll' });
    expect(isDirty(s)).toBe(false);
    expect(run(s, { type: 'undo' }).draft.b.rotation).toBe(0);
  });
  it('diff đánh dấu toDefault', () => {
    const saved = { a: { x: 1, z: 1, rotation: 0 as const } };
    const d = diffPoses(saved, { a: { x: -25, z: 0, rotation: 0 } }, server.defaults);
    expect(d[0].toDefault).toBe(true);
  });
  it('hủy bỏ nháp', () => {
    const s = run(started(), { type: 'nudge', dir: 'down' }, { type: 'exit' });
    expect(s.active).toBe(false);
    expect(s.draft).toEqual(s.saved);
  });
});

describe('lưu', () => {
  const ok = async () => ({ ok: true as const, data: { version: 9 } });
  const conflict = async () => ({ ok: false as const, status: 409, error: 'vướng' });
  const mk = (over: Partial<SaveApi>): SaveApi => ({ move: ok, reset: ok, load: async () => ({ ok: true, data: server }), ...over });

  it('lưu thành công và saveDone', async () => {
    const s = run(started(), { type: 'nudge', dir: 'down' });
    const r = await saveDraft(s, mk({}));
    expect(r).toEqual({ kind: 'ok', version: 9, count: 1 });
    const d = run(s, { type: 'saveDone', version: 9 });
    expect(isDirty(d)).toBe(false);
    expect(d.past).toHaveLength(0);
  });
  it('không đổi gì thì nothing', async () => {
    expect((await saveDraft(started(), mk({}))).kind).toBe('nothing');
  });
  it('vật về mặc định dùng reset', async () => {
    const moved: LayoutState = { ...server, items: { a: { x: -20, z: 0, rotation: 0, movedBy: 'x' } } };
    const s = run(run(createEditorState(env, 'it', moved), { type: 'enter' }), { type: 'resetAll' });
    const calls: string[] = [];
    await saveDraft(s, mk({ reset: async (id) => (calls.push(id), { ok: true, data: { version: 4 } }) }));
    expect(calls).toEqual(['a']);
  });
  it('409 giả được thử lại sau khi vật khác ghi', async () => {
    const s = run(started(), { type: 'nudge', dir: 'down' }, { type: 'select', id: 'b' }, { type: 'nudge', dir: 'down' });
    const seen: string[] = [];
    const r = await saveDraft(s, mk({ move: async (id) => (seen.push(id), seen.filter((x) => x === 'a').length === 1 && id === 'a' ? await conflict() : await ok()) }));
    expect(r.kind).toBe('ok');
    expect(seen).toEqual(['a', 'b', 'a']);
  });
  it('409 kéo dài: tải lại, giữ nháp, báo', async () => {
    const s = run(started(), { type: 'nudge', dir: 'down' });
    const fresh: LayoutState = { ...server, version: 8, items: { b: { x: -25, z: 6, rotation: 0, movedBy: 'y' } } };
    const r = await saveDraft(s, mk({ move: conflict, load: async () => ({ ok: true, data: fresh }) }));
    expect(r.kind).toBe('conflict');
    if (r.kind !== 'conflict' || !r.server) throw new Error('thiếu server');
    const c = run(s, { type: 'conflict', server: r.server, id: r.id });
    expect(c.savedVersion).toBe(8);
    expect(c.draft.b.z).toBe(6); // vật chưa sửa lấy theo máy chủ
    expect(c.draft.a.z).toBe(0.5); // vật đã sửa giữ nháp
    expect(c.message).toMatch(/Xung đột/);
    expect(c.saving).toBe(false);
  });
  it('lỗi khác 409 dừng ngay', async () => {
    const s = run(started(), { type: 'nudge', dir: 'down' });
    const r = await saveDraft(s, mk({ move: async () => ({ ok: false, status: 429, error: 'nhanh' }) }));
    expect(r).toMatchObject({ kind: 'error', message: 'nhanh' });
  });
  it('đang lưu thì khoá thao tác', () => {
    const s = run(started(), { type: 'nudge', dir: 'down' }, { type: 'saveStart' });
    expect(run(s, { type: 'nudge', dir: 'down' }).draft.a.z).toBe(0.5);
  });
});

describe('phím tắt và lưới', () => {
  it('ánh xạ phím', () => {
    expect(actionForKey({ key: 'z', ctrlKey: true })).toEqual({ type: 'undo' });
    expect(actionForKey({ key: 'Z', ctrlKey: true, shiftKey: true })).toEqual({ type: 'redo' });
    expect(actionForKey({ key: 'y', ctrlKey: true })).toEqual({ type: 'redo' });
    expect(actionForKey({ key: 'r' })).toEqual({ type: 'rotate' });
    expect(actionForKey({ key: 'Delete' })).toEqual({ type: 'resetItem' });
    expect(actionForKey({ key: 'ArrowLeft', shiftKey: true })).toEqual({ type: 'nudge', dir: 'left', steps: 5 });
    expect(actionForKey({ key: 'q' })).toBeNull();
  });
  it('gridSegments nằm trong L và có chặn số đoạn', () => {
    const g = gridSegments(1);
    expect(g.length).toBeGreaterThan(0);
    expect(g.length % 4).toBe(0);
    expect(gridSegments(0).length).toBe(0);
    expect(gridSegments(0.001).length).toBe(0);
    expect(g.length / 4).toBeLessThanOrEqual(MAX_GRID_SEGMENTS);
  });
  it('sync bị bỏ qua khi đang biên tập', () => {
    const s = started();
    expect(run(s, { type: 'sync', server: { ...server, version: 99 } }).savedVersion).toBe(3);
    const idle = createEditorState(env, 'it', server);
    expect(run(idle, { type: 'sync', server: { ...server, version: 99 } }).savedVersion).toBe(99);
  });
});
