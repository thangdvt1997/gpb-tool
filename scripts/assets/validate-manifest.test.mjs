// Chạy: node --test scripts/assets/validate-manifest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateFile } from './validate-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { validateManifest } = await import(pathToFileURL(path.join(root, 'src/assets/validate.ts')).href);
const { migrateManifest } = await import(pathToFileURL(path.join(root, 'src/assets/migrate.ts')).href);

const HASH = 'a'.repeat(64);
const license = { spdx: 'CC0-1.0', source: 'test', attributionRequired: false, checkedAt: '2026-11-06', verified: true };

function desk(overrides = {}) {
  return {
    assetId: 'furn.desk_test',
    type: 'furniture',
    version: '1.0.0',
    hash: { algo: 'sha256', value: HASH },
    bytes: 100,
    url: 'desk.glb',
    format: 'glb',
    scale: 1,
    bounds: { min: [-0.6, 0, -0.35], max: [0.6, 0.75, 0.35], space: 'local', measuredBy: 'fixture' },
    pivot: { kind: 'base-center', offset: [0, 0, 0] },
    colliderProfile: { shape: 'box', size: [1.2, 0.75, 0.7], center: [0, 0.375, 0] },
    lods: [{ level: 0, url: 'desk.glb', triangles: 100 }],
    materials: [{ name: 'wood', alphaMode: 'OPAQUE', doubleSided: false, maps: ['baseColor'] }],
    license,
    ...overrides,
  };
}

function manifest(assets) {
  return { schemaVersion: 1, units: 'm', upAxis: 'Y', forward: '+Z', rigProfiles: {}, assets };
}

const codes = (r) => r.errors.map((e) => e.code);

