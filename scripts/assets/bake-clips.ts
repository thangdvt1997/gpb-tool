/**
 * Bake clip animation từ tư thế procedural thành GLB keyframe cho 3 nhân vật MPFB.
 * Chạy:  npx vite-node scripts/assets/bake-clips.ts [--check]
 * Ra:    public/models/anim_{male_real,female_real,chibi}.glb (cây xương + animation, không mesh).
 * Xác định: cùng đầu vào cho cùng đầu ra. --check: không ghi, so với tệp hiện có (thoát 1 nếu khác).
 * Sau khi đổi tệp, cập nhật hash/bytes trong public/models/manifest.json (node scripts/assets/validate-manifest.mjs --print-facts <tệp>).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportGlb } from './lib/node-gltf-polyfill.mjs';
import { bakeForCharacter } from '../../src/avatar/bakeClips';
import { BAKED_MODEL_IDS } from '../../src/avatar/bakedClips';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const models = path.join(root, 'public', 'models');
const check = process.argv.includes('--check');
let diff = 0;
for (const id of BAKED_MODEL_IDS) {
  const src = fs.readFileSync(path.join(models, `${id}.glb`));
  const { scene, clips } = bakeForCharacter(new Uint8Array(src));
  const out = await exportGlb(scene, { animations: clips });
  const dst = path.join(models, `anim_${id}.glb`);
  if (check) {
    const same = fs.existsSync(dst) && Buffer.compare(fs.readFileSync(dst), out) === 0;
    console.log(`${same ? 'GIỐNG' : 'KHÁC'} ${path.relative(root, dst)}`);
    if (!same) diff++;
  } else {
    fs.writeFileSync(dst, out);
    console.log(`${path.relative(root, dst)}: ${out.length} byte, ${clips.length} clip`);
  }
}
process.exit(diff ? 1 : 0);
