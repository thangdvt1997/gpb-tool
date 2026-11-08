import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSettings } from '../settings';
import { trapFocus } from '../a11y/focusTrap';
import { keyNamesFrom } from './keys';
import { openTour } from './helpState';
import { useGamepadConnected, useTouch } from './useEnv';
import { isHelpKey, searchTopics } from './topics';
import type { StepCtx } from './steps';
import './help.css';

/** Trạng thái mở/đóng của trang trợ giúp (store nhỏ, App không cần giữ state). */
let centerOpen = false;
const subs = new Set<() => void>();
function setCenter(v: boolean): void {
  if (v === centerOpen) return;
  centerOpen = v;
  subs.forEach((s) => s());
}
export const openHelpCenter = (): void => setCenter(true);
export const closeHelpCenter = (): void => setCenter(false);
export const toggleHelpCenter = (): void => setCenter(!centerOpen);
export const isHelpCenterOpen = (): boolean => centerOpen;
function subscribe(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

/**
 * Trang trợ giúp tra cứu: danh sách chủ đề + ô tìm không dấu. Mở bằng F1 hoặc ? (tự gắn listener
 * keydown một lần khi mount, gỡ khi unmount), đóng bằng Esc hoặc nút Đóng. Là hộp thoại modal nhẹ:
 * bẫy focus, focus vào ô tìm khi mở và trả lại khi đóng.
 */
/** Trạng thái mở cho nút Trợ giúp ở HUD (aria-expanded). */
export function useHelpCenterOpen(): boolean {
  return useSyncExternalStore(subscribe, isHelpCenterOpen, isHelpCenterOpen);
}

export function HelpCenter({ role }: { role?: string }) {
  const open = useHelpCenterOpen();
  const { settings } = useSettings();
  const touch = useTouch();
  const gamepad = useGamepadConnected();
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.isComposing || !isHelpKey(e)) return;
      e.preventDefault();
      toggleHelpCenter();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const dialog = useRef<HTMLDivElement>(null);
  // Hộp thoại modal đúng chuẩn: bẫy focus (Tab vòng), Esc đóng, trả focus về nút đã mở (trapFocus).
  useEffect(() => {
    if (!open || !dialog.current) return undefined;
    const release = trapFocus(dialog.current, { id: 'panel:help', initialFocus: input.current, onClose: closeHelpCenter });
    return () => {
      setQuery('');
      release();
    };
  }, [open]);

  if (!open) return null;
  const ctx: StepCtx = { touch, keys: keyNamesFrom(settings.bindings, settings.controlMode), role, gamepad };
  const results = searchTopics(query, ctx);

  return (
    <div
      className="help-center ui-panel ui-panel-float"
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-center-title"
    >
      <div className="help-center-head">
        <h2 id="help-center-title" className="help-title">
          Trợ giúp
        </h2>
        <button type="button" className="ui-btn ui-btn-ghost" onClick={closeHelpCenter}>
          Đóng
        </button>
      </div>
      <label className="help-search-label" htmlFor="help-search">
        Tìm chủ đề
      </label>
      <input
        ref={input}
        id="help-search"
        className="help-search"
        type="search"
        autoComplete="off"
        placeholder="Ví dụ: ban do, may in, doi phim"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="help-count ui-muted" role="status">
        {results.length === 0 ? 'Không có chủ đề phù hợp.' : `${results.length} chủ đề`}
      </p>
      <ul className="help-topics">
        {results.map((t) => (
          <li key={t.id} className="help-topic">
            <h3 className="help-topic-title">{t.title}</h3>
            <p className="help-body">{t.body(ctx)}</p>
          </li>
        ))}
      </ul>
      <div className="help-actions">
        <button
          type="button"
          className="ui-btn"
          onClick={() => {
            closeHelpCenter();
            openTour();
          }}
        >
          Xem lại hướng dẫn
        </button>
      </div>
    </div>
  );
}
