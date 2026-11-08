import { describe, expect, it } from 'vitest';
import { coverMargin, NECK_TAPER_MIN, ownOffset, resolveLayers } from './coverage';
import { loadBodyData } from './glbBody.testutil';
import { classifyBody, Region } from './regions';
import { SHELL_CLASSES } from './shellClass';

const MODELS = ['male_real', 'female_real', 'chibi'] as const;
const TOPS = ['inner:hoodie', 'inner:shirt-long', 'outer:blazer', 'inner:knit'];

describe('mép cổ áo thu sát da (3 GLB thật)', () => {
  for (const model of MODELS) {
    const data = loadBodyData(model);
    const cls = classifyBody(data);
    const scale = cls.bodyHeight / 1.8;
    for (const key of TOPS) {
      const spec = SHELL_CLASSES.find((c) => c.key === key);
      if (!spec) continue;
      it(`${model} / ${key}: độ đẩy ở vòng mép cổ nhỏ hơn bên trong, và biến thiên mượt`, () => {
        const variant = { fit: 'regular' as const, tucked: false };
        const cut = coverMargin(cls, spec, variant);
        const edge: number[] = [];
        const inner: number[] = [];
        for (let v = 0; v < cls.vertexCount; v++) {
          if (cls.region[v] !== Region.torso && cls.region[v] !== Region.neck) continue;
          const dist = (spec.neckU - cls.u[v]) * (cls.yNeck - cls.yPelvis);
          const off = ownOffset(cls, spec, variant, v);
          if (Math.abs(dist) < 0.004 * scale && Math.abs(cut[v]) < 0.006 * scale) edge.push(off);
          else if (dist > 0.06 * scale && cls.region[v] === Region.torso && cut[v] > 0.04 * scale) inner.push(off);
        }
        expect(edge.length).toBeGreaterThan(0);
        expect(inner.length).toBeGreaterThan(0);
        const edgeMax = Math.max(...edge);
        const innerMin = Math.min(...inner);
        // Độ đẩy mép <= ~ NECK_TAPER_MIN+ dư của độ đẩy bên trong, và < 1,5 mm ở cỡ 1,8 m.
        expect(edgeMax).toBeLessThanOrEqual(innerMin * (NECK_TAPER_MIN + 0.3) + 1e-9);
        expect(edgeMax / scale).toBeLessThan(0.0025);
        // Độ dốc độ đẩy theo cạnh lưới (lệch pháp tuyến ~ atan(dốc)) dưới ngưỡng.
        const res = resolveLayers(cls, data.index, [{ key: 'k', spec, variant, order: spec.order }])[0];
        let worst = 0;
        for (let f = 0; f < data.index.length; f += 3) {
          for (let e = 0; e < 3; e++) {
            const a = data.index[f + e], b = data.index[f + ((e + 1) % 3)];
            const ra = cls.region[a], rb = cls.region[b];
            const nk = (r: number) => r === Region.torso || r === Region.neck;
            if (!nk(ra) || !nk(rb)) continue;
            if (!res.vertexMask[a] && !res.vertexMask[b]) continue;
            const da = (spec.neckU - cls.u[a]) * (cls.yNeck - cls.yPelvis);
            const db = (spec.neckU - cls.u[b]) * (cls.yNeck - cls.yPelvis);
            if (Math.min(da, db) > 0.04 * scale) continue;
            const pa = data.positions, L = Math.hypot(pa[a * 3] - pa[b * 3], pa[a * 3 + 1] - pa[b * 3 + 1], pa[a * 3 + 2] - pa[b * 3 + 2]);
            if (L < 1e-5) continue;
            worst = Math.max(worst, Math.abs(res.offset[a] - res.offset[b]) / L);
          }
        }
        expect(worst).toBeLessThan(0.5);
      });
    }
  }
});
