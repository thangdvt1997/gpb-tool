/**
 * Logic thuần của lưu/khôi phục (TASK 06): validate, migrate, compare-and-swap, debounce + hàng đợi,
 * kiểm tra vị trí khi khôi phục, kiểm tra asset thiếu. Không import mã chạy nào (chỉ `import type`),
 * không đụng window/DOM, để chạy được bằng `node --test` (Node 22.18+/24 tự bỏ kiểu TS).
 * Không dùng enum, namespace, parameter property (node strip-types không hỗ trợ).
 */
import type {
  AssetBlob,
  AssetRef,
  BackupKind,
  BackupRecord,
  LookValidator,
  MigrateResult,
  ObjectStatesSnapshot,
  OfficeSnapshot,
  ReadResult,
  SavedPosition,
  SnapshotStore,
  SnapshotWarning,
  UserSettings,
  ValidateSnapshotResult,
  WriteResult,
} from './types';
import type { Pose } from '../layout/types';

export const SNAPSHOT_FORMAT = 'gpb-office-snapshot' as const;
export const EXPORT_FORMAT = 'gpb-office-export' as const;
/** Schema hiện tại. Tăng khi đổi cấu trúc, kèm bước trong MIGRATIONS. */
export const SNAPSHOT_SCHEMA_VERSION = 1;
/** Schema 0: tệp chỉ có cấu hình nhân vật (exportLook của src/fashion, CharacterLook trần, Appearance cũ). */
export const LEGACY_LOOK_FORMAT = 'gpb-character-look';
export const DEFAULT_SCENE_ID = 'office-l-it7';

export const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
export const MAX_ASSET_BYTES = 4 * 1024 * 1024;
export const MAX_ASSETS = 64;
export const MAX_EXPORT_BYTES = 24 * 1024 * 1024;
export const ASSET_MIMES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
const SCENE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ASSET_ID_RE = /^a-[0-9a-f]{32}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const ROTATIONS = [0, 90, 180, 270];
const MAX_OBJECTS = 2000;
const MAX_KEYS = 32;
const MAX_STR = 200;

/**
 * Khóa trạng thái vật là tạm thời, không bao giờ lưu: khóa bắt đầu bằng '_' hoặc nằm trong danh sách.
 * Quy ước cho các task tương tác sau: khóa vật đang giữ/ngồi/đang chạy animation đặt theo tên này.
 */
export const TRANSIENT_OBJECT_KEYS: readonly string[] = ['heldBy', 'lockedBy', 'occupiedBy', 'grabbedBy', 'animFrame', 'busy'];

