import { computeChecksum } from '../backup/bundle';
import { importLook, LOOK_FORMAT, MAX_LOOK_BYTES, type ImportResult } from '../fashion/persistence';
import { validate } from '../fashion/rules';
import { LOOK_SCHEMA_VERSION, type CharacterLook } from '../fashion/types';

/**
 * Xuất/nhập JSON riêng cho nhân vật (phòng thay đồ). Dùng lại định dạng của fashion/persistence.ts
 * (`gpb-character-look`) và thêm `checksum` SHA-256 như gói sao lưu (TASK 20): tệp bị sửa tay thì từ chối.
 * Tệp không có checksum (xuất từ exportLook cũ) vẫn nhập được, kèm cảnh báo.
 */
export interface CheckedImport {
  result: ImportResult;
  checksum: 'ok' | 'missing' | 'mismatch';
}

/** Checksum bao trùm định dạng, phiên bản và look đã validate. */
async function sumOf(look: CharacterLook): Promise<string> {
  return computeChecksum({ format: LOOK_FORMAT, version: LOOK_SCHEMA_VERSION, look });
}

export async function exportLookChecked(look: CharacterLook): Promise<string> {
  const clean = validate(look).look;
  const checksum = await sumOf(clean);
  return JSON.stringify({ format: LOOK_FORMAT, version: LOOK_SCHEMA_VERSION, checksum, look: clean }, null, 2);
}

export async function importLookChecked(text: unknown): Promise<CheckedImport> {
  const base = importLook(text);
  if (!base.ok || typeof text !== 'string') return { result: base, checksum: 'missing' };
  let declared: unknown;
  let rawLook: unknown;
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    declared = o.checksum;
    rawLook = o.look;
  } catch {
    return { result: base, checksum: 'missing' };
  }
  if (typeof declared !== 'string') return { result: base, checksum: 'missing' };
  // Checksum tính trên look đã validate lúc xuất; tính lại từ phần look trong tệp sau validate.
  const actual = await sumOf(validate(rawLook).look);
  if (actual !== declared) return { result: { ok: false, error: 'Checksum không khớp: tệp bị sửa hoặc hỏng.' }, checksum: 'mismatch' };
  return { result: base, checksum: 'ok' };
}

export const LOOK_FILE_NAME = 'nhan-vat.gpb-look.json';
export { MAX_LOOK_BYTES };
