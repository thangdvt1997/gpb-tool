import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GARMENTS, getGarment } from '../../fashion/catalog';
import { cloneLook, makeDefaultLook, wear } from '../../fashion/defaults';
import { PRESETS } from '../../fashion/presets';
import { BODY_MORPH_NAMES, deriveBodyMorphWeights, writeBodyMorphs } from './bodyMorphs';
import { coverVertices, hiddenSkinTriangles, resolveLayers, selectTriangles, visibleSkinIndex, type PieceInput } from './coverage';
import { compatibilityMatrix, garmentSupport, proposeFitChange, proposeGarment, proposeTuck, checkOutfit, hasBlockingIssue } from './compat';
import { makeFakeBody } from './fakeBody.testutil';
import { loadBodyData } from './glbBody.testutil';
import { hashArray, RefPool } from './pool';
import { planOutfit } from './plan';
import { Region, boneRegion, classifyBody } from './regions';
import { SHELL_CLASSES, shellClassOf, type ShellClass } from './shellClass';
import {
  createShellMaterial,
  deriveGeometry,
  geometryPool,
  setShellZoneColors,
  shellGeometryKey,
} from './threeShell';
import { vertexZones, ZONE_LIST, resolveZoneColor } from './zones';

const spec = (key: string): ShellClass => {
  const s = SHELL_CLASSES.find((c) => c.key === key);
  if (!s) throw new Error(key);
  return s;
};
const piece = (key: string, slotKey: string, over: Partial<PieceInput> = {}): PieceInput => ({
  key: slotKey,
  spec: spec(key),
  variant: { fit: 'regular', tucked: false },
  order: spec(key).order,
  ...over,
});

describe('regions: phân vùng theo xương', () => {
  it('ánh xạ tên xương sang vùng và bên', () => {
    expect(boneRegion('upperarm_l')).toEqual({ region: Region.upperArm, side: 1 });
    expect(boneRegion('index_02_r')).toEqual({ region: Region.hand, side: 2 });
    expect(boneRegion('ball_l').region).toBe(Region.foot);
    expect(boneRegion('spine_02').region).toBe(Region.torso);
    expect(boneRegion('clavicle_r').region).toBe(Region.torso);
    expect(boneRegion('Root').region).toBe(Region.other);
  });

  it('thân giả: t dọc chi và u theo độ cao', () => {
    const cls = classifyBody(makeFakeBody());
    let sawUpper = false;
    for (let v = 0; v < cls.vertexCount; v++) {
      if (cls.region[v] === Region.upperArm) {
        sawUpper = true;
        expect(cls.t[v]).toBeGreaterThanOrEqual(-0.4);
        expect(cls.t[v]).toBeLessThanOrEqual(1.4);
      }
    }
    expect(sawUpper).toBe(true);
    // u: 0 ở xương chậu, 1 ở gốc cổ
    expect(cls.yPelvis).toBeCloseTo(1.0, 5);
    expect(cls.yNeck).toBeCloseTo(1.6, 5);
  });

  it('mọi mesh thật: cả 3 tệp có đủ vùng, tổng đỉnh khớp', () => {
    for (const m of ['male_real', 'female_real', 'chibi'] as const) {
      const cls = classifyBody(loadBodyData(m));
      expect(cls.vertexCount).toBe(14517);
      const count = new Map<number, number>();
      for (let v = 0; v < cls.vertexCount; v++) count.set(cls.region[v], (count.get(cls.region[v]) ?? 0) + 1);
      for (const r of [Region.head, Region.torso, Region.pelvis, Region.upperArm, Region.foreArm, Region.hand, Region.thigh, Region.calf, Region.foot]) {
        expect(count.get(r) ?? 0).toBeGreaterThan(100);
      }
    }
  });
});

describe('shellClass: bảng lớp vỏ', () => {
  it('mọi món trong catalog (56) có lớp vỏ, mũ không dựng vỏ', () => {
    expect(GARMENTS.length).toBe(56);
    for (const g of GARMENTS) {
      const c = shellClassOf(g);
      expect(c, g.id).toBeDefined();
      if (g.group === 'hat') expect(c?.part).toBeNull();
      else expect(c?.part).not.toBeNull();
    }
  });
});

