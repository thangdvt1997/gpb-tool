#!/usr/bin/env node
/**
 * Sinh public/models/tattoo-masks.json: mask vùng da 256x256 (run-length) cho 3 GLB nhân vật MPFB,
 * từ UV + trọng số xương (src/tattoo/glbUv.ts). Chạy offline, xác định (cùng GLB -> cùng byte).
 * Dùng: node scripts/gen-tattoo-masks.mjs [--check]   (--check: so với tệp hiện có, lệch thì thoát mã 1)
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RES = 256;
const MODELS = ['male_real', 'female_real', 'chibi'];
const OUT = join(root, 'public/models/tattoo-masks.json');

const entry = `export { buildRegionMasks } from ${JSON.stringify(join(root, 'src/tattoo/glbUv.ts'))};
export { packMasks } from ${JSON.stringify(join(root, 'src/tattoo/maskPack.ts'))};`;
const dir = join(tmpdir(), 'gpb-tattoo-gen-' + process.pid);
mkdirSync(dir, { recursive: true });
try {
  const r = await build({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, bundle: true, format: 'esm', write: false, platform: 'node' });
  const file = join(dir, 'gen.mjs');
  writeFileSync(file, r.outputFiles[0].text);
  const { buildRegionMasks, packMasks } = await import(pathToFileURL(file).href);
  const models = {};
  for (const id of MODELS) {
    const b = readFileSync(join(root, 'public/models', id + '.glb'));
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    models[id] = packMasks(buildRegionMasks(ab, 'base', RES), RES);
  }
  const text = JSON.stringify({ v: 1, res: RES, models }) + '\n';
  if (process.argv.includes('--check')) {
    const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === text;
    console.log(same ? 'tattoo-masks.json khớp' : 'tattoo-masks.json LỆCH');
    process.exit(same ? 0 : 1);
  }
  writeFileSync(OUT, text);
  console.log(`Ghi ${OUT}: ${Buffer.byteLength(text)} byte`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
