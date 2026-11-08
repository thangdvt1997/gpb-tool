// Chạy: node --test scripts/assets/rebase-pivot.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rebasePivot, CHAR_FILES } from './rebase-pivot.mjs';
import { readGlbFacts } from './validate-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const models = path.join(root, 'public', 'models');
const manifest = JSON.parse(fs.readFileSync(path.join(models, 'manifest.json'), 'utf8'));

for (const f of CHAR_FILES) {
  const id = 'char.' + f.replace('.glb', '');
  test(`${f}: origin ở mặt sàn, chạy lại là no-op`, () => {
    const buf = fs.readFileSync(path.join(models, f));
    const facts = readGlbFacts(path.join(models, f));
    assert.ok(Math.abs(facts.boundsMin[1]) < 1e-5, `min.y = ${facts.boundsMin[1]}`);
    const r = rebasePivot(buf);
    assert.deepEqual(r.offset, [0, 0, 0]);
    assert.equal(r.buffer, buf);
  });

  test(`${f}: manifest khớp file, không còn pivot.offset`, () => {
    const a = manifest.assets.find((x) => x.assetId === id);
    const buf = fs.readFileSync(path.join(models, f));
    assert.equal(a.bytes, buf.length);
    assert.equal(a.hash.value, crypto.createHash('sha256').update(buf).digest('hex'));
    assert.deepEqual(a.pivot.offset, [0, 0, 0]);
    assert.ok(Math.abs(a.bounds.min[1]) < 1e-4);
  });

  test(`${f}: rebase từ bản gốc (git, trước khi đổi) cho đúng bản hiện tại, giữ skin và morph`, { skip: !gitOriginal(f) }, () => {
    const orig = gitOriginal(f);
    const r = rebasePivot(orig);
    assert.ok(r.offset[1] > 0.02 && r.offset[1] < 0.03, `d.y = ${r.offset[1]}`);
    assert.ok(Math.abs(r.offset[0]) < 1e-4);
    assert.equal(r.buffer.length > 0, true);
    const cur = fs.readFileSync(path.join(models, f));
    assert.equal(Buffer.compare(r.buffer, cur), 0);
  });
}

/** Bản GLB gần nhất trong lịch sử git mà origin còn cách mặt sàn (trước khi rebase). null nếu không có. */
function gitOriginal(f) {
  try {
    const shas = execFileSync('git', ['log', '--diff-filter=M', '--format=%H', '-n', '12', '--', `public/models/${f}`], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    for (const sha of shas) {
      const buf = execFileSync('git', ['show', `${sha}^:public/models/${f}`], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
      if (rebasePivot(buf).offset[1] > 0.01) return buf;
    }
  } catch {
    // không có git hoặc lịch sử nông: bỏ qua test này
  }
  return null;
}