describe('coverage: vùng che theo loại món (thân giả)', () => {
  const data = makeFakeBody();
  const cls = classifyBody(data);
  const reg = (mask: Uint8Array, r: number) => {
    let n = 0;
    for (let v = 0; v < cls.vertexCount; v++) if (mask[v] && cls.region[v] === r) n++;
    return n;
  };
  const total = (r: number) => {
    let n = 0;
    for (let v = 0; v < cls.vertexCount; v++) if (cls.region[v] === r) n++;
    return n;
  };

  it('áo ngắn tay che tay trên, không che cẳng tay, đầu, bàn tay', () => {
    const m = coverVertices(cls, spec('inner:tee'), { fit: 'regular', tucked: false });
    expect(reg(m, Region.upperArm)).toBeGreaterThan(0);
    expect(reg(m, Region.upperArm)).toBeLessThan(total(Region.upperArm));
    expect(reg(m, Region.foreArm)).toBe(0);
    expect(reg(m, Region.head)).toBe(0);
    expect(reg(m, Region.hand)).toBe(0);
  });

  it('áo dài tay che cả tay trên và cẳng tay nhưng không che bàn tay', () => {
    const m = coverVertices(cls, spec('inner:shirt-long'), { fit: 'regular', tucked: false });
    expect(reg(m, Region.upperArm)).toBe(total(Region.upperArm));
    expect(reg(m, Region.foreArm)).toBeGreaterThan(0);
    expect(reg(m, Region.hand)).toBe(0);
  });

  it('phom rộng kéo dài tay áo hơn phom thường', () => {
    const a = coverVertices(cls, spec('inner:tee'), { fit: 'regular', tucked: false });
    const b = coverVertices(cls, spec('inner:tee'), { fit: 'oversized', tucked: false });
    expect(reg(b, Region.upperArm)).toBeGreaterThanOrEqual(reg(a, Region.upperArm));
    let sa = 0;
    let sb = 0;
    for (let v = 0; v < cls.vertexCount; v++) {
      sa += a[v];
      sb += b[v];
    }
    expect(sb).toBeGreaterThanOrEqual(sa);
  });

  it('quần dài che đùi và cẳng chân, không che thân trên; quần short chừa cẳng chân', () => {
    const long = coverVertices(cls, spec('bottom:trousers'), { fit: 'regular', tucked: false });
    const short = coverVertices(cls, spec('bottom:shorts'), { fit: 'regular', tucked: false });
    expect(reg(long, Region.calf)).toBeGreaterThan(0);
    expect(reg(short, Region.calf)).toBe(0);
    expect(reg(short, Region.thigh)).toBeLessThan(reg(long, Region.thigh));
    for (const m of [long, short]) {
      expect(reg(m, Region.upperArm)).toBe(0);
      expect(reg(m, Region.head)).toBe(0);
    }
  });

  it('giày che bàn chân; vùng da khác không bị đụng', () => {
    const m = coverVertices(cls, spec('shoes:sneaker'), { fit: 'regular', tucked: false });
    expect(reg(m, Region.foot)).toBe(total(Region.foot));
    expect(reg(m, Region.thigh)).toBe(0);
    expect(reg(m, Region.torso)).toBe(0);
  });

  it('mũ không có vỏ: mặt nạ rỗng', () => {
    const m = coverVertices(cls, spec('hat:cap'), { fit: 'regular', tucked: false });
    expect(m.every((x) => x === 0)).toBe(true);
  });

  it('cổ: áo cổ thường không che cổ, cổ lọ (knit) có che', () => {
    const crew = coverVertices(cls, spec('inner:tee'), { fit: 'regular', tucked: false });
    const knit = coverVertices(cls, spec('inner:knit'), { fit: 'regular', tucked: false });
    expect(reg(crew, Region.neck)).toBe(0);
    expect(reg(knit, Region.neck)).toBeGreaterThan(0);
  });

  it('selectTriangles chỉ lấy tam giác đủ ba đỉnh được che', () => {
    const m = coverVertices(cls, spec('inner:tee'), { fit: 'regular', tucked: false });
    const sel = selectTriangles(data.index, m);
    for (let i = 0; i < sel.index.length; i++) expect(m[sel.index[i]]).toBe(1);
    expect(sel.index.length / 3).toBe(sel.triMask.reduce((a, b) => a + b, 0));
  });
});

