import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Role } from '../content/types';
import {
  BOARD_NAMES,
  BOARD_W,
  BoardPainter,
  CHANNEL_IDS,
  CHANNEL_TITLES,
  INK_PALETTE,
  INK_WIDTHS,
  TV_NAMES,
  drawStroke,
  isBoardId,
  isTvId,
  paintTv,
  useChannelData,
  useDisplay,
} from '../display';
import type { StrokeStyle, BoardId, ChannelId, Point, Stroke, TvId, TvPatch } from '../display';
import '../display/display.css';

/* Panel điều khiển tivi và bảng vẽ. Dùng chung khung .panel với các panel khác. */

const BOARD_H = BOARD_W / 2;
/** Khoảng cách tối thiểu (theo tỉ lệ bảng) giữa hai điểm liên tiếp. Giảm kích thước gói gửi. */
const MIN_STEP = 0.002;
const CLEAR_ARM_MS = 4000;
const BOARD_FULL_TEXT = 'Bảng đã đầy, không thể thêm nét. Nhờ IT hoặc admin xoá bảng.';
const OFFLINE_TEXT = 'Mất kết nối, đang thử lại…';
const NO_STROKES: readonly Stroke[] = [];

interface DisplayPanelProps {
  kind: 'tv' | 'board';
  id: string;
  role: Role;
  onClose: () => void;
}

export function DisplayPanel({ kind, id, role, onClose }: DisplayPanelProps) {
  const title =
    kind === 'tv' ? (isTvId(id) ? TV_NAMES[id] : 'Tivi') : isBoardId(id) ? BOARD_NAMES[id] : 'Bảng vẽ';

  let body: ReactNode;
  if (kind === 'tv') {
    body = isTvId(id) ? <TvControls key={id} tvId={id} /> : <p className="denied">Không tìm thấy tivi này.</p>;
  } else {
    body = isBoardId(id) ? (
      <BoardCanvas key={id} boardId={id} role={role} />
    ) : (
      <p className="denied">Không tìm thấy bảng này.</p>
    );
  }

  return (
    <aside className="panel" role="dialog" aria-label={title}>
      <header className="panel-head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Đóng panel">
          ✕
        </button>
      </header>
      {body}
    </aside>
  );
}

/** Vùng thông báo cho trình đọc màn hình. Luôn có trong DOM để đọc được khi nội dung đổi. */
function StatusLine({ text }: { text: string }) {
  return (
    <p className="display-status" aria-live="polite">
      {text}
    </p>
  );
}

function channelLabel(ch: ChannelId, names: { id: ChannelId; name: string }[]): string {
  return names.find((c) => c.id === ch)?.name ?? CHANNEL_TITLES[ch];
}

function TvControls({ tvId }: { tvId: TvId }) {
  const { tvs, channels, connected, actions } = useDisplay();
  const tv = tvs[tvId];
  const on = tv?.on === true;
  const channel: ChannelId = tv?.channel ?? 1;
  const { content } = useChannelData(channel, on);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Xem trước: vẽ đúng như tivi thật. Đồng hồ kênh 6 cập nhật mỗi giây.
  useEffect(() => {
    const canvas = previewRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const paint = () => paintTv(ctx, on, channel, content, canvas.width, canvas.height);
    paint();
    if (!on || channel !== 6) return;
    const timer = setInterval(paint, 1000);
    return () => clearInterval(timer);
  }, [on, channel, content]);

  const run = async (patch: TvPatch) => {
    setBusy(true);
    setNotice(null);
    const r = await actions.setTv(tvId, patch);
    setBusy(false);
    if (!r.ok) setNotice(`Chưa đổi được tivi: ${r.error}`);
  };

  const currentName = channelLabel(channel, channels);
  const offlineText = connected ? '' : OFFLINE_TEXT;

  return (
    <>
      <p className="muted small">
        {tv ? `Trạng thái: ${on ? 'đang bật' : 'đang tắt'}. Kênh ${channel}: ${currentName}.` : 'Đang tải trạng thái tivi…'}
      </p>
      <canvas
        ref={previewRef}
        width={512}
        height={288}
        className="display-preview"
        role="img"
        aria-label={on ? `Xem trước: ${currentName}` : 'Tivi đang tắt'}
      />
      <div className="display-row">
        <button type="button" className="btn" disabled={!tv || busy} onClick={() => void run({ on: !on })}>
          {on ? 'Tắt tivi' : 'Bật tivi'}
        </button>
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>
        Chọn kênh
      </p>
      <div className="display-channels" role="group" aria-label="Chọn kênh tivi">
        {CHANNEL_IDS.map((ch) => (
          <button
            key={ch}
            type="button"
            className="tab-btn display-channel"
            aria-pressed={channel === ch}
            disabled={!tv || busy}
            onClick={() => void run({ channel: ch })}
          >
            {ch}. {channelLabel(ch, channels)}
          </button>
        ))}
      </div>
      <StatusLine text={notice ?? offlineText} />
    </>
  );
}

