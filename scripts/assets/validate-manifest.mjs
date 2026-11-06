#!/usr/bin/env node
/**
 * Kiểm tra manifest asset 3D. Node thuần (>= 22.18 / 23.6, chạy trực tiếp file .ts nhờ type stripping),
 * không phụ thuộc gói ngoài. Logic kiểm tra dùng chung với ứng dụng: src/assets/validate.ts.
 *
 * Cách dùng:
 *   node scripts/assets/validate-manifest.mjs                      # mặc định public/models/manifest.json
 *   node scripts/assets/validate-manifest.mjs path/to/manifest.json
 *   node scripts/assets/validate-manifest.mjs --strict             # cảnh báo cũng làm exit 1
 *   node scripts/assets/validate-manifest.mjs --json               # in kết quả dạng JSON
 *   node scripts/assets/validate-manifest.mjs --no-glb             # bỏ đọc GLB (chỉ kiểm cấu trúc + file tồn tại)
 *   node scripts/assets/validate-manifest.mjs --print-facts a.glb  # đo hash, bounds, tam giác, xương, morph, clip
 *
 * Trường manifest thêm: proceduralClips (clip do mã tạo), style "chibi" (khoảng chiều cao chibi).
 *
 * Exit code: 0 = không có lỗi; 1 = có lỗi (hoặc có cảnh báo khi --strict); 2 = lỗi dùng lệnh/đọc file.
 * Script không ghi file nào.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

/** Đọc thông tin GLB (glTF 2.0 binary). Trả về null nếu sai định dạng. */
export function readGlbFacts(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return null;
  }
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67 || buf.readUInt32LE(4) !== 2) return null;
  const jsonLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) return null;
  let j;
  try {
    j = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  } catch {
    return null;
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  const morph = new Set();
  const nodeTransformsIgnored = [];
  for (const m of j.meshes ?? []) {
    for (const n of m.extras?.targetNames ?? []) morph.add(n);
    for (const pr of m.primitives ?? []) {
      const pos = j.accessors?.[pr.attributes?.POSITION];
      if (!pos) continue;
      if (Array.isArray(pos.min) && Array.isArray(pos.max)) {
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], pos.min[k]);
          max[k] = Math.max(max[k], pos.max[k]);
        }
      }
      const mode = pr.mode ?? 4;
      const count = pr.indices != null ? j.accessors[pr.indices].count : pos.count;
      if (mode === 4) triangles += Math.floor(count / 3);
      else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2);
    }
  }
  for (const n of j.nodes ?? []) {
    if (n.mesh != null && n.skin == null && (n.translation || n.rotation || n.scale || n.matrix)) {
      nodeTransformsIgnored.push(n.name ?? '(không tên)');
    }
  }
  const joints = (j.skins?.[0]?.joints ?? []).map((i) => j.nodes[i]?.name ?? `#${i}`);
  return {
    bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    triangles,
    boundsMin: min,
    boundsMax: max,
    joints,
    morphTargets: [...morph],
    animations: (j.animations ?? []).map((a) => a.name ?? ''),
    nodes: (j.nodes ?? []).map((n) => n.name ?? ''),
    materials: (j.materials ?? []).map((m) => ({
      name: m.name ?? '',
      alphaMode: m.alphaMode ?? 'OPAQUE',
      doubleSided: m.doubleSided === true,
    })),
    // Thông tin thêm cho --print-facts (validator lõi không dùng):
    extra: {
      generator: j.asset?.generator,
      skins: j.skins?.length ?? 0,
      meshes: j.meshes?.length ?? 0,
      images: (j.images ?? []).map((im) => `${im.mimeType ?? '?'}:${im.name ?? ''}`),
      textures: j.textures?.length ?? 0,
      extensionsUsed: j.extensionsUsed ?? [],
      nodeTransformsIgnored,
      boundsNote: 'Hợp các accessor POSITION min/max (không gian mesh, tư thế nghỉ). Transform node của mesh không skin chưa được áp.',
    },
  };
}

