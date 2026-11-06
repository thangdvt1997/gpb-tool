// Chạy fixture: mỗi tệp lỗi phải ra đúng ruleId; ok.json không có error. Chỉ đọc. Dùng: node scripts/scene-qa/selftest.mjs
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const cases = [['ok.json', null], ['dup_id.json', 'SCN-002'], ['invalid_transform.json', 'SCN-005'], ['missing_action.json', 'SCN-020'], ['spawn_blocked.json', 'SCN-060'], ['door_no_anchor.json', 'SCN-050']];
let bad = 0;
for (const [f, rule] of cases) {
  const r = spawnSync(process.execPath, [path.join(here, 'scene-qa.mjs'), '--zone', path.join(here, 'fixtures', f), '--json'], { encoding: 'utf8' });
  const rep = JSON.parse(r.stdout);
  const errs = rep.issues.filter((i) => i.severity === 'error');
  // fixture tối giản thiếu security_gate/lift: bỏ qua SCN-051 khi đánh giá
  const rel = errs.filter((i) => i.ruleId !== 'SCN-051');
  const pass = rule ? rel.some((i) => i.ruleId === rule) && r.status === 1 : rel.length === 0;
  if (!pass) bad++;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${f} mong ${rule ?? 'không lỗi'} -> ${rel.map((i) => i.ruleId).join(',') || '-'}`);
}
process.exit(bad ? 1 : 0);
