/**
 * Panel thư viện asset: ô tìm không dấu, lọc loại/tag/giấy phép, sắp xếp, phân trang, lưới thẻ,
 * chi tiết, yêu thích và gần đây. Điều hướng bàn phím: mũi tên di chuyển giữa thẻ, Enter mở chi tiết,
 * F bật yêu thích, Esc đóng chi tiết/panel.
 * Chưa có backend: tải lên chỉ lưu IndexedDB trong trình duyệt (mục "Của tôi"), không gửi lên máy chủ.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { KIND_LABELS, LIBRARY_KINDS, type LibraryItem, type LibraryKind } from './types';
import { collectFacets, runQuery, type SortKey } from './query';
import { formatBytes } from './text';
import { loadFavorites, loadRecent, pruneIds, pushRecent, toggleFavorite } from './storage';
import { buildDefaultLibrary } from './sources';
import { thumbnailFor } from './thumbnail';
import { addUpload, createIdbAssetStore, createMemoryAssetStore, userItemFromRecord, type UserAssetStore } from './upload';

// Viewer nạp lười để không kéo three/drei vào bundle khi chưa mở chi tiết có GLB.
const AssetViewer = lazy(() => import('./AssetViewer').then((m) => ({ default: m.AssetViewer })));

const COLUMNS = 3;

export interface LibraryPanelProps {
  onClose?: () => void;
  /** Cho phép test/nơi khác truyền danh sách riêng; mặc định dùng catalog trong repo. */
  items?: readonly LibraryItem[];
  /** Kho asset tự tải lên (mặc định IndexedDB, hoặc bộ nhớ nếu trình duyệt không có). */
  userStore?: UserAssetStore;
}

