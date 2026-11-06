import { useCallback, useEffect, useRef, useState } from 'react';
import { acceptDuel, declineDuel, getDuelInbox, getMyId, inviteDuel, searchDirectory } from './api';
import { secondsLeft, useNow } from './DuelBanner';
import { INVITE_TTL_MS } from './types';
import type { DirectoryEntry, Duel, DuelMode } from './types';
import './duel.css';

export interface DuelPanelProps {
  onClose: () => void;
  /** Nếu không truyền, panel tự lấy từ /api/auth/me. */
  currentUserId?: string;
  /** Gọi khi người dùng chấp nhận lời mời và trận bắt đầu. */
  onDuelStart?: (duel: Duel) => void;
}

const MODES: { value: DuelMode; label: string; hint: string }[] = [
  { value: 'fight', label: 'Đấu', hint: 'Có thanh máu, hết máu thì nằm đỡ 30 giây' },
  { value: 'dance', label: 'Nhảy', hint: 'Cùng nhảy một điệu, ai rời thì kết thúc' },
];

function expiresAt(d: Duel): string | null {
  if (!d.createdAt) return null;
  const t = Date.parse(d.createdAt);
  return Number.isNaN(t) ? null : new Date(t + INVITE_TTL_MS).toISOString();
}

export function DuelPanel({ onClose, currentUserId, onDuelStart }: DuelPanelProps) {
  const [myId, setMyId] = useState<string | null>(currentUserId ?? null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DirectoryEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<DuelMode>('fight');
  const [inbox, setInbox] = useState<Duel[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  const now = useNow(inbox.length > 0);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    if (currentUserId) {
      setMyId(currentUserId);
      return;
    }
    let live = true;
    void getMyId().then((r) => {
      if (live && r.ok) setMyId(r.data);
    });
    return () => {
      live = false;
    };
  }, [currentUserId]);

  const rememberNames = useCallback((list: DirectoryEntry[]) => {
    setNames((prev) => {
      const next = { ...prev };
      for (const e of list) next[e.id] = e.name;
      return next;
    });
  }, []);

  const refreshInbox = useCallback(async () => {
    const r = await getDuelInbox();
    if (r.ok) setInbox(r.data.filter((d) => d.status === 'invited'));
    else if (r.status === 401 || r.status === 429) setErrMsg(r.error);
  }, []);

  useEffect(() => {
    void refreshInbox();
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshInbox();
    }, 3000);
    return () => window.clearInterval(t);
  }, [refreshInbox]);

  // Tìm nhân viên theo tên, chờ 300ms sau lần gõ cuối.
  useEffect(() => {
    const q = query.trim();
    if (q === '') {
      setResults([]);
      setSearching(false);
      return;
    }
    let live = true;
    setSearching(true);
    const t = window.setTimeout(async () => {
      const r = await searchDirectory(q);
      if (!live) return;
      setSearching(false);
      if (r.ok) {
        setResults(r.data.filter((e) => e.id !== myId));
        rememberNames(r.data);
        setErrMsg('');
      } else {
        setResults([]);
        setErrMsg(r.error);
      }
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [query, myId, rememberNames]);

  async function invite(e: DirectoryEntry) {
    setBusyId(e.id);
    setOkMsg('');
    setErrMsg('');
    const r = await inviteDuel(e.id, mode);
    setBusyId(null);
    if (r.ok) {
      setOkMsg(`Đã gửi lời mời ${mode === 'fight' ? 'đấu' : 'nhảy'} tới ${e.name}. Lời mời hết hạn sau 30 giây.`);
      void refreshInbox();
    } else {
      setErrMsg(r.error);
    }
  }

  async function respond(d: Duel, accept: boolean) {
    setBusyId(d.id);
    setOkMsg('');
    setErrMsg('');
    const r = accept ? await acceptDuel(d.id) : await declineDuel(d.id);
    setBusyId(null);
    if (r.ok) {
      setOkMsg(accept ? 'Đã chấp nhận. Trận bắt đầu.' : 'Đã từ chối lời mời.');
      if (accept) onDuelStart?.(r.data);
    } else {
      setErrMsg(r.error);
    }
    void refreshInbox();
  }

  function nameOf(d: Duel, otherId: string, fromServer: string | null): string {
    return names[otherId] ?? fromServer ?? 'Một đồng nghiệp';
  }

  const incoming = inbox.filter((d) => d.inviteeId === myId);
  const outgoing = inbox.filter((d) => d.inviterId === myId);

  return (
    <section className="ui-panel duel-panel" aria-labelledby="duel-title">
      <header className="ui-panel-header">
        <h2 id="duel-title" className="ui-panel-title">
          Thi đấu
        </h2>
        <button ref={closeRef} type="button" className="ui-btn ui-btn-ghost" onClick={onClose}>
          Đóng
        </button>
      </header>

      <p className="ui-hint duel-lead">Chỉ khi đối phương chấp nhận thì trận mới bắt đầu.</p>

      <div className="duel-notices">
        <div aria-live="polite" aria-atomic="true">
          {okMsg && <p className="ui-banner ui-banner-ok">{okMsg}</p>}
        </div>
        <div aria-live="assertive" aria-atomic="true">
          {errMsg && <p className="ui-banner ui-banner-danger">{errMsg}</p>}
        </div>
      </div>

      <h3 className="ui-subhead">Lời mời đến</h3>
      {incoming.length === 0 ? (
        <p className="ui-empty">Chưa có lời mời nào.</p>
      ) : (
        <ul className="ui-list duel-list">
          {incoming.map((d) => {
            const secs = secondsLeft(expiresAt(d), now);
            const who = nameOf(d, d.inviterId, d.inviterName);
            return (
              <li key={d.id} className="ui-list-item">
                <div className="ui-list-item-main">
                  <span className="ui-list-item-title">{who}</span>
                  <span className="ui-list-item-meta">
                    mời bạn {d.mode === 'fight' ? 'đấu' : 'nhảy'},{' '}
                    {secs > 0 ? `còn ${secs} giây` : 'đã hết hạn'}
                  </span>
                </div>
                <div className="ui-list-item-actions">
                  <button
                    type="button"
                    className="ui-btn ui-btn-primary"
                    disabled={busyId === d.id || secs === 0}
                    onClick={() => void respond(d, true)}
                    aria-label={`Chấp nhận lời mời của ${who}`}
                  >
                    Chấp nhận
                  </button>
                  <button
                    type="button"
                    className="ui-btn"
                    disabled={busyId === d.id}
                    onClick={() => void respond(d, false)}
                    aria-label={`Từ chối lời mời của ${who}`}
                  >
                    Từ chối
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {outgoing.length > 0 && (
        <>
          <h3 className="ui-subhead">Lời mời đã gửi</h3>
          <ul className="ui-list duel-list">
            {outgoing.map((d) => {
              const secs = secondsLeft(expiresAt(d), now);
              return (
                <li key={d.id} className="ui-list-item">
                  <div className="ui-list-item-main">
                    <span className="ui-list-item-title">{nameOf(d, d.inviteeId, d.inviteeName)}</span>
                    <span className="ui-list-item-meta">
                      {d.mode === 'fight' ? 'đấu' : 'nhảy'}, {secs > 0 ? `đang chờ, còn ${secs} giây` : 'đã hết hạn'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h3 className="ui-subhead">Mời đồng nghiệp</h3>
      <fieldset className="ui-fieldset">
        <legend>Chế độ</legend>
        <div className="ui-list">
        {MODES.map((m) => (
          <label key={m.value} className="ui-list-item duel-mode">
            <input
              type="radio"
              name="duel-mode"
              value={m.value}
              checked={mode === m.value}
              onChange={() => setMode(m.value)}
            />
            <span className="ui-list-item-main">
              <span className="ui-list-item-title">{m.label}</span>
              <span className="ui-list-item-meta">{m.hint}</span>
            </span>
          </label>
        ))}
        </div>
      </fieldset>

      <div className="ui-field">
        <label className="ui-label" htmlFor="duel-search">
          Tìm theo tên
        </label>
        <input
          id="duel-search"
          className="ui-input"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nhập tên nhân viên"
        />
      </div>

      <div className="ui-hint duel-status" aria-live="polite">
        {searching ? 'Đang tìm...' : query.trim() !== '' && results.length === 0 && !errMsg ? 'Không thấy ai khớp.' : ''}
      </div>

      <ul className="ui-list duel-list">
        {results.map((e) => (
          <li key={e.id} className="ui-list-item">
            <div className="ui-list-item-main">
              <span className="ui-list-item-title">{e.name}</span>
              {e.email && <span className="ui-list-item-meta">{e.email}</span>}
            </div>
            <div className="ui-list-item-actions">
              <button
                type="button"
                className="ui-btn ui-btn-primary"
                disabled={busyId === e.id}
                onClick={() => void invite(e)}
                aria-label={`Mời ${e.name} ${mode === 'fight' ? 'đấu' : 'nhảy'}`}
              >
                Mời
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
