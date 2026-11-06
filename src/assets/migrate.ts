/**
 * Chuyển dữ liệu asset kiểu cũ sang manifest schemaVersion 1.
 *
 * Trạng thái repo ngày 2026-11-06: chưa có manifest asset cũ nào. Định dạng cũ duy nhất được mô tả là
 * `SOURCE.json` trong docs/design/ASSET_SOURCES.md mục 5 (source_url, author, license, license_url,
 * checked_at, sha256, zones). Hàm dưới đây chuyển định dạng đó và một mảng mục cũ dạng tự do.
 *
 * Nguyên tắc: không bịa số đo. Trường không suy ra được thì bỏ trống và liệt kê trong `missing`,
 * để validateManifest() báo lỗi rõ. Bố trí văn phòng nằm ở src/content/zones/*.json và không đi qua
 * manifest, nên việc chuyển manifest không thay đổi tọa độ vật thể.
 * Chưa kiểm chứng trên dữ liệu thật vì chưa có file cũ.
 */
import type { AssetEntry, AssetManifest, AssetType, LicenseInfo } from './schema';

/** Định dạng SOURCE.json theo ASSET_SOURCES.md mục 5. */
export interface LegacySourceJson {
  source_url?: string;
  author?: string;
  license?: string;
  license_url?: string;
  checked_at?: string;
  sha256?: string;
  zones?: string[];
}

/** Mục cũ dạng tự do (ví dụ danh sách tay). */
export interface LegacyAssetItem extends LegacySourceJson {
  id?: string;
  assetId?: string;
  type?: string;
  file?: string;
  path?: string;
  url?: string;
  scale?: number;
}

export interface MigrationReport {
  manifest: AssetManifest;
  /** Mỗi dòng: "<assetId>: <trường thiếu>". */
  missing: string[];
  /** Ghi chú chuyển đổi (đổi tên trường, chuẩn hóa license). */
  notes: string[];
}

const LICENSE_TO_SPDX: Record<string, string> = {
  'cc0': 'CC0-1.0',
  'cc0 1.0': 'CC0-1.0',
  'cc0-1.0': 'CC0-1.0',
  'cc by 4.0': 'CC-BY-4.0',
  'cc-by-4.0': 'CC-BY-4.0',
  'cc by': 'CC-BY-4.0',
  'ofl': 'OFL-1.1',
  'ofl-1.1': 'OFL-1.1',
  'mit': 'MIT',
};

function toSpdx(raw: string | undefined, notes: string[], id: string): string {
  if (!raw) return '';
  const k = raw.trim().toLowerCase();
  const v = LICENSE_TO_SPDX[k];
  if (v && v !== raw) notes.push(`${id}: license "${raw}" -> "${v}"`);
  return v ?? raw;
}

/** Chuyển một mục cũ. Trả về entry thiếu trường (không điền giá trị giả). */
export function migrateLegacyItem(item: LegacyAssetItem, index: number, missing: string[], notes: string[]): AssetEntry {
  const id = item.assetId ?? item.id ?? `legacy.item_${index}`;
  if (!item.assetId && !item.id) missing.push(`${id}: assetId (đã đặt tạm, phải đổi trước khi dùng)`);
  const url = item.url ?? item.file ?? item.path ?? '';
  if (!url) missing.push(`${id}: url`);
  if (item.file || item.path) notes.push(`${id}: ${item.file ? 'file' : 'path'} -> url`);
  const type = (item.type ?? '') as AssetType;
  if (!item.type) missing.push(`${id}: type`);

  const spdx = toSpdx(item.license, notes, id);
  const license: LicenseInfo = {
    spdx,
    source: item.source_url ?? '',
    sourceUrl: item.source_url,
    author: item.author,
    attributionRequired: /^CC-BY/.test(spdx),
    checkedAt: item.checked_at ?? '',
    verified: false,
  };
  if (!spdx) missing.push(`${id}: license.spdx`);
  if (!item.checked_at) missing.push(`${id}: license.checkedAt`);
  if (item.license_url) notes.push(`${id}: license_url chuyển vào knownIssues để người duyệt kiểm tra lại`);

  const entry: Partial<AssetEntry> = {
    assetId: id,
    type,
    version: '0.0.0',
    url,
    format: url.toLowerCase().endsWith('.gltf') ? 'gltf' : 'glb',
    license,
    knownIssues: [
      'Chuyển từ định dạng cũ; bounds, pivot, bytes, materials chưa đo.',
      ...(item.license_url ? [`license_url cũ: ${item.license_url}`] : []),
      ...(item.zones?.length ? [`zones cũ: ${item.zones.join(', ')}`] : []),
    ],
  };
  if (item.sha256) entry.hash = { algo: 'sha256', value: item.sha256.toLowerCase() };
  else missing.push(`${id}: hash`);
  if (typeof item.scale === 'number') entry.scale = item.scale;
  else missing.push(`${id}: scale`);
  missing.push(`${id}: bytes, bounds, pivot (đo bằng --print-facts)`);
  notes.push(`${id}: version đặt 0.0.0 để đánh dấu chưa duyệt`);
  return entry as AssetEntry;
}

/**
 * Nâng manifest lên schemaVersion 1.
 * - schemaVersion 1: trả bản sao, không đổi.
 * - Mảng mục cũ hoặc { assets: [...] } không có schemaVersion: chuyển từng mục.
 * - SOURCE.json đơn lẻ: cần truyền thêm id/type/url qua `item`.
 */
export function migrateManifest(raw: unknown): MigrationReport {
  const missing: string[] = [];
  const notes: string[] = [];
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as { schemaVersion?: unknown }).schemaVersion === 1) {
    return { manifest: JSON.parse(JSON.stringify(raw)) as AssetManifest, missing, notes: ['đã là schemaVersion 1'] };
  }
  const items: LegacyAssetItem[] = Array.isArray(raw)
    ? (raw as LegacyAssetItem[])
    : raw && typeof raw === 'object' && Array.isArray((raw as { assets?: unknown }).assets)
      ? ((raw as { assets: LegacyAssetItem[] }).assets)
      : [];
  if (items.length === 0) notes.push('không tìm thấy mục cũ nào để chuyển');
  const assets = items.map((it, i) => migrateLegacyItem(it, i, missing, notes));
  return {
    manifest: { schemaVersion: 1, units: 'm', upAxis: 'Y', forward: '+Z', rigProfiles: {}, assets },
    missing,
    notes,
  };
}
