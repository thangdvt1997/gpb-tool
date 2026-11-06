/**
 * Adapter gộp các nguồn tĩnh trong repo thành LibraryItem[]. Các hàm nhận dữ liệu qua tham số
 * (không import trực tiếp) để test thuần; nối dữ liệu thật nằm ở sources.ts.
 */
import type { LibraryItem, LibraryKind, LibraryLicense } from './types';

/** Phần tối thiểu của manifest asset mà adapter đọc (tương thích src/assets/schema.ts). */
export interface ManifestLike {
  assets: Array<{
    assetId: string;
    type: string;
    version?: string;
    bytes?: number;
    url?: string;
    lods?: Array<{ level: number; triangles: number | null }>;
    license?: Partial<{
      spdx: string;
      source: string;
      author: string;
      attributionRequired: boolean;
      verified: boolean;
    }>;
    knownIssues?: string[];
    rigProfile?: string;
  }>;
}

export const MODELS_BASE = '/models/';

const MANIFEST_KIND: Record<string, LibraryKind> = {
  character: 'character',
  animation: 'animation',
  accessory: 'accessory',
  furniture: 'furniture',
  chair: 'furniture',
  door: 'furniture',
  drawer: 'furniture',
  prop: 'prop',
};

const TYPE_LABEL: Record<string, string> = {
  character: 'nhân vật',
  animation: 'hoạt ảnh',
  accessory: 'phụ kiện',
  furniture: 'nội thất',
  chair: 'ghế',
  door: 'cửa',
  drawer: 'ngăn kéo',
  prop: 'đạo cụ',
};

const INTERNAL_LICENSE: LibraryLicense = {
  spdx: 'LicenseRef-internal',
  source: 'Dựng bằng mã trong repo (procedural), không dùng tệp ngoài',
  attributionRequired: false,
  verified: true,
};

/** Đường dẫn an toàn: tương đối, không "..", không scheme, không bắt đầu bằng "/". */
export function isSafeRelativeUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0 || url.length > 200) return false;
  if (url.startsWith('/') || url.includes('..') || url.includes('\\')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return false;
  return /\.(glb|gltf)$/i.test(url);
}

/** Đánh dấu không dùng được nếu thiếu giấy phép. Trả về lý do. */
export function licenseProblem(lic: LibraryLicense | null): string | null {
  if (!lic) return 'Thiếu giấy phép.';
  if (!lic.spdx || !lic.spdx.trim()) return 'Thiếu mã giấy phép (SPDX).';
  if (!lic.source || !lic.source.trim()) return 'Thiếu nguồn gốc.';
  return null;
}

function finalize(item: Omit<LibraryItem, 'usable' | 'reasons' | 'warnings'> & { reasons?: string[]; warnings?: string[] }): LibraryItem {
  const reasons = [...(item.reasons ?? [])];
  const warnings = [...(item.warnings ?? [])];
  const lp = licenseProblem(item.license);
  if (lp) reasons.push(lp);
  else if (item.license && !item.license.verified) warnings.push('Giấy phép chưa được kiểm chứng.');
  return { ...item, reasons, warnings, usable: reasons.length === 0 };
}

export function fromManifest(m: ManifestLike): LibraryItem[] {
  const out: LibraryItem[] = [];
  for (const a of m.assets ?? []) {
    const reasons: string[] = [];
    const warnings: string[] = [];
    const kind = MANIFEST_KIND[a.type];
    if (!kind) reasons.push(`Loại asset "${String(a.type)}" không được hỗ trợ.`);
    let file: string | null = null;
    if (isSafeRelativeUrl(a.url)) file = MODELS_BASE + a.url;
    else reasons.push('Đường dẫn tệp không hợp lệ (phải tương đối, .glb/.gltf, không có "..").');
    const lic: LibraryLicense | null = a.license
      ? {
          spdx: a.license.spdx ?? '',
          source: a.license.source ?? '',
          author: a.license.author,
          attributionRequired: a.license.attributionRequired === true,
          verified: a.license.verified === true,
        }
      : null;
    const lod0 = a.lods?.find((l) => l.level === 0) ?? a.lods?.[0];
    const tri = lod0 && typeof lod0.triangles === 'number' && Number.isFinite(lod0.triangles) ? lod0.triangles : null;
    for (const k of a.knownIssues ?? []) warnings.push(k);
    const tags = [a.type, ...(a.rigProfile ? [a.rigProfile] : [])];
    out.push(
      finalize({
        id: a.assetId,
        kind: kind ?? 'prop',
        name: a.assetId,
        description: `Asset ${TYPE_LABEL[a.type] ?? a.type} trong manifest.`,
        tags,
        license: lic,
        file,
        bytes: typeof a.bytes === 'number' && Number.isFinite(a.bytes) ? a.bytes : null,
        triangles: tri,
        version: a.version ?? null,
        source: 'manifest',
        reasons,
        warnings,
      }),
    );
  }
  return out;
}

