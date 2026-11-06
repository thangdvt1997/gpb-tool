// Bảng ghi danh trên tường sảnh (checkin_board). Chỉ phần 3D: khung và mặt bảng vẽ bằng canvas.
// Bấm vào bảng mở action 'checkin_board' (panel do src/checkin/CheckinBoard.tsx vẽ, mở từ Panel.tsx).
// Mặt bảng hiện trạng thái ghi danh của chính người dùng: "Đã ghi danh lúc HH:mm" hoặc "Chưa ghi danh".
// Trạng thái do ITOffice đặt qua setCheckinBoardStatus. Không có tên người khác trên bảng 3D.
// Draw call: 2 (khung, mặt bảng).

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { THEME_TOKENS, type ThemeName } from '../theme/tokens';
import { canvasTexture, fitFont, UNIT_BOX, UNIT_PLANE, type DecorBase } from './shared';

export interface CheckinBoardStatus {
  /** null: chưa biết (đang tải). */
  checkedIn: boolean | null;
  /** Chuỗi ISO có offset +07:00, khi đã ghi danh. */
  at?: string;
  theme: ThemeName;
}

let status: CheckinBoardStatus = { checkedIn: null, theme: 'office-day' };
const listeners = new Set<() => void>();

/** Cập nhật mặt bảng ghi danh 3D. Gọi từ ITOffice sau getMyCheckin() hoặc khi chuỗi cảnh kết thúc. */
export function setCheckinBoardStatus(next: Partial<CheckinBoardStatus>): void {
  const merged = { ...status, ...next };
  if (merged.checkedIn === status.checkedIn && merged.at === status.at && merged.theme === status.theme) return;
  status = merged;
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const getStatus = () => status;

const timeFmt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function hhmm(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : timeFmt.format(d);
}

export interface CheckinBoardDetailProps extends DecorBase {
  /** Bề ngang bảng (m). Mặc định 1,8. */
  width?: number;
  /** Chiều cao bảng (m). Mặc định 1,2. */
  height?: number;
}

/** Tâm bảng tính từ sàn (m). */
const BOARD_CY = 1.55;

export function CheckinBoardDetail({
  position = [0, 0, 0],
  scale = 1,
  rotationY = -Math.PI / 2,
  width = 1.8,
  height = 1.2,
}: CheckinBoardDetailProps) {
  const st = useSyncExternalStore(subscribe, getStatus, getStatus);
  const t = THEME_TOKENS[st.theme];

  const frameMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: t.line, roughness: 0.45, metalness: 0.4 }),
    [t.line],
  );
  useEffect(() => () => frameMat.dispose(), [frameMat]);

  const face = useMemo(() => {
    const time = hhmm(st.at);
    const tex = canvasTexture(768, 512, (ctx, w, h) => {
      ctx.fillStyle = t.panel;
      ctx.fillRect(0, 0, w, h);
      // Dải tiêu đề màu nhấn.
      ctx.fillStyle = t.accent;
      ctx.fillRect(0, 0, w, 116);
      ctx.fillStyle = t.accentText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      fitFont(ctx, 'GHI DANH HÔM NAY', w - 96, 54);
      ctx.fillText('GHI DANH HÔM NAY', 48, 60);

      ctx.fillStyle = t.muted;
      fitFont(ctx, 'Tầng 7 · Phòng CNTT', w - 96, 34, 'normal');
      ctx.fillText('Tầng 7 · Phòng CNTT', 48, 172);

      // Trạng thái của chính người dùng.
      const done = st.checkedIn === true;
      const line =
        st.checkedIn === null ? 'Đang tải…' : done ? (time ? `Đã ghi danh lúc ${time}` : 'Đã ghi danh') : 'Chưa ghi danh';
      ctx.fillStyle = done ? t.ok : st.checkedIn === null ? t.muted : t.warn;
      ctx.beginPath();
      ctx.arc(66, 290, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.text;
      fitFont(ctx, line, w - 150, 60);
      ctx.fillText(line, 104, 292);

      ctx.strokeStyle = t.line;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(48, 390);
      ctx.lineTo(w - 48, 390);
      ctx.stroke();

      ctx.fillStyle = t.muted;
      fitFont(ctx, 'Bấm vào bảng để xem số người theo phòng ban', w - 96, 30, 'normal');
      ctx.fillText('Bấm vào bảng để xem số người theo phòng ban', 48, 448);
    });
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    return { tex, mat };
  }, [st.at, st.checkedIn, t]);
  useEffect(
    () => () => {
      face.tex.dispose();
      face.mat.dispose();
    },
    [face],
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      <mesh geometry={UNIT_BOX} material={frameMat} position={[0, BOARD_CY, 0]} scale={[width, height, 0.06]} />
      <mesh
        geometry={UNIT_PLANE}
        material={face.mat}
        position={[0, BOARD_CY, 0.031]}
        scale={[width - 0.08, height - 0.08, 1]}
      />
    </group>
  );
}
