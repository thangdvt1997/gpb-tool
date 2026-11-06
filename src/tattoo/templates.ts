/**
 * Thư viện mẫu xăm do dự án tự dựng bằng code (không dùng ảnh/SVG ngoài, không bản quyền).
 * Mỗi mẫu là tập đường gấp khúc (path vector) trong hộp [-1,1]^2, y hướng xuống như canvas.
 * `width` là bán kính nét theo đơn vị mẫu (1 = nửa cạnh mẫu); con dấu nhân với cỡ UV khi vẽ.
 * Riêng mẫu chữ ('text') vẽ bằng canvas text, xem rasterText trong raster.ts.
 */
export interface TemplatePath {
  /** [x0, y0, x1, y1, ...] */
  pts: number[];
  width: number;
}

export interface StampTemplate {
  id: string;
  name: string;
  paths: TemplatePath[];
}

export const TEXT_TEMPLATE_ID = 'text';

const TAU = Math.PI * 2;

function circle(cx: number, cy: number, r: number, width: number, n = 32, a0 = 0, a1 = TAU): TemplatePath {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return { pts, width };
}

/** Rồng uốn: thân hình sin thon dần về đuôi, đầu, gai lưng, râu. */
function dragon(): StampTemplate {
  const paths: TemplatePath[] = [];
  const N = 40;
  const body: number[][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    body.push([-0.75 + 1.5 * t, 0.45 * Math.sin(t * TAU * 1.25 + 0.4) * (1 - 0.35 * t)]);
  }
  // Thân chia thành đoạn, thon dần: đoạn gần đầu dày hơn.
  for (let i = 0; i < N; i += 4) {
    const seg = body.slice(i, i + 5).flat();
    paths.push({ pts: seg, width: 0.12 * (1 - (i / N) * 0.8) + 0.02 });
  }
  // Gai dọc lưng.
  for (let i = 2; i < N - 2; i += 3) {
    const [x, y] = body[i];
    const [x2, y2] = body[i + 1];
    const nx = -(y2 - y), ny = x2 - x;
    const l = Math.hypot(nx, ny) || 1;
    paths.push({ pts: [x, y, x + (nx / l) * 0.16, y + (ny / l) * 0.16], width: 0.03 });
  }
  // Đầu ở đầu trái: hàm và mắt.
  const [hx, hy] = body[0];
  paths.push({ pts: [hx, hy, hx - 0.2, hy - 0.08, hx - 0.32, hy + 0.02, hx - 0.18, hy + 0.1], width: 0.07 });
  paths.push(circle(hx - 0.14, hy - 0.04, 0.025, 0.03, 8));
  // Râu.
  paths.push({ pts: [hx - 0.2, hy - 0.08, hx - 0.35, hy - 0.25, hx - 0.25, hy - 0.4], width: 0.02 });
  paths.push({ pts: [hx - 0.2, hy + 0.1, hx - 0.38, hy + 0.2, hx - 0.3, hy + 0.35], width: 0.02 });
  return { id: 'dragon', name: 'Rồng uốn', paths };
}

/** Hoa văn tribal: ba mũi nhọn đối xứng dọc theo trục đứng, cùng vòng cung. */
function tribal(): StampTemplate {
  const paths: TemplatePath[] = [];
  for (const s of [-1, 1]) {
    paths.push({ pts: [0, 0.9, s * 0.35, 0.45, s * 0.55, 0, s * 0.35, -0.45, s * 0.1, -0.9], width: 0.09 });
    paths.push({ pts: [s * 0.2, 0.5, s * 0.75, 0.55, s * 0.9, 0.9], width: 0.06 });
    paths.push({ pts: [s * 0.3, -0.1, s * 0.8, -0.2, s * 0.95, -0.55], width: 0.05 });
  }
  paths.push({ pts: [0, -1, 0, 1], width: 0.07 });
  return { id: 'tribal', name: 'Hoa văn tribal', paths };
}

/** Hoa năm cánh: mỗi cánh là một vòng kín, nhuỵ ở giữa. */
function flower(): StampTemplate {
  const paths: TemplatePath[] = [];
  const petals = 5;
  for (let k = 0; k < petals; k++) {
    const a = (k / petals) * TAU - Math.PI / 2;
    const pts: number[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = (i / 20) * TAU;
      // Cánh hình giọt: bán kính theo (1 - cos) quanh trục cánh.
      const rr = 0.75 * Math.sin(t / 2);
      const px = rr * Math.sin(t) * 0.55;
      const py = rr * Math.cos(t / 2 + Math.PI) * -1;
      const ca = Math.cos(a - Math.PI / 2 + Math.PI), sa = Math.sin(a - Math.PI / 2 + Math.PI);
      pts.push(px * ca - py * sa, px * sa + py * ca);
    }
    paths.push({ pts, width: 0.035 });
  }
  paths.push(circle(0, 0, 0.12, 0.06, 16));
  return { id: 'flower', name: 'Hoa năm cánh', paths };
}

/** Hoa sen: ba lớp cánh nhọn xoè từ gốc. */
function lotus(): StampTemplate {
  const paths: TemplatePath[] = [];
  for (const [ang, len, w] of [[0, 0.95, 0.05], [0.5, 0.8, 0.045], [-0.5, 0.8, 0.045], [1.0, 0.6, 0.04], [-1.0, 0.6, 0.04]] as const) {
    const tx = Math.sin(ang) * len, ty = 0.7 - Math.cos(ang) * len * 1.5;
    const mx = Math.sin(ang) * len * 0.55, my = 0.7 - Math.cos(ang) * len * 0.8;
    paths.push({ pts: [0, 0.7, mx - 0.2, my, tx, ty, mx + 0.2, my, 0, 0.7], width: w });
  }
  paths.push({ pts: [-0.8, 0.8, 0, 0.9, 0.8, 0.8], width: 0.03 });
  return { id: 'lotus', name: 'Hoa sen', paths };
}

/** Dải sóng lặp, dùng cho cổ tay hoặc bắp tay. */
function waveBand(): StampTemplate {
  const mk = (y: number, w: number): TemplatePath => {
    const pts: number[] = [];
    for (let i = 0; i <= 48; i++) { const t = i / 48; pts.push(-1 + 2 * t, y + 0.18 * Math.sin(t * TAU * 3)); }
    return { pts, width: w };
  };
  return { id: 'wave-band', name: 'Dải sóng', paths: [mk(-0.3, 0.05), mk(0.1, 0.05), mk(0.5, 0.03)] };
}

/** Ngôi sao năm cánh trong vòng tròn. */
function starCircle(): StampTemplate {
  const pts: number[] = [];
  for (let k = 0; k <= 5; k++) {
    const a = ((k * 2) % 5) * (TAU / 5) - Math.PI / 2;
    pts.push(Math.cos(a) * 0.8, Math.sin(a) * 0.8);
  }
  return { id: 'star-circle', name: 'Sao trong vòng', paths: [circle(0, 0, 0.92, 0.04, 40), { pts, width: 0.04 }] };
}

export const STAMP_TEMPLATES: readonly StampTemplate[] = [dragon(), tribal(), flower(), lotus(), waveBand(), starCircle()];

const BY_ID = new Map(STAMP_TEMPLATES.map((t) => [t.id, t]));
export function getStampTemplate(id: string): StampTemplate | undefined {
  return BY_ID.get(id);
}
export function isKnownTemplate(id: string): boolean {
  return id === TEXT_TEMPLATE_ID || BY_ID.has(id);
}
