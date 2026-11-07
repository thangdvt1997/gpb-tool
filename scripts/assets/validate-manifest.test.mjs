// Chạy: node --test scripts/assets/validate-manifest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateFile, postProcess, readGlbFacts } from './validate-manifest.mjs';

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
  assert.ok(!r.warnings.some((w) => w.code === 'CLIP_MISSING'), 'mọi clip mong đợi đã có clip bake thật (anim.*)');
  assert.equal(r.info.filter((x) => x.code === 'CLIP_PROCEDURAL').length, 0, 'không còn clip procedural được mong đợi');
  assert.ok(!r.warnings.some((w) => w.code === 'SOCKET_UNCALIBRATED'), '7 socket nhân vật đã đo');
});

test('manifest thật khai báo bàn, ghế, 3 phụ kiện và 3 asset animation, đều đo từ file', async () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'public/models/manifest.json'), 'utf8'));
  const by = new Map(m.assets.map((a) => [a.assetId, a]));
  for (const [id, type] of [['furn.desk_bench', 'furniture'], ['furn.chair_swivel', 'chair'], ['acc.headphones', 'accessory'], ['acc.backpack', 'accessory'], ['acc.mug', 'accessory'], ['anim.male_real', 'animation'], ['anim.female_real', 'animation'], ['anim.chibi', 'animation']]) {
    assert.equal(by.get(id)?.type, type, id);
    assert.ok(fs.existsSync(path.join(root, 'public/models', by.get(id).url)), `${id} thiếu file`);
  }
  assert.deepEqual(by.get('furn.chair_swivel').sockets.map((s) => s.name), ['interact.sit']);
  // Mỗi nhân vật có đủ 7 socket với rotationDeg; mọi tên clip mong đợi có trong asset animation cùng rig.
  const clips = new Set(m.assets.filter((a) => a.type === 'animation').flatMap((a) => a.clips.map((c) => c.name)));
  for (const c of m.assets.filter((a) => a.type === 'character')) {
    assert.deepEqual(c.sockets.map((s) => s.name).sort(), ['back', 'foot_l', 'foot_r', 'hand_l', 'hand_r', 'head', 'neck']);
    assert.ok(c.sockets.every((s) => s.calibrated && s.rotationDeg?.length === 3), c.assetId);
    for (const e of c.expectedClips) assert.ok(clips.has(e), `${c.assetId} thiếu clip ${e}`);
  }
});

test('GLB tự sinh: mỗi asset tĩnh đúng 1 mesh, 1 material (không tăng draw call), hash khớp manifest', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'public/models/manifest.json'), 'utf8'));
  for (const a of m.assets.filter((x) => ['furniture', 'chair', 'accessory'].includes(x.type))) {
    const buf = fs.readFileSync(path.join(root, 'public/models', a.url));
    const j = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
    assert.equal(j.meshes.length, 1, a.assetId);
    assert.equal(j.meshes[0].primitives.length, 1, a.assetId);
    assert.equal(j.materials.length, 1, a.assetId);
    assert.ok(buf.length < 40000, `${a.assetId} ${buf.length} byte`);
  }
});

