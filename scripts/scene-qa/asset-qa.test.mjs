// node --test scripts/scene-qa/asset-qa.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGlb, inspectGlb, checkFacts, checkDir } from './asset-qa.mjs';
import { buildHtml, esc } from './report.mjs';
import { censusSource } from '../perf/static-census.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pad4 = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
function makeGlb(json, bin = Buffer.alloc(0)) {
  const j = pad4(Buffer.from(JSON.stringify(json)), 0x20);
  const b = pad4(bin, 0);
  const total = 12 + 8 + j.length + (b.length ? 8 + b.length : 0);
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8);
  const ch = (len, type) => { const x = Buffer.alloc(8); x.writeUInt32LE(len, 0); x.writeUInt32LE(type, 4); return x; };
  return Buffer.concat([h, ch(j.length, 0x4e4f534a), j, ...(b.length ? [ch(b.length, 0x004e4942), b] : [])]);
}
const tri = (extra = {}) => ({
  asset: { version: '2.0' },
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  accessors: [{ count: 4, min: [-1, 0, -1], max: [1, 1.8, 1] }, { count: 6 }],
  ...extra,
});

test('parseGlb từ chối dữ liệu sai', () => {
  assert.throws(() => parseGlb(Buffer.from('xxxxxxxxxxxxxxxxxxxxxxxx')), /GLB/);
  const g = makeGlb(tri()); g.writeUInt32LE(g.length + 4, 8);
  assert.throws(() => parseGlb(g), /độ dài/);
});

test('inspectGlb đếm tam giác, bounds, vật liệu', () => {
  const f = inspectGlb(makeGlb(tri({ materials: [{ name: 'a', alphaMode: 'MASK', alphaCutoff: 0.4 }, { name: 'b' }] })));
  assert.equal(f.triangles, 2);
  assert.deepEqual(f.size, [2, 1.8, 2]);
  assert.equal(f.materials[1].alphaMode, 'OPAQUE');
});

test('checkFacts: BLEND ngoài kính là error, MASK thiếu cutoff là warning', () => {
  const f = inspectGlb(makeGlb(tri({ skins: [{ joints: [0] }], nodes: [{ name: 'Root' }], materials: [{ name: 'skin', alphaMode: 'BLEND' }, { name: 'eyebrow', alphaMode: 'MASK' }, { name: 'glass_win', alphaMode: 'BLEND' }] })));
  const r = checkFacts(f);
  assert.ok(r.some((i) => i.rule === 'AST-040' && i.severity === 'error'));
  assert.ok(r.some((i) => i.rule === 'AST-041'));
  assert.ok(r.some((i) => i.rule === 'AST-042'));
});

test('checkFacts: thiếu xương so với rigProfile', () => {
  const f = inspectGlb(makeGlb(tri({ skins: [{ joints: [0] }], nodes: [{ name: 'Root' }] })));
  assert.ok(checkFacts(f, { rigBones: ['Root', 'head'] }).some((i) => i.rule === 'AST-021'));
  assert.ok(!checkFacts(f, { rigBones: ['Root'] }).some((i) => i.rule === 'AST-021'));
});

test('checkDir: file hỏng báo AST-000, file không có trong manifest báo AST-060', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  fs.writeFileSync(path.join(d, 'bad.glb'), 'nope');
  fs.writeFileSync(path.join(d, 'ok.glb'), makeGlb(tri({ skins: [{ joints: [0] }], nodes: [{ name: 'Root' }] })));
  const r = checkDir(d);
  assert.ok(r.find((x) => x.file === 'bad.glb').issues.some((i) => i.rule === 'AST-000'));
  assert.ok(r.find((x) => x.file === 'ok.glb').issues.some((i) => i.rule === 'AST-060'));
  fs.rmSync(d, { recursive: true });
});

test('buildHtml tự chứa và thoát HTML', () => {
  const html = buildHtml({
    scene: { summary: { objects: 1, solidObjects: 1, scope: 's', count: { error: 0, warning: 1, info: 0 } }, issues: [{ severity: 'warning', ruleId: 'R', objectId: '<x>', message: 'm', suggestedFix: 'f' }] },
    manifest: { errors: [], warnings: [] }, assets: [], perf: { note: 'n', perFile: [], zoneObjects: 0, avatars: [] }, generatedAt: 'now',
  });
  assert.ok(html.includes('&lt;x&gt;') && !html.includes('<x>'));
  assert.ok(!/<script|src=|href=/.test(html));
  assert.equal(esc('a&"'), 'a&amp;&quot;');
});

test('censusSource đếm thẻ mesh và instanced', () => {
  const c = censusSource('<mesh a/>\n{xs.map((x)=>(\n<mesh/>\n))}\n<InstancedBoxes items={i}/>');
  assert.equal(c.mesh, 2); assert.equal(c.instanced, 1); assert.ok(c.loopSites >= 1); // xấp xỉ: cửa sổ 12 dòng
});
