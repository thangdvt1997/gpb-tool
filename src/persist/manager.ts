/**
 * Bộ quản lý lưu/khôi phục văn phòng (TASK 06). Ghép logic thuần (core.ts) với store (storage.ts),
 * các kho trạng thái có sẵn (objectStates, interact settings, playerPose — chỉ đọc/gọi API công khai)
 * và nguồn dữ liệu do App cung cấp (look, bố cục, collider).
 *
 * Không mount ở đây. Người điều phối tạo một manager trong App, gọi attach() và load lúc khởi động
 * (xem docs/design/SAVE_STATE.md, mục "Gắn vào App").
 */
import { useSyncExternalStore } from 'react';
import { makeDefaultLook } from '../fashion/defaults';
import { appearanceToLook, isLegacyAppearance } from '../fashion/migrate';
import { validate } from '../fashion/rules';
import type { CharacterLook } from '../fashion/types';
import type { Pose } from '../layout/types';
import { playerPose } from '../scene/controls/playerPose';
import { changedObjectIds, getObjectState, resetObjectStates, setObjectState, subscribeObjectStates } from '../scene/interact/objectStates';
import { getInteractSettings, updateInteractSettings } from '../scene/interact/settings';
import { PLAYER_RADIUS, SPAWN, type Rect } from '../scene/layout';
import { isInsideOffice } from '../scene/officeBounds';
import {
  ASSET_MIMES,
  DEFAULT_SCENE_ID,
  EXPORT_FORMAT,
  MAX_ASSET_BYTES,
  MAX_ASSETS,
  MAX_EXPORT_BYTES,
  MAX_SNAPSHOT_BYTES,
  SNAPSHOT_FORMAT,
  SNAPSHOT_SCHEMA_VERSION,
  assetIdFromSha,
  createAutosaveScheduler,
  createMemoryStore,
  findMissingAssets,
  initialPersistState,
  parseStoredSnapshot,
  resolveRestorePosition,
  stripTransientObjects,
  utf8Bytes,
  validateSnapshot,
  type PersistState,
} from './core';
import { base64ToBlob, blobToBase64, createIndexedDbStore, indexedDbAvailable, loadPrefs, savePrefs, sha256Hex } from './storage';
import type {
  AssetBlob,
  AssetKind,
  AssetRef,
  BackupKind,
  LookValidator,
  ObjectStatesSnapshot,
  OfficeSnapshot,
  SavedPosition,
  SnapshotStore,
  UserSettings,
} from './types';

/** Validate look dùng lại src/fashion: Appearance cũ thì chuyển đổi, còn lại qua validate(). */
export const fashionLookValidator: LookValidator = (input) => (isLegacyAppearance(input) ? appearanceToLook(input) : validate(input));

export interface PersistSources {
  sceneId?: string;
  /** Look hiện tại của nhân vật người chơi. */
  getLook(): CharacterLook;
  /** Vị trí vật đã đổi khác mặc định (id → Pose). */
  getLayoutOverrides(): Record<string, Pose>;
  /** Collider của cảnh SAU khi đã áp bố cục (dùng kiểm tra vị trí nhân vật khi khôi phục). */
  getColliders(): readonly Rect[];
  /** Mặc định đọc playerPose. */
  getPosition?(): SavedPosition | null;
}

