import { useCallback, useEffect, useRef, useState } from 'react';
import { PitchDetector } from 'pitchy';
import { api } from './api';
import type { Notice } from './api';

/*
 * Hợp đồng theo services/karaoke (route thật trong repo):
 *  GET  /api/karaoke/songs         -> [{id, title, artist, durationMs, notes: [{midi, startMs, durationMs}]}]
 *  POST /api/karaoke/scores {songId, score (0-100 nguyên), accuracy (0-1), durationMs (nguyên, tối đa 600000)}
 *    Điểm do frontend tính, server không tính lại. Giới hạn 30 lượt mỗi giờ (429).
 *  GET  /api/karaoke/leaderboard   -> [{userName, bestScore, plays, lastPlayedAt}]
 */

interface KaraokeNote {
  midi: number;
  startMs: number;
  durationMs: number;
}

interface KaraokeSong {
  id: string;
  title: string;
  artist?: string;
  notes: KaraokeNote[];
}

interface LeaderRow {
  userName: string;
  bestScore: number;
  plays: number;
}

type Phase = 'idle' | 'starting' | 'singing' | 'saving' | 'done';

interface LiveState {
  /** Thời gian từ lúc bắt đầu bài (ms). Âm trong lúc đếm lùi. */
  elapsedMs: number;
  targetMidi: number | null;
  singerMidi: number | null;
  inTune: boolean;
  livePct: number;
}

interface SessionResult {
  songTitle: string;
  score: number;
  accuracy: number;
  durationMs: number;
}

/** Một phiên hát đang chạy. Mọi tài nguyên đều nằm ở đây để dọn đúng lúc. */
interface Session {
  song: KaraokeSong;
  ctx: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  guide: GainNode;
  oscillators: OscillatorNode[];
  detector: ReturnType<typeof PitchDetector.forFloat32Array>;
  buffer: Float32Array;
  /** Mốc thời gian (theo đồng hồ AudioContext, giây) của lúc bắt đầu bài. */
  startCtxTime: number;
  durationMs: number;
  eligible: number;
  hits: number;
  lastUiMs: number;
  rafId: number | null;
  finished: boolean;
}

const HIT_CENTS = 50;
const MIN_CLARITY = 0.9;
/** Thời gian đếm lùi trước khi giai điệu bắt đầu (giây). */
const COUNTDOWN_S = 2;
/** Thêm một khoảng sau nốt cuối rồi mới kết thúc bài (ms). */
const TAIL_MS = 600;
const GUIDE_GAIN = 0.05;
const UI_EVERY_MS = 80;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const IDLE_LIVE: LiveState = { elapsedMs: 0, targetMidi: null, singerMidi: null, inTune: false, livePct: 0 };

/** Đổi tần số (Hz) sang số MIDI thực: midi = 69 + 12 * log2(f / 440). */
function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function midiName(midi: number): string {
  const m = Math.round(midi);
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/** Nốt đích đang phát tại thời điểm tMs (ms từ lúc bắt đầu bài). */
function targetAt(notes: KaraokeNote[], tMs: number): KaraokeNote | null {
  return notes.find((n) => tMs >= n.startMs && tMs < n.startMs + n.durationMs) ?? null;
}

function songLengthMs(notes: KaraokeNote[]): number {
  return notes.reduce((max, n) => Math.max(max, n.startMs + n.durationMs), 0);
}

function pitchRange(notes: KaraokeNote[]): { lo: number; hi: number } {
  if (notes.length === 0) return { lo: 48, hi: 72 };
  const midis = notes.map((n) => n.midi);
  return { lo: Math.min(...midis) - 2, hi: Math.max(...midis) + 2 };
}

function micErrorText(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Bạn chưa cho phép dùng micro. Bật quyền micro cho trang này rồi thử lại.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Không tìm thấy micro trên thiết bị này.';
  }
  if (name === 'NotReadableError') {
    return 'Micro đang được ứng dụng khác dùng. Đóng ứng dụng đó rồi thử lại.';
  }
  return 'Không mở được micro. Kiểm tra thiết bị và thử lại.';
}

/** Dừng và giải phóng mọi tài nguyên của phiên: vòng lặp, oscillator, micro, AudioContext. */
function releaseSession(s: Session) {
  s.finished = true;
  if (s.rafId !== null) cancelAnimationFrame(s.rafId);
  s.rafId = null;
  for (const osc of s.oscillators) {
    try {
      osc.stop();
    } catch {
      // Oscillator đã dừng: bỏ qua.
    }
    osc.disconnect();
  }
  s.source.disconnect();
  s.stream.getTracks().forEach((track) => track.stop());
  void s.ctx.close().catch(() => undefined);
}

