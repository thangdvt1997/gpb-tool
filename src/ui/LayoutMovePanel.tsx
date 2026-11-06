import { useEffect, useState } from 'react';
import type { Role } from '../content/types';
import '../layout/layout.css';
import { isMovable } from '../layout/movable';

interface Props {
  /** Id vật thể, ví dụ 'pantry'. Vật không di chuyển được (kể cả bàn) thì không hiện gì. */
  objectId: string;
  /** Tên hiển thị của vật thể, dùng cho nhãn đọc màn hình. */
  label: string;
  role: Role;
  /** Đang ở chế độ di chuyển đúng vật này. */
  moving: boolean;
  onStart: () => void;
  onRotate: () => void;
  onPlace: () => void;
  onCancel: () => void;
  /** Đặt lại vị trí của vật này về mặc định. Nút chỉ hiện cho it và admin. */
  onReset?: () => void;
  /** Lý do chưa đặt được (kiểm tra phía client) hoặc lỗi từ máy chủ. Được đọc qua aria-live. */
  message?: string | null;
  /** Đang chờ máy chủ trả lời lần đặt. Khoá các nút. */
  busy?: boolean;
}

/**
 * Nút điều khiển di chuyển trong panel vật thể. Không tự bọc khung panel.
 * Khi chưa di chuyển: 'Di chuyển' và (it/admin) 'Đặt lại vị trí'.
 * Khi đang di chuyển: 'Xoay 90°', 'Đặt tại đây', 'Huỷ'.
 */
export function LayoutMovePanel({
  objectId,
  label,
  role,
  moving,
  onStart,
  onRotate,
  onPlace,
  onCancel,
  onReset,
  message,
  busy = false,
}: Props) {
  // Xác nhận đặt lại bằng hai bước trong giao diện: confirm() của trình xem không hiển thị hộp thoại.
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setConfirmReset(false);
  }, [objectId]);

  if (!isMovable(objectId)) return null;

  const canReset = onReset !== undefined && (role === 'it' || role === 'admin');

  return (
    <div className="layout-move" role="group" aria-label={`Di chuyển: ${label}`}>
      {moving ? (
        <div className="layout-move-row">
          <button type="button" className="btn btn-ghost" onClick={onRotate} disabled={busy}>
            Xoay 90°
          </button>
          <button type="button" className="btn" onClick={onPlace} disabled={busy}>
            {busy ? 'Đang đặt…' : 'Đặt tại đây'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Huỷ
          </button>
        </div>
      ) : (
        <>
          <div className="layout-move-row">
            <button type="button" className="btn" onClick={onStart} disabled={busy}>
              Di chuyển
            </button>
            {canReset && !confirmReset && (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(true)}>
                Đặt lại vị trí
              </button>
            )}
          </div>
          {canReset && confirmReset && (
            <div className="layout-move-row">
              <p className="layout-move-confirm">Đưa {label} về vị trí mặc định cho mọi người?</p>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setConfirmReset(false);
                  onReset?.();
                }}
              >
                Xác nhận đặt lại
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
                Không
              </button>
            </div>
          )}
        </>
      )}
      <p className="layout-move-msg" role="status" aria-live="polite">
        {message ?? ''}
      </p>
    </div>
  );
}
