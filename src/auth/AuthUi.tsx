import type { ReactNode } from 'react';

export type NoticeTone = 'error' | 'success' | 'info';
export type CheckState = 'ok' | 'todo' | 'neutral';

const BANNER_TONE: Record<NoticeTone, 'danger' | 'ok' | 'info'> = { error: 'danger', success: 'ok', info: 'info' };

interface AuthLayoutProps {
  children: ReactNode;
  /** id của tiêu đề chính (h1) trong thẻ. */
  labelledBy: string;
  /** Bước rộng (tạo nhân vật): ẩn cột giới thiệu và mở rộng thẻ. */
  wide?: boolean;
}

/** Khung chung: cột giới thiệu bên trái (từ 768 px), tờ phiếu form có đường kẻ kép ở đỉnh, chân trang. */
export function AuthLayout({ children, labelledBy, wide = false }: AuthLayoutProps) {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <div className={wide ? 'auth-split auth-split--wide' : 'auth-split'}>
          {wide ? null : (
            <aside className="auth-brand" aria-label="Giới thiệu">
              <p className="auth-brand-name">Văn phòng ảo GPBank</p>
              <p className="ui-hint auth-brand-desc">
                Văn phòng nội bộ ảo: làm việc, gặp đồng nghiệp và nhận hỗ trợ IT ngay trong không gian 3D.
              </p>
            </aside>
          )}
          <div className="auth-main">
            <section className={wide ? 'ui-panel ui-panel-sheet auth-sheet--wide' : 'ui-panel ui-panel-sheet'} aria-labelledby={labelledBy}>
              {children}
            </section>
          </div>
        </div>
        <footer className="auth-footer">
          <span>Bảo mật và bảo vệ thông tin.</span>
          <span>Hỗ trợ: IT Service Desk.</span>
        </footer>
      </div>
    </main>
  );
}

function NoticeIcon({ tone }: { tone: NoticeTone }) {
  if (tone === 'success') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="9" fill="currentColor" />
        <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tone === 'info') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="9" fill="currentColor" />
        <circle cx="10" cy="6.2" r="1.2" fill="#ffffff" />
        <path d="M10 9.2v5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="9" fill="currentColor" />
      <path d="M10 5.6v5.2" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="13.9" r="1.2" fill="#ffffff" />
    </svg>
  );
}

interface AuthNoticeProps {
  tone: NoticeTone;
  text: string | null | undefined;
  id?: string;
}

/**
 * Thông báo lỗi, thành công hoặc thông tin. Vùng aria-live="polite" luôn có trong DOM,
 * nên trình đọc màn hình báo khi nội dung đổi. Icon đi kèm chữ, màu không phải dấu hiệu duy nhất.
 */
export function AuthNotice({ tone, text, id }: AuthNoticeProps) {
  return (
    <div className="auth-live" aria-live="polite" aria-atomic="true">
      {text ? (
        <p id={id} className={`ui-banner ui-banner-${BANNER_TONE[tone]}`}>
          <NoticeIcon tone={tone} />
          <span>{text}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Spinner nhỏ trong nút đang xử lý. Chữ "Đang xử lý…" đi kèm, nên spinner chỉ trang trí. */
export function Spinner() {
  return <span className="ui-spinner" aria-hidden="true" />;
}

interface PasswordToggleProps {
  shown: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/** Nút hiện/ẩn mật khẩu. Tên truy cập đổi theo trạng thái. Nằm ngoài thẻ label để không lẫn vào tên ô nhập. */
export function PasswordToggle({ shown, onToggle, disabled = false }: PasswordToggleProps) {
  return (
    <button
      type="button"
      className="auth-toggle"
      aria-label={shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      onClick={onToggle}
      disabled={disabled}
    >
      <svg className="auth-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        {shown ? <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : null}
      </svg>
      <span aria-hidden="true">{shown ? 'Ẩn' : 'Hiện'}</span>
    </button>
  );
}

/** Icon trạng thái tiêu chí mật khẩu. Trạng thái cũng được ghi bằng chữ ("Đạt", "Chưa đạt"). */
export function CheckIcon({ state }: { state: CheckState }) {
  if (state === 'ok') {
    return (
      <svg className="auth-check-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="9" fill="currentColor" />
        <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className="auth-check-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeDasharray={state === 'todo' ? undefined : '2 2.4'}
      />
    </svg>
  );
}
