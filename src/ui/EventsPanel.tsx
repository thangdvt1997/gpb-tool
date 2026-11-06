import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Role } from '../content/types';
import { api } from './api';
import type { Notice } from './api';
import { ReportButton } from './ReportButton';

/*
 * Hợp đồng theo services/events (route thật trong repo):
 *  GET  /api/events                              -> [{id, title, description?, startsAt, endsAt, status, programCount}]
 *  GET  /api/events/:id                          -> {event, programs: [{id, performer, title, kind, durationMin, createdAt}]}
 *  POST /api/events/:id/programs {performer, title, kind, durationMin}   durationMin từ 1 đến 30
 *  POST /api/events/:id/vote {programId}         -> 409 khi đã bình chọn
 *  GET  /api/events/:id/results                  -> [{programId, performer, title, votes}] (403 khi chưa được xem)
 *  POST /api/events {title, startsAt, endsAt}    (chỉ it, admin)
 *  POST /api/events/:id/close                    (chỉ it, admin)
 */

interface EventSummary {
  id: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  status: string;
  programCount?: number;
}

interface ProgramEntry {
  id: number;
  performer: string;
  title: string;
  kind: string;
  durationMin: number;
  createdAt?: string;
}

interface EventDetail {
  event: EventSummary;
  programs: ProgramEntry[];
}

interface ResultRow {
  programId: number;
  performer?: string;
  title: string;
  votes: number;
}

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: 'singing', label: 'Ca hát' },
  { value: 'dance', label: 'Múa' },
  { value: 'poem', label: 'Ngâm thơ' },
  { value: 'game', label: 'Trò chơi' },
  { value: 'other', label: 'Khác' },
];

const STATUS_LABEL: Record<string, string> = {
  open: 'Đang mở',
  closed: 'Đã đóng',
};

const MAX_DURATION_MIN = 30;

function kindLabel(kind: string): string {
  return KIND_OPTIONS.find((k) => k.value === kind)?.label ?? kind;
}

function formatTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN');
}

