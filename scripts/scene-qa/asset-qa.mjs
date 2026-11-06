#!/usr/bin/env node
// Kiểm tra asset GLB thật (Task 21). Chỉ đọc, parser JSON chunk tự viết, không phụ thuộc gói ngoài.
// Dùng: node scripts/scene-qa/asset-qa.mjs [--dir public/models] [--json]
// Quy tắc theo docs/design/ASSET_STANDARD.md mục 6 (alphaMode) và mục 7 (budget, chỉ nhân vật có số đo thật).
// Mã thoát: 0 = không có error; 1 = có error; 2 = lỗi chạy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

// Ngưỡng. Ngưỡng nhân vật lấy từ số đo thật (27 120 tam giác, 5.3-5.9 MB) cộng dư; các loại khác chưa có số đo nên không chặn.
export const LIMITS = { charTriangles: 40000, charBytes: 8 * 1024 * 1024, maxTexture: 4096, maxHeightM: 2.6, minHeightM: 1.0 };
const THIN = /(eyebrow|eyelash|lash|hair|mesh|net|leaf|plant)/i;
const GLASS = /(glass|kinh|window)/i;

/** Đọc GLB. Ném lỗi nếu sai định dạng. Trả về { json, bin, bytes }. */
export function parseGlb(buf) {
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) throw new Error('không phải GLB (sai magic)');
  if (buf.readUInt32LE(4) !== 2) throw new Error('chỉ hỗ trợ glTF 2.0');
  if (buf.readUInt32LE(8) !== buf.length) throw new Error(`độ dài header ${buf.readUInt32LE(8)} khác kích thước file ${buf.length}`);
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942 && !bin) bin = data;
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new Error('thiếu chunk JSON');
  return { json, bin, bytes: buf.length };
}

function imageSize(j, bin, im) {
  if (im.bufferView == null || !bin) return null;
  const bv = j.bufferViews?.[im.bufferView];
  if (!bv) return null;
  const o = bv.byteOffset ?? 0;
  const d = bin.subarray(o, o + Math.min(bv.byteLength, 32));
  if (d.length >= 24 && d.readUInt32BE(0) === 0x89504e47) return [d.readUInt32BE(16), d.readUInt32BE(20)];
  return null; // JPEG/khác: không đo
}

/** Thống kê một GLB: tam giác, bounds, vật liệu, xương, morph, texture. */
export function inspectGlb(buf) {
  const { json: j, bin, bytes } = parseGlb(buf);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0, primitives = 0, vertices = 0;
  const morph = new Set();
  let morphPrims = 0;
  for (const m of j.meshes ?? []) {
    for (const n of m.extras?.targetNames ?? []) morph.add(n);
    for (const pr of m.primitives ?? []) {
      primitives++;
      const pos = j.accessors?.[pr.attributes?.POSITION];
      if (!pos) continue;
      vertices += pos.count;
      if (pos.min && pos.max) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos.min[k]); max[k] = Math.max(max[k], pos.max[k]); }
      const mode = pr.mode ?? 4;
      const count = pr.indices != null ? j.accessors[pr.indices].count : pos.count;
      if (mode === 4) triangles += Math.floor(count / 3); else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2);
      if (pr.targets?.length) { morphPrims++; for (const n of m.extras?.targetNames ?? []) morph.add(n); }
    }
  }
  const skin = j.skins?.[0];
  const joints = (skin?.joints ?? []).map((i) => j.nodes[i]?.name ?? `#${i}`);
  return {
    bytes, triangles, vertices, primitives, drawCallsLowerBound: primitives,
    boundsMin: min, boundsMax: max, size: max.map((v, k) => v - min[k]),
    skins: j.skins?.length ?? 0, joints,
    morphTargets: [...morph], morphPrimitives: morphPrims,
    animations: (j.animations ?? []).map((a) => a.name ?? ''),
    materials: (j.materials ?? []).map((m) => ({ name: m.name ?? '', alphaMode: m.alphaMode ?? 'OPAQUE', alphaCutoff: m.alphaCutoff, doubleSided: m.doubleSided === true, blendApproved: m.extras?.blendApproved === true })),
    textures: (j.images ?? []).map((im, i) => ({ index: i, name: im.name ?? '', mime: im.mimeType ?? '?', size: imageSize(j, bin, im) })),
    extensionsUsed: j.extensionsUsed ?? [],
  };
}

