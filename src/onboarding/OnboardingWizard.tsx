import { useEffect, useId, useRef, useState } from 'react';
import type {
  ChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import '../auth/auth.css';
import {
  ApiError,
  getSession,
  markTourDone,
  register,
  resendOtp,
  setPassword,
  verifyOtp,
} from '../auth/api';
import type { AuthUser } from '../auth/api';
import { AuthLayout, AuthNotice, CheckIcon, PasswordToggle, Spinner } from '../auth/AuthUi';
import type { CheckState, NoticeTone } from '../auth/AuthUi';
import { DEFAULT_APPEARANCE } from '../avatar/appearance';
import type { Appearance } from '../avatar/appearance';
import { AvatarCreator, loadDraft } from './AvatarCreator';
import { OnboardingProgress } from './OnboardingProgress';
import { COPY, errorNumber, errorText, waitCopy, wrongCodeCopy } from './messages';
import {
  PASSWORD_MAX,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN,
  STRENGTH_LABELS,
  checkPassword,
  passwordError,
  requiredOk,
  strengthLevel,
} from './passwordRules';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 600;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const STRENGTH_DELAY_MS = 500;

const EMAIL_HINT = 'Dùng email doanh nghiệp hoặc email cá nhân. Chúng tôi gửi mã xác minh tới địa chỉ này.';
/** Thông báo chung khi đăng ký, không lộ email đã có tài khoản hay chưa (quyết định đã chốt). */
const GENERIC_SENT = 'Nếu email này chưa đăng ký, chúng tôi đã gửi mã xác minh.';
const OTP_EXPIRING_SOON = 'Mã còn hiệu lực dưới 1 phút.';

export type WizardStep = 'name' | 'otp' | 'password' | 'avatar' | 'welcome';

/** Điểm bắt đầu của wizard: do App quyết định theo phiên hoặc theo luồng đăng nhập. */
export interface WizardStart {
  step: WizardStep;
  email: string;
  name: string;
  /** Số giây phải chờ trước khi gửi lại mã (lấy từ đăng nhập 409 hoặc đăng ký). */
  resendInSeconds: number | null;
  user: AuthUser | null;
  appearance: Appearance | null;
}

export interface OnboardingWizardProps {
  start: WizardStart;
  /** Hoàn tất onboarding: vào văn phòng. */
  onFinished: (user: AuthUser) => void;
  /** Thoát về màn đăng nhập, kèm email và thông báo tuỳ chọn. */
  onExit: (email: string, notice?: string) => void;
}

const STEP_NUMBER: Record<WizardStep, number> = { name: 1, otp: 2, password: 3, avatar: 4, welcome: 5 };

const STEP_TITLE: Record<WizardStep, string> = {
  name: 'Tạo tài khoản',
  otp: 'Xác minh email',
  password: 'Đặt mật khẩu',
  avatar: 'Tạo nhân vật của bạn',
  welcome: 'Hướng dẫn nhanh',
};

const STEP_LEAD: Record<WizardStep, string> = {
  name: 'Tạo tài khoản mất khoảng 5 đến 7 phút. Bạn sẽ xác minh email, đặt mật khẩu và tạo nhân vật của mình.',
  otp: 'Mã 6 chữ số có hiệu lực trong 10 phút. Nếu chưa thấy thư, hãy kiểm tra mục thư rác.',
  password: 'Email đã được xác minh. Đặt mật khẩu để lần sau đăng nhập nhanh hơn. Đừng dùng lại mật khẩu của dịch vụ khác.',
  avatar: 'Mọi mục đã có sẵn lựa chọn. Bạn có thể giữ nguyên, chỉnh vài mục, và đổi lại bất cứ lúc nào trong văn phòng.',
  welcome: 'Mất khoảng 1 phút. Bạn có thể bỏ qua và xem lại trong menu Trợ giúp.',
};

const TOUR_CARDS: readonly { title: string; text: string }[] = [
  { title: 'Di chuyển', text: 'Nhấn W, A, S, D hoặc phím mũi tên để đi lại. Kéo chuột để xoay góc nhìn.' },
  { title: 'Tương tác', text: 'Đến gần vật thể có viền sáng, nhấn E hoặc bấm vào vật thể để mở thông tin hoặc chức năng.' },
  { title: 'Khu trò chơi', text: 'Chơi giải trí cùng đồng nghiệp trong giờ nghỉ.' },
  { title: 'Karaoke', text: 'Phòng karaoke nội bộ để hát cùng nhau.' },
  { title: 'Giao lưu văn nghệ', text: 'Sân khấu cho các buổi biểu diễn và giao lưu nội bộ.' },
  { title: 'Service Desk', text: 'Quầy hỗ trợ ảo. Mở “Yêu cầu hỗ trợ” để tạo yêu cầu và theo dõi trạng thái.' },
];

function formatMmSs(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

interface Timing {
  expiresInSeconds: number | null;
  resendInSeconds: number | null;
}

interface Notice {
  tone: NoticeTone;
  text: string;
}

function blankCells(): string[] {
  return Array.from({ length: OTP_LENGTH }, () => '');
}

export function OnboardingWizard({ start, onFinished, onExit }: OnboardingWizardProps) {
  const [step, setStep] = useState<WizardStep>(start.step);
  const [email, setEmail] = useState(start.email);
  const [name, setName] = useState(start.name);
  const [timing, setTiming] = useState<Timing>({ expiresInSeconds: null, resendInSeconds: start.resendInSeconds });
  const [intro, setIntro] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(start.user);
  const [appearance, setAppearance] = useState<Appearance | null>(start.appearance);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Đưa tiêu đề bước vào tầm chú ý khi đổi bước (trình đọc màn hình và bàn phím).
  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

  /** Đọc lại bước từ server, dùng khi bước trên server đã đổi (ví dụ mở hai tab). */
  const resync = async () => {
    try {
      const session = await getSession();
      setUser(session.user);
      setAppearance(session.appearance);
      if (session.onboardingStep === 'done') {
        onFinished(session.user);
      } else if (session.onboardingStep === 'tour') {
        setStep('welcome');
      } else if (session.onboardingStep === 'appearance') {
        setStep('avatar');
      } else {
        onExit(session.user.email, 'Trạng thái tài khoản chưa khớp. Đăng nhập lại để tiếp tục.');
      }
    } catch (err) {
      onExit(email, err instanceof ApiError && err.status === 401 ? COPY.sessionExpired : errorText(err));
    }
  };

  const exitTo = (notice?: string) => onExit(email, notice);

  const onNameSent = (info: { email: string; name: string; expiresInSeconds: number | null; resendInSeconds: number | null }) => {
    setEmail(info.email);
    setName(info.name);
    setTiming({ expiresInSeconds: info.expiresInSeconds, resendInSeconds: info.resendInSeconds });
    setIntro(GENERIC_SENT);
    setStep('otp');
  };

  const onPasswordDone = (u: AuthUser) => {
    setUser(u);
    setAppearance(null);
    setStep('avatar');
  };

  return (
    <AuthLayout labelledBy="onb-step-title" wide={step === 'avatar'}>
      <header className="auth-step-head">
        <OnboardingProgress current={STEP_NUMBER[step]} />
        <h1 id="onb-step-title" ref={titleRef} tabIndex={-1} className="ui-panel-title auth-title">
          {STEP_TITLE[step]}
        </h1>
        <p className="ui-hint">{STEP_LEAD[step]}</p>
      </header>

      <div key={step} className="auth-enter">
        {step === 'name' && (
          <NameStep initialName={name} initialEmail={email} onSent={onNameSent} onLogin={(value) => onExit(value)} />
        )}

        {step === 'otp' && (
          <OtpStep
            email={email}
            expiresInSeconds={timing.expiresInSeconds}
            resendInSeconds={timing.resendInSeconds}
            intro={intro}
            onChangeEmail={() => setStep('name')}
            onVerified={() => setStep('password')}
          />
        )}

        {step === 'password' && (
          <PasswordStep email={email} name={name} onDone={onPasswordDone} onExit={exitTo} onResync={() => void resync()} />
        )}

        {step === 'avatar' && (
          <AvatarCreator
            initial={loadDraft() ?? appearance ?? DEFAULT_APPEARANCE}
            displayName={user?.name ?? name}
            onSaved={() => setStep('welcome')}
            onSessionLost={() => exitTo(COPY.sessionExpired)}
            onStepConflict={() => void resync()}
          />
        )}

        {step === 'welcome' && (
          <WelcomeStep user={user} onFinished={onFinished} onExit={exitTo} onResync={() => void resync()} />
        )}
      </div>
    </AuthLayout>
  );
}

interface SentInfo {
  email: string;
  name: string;
  expiresInSeconds: number | null;
  resendInSeconds: number | null;
}

interface NameStepProps {
  initialName: string;
  initialEmail: string;
  onSent: (info: SentInfo) => void;
  onLogin: (email: string) => void;
}

function NameStep({ initialName, initialEmail, onSent, onLogin }: NameStepProps) {
  const [name, setName] = useState(initialName);
  const [mail, setMail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<'name' | 'email' | null>(null);
  const nameId = useId();
  const nameHintId = useId();
  const emailId = useId();
  const emailHintId = useId();
  const errorId = useId();

  const fail = (field: 'name' | 'email', message: string) => {
    setErrorField(field);
    setError(message);
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const cleanName = name.trim();
    const cleanEmail = mail.trim().toLowerCase();
    if (cleanName.length < 2) {
      fail('name', 'Nhập họ và tên, ít nhất 2 ký tự.');
      return;
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      fail('email', 'Email chưa đúng định dạng. Ví dụ: ten@example.com');
      return;
    }
    setBusy(true);
    setError(null);
    setErrorField(null);
    try {
      const res = await register({ name: cleanName, email: cleanEmail });
      onSent({
        email: res.email,
        name: cleanName,
        expiresInSeconds: res.expiresInSeconds,
        resendInSeconds: res.resendInSeconds,
      });
    } catch (err) {
      setBusy(false);
      // Email đã có tài khoản: không báo riêng, đi tiếp như email mới để không lộ tài khoản.
      if (err instanceof ApiError && err.code === 'account_exists') {
        onSent({ email: cleanEmail, name: cleanName, expiresInSeconds: null, resendInSeconds: null });
        return;
      }
      if (err instanceof ApiError && err.code === 'otp_wait') {
        setError(waitCopy(errorNumber(err, 'retryAfter')));
        setErrorField('email');
        return;
      }
      setErrorField(err instanceof ApiError && err.code === 'invalid_input' ? 'email' : null);
      setError(
        errorText(err, {
          invalid_input: 'Thông tin chưa hợp lệ. Kiểm tra họ tên và email.',
          mail_failed: COPY.mailFailed,
        }),
      );
    }
  };

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <div className="ui-field">
        <label className="ui-label" htmlFor={nameId}>
          Họ và tên
        </label>
        <input
          id={nameId}
          className="ui-input"
          type="text"
          name="name"
          autoComplete="name"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-describedby={`${nameHintId}${error ? ` ${errorId}` : ''}`}
          aria-invalid={errorField === 'name' ? true : undefined}
          required
          disabled={busy}
        />
        <p id={nameHintId} className="ui-hint">
          Dùng họ tên thật để đồng nghiệp nhận ra bạn. Tối đa 80 ký tự.
        </p>
      </div>

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
          value={mail}
          onChange={(e) => setMail(e.target.value)}
          aria-describedby={`${emailHintId}${error ? ` ${errorId}` : ''}`}
          aria-invalid={errorField === 'email' ? true : undefined}
          required
          disabled={busy}
        />
        <p id={emailHintId} className="ui-hint">
          {EMAIL_HINT}
        </p>
      </div>

      <AuthNotice tone="error" text={error} id={errorId} />

      <button type="submit" className="ui-btn ui-btn-primary ui-btn-block" disabled={busy}>
        {busy && <Spinner />}
        {busy ? 'Đang xử lý…' : 'Tiếp tục'}
      </button>
      <div className="auth-row">
        <button type="button" className="ui-btn ui-btn-ghost" onClick={() => onLogin(mail.trim())} disabled={busy}>
          Đã có tài khoản? Đăng nhập
        </button>
      </div>
    </form>
  );
}

interface OtpStepProps {
  email: string;
  expiresInSeconds: number | null;
  resendInSeconds: number | null;
  intro: string | null;
  onChangeEmail: () => void;
  onVerified: () => void;
}

function OtpStep({ email, expiresInSeconds, resendInSeconds, intro, onChangeEmail, onVerified }: OtpStepProps) {
  const [cells, setCells] = useState<string[]>(blankCells);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrongCode, setWrongCode] = useState(false);
  const [info, setInfo] = useState<Notice | null>(intro === null ? null : { tone: 'info', text: intro });
  const [failures, setFailures] = useState(0);
  const [locked, setLocked] = useState(false);
  const [expiresAt, setExpiresAt] = useState(() => Date.now() + (expiresInSeconds ?? OTP_TTL_SECONDS) * 1000);
  const [resendUntil, setResendUntil] = useState(() => Date.now() + (resendInSeconds ?? OTP_RESEND_SECONDS) * 1000);
  const [now, setNow] = useState(() => Date.now());
  const [announce, setAnnounce] = useState('');
  const warnedRef = useRef(false);
  const expiredRef = useRef(false);
  const cellRefs = useRef<(HTMLInputElement | null)[]>([]);
  const codeLabelId = useId();
  const hintId = useId();

  const code = cells.join('');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const resendLeft = Math.max(0, Math.ceil((resendUntil - now) / 1000));
  const expired = remaining === 0;

  // Trình đọc màn hình chỉ được báo hai lần: khi còn dưới 1 phút và khi hết hạn.
  useEffect(() => {
    if (!warnedRef.current && remaining > 0 && remaining <= 60) {
      warnedRef.current = true;
      setAnnounce(OTP_EXPIRING_SOON);
    }
    if (expired && !expiredRef.current) {
      expiredRef.current = true;
      setAnnounce(COPY.otpExpired);
    }
  }, [remaining, expired]);

  const focusCell = (index: number) => {
    cellRefs.current[index]?.focus();
  };

  const clearCell = (index: number) => {
    setCells((prev) => {
      const next = [...prev];
      next[index] = '';
      return next;
    });
  };

  /** Ghi chữ số vào các ô từ ô start. Nếu có đủ 6 số (dán hoặc trình duyệt tự điền) thì điền từ ô đầu. */
  const fillFrom = (start: number, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits === '') return;
    const from = digits.length >= OTP_LENGTH ? 0 : start;
    setCells((prev) => {
      const next = [...prev];
      for (let k = 0; k < digits.length && from + k < OTP_LENGTH; k += 1) {
        next[from + k] = digits.charAt(k);
      }
      return next;
    });
    focusCell(Math.min(from + digits.length, OTP_LENGTH - 1));
  };

  const onCellChange = (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw.replace(/\D/g, '') === '') {
      clearCell(index);
      return;
    }
    fillFrom(index, raw);
  };

  const onCellKeyDown = (index: number, e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace' && cells[index] === '' && index > 0) {
      e.preventDefault();
      clearCell(index - 1);
      focusCell(index - 1);
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusCell(index - 1);
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      e.preventDefault();
      focusCell(index + 1);
    } else if (/^\d$/.test(e.key)) {
      e.preventDefault();
      fillFrom(index, e.key);
    }
  };

  const onCellPaste = (index: number, e: ReactClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    fillFrom(index, e.clipboardData.getData('text'));
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy || locked || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError(null);
    setWrongCode(false);
    try {
      await verifyOtp(email, code);
      onVerified();
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.code === 'otp_locked') {
        setLocked(true);
        setError(COPY.otpLocked);
        return;
      }
      if (err instanceof ApiError && err.code === 'invalid_code') {
        const nextFailures = failures + 1;
        setFailures(nextFailures);
        setWrongCode(true);
        const left = errorNumber(err, 'attemptsLeft') ?? Math.max(0, OTP_MAX_ATTEMPTS - nextFailures);
        if (left <= 0) {
          setLocked(true);
          setError(COPY.otpLocked);
          return;
        }
        setError(expired ? COPY.otpExpired : wrongCodeCopy(left));
        return;
      }
      setError(errorText(err, { invalid_input: 'Nhập đủ 6 chữ số.' }));
    }
  };

  const resend = async () => {
    if (resending || resendLeft > 0) return;
    setResending(true);
    setError(null);
    setWrongCode(false);
    setInfo(null);
    try {
      const res = await resendOtp(email);
      const at = Date.now();
      setNow(at);
      setResendUntil(at + (res.resendInSeconds ?? OTP_RESEND_SECONDS) * 1000);
      setExpiresAt(at + OTP_TTL_SECONDS * 1000);
      warnedRef.current = false;
      expiredRef.current = false;
      setLocked(false);
      setFailures(0);
      setCells(blankCells());
      setInfo({ tone: 'success', text: `Đã gửi mã mới tới ${email}. Kiểm tra hộp thư, kể cả thư rác.` });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'otp_wait') {
        const wait = errorNumber(err, 'retryAfter');
        setResendUntil(Date.now() + (wait ?? OTP_RESEND_SECONDS) * 1000);
        setError(waitCopy(wait));
      } else {
        setError(errorText(err, { mail_failed: COPY.mailFailed }));
      }
    } finally {
      setResending(false);
    }
  };

  const resendLabel = resending ? 'Đang gửi…' : resendLeft > 0 ? `Gửi lại mã sau ${resendLeft} giây` : 'Gửi lại mã';

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <p className="auth-email">
        Email: <strong>{email}</strong>
      </p>
      <AuthNotice tone={info?.tone ?? 'info'} text={info?.text ?? null} />

      <div className="ui-field">
        <p id={codeLabelId} className="ui-label">
          Mã xác minh (6 chữ số)
        </p>
        <div className="auth-otp" role="group" aria-labelledby={codeLabelId} aria-describedby={hintId}>
          {cells.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                cellRefs.current[i] = el;
              }}
              className="ui-input ui-input-otp"
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={OTP_LENGTH}
              value={digit}
              aria-label={`Chữ số ${i + 1} trên ${OTP_LENGTH}`}
              aria-invalid={wrongCode ? true : undefined}
              disabled={busy || locked}
              onChange={(e) => onCellChange(i, e)}
              onKeyDown={(e) => onCellKeyDown(i, e)}
              onPaste={(e) => onCellPaste(i, e)}
              onFocus={(e) => e.currentTarget.select()}
            />
          ))}
        </div>
        <p id={hintId} className="ui-hint">
          Có thể dán mã từ thư. Chỉ nhận chữ số.
        </p>
      </div>

      <p className="ui-badge auth-timer">{expired ? COPY.otpExpired : `Mã còn hiệu lực: ${formatMmSs(remaining)}`}</p>
      <p className="ui-sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      <AuthNotice tone="error" text={error} />

      <button
        type="submit"
        className="ui-btn ui-btn-primary ui-btn-block"
        disabled={busy || locked || code.length !== OTP_LENGTH}
      >
        {busy && <Spinner />}
        {busy ? 'Đang xử lý…' : 'Xác minh'}
      </button>

      <div className="auth-row">
        <button type="button" className="ui-btn ui-btn-ghost" onClick={resend} disabled={resending || resendLeft > 0}>
          {resendLabel}
        </button>
        <button type="button" className="ui-btn ui-btn-ghost" onClick={onChangeEmail} disabled={busy}>
          Đổi email
        </button>
      </div>
    </form>
  );
}