/** Giá trị ô datetime-local chuyển sang ISO UTC; null nếu rỗng hoặc sai. */
function localToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function EventsPanel({ role }: { role: Role }) {
  const canManage = role === 'it' || role === 'admin';

  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listTick, setListTick] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailTick, setDetailTick] = useState(0);
  // Số phiếu theo tiết mục, lấy từ /results. Chỉ có khi máy chủ cho xem.
  const [votesByProgram, setVotesByProgram] = useState<Map<number, number>>(new Map());

  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [closeArmed, setCloseArmed] = useState(false);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Form đăng ký tiết mục
  const [performer, setPerformer] = useState('');
  const [progTitle, setProgTitle] = useState('');
  const [kind, setKind] = useState('singing');
  const [durationMin, setDurationMin] = useState('5');

  // Form tạo sự kiện (it, admin)
  const [newTitle, setNewTitle] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [createNotice, setCreateNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let alive = true;
    api<EventSummary[]>('/api/events').then((r) => {
      if (!alive) return;
      if (r.ok) {
        setEvents(Array.isArray(r.data) ? r.data : []);
        setListError(null);
      } else {
        setListError(r.error);
      }
    });
    return () => {
      alive = false;
    };
  }, [listTick]);

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    Promise.all([
      api<EventDetail>(`/api/events/${selectedId}`),
      api<ResultRow[]>(`/api/events/${selectedId}/results`),
    ]).then(([detailRes, resultRes]) => {
      if (!alive) return;
      if (detailRes.ok) {
        setDetail(detailRes.data);
        setDetailError(null);
      } else {
        setDetail(null);
        setDetailError(detailRes.error);
      }
      if (resultRes.ok && Array.isArray(resultRes.data)) {
        setVotesByProgram(new Map(resultRes.data.map((row): [number, number] => [row.programId, row.votes])));
      } else {
        setVotesByProgram(new Map());
      }
    });
    return () => {
      alive = false;
    };
  }, [selectedId, detailTick]);

  const selectEvent = (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    setVotesByProgram(new Map());
    setResults(null);
    setResultsError(null);
    setCloseArmed(false);
    setNotice(null);
    setDetailTick((t) => t + 1);
  };

  const loadResults = async () => {
    if (!selectedId) return;
    setBusy(true);
    const r = await api<ResultRow[]>(`/api/events/${selectedId}/results`);
    setBusy(false);
    if (r.ok) {
      setResults(Array.isArray(r.data) ? r.data : []);
      setResultsError(null);
    } else {
      // Lỗi 403 (chưa được xem kết quả) dùng đúng thông báo tiếng Việt từ máy chủ.
      setResults(null);
      setResultsError(r.error);
    }
  };

  const submitProgram = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    const minutes = Number(durationMin);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_DURATION_MIN) {
      setNotice({ kind: 'err', text: `Thời lượng phải là số nguyên từ 1 đến ${MAX_DURATION_MIN} phút.` });
      return;
    }
    setBusy(true);
    setNotice(null);
    const r = await api<unknown>(`/api/events/${selectedId}/programs`, {
      method: 'POST',
      body: JSON.stringify({ performer, title: progTitle, kind, durationMin: minutes }),
    });
    setBusy(false);
    if (r.ok) {
      setNotice({ kind: 'ok', text: 'Đã đăng ký tiết mục.' });
      setPerformer('');
      setProgTitle('');
      setDetailTick((t) => t + 1);
    } else {
      setNotice({ kind: 'err', text: r.error });
    }
  };

  const vote = async (programId: number) => {
    if (!selectedId) return;
    setBusy(true);
    setNotice(null);
    const r = await api<unknown>(`/api/events/${selectedId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ programId }),
    });
    setBusy(false);
    if (r.ok) {
      setNotice({ kind: 'ok', text: 'Đã ghi nhận bình chọn của bạn.' });
      setDetailTick((t) => t + 1);
    } else if (r.status === 409) {
      setNotice({ kind: 'err', text: 'Bạn đã bình chọn trong sự kiện này rồi.' });
    } else {
      setNotice({ kind: 'err', text: r.error });
    }
  };

  const createEvent = async (e: FormEvent) => {
    e.preventDefault();
    const startsAt = localToIso(newStart);
    const endsAt = localToIso(newEnd);
    if (!startsAt || !endsAt || new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      setCreateNotice({ kind: 'err', text: 'Chọn giờ bắt đầu và giờ kết thúc hợp lệ (kết thúc sau bắt đầu).' });
      return;
    }
    setBusy(true);
    setCreateNotice(null);
    const r = await api<unknown>('/api/events', {
      method: 'POST',
      body: JSON.stringify({ title: newTitle, startsAt, endsAt }),
    });
    setBusy(false);
    if (r.ok) {
      setCreateNotice({ kind: 'ok', text: 'Đã tạo sự kiện.' });
      setNewTitle('');
      setNewStart('');
      setNewEnd('');
      setListTick((t) => t + 1);
    } else {
      setCreateNotice({ kind: 'err', text: r.error });
    }
  };

  const closeEvent = async () => {
    if (!selectedId) return;
    // Thao tác không hoàn tác được: bấm lần đầu để xác nhận, bấm lần hai mới đóng.
    if (!closeArmed) {
      setCloseArmed(true);
      return;
    }
    setBusy(true);
    setNotice(null);
    const r = await api<unknown>(`/api/events/${selectedId}/close`, { method: 'POST' });
    setBusy(false);
    setCloseArmed(false);
    if (r.ok) {
      setNotice({ kind: 'ok', text: 'Đã đóng sự kiện.' });
      setDetailTick((t) => t + 1);
      setListTick((t) => t + 1);
    } else {
      setNotice({ kind: 'err', text: r.error });
    }
  };

  const programs = detail?.programs ?? [];

  return (
    <div className="events">
      <h3 className="small">Sự kiện</h3>
      {listError && <p className="denied">{listError}</p>}
      {!events && !listError && <p className="muted small">Đang tải sự kiện…</p>}
      {events && events.length === 0 && <p className="muted small">Chưa có sự kiện nào.</p>}
      <ul className="kv">
        {events?.map((ev) => (
          <li key={ev.id} className="row-item">
            <button
              type="button"
              className={`tab-btn${ev.id === selectedId ? ' active' : ''}`}
              aria-pressed={ev.id === selectedId}
              onClick={() => selectEvent(ev.id)}
            >
              {ev.title}
            </button>
            <span className="muted small">
              {STATUS_LABEL[ev.status] ?? ev.status} · {ev.programCount ?? 0} tiết mục
            </span>
          </li>
        ))}
      </ul>

      {selectedId && (
        <section>
          {detailError && <p className="denied">{detailError}</p>}
          {!detail && !detailError && <p className="muted small">Đang tải chương trình…</p>}

          {detail && (
            <>
              <div className="row-item">
                <h3 className="small">{detail.event.title}</h3>
                <ReportButton
                  contentType="event"
                  contentId={detail.event.id}
                  snapshot={`${detail.event.title}${detail.event.description ? `: ${detail.event.description}` : ''}`}
                  ariaLabel={`sự kiện ${detail.event.title}`}
                />
              </div>
              <p className="muted small">
                {STATUS_LABEL[detail.event.status] ?? detail.event.status}
                {detail.event.startsAt ? ` · Bắt đầu: ${formatTime(detail.event.startsAt)}` : ''}
              </p>

              <h3 className="small">Chương trình</h3>
              {programs.length === 0 && <p className="muted small">Chưa có tiết mục nào.</p>}
              {programs.length > 0 && (
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Tiết mục</th>
                        <th>Loại</th>
                        <th>Phút</th>
                        <th>Phiếu</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {programs.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.title}</strong>
                            <div className="muted small">{p.performer}</div>
                          </td>
                          <td className="small">{kindLabel(p.kind)}</td>
                          <td className="small">{p.durationMin}</td>
                          <td className="small">{votesByProgram.get(p.id) ?? '—'}</td>
                          <td>
                            <button
                              className="btn btn-ghost"
                              type="button"
                              disabled={busy || detail.event.status === 'closed'}
                              onClick={() => vote(p.id)}
                            >
                              Bình chọn
                            </button>
                            <ReportButton
                              contentType="program"
                              contentId={p.id}
                              snapshot={`${p.title} (${p.performer})`}
                              ariaLabel={`tiết mục ${p.title}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="row-item">
                <button className="btn btn-ghost" type="button" onClick={loadResults} disabled={busy}>
                  Xem kết quả
                </button>
              </div>
              {resultsError && <p className="denied">{resultsError}</p>}
              {results && (
                <ul className="kv">
                  {results.map((row) => (
                    <li key={row.programId}>
                      {row.title}: <strong>{row.votes}</strong> phiếu
                    </li>
                  ))}
                  {results.length === 0 && <li className="muted small">Chưa có tiết mục nào.</li>}
                </ul>
              )}

              {detail.event.status !== 'closed' && (
                <>
                  <h3 className="small">Đăng ký tiết mục</h3>
                  <form className="form" onSubmit={submitProgram}>
                    <label>
                      Người biểu diễn
                      <input
                        required
                        minLength={2}
                        maxLength={80}
                        value={performer}
                        onChange={(e) => setPerformer(e.target.value)}
                      />
                    </label>
                    <label>
                      Tên tiết mục
                      <input
                        required
                        minLength={3}
                        maxLength={120}
                        value={progTitle}
                        onChange={(e) => setProgTitle(e.target.value)}
                      />
                    </label>
                    <label>
                      Loại tiết mục
                      <select value={kind} onChange={(e) => setKind(e.target.value)}>
                        {KIND_OPTIONS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Thời lượng (phút, tối đa {MAX_DURATION_MIN})
                      <input
                        type="number"
                        required
                        min={1}
                        max={MAX_DURATION_MIN}
                        step={1}
                        value={durationMin}
                        onChange={(e) => setDurationMin(e.target.value)}
                      />
                    </label>
                    <button className="btn" type="submit" disabled={busy}>
                      Đăng ký tiết mục
                    </button>
                  </form>
                </>
              )}

              {canManage && detail.event.status !== 'closed' && (
                <div className="row-item">
                  <button className="btn btn-ghost" type="button" onClick={closeEvent} disabled={busy}>
                    {closeArmed ? 'Bấm lần nữa để đóng sự kiện' : 'Đóng sự kiện'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {notice && <p className={notice.kind === 'ok' ? 'muted' : 'denied'}>{notice.text}</p>}

      {canManage && (
        <section>
          <h3 className="small">Tạo sự kiện mới</h3>
          <form className="form" onSubmit={createEvent}>
            <label>
              Tên sự kiện
              <input
                required
                minLength={3}
                maxLength={120}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </label>
            <label>
              Bắt đầu (phải ở tương lai)
              <input type="datetime-local" required value={newStart} onChange={(e) => setNewStart(e.target.value)} />
            </label>
            <label>
              Kết thúc (trong vòng 24 giờ)
              <input type="datetime-local" required value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
            </label>
            <button className="btn" type="submit" disabled={busy}>
              Tạo sự kiện
            </button>
          </form>
          {createNotice && <p className={createNotice.kind === 'ok' ? 'muted' : 'denied'}>{createNotice.text}</p>}
        </section>
      )}
    </div>
  );
}
