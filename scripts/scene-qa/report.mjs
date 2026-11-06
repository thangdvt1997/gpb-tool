#!/usr/bin/env node
// Báo cáo HTML tự chứa (không script, không tài nguyên ngoài) gộp: scene-qa + validate-manifest + kiểm tra asset GLB + census tĩnh.
// Dùng: node scripts/scene-qa/report.mjs [--out FILE] [--models DIR]
// Mặc định ghi scratchpad/qa-report.html (thư mục đã gitignore). Không ghi đâu khác, không sửa nguồn.
// Mã thoát: 0 = không có error; 1 = có error ở bất kỳ phần nào; 2 = lỗi chạy.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkDir } from './asset-qa.mjs';
import { run as census } from '../perf/static-census.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function runJson(script, extra = []) {
  const r = spawnSync(process.execPath, [path.join(root, script), ...extra, '--json'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status === 2 || !r.stdout) throw new Error(`${script} lỗi chạy: ${(r.stderr || '').slice(0, 300)}`);
  return JSON.parse(r.stdout);
}

const badge = (sev) => `<span class="b ${esc(sev)}">${esc(sev)}</span>`;
const table = (head, rows) => `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td>${i === 0 && /^(error|warning|info)$/.test(c) ? badge(c) : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

/** Dựng HTML từ các phần đã thu thập. Hàm thuần để test. */
export function buildHtml({ scene, manifest, assets, perf, generatedAt }) {
  const sc = scene.summary.count;
  const mn = { error: manifest.errors.length, warning: manifest.warnings.length };
  const as = { error: 0, warning: 0, info: 0 };
  for (const a of assets) for (const i of a.issues) as[i.severity]++;
  const totalErr = sc.error + mn.error + as.error;
  const sections = [];
  sections.push(`<h2>1. Scene (it.json)</h2><p>${scene.summary.objects} vật, ${scene.summary.solidObjects} vật đặc. error=${sc.error}, warning=${sc.warning}. Phạm vi: ${esc(scene.summary.scope)}.</p>` +
    table(['Mức', 'Rule', 'Vật', 'Thông điệp', 'Sửa'], scene.issues.map((i) => [i.severity, i.ruleId, i.objectId ?? '-', i.message, i.suggestedFix])));
  const mi = [...manifest.errors.map((x) => ['error', x]), ...manifest.warnings.map((x) => ['warning', x])];
  const clips = mi.filter(([, x]) => x.code === 'CLIP_MISSING').length;
  sections.push(`<h2>2. Manifest asset</h2><p>${mn.error} lỗi, ${mn.warning} cảnh báo (trong đó ${clips} là CLIP_MISSING do chưa có asset animation).</p>` +
    table(['Mức', 'Mã', 'Asset', 'Vị trí', 'Thông điệp'], mi.map(([s, x]) => [s, x.code, x.assetId ?? '-', x.path ?? '-', x.message])));
  sections.push(`<h2>3. Asset GLB thật (ASSET_STANDARD mục 6, 7)</h2>` +
    table(['File', 'Tam giác', 'MB', 'Cao (m)', 'Xương', 'Morph', 'Vật liệu (alphaMode)', 'Texture'], assets.map((a) => a.facts ? [a.file, a.facts.triangles, (a.facts.bytes / 1048576).toFixed(2), a.facts.size[1].toFixed(2), a.facts.joints.length, a.facts.morphTargets.length, a.facts.materials.map((m) => `${m.name}:${m.alphaMode}${m.doubleSided ? '+2S' : ''}`).join('; '), a.facts.textures.map((t) => t.size ? t.size.join('x') : '?').join(', ')] : [a.file, '-', '-', '-', '-', '-', '-', '-'])) +
    table(['Mức', 'Rule', 'File', 'Thông điệp'], assets.flatMap((a) => a.issues.map((i) => [i.severity, i.rule, a.file, i.message]))));
  sections.push(`<h2>4. Census tĩnh draw call (không phải số đo thật)</h2><p>${esc(perf.note)}</p>` +
    table(['File', 'mesh', 'instanced', 'trong .map'], perf.perFile.map((f) => [f.file, f.mesh, f.instanced, f.loopSites])) +
    `<p>Vật thể it.json: ${perf.zoneObjects}. GLB: ${perf.avatars.map((a) => `${esc(a.file)}=${a.primitives} primitive`).join(', ')}.</p>`);
  const style = 'body{font:14px system-ui,sans-serif;margin:24px;color:#1b1f24}table{border-collapse:collapse;margin:8px 0 20px;width:100%}th,td{border:1px solid #d0d7de;padding:4px 8px;text-align:left;vertical-align:top}th{background:#f3f4f6}.b{padding:1px 6px;border-radius:4px;color:#fff;font-size:12px}.error{background:#b42318}.warning{background:#b54708}.info{background:#475467}.sum{padding:8px 12px;border-radius:6px;background:#f3f4f6}';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Báo cáo QA scene và asset</title><style>${style}</style></head><body><h1>Báo cáo QA scene và asset</h1><p class="sum">Tạo lúc ${esc(generatedAt)}. Tổng error: <b>${totalErr}</b> (scene ${sc.error}, manifest ${mn.error}, asset ${as.error}). Warning: scene ${sc.warning}, manifest ${mn.warning}, asset ${as.warning}.</p><p>Chưa kiểm chứng: hiển thị thật, draw call thật, FPS, bộ nhớ GPU (cần trình duyệt và GPU).</p>${sections.join('')}</body></html>`;
}

export function collect(modelsDir) {
  const scene = runJson('scripts/scene-qa/scene-qa.mjs');
  const manifest = runJson('scripts/assets/validate-manifest.mjs');
  const assets = checkDir(modelsDir);
  return { scene, manifest, assets, perf: census(), generatedAt: new Date().toISOString() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
  const out = path.resolve(opt('--out') ?? path.join(root, 'scratchpad', 'qa-report.html'));
  try {
    const data = collect(path.resolve(opt('--models') ?? path.join(root, 'public/models')));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buildHtml(data));
    const err = data.scene.summary.count.error + data.manifest.errors.length + data.assets.reduce((n, x) => n + x.issues.filter((i) => i.severity === 'error').length, 0);
    console.log(`Đã ghi ${out} (error=${err})`);
    process.exit(err ? 1 : 0);
  } catch (e) { console.error('LOI CHAY: ' + e.message); process.exit(2); }
}