test('manifest mẫu hợp lệ không có lỗi', () => {
  const r = validateManifest(manifest([desk()]));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('ID trùng báo DUP_ASSET_ID kèm assetId', () => {
  const r = validateManifest(manifest([desk(), desk()]));
  const e = r.errors.find((x) => x.code === 'DUP_ASSET_ID');
  assert.ok(e);
  assert.equal(e.assetId, 'furn.desk_test');
  assert.ok(e.fix.length > 0);
});

test('NaN và Infinity báo NON_FINITE', () => {
  const r = validateManifest(manifest([desk({ scale: NaN, bounds: { min: [0, Infinity, 0], max: [1, 1, 1], space: 'local', measuredBy: 'x' } })]));
  const nf = r.errors.filter((x) => x.code === 'NON_FINITE');
  assert.ok(nf.some((x) => x.path.endsWith('scale')));
  assert.ok(nf.some((x) => x.path.includes('bounds.min[1]')));
});

test('null trong vector (NaN đã qua JSON.stringify) báo NON_FINITE', () => {
  const json = JSON.parse(JSON.stringify(manifest([desk({ pivot: { kind: 'base-center', offset: [0, NaN, 0] } })])));
  const r = validateManifest(json);
  assert.ok(r.errors.some((x) => x.code === 'NON_FINITE' && x.path.includes('pivot.offset[1]')));
});

test('đường dẫn thiếu báo FILE_MISSING; URL tuyệt đối/".." bị chặn', () => {
  const r = validateManifest(manifest([desk()]), { fileExists: () => false });
  assert.ok(r.errors.some((x) => x.code === 'FILE_MISSING' && x.assetId === 'furn.desk_test'));
  const r2 = validateManifest(manifest([desk({ assetId: 'furn.a', url: '/models/a.glb' }), desk({ assetId: 'furn.b', url: '../a.glb' })]));
  assert.ok(codes(r2).includes('URL_NOT_RELATIVE'));
  assert.ok(codes(r2).includes('URL_ESCAPES'));
});

test('transform bất thường: scale 0, bounds kiểu cm, lơ lửng', () => {
  const r = validateManifest(manifest([
    desk({ assetId: 'furn.a', scale: 0 }),
    desk({ assetId: 'furn.b', bounds: { min: [-60, 0, -35], max: [60, 75, 35], space: 'local', measuredBy: 'x' } }),
    desk({ assetId: 'furn.c', bounds: { min: [-0.6, 0.2, -0.35], max: [0.6, 0.95, 0.35], space: 'local', measuredBy: 'x' } }),
  ]));
  assert.ok(codes(r).includes('BAD_SCALE'));
  assert.ok(codes(r).includes('BOUNDS_ABNORMAL'));
  assert.ok(codes(r).includes('NOT_ON_GROUND'));
});

test('ghế thiếu interact.sit, cửa thiếu trục bản lề', () => {
  const r = validateManifest(manifest([
    desk({ assetId: 'chair.mesh', type: 'chair', pivot: { kind: 'seat-center', offset: [0, 0, 0] } }),
    desk({ assetId: 'door.a', type: 'door', pivot: { kind: 'hinge', offset: [0, 0, 0] }, sockets: [{ name: 'interact.handle', offset: [0.8, 1, 0], calibrated: true }] }),
  ]));
  assert.ok(r.errors.some((x) => x.code === 'SOCKET_MISSING' && x.assetId === 'chair.mesh'));
  assert.ok(r.errors.some((x) => x.code === 'PIVOT_AXIS' && x.assetId === 'door.a'));
});

test('đồ tĩnh không bị bắt có rig; phụ kiện gắn socket không tồn tại bị báo', () => {
  const r = validateManifest(manifest([
    desk(),
    { ...desk({ assetId: 'acc.badge', type: 'accessory', pivot: { kind: 'attach-point', offset: [0, 0, 0] }, attachTo: 'chest_badge' }) },
  ]));
  assert.ok(!r.errors.some((x) => x.assetId === 'furn.desk_test' && /rig/i.test(x.code)));
  assert.ok(r.errors.some((x) => x.code === 'ATTACH_SOCKET_MISSING' && x.assetId === 'acc.badge'));
});

test('validator không sửa dữ liệu đầu vào', () => {
  const input = manifest([desk({ scale: -1 }), desk()]);
  const before = JSON.stringify(input);
  validateManifest(input);
  assert.equal(JSON.stringify(input), before);
});

test('manifest thật public/models/manifest.json: 0 lỗi (đối chiếu hash, bounds, xương, morph với GLB)', async () => {
  const r = await validateFile(path.join(root, 'public/models/manifest.json'));
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.code === 'CLIP_MISSING'));
});

test('manifest thật sửa hash sai thì báo HASH_MISMATCH', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpb-manifest-'));
  const m = JSON.parse(fs.readFileSync(path.join(root, 'public/models/manifest.json'), 'utf8'));
  m.assets = [m.assets[0]];
  m.assets[0].hash.value = HASH;
  fs.copyFileSync(path.join(root, 'public/models/male_real.glb'), path.join(dir, 'male_real.glb'));
  const file = path.join(dir, 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(m));
  const r = await validateFile(file);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(r.errors.some((x) => x.code === 'HASH_MISMATCH' && x.assetId === 'char.male_real'));
  assert.equal(r.errors.length, 1);
});

test('migrate: mục cũ dạng SOURCE.json không bị bịa số đo, validator báo thiếu', () => {
  const rep = migrateManifest([{ id: 'furn.old_desk', type: 'furniture', file: 'old.glb', license: 'CC0', checked_at: '2026-11-06', sha256: HASH }]);
  assert.equal(rep.manifest.schemaVersion, 1);
  assert.equal(rep.manifest.assets[0].url, 'old.glb');
  assert.equal(rep.manifest.assets[0].license.spdx, 'CC0-1.0');
  assert.equal(rep.manifest.assets[0].bounds, undefined);
  assert.ok(rep.missing.some((s) => s.includes('bounds')));
  const r = validateManifest(rep.manifest);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((x) => x.assetId === 'furn.old_desk' && x.path.endsWith('bounds')));
});
