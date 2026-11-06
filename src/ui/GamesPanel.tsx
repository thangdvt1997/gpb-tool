import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from './api';
import type { Notice } from './api';

/*
 * Hợp đồng theo services/games (route thật trong repo):
 *  GET  /api/games/caro/rooms                    -> [{id, name, status, players, createdAt}] (chỉ phòng đang chờ)
 *  POST /api/games/caro/rooms {name}             -> 201, trạng thái phòng có id
 *  GET  /api/games/caro/rooms/:id                -> trạng thái phòng
 *  POST /api/games/caro/rooms/:id/join           -> 409 nếu đủ người hoặc đã ở trong phòng
 *  POST /api/games/caro/rooms/:id/move {row, col} -> row, col từ 0 đến 14
 *  POST /api/games/caro/rooms/:id/leave          -> đang chơi thì tính là thua
 *  POST /api/games/quiz/round                    -> 201 {roundId, questions: [{id, text, choices}]}
 *  POST /api/games/quiz/round/:roundId/answer {questionId, choice} -> {ok: true} (không lộ đáp án)
 *  POST /api/games/quiz/round/:roundId/finish    -> {score, total, results: [{questionId, correctIndex, chosen}]}
 *  GET  /api/games/leaderboard?kind=caro|quiz    -> [{userName, points, games}]
 */

type Side = 'x' | 'o';
type Mark = 'X' | 'O';
type RoomStatus = 'waiting' | 'playing' | 'finished';
type GameTab = 'caro' | 'quiz' | 'board';
type BoardKind = 'caro' | 'quiz';

const BOARD_SIZE = 15;
const POLL_MS = 2000;
const ALREADY_IN_ROOM = 'Bạn đã ở trong phòng này';

const SIDE_MARK: Record<Side, Mark> = { x: 'X', o: 'O' };

const TABS: { id: GameTab; label: string }[] = [
  { id: 'caro', label: 'Cờ caro' },
  { id: 'quiz', label: 'Đố vui' },
  { id: 'board', label: 'Bảng xếp hạng' },
];

const BOARD_KINDS: { id: BoardKind; label: string }[] = [
  { id: 'caro', label: 'Cờ caro' },
  { id: 'quiz', label: 'Đố vui' },
];

const STATUS_LABEL: Record<RoomStatus, string> = {
  waiting: 'Chờ người chơi',
  playing: 'Đang chơi',
  finished: 'Đã kết thúc',
};

interface PlayerRef {
  id: string;
  name: string;
}

interface Players {
  x: PlayerRef | null;
  o: PlayerRef | null;
}

interface CaroRoomSummary {
  id: string;
  name: string;
  status: RoomStatus;
  players: Players;
  createdAt: string;
}

interface CaroRoom {
  id: string;
  name: string;
  status: RoomStatus;
  players: Players;
  /** BOARD_SIZE chuỗi, mỗi chuỗi BOARD_SIZE ký tự: 'X', 'O' hoặc '.' (ô trống). */
  board: string[];
  turn: Side | null;
  winner: Side | 'draw' | null;
  moveCount: number;
  updatedAt: string;
}

interface QuizQuestion {
  id: number;
  text: string;
  choices: string[];
}

interface QuizRound {
  roundId: string;
  questions: QuizQuestion[];
}

interface QuizAnswerAck {
  ok: boolean;
}

/** Một câu đã trả lời, chỉ có trong kết quả khi kết thúc ván. */
interface QuizResultRow {
  questionId: number;
  /** Chỉ số đáp án đúng trong choices. */
  correctIndex: number;
  /** Chỉ số lựa chọn của người chơi trong choices. */
  chosen: number;
}

interface QuizFinish {
  score: number;
  total: number;
  results: QuizResultRow[];
}

interface LeaderRow {
  userName: string;
  points: number;
  games: number;
}

/** Ô (r, c) của bàn cờ: 'X', 'O', hoặc null nếu trống hoặc dữ liệu không hợp lệ. */
function cellAt(board: string[] | undefined, r: number, c: number): Mark | null {
  const ch = board?.[r]?.[c];
  return ch === 'X' || ch === 'O' ? ch : null;
}

function sideName(players: Players | undefined, side: Side): string {
  const p = players?.[side];
  return p ? p.name : 'chờ người chơi';
}