export function KaraokePanel() {
  const [songs, setSongs] = useState<KaraokeSong[] | null>(null);
  const [songsError, setSongsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [activeSong, setActiveSong] = useState<KaraokeSong | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [live, setLive] = useState<LiveState>(IDLE_LIVE);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const mountedRef = useRef(false);

  const loadBoard = useCallback(async () => {
    const r = await api<LeaderRow[]>('/api/karaoke/leaderboard');
    if (!mountedRef.current) return;
    if (r.ok) {
      setBoard(Array.isArray(r.data) ? r.data : []);
      setBoardError(null);
    } else {
      setBoardError(r.error);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    api<KaraokeSong[]>('/api/karaoke/songs').then((r) => {
      if (!mountedRef.current) return;
      if (r.ok) {
        const list = Array.isArray(r.data) ? r.data : [];
        setSongs(list);
        setSelectedId(list[0]?.id ?? '');
      } else {
        setSongsError(r.error);
      }
    });
    void loadBoard();
    return () => {
      // Rời panel: dừng micro, nhạc nền và vòng lặp, không gửi điểm.
      mountedRef.current = false;
      const s = sessionRef.current;
      sessionRef.current = null;
      if (s) releaseSession(s);
    };
  }, [loadBoard]);

  const selected = songs?.find((song) => song.id === selectedId) ?? null;
  const busyPhase = phase === 'starting' || phase === 'singing' || phase === 'saving';

  const endSession = (s: Session) => {
    if (s.finished) return;
    const accuracy = s.eligible > 0 ? s.hits / s.eligible : 0;
    const score = Math.round(accuracy * 100);
    const durationMs = Math.round(s.durationMs);
    if (sessionRef.current === s) sessionRef.current = null;
    releaseSession(s);
    setPhase('saving');
    api<unknown>('/api/karaoke/scores', {
      method: 'POST',
      body: JSON.stringify({ songId: s.song.id, score, accuracy, durationMs }),
    }).then((r) => {
      if (!mountedRef.current) return;
      setResult({ songTitle: s.song.title, score, accuracy, durationMs });
      setNotice(r.ok ? { kind: 'ok', text: 'Đã lưu điểm.' } : { kind: 'err', text: `Chưa lưu được điểm: ${r.error}` });
      setPhase('done');
      void loadBoard();
    });
  };

  /** Vòng lặp mỗi khung hình: đọc micro, so cao độ với nốt đích, cập nhật điểm. */
  const scheduleFrame = (s: Session) => {
    s.rafId = requestAnimationFrame(() => {
      s.rafId = null;
      if (s.finished) return;
      const tMs = (s.ctx.currentTime - s.startCtxTime) * 1000;
      if (tMs >= s.durationMs + TAIL_MS) {
        endSession(s);
        return;
      }
      s.analyser.getFloatTimeDomainData(s.buffer);
      const [pitchHz, clarity] = s.detector.findPitch(s.buffer, s.ctx.sampleRate);
      const clear = clarity > MIN_CLARITY && pitchHz > 0;
      const singerMidi = clear ? hzToMidi(pitchHz) : null;
      const target = targetAt(s.song.notes, tMs);
      let inTune = false;
      // Chỉ tính khung có nốt đích đang phát và tín hiệu rõ (clarity > 0.9).
      if (target && singerMidi !== null) {
        s.eligible += 1;
        inTune = Math.abs((singerMidi - target.midi) * 100) < HIT_CENTS;
        if (inTune) s.hits += 1;
      }
      if (tMs - s.lastUiMs >= UI_EVERY_MS) {
        s.lastUiMs = tMs;
        setLive({
          elapsedMs: tMs,
          targetMidi: target ? target.midi : null,
          singerMidi,
          inTune,
          livePct: s.eligible > 0 ? Math.round((s.hits / s.eligible) * 100) : 0,
        });
      }
      scheduleFrame(s);
    });
  };

  const start = async () => {
    if (!selected || busyPhase || sessionRef.current) return;
    if (selected.notes.length === 0) {
      setNotice({ kind: 'err', text: 'Bài này chưa có nốt nhạc.' });
      return;
    }
    setNotice(null);
    setResult(null);
    const hasMic =
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function';
    if (!hasMic || typeof AudioContext === 'undefined') {
      setNotice({
        kind: 'err',
        text: 'Trình duyệt này không dùng được micro. Mở trang bằng http://127.0.0.1 hoặc https.',
      });
      return;
    }

    setPhase('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (mountedRef.current) {
        setNotice({ kind: 'err', text: micErrorText(err) });
        setPhase('idle');
      }
      return;
    }
    if (!mountedRef.current) {
      // Panel đã đóng trong lúc chờ quyền micro: trả micro ngay.
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const song = selected;
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    // Micro chỉ nối tới analyser, không nối tới loa, để tránh hú micro.
    source.connect(analyser);

    // Giai điệu nền: sóng triangle, âm lượng thấp.
    const guide = ctx.createGain();
    guide.gain.value = GUIDE_GAIN;
    guide.connect(ctx.destination);
    const startCtxTime = ctx.currentTime + COUNTDOWN_S;
    const oscillators: OscillatorNode[] = [];
    for (const note of song.notes) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = midiToHz(note.midi);
      osc.connect(guide);
      osc.start(startCtxTime + note.startMs / 1000);
      osc.stop(startCtxTime + (note.startMs + note.durationMs) / 1000);
      oscillators.push(osc);
    }

    const session: Session = {
      song,
      ctx,
      stream,
      source,
      analyser,
      guide,
      oscillators,
      detector: PitchDetector.forFloat32Array(analyser.fftSize),
      buffer: new Float32Array(analyser.fftSize),
      startCtxTime,
      durationMs: songLengthMs(song.notes),
      eligible: 0,
      hits: 0,
      lastUiMs: Number.NEGATIVE_INFINITY,
      rafId: null,
      finished: false,
    };
    sessionRef.current = session;
    setActiveSong(song);
    setLive({ ...IDLE_LIVE, elapsedMs: -COUNTDOWN_S * 1000 });
    setPhase('singing');
    scheduleFrame(session);
  };

  const stop = () => {
    const s = sessionRef.current;
    if (s) endSession(s);
  };

  const range = pitchRange(activeSong?.notes ?? []);
  const topPct = (midi: number) => ((range.hi - midi) / (range.hi - range.lo)) * 100;
  const singing = phase === 'singing';

  return (
    <div className="karaoke">
      <p className="muted small">
        Micro chỉ dùng được ở http://127.0.0.1 hoặc https. Nên đeo tai nghe để micro không thu tiếng nhạc nền.
      </p>

      {songsError && <p className="denied">{songsError}</p>}
      {!songs && !songsError && <p className="muted small">Đang tải thư viện bài hát…</p>}
      {songs && songs.length === 0 && <p className="muted small">Chưa có bài hát nào.</p>}

      {songs && songs.length > 0 && (
        <div className="form">
          <label>
            Chọn bài
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={busyPhase}>
              {songs.map((song) => (
                <option key={song.id} value={song.id}>
                  {song.title}
                  {song.artist ? ` · ${song.artist}` : ''}
                </option>
              ))}
            </select>
          </label>
          {singing ? (
            <button className="btn" type="button" onClick={stop}>
              Dừng và chấm điểm
            </button>
          ) : (
            <button className="btn" type="button" onClick={start} disabled={!selected || busyPhase}>
              {phase === 'starting' ? 'Đang xin quyền micro…' : phase === 'saving' ? 'Đang lưu điểm…' : 'Hát'}
            </button>
          )}
        </div>
      )}

      {singing && activeSong && (
        <section>
          <p className="small">
            {live.elapsedMs < 0 ? 'Chuẩn bị…' : 'Đang hát'} · {activeSong.title}
          </p>
          <div className="pitch-track" aria-hidden="true">
            {live.targetMidi !== null && (
              <div className="pitch-target" style={{ top: `${topPct(live.targetMidi)}%` }} />
            )}
            {live.singerMidi !== null && (
              <div
                className={`pitch-dot${live.inTune ? ' is-clear' : ''}`}
                style={{ top: `${topPct(live.singerMidi)}%` }}
              />
            )}
          </div>
          <p className="small">
            Nốt đích: {live.targetMidi !== null ? midiName(live.targetMidi) : '—'} · Giọng bạn:{' '}
            {live.singerMidi !== null ? midiName(live.singerMidi) : '—'}
          </p>
          <p className={live.inTune ? 'ok-text small' : 'muted small'}>
            {live.inTune ? 'Đúng nốt' : 'Lệch hoặc chưa có nốt'} · Tỉ lệ đúng tạm thời: {live.livePct}%
          </p>
        </section>
      )}

      {result && (
        <div>
          <p>
            <strong>
              Điểm: {result.score}/100
            </strong>{' '}
            · {result.songTitle}
          </p>
          <p className="small muted">
            Độ chính xác: {Math.round(result.accuracy * 100)}% · Thời lượng bài: {Math.round(result.durationMs / 1000)}{' '}
            giây
          </p>
        </div>
      )}
      {notice && <p className={notice.kind === 'ok' ? 'muted' : 'denied'}>{notice.text}</p>}

      <h3 className="small">Bảng xếp hạng</h3>
      {boardError && <p className="denied">{boardError}</p>}
      {!board && !boardError && <p className="muted small">Đang tải…</p>}
      {board && board.length === 0 && <p className="muted small">Chưa có điểm nào.</p>}
      {board && board.length > 0 && (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Người hát</th>
                <th>Điểm cao nhất</th>
                <th>Lượt</th>
              </tr>
            </thead>
            <tbody>
              {board.map((row, i) => (
                <tr key={`${row.userName}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{row.userName}</td>
                  <td>{row.bestScore}</td>
                  <td>{row.plays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
