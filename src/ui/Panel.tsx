import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Role, ZoneObject } from '../content/types';
import { STATUS_TEXT, statusColor, useServices } from '../data/useServices';
import { api } from './api';
import type { Notice } from './api';
import { GamesPanel } from './GamesPanel';
import { KaraokePanel } from './KaraokePanel';
import { EventsPanel } from './EventsPanel';
import { CheckinBoardBody } from './CheckinPanel';
import { ModerationPanel } from './ModerationPanel';
import { ReportButton } from './ReportButton';

interface Props {
  obj: ZoneObject;
  role: Role;
  onClose: () => void;
}

export function Panel({ obj, role, onClose }: Props) {
  const allowed = obj.roles.includes(role);
  return (
    <aside className="panel" role="dialog" aria-label={obj.label}>
      <header className="panel-head">
        <h2>{obj.label}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Đóng panel">
          ✕
        </button>
      </header>
      {obj.description && <p className="muted">{obj.description}</p>}
      {allowed ? (
        // key theo id: đổi sang vật thể khác thì panel dựng lại, không giữ trạng thái cũ.
        <Body key={obj.id} obj={obj} role={role} />
      ) : (
        <p className="denied">Vai trò hiện tại không có quyền xem khu này.</p>
      )}
    </aside>
  );
}

function Body({ obj, role }: { obj: ZoneObject; role: Role }) {
  switch (obj.action) {
    case 'noc':
      return <NocBody />;
    case 'service_desk':
      return <TicketForm />;
    case 'soc':
      return <SocBody />;
    case 'booking':
      return <BookingBody capacity={obj.capacity} defaultRoomId={obj.id} />;
    case 'kudos':
      return <KudosBody />;
    case 'notice':
      return <NoticeBody />;
    case 'server_room':
      return <p className="muted">Sơ đồ rack chỉ đọc. Trạng thái node sẽ nối API ở bước sau.</p>;
    case 'squad':
      return <p className="muted">Đầu mối và lịch on-call của squad sẽ nối dữ liệu ở bước sau.</p>;
    case 'games':
      return <GamesPanel />;
    case 'karaoke':
      return <KaraokePanel />;
    case 'events':
      return <EventsPanel role={role} />;
    case 'checkin_board':
      return <CheckinBoardBody role={role} />;
    case 'moderation':
      return <ModerationPanel role={role} />;
    default:
      // 'info': mô tả đã hiển thị phía trên.
      return null;
  }
}

function NocBody() {
  const { services, error, loaded } = useServices();
  if (!loaded) return <p className="muted">Đang tải trạng thái…</p>;
  if (error) return <p className="denied">Không tải được trạng thái dịch vụ ({error}). Thử lại sau.</p>;
  return (
    <>
      <p className="muted small">Làm mới mỗi 30 giây.</p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Dịch vụ</th>
            <th>Trạng thái</th>
            <th>Cập nhật</th>
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id}>
              <td>
                {s.name}
                <div className="muted small">{s.owner}</div>
              </td>
              <td>
                <span className="chip" style={{ borderColor: statusColor[s.status] }}>
                  <i style={{ background: statusColor[s.status] }} />
                  {STATUS_TEXT[s.status]}
                </span>
              </td>
              <td className="small">{new Date(s.updatedAt).toLocaleTimeString('vi-VN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const CATEGORIES = ['Tài khoản / mật khẩu', 'Phần mềm', 'Phần cứng', 'Mạng', 'Khác'];

function TicketForm() {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'P3' | 'P2'>('P3');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const r = await api<{ ok: boolean; ticketId: string }>('/api/it/tickets', {
      method: 'POST',
      body: JSON.stringify({ category, title, description, priority }),
    });
    setBusy(false);
    if (r.ok) {
      setNotice({ kind: 'ok', text: `Đã gửi yêu cầu. Mã: ${r.data.ticketId}` });
      setTitle('');
      setDescription('');
    } else {
      setNotice({ kind: 'err', text: r.error });
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Loại yêu cầu
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Tiêu đề
        <input required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Mô tả (tùy chọn)
        <textarea rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label>
        Mức ưu tiên
        <select value={priority} onChange={(e) => setPriority(e.target.value as 'P3' | 'P2')}>
          <option value="P3">P3 · thấp</option>
          <option value="P2">P2 · cao</option>
        </select>
      </label>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Đang gửi…' : 'Gửi yêu cầu'}
      </button>
      {notice && <p className={notice.kind === 'ok' ? 'muted' : 'denied'}>{notice.text}</p>}
    </form>
  );
}

interface SecuritySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  updatedAt: string;
  note?: string;
}

function SocBody() {
  const [data, setData] = useState<SecuritySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<SecuritySummary>('/api/it/security/summary').then((r) => {
      if (r.ok) setData(r.data);
      else setError(r.status === 403 ? 'Không có quyền xem tóm tắt SOC.' : r.error);
    });
  }, []);

  if (error) return <p className="denied">{error}</p>;
  if (!data) return <p className="muted">Đang tải tóm tắt…</p>;
  return (
    <>
      {data.note && <p className="muted small">{data.note}</p>}
      <ul className="kv">
        <li>Nghiêm trọng: {data.critical}</li>
        <li>Cao: {data.high}</li>
        <li>Trung bình: {data.medium}</li>
        <li>Thấp: {data.low}</li>
        <li className="muted small">Cập nhật: {new Date(data.updatedAt).toLocaleString('vi-VN')}</li>
      </ul>
    </>
  );
}

interface Room {
  id: string;
  name: string;
  capacity: number;
  zone: string;
}

