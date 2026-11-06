#!/usr/bin/env node
// Kiểm tra chất lượng dữ liệu scene (TASK 21). Chỉ đọc: không bao giờ sửa it.json hay mã nguồn.
// Dùng: node scripts/scene-qa/scene-qa.mjs [--root DIR] [--zone FILE] [--json] [--md] [--out FILE] [--baseline FILE] [--strict]
//   --json / --md    định dạng báo cáo ra stdout (mặc định: văn bản). --out ghi thêm báo cáo ra FILE do người dùng chỉ định.
//   --baseline FILE  JSON {"suppress":[{"ruleId","objectId","reason"}]}: lỗi đã biết, phải có lý do. Không tắt được cả nhóm rule.
//   --strict         warning cũng làm thoát mã 1.
// Mã thoát: 0 = không có lỗi nghiêm trọng mới; 1 = có error (hoặc warning khi --strict); 2 = lỗi chạy (thiếu file, JSON hỏng).
// Phạm vi: dữ liệu it.json + đa giác chữ L (trích từ src/scene/officeBounds.ts) + quy tắc solid của src/scene/layout.ts.
// Không kiểm: mesh/texture/rig nhân vật, va chạm decor trong phòng, thẩm mỹ. Không phải kiểm định pháp lý về lối thoát.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const t0 = Date.now();
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n) => args.includes(n);
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(opt('--root') ?? path.join(here, '..', '..'));
const ZONE = path.resolve(opt('--zone') ?? path.join(ROOT, 'src/content/zones/it.json'));

// ---- Cấu hình dự án (nguồn: src/scene/layout.ts, officeBounds.ts, controls) ----
const CFG = {
  floorW: 58, floorD: 30,        // layout.ts FLOOR
  playerRadius: 0.35,            // layout.ts PLAYER_RADIUS
  minLane: 1.0,                  // m, bề rộng tối thiểu theo yêu cầu task
  maxDim: 60, maxSizeMin: 0.005, // kích thước bất thường
  maxHeight: 6,
  maxAnchorDist: 0.6,            // vật thể thang: tâm cửa cách mép lõi tối đa (m)
  gridStep: 0.1,
};
const KINDS = new Set(['core','wc','pantry','lounge','board','amenity','reserved','desk','wall','counter','meeting','server','room','elevator','security_gate','checkin_board','screen']);
const ROLES = new Set(['employee','it','admin','moderator']);
const ACTIONS = new Set(['info','kudos','booking','noc','squad','notice','service_desk','server_room','soc','games','karaoke','events','checkin_board','moderation']);
// Loại -> action hợp lệ (quy tắc theo loại để tránh báo vô nghĩa). Không liệt kê = chỉ cần action thuộc ACTIONS.
const KIND_ACTIONS = {
  meeting: ['booking'], server: ['server_room'], room: ['soc','karaoke'], desk: ['squad','info'],
  counter: ['service_desk','moderation'], checkin_board: ['checkin_board'], wall: ['noc'], elevator: ['info'],
};
const NEEDS_CAPACITY = new Set(['meeting']);
// Vật chỉ là lớp phủ sàn: không tính va chạm/overlap (khớp layout.isSolidObject).
const DECAL_KINDS = new Set(['lounge','pantry','reserved']);
const SOLID_KINDS = new Set(['core','wc','meeting','server','room','counter','board','wall','screen','desk','elevator','checkin_board']);
// Overlap có chủ ý: [a, b, lý do]. Thứ tự không quan trọng.
const ALLOWED_OVERLAPS = [
  ['lift7_east', 'core_lift2', 'cửa thang là mặt của lõi thang máy 2'],
  ['lift7_west', 'core_lift1', 'cửa thang là mặt của lõi thang máy 1'],
  ['checkin_board', 'core_lift2', 'bảng ghi danh dán sát tường lõi thang máy 2'],
];

// ---- Báo cáo ----
const issues = [];
const add = (ruleId, severity, objectId, message, location, suggestedFix) =>
  issues.push({ ruleId, severity, objectId, message, location: location ?? null, suggestedFix });
const fin = (...v) => v.every((x) => typeof x === 'number' && Number.isFinite(x));
const f2 = (x) => (Number.isFinite(x) ? +x.toFixed(3) : x);

function fatal(msg) { console.error('LOI CHAY: ' + msg); process.exit(2); }

