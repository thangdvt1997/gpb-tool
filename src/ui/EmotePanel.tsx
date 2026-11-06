import { useEffect, useState, useSyncExternalStore } from 'react';
import { getPreferences, setReactBump } from '../auth/api';
import '../emotes/emotes.css';
import { EMOTES, EMOTE_ORDER } from '../emotes/library';
import { cancelEmote, getEmoteState, playEmote, subscribeEmote } from '../emotes/player';

interface Props {
  onClose: () => void;
  /** Báo cho cha khi cài đặt reactBump được lưu thành công. */
  onReactBumpChange?: (enabled: boolean) => void;
}

/** Bảng chọn emote. Chỉ tác động lên chính mình. */
export function EmotePanel({ onClose, onReactBumpChange }: Props) {
  const state = useSyncExternalStore(subscribeEmote, getEmoteState, getEmoteState);
  const [reactBump, setBump] = useState(true);
  const [bumpBusy, setBumpBusy] = useState(true);
  const [bumpError, setBumpError] = useState('');

  useEffect(() => {
    let alive = true;
    getPreferences()
      .then((p) => {
        if (alive) setBump(p.reactBump);
      })
      .catch(() => {
        if (alive) setBumpError('Không tải được cài đặt phản ứng khi bị va. Đang dùng mặc định: bật.');
      })
      .finally(() => {
        if (alive) setBumpBusy(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const toggleBump = async (next: boolean) => {
    const prev = reactBump;
    setBump(next);
    setBumpBusy(true);
    setBumpError('');
    try {
      const saved = await setReactBump(next);
      setBump(saved.reactBump);
      onReactBumpChange?.(saved.reactBump);
    } catch {
      setBump(prev);
      setBumpError('Không lưu được cài đặt. Thử lại.');
    } finally {
      setBumpBusy(false);
    }
  };

  return (
    <aside className="emote-panel ui-panel ui-panel-float" role="dialog" aria-label="Biểu cảm">
      <header className="ui-panel-header">
        <h2 className="ui-panel-title">Biểu cảm</h2>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={onClose} aria-label="Đóng bảng biểu cảm">
          ✕
        </button>
      </header>
      <ul className="emote-grid">
        {EMOTE_ORDER.map((id) => {
          const def = EMOTES[id];
          const active = state.id === id;
          return (
            <li key={id}>
              <button
                type="button"
                className="ui-btn ui-btn-tile"
                aria-pressed={active}
                aria-keyshortcuts={def.hotkey}
                onClick={() => playEmote(id)}
              >
                <span className="emote-label">{def.label}</span>
                <kbd className="ui-kbd">{def.hotkey}</kbd>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="ui-btn ui-btn-block emote-stop" onClick={cancelEmote} disabled={state.phase === 'idle'}>
        Dừng biểu cảm
      </button>
      <label className="ui-check emote-toggle">
        <input
          type="checkbox"
          role="switch"
          checked={reactBump}
          disabled={bumpBusy}
          onChange={(e) => void toggleBump(e.target.checked)}
        />
        <span>Phản ứng khi bị va</span>
      </label>
      <div aria-live="polite" aria-atomic="true">
        {bumpError && <div className="ui-banner ui-banner-warn">{bumpError}</div>}
      </div>
      <p className="ui-hint emote-hint">Phím 1 đến 6. Di chuyển sẽ dừng emote, trừ Tấn.</p>
    </aside>
  );
}