export interface PersistAppliers {
  /** Gọi theo thứ tự: applyAssets → applyLook → applyLayoutOverrides → (trạng thái vật, cài đặt) → placeCharacter. */
  applyAssets?(assets: ReadonlyMap<string, Blob>, missing: readonly string[]): void;
  applyLook(look: CharacterLook): void;
  applyLayoutOverrides(overrides: Record<string, Pose>): void | Promise<void>;
  /** Đặt nhân vật (Player đọc spawn khi mount, nên App thường remount Player với điểm này). */
  placeCharacter(position: SavedPosition): void;
}

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export interface PersistManager {
  getState(): PersistState;
  subscribe(cb: () => void): () => void;
  /** Gắn nghe thay đổi (trạng thái vật, cài đặt), BroadcastChannel, cảnh báo rời trang. Trả hàm gỡ. */
  attach(): () => void;
  /** Báo có thay đổi (look, bố cục): đánh dấu chưa lưu và hẹn autosave. */
  markDirty(): void;
  saveSnapshot(opts?: { overwrite?: boolean }): Promise<ActionResult>;
  /** Đọc bản lưu gần nhất và áp vào cảnh (bỏ thay đổi chưa lưu). */
  loadSnapshot(): Promise<ActionResult>;
  /** Khôi phục từ bản sao lưu ('previous' = bản ghi trước lần lưu gần nhất). */
  restoreFromBackup(kind?: BackupKind): Promise<ActionResult>;
  /** Đặt lại về mặc định. Bản đang lưu được sao lưu 'pre-reset' trước, không xóa. */
  resetToDefault(): Promise<ActionResult>;
  exportSnapshot(): Promise<{ ok: true; text: string; bytes: number } | { ok: false; error: string }>;
  importSnapshot(text: string): Promise<ActionResult>;
  /** Đưa ảnh (xăm/họa tiết) vào kho asset theo nội dung; ghi xuống cùng snapshot ở lần lưu kế tiếp. */
  registerAsset(blob: Blob, kind: AssetKind): Promise<{ ok: true; ref: AssetRef } | { ok: false; error: string }>;
  releaseAsset(id: string): void;
  getAsset(id: string): Promise<Blob | null>;
  setAutosave(enabled: boolean): void;
  readonly autosave: boolean;
}