// ---- Đọc dữ liệu ----
let zone;
try { zone = JSON.parse(fs.readFileSync(ZONE, 'utf8')); } catch (e) { fatal(`không đọc được ${ZONE}: ${e.message}`); }
if (!zone || !Array.isArray(zone.objects)) fatal('it.json thiếu mảng "objects"');
const objs = zone.objects;

// Đa giác L: trích OFFICE_L_PLAN từ officeBounds.ts, đổi sang hệ three.js bằng x-29, y-15 (layout.ts toWorldX/Z).
function loadPolygon() {
  const f = path.join(ROOT, 'src/scene/officeBounds.ts');
  let src;
  try { src = fs.readFileSync(f, 'utf8'); } catch { return null; }
  const m = src.match(/OFFICE_L_PLAN[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!m) return null;
  const pts = [...m[1].matchAll(/\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g)].map((r) => [+r[1] - CFG.floorW / 2, +r[2] - CFG.floorD / 2]);
  return pts.length >= 3 ? pts : null;
}
const POLY = loadPolygon();
if (!POLY) add('SCN-000', 'error', null, 'Không trích được OFFICE_L_PLAN từ src/scene/officeBounds.ts.', 'src/scene/officeBounds.ts', 'Giữ khai báo OFFICE_L_PLAN dạng mảng [x, y] hoặc cập nhật bộ trích trong scene-qa.mjs.');

function inPoly(x, z, poly = POLY) {
  if (!poly) return true;
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
// Điểm trên cạnh coi là trong (khớp isInsideOffice có EPS).
function inPolyOrEdge(x, z) {
  if (!POLY) return true;
  if (inPoly(x, z)) return true;
  for (let i = 0, j = POLY.length - 1; i < POLY.length; j = i++) {
    const [ax, az] = POLY[j], [bx, bz] = POLY[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    if (Math.hypot(x - (ax + t * dx), z - (az + t * dz)) < 1e-6) return true;
  }
  return false;
}

const fp = (o) => ({ minX: o.position[0] - o.size[0] / 2, maxX: o.position[0] + o.size[0] / 2, minZ: o.position[2] - o.size[2] / 2, maxZ: o.position[2] + o.size[2] / 2 });
const isSolid = (o) => (o.kind === 'amenity' ? o.size[1] >= 0.5 : SOLID_KINDS.has(o.kind));

// ---- 1. Schema, id, giá trị hữu hạn ----
const seen = new Map();
const valid = []; // vật có position/size hợp lệ
for (const [i, o] of objs.entries()) {
  const loc = `objects[${i}]`;
  const id = typeof o?.id === 'string' && o.id ? o.id : null;
  if (!id) { add('SCN-001', 'error', null, 'Vật thiếu id hoặc id không phải chuỗi.', loc, 'Đặt id duy nhất dạng chuỗi.'); continue; }
  if (seen.has(id)) add('SCN-002', 'error', id, `ID trùng: ${id} xuất hiện tại ${seen.get(id)} và ${loc}.`, loc, 'Đổi một trong hai id thành giá trị duy nhất; cập nhật mọi tham chiếu.');
  else seen.set(id, loc);
  if (!KINDS.has(o.kind)) add('SCN-003', 'error', id, `kind không hợp lệ: ${JSON.stringify(o.kind)}.`, loc, `Dùng một trong: ${[...KINDS].join(', ')}.`);
  const okVec = (v) => Array.isArray(v) && v.length === 3;
  if (!okVec(o.position) || !okVec(o.size)) { add('SCN-004', 'error', id, 'position/size phải là mảng 3 số.', loc, 'Sửa thành [x, y, z] và [w, h, d].'); continue; }
  if (!fin(...o.position, ...o.size)) { add('SCN-005', 'error', id, `Giá trị không hữu hạn: position=${JSON.stringify(o.position)} size=${JSON.stringify(o.size)}.`, loc, 'Thay NaN/Infinity/chuỗi bằng số hữu hạn.'); continue; }
  if (o.size.some((s) => s <= 0)) add('SCN-006', 'error', id, `Kích thước không dương: ${JSON.stringify(o.size)}.`, loc, 'Đặt size > 0 theo từng trục.');
  else if (o.size.some((s) => s < CFG.maxSizeMin) || o.size[0] > CFG.maxDim || o.size[2] > CFG.maxDim || o.size[1] > CFG.maxHeight)
    add('SCN-007', 'warning', id, `Kích thước bất thường: ${JSON.stringify(o.size)}.`, loc, 'Kiểm tra đơn vị mét; chiều cao tối đa 6 m, cạnh sàn tối đa 60 m.');
  if (Math.abs(o.position[0]) > CFG.floorW || Math.abs(o.position[2]) > CFG.floorD) add('SCN-008', 'error', id, `Vị trí cách xa sàn ${CFG.floorW}x${CFG.floorD} m: ${JSON.stringify(o.position)}.`, loc, 'Có thể nhầm hệ tọa độ bản vẽ và three.js (worldX = x - 29, worldZ = y - 15).');
  if (typeof o.label !== 'string' || !o.label) add('SCN-009', 'warning', id, 'Thiếu label.', loc, 'Thêm nhãn hiển thị.');
  if (!Array.isArray(o.roles) || o.roles.length === 0) add('SCN-010', 'error', id, 'Thiếu roles hoặc rỗng.', loc, 'Khai báo ít nhất một vai trò.');
  else for (const r of o.roles) if (!ROLES.has(r)) add('SCN-010', 'error', id, `Vai trò lạ: ${r}.`, loc, `Dùng: ${[...ROLES].join(', ')}.`);
  valid.push(o);
}

// ---- 2. Action theo loại ----
for (const o of valid) {
  const loc = `objects[${objs.indexOf(o)}]`;
  if (typeof o.action !== 'string' || !o.action) { add('SCN-020', 'error', o.id, `Thiếu action (kind=${o.kind}).`, loc, 'Thêm action, ví dụ "info" nếu chỉ hiển thị.'); continue; }
  if (!ACTIONS.has(o.action)) add('SCN-021', 'error', o.id, `action không có handler đã biết: ${o.action}.`, loc, `Dùng: ${[...ACTIONS].join(', ')} hoặc thêm vào ACTIONS nếu đã có handler.`);
  else if (KIND_ACTIONS[o.kind] && !KIND_ACTIONS[o.kind].includes(o.action)) add('SCN-022', 'error', o.id, `kind=${o.kind} yêu cầu action thuộc [${KIND_ACTIONS[o.kind].join(', ')}], đang là ${o.action}.`, loc, 'Sửa action hoặc kind cho khớp.');
  if (NEEDS_CAPACITY.has(o.kind) && !(Number.isInteger(o.capacity) && o.capacity > 0)) add('SCN-023', 'error', o.id, `kind=${o.kind} thiếu capacity nguyên dương.`, loc, 'Thêm capacity (số chỗ).');
  if (o.action === 'squad' && !o.squad) add('SCN-024', 'warning', o.id, 'action=squad nhưng thiếu trường squad.', loc, 'Thêm tên squad.');
}

// ---- 3. Ngoài đa giác L ----
// Khớp isObjectInOffice: vật phải nằm trọn trong L. Lấy mẫu 4 góc, tâm và trung điểm 4 cạnh, thêm điểm lưới 0.25 m.
function coverage(r) {
  let tot = 0, ins = 0;
  const nx = Math.max(2, Math.ceil((r.maxX - r.minX) / 0.25)), nz = Math.max(2, Math.ceil((r.maxZ - r.minZ) / 0.25));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const x = r.minX + ((r.maxX - r.minX) * i) / nx, z = r.minZ + ((r.maxZ - r.minZ) * j) / nz;
    tot++; if (inPolyOrEdge(x, z)) ins++;
  }
  return ins / tot;
}
for (const o of valid) {
  const r = fp(o), cov = coverage(r);
  if (cov >= 1) continue;
  const loc = `objects[${objs.indexOf(o)}]`;
  const where = `footprint x ${f2(r.minX)}..${f2(r.maxX)}, z ${f2(r.minZ)}..${f2(r.maxZ)}`;
  if (cov === 0) add('SCN-030', 'warning', o.id, `Nằm hoàn toàn ngoài chữ L (không được dựng): ${where}.`, loc, 'Dời vào trong L hoặc xóa khỏi it.json nếu không còn dùng.');
  else add('SCN-031', 'warning', o.id, `Cắt ngang mép chữ L (~${Math.round(cov * 100)}% trong L, không được dựng): ${where}.`, loc, 'Thu footprint vào trong L hoặc chốt đây là vật dự phòng.');
}

// ---- 4. Overlap footprint ----
const allowed = (a, b) => ALLOWED_OVERLAPS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const solids = valid.filter((o) => !DECAL_KINDS.has(o.kind) && isSolid(o)).map((o) => ({ o, r: fp(o) }));
solids.sort((a, b) => a.r.minX - b.r.minX); // broadphase: sweep theo trục X
let pairChecks = 0;
for (let i = 0; i < solids.length; i++) {
  for (let j = i + 1; j < solids.length; j++) {
    const A = solids[i], B = solids[j];
    if (B.r.minX >= A.r.maxX) break;
    pairChecks++;
    const w = Math.min(A.r.maxX, B.r.maxX) - Math.max(A.r.minX, B.r.minX);
    const d = Math.min(A.r.maxZ, B.r.maxZ) - Math.max(A.r.minZ, B.r.minZ);
    if (w > 0.01 && d > 0.01 && !allowed(A.o.id, B.o.id)) {
      // Cả hai ngoài L (không được dựng) thì chỉ cảnh báo; có ít nhất một vật được dựng thì là lỗi.
      add('SCN-040', coverage(A.r) >= 1 || coverage(B.r) >= 1 ? 'error' : 'warning', A.o.id, `Footprint chồng với ${B.o.id}: vùng giao ${f2(w)} x ${f2(d)} m (${f2(w * d)} m2).`, `${A.o.id} <-> ${B.o.id}`, `Dời hoặc thu nhỏ một vật; nếu chồng có chủ ý, thêm cặp vào ALLOWED_OVERLAPS kèm lý do.`);
    }
  }
}

// ---- 5. Cửa thang, an ninh: anchor và clearance ----
const byId = new Map(valid.map((o) => [o.id, o]));
const rectDist = (x, z, r) => Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));
const solidRects = (exceptIds = []) => solids.filter((s) => !exceptIds.includes(s.o.id));