async function loadCore() {
  const url = pathToFileURL(path.join(repoRoot, 'src', 'assets', 'validate.ts')).href;
  try {
    return await import(url);
  } catch (e) {
    console.error(`Không nạp được ${url}. Cần Node có type stripping (>= 22.18 hoặc >= 23.6). Lỗi: ${e.message}`);
    process.exit(2);
  }
}

/** Khoảng chiều cao gốc (m) chấp nhận cho mô hình chibi; app scale lên 85–130 cm khi hiển thị. */
export const CHIBI_HEIGHT_M = [0.6, 1.4];

const issue = (severity, code, assetId, p, message, fix) => ({ severity, code, assetId, path: p, message, fix });

/**
 * Hậu xử lý ở lớp script (lõi src/assets/validate.ts không đổi):
 * - proceduralClips: clip khai báo do mã tạo (src/avatar/animation.ts), không nằm trong GLB. CLIP_MISSING của đúng các clip này
 *   được chuyển thành info CLIP_PROCEDURAL (không mất dấu vết). Clip không khai báo vẫn là cảnh báo CLIP_MISSING.
 * - style "chibi": nhân vật tỷ lệ chibi (một lựa chọn chính thức cạnh tỷ lệ thật, xem user.txt) dùng khoảng chiều cao
 *   CHIBI_HEIGHT_M thay cho khoảng người thật. Trong khoảng thì bỏ lỗi CHARACTER_HEIGHT, ngoài khoảng vẫn là lỗi.
 * - Kiểm kích thước file thật so với `bytes` (dung sai tương đối sizeTolerance, mặc định 0) kể cả khi --no-glb.
 */
export function postProcess(res, data, { dir = '.', sizeTolerance = 0 } = {}) {
  const errors = [...res.errors];
  let warnings = [...res.warnings];
  const info = [];
  const assets = Array.isArray(data?.assets) ? data.assets : [];
  const byId = new Map(assets.map((a) => [a?.assetId, a]));
  for (const [i, a] of assets.entries()) {
    if (a?.proceduralClips === undefined) continue;
    if (!Array.isArray(a.proceduralClips) || a.proceduralClips.some((c) => typeof c !== 'string' || !c)) {
      errors.push(issue('error', 'BAD_PROCEDURAL_CLIPS', a.assetId ?? null, `assets[${i}].proceduralClips`, 'proceduralClips phải là mảng tên clip (chuỗi không rỗng).', 'Ví dụ: "proceduralClips": ["idle", "walk"].'));
    }
  }
  const keep = [];
  for (const w of warnings) {
    const a = byId.get(w.assetId);
    if (w.code === 'CLIP_MISSING' && a && Array.isArray(a.proceduralClips)) {
      const m = /clip "([^"]+)"/.exec(w.message);
      if (m && a.proceduralClips.includes(m[1])) {
        info.push(issue('info', 'CLIP_PROCEDURAL', w.assetId, w.path, `Clip "${m[1]}" do mã tạo (procedural), không có trong GLB.`, 'Khi có clip thật, thêm asset animation rồi bỏ tên khỏi proceduralClips.'));
        continue;
      }
    }
    keep.push(w);
  }
  warnings = keep;
  const keepErr = [];
  for (const e of errors) {
    const a = byId.get(e.assetId);
    if (e.code === 'CHARACTER_HEIGHT' && a?.style === 'chibi') {
      const h = Array.isArray(a.bounds?.min) && Array.isArray(a.bounds?.max) ? a.bounds.max[1] - a.bounds.min[1] : NaN;
      if (h >= CHIBI_HEIGHT_M[0] && h <= CHIBI_HEIGHT_M[1]) {
        info.push(issue('info', 'CHIBI_HEIGHT', e.assetId, e.path, `Chibi cao ${h.toFixed(3)} m, trong khoảng ${CHIBI_HEIGHT_M.join('–')} m.`, 'Chiều cao hiển thị do targetHeightM (BODY_LIMITS_BY_STYLE.chibi) quyết định.'));
        continue;
      }
    }
    keepErr.push(e);
  }
  const already = new Set(keepErr.filter((e) => e.code === 'BYTES_MISMATCH' || e.code === 'FILE_MISSING').map((e) => `${e.assetId}|${e.code}`));
  for (const [i, a] of assets.entries()) {
    if (!a || typeof a.url !== 'string' || !Number.isFinite(a.bytes) || already.has(`${a.assetId}|BYTES_MISMATCH`) || already.has(`${a.assetId}|FILE_MISSING`)) continue;
    if (/^[a-z][a-z0-9+.-]*:|^[\\/]|\.\./i.test(a.url)) continue; // đường dẫn không an toàn: lõi đã báo, không đọc đĩa
    let st;
    try { st = fs.statSync(path.resolve(dir, a.url)); } catch { continue; }
    if (Math.abs(st.size - a.bytes) > Math.abs(a.bytes) * sizeTolerance) {
      keepErr.push(issue('error', 'FILE_SIZE_MISMATCH', a.assetId, `assets[${i}].bytes`, `File ${a.url} nặng ${st.size} byte, manifest ghi ${a.bytes} (dung sai ${sizeTolerance * 100}%).`, 'Chạy --print-facts rồi cập nhật bytes và hash; nếu không chủ ý đổi file thì khôi phục file gốc.'));
    }
  }
  return { ...res, ok: keepErr.length === 0, errors: keepErr, warnings, info };
}