/** Chuyển giá trị ô datetime-local sang ISO UTC. Trả về null nếu rỗng hoặc sai. */
function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function BookingBody({ capacity, defaultRoomId }: { capacity?: number; defaultRoomId: string }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [title, setTitle] = useState('');
  const [roomId, setRoomId] = useState(defaultRoomId);
  const [free, setFree] = useState<Room[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    api<Room[]>('/api/rooms').then((r) => {
      if (!r.ok) return;
      setRooms(r.data);
      // Phòng trên bản vẽ có thể chưa có trong dịch vụ đặt phòng: chọn phòng đầu tiên có thật.
      setRoomId((prev) => (r.data.some((x) => x.id === prev) ? prev : (r.data[0]?.id ?? prev)));
    });
  }, []);

  const window_ = () => {
    const s = toIso(start);
    const e = toIso(end);
    if (!s || !e) {
      setNotice({ kind: 'err', text: 'Chọn đủ giờ bắt đầu và giờ kết thúc.' });
      return null;
    }
    return { start: s, end: e };
  };

  const findFree = async () => {
    const w = window_();
    if (!w) return;
    setBusy(true);
    setNotice(null);
    const r = await api<Room[]>(`/api/rooms/free?${new URLSearchParams(w).toString()}`);
    setBusy(false);
    if (r.ok) {
      setFree(r.data);
      if (r.data.length === 0) setNotice({ kind: 'err', text: 'Không có phòng trống trong khoảng này.' });
      else if (!r.data.some((x) => x.id === roomId)) setRoomId(r.data[0].id);
    } else {
      setNotice({ kind: 'err', text: r.error });
    }
  };

  const book = async (e: FormEvent) => {
    e.preventDefault();
    const w = window_();
    if (!w) return;
    setBusy(true);
    setNotice(null);
    const r = await api<{ ok: boolean; bookingId: string }>('/api/rooms/book', {
      method: 'POST',
      body: JSON.stringify({ roomId, ...w, title }),
    });
    setBusy(false);
    if (r.ok) {
      setNotice({ kind: 'ok', text: `Đã đặt phòng. Mã: ${r.data.bookingId}` });
      setFree(null);
    } else {
      setNotice({ kind: 'err', text: r.error });
    }
  };

  const options = free ?? rooms;

  return (
    <form className="form" onSubmit={book}>
      {capacity !== undefined && <p className="muted small">Sức chứa: {capacity} chỗ.</p>}
      <label>
        Bắt đầu
        <input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label>
        Kết thúc
        <input type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <button className="btn btn-ghost" type="button" onClick={findFree} disabled={busy}>
        Tìm phòng trống
      </button>
      <label>
        Phòng
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          {options.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.capacity} chỗ)
            </option>
          ))}
        </select>
      </label>
      <label>
        Nội dung cuộc họp
        <input required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Đang xử lý…' : 'Đặt phòng'}
      </button>
      {notice && <p className={notice.kind === 'ok' ? 'muted' : 'denied'}>{notice.text}</p>}
    </form>
  );
}

interface KudosItem {
  id: number;
  fromName: string;
  toName: string;
  message: string;
  createdAt: string;
}

function KudosBody() {
  const [board, setBoard] = useState<KudosItem[]>([]);
  const [toName, setToName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = () => {
    api<KudosItem[]>('/api/kudos/board').then((r) => {
      if (r.ok) setBoard(r.data);
    });
  };

  useEffect(load, []);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const r = await api<{ ok: boolean; id: number }>('/api/kudos', {
      method: 'POST',
      body: JSON.stringify({ toName, message }),
    });
    setBusy(false);
    if (r.ok) {
      setNotice({ kind: 'ok', text: 'Đã gửi lời cảm ơn.' });
      setMessage('');
      load();
    } else {
      setNotice({ kind: 'err', text: r.error });
    }
  };

  return (
    <>
      <form className="form" onSubmit={send}>
        <label>
          Gửi tới
          <input required minLength={2} maxLength={80} value={toName} onChange={(e) => setToName(e.target.value)} />
        </label>
        <label>
          Lời nhắn (tối đa 140 ký tự)
          <textarea required rows={3} maxLength={140} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Đang gửi…' : 'Gửi vinh danh'}
        </button>
        {notice && <p className={notice.kind === 'ok' ? 'muted' : 'denied'}>{notice.text}</p>}
      </form>
      <h3 className="small">Vinh danh gần đây</h3>
      <ul className="kv">
        {board.map((k) => (
          <li key={k.id}>
            <strong>{k.toName}</strong> <span className="muted small">từ {k.fromName}</span>
            <div>{k.message}</div>
            <ReportButton
              contentType="kudos"
              contentId={k.id}
              snapshot={`${k.fromName} gửi ${k.toName}: ${k.message}`}
              ariaLabel={`lời vinh danh gửi ${k.toName}`}
            />
          </li>
        ))}
        {board.length === 0 && <li className="muted small">Chưa có vinh danh nào.</li>}
      </ul>
    </>
  );
}

interface Incident {
  id: string;
  severity: string;
  title: string;
  startedAt: string;
}

function NoticeBody() {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Incident[]>('/api/it/incidents/open').then((r) => {
      if (r.ok) setIncidents(r.data);
      else setError(r.error);
    });
  }, []);

  if (error) return <p className="denied">{error}</p>;
  if (!incidents) return <p className="muted">Đang tải…</p>;
  return (
    <>
      <h3 className="small">Sự cố đang mở</h3>
      <ul className="kv">
        {incidents.map((i) => (
          <li key={i.id}>
            <strong>[{i.severity}]</strong> {i.title}
            <div className="muted small">Bắt đầu: {new Date(i.startedAt).toLocaleString('vi-VN')}</div>
          </li>
        ))}
        {incidents.length === 0 && <li className="muted small">Không có sự cố đang mở.</li>}
      </ul>
    </>
  );
}