interface PasswordStepProps {
  email: string;
  name: string;
  onDone: (user: AuthUser) => void;
  onExit: (notice?: string) => void;
  onResync: () => void;
}

function PasswordStep({ email, name, onDone, onExit, onResync }: PasswordStepProps) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const pwId = useId();
  const confirmId = useId();
  const hintId = useId();
  const listId = useId();
  const errorId = useId();
  const mismatchId = useId();

  const hasPw = pw.length > 0;
  const checks = checkPassword(pw, email, name);
  const level = strengthLevel(checks);
  const reqOk = requiredOk(checks);
  const mismatch = confirm.length > 0 && confirm !== pw;
  const ruleError = hasPw ? passwordError(checks) : null;

  // Độ mạnh được báo cho trình đọc màn hình khi mức thay đổi, trễ 500 ms.
  useEffect(() => {
    if (!hasPw) return;
    const timer = window.setTimeout(() => setAnnounce(`Độ mạnh: ${STRENGTH_LABELS[level]}.`), STRENGTH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [level, hasPw]);

  const items: readonly { text: string; ok: boolean | null; okText?: string }[] = [
    { text: `Ít nhất ${PASSWORD_MIN} ký tự`, ok: checks.length },
    { text: `Không quá ${PASSWORD_MAX_BYTES} byte`, ok: checks.bytes },
    { text: 'Không giống email hoặc họ tên', ok: checks.notPersonal },
    { text: 'Không phổ biến', ok: null, okText: 'Kiểm tra khi lưu' },
    { text: 'Có chữ hoa và chữ thường (khuyến nghị)', ok: checks.caseMix },
    { text: 'Có số hoặc ký tự đặc biệt (khuyến nghị)', ok: checks.digitOrSymbol },
  ];

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy || !reqOk || mismatch) return;
    setBusy(true);
    setError(null);
    try {
      const session = await setPassword(pw);
      setPw('');
      setConfirm('');
      onDone(session.user);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 401) {
        onExit(COPY.sessionExpired);
        return;
      }
      if (err instanceof ApiError && err.code === 'onboarding_locked') {
        onExit(err.message);
        return;
      }
      if (err instanceof ApiError && err.status === 409 && err.code === 'step_conflict') {
        onResync();
        return;
      }
      setError(errorText(err));
    }
  };

  const shownError = ruleError ?? error;

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <div className="ui-field">
        <label className="ui-label" htmlFor={pwId}>
          Mật khẩu mới
        </label>
        <div className="auth-input-wrap">
          <input
            id={pwId}
            className="ui-input auth-input--with-toggle"
            type={show ? 'text' : 'password'}
            name="password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            aria-describedby={`${hintId} ${listId}${shownError ? ` ${errorId}` : ''}`}
            aria-invalid={ruleError ? true : undefined}
            disabled={busy}
          />
          <PasswordToggle shown={show} onToggle={() => setShow((s) => !s)} disabled={busy} />
        </div>
        <p id={hintId} className="ui-hint">
          Ít nhất 10 ký tự. Nên kết hợp chữ hoa, chữ thường và số.
        </p>
      </div>

      <div className="auth-strength-row">
        <div className="auth-strength" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`auth-strength-seg${hasPw && i <= level ? ' is-on' : ''}`} />
          ))}
        </div>
        <span className="auth-strength-text">{hasPw ? `Độ mạnh: ${STRENGTH_LABELS[level]}` : ''}</span>
      </div>
      <p className="ui-sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      <div className="ui-field">
        <label className="ui-label" htmlFor={confirmId}>
          Nhập lại mật khẩu
        </label>
        <input
          id={confirmId}
          className="ui-input"
          type={show ? 'text' : 'password'}
          name="password-confirm"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-describedby={mismatch ? mismatchId : undefined}
          aria-invalid={mismatch ? true : undefined}
          disabled={busy}
        />
        <AuthNotice tone="error" text={mismatch ? 'Hai mật khẩu chưa khớp.' : null} id={mismatchId} />
      </div>

      <ul id={listId} className="auth-checklist" aria-label="Yêu cầu mật khẩu">
        {items.map((item) => {
          const state: CheckState = item.ok === null ? 'neutral' : item.ok ? 'ok' : 'todo';
          const status = item.ok === null ? item.okText : item.ok ? 'Đạt' : 'Chưa đạt';
          return (
            <li key={item.text} className={`auth-check is-${state}`}>
              <CheckIcon state={state} />
              <span>
                {item.text}: {hasPw || item.ok === null ? status : 'Chưa đạt'}
              </span>
            </li>
          );
        })}
      </ul>

      <AuthNotice tone="error" text={shownError} id={errorId} />

      <button type="submit" className="ui-btn ui-btn-primary ui-btn-block" disabled={busy || !reqOk || mismatch}>
        {busy && <Spinner />}
        {busy ? 'Đang xử lý…' : 'Lưu mật khẩu và tiếp tục'}
      </button>
    </form>
  );
}

