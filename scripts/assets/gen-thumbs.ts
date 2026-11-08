/**
 * Sinh thumbnail SVG tĩnh cho các GLB trong manifest (không cần GPU).
 * Chạy:  npx vite-node scripts/assets/gen-thumbs.ts [--check]
 * Ra:    public/thumbs/<assetId>.svg. --check: không ghi, thoát 1 nếu thiếu/khác.
 */
import fs from 'node:fs';
import path from 'node:path';
import manifest from '../../public/models/manifest.json';
import { fromManifest, type ManifestLike } from '../../src/library/adapter';
import { colorForId, thumbFileName, thumbnailSvg } from '../../src/library/thumbnail';

const check = process.argv.includes('--check');
const dir = path.resolve(__dirname, '../../public/thumbs');
if (!check) fs.mkdirSync(dir, { recursive: true });
let bad = 0;
for (const it of fromManifest(manifest as unknown as ManifestLike)) {
  const file = path.join(dir, thumbFileName(it.id));
  const svg = thumbnailSvg(it.kind, colorForId(it.id), it.name);
  if (check) {
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8").trimEnd() !== svg) {
      console.error(`Thiếu hoặc lỗi thời: ${file}`);
      bad++;
    }
  } else {
    fs.writeFileSync(file, svg + '\n');
    console.log(`ghi ${path.relative(process.cwd(), file)}`);
  }
}
process.exit(bad ? 1 : 0);
