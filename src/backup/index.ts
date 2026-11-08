/** API công khai của xuất/nhập và sao lưu (TASK 20). Xem docs/design/BACKUP.md. */
export * from './types';
export { safeParse, stableStringify, sha256Hex, sha256Bytes, sha256Pure, redactSensitive, FORBIDDEN_KEYS } from './safeJson';
export { createRegistry, type BackupRegistry } from './registry';
export { diffValues, deepMerge } from './diff';
export { BUNDLE_MIGRATIONS, bundleV0ToV1, detectBundleVersion, migrateBundle, migrateSectionData } from './migrate';
export { buildBundle, backupFileName, computeChecksum } from './bundle';
export { parseBundleText, previewImport, applyImport, type ParsedBundle, type PreviewItem, type ApplyResult } from './importer';
export { createBackupRing, createMemoryStorage, type BackupRing, type KeyValueStorage } from './ring';
export { createLookSection, createSettingsSection, createPersistSection, createLayoutDraftSection } from './sections';
export { createBackupService, type BackupService } from './service';
export { createDefaultBackupService, type DefaultBackupDeps } from './runtime';
export { BackupPanel } from './BackupPanel';
export { buildZip, readZip, crc32, isZipBytes } from './zip';
export { buildBundleZip, parseBundleZip, extractImages, ZIP_FORMAT } from './bundleZip';