interface WelcomeStepProps {
  user: AuthUser | null;
  onFinished: (user: AuthUser) => void;
  onExit: (notice?: string) => void;
  onResync: () => void;
}

function WelcomeStep({ user, onFinished, onExit, onResync }: WelcomeStepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await markTourDone();
      if (user) {
        onFinished(user);
      } else {
        onResync();
      }
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 401) {
        onExit(COPY.sessionExpired);
        return;
      }
      if (err instanceof ApiError && err.status === 409 && err.code === 'step_conflict') {
        onResync();
        return;
      }
      setError(errorText(err));
    }
  };

  return (
    <div className="auth-welcome">
      <ul className="ui-list">
        {TOUR_CARDS.map((card) => (
          <li key={card.title}>
            <div className="ui-list-item">
              <div className="ui-list-item-main">
                <h2 className="ui-list-item-title auth-tour-title">{card.title}</h2>
                <div className="ui-list-item-meta">{card.text}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="ui-hint">Esc đóng bảng thông tin. Tab chuyển giữa các nút. Bản đồ nhỏ ở góc trên bên phải.</p>
      <p className="ui-hint">Xem lộ trình hội nhập tại Sảnh onboarding. Thông tin cá nhân chỉ hiện với bạn.</p>

      <AuthNotice tone="error" text={error} />

      <div className="ui-actions">
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => void finish()} disabled={busy}>
          {busy && <Spinner />}
          {busy ? 'Đang xử lý…' : 'Bắt đầu'}
        </button>
        <button type="button" className="ui-btn" onClick={() => void finish()} disabled={busy}>
          Bỏ qua
        </button>
      </div>
    </div>
  );
}