export function GamesPanel() {
  const [tab, setTab] = useState<GameTab>('caro');
  // Phòng cờ đang vào được giữ ở đây, để khi đổi tab rồi quay lại vẫn về đúng phòng.
  const [caroRoomId, setCaroRoomId] = useState<string | null>(null);

  return (
    <div className="games">
      <div className="tabs" role="tablist" aria-label="Chọn trò chơi">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`games-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="games-tabpanel"
            className={`tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="games-tabpanel" aria-labelledby={`games-tab-${tab}`}>
        {tab === 'caro' && <CaroTab roomId={caroRoomId} onRoomChange={setCaroRoomId} />}
        {tab === 'quiz' && <QuizTab />}
        {tab === 'board' && <LeaderboardTab />}
      </div>
    </div>
  );
}

/* ---------------------------------- Cờ caro ---------------------------------- */

interface CaroTabProps {
  roomId: string | null;
  onRoomChange: (id: string | null) => void;
}

function CaroTab({ roomId, onRoomChange }: CaroTabProps) {
  if (roomId) {
    return <CaroRoomView key={roomId} roomId={roomId} onLeft={() => onRoomChange(null)} />;
  }
  return <CaroLobby onEnter={onRoomChange} />;
}

function CaroLobby({ onEnter }: { onEnter: (id: string) => void }) {
  const [rooms, setRooms] = useState<CaroRoomSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const loadRooms = useCallback(async () => {
    const r = await api<CaroRoomSummary[]>('/api/games/caro/rooms');
    if (r.ok) {
      setRooms(Array.isArray(r.data) ? r.data : []);
      setListError(null);
    } else {
      setListError(r.error);
    }
  }, []);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const r = await api<CaroRoom>('/api/games/caro/rooms', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (!r.ok) {
      setNotice({ kind: 'err', text: r.error });
      return;
    }
    setName('');
    const id = r.data?.id;
    if (id) onEnter(id);
    else void loadRooms();
  };

  const join = async (id: string) => {
    setBusy(true);
    setNotice(null);
    const r = await api<CaroRoom>(`/api/games/caro/rooms/${id}/join`, { method: 'POST' });
    setBusy(false);
    // Phòng do chính mình tạo vẫn nằm trong danh sách: vào lại thay vì báo lỗi.
    if (r.ok || (r.status === 409 && r.error === ALREADY_IN_ROOM)) onEnter(id);
    else setNotice({ kind: 'err', text: r.error });
  };

  return (
    <>
      <form className="form" onSubmit={create}>
        <label>
          Tên phòng mới
          <input required minLength={2} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn" type="submit" disabled={busy}>
          Tạo phòng
        </button>
      </form>
      {notice && <p className={notice.kind === 'ok' ? 'muted' : 'denied'}>{notice.text}</p>}

      <h3 className="small">Danh sách phòng</h3>
      {listError && <p className="denied">{listError}</p>}
      {!rooms && !listError && <p className="muted small">Đang tải phòng…</p>}
      <ul className="kv">
        {rooms?.map((room) => (
          <li key={room.id} className="row-item">
            <span>
              <strong>{room.name}</strong>{' '}
              <span className="muted small">
                {room.players?.x ? `chủ phòng ${room.players.x.name} · ` : ''}
                {STATUS_LABEL[room.status] ?? room.status}
              </span>
            </span>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => join(room.id)}
              disabled={busy || room.status === 'finished'}
            >
              Vào phòng
            </button>
          </li>
        ))}
        {rooms && rooms.length === 0 && <li className="muted small">Chưa có phòng nào. Tạo phòng mới để bắt đầu.</li>}
      </ul>
    </>
  );
}