export async function validateFile(manifestPath, { glb = true, sizeTolerance = 0 } = {}) {
  const core = await loadCore();
  const raw = fs.readFileSync(manifestPath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return {
      ok: false,
      errors: [{ severity: 'error', code: 'JSON_PARSE', assetId: null, path: '', message: `JSON lỗi: ${e.message}`, fix: 'Sửa cú pháp JSON (NaN/Infinity không hợp lệ trong JSON).' }],
      warnings: [],
    };
  }
  const dir = path.dirname(path.resolve(manifestPath));
  const resolve = (u) => path.resolve(dir, u);
  const res = core.validateManifest(data, {
    fileExists: (u) => fs.existsSync(resolve(u)) && fs.statSync(resolve(u)).isFile(),
    readGlb: glb ? (u) => readGlbFacts(resolve(u)) : undefined,
  });
  return postProcess(res, data, { dir, sizeTolerance });
}

async function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
    return 0;
  }
  const pf = args.indexOf('--print-facts');
  if (pf >= 0) {
    const file = args[pf + 1];
    if (!file) {
      console.error('Thiếu đường dẫn GLB sau --print-facts.');
      return 2;
    }
    const f = readGlbFacts(file);
    if (!f) {
      console.error(`Không đọc được GLB: ${file}`);
      return 2;
    }
    console.log(JSON.stringify(f, null, 2));
    return 0;
  }
  const strict = args.includes('--strict');
  const asJson = args.includes('--json');
  const glb = !args.includes('--no-glb');
  const file = args.find((a) => !a.startsWith('--')) ?? path.join(repoRoot, 'public', 'models', 'manifest.json');
  if (!fs.existsSync(file)) {
    console.error(`Không tìm thấy manifest: ${file}`);
    return 2;
  }
  const res = await validateFile(file, { glb });
  const core = await loadCore();
  if (asJson) console.log(JSON.stringify(res, null, 2));
  else {
    console.log(`Manifest: ${path.resolve(file)}`);
    for (const x of res.errors) console.log(core.formatIssue(x));
    for (const x of res.warnings) console.log(core.formatIssue(x));
    for (const x of res.info ?? []) console.log(`[INFO] ${x.code} ${x.assetId} @ ${x.path}: ${x.message}`);
    console.log(`Kết quả: ${res.errors.length} lỗi, ${res.warnings.length} cảnh báo, ${(res.info ?? []).length} ghi chú (clip procedural).${res.ok ? ' Không có lỗi.' : ''}`);
  }
  if (!res.ok) return 1;
  if (strict && res.warnings.length) return 1;
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv).then((code) => process.exit(code));
}
