const STEP_LABELS = ['Thông tin', 'Xác minh', 'Mật khẩu', 'Nhân vật', 'Bắt đầu'] as const;

function TickIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M3.5 8.5l3 3 6-6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Thanh tiến trình 5 bước. current là số bước hiện tại, đánh số từ 1. Bước đã xong hiện dấu tick. */
export function OnboardingProgress({ current }: { current: number }) {
  return (
    <ol className="onb-stepper" aria-label={`Tiến trình đăng ký, bước ${current} trên ${STEP_LABELS.length}`}>
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        const className = done ? 'onb-step is-done' : active ? 'onb-step is-current' : 'onb-step';
        return (
          <li key={label} className={className} aria-current={active ? 'step' : undefined}>
            <span className="onb-step-dot" aria-hidden="true">
              {done ? <TickIcon /> : n}
            </span>
            <span className="onb-step-label">
              {label}
              {done ? <span className="ui-sr-only"> (đã hoàn thành)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
