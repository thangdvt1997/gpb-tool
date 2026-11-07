import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Quét tĩnh CSS: điều khiển tương tác nào khai báo cỡ nhỏ hơn 44 px (height/width/min-height/min-width)
 * thì phải có luật trong @media (pointer: coarse) nâng cỡ đó lên >= 44 px. Không đổi giao diện máy tính.
 * Chỉ bắt khai báo px tường minh (var(--ui-touch) = 44 px tính là đạt); phần tử trang trí (icon, thanh,
 * chấm) không nằm trong danh sách tương tác.
 */
const MIN = 44;
/**
 * Đọc mọi CSS trong src bằng fs của node. Không dùng import.meta.glob ?raw vì vitest thay CSS bằng chuỗi rỗng.
 * Dự án không khai báo @types/node nên nạp động và ép kiểu tối thiểu.
 */
interface NodeFs {
  readdirSync(d: string, o: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(f: string, enc: 'utf8'): string;
}
async function loadCss(): Promise<Record<string, string>> {
  // @ts-expect-error không có kiểu cho node:fs (không cài @types/node)
  const fs = (await import('node:fs')) as NodeFs;
  const root = new URL('..', import.meta.url).pathname;
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}${e.name}/`);
      else if (e.name.endsWith('.css')) out[`${dir.slice(root.length)}${e.name}`] = fs.readFileSync(`${dir}${e.name}`, 'utf8');
    }
  };
  walk(root);
  return out;
}

/** Phần tử tương tác: thẻ gốc button/input/select/textarea/a hoặc tên lớp có các từ khóa dưới đây. */
const INTERACTIVE = /(^|[\s>+~.])(button|input|select|textarea|a)\b|(btn|button|link|chip|tab|toggle|swatch|choice|menu-item|check|search)\b/;
/** Phần tử trang trí đi kèm (biểu tượng, thanh, chấm) không phải vùng chạm. */
const DECORATIVE = /(\s(svg|i)|::before|::after|-icon|-seg|-bar|-track|-dot)\s*$/;

/**
 * Ngoại lệ có lý do. Khóa: bộ chọn đúng như trong CSS.
 */
const EXCEPTIONS: Record<string, string> = {
  // Hộp tích nằm trong nhãn/hàng danh sách đã cao >= 44 px (min-height: var(--ui-touch)); nhãn là vùng chạm.
  '.ui-check input': 'nằm trong label .ui-check cao 44 px',
  '.duel-mode input': 'nằm trong label .ui-list-item cao 44 px',
};

interface Decl {
  prop: string;
  px: number;
}
interface Rule {
  selectors: string[];
  coarse: boolean;
  decls: Decl[];
}

/** Đọc rule (kể cả lồng trong @media); coarse = nằm trong khối @media có "pointer: coarse". */
function parseRules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  const stack: boolean[] = [];
  let buf = '';
  for (const ch of src) {
    if (ch === '{') {
      const head = buf.trim();
      buf = '';
      if (head.startsWith('@')) stack.push(/pointer:\s*coarse/.test(head));
      else stack.push(false), (buf = ''), rules.push({ selectors: head.split(',').map((s) => s.trim().replace(/\s+/g, ' ')), coarse: stack.slice(0, -1).some(Boolean), decls: [] });
    } else if (ch === '}') {
      const top = rules[rules.length - 1];
      const body = buf;
      buf = '';
      const isRule = top && stack.length > 0 && top.decls.length === 0 && body.trim() !== '';
      if (isRule) top.decls = parseDecls(body);
      stack.pop();
    } else buf += ch;
  }
  return rules;
}

function parseDecls(body: string): Decl[] {
  const out: Decl[] = [];
  for (const m of body.matchAll(/(?:^|;)\s*((?:min-)?(?:height|width))\s*:\s*([^;]+)/g)) {
    const v = m[2].trim();
    const px = /^(\d+(?:\.\d+)?)px$/.exec(v);
    if (px) out.push({ prop: m[1], px: Number(px[1]) });
    else if (/--ui-touch/.test(v)) out.push({ prop: m[1], px: 44 });
  }
  return out;
}

const axis = (p: string): 'h' | 'w' => (p.endsWith('height') ? 'h' : 'w');

describe('vùng chạm 44 px trên cảm ứng (quét CSS)', () => {
  let rules: (Rule & { f: string })[] = [];
  beforeAll(async () => {
    rules = Object.entries(await loadCss()).flatMap(([f, css]) => parseRules(css).map((r) => ({ ...r, f })));
  });

  it('bộ quét thật sự đọc được luật coarse và luật thường', () => {
    expect(rules.length).toBeGreaterThan(200);
    expect(rules.some((r) => r.coarse && r.decls.length > 0)).toBe(true);
  });

  it('mọi điều khiển tương tác nhỏ hơn 44 px đều được nâng lên khi pointer: coarse', () => {
    const bad: string[] = [];
    for (const r of rules) {
      if (r.coarse) continue;
      for (const sel of r.selectors) {
        if (!INTERACTIVE.test(sel) || DECORATIVE.test(sel) || EXCEPTIONS[sel]) continue;
        for (const d of r.decls) {
          if (d.px >= MIN || d.px <= 1) continue;
          const fixed = rules.some(
            (c) => c.coarse && c.selectors.includes(sel) && c.decls.some((x) => axis(x.prop) === axis(d.prop) && x.px >= MIN),
          );
          if (!fixed) bad.push(`${r.f} ${sel} { ${d.prop}: ${d.px}px }`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('ngoại lệ đều còn tồn tại trong CSS (không để danh sách cũ)', () => {
    const all = new Set(rules.flatMap((r) => r.selectors));
    for (const k of Object.keys(EXCEPTIONS)) expect(all.has(k)).toBe(true);
  });
});
