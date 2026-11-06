#!/usr/bin/env node
// Thống kê TĨNH nguồn có thể sinh draw call (Task 08, phần đo được không cần GPU). Chỉ đọc.
// Dùng: node scripts/perf/static-census.mjs [--json]
// GIỚI HẠN: đây KHÔNG phải số draw call thật và KHÔNG tái hiện con số ~208 của docs. Số thật chỉ có từ renderer.info.render.calls
// trên trình duyệt (xem scripts/perf/bench.md). Đếm được: (a) vị trí JSX tạo mesh theo file, (b) số InstancedMesh/InstancedBoxes
// (mỗi cái = 1 draw call bất kể số instance), (c) vị trí nằm trong vòng lặp .map (có thể nhân lên), (d) primitive của GLB nhân vật.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectGlb } from '../scene-qa/asset-qa.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Đếm các thẻ sinh mesh trong một nguồn. loop = số thẻ nằm sau dấu `.map(` gần nhất trong 12 dòng trước (xấp xỉ). */
export function censusSource(src) {
  const lines = src.split('\n');
  const c = { mesh: 0, instanced: 0, line: 0, points: 0, primitive: 0, loopSites: 0 };
  lines.forEach((ln, i) => {
    const m = ln.match(/<(mesh|instancedMesh|InstancedBoxes|lineSegments|line|points|primitive|Line)\b/g) ?? [];
    for (const t of m) {
      const n = t.slice(1);
      if (n === 'mesh') c.mesh++;
      else if (n === 'instancedMesh' || n === 'InstancedBoxes') c.instanced++;
      else if (n === 'points') c.points++;
      else if (n === 'primitive') c.primitive++;
      else c.line++;
      if (lines.slice(Math.max(0, i - 12), i + 1).some((x) => /\.map\(/.test(x))) c.loopSites++;
    }
  });
  return c;
}

export function run() {
  const files = walk(path.join(root, 'src', 'scene')).sort();
  const perFile = files.map((f) => ({ file: path.relative(root, f), ...censusSource(fs.readFileSync(f, 'utf8')) }))
    .filter((r) => r.mesh + r.instanced + r.line + r.points + r.primitive > 0);
  const tot = perFile.reduce((a, r) => ({ mesh: a.mesh + r.mesh, instanced: a.instanced + r.instanced, loopSites: a.loopSites + r.loopSites }), { mesh: 0, instanced: 0, loopSites: 0 });
  const zone = JSON.parse(fs.readFileSync(path.join(root, 'src/content/zones/it.json'), 'utf8'));
  const byKind = {};
  for (const o of zone.objects) byKind[o.kind] = (byKind[o.kind] ?? 0) + 1;
  const models = path.join(root, 'public/models');
  const avatars = fs.existsSync(models) ? fs.readdirSync(models).filter((n) => n.endsWith('.glb')).map((n) => {
    const f = inspectGlb(fs.readFileSync(path.join(models, n)));
    return { file: n, primitives: f.primitives, materials: f.materials.length };
  }) : [];
  return {
    perFile, totals: tot, zoneObjects: zone.objects.length, zoneObjectsByKind: byKind, avatars,
    note: 'Đếm vị trí mã nguồn, không phải draw call chạy thật. Mỗi nhân vật tối thiểu = số primitive (xấp xỉ số vật liệu x mesh), gấp đôi nếu có pass đổ bóng. Số thật: renderer.info.render.calls.',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = run();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    console.log('File | mesh | instanced | trong .map');
    for (const f of r.perFile) console.log(`${f.file} | ${f.mesh} | ${f.instanced} | ${f.loopSites}`);
    console.log(`Tổng vị trí: mesh=${r.totals.mesh} instanced=${r.totals.instanced} (trong .map: ${r.totals.loopSites})`);
    console.log(`Vật thể it.json: ${r.zoneObjects} ` + JSON.stringify(r.zoneObjectsByKind));
    for (const a of r.avatars) console.log(`GLB ${a.file}: ${a.primitives} primitive, ${a.materials} vật liệu`);
    console.log(r.note);
  }
}