function CaroRoomView({ roomId, onLeft }: { roomId: string; onLeft: () => void }) {
  const [room, setRoom] = useState<CaroRoom | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaveArmed, setLeaveArmed] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const status = room?.status;

  const refresh = useCallback(async () => {
    const r = await api<CaroRoom>(`/api/games/caro/rooms/${roomId}`);
    if (r.ok) {
      setRoom(r.data);
      setLoadError(null);
    } else if (r.status === 404) {
      setGone(true);
      setLoadError('Phòng không còn tồn tại.');
    } else {
      setLoadError(r.error);
    }
  }, [roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Làm mới mỗi 2 giây khi phòng chưa kết thúc. Cleanup dọn interval khi rời phòng hoặc đóng panel.
  useEffect(() => {
    if (status === 'finished' || gone) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [status, gone, refresh]);

  const play = async (row: number, col: number) => {
    if (!room || room.status !== 'playing' || busy) return;
    setBusy(true);
    setNotice(null);
    const r = await api<CaroRoom>(`/api/games/caro/rooms/${roomId}/move`, {
      method: 'POST',
      body: JSON.stringify({ row, col }),
    });
    setBusy(false);
    if (r.ok) await refresh();
    else setNotice({ kind: 'err', text: r.error });
  };

  const leave = async () => {
    // Đang chơi thì rời phòng bị tính là thua: hỏi xác nhận bằng hai lần bấm.
    if (room?.status === 'playing' && !leaveArmed) {
      setLeaveArmed(true);
      setNotice({ kind: 'err', text: 'Đang chơi: rời phòng sẽ tính là thua. Bấm "Rời phòng" lần nữa để xác nhận.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    const r = await api<CaroRoom>(`/api/games/caro/rooms/${roomId}/leave`, { method: 'POST' });
    setBusy(false);
    setLeaveArmed(false);
    if (r.ok || r.status === 404) onLeft();
    else setNotice({ kind: 'err', text: r.error });
  };

  let statusText = '';
  if (room) {
    const winner = room.winner;
    if (room.status === 'waiting') {
      statusText = 'Chờ người chơi thứ hai vào phòng.';
    } else if (room.status === 'playing') {
      statusText = room.turn
        ? `Lượt: ${SIDE_MARK[room.turn]} (${sideName(room.players, room.turn)})`
        : 'Đang chơi.';
    } else if (winner === 'draw') {
      statusText = 'Kết quả: hòa.';
    } else if (winner === 'x' || winner === 'o') {
      statusText = `Kết quả: ${SIDE_MARK[winner]} thắng (${sideName(room.players, winner)}).`;
    } else {
      statusText = 'Ván đã kết thúc.';
    }
  }

  return (
    <section>
      <div className="row-item">
        <h3 className="small">{room?.name ?? 'Phòng cờ caro'}</h3>
        <button className="btn btn-ghost" type="button" onClick={leave} disabled={busy}>
          Rời phòng
        </button>
      </div>
      {loadError && <p className="denied">{loadError}</p>}
      {!room && !loadError && <p className="muted small">Đang tải phòng…</p>}
      {room && (
        <>
          <p className="small">
            X: {sideName(room.players, 'x')} · O: {sideName(room.players, 'o')}
          </p>
          <p className="small">{statusText}</p>
          <div className="caro-grid">
            {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => {
              const r = Math.floor(i / BOARD_SIZE);
              const c = i % BOARD_SIZE;
              const mark = cellAt(room.board, r, c);
              const cls = `caro-cell${mark === 'X' ? ' is-x' : mark === 'O' ? ' is-o' : ''}`;
              return (
                <button
                  key={i}
                  type="button"
                  className={cls}
                  aria-label={`hàng ${r} cột ${c}`}
                  disabled={busy || room.status !== 'playing' || mark !== null}
                  onClick={() => play(r, c)}
                >
                  {mark ?? ''}
                </button>
              );
            })}
          </div>
        </>
      )}
      {notice && <p className={notice.kind === 'ok' ? 'muted' : 'denied'}>{notice.text}</p>}
    </section>
  );
}

/* ---------------------------------- Đố vui ----------------------------------- */

function QuizTab() {
  const [round, setRound] = useState<QuizRound | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [finalResult, setFinalResult] = useState<QuizFinish | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const start = async () => {
    setBusy(true);
    setNotice(null);
    const r = await api<QuizRound>('/api/games/quiz/round', { method: 'POST' });
    setBusy(false);
    if (!r.ok) {
      setNotice({ kind: 'err', text: r.error });
      return;
    }
    if (!r.data || !Array.isArray(r.data.questions) || r.data.questions.length === 0) {
      setNotice({ kind: 'err', text: 'Máy chủ không trả về câu hỏi nào.' });
      return;
    }
    setRound(r.data);
    setIndex(0);
    setPicked(null);
    setFinalResult(null);
  };

  const answer = async (choice: number) => {
    if (!round || picked !== null || busy) return;
    const question = round.questions[index];
    setBusy(true);
    setNotice(null);
    const r = await api<QuizAnswerAck>(`/api/games/quiz/round/${round.roundId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ questionId: question.id, choice }),
    });
    setBusy(false);
    if (!r.ok) {
      setNotice({ kind: 'err', text: r.error });
      return;
    }
    if (!r.data?.ok) {
      setNotice({ kind: 'err', text: 'Máy chủ chưa ghi nhận câu trả lời.' });
      return;
    }
    // Không hiện đúng hay sai ở đây: đáp án chỉ hiện khi kết thúc ván.
    setPicked(choice);
  };

  const next = async () => {
    if (!round || picked === null || busy) return;
    if (index + 1 < round.questions.length) {
      setIndex(index + 1);
      setPicked(null);
      return;
    }
    // Đã hết câu: kết thúc vòng và lấy điểm từ máy chủ.
    setBusy(true);
    setNotice(null);
    const r = await api<QuizFinish>(`/api/games/quiz/round/${round.roundId}/finish`, { method: 'POST' });
    setBusy(false);
    if (!r.ok) {
      setNotice({ kind: 'err', text: r.error });
      return;
    }
    if (!r.data || typeof r.data.score !== 'number') {
      setNotice({ kind: 'err', text: 'Máy chủ không trả về điểm.' });
      return;
    }
    setFinalResult(r.data);
  };

  const total = round?.questions.length ?? 0;
  const question = round && finalResult === null ? round.questions[index] : null;
  const questionById = new Map<number, QuizQuestion>((round?.questions ?? []).map((q): [number, QuizQuestion] => [q.id, q]));
  const results: QuizResultRow[] = finalResult && Array.isArray(finalResult.results) ? finalResult.results : [];
  const unanswered = finalResult ? Math.max(0, finalResult.total - results.length) : 0;

  return (
    <div className="quiz">
      {!round && (
        <p className="muted small">
          Chọn đáp án cho từng câu rồi bấm "Câu tiếp". Đáp án đúng và điểm sẽ hiện khi kết thúc ván.
        </p>
      )}

      {round && finalResult && (
        <>
          <p>
            <strong>Kết thúc vòng.</strong> Điểm của bạn: {finalResult.score}/{finalResult.total}.
          </p>
          {results.length === 0 ? (
            <p className="muted small">Bạn chưa trả lời câu nào nên ván này không được tính điểm.</p>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Câu hỏi</th>
                    <th>Bạn chọn</th>
                    <th>Đáp án đúng</th>
                    <th>Kết quả</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => {
                    const q = questionById.get(row.questionId);
                    const isRight = row.chosen === row.correctIndex;
                    return (
                      <tr key={row.questionId}>
                        <td>{q?.text ?? `Câu ${row.questionId}`}</td>
                        <td>{q?.choices[row.chosen] ?? ''}</td>
                        <td>{q?.choices[row.correctIndex] ?? ''}</td>
                        <td className={isRight ? 'ok-text' : 'denied'}>{isRight ? 'Đúng' : 'Sai'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {unanswered > 0 && (
            <p className="muted small">{unanswered} câu chưa trả lời được tính là sai.</p>
          )}
        </>
      )}

      {question && (
        <>
          <p className="small muted">
            Câu {index + 1}/{total}
          </p>
          <p>
            <strong>{question.text}</strong>
          </p>
          <div className="quiz-choices">
            {question.choices.map((choice, i) => (
              <button
                key={i}
                type="button"
                className="quiz-choice"
                aria-pressed={picked === i}
                disabled={picked !== null || busy}
                onClick={() => answer(i)}
              >
                {choice}
                {picked === i ? ' (bạn chọn)' : ''}
              </button>
            ))}
          </div>
          {picked !== null && <p className="muted">Đã ghi nhận.</p>}
          <button className="btn" type="button" onClick={next} disabled={picked === null || busy}>
            {index + 1 < total ? 'Câu tiếp' : 'Kết thúc ván'}
          </button>
        </>
      )}

      {(!round || finalResult) && (
        <button className="btn" type="button" onClick={start} disabled={busy}>
          {round ? 'Chơi lại' : 'Bắt đầu'}
        </button>
      )}

      {notice && <p className={notice.kind === 'ok' ? 'muted' : 'denied'}>{notice.text}</p>}
    </div>
  );
}

/* ----------------------------- Bảng xếp hạng --------------------------------- */

function LeaderboardTab() {
  const [kind, setKind] = useState<BoardKind>('caro');
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(null);
    api<LeaderRow[]>(`/api/games/leaderboard?kind=${kind}`).then((r) => {
      if (!alive) return;
      if (r.ok) setRows(Array.isArray(r.data) ? r.data : []);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [kind]);

  return (
    <>
      <div className="tabs" role="group" aria-label="Loại bảng xếp hạng">
        {BOARD_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            className={`tab-btn${kind === k.id ? ' active' : ''}`}
            aria-pressed={kind === k.id}
            onClick={() => setKind(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>
      {error && <p className="denied">{error}</p>}
      {!rows && !error && <p className="muted small">Đang tải…</p>}
      {rows && rows.length === 0 && <p className="muted small">Chưa có điểm nào.</p>}
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Người chơi</th>
                <th>Điểm</th>
                <th>Ván</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.userName}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{row.userName}</td>
                  <td>{row.points}</td>
                  <td>{row.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
