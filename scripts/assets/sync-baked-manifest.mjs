#!/usr/bin/env node
/**
 * Đồng bộ manifest với các GLB tự sinh (bake-furniture.mjs, bake-clips.ts) và số đo socket nhân vật.
 *   node scripts/assets/sync-baked-manifest.mjs           # ghi public/models/manifest.json
 *   node scripts/assets/sync-baked-manifest.mjs --check   # không ghi; thoát 1 nếu manifest lệch số đo
 * Với từng asset tự sinh: tạo mục nếu chưa có, rồi đo lại hash, bytes, bounds, tam giác, tên clip từ chính file.
 * Với 3 nhân vật MPFB: ghi 7 socket (offset + rotationDeg) từ measure-sockets.mjs, calibrated = true.
 * Không đổi license của 3 GLB MPFB (verified vẫn false).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlbFacts } from './validate-manifest.mjs';
import { measureSockets } from './measure-sockets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(root, 'public', 'models');
const manifestPath = path.join(dir, 'manifest.json');
const check = process.argv.includes('--check');
const DATE = '2026-11-08';

const SELF_LICENSE = (script) => ({
  spdx: 'LicenseRef-GPB-project',
  source: `Tự sinh từ mã dự án (${script}); không dùng asset bên ngoài. Theo license của repo (chủ dự án duyệt dùng trong sản phẩm 08/11/2026).`,
  attributionRequired: false,
  originPath: script,
  checkedAt: DATE,
  verified: true,
});

const r4 = (v) => Math.round(v * 10000) / 10000 + 0;
const OPAQUE = (name) => [{ name, alphaMode: 'OPAQUE', doubleSided: false, maps: [] }];
const NOTE_VC = 'Màu theo đỉnh (COLOR_0), một vật liệu, một mesh: 1 draw call.';

/** Khai báo mục asset tự sinh. Số đo (hash, bytes, bounds, tam giác, clip) được điền từ file. */
const BAKED = [
  {
    assetId: 'furn.desk_bench', type: 'furniture', url: 'furn_desk.glb', script: 'scripts/assets/bake-furniture.mjs',
    pivot: { kind: 'base-center', offset: [0, 0, 0], note: 'Tâm đáy, mặt sàn y = 0. Kích thước khớp DeskField (src/scene/Desks.tsx).' },
    colliderProfile: { shape: 'box', size: [1.0, 0.75, 0.6], center: [0, 0.375, 0] },
    materials: OPAQUE('furn.baked'),
    sockets: [{ name: 'interact.use', node: 'interact.use', offset: [0, 0.75, 0.35], calibrated: true }],
    knownIssues: [NOTE_VC, 'Chưa nối vào cảnh: DeskField vẫn vẽ bằng InstancedBoxes (2 draw call cho mọi bàn). Thay bằng GLB riêng từng bàn sẽ tăng draw call.'],
  },
  {
    assetId: 'furn.chair_swivel', type: 'chair', url: 'furn_chair.glb', script: 'scripts/assets/bake-furniture.mjs',
    pivot: { kind: 'seat-center', offset: [0, 0, 0], note: 'Tâm chân sao trên mặt sàn; lưng ghế phía -Z.' },
    colliderProfile: { shape: 'cylinder', radius: 0.3, height: 0.94 },
    materials: OPAQUE('furn.baked'),
    sockets: [{ name: 'interact.sit', node: 'interact.sit', offset: [0, 0.48, 0], calibrated: true }],
    knownIssues: [NOTE_VC, 'Chưa nối vào cảnh (chưa có ghế riêng trong it.json để thay).'],
  },
  {
    assetId: 'acc.headphones', type: 'accessory', url: 'acc_headphones.glb', script: 'scripts/assets/bake-furniture.mjs',
    pivot: { kind: 'attach-point', offset: [0, 0, 0], note: 'Origin ở đỉnh đầu, trùng socket head.' },
    attachTo: 'head', materials: OPAQUE('acc.baked'), knownIssues: [NOTE_VC, 'Kích thước theo đầu người thật (rộng 0,23 m); chibi cần scale khi gắn. Chưa nối vào cảnh.'],
  },
  {
    assetId: 'acc.backpack', type: 'accessory', url: 'acc_backpack.glb', script: 'scripts/assets/bake-furniture.mjs',
    pivot: { kind: 'attach-point', offset: [0, 0, 0], note: 'Origin ở mặt lưng, trùng socket back.' },
    attachTo: 'back', materials: OPAQUE('acc.baked'), knownIssues: [NOTE_VC, 'Chưa nối vào cảnh.'],
  },
  {
    assetId: 'acc.mug', type: 'accessory', url: 'acc_mug.glb', script: 'scripts/assets/bake-furniture.mjs',
    pivot: { kind: 'attach-point', offset: [0, 0, 0], note: 'Origin ở đáy cốc, đặt vào socket hand_r.' },
    attachTo: 'hand_r', materials: OPAQUE('acc.baked'), knownIssues: [NOTE_VC, 'Chưa nối vào cảnh; cốc đang cầm trong cảnh là mã IK riêng (smallItem).'],
  },
];

