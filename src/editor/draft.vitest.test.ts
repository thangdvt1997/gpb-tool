import { describe, expect, it } from 'vitest';
import { createLayoutDraftSection } from '../backup/sections';
import { createRegistry } from '../backup/registry';
import { createBackupRing, createMemoryStorage } from '../backup/ring';
import { createBackupService } from '../backup/service';
import { applyDraft, createEditorState, editorReducer, type EditorAction, type EditorEnv, type EditorState } from './core';
import {
  clearStoredDraft, createDraftBackupAdapter, draftFromState, DRAFT_FORMAT, DRAFT_KEY, DRAFT_SCHEMA_VERSION,
  loadStoredDraft, migrateStored, parseStored, saveStoredDraft, type DraftStorage,
} from './draftStore';
import type { LayoutState } from '../layout/types';

const sz = { w: 1, h: 1, d: 1, centerY: 0.5 };
const env: EditorEnv = { sizes: { a: sz, b: sz }, fixed: [], keepOut: [] };
const server: LayoutState = { items: {}, defaults: { a: { x: -25, z: 0, rotation: 0 }, b: { x: -25, z: 5, rotation: 0 } }, version: 3 };

function mem(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}
const run = (s: EditorState, ...as: EditorAction[]) => as.reduce(editorReducer, s);
const editing = () => run(createEditorState(env, 'it', server), { type: 'enter' }, { type: 'select', id: 'a' });

describe('bản nháp bố cục: lưu, khôi phục, xóa', () => {
  it('không có thay đổi thì không có nháp', () => {
    expect(draftFromState(editing())).toBeNull();
  });
  it('lưu rồi đọc lại đúng nháp', () => {
    const st = mem();
    const s = run(editing(), { type: 'moveTo', x: -20, z: 3 });
    const d = draftFromState(s)!;
    expect(d.items.a).toMatchObject({ x: -20, z: 3 });
    expect(saveStoredDraft(d, 3, st, 1000)).toBe(true);
    const back = loadStoredDraft(st)!;
    expect(back.draft).toEqual(d);
    expect(back.baseVersion).toBe(3);
    expect(back.schemaVersion).toBe(DRAFT_SCHEMA_VERSION);
  });
  it('khôi phục áp nháp lên bản đã lưu và vào chế độ biên tập', () => {
    const s0 = run(editing(), { type: 'moveTo', x: -20, z: 3 });
    const d = draftFromState(s0)!;
    const fresh = createEditorState(env, 'it', server);
    const ap = applyDraft(fresh, d as never)!;
    expect(ap.applied).toBe(1);
    const s1 = editorReducer(fresh, { type: 'restoreDraft', env: ap.env, draft: ap.draft, message: 'ok' });
    expect(s1.active).toBe(true);
    expect(s1.draft.a).toMatchObject({ x: -20, z: 3 });
    expect(s1.saved.a).toMatchObject({ x: -25, z: 0 });
  });
  it('vật thêm và vật xóa nằm trong nháp và khôi phục được', () => {
    const s = run(editing(), { type: 'addProp', kind: 'table', id: 'p_abcd1', at: { x: -20, z: 3 } });
    const d = draftFromState(s)!;
    expect(d.props).toEqual({ p_abcd1: 'table' });
    const ap = applyDraft(createEditorState(env, 'it', server), d as never)!;
    expect(ap.draft.p_abcd1).toBeDefined();
    expect(ap.env.props?.p_abcd1).toBe('table');
  });
  it('vật không còn tồn tại bị bỏ; không còn gì thì null', () => {
    const fresh = createEditorState(env, 'it', server);
    expect(applyDraft(fresh, { items: { zzz: { x: 0, z: 0, rotation: 0 } } })).toBeNull();
    const ap = applyDraft(fresh, { items: { zzz: { x: 0, z: 0, rotation: 0 }, a: { x: -20, z: 3, rotation: 0 } } })!;
    expect(ap.skipped).toBe(1);
  });
  it('nháp trùng bản đã lưu thì không còn gì để khôi phục', () => {
    expect(applyDraft(createEditorState(env, 'it', server), { items: { a: { x: -25, z: 0, rotation: 0 } } })).toBeNull();
  });
  it('xóa nháp', () => {
    const st = mem();
    saveStoredDraft({ items: { a: { x: 1, z: 1, rotation: 0 } } }, 1, st);
    clearStoredDraft(st);
    expect(loadStoredDraft(st)).toBeNull();
  });
  it('bộ nhớ ném lỗi (đầy) thì trả false, không ném', () => {
    const st: DraftStorage = { getItem: () => null, removeItem: () => undefined, setItem: () => { throw new DOMException('q', 'QuotaExceededError'); } };
    expect(saveStoredDraft({ items: { a: { x: 1, z: 1, rotation: 0 } } }, 1, st)).toBe(false);
  });
});

