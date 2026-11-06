import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ApiError, getProviders, login, oauthStartUrl, resendOtp } from './api';
import type { Provider, Providers, Session } from './api';
import { AuthLayout, AuthNotice, PasswordToggle, Spinner } from './AuthUi';
import { COPY, errorText } from '../onboarding/messages';
import './auth.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

const PROVIDERS: readonly { id: Provider; label: string }[] = [
  { id: 'google', label: 'Tiếp tục với Google' },
  { id: 'microsoft', label: 'Tiếp tục với Microsoft' },
];

type Mode = 'login' | 'register';

const MODES: readonly { id: Mode; label: string }[] = [
  { id: 'login', label: 'Đăng nhập' },
  { id: 'register', label: 'Tạo tài khoản' },
];

export interface AuthScreenProps {
  /** Email giữ lại khi quay về từ luồng đăng ký hoặc xác minh. */
  initialEmail?: string;
  /** Thông báo một lần, ví dụ phiên đăng ký hết hạn. */
  notice?: string | null;
  /** Đăng nhập thành công. */
  onAuthenticated: (session: Session) => void;
  /** Cần xác minh email (đăng nhập bị chặn hoặc chưa đặt mật khẩu): chuyển sang bước 2 của wizard. */
  onNeedVerification: (email: string, resendInSeconds: number | null) => void;
  /** Người dùng chọn tạo tài khoản mới. */
  onStartRegister: (email: string) => void;
}