// Cửa thang phải dán vào một lõi (anchor không quá xa object): khoảng cách từ footprint cửa tới lõi gần nhất.
for (const o of valid.filter((v) => v.kind === 'elevator')) {
  const r = fp(o);
  const cores = valid.filter((v) => v.kind === 'core');
  const best = cores.map((c) => { const q = fp(c); const dx = Math.max(q.minX - r.maxX, r.minX - q.maxX, 0), dz = Math.max(q.minZ - r.maxZ, r.minZ - q.maxZ, 0); return { id: c.id, d: Math.hypot(dx, dz) }; }).sort((a, b) => a.d - b.d)[0];
  if (!best) add('SCN-050', 'error', o.id, 'Không có lõi (core) nào để cửa thang gắn vào.', null, 'Thêm lõi thang máy.');
  else if (best.d > CFG.maxAnchorDist) add('SCN-050', 'error', o.id, `Cửa thang cách lõi gần nhất (${best.id}) ${f2(best.d)} m > ${CFG.maxAnchorDist} m.`, `objects[${objs.indexOf(o)}]`, 'Dời cửa sát mặt lõi.');
}

// Điểm bắt buộc: [id, tên, x, z, loại trừ khi tính vật cản]
const spawn = { x: -4, z: 3 }; // layout.ts SPAWN = toWorld(25, 18)
const dropPlan = [20.2, 13.4]; // officeBounds.ts: điểm thả chuỗi cảnh (bản vẽ)
const required = [];
required.push({ id: 'SPAWN', name: 'điểm sinh ra', x: spawn.x, z: spawn.z, ex: [] });
required.push({ id: 'DROP', name: 'điểm thả nhân vật', x: dropPlan[0] - 29, z: dropPlan[1] - 15, ex: [] });
const e = byId.get('lift7_east'), w = byId.get('lift7_west'), g = byId.get('security_gate');
// Mặt trước cửa: lift7_east dẹt theo X (cạnh Bắc của lõi) -> trước cửa là phía -Z; lift7_west dẹt theo Z -> phía +X.
if (e) required.push({ id: 'lift7_east', name: 'cabin thang máy Đông (trước cửa 0.8 m)', x: e.position[0], z: e.position[2] - e.size[2] / 2 - 0.8, ex: ['lift7_east'] });
if (w) required.push({ id: 'lift7_west', name: 'cabin thang máy Tây (trước cửa 0.8 m)', x: w.position[0] + w.size[0] / 2 + 0.8, z: w.position[2], ex: ['lift7_west'] });
if (g) {
  const r = fp(g);
  // Khu bảo vệ: quanh bàn an ninh phải có làn 1 m ở phía vào (+Z, nơi ra khỏi thang) và hai bên.
  required.push({ id: 'security_gate', name: 'lối vào khu bảo vệ (phía +Z, 0.8 m)', x: g.position[0], z: r.maxZ + 0.8, ex: ['security_gate'] });
  required.push({ id: 'security_gate', name: 'lối bên Tây khu bảo vệ (0.8 m)', x: r.minX - 0.8, z: g.position[2], ex: ['security_gate'] });
} else add('SCN-051', 'error', 'security_gate', 'Thiếu security_gate: không có khu bảo vệ để kiểm lối đi.', null, 'Thêm lại bàn an ninh.');
if (!e) add('SCN-051', 'error', 'lift7_east', 'Thiếu lift7_east.', null, 'Thêm cửa thang máy Đông.');