/** Phần tối thiểu của GarmentDef. */
export interface GarmentLike {
  id: string;
  name: string;
  description: string;
  group: string;
  kind: string;
  styles: readonly string[];
}

export function fromGarments(list: readonly GarmentLike[], groupLabels: Readonly<Record<string, string>>, styleLabels: Readonly<Record<string, string>>): LibraryItem[] {
  return list.map((g) =>
    finalize({
      id: `garment.${g.id}`,
      kind: 'outfit',
      name: g.name,
      description: g.description,
      tags: [g.group, g.kind, groupLabels[g.group] ?? g.group, ...g.styles, ...g.styles.map((s) => styleLabels[s] ?? s)],
      license: INTERNAL_LICENSE,
      file: null,
      bytes: null,
      triangles: null,
      version: null,
      source: 'fashion-catalog',
    }),
  );
}

export interface AccessoryLike {
  id: string;
  name: string;
  slot: string;
  styles: readonly string[];
}

export function fromAccessories(list: readonly AccessoryLike[], slotLabels: Readonly<Record<string, string>>, styleLabels: Readonly<Record<string, string>>): LibraryItem[] {
  return list.map((a) =>
    finalize({
      id: `accessory.${a.id}`,
      kind: 'accessory',
      name: a.name,
      description: `Phụ kiện: ${slotLabels[a.slot] ?? a.slot}.`,
      tags: [a.slot, slotLabels[a.slot] ?? a.slot, ...a.styles, ...a.styles.map((s) => styleLabels[s] ?? s)],
      license: INTERNAL_LICENSE,
      file: null,
      bytes: null,
      triangles: null,
      version: null,
      source: 'accessory-catalog',
    }),
  );
}

export interface PropSpotLike {
  kind: string;
}

const PROP_INFO: Record<string, { name: string; kind: LibraryKind; tags: string[] }> = {
  fire: { name: 'Bình chữa cháy', kind: 'prop', tags: ['an toàn', 'tường'] },
  water: { name: 'Máy nước uống', kind: 'furniture', tags: ['pantry', 'tiện ích'] },
  cabinet: { name: 'Tủ hồ sơ', kind: 'furniture', tags: ['lưu trữ', 'tủ'] },
  plant: { name: 'Chậu cây', kind: 'prop', tags: ['cây', 'trang trí'] },
  bin: { name: 'Thùng rác', kind: 'prop', tags: ['vệ sinh'] },
  tv: { name: 'TV treo tường', kind: 'prop', tags: ['màn hình', 'trình chiếu'] },
  lowcab: { name: 'Tủ thấp hai cánh', kind: 'furniture', tags: ['lưu trữ', 'gỗ sáng'] },
};

/** Gộp các vị trí đạo cụ theo loại: mỗi loại thành một mục, ghi số vị trí đang dùng trong layout. */
export function fromPropSpots(spots: readonly PropSpotLike[]): LibraryItem[] {
  const counts = new Map<string, number>();
  for (const s of spots) counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
  const out: LibraryItem[] = [];
  for (const [k, n] of counts) {
    const info = PROP_INFO[k] ?? { name: k, kind: 'prop' as LibraryKind, tags: [] };
    out.push(
      finalize({
        id: `prop.${k}`,
        kind: info.kind,
        name: info.name,
        description: `Đạo cụ văn phòng dựng bằng mã, đang đặt tại ${n} vị trí trong layout.`,
        tags: [k, ...info.tags],
        license: INTERNAL_LICENSE,
        file: null,
        bytes: null,
        triangles: null,
        version: null,
        source: 'office-props',
      }),
    );
  }
  return out;
}

export interface MergeResult {
  items: LibraryItem[];
  /** id bị trùng. */
  duplicates: string[];
}

/**
 * Gộp nhiều nguồn. ID trùng: giữ mục đầu tiên, các mục sau bị loại khỏi danh sách và mục giữ lại
 * bị đánh dấu không dùng được (tránh tham chiếu mơ hồ).
 */
export function mergeItems(...lists: LibraryItem[][]): MergeResult {
  const seen = new Map<string, LibraryItem>();
  const dups = new Set<string>();
  for (const l of lists) {
    for (const it of l) {
      const prev = seen.get(it.id);
      if (!prev) {
        seen.set(it.id, it);
      } else {
        dups.add(it.id);
      }
    }
  }
  const items = [...seen.values()].map((it) =>
    dups.has(it.id) ? { ...it, usable: false, reasons: [...it.reasons, `ID trùng với mục khác trong thư viện: ${it.id}.`] } : it,
  );
  return { items, duplicates: [...dups] };
}