/** Áp quy tắc lên kết quả inspect. facts: dữ liệu manifest tương ứng (tùy chọn). Trả về mảng {severity, rule, message}. */
export function checkFacts(f, { type = 'character', manifestAsset = null, rigBones = null } = {}) {
  const out = [];
  const add = (severity, rule, message) => out.push({ severity, rule, message });
  if (!f.triangles) add('error', 'AST-001', 'Không có tam giác nào.');
  if (!f.boundsMin.every(Number.isFinite)) add('error', 'AST-002', 'Không đọc được bounds (accessor POSITION thiếu min/max).');
  const h = f.size[1];
  if (type === 'character' && Number.isFinite(h) && (h < LIMITS.minHeightM || h > LIMITS.maxHeightM)) add('warning', 'AST-003', `Chiều cao ${h.toFixed(2)} m ngoài khoảng ${LIMITS.minHeightM}-${LIMITS.maxHeightM} m.`);
  if (type === 'character') {
    if (f.triangles > LIMITS.charTriangles) add('warning', 'AST-010', `${f.triangles} tam giác vượt ngưỡng tham khảo ${LIMITS.charTriangles}.`);
    if (f.bytes > LIMITS.charBytes) add('warning', 'AST-011', `${(f.bytes / 1048576).toFixed(1)} MB vượt ngưỡng tham khảo ${LIMITS.charBytes / 1048576} MB.`);
    if (!f.skins) add('error', 'AST-020', 'Nhân vật không có skin.');
    if (!f.morphTargets.length && !f.morphPrimitives) add('warning', 'AST-030', 'Không có morph target.');
  }
  if (rigBones && f.joints.length) {
    const miss = rigBones.filter((b) => !f.joints.includes(b));
    const extra = f.joints.filter((b) => !rigBones.includes(b));
    if (miss.length) add('error', 'AST-021', `Thiếu ${miss.length} xương so với rigProfile: ${miss.slice(0, 6).join(', ')}.`);
    if (extra.length) add('warning', 'AST-022', `Thừa ${extra.length} xương ngoài rigProfile: ${extra.slice(0, 6).join(', ')}.`);
  }
  if (manifestAsset?.morphCapabilities?.targets) {
    const have = new Set(f.morphTargets);
    const miss = manifestAsset.morphCapabilities.targets.filter((t) => !have.has(t));
    if (miss.length) add('warning', 'AST-031', `Manifest khai ${miss.length} morph không có trong GLB (extras.targetNames): ${miss.slice(0, 5).join(', ')}.`);
  }
  if (manifestAsset?.lods?.[0]?.triangles != null && manifestAsset.lods[0].triangles !== f.triangles) add('warning', 'AST-012', `Manifest ghi ${manifestAsset.lods[0].triangles} tam giác, đo được ${f.triangles}.`);
  for (const m of f.materials) {
    const nm = m.name;
    if (m.alphaMode === 'BLEND') {
      if (!GLASS.test(nm)) add('error', 'AST-040', `Vật liệu "${nm}": alphaMode BLEND chỉ dành cho kính (ASSET_STANDARD mục 6). Nếu runtime ép lại (Player.tsx) thì file vẫn lệch chuẩn.`);
      else if (!m.blendApproved) add('error', 'AST-041', `Vật liệu kính "${nm}": thiếu blendApproved: true.`);
    } else if (m.alphaMode === 'MASK') {
      if (m.alphaCutoff == null) add('warning', 'AST-042', `Vật liệu "${nm}": MASK nhưng không ghi alphaCutoff (mặc định 0.5).`);
      if (!THIN.test(nm)) add('info', 'AST-043', `Vật liệu "${nm}": MASK trên vật liệu không phải lông mày/mi/tóc/lưới.`);
    }
    if (m.doubleSided && !THIN.test(nm)) add('warning', 'AST-044', `Vật liệu "${nm}": doubleSided chỉ nên bật cho mặt mỏng.`);
  }
  for (const t of f.textures) {
    if (!t.size) add('info', 'AST-050', `Texture #${t.index} (${t.mime}): không đo được kích thước.`);
    else {
      if (Math.max(...t.size) > LIMITS.maxTexture) add('warning', 'AST-051', `Texture #${t.index} ${t.size.join('x')} vượt ${LIMITS.maxTexture}.`);
      if (!t.size.every((v) => v > 0 && (v & (v - 1)) === 0)) add('info', 'AST-052', `Texture #${t.index} ${t.size.join('x')} không phải lũy thừa của 2.`);
    }
  }
  return out;
}

export function checkDir(dir) {
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
  const files = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.glb')).sort();
  const res = [];
  for (const n of files) {
    const rec = { file: n, facts: null, issues: [], inManifest: false };
    try {
      rec.facts = inspectGlb(fs.readFileSync(path.join(dir, n)));
      const ma = manifest?.assets?.find((a) => a.url === n) ?? null;
      rec.inManifest = !!ma;
      rec.assetId = ma?.assetId;
      const rig = ma?.rigProfile ? manifest.rigProfiles?.[ma.rigProfile]?.bones : null;
      rec.issues = checkFacts(rec.facts, { type: ma?.type ?? 'character', manifestAsset: ma, rigBones: rig });
      if (!ma) rec.issues.push({ severity: 'warning', rule: 'AST-060', message: 'File GLB không có trong manifest.json.' });
      if (ma && ma.bytes !== rec.facts.bytes) rec.issues.push({ severity: 'error', rule: 'AST-061', message: `Manifest ghi ${ma.bytes} byte, file thật ${rec.facts.bytes}.` });
    } catch (e) {
      rec.issues.push({ severity: 'error', rule: 'AST-000', message: `Không đọc được GLB: ${e.message}` });
    }
    res.push(rec);
  }
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const di = a.indexOf('--dir');
  const dir = path.resolve(di >= 0 ? a[di + 1] : path.join(repoRoot, 'public/models'));
  if (!fs.existsSync(dir)) { console.error('LOI CHAY: không có thư mục ' + dir); process.exit(2); }
  const res = checkDir(dir);
  if (a.includes('--json')) console.log(JSON.stringify(res, null, 2));
  else for (const r of res) {
    const f = r.facts;
    console.log(`${r.file}${f ? `: ${f.triangles} tam giác, ${(f.bytes / 1048576).toFixed(2)} MB, cao ${f.size[1].toFixed(2)} m, ${f.joints.length} xương, ${f.morphTargets.length} morph, ${f.materials.length} vật liệu, ${f.textures.length} texture` : ''}`);
    for (const i of r.issues) console.log(`  [${i.severity.toUpperCase()}] ${i.rule} ${i.message}`);
  }
  process.exit(res.some((r) => r.issues.some((i) => i.severity === 'error')) ? 1 : 0);
}