for (const p of required) {
  const loc = `(${f2(p.x)}, ${f2(p.z)})`;
  if (!inPolyOrEdge(p.x, p.z)) { add('SCN-052', 'error', p.id, `${p.name} ${loc} nằm ngoài chữ L.`, loc, 'Dời điểm vào trong L.'); continue; }
  let nearest = Infinity, nearId = null;
  for (const s of solidRects(p.ex)) { const d = rectDist(p.x, p.z, s.r); if (d < nearest) { nearest = d; nearId = s.o.id; } }
  if (nearest === 0) add('SCN-053', 'error', p.id, `${p.name} ${loc} nằm trong footprint của ${nearId}.`, loc, `Dời điểm hoặc ${nearId} ra khỏi nhau.`);
  else if (nearest * 2 < CFG.minLane) add('SCN-054', 'error', p.id, `${p.name} ${loc}: khoảng trống quanh điểm chỉ ${f2(nearest * 2)} m (tới ${nearId}), cần >= ${CFG.minLane} m.`, loc, `Dời ${nearId} ra thêm ${f2(CFG.minLane / 2 - nearest)} m hoặc dời điểm.`);
}

// ---- 6. Tới được từ spawn (lưới BFS, vật cản nở bằng bán kính nhân vật) ----
const step = CFG.gridStep, R = CFG.playerRadius;
const X0 = -CFG.floorW / 2, Z0 = -CFG.floorD / 2;
const NX = Math.round(CFG.floorW / step), NZ = Math.round(CFG.floorD / step);
const blocked = new Uint8Array(NX * NZ);
const idx = (i, j) => j * NX + i;
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  const x = X0 + (i + 0.5) * step, z = Z0 + (j + 0.5) * step;
  let b = !inPolyOrEdge(x, z);
  if (!b) for (const s of solids) if (rectDist(x, z, s.r) < R) { b = true; break; }
  blocked[idx(i, j)] = b ? 1 : 0;
}
function bfs(x, z) {
  const si = Math.floor((x - X0) / step), sj = Math.floor((z - Z0) / step);
  const seenG = new Uint8Array(NX * NZ);
  if (si < 0 || sj < 0 || si >= NX || sj >= NZ || blocked[idx(si, sj)]) return null;
  const q = [idx(si, sj)]; seenG[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], ci = c % NX, cj = (c - ci) / NX;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      const k = idx(ni, nj);
      if (!seenG[k] && !blocked[k]) { seenG[k] = 1; q.push(k); }
    }
  }
  return seenG;
}
const reach = bfs(spawn.x, spawn.z);
const reachable = (x, z, tol = 0) => {
  if (!reach) return false;
  const n = Math.ceil(tol / step);
  const ci = Math.floor((x - X0) / step), cj = Math.floor((z - Z0) / step);
  for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
    const i = ci + di, j = cj + dj;
    if (i >= 0 && j >= 0 && i < NX && j < NZ && reach[idx(i, j)] && Math.hypot(di, dj) * step <= tol + step) return true;
  }
  return false;
};
if (!reach) add('SCN-060', 'error', 'SPAWN', `Điểm sinh ra (${spawn.x}, ${spawn.z}) đứng trong vật cản hoặc ngoài L (tính bán kính ${R} m).`, null, 'Dời SPAWN hoặc vật cản gần nó.');
else {
  for (const p of required) {
    if (p.id === 'SPAWN') continue;
    if (!reachable(p.x, p.z, 0.15)) add('SCN-061', 'error', p.id, `${p.name} (${f2(p.x)}, ${f2(p.z)}) không tới được từ SPAWN theo lưới ${step} m, bán kính ${R} m.`, `(${f2(p.x)}, ${f2(p.z)})`, 'Mở lối đi hoặc dời vật chắn.');
  }
  // Interaction target: vật có action khác info phải có ô đi được trong 1.5 m quanh footprint (phạm vi tương tác ước lượng).
  for (const o of valid) {
    if (!o.action || o.action === 'info' || !inPolyOrEdge(o.position[0], o.position[2])) continue;
    if (coverage(fp(o)) < 1) continue; // không dựng thì không tương tác
    const r = fp(o), m = 1.5;
    let ok = false;
    for (let z = r.minZ - m; z <= r.maxZ + m && !ok; z += step) for (let x = r.minX - m; x <= r.maxX + m; x += step) {
      if (rectDist(x, z, r) > m) continue;
      const i = Math.floor((x - X0) / step), j = Math.floor((z - Z0) / step);
      if (i >= 0 && j >= 0 && i < NX && j < NZ && reach[idx(i, j)]) { ok = true; break; }
    }
    if (!ok) add('SCN-062', 'error', o.id, `Không có ô đi được từ SPAWN trong 1.5 m quanh ${o.id} (action=${o.action}).`, `objects[${objs.indexOf(o)}]`, 'Mở lối tới vật hoặc dời vật khỏi vùng bị chặn.');
  }
}

