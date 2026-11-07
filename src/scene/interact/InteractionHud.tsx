import { useEffect, useState } from 'react';
import { activateFocus, chooseAction, closeMenu, useInteractionSnapshot } from './controller';
import { updateInteractSettings, useInteractSettings } from './settings';
import { resetAllObjects } from './objects/resetObjects';
import './interaction.css';

/** Thiết bị cảm ứng (con trỏ thô hoặc có điểm chạm). Theo dõi đổi chế độ (máy lai, giả lập DevTools). */
const TOUCH_QUERY = '(pointer: coarse)';

function detectTouch(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // Điện thoại/máy tính bảng: con trỏ chính thô, hoặc có điểm chạm mà không có chuột/bàn di.
    // Laptop cảm ứng có chuột thì giữ gợi ý phím E, không hiện nút.
    if (window.matchMedia(TOUCH_QUERY).matches) return true;
    return navigator.maxTouchPoints > 0 && !window.matchMedia('(any-pointer: fine)').matches;
  } catch {
    return false;
  }
}

function useTouchDevice(): boolean {
  const [touch, setTouch] = useState(detectTouch);
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(TOUCH_QUERY);
    } catch {
      return undefined;
    }
    const on = (): void => setTouch(detectTouch());
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return touch;
}

/**
 * Gợi ý tương tác gần đáy màn hình, menu chọn hành động và nút cảm ứng. Mount ngoài Canvas,
 * THAY cho InteractPrompt (đi cùng InteractionSystem).
 * - Gợi ý: "E — <hành động đầu tiên thỏa điều kiện>", có "+N" nếu E sẽ mở menu.
 * - Menu: chọn bằng phím số (InteractionSystem nghe) hoặc chuột/chạm.
 * - Nút cảm ứng: hiện khi là thiết bị cảm ứng và có vật đang chọn; giống phím E.
 */
export function InteractionHud() {
  const { focus, primary, actionCount, menu, pointer } = useInteractionSnapshot();
  const { keyHints } = useInteractSettings();
  const touch = useTouchDevice();

  if (!focus || !primary) return <div className="ix-prompt" aria-live="polite" />;

  const more = actionCount > 1 ? ` (+${actionCount - 1})` : '';
  const key = touch ? '' : pointer ? 'Bấm chuột — ' : keyHints ? 'E — ' : '';
  return (
    <>
      <div className="ix-prompt" aria-live="polite">
        {menu ? (
          <div className="ix-menu" role="menu" aria-label={`Hành động: ${focus.label}`}>
            <p className="ix-menu-title">{focus.label}</p>
            {menu.map((a, i) => (
              <button
                key={a.id}
                type="button"
                role="menuitem"
                className="ix-menu-item"
                aria-keyshortcuts={i < 9 ? String(i + 1) : undefined}
                onClick={() => chooseAction(a.id)}
              >
                {i < 9 && keyHints && !touch && <kbd className="ix-key">{i + 1}</kbd>}
                <span>{a.label}</span>
              </button>
            ))}
            <button type="button" className="ix-menu-item ix-menu-close" onClick={() => closeMenu()}>
              {keyHints && !touch && <kbd className="ix-key">Esc</kbd>}
              <span>Đóng</span>
            </button>
          </div>
        ) : (
          <button type="button" className="ix-chip" aria-keyshortcuts="E" onClick={() => activateFocus()}>
            {key}
            {primary.label}
            {more}
          </button>
        )}
      </div>
      {touch && !menu && (
        <button
          type="button"
          className="ix-touch"
          aria-label={`Tương tác: ${primary.label}`}
          onClick={() => activateFocus()}
        >
          <span aria-hidden="true">✋</span>
          <span className="ix-touch-label">{primary.label}</span>
        </button>
      )}
    </>
  );
}

/**
 * Dòng hướng dẫn phím (ẩn được) và hai công tắc: viền sáng, hướng dẫn phím. Mount ngoài Canvas,
 * THAY cho InteractHelp. Tùy chọn lưu localStorage (settings.ts).
 */
export function InteractionHelp() {
  const { highlight, keyHints } = useInteractSettings();
  const touch = useTouchDevice();
  return (
    <div className="ix-help">
      {keyHints && (
        <p className="ix-help-text">
          {touch
            ? 'Joystick để đi · Chạm nút ✋ để tương tác'
            : 'W S A D di chuyển · Giữ chuột phải để xoay · E tương tác · 1–9 chọn trong menu · Esc đóng'}
        </p>
      )}
      <div className="ix-toggles" role="group" aria-label="Tùy chọn tương tác">
        <button
          type="button"
          className="ix-toggle"
          aria-pressed={highlight}
          onClick={() => updateInteractSettings({ highlight: !highlight })}
        >
          Viền sáng: {highlight ? 'Bật' : 'Tắt'}
        </button>
        <button
          type="button"
          className="ix-toggle"
          aria-pressed={keyHints}
          onClick={() => updateInteractSettings({ keyHints: !keyHints })}
        >
          Hướng dẫn phím: {keyHints ? 'Bật' : 'Tắt'}
        </button>
        <button
          type="button"
          className="ix-toggle"
          title="Đưa cửa, ngăn kéo, đèn, rèm, TV và đồ nhỏ về trạng thái ban đầu"
          onClick={() => resetAllObjects()}
        >
          Đặt lại vật
        </button>
      </div>
    </div>
  );
}
