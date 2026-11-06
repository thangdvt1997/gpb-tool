/**
 * Kiểu dữ liệu của gói sao lưu/xuất nhập (TASK 20, docs/design/BACKUP.md).
 * Chỉ chứa kiểu và hằng, không có mã chạy.
 */

/** Tên ứng dụng và định dạng ghi trong header gói. */
export const BACKUP_APP = 'gpb-office';
export const BACKUP_FORMAT = 'gpb-backup';
/** Phiên bản dữ liệu toàn cục của GÓI (khung header + sections). Tăng khi đổi khung. */
export const BACKUP_SCHEMA_VERSION = 1;

/** Giới hạn nhập mặc định (byte). Gói có ảnh xăm nhúng có thể vài MB. */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const MAX_JSON_DEPTH = 32;
export const MAX_JSON_NODES = 400_000;

export interface BackupHeader {
  app: string;
  format: string;
  schemaVersion: number;
  /** ISO 8601. */
  createdAt: string;
  /** Phiên bản dữ liệu của từng phần (manifest). */
  sectionVersions: Record<string, number>;
  /** 'sha256:<hex>' của stableStringify(sections). Gói v0 cũ không có. */
  checksum?: string;
}

export interface BackupBundle {
  header: BackupHeader;
  sections: Record<string, unknown>;
}

export type ValidateOk = { ok: true; data: unknown; warnings: string[] };
export type ValidateFail = { ok: false; error: string };
export type ValidateResult = ValidateOk | ValidateFail;

/** Một bước migrate dữ liệu của phần: từ version N lên N+1. Phải thuần, không sửa đầu vào. */
export type SectionMigration = (data: unknown) => unknown;

/**
 * Một phần dữ liệu có thể đăng ký vào sao lưu (look, settings, persist, layout nháp, xăm...).
 * Phần mở rộng chỉ cần cung cấp đối tượng này rồi registry.register(section).
 */
export interface BackupSection {
  /** a-z, 0-9, '_' '-' ; bắt đầu bằng chữ. */
  id: string;
  label: string;
  /** Phiên bản dữ liệu hiện tại của phần. */
  version: number;
  /** migrations[n] chuyển dữ liệu version n -> n+1. */
  migrations: Readonly<Record<number, SectionMigration>>;
  /** Kiểm tra và chuẩn hóa dữ liệu ĐÃ ở version hiện tại. */
  validate(data: unknown): ValidateResult;
  /** Đọc dữ liệu hiện tại; null nếu chưa có gì. */
  read(): Promise<unknown | null> | unknown | null;
  /** Ghi dữ liệu đã validate. Ném lỗi nếu thất bại (importer sẽ rollback). */
  write(data: unknown): Promise<void> | void;
  /** Xóa dữ liệu (để rollback khi trước đó chưa có). Không bắt buộc. */
  clear?(): Promise<void> | void;
  /** Gộp dữ liệu hiện tại với dữ liệu nhập. Mặc định: gộp sâu đối tượng, còn lại lấy dữ liệu nhập. */
  merge?(current: unknown, incoming: unknown): unknown;
  /** Đường dẫn (a.b.c) bỏ qua khi so sánh khác biệt, vì luôn đổi (thời điểm ghi, revision...). */
  volatilePaths?: readonly string[];
}

export type ImportMode = 'merge' | 'replace';

export type DiffKind = 'added' | 'removed' | 'changed';
export interface DiffEntry {
  path: string;
  kind: DiffKind;
  before?: string;
  after?: string;
}

export interface MetaBackup {
  id: string;
  createdAt: number;
  label: string;
  reason: 'manual' | 'auto' | 'pre-import' | 'pre-restore';
  bytes: number;
}