describe('coverage: xếp lớp chống xuyên', () => {
  const data = loadBodyData('male_real');
  const cls = classifyBody(data);

  it('áo ngoài luôn nằm ngoài áo trong tại mọi đỉnh chung', () => {
    const [inner, outer] = resolveLayers(cls, data.index, [piece('inner:shirt-long', 'inner'), piece('outer:blazer', 'outer')]);
    let shared = 0;
    for (let v = 0; v < cls.vertexCount; v++) {
      if (inner.vertexMask[v] && outer.vertexMask[v]) {
        shared++;
        expect(outer.offset[v]).toBeGreaterThan(inner.offset[v]);
      }
    }
    expect(shared).toBeGreaterThan(1000);
  });

  it('tất < giày < quần: giày nằm ngoài tất, quần phủ ngoài giày ở cổ chân', () => {
    const [socks, shoes, pants] = resolveLayers(cls, data.index, [
      piece('socks:crew', 'socks'),
      piece('shoes:sneaker', 'shoes'),
      piece('bottom:trousers', 'bottom'),
    ]);
    for (let v = 0; v < cls.vertexCount; v++) {
      if (socks.vertexMask[v] && shoes.vertexMask[v]) expect(shoes.offset[v]).toBeGreaterThan(socks.offset[v]);
      if (shoes.vertexMask[v] && pants.vertexMask[v]) expect(pants.offset[v]).toBeGreaterThan(shoes.offset[v]);
    }
  });

  it('thả áo: áo ở ngoài quần; sơ vin: áo dưới quần', () => {
    const free = resolveLayers(cls, data.index, [
      piece('bottom:trousers', 'bottom'),
      piece('inner:shirt-long', 'inner', { variant: { fit: 'regular', tucked: false } }),
    ]);
    const tucked = resolveLayers(cls, data.index, [
      piece('bottom:trousers', 'bottom'),
      piece('inner:shirt-long', 'inner', { variant: { fit: 'regular', tucked: true }, order: 25 }),
    ]);
    let checkedFree = 0;
    let checkedTuck = 0;
    for (let v = 0; v < cls.vertexCount; v++) {
      if (free[0].vertexMask[v] && free[1].vertexMask[v]) {
        checkedFree++;
        expect(free[1].offset[v]).toBeGreaterThan(free[0].offset[v]);
      }
      if (tucked[0].vertexMask[v] && tucked[1].vertexMask[v]) {
        checkedTuck++;
        expect(tucked[0].offset[v]).toBeGreaterThan(tucked[1].offset[v]);
      }
    }
    expect(checkedFree).toBeGreaterThan(0);
    expect(checkedTuck).toBeGreaterThan(0);
  });

  it('kết quả không phụ thuộc thứ tự đầu vào (đổi đồ nhiều lần không sai lớp)', () => {
    const a = [piece('inner:tee', 'inner'), piece('bottom:jeans', 'bottom'), piece('outer:bomber', 'outer'), piece('shoes:boots', 'shoes')];
    const b = [a[3], a[2], a[1], a[0]];
    const ra = resolveLayers(cls, data.index, a);
    const rb = resolveLayers(cls, data.index, b);
    const byKey = (rs: typeof ra) => Object.fromEntries(rs.map((r) => [r.key, hashArray(r.offset, 1e6) + hashArray(r.index)]));
    expect(byKey(ra)).toEqual(byKey(rb));
  });

  it('thay rồi mặc lại bộ cũ cho đúng mặt nạ da cũ (không mất body mask)', () => {
    const triCount = data.index.length / 3;
    const setA = [piece('inner:polo', 'inner'), piece('bottom:chinos', 'bottom'), piece('shoes:loafer', 'shoes')];
    const setB = [piece('inner:hoodie', 'inner'), piece('bottom:shorts', 'bottom')];
    const mask = (s: PieceInput[]) => hashArray(hiddenSkinTriangles(triCount, resolveLayers(cls, data.index, s)));
    const m1 = mask(setA);
    for (let i = 0; i < 20; i++) {
      mask(i % 2 ? setA : setB);
    }
    expect(mask(setA)).toBe(m1);
    expect(mask(setB)).not.toBe(m1);
  });

  it('da bị ẩn chỉ nằm trong vùng thân/tay/chân; đầu, bàn tay luôn còn', () => {
    const results = resolveLayers(cls, data.index, [
      piece('inner:shirt-long', 'inner'),
      piece('bottom:trousers', 'bottom'),
      piece('outer:blazer', 'outer'),
      piece('shoes:boots', 'shoes'),
    ]);
    const hidden = hiddenSkinTriangles(data.index.length / 3, results);
    let hiddenCount = 0;
    for (let f = 0; f < hidden.length; f++) {
      if (!hidden[f]) continue;
      hiddenCount++;
      for (let k = 0; k < 3; k++) {
        const r = cls.region[data.index[f * 3 + k]];
        expect([Region.head, Region.hand, Region.other]).not.toContain(r);
      }
    }
    expect(hiddenCount).toBeGreaterThan(5000);
    const vis = visibleSkinIndex(data.index, hidden);
    expect(vis.length).toBe((hidden.length - hiddenCount) * 3);
  });

  it('áo ngắn tay để lộ cẳng tay: da cẳng tay không bị ẩn', () => {
    const [tee] = resolveLayers(cls, data.index, [piece('inner:tee', 'inner')]);
    for (let f = 0; f < tee.triMask.length; f++) {
      if (!tee.triMask[f]) continue;
      for (let k = 0; k < 3; k++) expect(cls.region[data.index[f * 3 + k]]).not.toBe(Region.foreArm);
    }
  });

  it('phom: slim < regular < oversized về độ đẩy; độ dày co theo cỡ mesh', () => {
    const off = (fit: 'slim' | 'regular' | 'oversized', d = data, c = cls) => {
      const r = resolveLayers(c, d.index, [piece('inner:shirt-long', 'inner', { variant: { fit, tucked: false } })])[0];
      let best = 0;
      for (let v = 0; v < c.vertexCount; v++) if (cls.region[v] === Region.torso && r.vertexMask[v]) best = Math.max(best, r.offset[v]);
      return best;
    };
    expect(off('slim')).toBeGreaterThan(0);
    expect(off('regular')).toBeGreaterThan(off('slim'));
    expect(off('oversized')).toBeGreaterThan(off('regular'));
    const chibi = loadBodyData('chibi');
    const cc = classifyBody(chibi);
    expect(off('regular', chibi, cc)).toBeLessThan(off('regular') * 0.6);
  });

  it('mọi lớp có độ đẩy dương ở đỉnh được che (không nằm trong da)', () => {
    const all = SHELL_CLASSES.filter((c) => c.part);
    for (const c of all) {
      const r = resolveLayers(cls, data.index, [piece(c.key, 'x')])[0];
      for (let v = 0; v < cls.vertexCount; v++) if (r.vertexMask[v]) expect(r.offset[v], c.key).toBeGreaterThan(0.0005);
    }
  });
});

