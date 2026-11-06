import { describe, expect, it } from 'vitest';
import { makeDefaultLook } from '../fashion/defaults';
import { defaultSettings, type Settings } from '../settings/schema';
import { EXPORT_FORMAT, SNAPSHOT_FORMAT } from '../persist/core';
import { buildBundle, computeChecksum } from './bundle';
import { deepMerge, diffValues } from './diff';
import { applyImport, parseBundleText, previewImport } from './importer';
import { bundleV0ToV1, detectBundleVersion, migrateBundle, migrateSectionData } from './migrate';
import { createRegistry } from './registry';
import { createBackupRing, createMemoryStorage } from './ring';
import { redactSensitive, safeParse, sha256Hex, sha256Pure, stableStringify } from './safeJson';
import { createLayoutDraftSection, createLookSection, createPersistSection, createSettingsSection, lookV0ToV1, settingsV1ToV2, type LayoutDraft } from './sections';
import { createBackupService } from './service';
import type { BackupSection } from './types';

/** Dựng môi trường giả: look, settings, persist, layout nháp đều là biến trong bộ nhớ. */
function env(opts: { failPersistWrite?: boolean } = {}) {
  const state = {
    look: makeDefaultLook(),
    settings: defaultSettings() as Settings,
    persist: null as string | null,
    layout: null as LayoutDraft | null,
    writes: [] as string[],
  };
  const registry = createRegistry([
    createLookSection({ getLook: () => state.look, applyLook: (l) => { state.writes.push('look'); state.look = l; } }),
    createSettingsSection({ getSettings: () => state.settings, setSettings: (s) => { state.writes.push('settings'); state.settings = s; } }),
    createPersistSection({
      exportText: async () => state.persist,
      importText: async (t) => {
        if (opts.failPersistWrite) throw new Error('hết dung lượng');
        state.writes.push('persist');
        state.persist = t;
      },
    }),
    createLayoutDraftSection({ read: () => state.layout, write: (d) => { state.writes.push('layoutdraft'); state.layout = d; }, clear: () => { state.layout = null; } }),
  ]);
  const ring = createBackupRing({ storage: createMemoryStorage(), max: 3 });
  const service = createBackupService({ registry, ring });
  return { state, registry, ring, service };
}

const snap = (rev = 1) => ({
  format: EXPORT_FORMAT,
  snapshot: { format: SNAPSHOT_FORMAT, schemaVersion: 1, revision: rev, savedAt: rev, writerId: 'tab-x', layout: { overrides: {} } },
  assets: [],
});