const CLIP_LOOP = new Set(['Idle', 'Walk', 'Run', 'Airborne', 'SeatedIdle', 'Wave', 'Dance']);

function entryFromFacts(def, facts) {
  const e = {
    assetId: def.assetId, type: def.type, version: '1.0.0',
    hash: { algo: 'sha256', value: facts.sha256 }, bytes: facts.bytes, url: def.url, format: 'glb', scale: 1,
    bounds: { min: facts.boundsMin.map(r4), max: facts.boundsMax.map(r4), space: 'local', measuredBy: 'accessor POSITION min/max, đo bằng validate-manifest.mjs (sync-baked-manifest.mjs)' },
    pivot: def.pivot,
  };
  if (def.colliderProfile) e.colliderProfile = def.colliderProfile;
  e.lods = [{ level: 0, url: def.url, triangles: facts.triangles }];
  e.materials = def.materials;
  if (def.sockets) e.sockets = def.sockets;
  if (def.attachTo) e.attachTo = def.attachTo;
  e.license = SELF_LICENSE(def.script);
  e.knownIssues = def.knownIssues;
  return e;
}

function animationEntry(charAsset, facts, durations) {
  const id = charAsset.assetId.replace(/^char\./, '');
  const url = `anim_${id}.glb`;
  return {
    assetId: `anim.${id}`, type: 'animation', version: '1.0.0',
    hash: { algo: 'sha256', value: facts.sha256 }, bytes: facts.bytes, url, format: 'glb', scale: 1,
    // File không có mesh: bounds lấy theo nhân vật đích (validator bỏ so khớp hình học với file không có mesh).
    bounds: { ...charAsset.bounds, measuredBy: `bounds nhân vật ${charAsset.assetId} (file animation không có mesh)` },
    pivot: { kind: 'custom', offset: [0, 0, 0], note: 'Chỉ chứa cây xương và animation của ' + charAsset.assetId + '; không có hình học.' },
    rigProfile: charAsset.rigProfile,
    clips: facts.animations.map((name) => ({ name, durationSec: r4(durations[name]), loop: CLIP_LOOP.has(name), rootMotion: 'in-place' })),
    license: SELF_LICENSE('scripts/assets/bake-clips.ts'),
    knownIssues: [
      `Bake từ tư thế procedural (src/avatar/animation.ts) lên rest pose của ${charAsset.assetId}; quaternion theo xương cục bộ nên chỉ đúng với nhân vật này.`,
      'Track Root.position mang độ cao thân (rootY); xương Root là gốc skin nên mesh đi theo.',
      'Chưa có clip Emote (hệ emote vẫn procedural).',
    ],
  };
}

function clipDurations(file) {
  const buf = fs.readFileSync(file);
  const jl = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
  const out = {};
  for (const a of j.animations) {
    let d = 0;
    for (const c of a.channels) d = Math.max(d, j.accessors[a.samplers[c.sampler].input].max?.[0] ?? 0);
    out[a.name] = d;
  }
  return out;
}