export function AuthScreen({
  initialEmail = '',
  notice = null,
  onAuthenticated,
  onNeedVerification,
  onStartRegister,
}: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState(initialEmail);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /** Mũi tên trái/phải chuyển tab (vòng tròn), Home và End về đầu và cuối (mẫu WAI-ARIA tabs). */
  const onTabKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = MODES.findIndex((m) => m.id === mode);
    let next = -1;
    if (e.key === 'ArrowRight') next = (current + 1) % MODES.length;
    else if (e.key === 'ArrowLeft') next = (current - 1 + MODES.length) % MODES.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = MODES.length - 1;
    if (next < 0) return;
    const target = MODES[next];
    if (!target) return;
    e.preventDefault();
    setMode(target.id);
    tabRefs.current[next]?.focus();
  };

  return (
    <AuthLayout labelledBy="auth-title">
      <header className="auth-head">
        <h1 id="auth-title" className="ui-panel-title auth-title">
          {MODES.find((m) => m.id === mode)?.label}
        </h1>
        <p className="ui-hint">Đăng nhập để vào khu làm việc 3D của phòng CNTT.</p>
      </header>

      <div className="ui-tabs ui-tabs-segmented" role="tablist" aria-label="Chọn cách vào hệ thống" onKeyDown={onTabKeyDown}>
        {MODES.map((m, i) => {
          const selected = m.id === mode;
          return (
            <button
              key={m.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`auth-tab-${m.id}`}
              type="button"
              role="tab"
              className="ui-tab"
              aria-selected={selected}
              aria-controls="auth-tabpanel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <div key={mode} className="auth-panel auth-enter" role="tabpanel" id="auth-tabpanel" aria-labelledby={`auth-tab-${mode}`}>
        <AuthNotice tone="info" text={notice} />
        {mode === 'login' ? (
          <LoginForm
            email={email}
            onEmailChange={setEmail}
            onAuthenticated={onAuthenticated}
            onNeedVerification={onNeedVerification}
          />
        ) : (
          <RegisterStart email={email} onStart={onStartRegister} />
        )}
      </div>

      <ProviderSection />
    </AuthLayout>
  );
}

interface LoginProps {
  email: string;
  onEmailChange: (value: string) => void;
  onAuthenticated: (session: Session) => void;
  onNeedVerification: (email: string, resendInSeconds: number | null) => void;
}

function LoginForm({ email, onEmailChange, onAuthenticated, onNeedVerification }: LoginProps) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  const passId = useId();
  const errorId = useId();

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) {
      setError('Email chưa đúng định dạng.');
      return;
    }
    if (!password) {
      setError('Nhập mật khẩu.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await login(cleanEmail, password);
      if (result.kind === 'signed_in') {
        onAuthenticated(result.session);
        return;
      }
      // Đã xác minh nhưng chưa đặt mật khẩu: gửi mã (server bỏ qua nếu vừa gửi) rồi sang bước xác minh.
      setPassword('');
      await resendOtp(result.email);
      onNeedVerification(result.email, result.resendInSeconds);
    } catch (err) {
      if (err instanceof ApiError && err.needsVerification) {
        setPassword('');
        onNeedVerification(cleanEmail, RESEND_SECONDS);
        return;
      }
      setBusy(false);
      setError(errorText(err, { mail_failed: COPY.mailFailed }));
    }
  };

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <div className="ui-field">
        <label className="ui-label" htmlFor={emailId}>
          Email
        </label>
        <input
          id={emailId}
          className="ui-input"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          aria-describedby={error ? errorId : undefined}
          required
          disabled={busy}
        />
      </div>

      <div className="ui-field">
        <label className="ui-label" htmlFor={passId}>
          Mật khẩu
        </label>
        <div className="auth-input-wrap">
          <input
            id={passId}
            className="ui-input auth-input--with-toggle"
            type={show ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={128}
            aria-describedby={error ? errorId : undefined}
            required
            disabled={busy}
          />
          <PasswordToggle shown={show} onToggle={() => setShow((s) => !s)} disabled={busy} />
        </div>
        <p className="ui-hint auth-forgot">
          <strong>Quên mật khẩu?</strong> Liên hệ IT Service Desk để đặt lại mật khẩu.
        </p>
      </div>

      <AuthNotice tone="error" text={error} id={errorId} />

      <button className="ui-btn ui-btn-primary ui-btn-block" type="submit" disabled={busy}>
        {busy && <Spinner />}
        {busy ? 'Đang xử lý…' : 'Đăng nhập'}
      </button>
    </form>
  );
}

interface RegisterStartProps {
  email: string;
  onStart: (email: string) => void;
}

function RegisterStart({ email, onStart }: RegisterStartProps) {
  return (
    <div className="auth-form">
      <p className="ui-hint">
        Tạo tài khoản mất khoảng 5 đến 7 phút. Bạn sẽ xác minh email, đặt mật khẩu và tạo nhân vật của mình.
      </p>
      <button
        type="button"
        className="ui-btn ui-btn-primary ui-btn-block"
        onClick={() => onStart(email.trim())}
      >
        Bắt đầu tạo tài khoản
      </button>
    </div>
  );
}

/**
 * Nút đăng nhập Google và Microsoft luôn hiện. Nhà cung cấp chưa bật thì nút vô hiệu hoá kèm dòng "Chưa được cấu hình".
 * Đang tải danh sách thì nút vô hiệu hoá nhưng chưa có dòng chú thích. Lỗi tải coi như chưa cấu hình.
 */
function ProviderSection() {
  const [providers, setProviders] = useState<Providers | null>(null);

  useEffect(() => {
    let alive = true;
    getProviders()
      .then((p) => {
        if (alive) setProviders(p);
      })
      .catch(() => {
        if (alive) setProviders({ google: false, microsoft: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <div className="auth-divider" role="presentation">
        <span>hoặc</span>
      </div>
      <div className="auth-providers">
        {PROVIDERS.map((p) => {
          const enabled = providers?.[p.id] === true;
          const showNote = providers !== null && !enabled;
          const noteId = `auth-provider-note-${p.id}`;
          return (
            <div key={p.id} className="auth-provider-item">
              <button
                type="button"
                className="ui-btn ui-btn-block"
                disabled={!enabled}
                aria-describedby={showNote ? noteId : undefined}
                onClick={() => {
                  window.location.href = oauthStartUrl(p.id);
                }}
              >
                {p.label}
              </button>
              {showNote && (
                <p id={noteId} className="ui-hint">
                  Chưa được cấu hình
                </p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