describe('bản nháp bố cục: migrate và dữ liệu hỏng', () => {
  it('v1 (chỉ items) được nâng lên v2', () => {
    const v1 = { format: DRAFT_FORMAT, schemaVersion: 1, savedAt: 5, draft: { items: { a: { x: 1, z: 2, rotation: 90 } } } };
    const m = migrateStored(v1)!;
    expect(m.schemaVersion).toBe(2);
    expect(m.baseVersion).toBeNull();
    expect(m.draft.items.a).toEqual({ x: 1, z: 2, rotation: 90 });
  });
  it('phiên bản mới hơn, sai format, JSON hỏng, __proto__ đều bị từ chối', () => {
    expect(migrateStored({ format: DRAFT_FORMAT, schemaVersion: 99, draft: { items: {} } })).toBeNull();
    expect(migrateStored({ format: 'x', schemaVersion: 2, draft: { items: { a: { x: 1, z: 1, rotation: 0 } } } })).toBeNull();
    expect(parseStored('{oops')).toBeNull();
    expect(parseStored('{"format":"gpb-layout-draft","schemaVersion":2,"draft":{"items":{"__proto__":{"x":1}}}}')).toBeNull();
    expect(parseStored(null)).toBeNull();
  });
  it('dữ liệu hỏng trong kho bị xóa để không hỏi lại', () => {
    const st = mem();
    st.setItem(DRAFT_KEY, '{oops');
    expect(loadStoredDraft(st)).toBeNull();
    expect(st.map.has(DRAFT_KEY)).toBe(false);
  });
});

describe('bản nháp bố cục trong gói sao lưu', () => {
  function svc(st: DraftStorage) {
    const registry = createRegistry([createLayoutDraftSection(createDraftBackupAdapter(st))]);
    return createBackupService({ registry, ring: createBackupRing({ storage: createMemoryStorage(), max: 3 }) });
  }
  const draft = { items: { a: { x: -20, z: 3, rotation: 90 as const }, p_abcd1: { x: -18, z: 2, rotation: 0 as const, door: true } }, props: { p_abcd1: 'wall2' }, removed: ['p_gone1'] };

  it('vòng xuất JSON -> nhập giữ nguyên bản nháp', async () => {
    const a = mem();
    saveStoredDraft(draft, 3, a);
    const out = await svc(a).exportBundle();
    expect(out.ok && out.bundle.sections.layoutdraft).toEqual(draft);
    const b = mem();
    const s2 = svc(b);
    const p = await s2.parse((out as { text: string }).text);
    if (!p.ok) throw new Error(p.error);
    const prev = await s2.preview(p.parsed, 'replace');
    expect(prev.some((i) => i.id === 'layoutdraft')).toBe(true);
    const r = await s2.apply(p.parsed, { mode: 'replace' });
    expect(r.ok).toBe(true);
    expect(loadStoredDraft(b)!.draft).toEqual(draft);
  });
  it('vòng xuất ZIP -> nhập giữ nguyên bản nháp', async () => {
    const a = mem();
    saveStoredDraft(draft, 3, a);
    const z = await svc(a).exportZip();
    if (!z.ok) throw new Error(z.error);
    const b = mem();
    const s2 = svc(b);
    const p = await s2.parseZip(z.bytes);
    if (!p.ok) throw new Error(p.error);
    expect((await s2.apply(p.parsed, { mode: 'replace' })).ok).toBe(true);
    expect(loadStoredDraft(b)!.draft).toEqual(draft);
  });
  it('nhập dữ liệu nháp hỏng bị từ chối, kho không đổi', async () => {
    const b = mem();
    const s2 = svc(b);
    for (const bad of [{ items: 5 }, { nope: 1 }, { items: Object.fromEntries(Array.from({ length: 401 }, (_, i) => [`k${i}`, { x: 0, z: 0, rotation: 0 }])) }]) {
      const p = await s2.parse(JSON.stringify({ layoutdraft: bad }));
      if (p.ok) expect(p.parsed.sections.length).toBe(0);
      else expect(p.error).toBeTruthy();
    }
    const proto = await s2.parse('{"layoutdraft":{"items":{"__proto__":{"x":1}}}}');
    expect(proto.ok).toBe(false);
    expect(b.map.size).toBe(0);
  });
  it('vật sai tọa độ/góc xoay bị bỏ kèm cảnh báo', async () => {
    const s2 = svc(mem());
    const p = await s2.parse(JSON.stringify({ layoutdraft: { items: { a: { x: 1, z: 1, rotation: 45 }, b: { x: 2, z: 2, rotation: 0 } } } }));
    if (!p.ok) throw new Error(p.error);
    expect(p.parsed.sections[0].warnings.length).toBe(1);
  });
});