const EXPECTED = ['Idle', 'Walk', 'Run', 'JumpStart', 'Airborne', 'Land', 'SitDown', 'SeatedIdle', 'StandUp', 'Interact', 'Stunned'];

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const before = JSON.stringify(manifest);
const chars = manifest.assets.filter((a) => a.type === 'character');
const upsert = (e) => {
  const i = manifest.assets.findIndex((a) => a.assetId === e.assetId);
  if (i >= 0) manifest.assets[i] = e;
  else manifest.assets.push(e);
};

for (const c of chars) {
  // Số đo từ chính GLB (sau rebase-pivot.mjs): hash, bytes, bounds; origin ở mặt sàn nên không có pivot.offset.
  const cf = readGlbFacts(path.join(dir, c.url));
  if (!cf) throw new Error(`Không đọc được ${c.url}`);
  c.hash = { algo: 'sha256', value: cf.sha256 };
  c.bytes = cf.bytes;
  c.bounds = { min: cf.boundsMin.map(r4), max: cf.boundsMax.map(r4), space: 'rest', measuredBy: 'accessor POSITION min/max, đo bằng validate-manifest.mjs (sync-baked-manifest.mjs) sau rebase-pivot.mjs' };
  c.pivot = { kind: 'feet-center', offset: [0, 0, 0], note: 'Origin ở mặt sàn, giữa hai bàn chân (trung bình x, z của foot_l, foot_r, ball_l, ball_r); đáy chân y = 0. Xuất bằng scripts/assets/rebase-pivot.mjs.' };
  const m = measureSockets(path.join(dir, c.url));
  const prev = new Map((c.sockets ?? []).map((s) => [s.name, s]));
  c.sockets = ['hand_l', 'hand_r', 'head', 'neck', 'back', 'foot_l', 'foot_r'].map((n) => ({
    name: n, bone: m[n].bone, offset: m[n].offset, rotationDeg: m[n].rotationDeg, calibrated: prev.get(n)?.calibrated ?? true,
  }));
  for (const s of c.sockets) s.calibrated = true;
  c.expectedClips = EXPECTED;
  c.proceduralClips = ['Emote'];
  c.knownIssues = (c.knownIssues ?? []).filter((k) => !/^Socket hand_l/.test(k) && !/^File không có animation clip/.test(k) && !/^Cả 7 socket/.test(k) && !/^GLB này không chứa animation/.test(k));
  c.knownIssues.push('Cả 7 socket (hand_l, hand_r, head, neck, back, foot_l, foot_r) đã đo từ xương/đỉnh mesh thật (scripts/assets/measure-sockets.mjs, 2026-11-07), rotationDeg đưa khung socket về trùng trục mô hình ở tư thế nghỉ (+Y lên, +Z phía trước). Chưa kiểm bằng mắt trong scene.');
  c.knownIssues.push('GLB này không chứa animation; clip thật nằm ở tệp anim_<id>.glb cùng rig (asset anim.*).');
}
for (const d of BAKED) {
  const facts = readGlbFacts(path.join(dir, d.url));
  if (!facts) throw new Error(`Không đọc được ${d.url}`);
  upsert(entryFromFacts(d, facts));
}
for (const c of chars) {
  const url = `anim_${c.assetId.replace(/^char\./, '')}.glb`;
  const file = path.join(dir, url);
  const facts = readGlbFacts(file);
  if (!facts) throw new Error(`Không đọc được ${url}`);
  upsert(animationEntry(c, facts, clipDurations(file)));
}
manifest.generatedAt = DATE;

const out = JSON.stringify(manifest, null, 2) + '\n';
if (check) {
  const same = fs.readFileSync(manifestPath, 'utf8') === out;
  console.log(same ? 'manifest khớp số đo' : 'manifest LỆCH số đo: chạy sync-baked-manifest.mjs');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(manifestPath, out);
console.log(`ghi ${path.relative(root, manifestPath)}: ${manifest.assets.length} asset (trước: ${JSON.parse(before).assets.length})`);