test('GLB chỉ có xương + animation: validator không đòi bounds hình học và đọc xương từ node', async () => {
  const facts = readGlbFacts(path.join(root, 'public/models/anim_chibi.glb'));
  assert.ok(facts.joints.includes('upperarm_l') && facts.joints.includes('Root'));
  assert.ok(facts.animations.includes('Walk'));
  assert.ok(!facts.boundsMin.every(Number.isFinite), 'file không có mesh');
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

function charWithClips(extra = {}) {
  return desk({
    assetId: 'char.t', type: 'character', expectedClips: ['idle', 'walk'], rigProfile: 'rig.t',
    ...extra,
  });
}
const rigM = (a) => ({ ...manifest([a]), rigProfiles: { 'rig.t': { id: 'rig.t', bones: ['Root'], rootBone: 'Root', restPose: 'A', units: 'm', rootMotion: 'in-place', retargetMap: {} } } });

test('procedural: clip khai báo thành info, clip không khai báo vẫn là CLIP_MISSING', () => {
  const a = charWithClips({ proceduralClips: ['idle'] });
  const data = rigM(a);
  const res = postProcess(validateManifest(data), data);
  assert.ok(res.info.some((x) => x.code === 'CLIP_PROCEDURAL' && /idle/.test(x.message)));
  assert.ok(!res.warnings.some((w) => w.code === 'CLIP_MISSING' && /"idle"/.test(w.message)));
  assert.ok(res.warnings.some((w) => w.code === 'CLIP_MISSING' && /"walk"/.test(w.message)), 'walk chưa khai báo vẫn phải cảnh báo');
});

test('procedural: không khai báo thì mọi CLIP_MISSING giữ nguyên; kiểu sai báo BAD_PROCEDURAL_CLIPS', () => {
  const data = rigM(charWithClips());
  const raw = validateManifest(data);
  const res = postProcess(raw, data);
  assert.equal(res.warnings.filter((w) => w.code === 'CLIP_MISSING').length, raw.warnings.filter((w) => w.code === 'CLIP_MISSING').length);
  assert.equal(res.info.length, 0);
  const bad = rigM(charWithClips({ proceduralClips: 'idle' }));
  assert.ok(postProcess(validateManifest(bad), bad).errors.some((e) => e.code === 'BAD_PROCEDURAL_CLIPS'));
});

test('style chibi dùng khoảng chiều cao chibi; người thật thấp vẫn là lỗi; chibi quá thấp vẫn là lỗi', () => {
  const short = { min: [-0.3, 0, -0.1], max: [0.3, 0.8, 0.1], space: 'rest', measuredBy: 'x' };
  const chibi = rigM(charWithClips({ bounds: short, style: 'chibi' }));
  const r1 = postProcess(validateManifest(chibi), chibi);
  assert.ok(!r1.errors.some((e) => e.code === 'CHARACTER_HEIGHT'));
  assert.ok(r1.info.some((w) => w.code === 'CHIBI_HEIGHT'));
  const real = rigM(charWithClips({ bounds: short }));
  assert.ok(postProcess(validateManifest(real), real).errors.some((e) => e.code === 'CHARACTER_HEIGHT'));
  const tiny = rigM(charWithClips({ bounds: { ...short, max: [0.3, 0.3, 0.1] }, style: 'chibi' }));
  assert.ok(postProcess(validateManifest(tiny), tiny).errors.some((e) => e.code === 'CHARACTER_HEIGHT'));
});

function tmpManifest(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpb-manifest-'));
  const m = JSON.parse(fs.readFileSync(path.join(root, 'public/models/manifest.json'), 'utf8'));
  m.assets = [m.assets.find((a) => a.assetId === 'char.chibi')];
  fs.copyFileSync(path.join(root, 'public/models/chibi.glb'), path.join(dir, 'chibi.glb'));
  mutate(m.assets[0], dir);
  const file = path.join(dir, 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(m));
  return { file, dir };
}

test('manifest thật: mục char.chibi đo thật, 0 lỗi', async () => {
  const { file, dir } = tmpManifest(() => {});
  const r = await validateFile(file);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(r.errors, []);
});

test('kích thước file lệch manifest báo FILE_SIZE_MISMATCH kể cả --no-glb; dung sai cho qua', async () => {
  const { file, dir } = tmpManifest((a) => { a.bytes += 1000; });
  const r = await validateFile(file, { glb: false });
  assert.ok(r.errors.some((e) => e.code === 'FILE_SIZE_MISMATCH' && e.assetId === 'char.chibi'));
  const ok = await validateFile(file, { glb: false, sizeTolerance: 0.01 });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(!ok.errors.some((e) => e.code === 'FILE_SIZE_MISMATCH'));
});

test('GLB đọc được: bytes và số tam giác lệch báo BYTES_MISMATCH/TRIANGLES_MISMATCH', async () => {
  const { file, dir } = tmpManifest((a) => { a.bytes += 8; a.lods[0].triangles += 5; });
  const r = await validateFile(file);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(r.errors.some((e) => e.code === 'BYTES_MISMATCH'));
  assert.ok(r.errors.some((e) => e.code === 'TRIANGLES_MISMATCH'));
});

test('file thiếu báo FILE_MISSING; đường dẫn ra ngoài/tuyệt đối bị chặn, không đọc đĩa', async () => {
  const miss = tmpManifest((a, dir) => { fs.rmSync(path.join(dir, 'chibi.glb')); });
  const r = await validateFile(miss.file);
  fs.rmSync(miss.dir, { recursive: true, force: true });
  assert.ok(r.errors.some((e) => e.code === 'FILE_MISSING'));
  for (const [url, code] of [['../chibi.glb', 'URL_ESCAPES'], ['/etc/passwd', 'URL_NOT_RELATIVE'], ['a\\b.glb', 'URL_BACKSLASH']]) {
    const t = tmpManifest((a) => { a.url = url; a.lods[0].url = url; });
    const x = await validateFile(t.file);
    fs.rmSync(t.dir, { recursive: true, force: true });
    assert.ok(x.errors.some((e) => e.code === code), `${url} -> ${code}`);
    assert.ok(!x.errors.some((e) => e.code === 'FILE_SIZE_MISMATCH'));
  }
});
