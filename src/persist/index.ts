/** API công khai của lưu/khôi phục văn phòng (TASK 06). Xem docs/design/SAVE_STATE.md. */
export * from './types';
export {
  SNAPSHOT_FORMAT,
  EXPORT_FORMAT,
  SNAPSHOT_SCHEMA_VERSION,
  DEFAULT_SCENE_ID,
  TRANSIENT_OBJECT_KEYS,
  isTransientKey,
  validateSnapshot,
  migrateSnapshot,
  parseStoredSnapshot,
  casDecide,
  createMemoryStore,
  resolveRestorePosition,
  findMissingAssets,
  type PersistState,
  type SaveStatus,
} from './core';
export { createIndexedDbStore, indexedDbAvailable, loadPrefs, savePrefs, type PersistPrefs } from './storage';
export {
  createPersistManager,
  usePersistState,
  fashionLookValidator,
  type PersistManager,
  type PersistSources,
  type PersistAppliers,
  type ActionResult,
} from './manager';
