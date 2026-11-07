import { useEffect, useState, useSyncExternalStore } from 'react';
import { useFocusTrap } from '../../../a11y/useFocusTrap';
import { holdPause } from '../../controls/session';
import { getObjectState, setObjectState, useObjectState } from '../objectStates';
import { computerNote, computerOf, computerWallpaper, NOTE_MAX, WALLPAPER_COUNT } from './computer';
import { closeComputerUi, formatClock, getComputerUi, loadNote, saveNote, subscribeComputerUi } from './computerUi';
import './computer.css';

const WALLPAPER_NAMES = ['Xanh dương', 'Xanh lá', 'Tím', 'Cam'] as const;

/** Mount một lần trong App: hiện màn hình máy tính khi `openComputerUi(id)` được gọi (hành động "Dùng máy tính"). */
export function ComputerPanel() {
  const id = useSyncExternalStore(subscribeComputerUi, getComputerUi, getComputerUi);
  return id === null ? null : <ComputerScreen key={id} id={id} />;
}

function ComputerScreen({ id }: { id: string }) {
  const state = computerOf(useObjectState(id));
  const [now, setNow] = useState(() => new Date());
  const [note, setNote] = useState(() => {
    // Ghi chú lưu localStorage là bản gốc; objectStates chỉ phản chiếu để vật khác đọc được.
    const saved = loadNote(id);
    return saved !== '' ? saved : computerOf(getObjectState(id)).note;
  });
  const [saved, setSaved] = useState('');
  const ref = useFocusTrap<HTMLElement>({ id: `panel:computer:${id}`, onClose: closeComputerUi });

  // Tạm dừng điều khiển nhân vật (W/A/S/D, chuột) trong lúc dùng máy.
  useEffect(() => holdPause('computer'), []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Máy bị tắt hoặc đăng xuất từ nơi khác thì đóng panel.
  useEffect(() => {
    if (!state.on || state.user === '') closeComputerUi();
  }, [state.on, state.user]);

  const onNote = (text: string) => {
    const v = text.slice(0, NOTE_MAX);
    setNote(v);
    const ok = saveNote(id, v);
    const p = computerNote(computerOf(getObjectState(id)), v);
    if (p) setObjectState(id, p);
    setSaved(ok ? 'Đã lưu ghi chú' : 'Không lưu được ghi chú trên trình duyệt này');
  };

  const clock = formatClock(now);
  return (
    <section
      ref={ref}
      className="computer-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="computer-title"
      data-wallpaper={state.wallpaper % WALLPAPER_COUNT}
    >
      <header className="computer-head">
        <h2 id="computer-title" className="computer-title">
          Máy tính
        </h2>
        <span className="computer-user">Người dùng: {state.user}</span>
        <button type="button" className="computer-btn" onClick={closeComputerUi} aria-label="Đóng máy tính">
          Đóng (Esc)
        </button>
      </header>
      <div className="computer-clock" role="timer" aria-label="Đồng hồ">
        <span className="computer-time">{clock.time}</span>
        <span className="computer-date">{clock.date}</span>
      </div>
      <label className="computer-note-label" htmlFor="computer-note">
        Ghi chú (tối đa {NOTE_MAX} ký tự)
      </label>
      <textarea
        id="computer-note"
        className="computer-note"
        value={note}
        maxLength={NOTE_MAX}
        rows={6}
        onChange={(e) => onNote(e.target.value)}
      />
      <p className="computer-status" role="status" aria-live="polite">
        {saved || `${note.length}/${NOTE_MAX}`}
      </p>
      <div className="computer-actions">
        <button
          type="button"
          className="computer-btn"
          onClick={() => setObjectState(id, computerWallpaper(computerOf(getObjectState(id))))}
        >
          Đổi hình nền: {WALLPAPER_NAMES[state.wallpaper % WALLPAPER_COUNT]}
        </button>
        <button type="button" className="computer-btn" onClick={closeComputerUi}>
          Tắt máy
        </button>
      </div>
    </section>
  );
}
