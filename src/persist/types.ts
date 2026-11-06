/**
 * Kiểu dữ liệu của bản lưu văn phòng (TASK 06, docs/design/SAVE_STATE.md).
 * Chỉ chứa kiểu, không có mã chạy, để core.ts dùng được cả trong trình duyệt lẫn node:test.
 * Không chứa scene graph, mesh, instance vật lý hay trạng thái tạm thời (phím, con trỏ, khung animation, khóa vật).
 */
import type { CharacterLook } from '../fashion/types';
import type { Pose } from '../layout/types';
import type { ObjectStateValue } from '../scene/interact/objectStates';

export type AssetKind = 'tattoo-image' | 'pattern-image';

/**
 * Tham chiếu asset bền vững. id suy từ sha256 nội dung (không dùng object URL tạm).
 * Nội dung (Blob) nằm trong IndexedDB store 'assets', ghi cùng transaction với snapshot.
 */
export interface AssetRef {
  id: string;
  kind: AssetKind;
  mime: string;
  bytes: number;
  sha256: string;
}

/** Vị trí nhân vật lúc lưu (hệ three.js). Chỉ là gợi ý: khi khôi phục luôn kiểm tra lại. */
export interface SavedPosition {
  x: number;
  z: number;
  yaw: number;
}

export interface CharacterSnapshot {
  /** CharacterLook đã có (src/fashion): hình thể, mặt, tóc, da, lớp xăm/sẹo, trang phục, phụ kiện. */
  look: CharacterLook;
  position: SavedPosition | null;
}

export interface LayoutSnapshot {
  /** Vị trí đã đổi theo id vật (cùng kiểu Pose của src/layout). Chỉ phần khác mặc định. */
  overrides: Record<string, Pose>;
}

/** Trạng thái vật khác mặc định: id vật → khóa → giá trị nguyên thủy. Đã bỏ khóa tạm thời. */
export type ObjectStatesSnapshot = Record<string, Record<string, ObjectStateValue>>;

export type SettingValue = string | number | boolean;
/** Cài đặt người dùng theo nhóm: nhóm → khóa → giá trị. Ví dụ { interact: { highlight: true } }. */
export type UserSettings = Record<string, Record<string, SettingValue>>;

export interface OfficeSnapshot {
  format: 'gpb-office-snapshot';
  schemaVersion: number;
  sceneId: string;
  /** Tăng 1 sau mỗi lần ghi thành công. Dùng cho compare-and-swap. */
  revision: number;
  /** Thời điểm ghi, ms kể từ epoch. */
  savedAt: number;
  /** id tab đã ghi bản này (phân biệt tab trong BroadcastChannel). */
  writerId: string;
  assets: AssetRef[];
  character: CharacterSnapshot;
  layout: LayoutSnapshot;
  objects: ObjectStatesSnapshot;
  settings: UserSettings;
}

export type SnapshotWarningCode =
  | 'look'
  | 'asset_invalid'
  | 'asset_duplicate'
  | 'asset_missing'
  | 'layout_invalid'
  | 'object_invalid'
  | 'object_transient'
  | 'setting_invalid'
  | 'position_invalid'
  | 'position_moved';

export interface SnapshotWarning {
  code: SnapshotWarningCode;
  path: string;
  message: string;
}

export type ValidateSnapshotResult =
  | { ok: true; snapshot: OfficeSnapshot; warnings: SnapshotWarning[] }
  | { ok: false; error: string };

export type MigrateResult =
  | { ok: true; value: Record<string, unknown>; fromVersion: number; migrated: boolean }
  | { ok: false; code: 'too_new' | 'unknown_format' | 'unsupported'; error: string };

/** Hàm validate look được tiêm vào (trình duyệt dùng src/fashion validate/appearanceToLook). */
export type LookValidator = (input: unknown) => { look: CharacterLook; warnings: ReadonlyArray<{ path: string; message: string }> };

/* ------------------------------------------------------------------ */
/* Storage adapter                                                     */
/* ------------------------------------------------------------------ */

export type BackupKind = 'previous' | 'pre-migration' | 'pre-reset' | 'pre-import';

export interface BackupRecord {
  kind: BackupKind;
  sceneId: string;
  createdAt: number;
  /** Dữ liệu thô như đã đọc (có thể là schema cũ), không sửa. */
  raw: unknown;
}

export interface AssetBlob {
  ref: AssetRef;
  blob: Blob;
}

export type StoreErrorCode = 'conflict' | 'quota' | 'unavailable' | 'error';

export type ReadResult = { ok: true; raw: unknown | null } | { ok: false; code: StoreErrorCode; error: string };

export type WriteResult =
  | { ok: true; revision: number }
  | { ok: false; code: StoreErrorCode; error: string; storedRevision?: number };

/**
 * Nơi lưu snapshot. Bản hiện có: IndexedDB (storage.ts) và bộ nhớ (core.ts, cho test).
 * Thêm máy chủ sau: viết adapter mới cùng hợp đồng; write phải là compare-and-swap nguyên tử.
 */
export interface SnapshotStore {
  readonly kind: string;
  read(sceneId: string): Promise<ReadResult>;
  /**
   * Ghi nguyên tử snapshot + asset mới. expectedRevision: revision đang lưu mà bên ghi đã thấy
   * (null = chưa có bản lưu). Khác revision đang lưu thì trả 'conflict', không ghi gì.
   * Bản đang lưu (nếu có) được chép sang backup 'previous' trong cùng transaction.
   */
  write(snapshot: OfficeSnapshot, expectedRevision: number | null, assets: readonly AssetBlob[]): Promise<WriteResult>;
  readBackup(sceneId: string, kind: BackupKind): Promise<BackupRecord | null>;
  writeBackup(record: BackupRecord): Promise<WriteResult>;
  getAsset(id: string): Promise<Blob | null>;
  hasAssets(ids: readonly string[]): Promise<Set<string>>;
}