import { useReturnFocus } from '../a11y/useReturnFocus';
import { useEscapeClose } from '../a11y/useEscapeClose';
export function LibraryPanel({ onClose, items: given, userStore }: LibraryPanelProps) {
  useReturnFocus();
  const store = useMemo(() => userStore ?? createIdbAssetStore() ?? createMemoryAssetStore(), [userStore]);
  const [mine, setMine] = useState<LibraryItem[]>([]);
  const [upMsg, setUpMsg] = useState('');
  const [upErr, setUpErr] = useState('');
  const urls = useRef(new Map<string, string>());
  const fileRef = useRef<HTMLInputElement>(null);
  const refreshMine = useCallback(async () => {
    try {
      const recs = await store.list();
      const next = recs.map((r) => {
        let u = urls.current.get(r.id);
        if (!u) {
          u = URL.createObjectURL(r.data);
          urls.current.set(r.id, u);
        }
        return userItemFromRecord(r, u);
      });
      for (const [id, u] of urls.current) if (!recs.some((r) => r.id === id)) {
        URL.revokeObjectURL(u);
        urls.current.delete(id);
      }
      setMine(next);
    } catch {
      setUpErr('Không đọc được kho tệp tự tải lên của trình duyệt.');
    }
  }, [store]);
  useEffect(() => {
    void refreshMine();
    const m = urls.current;
    return () => {
      m.forEach((u) => URL.revokeObjectURL(u));
      m.clear();
    };
  }, [refreshMine]);
  async function onUpload(file: File | undefined) {
    if (!file) return;
    setUpMsg('');
    setUpErr('');
    const r = await addUpload(file, store);
    if (fileRef.current) fileRef.current.value = '';
    if (!r.ok) return setUpErr(`Từ chối "${file.name}": ${r.error}`);
    setUpMsg(`Đã thêm "${r.record.name}" vào mục Của tôi.`);
    await refreshMine();
  }
  async function onDelete(it: LibraryItem) {
    await store.remove(it.id);
    if (selected === it.id) setSelected(null);
    setUpErr('');
    setUpMsg(`Đã xóa "${it.name}".`);
    await refreshMine();
  }
  const lib = useMemo(() => (given ? { items: [...given], duplicates: [] as string[] } : buildDefaultLibrary()), [given]);
  const byId = useMemo(() => new Map([...lib.items, ...mine].map((i) => [i.id, i])), [lib, mine]);
  const facets = useMemo(() => collectFacets(lib.items), [lib]);

  const [text, setText] = useState('');
  const [kind, setKind] = useState<LibraryKind | ''>('');
  const [tag, setTag] = useState('');
  const [license, setLicense] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [onlyFav, setOnlyFav] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [favs, setFavs] = useState<string[]>(() => pruneIds(loadFavorites(), new Set(lib.items.map((i) => i.id))));
  const [recent, setRecent] = useState<string[]>(() => pruneIds(loadRecent(), new Set(lib.items.map((i) => i.id))));
  const gridRef = useRef<HTMLUListElement>(null);

  const result = useMemo(() => {
    const base = runQuery(lib.items, {
      text,
      kinds: kind ? [kind] : [],
      tags: tag ? [tag] : [],
      licenses: license ? [license === '(thiếu)' ? '' : license] : [],
      sort,
      page: 1,
      pageSize: 100000,
    });
    const list = onlyFav ? base.items.filter((i) => favs.includes(i.id)) : base.items;
    const pageSize = 12;
    const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
    const p = Math.min(page, pageCount);
    return { items: list.slice((p - 1) * pageSize, p * pageSize), total: list.length, page: p, pageCount };
  }, [lib, text, kind, tag, license, sort, onlyFav, favs, page]);

  useEffect(() => setPage(1), [text, kind, tag, license, sort, onlyFav]);
  useEffect(() => setFocusIdx(0), [result.page, result.total]);

  const open = useCallback((id: string) => {
    setSelected(id);
    setRecent(pushRecent(id));
  }, []);

  const onGridKey = (e: KeyboardEvent) => {
    const n = result.items.length;
    if (!n) return;
    let next = focusIdx;
    if (e.key === 'ArrowRight') next = Math.min(n - 1, focusIdx + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, focusIdx - 1);
    else if (e.key === 'ArrowDown') next = Math.min(n - 1, focusIdx + COLUMNS);
    else if (e.key === 'ArrowUp') next = Math.max(0, focusIdx - COLUMNS);
    else if (e.key === 'Enter') {
      const it = result.items[focusIdx];
      if (it) open(it.id);
      e.preventDefault();
      return;
    } else if (e.key === 'f' || e.key === 'F') {
      const it = result.items[focusIdx];
      if (it) setFavs(toggleFavorite(it.id));
      return;
    } else return;
    e.preventDefault();
    setFocusIdx(next);
    gridRef.current?.querySelectorAll<HTMLElement>('[data-card]')[next]?.focus();
  };

  // Esc: đang xem chi tiết thì về lưới, không thì đóng thư viện (cả khi focus còn ở nút mở).
  useEscapeClose(() => (selected ? setSelected(null) : onClose?.()));

  const sel = selected ? byId.get(selected) : undefined;

  return (
    <section role="dialog" aria-modal="false" aria-label="Thư viện asset" style={rootStyle}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Thư viện asset ({lib.items.length})</h2>
        {onClose && <button onClick={onClose} aria-label="Đóng thư viện">Đóng</button>}
      </header>
      <p style={{ margin: '4px 0', fontSize: 12, color: '#9aa8c7' }}>
        Danh mục tĩnh trong repo. Chưa có máy chủ: quản trị chia sẻ, tải lên và xuất bản chưa khả dụng.
        {lib.duplicates.length > 0 && ` Cảnh báo: ${lib.duplicates.length} ID trùng.`}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }} role="search">
        <input type="search" aria-label="Tìm asset" placeholder="Tìm (không cần dấu)..." value={text} onChange={(e) => setText(e.target.value)} />
        <select aria-label="Lọc theo loại" value={kind} onChange={(e) => setKind(e.target.value as LibraryKind | '')}>
          <option value="">Mọi loại</option>
          {LIBRARY_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
        </select>
        <select aria-label="Lọc theo tag" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">Mọi tag</option>
          {facets.tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select aria-label="Lọc theo giấy phép" value={license} onChange={(e) => setLicense(e.target.value)}>
          <option value="">Mọi giấy phép</option>
          {facets.licenses.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select aria-label="Sắp xếp" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="name">Tên</option>
          <option value="kind">Loại</option>
          <option value="size">Dung lượng</option>
          <option value="triangles">Số tam giác</option>
        </select>
        <label><input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} /> Yêu thích</label>
      </div>
      {recent.length > 0 && (
        <p style={{ margin: '2px 0', fontSize: 12 }}>
          Gần đây:{' '}
          {recent.slice(0, 5).map((id) => (
            <button key={id} onClick={() => open(id)} style={{ marginRight: 4, fontSize: 11 }}>{byId.get(id)?.name ?? id}</button>
          ))}
        </p>
      )}
      <p aria-live="polite" style={{ margin: '4px 0', fontSize: 12 }}>
        {result.total} kết quả, trang {result.page}/{result.pageCount}
      </p>
      <ul ref={gridRef} role="listbox" aria-label="Danh sách asset" onKeyDown={onGridKey} style={gridStyle}>
        {result.items.map((it, i) => (
          <li
            key={it.id}
            data-card
            role="option"
            aria-selected={selected === it.id}
            tabIndex={i === focusIdx ? 0 : -1}
            onClick={() => open(it.id)}
            style={{ ...cardStyle, opacity: it.usable ? 1 : 0.6, outline: selected === it.id ? '2px solid #4f8cff' : undefined }}
          >
            <Thumb item={it} />
            <div style={{ minWidth: 0 }}>
              <strong style={{ fontSize: 13 }}>{favs.includes(it.id) ? '★ ' : ''}{it.name}</strong>
              <div style={{ fontSize: 11, color: '#9aa8c7' }}>{KIND_LABELS[it.kind]}{it.bytes !== null ? ` · ${formatBytes(it.bytes)}` : ''}</div>
              {!it.usable && <div style={{ fontSize: 11, color: '#f2b632' }}>Không dùng được</div>}
            </div>
          </li>
        ))}
      </ul>
      {result.items.length === 0 && <p>Không có asset khớp bộ lọc.</p>}
      <section aria-label="Của tôi" style={{ borderTop: '1px solid #2a3555', marginTop: 8, paddingTop: 6 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>Của tôi ({mine.length})</h3>
        <p style={{ margin: '2px 0', fontSize: 12, color: '#9aa8c7' }}>
          Tải tệp .glb/.gltf (tối đa 10 MB). Tệp chỉ lưu trong trình duyệt này, không gửi lên máy chủ.
        </p>
        <label style={{ fontSize: 12 }}>
          Tải lên GLB/glTF{' '}
          <input ref={fileRef} type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" aria-label="Tải lên tệp GLB hoặc glTF" onChange={(e) => void onUpload(e.target.files?.[0])} />
        </label>
        <div role="status" style={{ fontSize: 12, minHeight: 16 }}>{upMsg}</div>
        <div role="alert" style={{ fontSize: 12, color: '#ff7b7b' }}>{upErr}</div>
        {mine.length === 0 ? (
          <p style={{ fontSize: 12, margin: '2px 0' }}>Chưa có tệp tự tải lên.</p>
        ) : (
          <ul aria-label="Asset của tôi" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {mine.map((it) => (
              <li key={it.id} data-mine style={{ ...cardStyle, cursor: 'default', display: 'flex', gap: 8, alignItems: 'center', outline: selected === it.id ? '2px solid #4f8cff' : undefined }}>
                <Thumb item={it} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 13 }}>{it.name}</strong>
                  <div style={{ fontSize: 11, color: '#f2b632' }}>Chưa có giấy phép / tự tải lên · {formatBytes(it.bytes)}</div>
                </div>
                <button onClick={() => open(it.id)} aria-label={`Xem ${it.name}`}>Xem</button>
                <button onClick={() => void onDelete(it)} aria-label={`Xóa ${it.name}`}>Xóa</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <nav aria-label="Phân trang" style={{ display: 'flex', gap: 8, margin: '6px 0' }}>
        <button disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>Trước</button>
        <button disabled={result.page >= result.pageCount} onClick={() => setPage(result.page + 1)}>Sau</button>
      </nav>
      {sel && (
        <article aria-label={`Chi tiết ${sel.name}`} style={{ borderTop: '1px solid #2a3555', paddingTop: 8 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{sel.name}</h3>
          <p style={{ margin: '2px 0', fontSize: 13 }}>{sel.description}</p>
          <ul style={{ fontSize: 12, margin: '4px 0', paddingLeft: 16 }}>
            <li>ID: {sel.id}{sel.version ? ` (v${sel.version})` : ''}</li>
            <li>Loại: {KIND_LABELS[sel.kind]}; nguồn dữ liệu: {sel.source}</li>
            <li>Giấy phép: {sel.license?.spdx || 'THIẾU'}{sel.license ? ` · ${sel.license.source}` : ''}{sel.license && !sel.license.verified ? ' (chưa kiểm chứng)' : ''}</li>
            <li>Tệp: {sel.file ?? 'không có (dựng bằng mã)'}; dung lượng {formatBytes(sel.bytes)}; tam giác {sel.triangles ?? 'không rõ'}</li>
            <li>Tag: {sel.tags.join(', ') || '(không có)'}</li>
          </ul>
          {sel.reasons.map((r) => <p key={r} role="alert" style={{ color: '#ff7b7b', margin: '2px 0', fontSize: 12 }}>Không dùng được: {r}</p>)}
          {sel.warnings.map((w) => <p key={w} style={{ color: '#f2b632', margin: '2px 0', fontSize: 12 }}>Cảnh báo: {w}</p>)}
          <button onClick={() => setFavs(toggleFavorite(sel.id))}>{favs.includes(sel.id) ? 'Bỏ yêu thích' : 'Yêu thích'}</button>
          {sel.file && sel.usable && (
            <Suspense fallback={<p>Đang tải bộ xem 3D...</p>}>
              <AssetViewer item={sel} />
            </Suspense>
          )}
        </article>
      )}
    </section>
  );
}

const rootStyle: CSSProperties = { background: '#171e33', color: '#e8edf7', padding: 12, borderRadius: 10, maxWidth: 560, maxHeight: '90vh', overflow: 'auto' };
const gridStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`, gap: 6 };
const cardStyle: CSSProperties = { border: '1px solid #2a3555', borderRadius: 8, padding: 8, cursor: 'pointer', minHeight: 72 };

/** Ảnh thu nhỏ cỡ cố định (không nhảy layout), nạp lười. */
function Thumb({ item }: { item: LibraryItem }) {
  const t = thumbnailFor(item);
  return <img src={t.src} alt={t.alt} width={t.width} height={t.height} loading="lazy" decoding="async" data-thumb style={{ display: 'block', width: t.width, height: t.height, borderRadius: 8, flex: 'none', marginBottom: 4 }} />;
}