export function isTransientKey(key: string): boolean {
  return key.startsWith('_') || TRANSIENT_OBJECT_KEYS.includes(key);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function warn(list: SnapshotWarning[], code: SnapshotWarning['code'], path: string, message: string): void {
  list.push({ code, path, message });
}

/* ------------------------------------------------------------------ */
/* Lọc dữ liệu tạm thời                                                */
/* ------------------------------------------------------------------ */

/** Bỏ khóa tạm thời và giá trị không phải nguyên thủy. Trả về bản mới, không sửa đầu vào. */
export function stripTransientObjects(input: unknown, warnings?: SnapshotWarning[]): ObjectStatesSnapshot {
  const out: ObjectStatesSnapshot = {};
  if (!isObj(input)) return out;
  let count = 0;
  for (const [id, state] of Object.entries(input)) {
    if (count >= MAX_OBJECTS) {
      if (warnings) warn(warnings, 'object_invalid', 'objects', `Quá ${MAX_OBJECTS} vật; phần sau bị bỏ.`);
      break;
    }
    if (!ID_RE.test(id) || !isObj(state)) {
      if (warnings) warn(warnings, 'object_invalid', `objects.${id}`, 'Trạng thái vật không hợp lệ, đã bỏ.');
      continue;
    }
    const clean: Record<string, string | number | boolean | null> = {};
    let keys = 0;
    for (const [k, v] of Object.entries(state)) {
      if (isTransientKey(k)) {
        if (warnings) warn(warnings, 'object_transient', `objects.${id}.${k}`, 'Khóa tạm thời không được lưu.');
        continue;
      }
      if (!ID_RE.test(k) || keys >= MAX_KEYS) {
        if (warnings) warn(warnings, 'object_invalid', `objects.${id}.${k}`, 'Khóa trạng thái không hợp lệ, đã bỏ.');
        continue;
      }
      const ok =
        v === null || typeof v === 'boolean' || finite(v) || (typeof v === 'string' && v.length <= MAX_STR);
      if (!ok) {
        if (warnings) warn(warnings, 'object_invalid', `objects.${id}.${k}`, 'Giá trị không phải kiểu nguyên thủy hợp lệ, đã bỏ.');
        continue;
      }
      clean[k] = v as string | number | boolean | null;
      keys++;
    }
    if (Object.keys(clean).length > 0) {
      out[id] = clean;
      count++;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Validate                                                            */
/* ------------------------------------------------------------------ */

function validateAssets(input: unknown, warnings: SnapshotWarning[]): AssetRef[] {
  if (!Array.isArray(input)) return [];
  const out: AssetRef[] = [];
  const seen = new Set<string>();
  input.forEach((a, i) => {
    const path = `assets[${i}]`;
    if (out.length >= MAX_ASSETS) {
      warn(warnings, 'asset_invalid', path, `Quá ${MAX_ASSETS} asset; phần sau bị bỏ.`);
      return;
    }
    const rec: Record<string, unknown> = isObj(a) ? a : {};
    const id = typeof rec.id === 'string' ? rec.id : '';
    const kind = rec.kind === 'tattoo-image' || rec.kind === 'pattern-image' ? rec.kind : null;
    const mime = typeof rec.mime === 'string' ? rec.mime : '';
    const bytes = finite(rec.bytes) ? (rec.bytes as number) : 0;
    const sha = typeof rec.sha256 === 'string' ? rec.sha256 : '';
    if (
      !ASSET_ID_RE.test(id) ||
      kind === null ||
      !ASSET_MIMES.includes(mime) ||
      bytes <= 0 ||
      bytes > MAX_ASSET_BYTES ||
      !SHA_RE.test(sha) ||
      id !== assetIdFromSha(sha)
    ) {
      warn(warnings, 'asset_invalid', path, 'Tham chiếu asset không hợp lệ, đã bỏ.');
      return;
    }
    if (seen.has(id)) {
      warn(warnings, 'asset_duplicate', path, `Asset "${id}" bị trùng, chỉ giữ bản đầu.`);
      return;
    }
    seen.add(id);
    out.push({ id, kind, mime, bytes: Math.round(bytes), sha256: sha });
  });
  return out;
}

function validatePosition(input: unknown, warnings: SnapshotWarning[]): SavedPosition | null {
  if (input === null || input === undefined) return null;
  const rec: Record<string, unknown> = isObj(input) ? input : {};
  const x = finite(rec.x) ? (rec.x as number) : NaN;
  const z = finite(rec.z) ? (rec.z as number) : NaN;
  if (Math.abs(x) < 1e4 && Math.abs(z) < 1e4) {
    return { x, z, yaw: finite(rec.yaw) ? (rec.yaw as number) : Math.PI };
  }
  warn(warnings, 'position_invalid', 'character.position', 'Vị trí nhân vật không hợp lệ, sẽ dùng điểm xuất hiện.');
  return null;
}

function validateLayout(input: unknown, warnings: SnapshotWarning[]): Record<string, Pose> {
  const out: Record<string, Pose> = {};
  const src = isObj(input) && isObj(input.overrides) ? input.overrides : {};
  for (const [id, p] of Object.entries(src)) {
    const rec: Record<string, unknown> = isObj(p) ? p : {};
    const x = finite(rec.x) ? (rec.x as number) : NaN;
    const z = finite(rec.z) ? (rec.z as number) : NaN;
    const rot = typeof rec.rotation === 'number' ? rec.rotation : -1;
    if (ID_RE.test(id) && Math.abs(x) < 1e4 && Math.abs(z) < 1e4 && ROTATIONS.includes(rot)) {
      out[id] = { x, z, rotation: rot as Pose['rotation'] };
    } else {
      warn(warnings, 'layout_invalid', `layout.overrides.${id}`, 'Vị trí vật không hợp lệ, đã bỏ.');
    }
  }
  return out;
}

function validateSettings(input: unknown, warnings: SnapshotWarning[]): UserSettings {
  const out: UserSettings = {};
  if (!isObj(input)) return out;
  for (const [group, values] of Object.entries(input)) {
    if (!ID_RE.test(group) || !isObj(values)) {
      warn(warnings, 'setting_invalid', `settings.${group}`, 'Nhóm cài đặt không hợp lệ, đã bỏ.');
      continue;
    }
    const clean: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(values)) {
      if (ID_RE.test(k) && (typeof v === 'boolean' || finite(v) || (typeof v === 'string' && v.length <= MAX_STR))) {
        clean[k] = v as string | number | boolean;
      } else {
        warn(warnings, 'setting_invalid', `settings.${group}.${k}`, 'Cài đặt không hợp lệ, đã bỏ.');
      }
    }
    out[group] = clean;
  }
  return out;
}

/**
 * Validate snapshot ở schema hiện tại (gọi sau migrateSnapshot khi đọc, và trước khi ghi).
 * Lỗi cấu trúc gốc (format, schemaVersion, sceneId, revision, thiếu nhân vật) thì từ chối;
 * lỗi từng phần con thì bỏ phần đó và ghi cảnh báo, không làm mất phần còn lại.
 */
export function validateSnapshot(input: unknown, validateLook: LookValidator): ValidateSnapshotResult {
  if (!isObj(input)) return { ok: false, error: 'Bản lưu phải là một đối tượng JSON.' };
  if (input.format !== SNAPSHOT_FORMAT) return { ok: false, error: 'Dữ liệu không phải bản lưu văn phòng.' };
  if (input.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Bản lưu có schema ${String(input.schemaVersion)}, cần ${SNAPSHOT_SCHEMA_VERSION}. Hãy chạy migrate trước.`,
    };
  }
  if (typeof input.sceneId !== 'string' || !SCENE_RE.test(input.sceneId)) return { ok: false, error: 'sceneId không hợp lệ.' };
  if (!Number.isInteger(input.revision) || (input.revision as number) < 0) return { ok: false, error: 'revision không hợp lệ.' };
  const character = input.character;
  if (!isObj(character) || !isObj(character.look)) return { ok: false, error: 'Bản lưu thiếu phần nhân vật.' };

  const warnings: SnapshotWarning[] = [];
  const lookResult = validateLook(character.look);
  lookResult.warnings.forEach((w) => warn(warnings, 'look', `character.look.${w.path}`, w.message));

  const snapshot: OfficeSnapshot = {
    format: SNAPSHOT_FORMAT,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    sceneId: input.sceneId,
    revision: input.revision as number,
    savedAt: finite(input.savedAt) && (input.savedAt as number) > 0 ? (input.savedAt as number) : 0,
    writerId: typeof input.writerId === 'string' && ID_RE.test(input.writerId) ? input.writerId : 'unknown',
    assets: validateAssets(input.assets, warnings),
    character: { look: lookResult.look, position: validatePosition(character.position, warnings) },
    layout: { overrides: validateLayout(input.layout, warnings) },
    objects: stripTransientObjects(input.objects, warnings),
    settings: validateSettings(input.settings, warnings),
  };
  return { ok: true, snapshot, warnings };
}

/* ------------------------------------------------------------------ */
/* Migrate                                                             */
/* ------------------------------------------------------------------ */

/**
 * Xác định schema của dữ liệu thô. Trả null nếu không nhận ra.
 * Schema 0 = tệp cấu hình nhân vật đơn lẻ (định dạng gpb-character-look, CharacterLook trần,
 * hoặc Appearance cũ có trường outfit dạng chuỗi).
 */
export function detectSchemaVersion(raw: unknown): number | null {
  if (!isObj(raw)) return null;
  if (raw.format === SNAPSHOT_FORMAT) return Number.isInteger(raw.schemaVersion) ? (raw.schemaVersion as number) : null;
  if (raw.format === LEGACY_LOOK_FORMAT) return 0;
  if (raw.format === undefined && ('outfit' in raw || 'body' in raw || 'skinTone' in raw || 'hairStyle' in raw)) return 0;
  return null;
}

type Migration = (raw: Record<string, unknown>, ctx: { sceneId: string; now: number }) => Record<string, unknown>;

/** MIGRATIONS[n] nâng schema n lên n + 1. Không sửa đầu vào. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  0: (raw, ctx) => ({
    format: SNAPSHOT_FORMAT,
    schemaVersion: 1,
    sceneId: ctx.sceneId,
    revision: 0,
    savedAt: ctx.now,
    writerId: 'migrated',
    assets: [],
    // Bản xuất exportLook bọc look trong { format, version, look }; bản trần thì chính nó là look.
    character: { look: raw.format === LEGACY_LOOK_FORMAT ? raw.look : raw, position: null },
    layout: { overrides: {} },
    objects: {},
    settings: {},
  }),
};

/**
 * Nâng dữ liệu thô lên SNAPSHOT_SCHEMA_VERSION. Từ chối bản mới hơn ứng dụng (không sửa gì).
 * Người gọi phải sao lưu bản thô (backup 'pre-migration') trước khi ghi kết quả migrated.
 */
export function migrateSnapshot(raw: unknown, ctx: { sceneId: string; now: number }): MigrateResult {
  const from = detectSchemaVersion(raw);
  if (from === null || !isObj(raw)) {
    return { ok: false, code: 'unknown_format', error: 'Không nhận ra định dạng bản lưu.' };
  }
  if (from > SNAPSHOT_SCHEMA_VERSION) {
    return {
      ok: false,
      code: 'too_new',
      error: `Bản lưu được tạo bởi phiên bản mới hơn (schema ${from}); ứng dụng này chỉ đọc tới schema ${SNAPSHOT_SCHEMA_VERSION}. Hãy cập nhật ứng dụng. Bản lưu không bị thay đổi.`,
    };
  }
  if (from < 0) return { ok: false, code: 'unsupported', error: `Schema ${from} không được hỗ trợ.` };
  let value: Record<string, unknown> = raw;
  for (let v = from; v < SNAPSHOT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, code: 'unsupported', error: `Thiếu bước migrate từ schema ${v}.` };
    value = step(value, ctx);
  }
  return { ok: true, value, fromVersion: from, migrated: from !== SNAPSHOT_SCHEMA_VERSION };
}

/** Đọc + migrate + validate trong một bước. */
export function parseStoredSnapshot(
  raw: unknown,
  ctx: { sceneId: string; now: number },
  validateLook: LookValidator,
): { ok: true; snapshot: OfficeSnapshot; warnings: SnapshotWarning[]; fromVersion: number; migrated: boolean } | { ok: false; code: string; error: string } {
  const m = migrateSnapshot(raw, ctx);
  if (!m.ok) return m;
  const v = validateSnapshot(m.value, validateLook);
  if (!v.ok) return { ok: false, code: 'invalid', error: v.error };
  return { ok: true, snapshot: v.snapshot, warnings: v.warnings, fromVersion: m.fromVersion, migrated: m.migrated };
}

/* ------------------------------------------------------------------ */
/* Compare-and-swap                                                    */
/* ------------------------------------------------------------------ */

export type CasDecision = { ok: true; nextRevision: number } | { ok: false; storedRevision: number };

/**
 * Quy tắc CAS: chỉ ghi khi revision đang lưu bằng revision bên ghi đã thấy.
 * storedRevision null = chưa có bản lưu; expected null = bên ghi nghĩ chưa có bản lưu.
 */
export function casDecide(storedRevision: number | null, expected: number | null): CasDecision {
  if (storedRevision === expected) return { ok: true, nextRevision: (storedRevision ?? 0) + 1 };
  return { ok: false, storedRevision: storedRevision ?? 0 };
}

export function conflictMessage(storedRevision: number): string {
  return `Bản lưu đã được tab hoặc cửa sổ khác cập nhật (revision ${storedRevision}). Không ghi đè. Hãy tải bản mới hoặc chọn ghi đè.`;
}

/**
 * Store trong bộ nhớ, cùng hợp đồng SnapshotStore. Dùng cho test và khi trình duyệt không có IndexedDB
 * (dữ liệu mất khi đóng trang, và trạng thái báo rõ điều đó). Không phải đồng bộ cloud.
 */
export function createMemoryStore(opts: { failWith?: () => WriteResult | null } = {}): SnapshotStore & {
  dump(): Map<string, unknown>;
} {
  const snaps = new Map<string, unknown>();
  const backups = new Map<string, BackupRecord>();
  const assets = new Map<string, Blob>();
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    kind: 'memory',
    dump: () => snaps,
    async read(sceneId): Promise<ReadResult> {
      return { ok: true, raw: snaps.has(sceneId) ? clone(snaps.get(sceneId)) : null };
    },
    async write(snapshot: OfficeSnapshot, expected: number | null, newAssets: readonly AssetBlob[]): Promise<WriteResult> {
      const cur = snaps.get(snapshot.sceneId);
      const stored = isObj(cur) && Number.isInteger(cur.revision) ? (cur.revision as number) : null;
      const d = casDecide(stored, expected);
      if (!d.ok) return { ok: false, code: 'conflict', error: conflictMessage(d.storedRevision), storedRevision: d.storedRevision };
      const injected = opts.failWith?.();
      if (injected && !injected.ok) return injected;
      if (cur !== undefined) {
        backups.set(`${snapshot.sceneId}:previous`, { kind: 'previous', sceneId: snapshot.sceneId, createdAt: snapshot.savedAt, raw: clone(cur) });
      }
      newAssets.forEach((a) => assets.set(a.ref.id, a.blob));
      snaps.set(snapshot.sceneId, clone({ ...snapshot, revision: d.nextRevision }));
      return { ok: true, revision: d.nextRevision };
    },
    async readBackup(sceneId: string, kind: BackupKind) {
      const b = backups.get(`${sceneId}:${kind}`);
      return b ? clone(b) : null;
    },
    async writeBackup(record: BackupRecord): Promise<WriteResult> {
      backups.set(`${record.sceneId}:${record.kind}`, clone(record));
      return { ok: true, revision: 0 };
    },
    async getAsset(id: string) {
      return assets.get(id) ?? null;
    },
    async hasAssets(ids: readonly string[]) {
      return new Set(ids.filter((id) => assets.has(id)));
    },
  };
}

/* ------------------------------------------------------------------ */
/* Autosave: debounce + hàng đợi tuần tự                               */
/* ------------------------------------------------------------------ */

export interface SchedulerTimers {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface AutosaveScheduler {
  /** Báo có thay đổi: hẹn lưu sau delayMs kể từ lần đổi cuối, nhưng không trễ quá maxWaitMs kể từ lần đổi đầu. */
  touch(): void;
  /** Lưu ngay (lưu thủ công). Nếu đang lưu thì xếp hàng một lượt sau đó. Trả promise của lượt lưu bao gồm thay đổi hiện tại. */
  flush(): Promise<void>;
  /** Hủy hẹn giờ (không hủy lượt đang chạy). */
  cancel(): void;
  readonly pending: boolean;
  readonly running: boolean;
}

/**
 * Bộ hẹn lưu thuần: không bao giờ chạy hai lượt run() song song; thay đổi đến trong lúc đang lưu
 * được gộp thành đúng một lượt tiếp theo. Lỗi của run() không làm kẹt hàng đợi.
 */
export function createAutosaveScheduler(
  run: () => Promise<void>,
  timers: SchedulerTimers,
  opts: { delayMs: number; maxWaitMs: number },
): AutosaveScheduler {
  let timer: unknown = null;
  let firstTouch: number | null = null;
  let running: Promise<void> | null = null;
  let again = false;
  let waiters: Array<() => void> = [];

  const clear = () => {
    if (timer !== null) timers.clearTimer(timer);
    timer = null;
  };

  const start = (): Promise<void> => {
    clear();
    firstTouch = null;
    if (running) {
      again = true;
      return new Promise<void>((resolve) => waiters.push(resolve));
    }
    const p = (async () => {
      try {
        await run();
      } catch {
        // run() tự báo lỗi qua trạng thái; hàng đợi tiếp tục.
      }
    })().then(() => {
      running = null;
      if (again) {
        again = false;
        const w = waiters;
        waiters = [];
        void start().then(() => w.forEach((r) => r()));
      }
    });
    running = p;
    return p;
  };

  return {
    touch() {
      const t = timers.now();
      if (firstTouch === null) firstTouch = t;
      const wait = Math.max(0, Math.min(opts.delayMs, firstTouch + opts.maxWaitMs - t));
      clear();
      timer = timers.setTimer(() => {
        timer = null;
        void start();
      }, wait);
    },
    flush: () => start(),
    cancel: clear,
    get pending() {
      return timer !== null || again;
    },
    get running() {
      return running !== null;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Trạng thái lưu                                                      */
/* ------------------------------------------------------------------ */

export type SaveStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error' | 'conflict' | 'blocked';

export interface PersistState {
  status: SaveStatus;
  /** Có thay đổi chưa ghi xuống bộ nhớ bền vững. */
  dirty: boolean;
  /** revision của bản đang lưu mà tab này đã thấy (null = chưa có bản lưu). */
  revision: number | null;
  lastSavedAt: number | null;
  /** revision mới hơn do tab khác báo (BroadcastChannel) hoặc phát hiện khi ghi. */
  remoteRevision: number | null;
  error: string | null;
  warnings: SnapshotWarning[];
  missingAssets: string[];
  /** Tên store đang dùng ('indexeddb' | 'memory'). 'memory' nghĩa là đóng trang sẽ mất dữ liệu. */
  storeKind: string;
}

export function initialPersistState(storeKind: string): PersistState {
  return {
    status: 'idle',
    dirty: false,
    revision: null,
    lastSavedAt: null,
    remoteRevision: null,
    error: null,
    warnings: [],
    missingAssets: [],
    storeKind,
  };
}

/* ------------------------------------------------------------------ */
/* Vị trí an toàn và asset thiếu                                       */
/* ------------------------------------------------------------------ */

export interface RectLike {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Kiểm tra vị trí khi khôi phục: phải nằm trong chữ L và không chồng collider (nới theo bán kính).
 * Không đạt thì trả spawn. moved = true khi phải đổi vị trí.
 */
export function resolveRestorePosition(
  saved: SavedPosition | null,
  env: { isInside(x: number, z: number): boolean; colliders: readonly RectLike[]; radius: number; spawn: SavedPosition },
): { position: SavedPosition; moved: boolean; reason: string | null } {
  if (!saved) return { position: env.spawn, moved: false, reason: null };
  if (!finite(saved.x) || !finite(saved.z)) return { position: env.spawn, moved: true, reason: 'Vị trí lưu không hợp lệ.' };
  if (!env.isInside(saved.x, saved.z)) {
    return { position: env.spawn, moved: true, reason: 'Vị trí lưu nằm ngoài khu văn phòng.' };
  }
  const r = env.radius;
  const hit = env.colliders.some((c) => saved.x > c.minX - r && saved.x < c.maxX + r && saved.z > c.minZ - r && saved.z < c.maxZ + r);
  if (hit) return { position: env.spawn, moved: true, reason: 'Vị trí lưu bị vật cản chiếm (bố cục đã đổi).' };
  return { position: { x: saved.x, z: saved.z, yaw: finite(saved.yaw) ? saved.yaw : env.spawn.yaw }, moved: false, reason: null };
}

/** Danh sách asset được tham chiếu nhưng không có nội dung. Không sửa snapshot. */
export function findMissingAssets(snapshot: OfficeSnapshot, available: ReadonlySet<string>): string[] {
  return snapshot.assets.filter((a) => !available.has(a.id)).map((a) => a.id);
}

/** id asset suy từ sha256 hex: 'a-' + 32 ký tự đầu. */
export function assetIdFromSha(sha256Hex: string): string {
  return `a-${sha256Hex.slice(0, 32)}`;
}

/** Kích thước UTF-8 của chuỗi, không cần TextEncoder. */
export function utf8Bytes(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}