describe('zones: vùng màu', () => {
  const data = loadBodyData('male_real');
  const cls = classifyBody(data);
  it('áo có vùng thân, tay, cổ, gấu', () => {
    const z = vertexZones(cls, spec('inner:shirt-long'), data.normals);
    const names = new Set<string>();
    const m = coverVertices(cls, spec('inner:shirt-long'), { fit: 'regular', tucked: false });
    for (let v = 0; v < cls.vertexCount; v++) if (m[v]) names.add(ZONE_LIST[z[v]]);
    for (const n of ['body', 'sleeve', 'cuff', 'collar', 'hem']) expect(names.has(n), n).toBe(true);
  });
  it('giày có đế, mũi, upper', () => {
    const z = vertexZones(cls, spec('shoes:sneaker'), data.normals);
    const m = coverVertices(cls, spec('shoes:sneaker'), { fit: 'regular', tucked: false });
    const names = new Set<string>();
    for (let v = 0; v < cls.vertexCount; v++) if (m[v]) names.add(ZONE_LIST[z[v]]);
    for (const n of ['sole', 'toe', 'upper']) expect(names.has(n), n).toBe(true);
  });
  it('thay thế vùng màu khi món không có vùng đó', () => {
    expect(resolveZoneColor({ leg: '#111111' }, 'waistband')).toBe('#111111');
    expect(resolveZoneColor({ body: '#222222', sleeve: '#333333' }, 'cuff')).toBe('#333333');
    expect(resolveZoneColor({}, 'body')).toMatch(/^#/);
  });
});

describe('plan: kế hoạch dựng từ look', () => {
  it('bộ mặc định có 4 món dựng được và thứ tự lớp đúng', () => {
    const plan = planOutfit(makeDefaultLook());
    const slots = plan.pieces.map((p) => p.slot).sort();
    expect(slots).toEqual(['bottom', 'inner', 'shoes', 'socks']);
    const byOrder = [...plan.pieces].sort((a, b) => a.order - b.order).map((p) => p.slot);
    expect(byOrder.indexOf('socks')).toBeLessThan(byOrder.indexOf('shoes'));
    expect(byOrder.indexOf('shoes')).toBeLessThan(byOrder.indexOf('bottom'));
    expect(byOrder.indexOf('bottom')).toBeLessThan(byOrder.indexOf('inner'));
  });
  it('sơ vin đưa áo xuống dưới quần; áo ngoài và mũ: mũ vào danh sách bỏ qua', () => {
    const look = makeDefaultLook();
    look.outfit.inner = wear('inner-tee', { tucked: true });
    look.outfit.outer = wear('outer-blazer');
    look.outfit.hat = wear('hat-cap');
    const plan = planOutfit(look);
    const inner = plan.pieces.find((p) => p.slot === 'inner');
    const bottom = plan.pieces.find((p) => p.slot === 'bottom');
    expect(inner?.variant.tucked).toBe(true);
    expect((inner?.order ?? 99) < (bottom?.order ?? 0)).toBe(true);
    expect(plan.skipped.map((s) => s.slot)).toEqual(['hat']);
  });
  it('mọi bộ mẫu (hai kiểu) lập được kế hoạch, không bỏ qua món nào', () => {
    for (const p of PRESETS) {
      const plan = planOutfit(p.look);
      expect(plan.skipped, p.id).toEqual([]);
      expect(plan.pieces.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('compat: ma trận và đề xuất', () => {
  it('ma trận phủ 56 món; mũ hỗ trợ (mesh gắn xương); váy/đầm hạn chế', () => {
    const rows = compatibilityMatrix();
    expect(rows.length).toBe(56);
    expect(rows.filter((r) => r.group === 'hat').every((r) => r.realistic === 'supported' && r.chibi === 'supported')).toBe(true);
    expect(rows.find((r) => r.garmentId === 'bottom-skirt-office')?.realistic).toBe('limited');
    expect(rows.find((r) => r.garmentId === 'inner-tee')?.realistic).toBe('supported');
  });

  it('cổ lọ trên chibi là hạn chế, trên người thật là hỗ trợ', () => {
    const def = getGarment('inner-turtleneck');
    expect(def).toBeDefined();
    if (!def) return;
    expect(garmentSupport(def, 'realistic').level).toBe('supported');
    expect(garmentSupport(def, 'chibi').level).toBe('limited');
  });

  it('mặc mũ được chấp nhận (mũ là mesh procedural, không cần vỏ thân)', () => {
    const prev = makeDefaultLook();
    const p = proposeGarment(prev, 'hat', 'hat-cap');
    expect(p.status).toBe('ok');
    expect(p.look.outfit.hat?.garmentId).toBe('hat-cap');
  });

  it('mặc nhầm slot và món lạ bị từ chối', () => {
    const prev = makeDefaultLook();
    expect(proposeGarment(prev, 'shoes', 'inner-tee').status).toBe('rejected');
    expect(proposeGarment(prev, 'shoes', 'khong-co').status).toBe('rejected');
  });

  it('mặc đầm khi đang có áo và quần: cần xác nhận, báo món bị cởi, chưa áp', () => {
    const prev = makeDefaultLook();
    const p = proposeGarment(prev, 'onePiece', 'onepiece-dress-office');
    expect(p.status).toBe('needs-confirm');
    expect(p.removed.sort()).toEqual(['bottom', 'inner']);
    expect(prev.outfit.bottom).not.toBeNull();
    expect(p.look.outfit.onePiece?.garmentId).toBe('onepiece-dress-office');
  });

  it('đổi món bình thường là ok và giữ phom nếu món mới cho phép', () => {
    const prev = makeDefaultLook();
    const withSlim = proposeFitChange(prev, 'inner', 'slim');
    expect(withSlim.status === 'ok' || withSlim.status === 'rejected').toBe(true);
    const p = proposeGarment(prev, 'outer', 'outer-blazer');
    expect(p.status).toBe('ok');
    expect(p.look.outfit.outer?.garmentId).toBe('outer-blazer');
  });

  it('phom ôm bị từ chối khi bụng vượt ngưỡng; gợi ý phom thường', () => {
    const prev = makeDefaultLook();
    prev.body.torso.belly = 0.9;
    const p = proposeFitChange(prev, 'inner', 'slim');
    expect(p.status).toBe('rejected');
    expect(p.issues[0].code).toBe('fit_body');
    expect(p.issues[0].suggestFit).toBeDefined();
  });

  it('sơ vin bị từ chối khi bụng lớn; áo không sơ vin được cũng bị từ chối', () => {
    const prev = makeDefaultLook();
    prev.outfit.inner = wear('inner-tee');
    expect(proposeTuck(prev, true).status).toBe('ok');
    prev.body.torso.belly = 0.9;
    expect(proposeTuck(prev, true).status).toBe('rejected');
    const hood = makeDefaultLook();
    hood.outfit.inner = wear('inner-hoodie');
    expect(proposeTuck(hood, true).status).toBe('rejected');
  });

  it('áo ngoài ôm trên áo trong dày là lỗi lớp', () => {
    const look = makeDefaultLook();
    look.outfit.inner = wear('inner-hoodie');
    look.outfit.outer = wear('outer-blazer', { fit: 'slim' });
    const issues = checkOutfit(look);
    expect(issues.some((i) => i.code === 'layer_fit' && i.severity === 'error')).toBe(true);
    expect(hasBlockingIssue(issues)).toBe(true);
    const thin = makeDefaultLook();
    thin.outfit.outer = wear('outer-blazer', { fit: 'slim' });
    expect(hasBlockingIssue(checkOutfit(thin))).toBe(false);
  });

  it('6 bộ mẫu không có lỗi chặn ở cả hai kiểu tạo hình', () => {
    for (const p of PRESETS) {
      expect(hasBlockingIssue(checkOutfit(p.look)), p.id).toBe(false);
      const chibi = cloneLook(p.look);
      chibi.bodyStyle = 'chibi';
      expect(hasBlockingIssue(checkOutfit(chibi)), `${p.id} chibi`).toBe(false);
    }
  });
});

describe('bodyMorphs: ánh xạ hình thể sang morph', () => {
  it('mặc định mọi morph về 0', () => {
    const w = deriveBodyMorphWeights(makeDefaultLook());
    for (const n of BODY_MORPH_NAMES) expect(w[n]).toBe(0);
  });
  it('trường theo từng nửa trục: eo to và bụng âm không có morph', () => {
    const l = makeDefaultLook();
    l.body.torso.waist = 0.8;
    l.body.torso.belly = -0.8;
    const w = deriveBodyMorphWeights(l);
    expect(w.bodyWaistSlim).toBe(0);
    expect(w.bodyBelly).toBe(0);
    l.body.torso.waist = -0.5;
    expect(deriveBodyMorphWeights(l).bodyWaistSlim).toBeCloseTo(0.5, 5);
  });
  it('thanh tổng hợp cộng vào morph thật và kẹp 1', () => {
    const l = makeDefaultLook();
    l.body.muscle = 1;
    l.body.bodyFat = 1;
    l.body.torso.belly = 1;
    const w = deriveBodyMorphWeights(l);
    expect(w.chestMuscle).toBeCloseTo(0.6, 5);
    expect(w.bodyShouldersV).toBeCloseTo(0.35, 5);
    expect(w.bodyBelly).toBe(1);
  });
  it('writeBodyMorphs bỏ qua morph thiếu và mảng thiếu', () => {
    const infl = [0, 0, 0];
    const n = writeBodyMorphs(infl, { bodyBelly: 1, headFat: 2, khac: 0 }, { bodyShouldersV: 0, bodyWaistSlim: 0, bodyHipsWide: 0, bodyBelly: 0.7, chestMuscle: 0, headFat: 0.2 });
    expect(n).toBe(2);
    expect(infl).toEqual([0, 0.7, 0.2]);
    expect(writeBodyMorphs(undefined, {}, deriveBodyMorphWeights(makeDefaultLook()))).toBe(0);
  });
});

describe('pool: sở hữu tài nguyên', () => {
  it('dùng chung và chỉ dispose khi hết người giữ', () => {
    let disposed = 0;
    const pool = new RefPool<{ dispose(): void }>();
    const a = pool.acquire('k', () => ({ dispose: () => disposed++ }));
    const b = pool.acquire('k', () => ({ dispose: () => disposed++ }));
    expect(a).toBe(b);
    expect(pool.refs('k')).toBe(2);
    expect(pool.release('k')).toBe(false);
    expect(disposed).toBe(0);
    expect(pool.release('k')).toBe(true);
    expect(disposed).toBe(1);
    expect(pool.release('k')).toBe(false);
    expect(pool.size).toBe(0);
  });
  it('hashArray ổn định và phân biệt nội dung', () => {
    expect(hashArray([1, 2, 3])).toBe(hashArray([1, 2, 3]));
    expect(hashArray([1, 2, 3])).not.toBe(hashArray([1, 2, 4]));
  });
  it('đổi đồ 200 lần rồi cởi hết: kho geometry về 0, không tăng vô hạn', () => {
    const base = new THREE.BufferGeometry();
    base.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const before = geometryPool.size;
    const held: string[] = [];
    for (let i = 0; i < 200; i++) {
      const idx = Uint32Array.from([0, 1, i % 3]);
      const off = new Float32Array(3).fill(0.001 * ((i % 4) + 1));
      const key = shellGeometryKey(base.uuid, 'x', idx, off);
      geometryPool.acquire(key, () => deriveGeometry(base, idx, { offset: off, zone: new Uint8Array(3) }));
      held.push(key);
      if (held.length > 3) geometryPool.release(held.shift() as string);
    }
    expect(geometryPool.size - before).toBeLessThanOrEqual(3);
    for (const k of held) geometryPool.release(k);
    expect(geometryPool.size).toBe(before);
  });
});

describe('threeShell: geometry và vật liệu vỏ', () => {
  it('deriveGeometry dùng chung attribute và morph với geometry gốc, chỉ riêng index', () => {
    const base = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(12), 3);
    base.setAttribute('position', pos);
    base.morphAttributes.position = [new THREE.BufferAttribute(new Float32Array(12), 3)];
    const g = deriveGeometry(base, Uint32Array.from([0, 1, 2]), { offset: new Float32Array(4), zone: new Uint8Array(4) });
    expect(g.getAttribute('position')).toBe(pos);
    expect(g.morphAttributes).toBe(base.morphAttributes);
    expect(g.getIndex()?.count).toBe(3);
    expect(g.getAttribute('aOff')).toBeDefined();
    expect(base.getIndex()).toBeNull();
  });
  it('vật liệu vỏ có polygonOffset theo lớp và nhận màu vùng', () => {
    const m0 = createShellMaterial(0);
    const m2 = createShellMaterial(2);
    expect(m2.polygonOffsetFactor).toBeLessThan(m0.polygonOffsetFactor);
    setShellZoneColors(m0, ZONE_LIST.map(() => '#ff0000'));
    const colors = m0.userData.zoneColors as THREE.Color[];
    expect(colors[0].r).toBeGreaterThan(0.9);
    expect(colors[0].g).toBeLessThan(0.1);
    m0.dispose();
    m2.dispose();
  });
});