describe('safeJson', () => {
  it('chặn __proto__, constructor, prototype ở mọi cấp', () => {
    expect(safeParse('{"a":{"__proto__":{"x":1}}}').ok).toBe(false);
    expect(safeParse('{"a":[{"constructor":1}]}').ok).toBe(false);
    expect(safeParse('{"prototype":1}').ok).toBe(false);
    expect(safeParse('{"a":1}').ok).toBe(true);
  });
  it('từ chối quá lớn, quá sâu, không phải JSON, rỗng', () => {
    expect(safeParse('{"a":"' + 'x'.repeat(200) + '"}', 100).ok).toBe(false);
    expect(safeParse('['.repeat(100) + ']'.repeat(100)).ok).toBe(false);
    expect(safeParse('{oops').ok).toBe(false);
    expect(safeParse('  ').ok).toBe(false);
  });
  it('sha256 thuần khớp crypto.subtle và vector chuẩn', async () => {
    expect(sha256Pure(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const s = 'xin chào ' + 'é'.repeat(100);
    expect(await sha256Hex(s)).toBe(sha256Pure(new TextEncoder().encode(s)));
  });
  it('stableStringify không phụ thuộc thứ tự khóa', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  });
  it('redact loại khóa token/email và giá trị dạng email, không sửa đầu vào', () => {
    const input = { name: 'A', authToken: 't', profile: { Email: 'a@b.com', note: 'liên hệ x@y.vn', ok: 1 }, list: ['u@v.com', 'keep'] };
    const r = redactSensitive(input);
    expect(r.value).toEqual({ name: 'A', profile: { note: undefined, ok: 1 }, list: ['keep'] });
    expect(r.removed.sort()).toEqual(['authToken', 'list[0]', 'profile.Email', 'profile.note'].sort());
    expect(input.authToken).toBe('t');
  });
});

describe('diff', () => {
  it('liệt kê added/removed/changed và bỏ đường dẫn volatile', () => {
    const d = diffValues({ a: 1, b: { c: 2 }, t: 1 }, { a: 2, b: { c: 2, e: 3 }, t: 9 }, { ignore: ['t'] });
    expect(d.entries.map((e) => `${e.kind}:${e.path}`).sort()).toEqual(['added:b.e', 'changed:a']);
  });
  it('deepMerge không nhiễm prototype', () => {
    const evil = JSON.parse('{"__proto__":{"polluted":1},"x":1}');
    const out = deepMerge({ y: 2 }, evil) as Record<string, unknown>;
    expect(out.x).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(false);
  });
});

describe('migrate từng bước', () => {
  it('bundle v0 -> v1 bọc header + sections + sectionVersions', () => {
    const out = bundleV0ToV1({ app: 'x', createdAt: '2020-01-01T00:00:00.000Z', look: { a: 1 }, settings: { volume: 0.5 } }) as {
      header: { schemaVersion: number; sectionVersions: Record<string, number>; createdAt: string };
      sections: Record<string, unknown>;
    };
    expect(out.header.schemaVersion).toBe(1);
    expect(out.header.sectionVersions).toEqual({ look: 0, settings: 1 });
    expect(out.header.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(Object.keys(out.sections)).toEqual(['look', 'settings']);
  });
  it('migrateBundle giữ bản gốc, ghi lại các bước', () => {
    const raw = { look: { a: 1 } };
    const frozen = JSON.stringify(raw);
    const r = migrateBundle(raw);
    expect(r.ok && r.steps).toEqual([0]);
    expect(JSON.stringify(raw)).toBe(frozen);
  });
  it('từ chối gói tương lai, lạ, rỗng', () => {
    const fut = detectBundleVersion({ header: { app: 'gpb-office', format: 'gpb-backup', schemaVersion: 99 }, sections: {} });
    expect(fut.ok === false && fut.code).toBe('too_new');
    expect(detectBundleVersion({ header: { app: 'gpb-office', format: 'khac', schemaVersion: 1 } }).ok).toBe(false);
    expect(detectBundleVersion({ header: { app: 'khac', format: 'gpb-backup', schemaVersion: 1 } }).ok).toBe(false);
    expect(detectBundleVersion({}).ok).toBe(false);
    expect(detectBundleVersion([]).ok).toBe(false);
  });
  it('look v0 (Appearance cũ) -> v1 (CharacterLook)', () => {
    const l = lookV0ToV1({ outfit: 'tee', skin: '#e0b090', hair: '#222222' }) as { version?: number };
    // Nếu không nhận ra là Appearance cũ thì trả nguyên; nếu nhận ra phải có version look.
    expect(l).toBeTruthy();
    const cur = makeDefaultLook();
    expect(lookV0ToV1(cur)).toEqual(cur);
  });
  it('settings v1 -> v2 kẹp giá trị và thêm trường thiếu', () => {
    const s = settingsV1ToV2({ volume: 99, mouse: { sensitivity: -5 } }) as Settings;
    expect(s.version).toBe(2);
    expect(s.volume).toBeLessThanOrEqual(1);
    expect(s.touch).toBeDefined();
  });
  it('migrateSectionData: thiếu bước và version tương lai bị từ chối', () => {
    const sec: BackupSection = { id: 'zz', label: 'ZZ', version: 3, migrations: { 0: (d) => ({ ...(d as object), s0: 1 }), 2: (d) => ({ ...(d as object), s2: 1 }) }, validate: (d) => ({ ok: true, data: d, warnings: [] }), read: () => null, write: () => {} };
    expect(migrateSectionData(sec, {}, 0).ok).toBe(false); // thiếu 1->2
    const ok = migrateSectionData(sec, {}, 2);
    expect(ok.ok && ok.data).toEqual({ s2: 1 });
    expect(migrateSectionData(sec, {}, 4).ok).toBe(false);
  });
});

describe('registry', () => {
  it('từ chối id sai, trùng, bước migrate ngoài khoảng', () => {
    const base = { label: 'x', version: 1, migrations: {}, validate: (d: unknown) => ({ ok: true as const, data: d, warnings: [] }), read: () => null, write: () => {} };
    const r = createRegistry();
    expect(() => r.register({ ...base, id: 'Bad Id' })).toThrow();
    r.register({ ...base, id: 'tattoo' });
    expect(() => r.register({ ...base, id: 'tattoo' })).toThrow();
    expect(() => r.register({ ...base, id: 'other', migrations: { 5: (d) => d } })).toThrow();
  });
});

describe('xuất gói', () => {
  it('có header, manifest phiên bản, checksum khớp; bỏ phần chưa có dữ liệu', async () => {
    const { registry } = env();
    const r = await buildBundle(registry, { now: new Date('2026-01-02T03:04:05Z') });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bundle.header).toMatchObject({ app: 'gpb-office', format: 'gpb-backup', schemaVersion: 1, createdAt: '2026-01-02T03:04:05.000Z' });
    expect(Object.keys(r.bundle.sections).sort()).toEqual(['look', 'settings']);
    expect(r.skipped.map((s) => s.id).sort()).toEqual(['layoutdraft', 'persist']);
    expect(r.bundle.header.checksum).toBe(await computeChecksum(r.bundle.sections));
    expect(r.bundle.header.sectionVersions.settings).toBe(2);
  });
  it('loại token/email khỏi phần mở rộng trước khi xuất', async () => {
    const registry = createRegistry([
      { id: 'profile', label: 'Hồ sơ', version: 1, migrations: {}, validate: (d) => ({ ok: true, data: d, warnings: [] }), read: () => ({ nick: 'a', accessToken: 'zzz', contact: { email: 'a@b.co' } }), write: () => {} },
    ]);
    const r = await buildBundle(registry);
    expect(r.ok && r.text).toBeTruthy();
    if (!r.ok) return;
    expect(r.text).not.toMatch(/zzz|a@b\.co/);
    expect(r.removed).toEqual(expect.arrayContaining(['profile.accessToken', 'profile.contact.email']));
  });
});

describe('nhập gói', () => {
  it('vòng xuất -> nhập khôi phục đúng dữ liệu', async () => {
    const a = env();
    a.state.settings = { ...a.state.settings, volume: 0.25 };
    a.state.layout = { items: { desk1: { x: 1, z: 2, rotation: 90 } } };
    const out = await a.service.exportBundle();
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const b = env();
    const p = await b.service.parse(out.text);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const r = await b.service.apply(p.parsed, { mode: 'replace' });
    expect(r.ok).toBe(true);
    expect(b.state.settings.volume).toBe(0.25);
    expect(b.state.layout).toEqual({ items: { desk1: { x: 1, z: 2, rotation: 90 } } });
  });
  it('checksum sai bị từ chối; sửa tay thì lộ', async () => {
    const e = env();
    const out = await e.service.exportBundle();
    if (!out.ok) throw new Error('x');
    const obj = JSON.parse(out.text);
    obj.sections.settings.volume = 0.123;
    const tampered = JSON.stringify(obj);
    const r = await e.service.parse(tampered);
    expect(r.ok === false && r.error).toMatch(/Checksum/);
  });
  it('gói quá lớn, __proto__, tương lai đều bị từ chối trước khi ghi', async () => {
    const e = env();
    expect((await parseBundleText('x'.repeat(50), e.registry, { maxBytes: 10 })).ok).toBe(false);
    expect((await e.service.parse('{"header":{"app":"gpb-office","format":"gpb-backup","schemaVersion":1},"sections":{"__proto__":{}}}')).ok).toBe(false);
    const fut = await e.service.parse('{"header":{"app":"gpb-office","format":"gpb-backup","schemaVersion":7},"sections":{"look":{}}}');
    expect(fut.ok === false && fut.error).toMatch(/mới hơn/);
    expect(e.state.writes).toEqual([]);
  });
  it('gói v0 cũ được nâng cấp; phần không hỗ trợ và sai schema bị loại riêng', async () => {
    const e = env();
    const v0 = JSON.stringify({ app: 'x', settings: { volume: 0.4 }, layoutdraft: { items: { d: { x: 0, z: 0, rotation: 45 } } }, mystery: { a: 1 }, persist: { format: 'sai' } });
    const r = await e.service.parse(v0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parsed.bundleFromVersion).toBe(0);
    expect(r.parsed.checksum).toBe('missing');
    expect(r.parsed.sections.map((s) => s.id).sort()).toEqual(['layoutdraft', 'settings']);
    expect(r.parsed.sections.find((s) => s.id === 'layoutdraft')?.warnings.length).toBe(1);
    expect(r.parsed.rejected.map((x) => x.id).sort()).toEqual(['mystery', 'persist']);
  });
  it('xem trước không ghi gì và báo khác biệt theo chế độ', async () => {
    const e = env();
    e.state.layout = { items: { a: { x: 1, z: 1, rotation: 0 } } };
    const incoming = { items: { b: { x: 2, z: 2, rotation: 90 } } };
    const p = await e.service.parse(JSON.stringify({ layoutdraft: incoming }));
    if (!p.ok) throw new Error('x');
    const merge = await previewImport(p.parsed, e.registry, 'merge');
    const replace = await previewImport(p.parsed, e.registry, 'replace');
    expect(merge[0].changes.map((c) => `${c.kind}:${c.path}`)).toEqual(['added:items.b']);
    expect(replace[0].changes.map((c) => `${c.kind}:${c.path}`).sort()).toEqual(['added:items.b', 'removed:items.a']);
    expect(e.state.writes).toEqual([]);
  });
  it('gộp giữ vật cũ; thay thế bỏ vật cũ', async () => {
    const make = async (mode: 'merge' | 'replace') => {
      const e = env();
      e.state.layout = { items: { a: { x: 1, z: 1, rotation: 0 } } };
      const p = await e.service.parse(JSON.stringify({ layoutdraft: { items: { b: { x: 2, z: 2, rotation: 90 } } } }));
      if (!p.ok) throw new Error('x');
      await e.service.apply(p.parsed, { mode });
      return Object.keys(e.state.layout!.items).sort();
    };
    expect(await make('merge')).toEqual(['a', 'b']);
    expect(await make('replace')).toEqual(['b']);
  });
  it('chỉ ghi phần được chọn', async () => {
    const e = env();
    const out = await e.service.exportBundle();
    if (!out.ok) throw new Error('x');
    const p = await e.service.parse(out.text);
    if (!p.ok) throw new Error('x');
    e.state.writes.length = 0;
    const r = await e.service.apply(p.parsed, { mode: 'replace', selected: ['settings'] });
    expect(r.ok && r.applied).toEqual(['settings']);
    expect(e.state.writes).toEqual(['settings']);
    expect((await e.service.apply(p.parsed, { mode: 'replace', selected: [] })).ok).toBe(false);
  });
  it('tự sao lưu trước khi ghi đè', async () => {
    const e = env();
    e.state.settings = { ...e.state.settings, volume: 0.1 };
    const p = await e.service.parse(JSON.stringify({ settings: { volume: 0.9 } }));
    if (!p.ok) throw new Error('x');
    const r = await e.service.apply(p.parsed, { mode: 'replace' });
    expect(r.ok && r.backupId).toBeTruthy();
    const list = e.ring.list();
    expect(list).toHaveLength(1);
    expect(list[0].reason).toBe('pre-import');
    expect(e.ring.get(list[0].id)).toContain('0.1');
  });
  it('lỗi giữa chừng: rollback phần đã ghi, báo rõ', async () => {
    const e = env({ failPersistWrite: true });
    e.state.persist = JSON.stringify(snap(1));
    e.state.settings = { ...e.state.settings, volume: 0.1 };
    e.state.layout = null;
    const text = JSON.stringify({ settings: { volume: 0.9 }, persist: snap(2), layoutdraft: { items: { a: { x: 0, z: 0, rotation: 0 } } } });
    const p = await e.service.parse(text);
    if (!p.ok) throw new Error('x');
    // Thứ tự ghi theo thứ tự trong gói: settings, persist (lỗi).
    const before = JSON.stringify(e.state.settings);
    const r = await e.service.apply(p.parsed, { mode: 'replace' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/Ghi/);
    expect(JSON.stringify(e.state.settings)).toBe(before);
    expect(r.rolledBack).toEqual(expect.arrayContaining(['settings']));
    expect(e.state.layout).toBeNull();
    expect(JSON.parse(e.state.persist!).snapshot.revision).toBe(1);
  });
  it('rollback dùng clear() khi trước đó chưa có dữ liệu', async () => {
    const e = env({ failPersistWrite: true });
    const p = await e.service.parse(JSON.stringify({ layoutdraft: { items: { a: { x: 0, z: 0, rotation: 0 } } }, persist: snap(2) }));
    if (!p.ok) throw new Error('x');
    const r = await e.service.apply(p.parsed, { mode: 'replace' });
    expect(r.ok).toBe(false);
    expect(e.state.layout).toBeNull();
  });
  it('không sao lưu được thì không ghi (hết dung lượng)', async () => {
    const e = env();
    const tiny = createBackupRing({ storage: createMemoryStorage(10), max: 3 });
    const service = createBackupService({ registry: e.registry, ring: tiny });
    const p = await service.parse(JSON.stringify({ settings: { volume: 0.9 } }));
    if (!p.ok) throw new Error('x');
    const r = await service.apply(p.parsed, { mode: 'replace' });
    expect(r.ok).toBe(false);
    expect(e.state.writes).toEqual([]);
  });
  it('phần mở rộng (xăm) đăng ký được và đi qua cả chuỗi xuất/nhập/migrate', async () => {
    let tattoo: unknown = { v: 'old', list: ['a'] };
    const ext: BackupSection = {
      id: 'tattoos', label: 'Xăm', version: 2,
      migrations: { 1: (d) => ({ list: (d as { list: string[] }).list }) },
      validate: (d) => (typeof d === 'object' && d && Array.isArray((d as { list?: unknown }).list) ? { ok: true, data: d, warnings: [] } : { ok: false, error: 'list?' }),
      read: () => tattoo, write: (d) => { tattoo = d; },
    };
    const e = env();
    e.registry.register(ext);
    const v1 = JSON.stringify({ header: { app: 'gpb-office', format: 'gpb-backup', schemaVersion: 1, createdAt: 'x', sectionVersions: { tattoos: 1 } }, sections: { tattoos: { v: 'old', list: ['z'] } } });
    const p = await e.service.parse(v1);
    if (!p.ok) throw new Error('x');
    expect(p.parsed.sections[0].data).toEqual({ list: ['z'] });
    await e.service.apply(p.parsed, { mode: 'replace' });
    expect(tattoo).toEqual({ list: ['z'] });
  });
});

describe('vòng sao lưu cục bộ', () => {
  it('giữ N bản gần nhất, mới nhất trước, có nhãn thời gian', () => {
    const ring = createBackupRing({ storage: createMemoryStorage(), max: 3 });
    for (let i = 0; i < 5; i++) ring.add(`data${i}`, { now: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) });
    const l = ring.list();
    expect(l).toHaveLength(3);
    expect(l.map((m) => ring.get(m.id))).toEqual(['data4', 'data3', 'data2']);
    expect(l[0].label).toBe('2026-01-01T00:00:04.000Z');
  });
  it('xóa bản; hết dung lượng thì bỏ bản cũ nhất; một bản quá lớn thì lỗi', () => {
    const ring = createBackupRing({ storage: createMemoryStorage(900), max: 5 });
    const a = ring.add('a'.repeat(100));
    ring.add('b'.repeat(100));
    expect(ring.remove(a.ok ? a.meta.id : '')).toBe(true);
    expect(ring.list()).toHaveLength(1);
    const r = ring.add('c'.repeat(400));
    expect(r.ok).toBe(true);
    expect(ring.add('d'.repeat(5000)).ok).toBe(false);
  });
  it('chỉ mục hỏng hoặc id lạ không làm sập', () => {
    const st = createMemoryStorage();
    st.setItem('gpb.backup.v1.index', '[{"id":"../x","createdAt":1},5,null]');
    const ring = createBackupRing({ storage: st });
    expect(ring.list()).toEqual([]);
    expect(ring.get('../x')).toBeNull();
    st.setItem('gpb.backup.v1.index', '{hỏng');
    expect(ring.list()).toEqual([]);
  });
  it('khôi phục: tạo bản pre-restore rồi đưa dữ liệu về như cũ', async () => {
    const e = env();
    e.state.settings = { ...e.state.settings, volume: 0.3 };
    const b = await e.service.backupNow('mốc');
    if (!b.ok) throw new Error('x');
    e.state.settings = { ...e.state.settings, volume: 0.9 };
    const r = await e.service.restore(b.meta.id);
    expect(r.ok).toBe(true);
    expect(e.state.settings.volume).toBe(0.3);
    expect(e.ring.list().some((m) => m.reason === 'pre-restore')).toBe(true);
    // Quay lại bản mới bằng chính bản pre-restore.
    const pre = e.ring.list().find((m) => m.reason === 'pre-restore')!;
    await e.service.restore(pre.id);
    expect(e.state.settings.volume).toBe(0.9);
    expect((await e.service.restore('bkhongco')).ok).toBe(false);
  });
});
