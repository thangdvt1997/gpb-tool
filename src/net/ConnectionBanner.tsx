// Banner trạng thái mạng. Chỉ hiện khi không ở trạng thái bình thường; nói rõ việc gì đang bị khóa.
import type { WorldApi } from './useWorld';

const TEXT: Record<string, { msg: string; locked: string; tone: 'warn' | 'error' }> = {
  connecting: { msg: 'Đang kết nối tới văn phòng...', locked: 'Chat, ngồi ghế, cầm đồ tạm khóa.', tone: 'warn' },
  reconnecting: { msg: 'Mất kết nối, đang thử lại...', locked: 'Chat được giữ trong hàng đợi; ngồi ghế, cầm đồ, chỉnh sửa tạm khóa.', tone: 'warn' },
  resyncing: { msg: 'Đang đồng bộ lại trạng thái...', locked: 'Điều khiển mở lại khi đồng bộ xong.', tone: 'warn' },
  disconnected: { msg: 'Không kết nối được tới máy chủ.', locked: 'Mọi thao tác dùng chung đang khóa.', tone: 'error' },
  authExpired: { msg: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', locked: 'Mọi thao tác dùng chung đang khóa.', tone: 'error' },
  replaced: { msg: 'Tài khoản đang mở ở tab hoặc thiết bị khác.', locked: 'Phiên này đã bị thay thế.', tone: 'error' },
  kicked: { msg: 'Bạn đã bị mời ra khỏi phòng.', locked: 'Không thể vào lại trong ít phút.', tone: 'error' },
};

export function ConnectionBanner({ world }: { world: Pick<WorldApi, 'state' | 'retry'> }) {
  const info = TEXT[world.state];
  if (!info) return null;
  const canRetry = world.state === 'disconnected' || world.state === 'replaced';
  return (
    <div
      role={info.tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        padding: '8px 14px',
        borderRadius: 8,
        color: '#fff',
        background: info.tone === 'error' ? '#b3261e' : '#8a5a00',
        font: '14px system-ui, sans-serif',
        maxWidth: 'min(92vw, 560px)',
      }}
    >
      <strong>{info.msg}</strong> <span>{info.locked}</span>
      {canRetry ? (
        <button type="button" onClick={world.retry} style={{ marginLeft: 10 }}>
          {world.state === 'replaced' ? 'Dùng phiên này' : 'Thử lại'}
        </button>
      ) : null}
    </div>
  );
}