/** Tạo toạ độ chuẩn hoá [0, 1] từ sự kiện con trỏ, theo kích thước thật của bảng trên màn hình. */
function pointOf(e: ReactPointerEvent<HTMLDivElement>): Point {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
  const y = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0;
  return [round4(clamp01(x)), round4(clamp01(y))];
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

function BoardCanvas({ boardId, role }: { boardId: BoardId; role: Role }) {
  const { boards, connected, actions } = useDisplay();
  const strokes = boards[boardId]?.strokes ?? NO_STROKES;
  const canClear = role === 'it' || role === 'admin';

  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const painterRef = useRef<BoardPainter | null>(null);
  // Nét đang vẽ hoặc đang gửi. Được vẽ lên lớp overlay, gỡ khi server xác nhận.
  const pendingRef = useRef<Map<number, StrokeStyle>>(new Map());
  const drawingRef = useRef<{ key: number; pointerId: number } | null>(null);
  const nextKeyRef = useRef(1);

  const [color, setColor] = useState(INK_PALETTE[0].hex);
  const [width, setWidth] = useState(INK_WIDTHS[1].px);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Nét đã lưu: chỉ vẽ phần mới, vẽ lại khi bảng bị xoá hoặc nhận trạng thái mới.
  useLayoutEffect(() => {
    const ctx = baseRef.current?.getContext('2d');
    if (!ctx) return;
    const painter = painterRef.current ?? new BoardPainter(ctx, BOARD_W, BOARD_H);
    painterRef.current = painter;
    painter.sync(strokes);
  }, [strokes]);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), CLEAR_ARM_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const drawOverlay = () => {
    const ctx = overlayRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, BOARD_W, BOARD_H);
    pendingRef.current.forEach((stroke) => drawStroke(ctx, stroke, BOARD_W, BOARD_H));
  };

  const send = async (key: number, stroke: StrokeStyle) => {
    const r = await actions.sendStroke(boardId, {
      points: stroke.points,
      color: stroke.color,
      width: stroke.width,
    });
    pendingRef.current.delete(key);
    drawOverlay();
    if (r.ok) {
      setNotice(null);
    } else {
      setNotice(r.status === 409 ? BOARD_FULL_TEXT : `Nét chưa được lưu: ${r.error}`);
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (drawingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const key = nextKeyRef.current++;
    pendingRef.current.set(key, { points: [pointOf(e)], color, width });
    drawingRef.current = { key, pointerId: e.pointerId };
    drawOverlay();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const active = drawingRef.current;
    if (!active || active.pointerId !== e.pointerId) return;
    const stroke = pendingRef.current.get(active.key);
    if (!stroke) return;
    const p = pointOf(e);
    const last = stroke.points[stroke.points.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < MIN_STEP) return;
    stroke.points.push(p);
    drawOverlay();
  };

  /** Nhấc bút thì gửi nét. Bị huỷ (cancel) thì bỏ nét. */
  const endStroke = (e: ReactPointerEvent<HTMLDivElement>, keep: boolean) => {
    const active = drawingRef.current;
    if (!active || active.pointerId !== e.pointerId) return;
    drawingRef.current = null;
    const stroke = pendingRef.current.get(active.key);
    if (!stroke) return;
    if (!keep) {
      pendingRef.current.delete(active.key);
      drawOverlay();
      return;
    }
    void send(active.key, stroke);
  };

  const clearBoard = async () => {
    setArmed(false);
    setBusy(true);
    setNotice(null);
    const r = await actions.clearBoard(boardId);
    setBusy(false);
    if (!r.ok) setNotice(`Chưa xoá được bảng: ${r.error}`);
  };

  const onClearClick = () => {
    if (armed) {
      void clearBoard();
    } else {
      setArmed(true);
    }
  };

  return (
    <>
      <p className="muted small">Kéo chuột hoặc chạm để vẽ. Nét của bạn hiện cho mọi người xem.</p>
      <div
        className="display-board"
        role="img"
        aria-label={`${BOARD_NAMES[boardId]}. Vùng vẽ.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endStroke(e, true)}
        onPointerCancel={(e) => endStroke(e, false)}
      >
        <canvas ref={baseRef} width={BOARD_W} height={BOARD_H} />
        <canvas ref={overlayRef} width={BOARD_W} height={BOARD_H} className="display-board-overlay" />
      </div>

      <div className="display-swatches" role="group" aria-label="Màu nét">
        {INK_PALETTE.map((c) => (
          <button
            key={c.hex}
            type="button"
            className="display-swatch"
            style={{ background: c.hex }}
            aria-label={c.name}
            aria-pressed={color === c.hex}
            onClick={() => setColor(c.hex)}
          />
        ))}
      </div>

      <div className="display-row" role="group" aria-label="Độ dày nét">
        {INK_WIDTHS.map((opt) => (
          <button
            key={opt.px}
            type="button"
            className="tab-btn"
            aria-pressed={width === opt.px}
            onClick={() => setWidth(opt.px)}
          >
            {opt.name}
          </button>
        ))}
      </div>

      {canClear && (
        <div className="display-row">
          <button type="button" className={armed ? 'btn' : 'btn btn-ghost'} disabled={busy} onClick={onClearClick}>
            {armed ? 'Bấm lần nữa để xoá cho mọi người' : 'Xoá bảng'}
          </button>
        </div>
      )}

      <StatusLine text={notice ?? (connected ? '' : OFFLINE_TEXT)} />
    </>
  );
}