// ---- 7. Baseline / suppression ----
let suppressed = 0;
const bl = opt('--baseline');
if (bl) {
  let base;
  try { base = JSON.parse(fs.readFileSync(path.resolve(bl), 'utf8')); } catch (er) { fatal(`không đọc được baseline: ${er.message}`); }
  const sup = Array.isArray(base.suppress) ? base.suppress : [];
  for (const s of sup) if (!s.ruleId || !s.objectId || !s.reason) fatal('baseline: mỗi mục cần ruleId, objectId và reason (không tắt cả nhóm rule).');
  for (let i = issues.length - 1; i >= 0; i--) {
    const it = issues[i];
    if (sup.some((s) => s.ruleId === it.ruleId && s.objectId === it.objectId)) { issues.splice(i, 1); suppressed++; }
  }
}

// ---- Xuất ----
issues.sort((a, b) => (a.severity === b.severity ? a.ruleId.localeCompare(b.ruleId) : a.severity === 'error' ? -1 : 1));
const count = { error: 0, warning: 0, info: 0 };
const byRule = {};
for (const i of issues) { count[i.severity]++; byRule[i.ruleId] = (byRule[i.ruleId] ?? 0) + 1; }
const summary = {
  tool: 'scene-qa', zone: path.relative(ROOT, ZONE), objects: objs.length, solidObjects: solids.length, pairChecks,
  gridCells: NX * NZ, polygonVertices: POLY ? POLY.length : 0, suppressed, count, byRule, ms: Date.now() - t0,
  scope: 'dữ liệu it.json, đa giác L, footprint, lối đi lưới 2D; không gồm mesh/asset/rig/texture',
};
const report = { summary, issues };