function tabId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `tab-${crypto.randomUUID().slice(0, 12)}`;
  } catch {
    // Dùng cách dự phòng.
  }
  return `tab-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function objectStatesNow(): ObjectStatesSnapshot {
  const raw: Record<string, unknown> = {};
  for (const id of changedObjectIds()) raw[id] = { ...getObjectState(id) };
  return stripTransientObjects(raw);
}

function settingsNow(): UserSettings {
  const s = getInteractSettings();
  return { interact: { highlight: s.highlight, keyHints: s.keyHints } };
}

function applySettings(settings: UserSettings): void {
  const i = settings.interact ?? {};
  const patch: { highlight?: boolean; keyHints?: boolean } = {};
  if (typeof i.highlight === 'boolean') patch.highlight = i.highlight;
  if (typeof i.keyHints === 'boolean') patch.keyHints = i.keyHints;
  updateInteractSettings(patch);
}

export function createPersistManager(
  sources: PersistSources,
  appliers: PersistAppliers,
  opts: { store?: SnapshotStore; delayMs?: number; maxWaitMs?: number; followRemoteWhenClean?: boolean } = {},
): PersistManager {
  const sceneId = sources.sceneId ?? DEFAULT_SCENE_ID;
  const store: SnapshotStore = opts.store ?? (indexedDbAvailable() ? createIndexedDbStore() : createMemoryStore());
  const writerId = tabId();
  const followRemote = opts.followRemoteWhenClean ?? true;
  let prefs = loadPrefs();
  let state: PersistState = initialPersistState(store.kind);
  const listeners = new Set<() => void>();
  /** Đếm thay đổi để biết có đổi thêm trong lúc đang lưu hay không. */
  let changeSeq = 0;
  /** Đang áp snapshot vào cảnh: bỏ qua sự kiện thay đổi do chính mình gây ra. */
  let applying = false;
  const assetRefs = new Map<string, AssetRef>();
  const stagedBlobs = new Map<string, Blob>();
  let channel: BroadcastChannel | null = null;

  const set = (patch: Partial<PersistState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  const buildSnapshot = (): OfficeSnapshot => ({
    format: SNAPSHOT_FORMAT,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    sceneId,
    revision: state.revision ?? 0,
    savedAt: Date.now(),
    writerId,
    assets: [...assetRefs.values()],
    character: { look: sources.getLook(), position: sources.getPosition ? sources.getPosition() : { x: playerPose.x, z: playerPose.z, yaw: playerPose.yaw } },
    layout: { overrides: sources.getLayoutOverrides() },
    objects: objectStatesNow(),
    settings: settingsNow(),
  });

  /** Validate trước khi ghi, rồi CAS. expected: revision đã thấy. */
  const writeChecked = async (snap: OfficeSnapshot, expected: number | null): Promise<ActionResult> => {
    const v = validateSnapshot(snap, fashionLookValidator);
    if (!v.ok) return { ok: false, error: `Bản lưu không hợp lệ, chưa ghi: ${v.error}` };
    const text = JSON.stringify(v.snapshot);
    if (utf8Bytes(text) > MAX_SNAPSHOT_BYTES) return { ok: false, error: 'Bản lưu quá lớn, chưa ghi.' };
    const blobs: AssetBlob[] = [];
    v.snapshot.assets.forEach((ref) => {
      const b = stagedBlobs.get(ref.id);
      if (b) blobs.push({ ref, blob: b });
    });
    const r = await store.write(v.snapshot, expected, blobs);
    if (!r.ok) {
      if (r.code === 'conflict') {
        set({ status: 'conflict', error: r.error, remoteRevision: r.storedRevision ?? null });
        scheduler.cancel();
      } else {
        set({ status: 'error', error: r.error });
      }
      return { ok: false, error: r.error };
    }
    blobs.forEach((b) => stagedBlobs.delete(b.ref.id));
    try {
      channel?.postMessage({ type: 'saved', sceneId, revision: r.revision, writerId });
    } catch {
      // Kênh đã đóng.
    }
    set({ revision: r.revision, lastSavedAt: Date.now(), warnings: v.warnings, remoteRevision: null, error: null });
    return { ok: true, message: `Đã lưu (revision ${r.revision}).` };
  };

  const runSave = async (overwrite: boolean): Promise<ActionResult> => {
    if (state.status === 'blocked') return { ok: false, error: state.error ?? 'Bản lưu đang bị khóa, không ghi.' };
    if (state.status === 'conflict' && !overwrite) return { ok: false, error: state.error ?? 'Có bản mới hơn từ tab khác.' };
    let expected = state.revision;
    if (overwrite) {
      // Ghi đè có chủ đích: lấy revision đang lưu ngay lúc này làm mốc CAS.
      const cur = await store.read(sceneId);
      if (!cur.ok) {
        set({ status: 'error', error: cur.error });
        return { ok: false, error: cur.error };
      }
      const rev = cur.raw && typeof cur.raw === 'object' ? (cur.raw as { revision?: unknown }).revision : null;
      expected = Number.isInteger(rev) ? (rev as number) : null;
    }
    const seq = changeSeq;
    set({ status: 'saving', error: null });
    const r = await writeChecked(buildSnapshot(), expected);
    if (r.ok) set({ status: 'saved', dirty: changeSeq !== seq });
    return r;
  };

  let lastAutosave: Promise<ActionResult> | null = null;
  const scheduler = createAutosaveScheduler(
    async () => {
      lastAutosave = runSave(false);
      await lastAutosave;
    },
    { now: () => Date.now(), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
    { delayMs: opts.delayMs ?? 1500, maxWaitMs: opts.maxWaitMs ?? 10000 },
  );

  const markDirty = () => {
    if (applying) return;
    changeSeq++;
    if (!state.dirty) set({ dirty: true });
    if (prefs.autosave && state.status !== 'blocked' && state.status !== 'conflict' && state.status !== 'loading') scheduler.touch();
  };

  /** Áp snapshot theo thứ tự: asset → look → bố cục → trạng thái vật → cài đặt → vị trí (đã kiểm tra). */
  const applySnapshot = async (snap: OfficeSnapshot): Promise<string[]> => {
    const notes: string[] = [];
    applying = true;
    try {
      const ids = snap.assets.map((a) => a.id);
      const present = await store.hasAssets(ids);
      stagedBlobs.forEach((_b, id) => present.add(id));
      const missing = findMissingAssets(snap, present);
      const blobs = new Map<string, Blob>();
      for (const id of ids) {
        if (!present.has(id)) continue;
        const b = stagedBlobs.get(id) ?? (await store.getAsset(id));
        if (b) blobs.set(id, b);
      }
      assetRefs.clear();
      // Giữ cả tham chiếu thiếu: không xóa dữ liệu người dùng chỉ vì một asset không tải được.
      snap.assets.forEach((a) => assetRefs.set(a.id, a));
      appliers.applyAssets?.(blobs, missing);
      if (missing.length) notes.push(`${missing.length} ảnh không tải được; đang dùng hình thay thế, bản lưu giữ nguyên tham chiếu.`);

      appliers.applyLook(snap.character.look);
      await appliers.applyLayoutOverrides(snap.layout.overrides);
      resetObjectStates();
      for (const [id, s] of Object.entries(snap.objects)) setObjectState(id, s);
      applySettings(snap.settings);

      const spawn: SavedPosition = { x: SPAWN.x, z: SPAWN.z, yaw: Math.PI };
      const pos = resolveRestorePosition(snap.character.position, {
        isInside: isInsideOffice,
        colliders: sources.getColliders(),
        radius: PLAYER_RADIUS,
        spawn,
      });
      appliers.placeCharacter(pos.position);
      if (pos.moved && pos.reason) notes.push(`${pos.reason} Nhân vật được đưa về sảnh.`);
      set({ missingAssets: missing });
    } finally {
      applying = false;
    }
    return notes;
  };

  const loadSnapshot = async (): Promise<ActionResult> => {
    scheduler.cancel();
    set({ status: 'loading', error: null });
    const r = await store.read(sceneId);
    if (!r.ok) {
      set({ status: 'error', error: r.error });
      return { ok: false, error: r.error };
    }
    if (r.raw === null) {
      set({ status: 'idle', revision: null, dirty: false });
      return { ok: true, message: 'Chưa có bản lưu; đang dùng mặc định.' };
    }
    const storedRev = (r.raw as { revision?: unknown }).revision;
    const p = parseStoredSnapshot(r.raw, { sceneId, now: Date.now() }, fashionLookValidator);
    if (!p.ok) {
      // Không tự ghi đè dữ liệu không đọc được hoặc quá mới. Người dùng chọn đặt lại / nhập / khôi phục backup.
      set({ status: 'blocked', error: p.error, revision: Number.isInteger(storedRev) ? (storedRev as number) : null });
      return { ok: false, error: p.error };
    }
    const notes = await applySnapshot(p.snapshot);
    set({ revision: Number.isInteger(storedRev) ? (storedRev as number) : p.snapshot.revision, dirty: false, warnings: p.warnings, remoteRevision: null, lastSavedAt: p.snapshot.savedAt || null });
    if (p.migrated) {
      const b = await store.writeBackup({ kind: 'pre-migration', sceneId, createdAt: Date.now(), raw: r.raw });
      if (!b.ok) {
        set({ status: 'error', error: `Đã đọc bản schema ${p.fromVersion} nhưng chưa sao lưu được nên chưa ghi bản nâng cấp: ${b.error}` });
        return { ok: true, message: notes.join(' ') || 'Đã tải bản lưu (chưa nâng cấp trên đĩa).' };
      }
      set({ status: 'saving' });
      const w = await writeChecked({ ...p.snapshot, savedAt: Date.now(), writerId }, state.revision);
      if (!w.ok) return { ok: false, error: w.error };
      set({ status: 'saved' });
      notes.push(`Đã nâng cấp bản lưu từ schema ${p.fromVersion} lên ${SNAPSHOT_SCHEMA_VERSION} (bản gốc ở backup 'pre-migration').`);
    } else {
      set({ status: 'idle' });
    }
    return { ok: true, message: notes.join(' ') || 'Đã tải bản lưu gần nhất.' };
  };

  /** Ghi một snapshot dựng sẵn (từ backup, mặc định hoặc tệp nhập) sau khi sao lưu bản đang lưu. */
  const replaceWith = async (snap: OfficeSnapshot, backupKind: BackupKind | null, label: string): Promise<ActionResult> => {
    scheduler.cancel();
    const cur = await store.read(sceneId);
    if (!cur.ok) {
      set({ status: 'error', error: cur.error });
      return { ok: false, error: cur.error };
    }
    if (backupKind && cur.raw !== null) {
      const b = await store.writeBackup({ kind: backupKind, sceneId, createdAt: Date.now(), raw: cur.raw });
      if (!b.ok) {
        set({ status: 'error', error: b.error });
        return { ok: false, error: `Chưa sao lưu được bản hiện tại nên không ${label}: ${b.error}` };
      }
    }
    const rev = cur.raw && typeof cur.raw === 'object' ? (cur.raw as { revision?: unknown }).revision : null;
    const expected = Number.isInteger(rev) ? (rev as number) : null;
    const notes = await applySnapshot(snap);
    set({ status: 'saving', error: null, revision: expected });
    const w = await writeChecked({ ...snap, sceneId, savedAt: Date.now(), writerId }, expected);
    if (!w.ok) {
      set({ dirty: true });
      return w;
    }
    set({ status: 'saved', dirty: false });
    return { ok: true, message: [`Đã ${label}.`, ...notes].join(' ') };
  };

  const defaultSnapshot = (): OfficeSnapshot => ({
    format: SNAPSHOT_FORMAT,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    sceneId,
    revision: 0,
    savedAt: Date.now(),
    writerId,
    assets: [],
    character: { look: makeDefaultLook(), position: null },
    layout: { overrides: {} },
    objects: {},
    settings: { interact: { highlight: true, keyHints: true } },
  });

  const onRemote = (ev: MessageEvent) => {
    const d = ev.data as { type?: unknown; sceneId?: unknown; revision?: unknown; writerId?: unknown } | null;
    if (!d || d.type !== 'saved' || d.sceneId !== sceneId || d.writerId === writerId || !Number.isInteger(d.revision)) return;
    const rev = d.revision as number;
    if (state.revision !== null && rev <= state.revision) return;
    if (!state.dirty && followRemote && state.status !== 'saving') {
      void loadSnapshot();
      return;
    }
    set({ remoteRevision: rev, status: state.status === 'saving' ? state.status : 'conflict', error: `Tab khác vừa lưu revision ${rev}. Chưa ghi đè; hãy tải bản mới hoặc chọn ghi đè.` });
    scheduler.cancel();
  };

  const manager: PersistManager = {
    getState: () => state,
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    attach() {
      const offObjects = subscribeObjectStates(() => markDirty());
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          channel = new BroadcastChannel('gpb-persist');
          channel.onmessage = onRemote;
        }
      } catch {
        channel = null;
      }
      const onBeforeUnload = (e: BeforeUnloadEvent) => {
        if (state.dirty || state.status === 'saving') {
          e.preventDefault();
          e.returnValue = '';
        }
      };
      const onHide = () => {
        // Cố gắng ghi khi tab bị ẩn. Transaction IndexedDB nguyên tử nên đóng tab giữa chừng không làm hỏng bản cũ.
        if (document.visibilityState === 'hidden' && state.dirty && prefs.autosave) void scheduler.flush();
      };
      window.addEventListener('beforeunload', onBeforeUnload);
      document.addEventListener('visibilitychange', onHide);
      return () => {
        offObjects();
        scheduler.cancel();
        window.removeEventListener('beforeunload', onBeforeUnload);
        document.removeEventListener('visibilitychange', onHide);
        try {
          channel?.close();
        } catch {
          // Bỏ qua.
        }
        channel = null;
      };
    },
    markDirty,
    async saveSnapshot(o = {}) {
      scheduler.cancel();
      if (lastAutosave) await lastAutosave.catch(() => undefined);
      return runSave(o.overwrite === true);
    },
    loadSnapshot,
    async restoreFromBackup(kind = 'previous') {
      const b = await store.readBackup(sceneId, kind);
      if (!b) return { ok: false, error: 'Không có bản sao lưu này.' };
      const p = parseStoredSnapshot(b.raw, { sceneId, now: Date.now() }, fashionLookValidator);
      if (!p.ok) return { ok: false, error: `Bản sao lưu không đọc được: ${p.error}` };
      // Ghi đè bản đang lưu; store tự chép bản đang lưu sang 'previous', nên có thể đảo lại.
      return replaceWith(p.snapshot, kind === 'previous' ? null : 'pre-reset', 'khôi phục từ bản sao lưu');
    },
    async resetToDefault() {
      return replaceWith(defaultSnapshot(), 'pre-reset', 'đặt lại về mặc định');
    },
    async exportSnapshot() {
      const v = validateSnapshot(buildSnapshot(), fashionLookValidator);
      if (!v.ok) return { ok: false, error: v.error };
      const assets: Array<{ id: string; mime: string; sha256: string; data: string }> = [];
      for (const ref of v.snapshot.assets) {
        const b = stagedBlobs.get(ref.id) ?? (await store.getAsset(ref.id));
        if (b) assets.push({ id: ref.id, mime: ref.mime, sha256: ref.sha256, data: await blobToBase64(b) });
      }
      const text = JSON.stringify({ format: EXPORT_FORMAT, snapshot: v.snapshot, assets }, null, 2);
      const bytes = utf8Bytes(text);
      if (bytes > MAX_EXPORT_BYTES) return { ok: false, error: 'Bản xuất quá lớn.' };
      return { ok: true, text, bytes };
    },
    async importSnapshot(text) {
      if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Không có dữ liệu để nhập.' };
      if (utf8Bytes(text) > MAX_EXPORT_BYTES) return { ok: false, error: 'Tệp nhập quá lớn.' };
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, error: 'Tệp không phải JSON hợp lệ.' };
      }
      let body: unknown = parsed;
      const embedded: Array<{ id: string; blob: Blob }> = [];
      if (parsed && typeof parsed === 'object' && (parsed as { format?: unknown }).format === EXPORT_FORMAT) {
        const o = parsed as { snapshot?: unknown; assets?: unknown };
        body = o.snapshot;
        if (Array.isArray(o.assets)) {
          for (const a of o.assets.slice(0, MAX_ASSETS)) {
            const r = a as { id?: unknown; mime?: unknown; sha256?: unknown; data?: unknown };
            if (typeof r.id !== 'string' || typeof r.mime !== 'string' || typeof r.data !== 'string' || !ASSET_MIMES.includes(r.mime)) continue;
            let blob: Blob;
            try {
              blob = base64ToBlob(r.data, r.mime);
            } catch {
              continue;
            }
            // Chỉ nhận nội dung khớp sha256 của chính nó.
            if (blob.size > MAX_ASSET_BYTES || assetIdFromSha(await sha256Hex(blob)) !== r.id) continue;
            embedded.push({ id: r.id, blob });
          }
        }
      }
      const p = parseStoredSnapshot(body, { sceneId, now: Date.now() }, fashionLookValidator);
      if (!p.ok) return { ok: false, error: p.error };
      embedded.forEach((e) => stagedBlobs.set(e.id, e.blob));
      return replaceWith(p.snapshot, 'pre-import', 'nhập bản lưu');
    },
    async registerAsset(blob, kind) {
      if (!ASSET_MIMES.includes(blob.type)) return { ok: false, error: 'Chỉ nhận ảnh PNG, JPEG hoặc WebP.' };
      if (blob.size <= 0 || blob.size > MAX_ASSET_BYTES) return { ok: false, error: `Ảnh tối đa ${MAX_ASSET_BYTES / 1024 / 1024} MB.` };
      if (assetRefs.size >= MAX_ASSETS) return { ok: false, error: `Tối đa ${MAX_ASSETS} ảnh.` };
      const sha = await sha256Hex(blob);
      const ref: AssetRef = { id: assetIdFromSha(sha), kind, mime: blob.type, bytes: blob.size, sha256: sha };
      if (!assetRefs.has(ref.id)) {
        assetRefs.set(ref.id, ref);
        stagedBlobs.set(ref.id, blob);
        markDirty();
      }
      return { ok: true, ref };
    },
    releaseAsset(id) {
      if (assetRefs.delete(id)) {
        stagedBlobs.delete(id);
        markDirty();
      }
    },
    async getAsset(id) {
      return stagedBlobs.get(id) ?? store.getAsset(id);
    },
    setAutosave(enabled) {
      prefs = { ...prefs, autosave: enabled };
      savePrefs(prefs);
      if (!enabled) scheduler.cancel();
      else if (state.dirty) scheduler.touch();
      listeners.forEach((l) => l());
    },
    get autosave() {
      return prefs.autosave;
    },
  };
  return manager;
}

/** Hook React đọc trạng thái lưu (status, dirty, lỗi, xung đột) để UI hiển thị. */
export function usePersistState(manager: PersistManager): PersistState {
  return useSyncExternalStore(manager.subscribe, manager.getState, manager.getState);
}