function toText() {
  const L = [`scene-qa: ${summary.objects} vật, ${summary.solidObjects} vật đặc, ${summary.ms} ms. error=${count.error} warning=${count.warning} suppressed=${suppressed}`];
  for (const i of issues) L.push(`[${i.severity.toUpperCase()}] ${i.ruleId} ${i.objectId ?? '-'}: ${i.message}\n    vị trí: ${i.location ?? '-'}\n    sửa: ${i.suggestedFix}`);
  L.push('Theo rule: ' + (Object.entries(byRule).map(([k, v]) => `${k}=${v}`).join(', ') || 'không có'));
  return L.join('\n');
}
function toMd() {
  const L = ['# Báo cáo scene-qa', '', `Vật: ${summary.objects}, vật đặc: ${summary.solidObjects}, thời gian: ${summary.ms} ms`, `Error: ${count.error}, warning: ${count.warning}, suppressed: ${suppressed}`, `Phạm vi: ${summary.scope}`, '', '| Mức | Rule | Vật | Thông điệp | Vị trí | Hướng sửa |', '|---|---|---|---|---|---|'];
  for (const i of issues) L.push(`| ${i.severity} | ${i.ruleId} | ${i.objectId ?? '-'} | ${i.message} | ${i.location ?? '-'} | ${i.suggestedFix} |`);
  return L.join('\n') + '\n';
}
const out = flag('--json') ? JSON.stringify(report, null, 2) : flag('--md') ? toMd() : toText();
console.log(out);
const outFile = opt('--out');
if (outFile) fs.writeFileSync(path.resolve(outFile), flag('--md') ? toMd() : JSON.stringify(report, null, 2));
process.exit(count.error > 0 || (flag('--strict') && count.warning > 0) ? 1 : 0);
