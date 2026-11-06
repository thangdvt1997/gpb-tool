import type { QualityMode } from './levels';
import type { QualitySettings } from './storage';

const LABEL: Record<QualityMode, string> = {
  auto: 'Tự động',
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  custom: 'Tùy chỉnh',
};
const MODES: QualityMode[] = ['auto', 'low', 'medium', 'high'];

export interface QualityPickerProps {
  settings: QualitySettings;
  onChange: (s: QualitySettings) => void;
  /** Mức đang chạy (khi Tự động có thể khác mức đã chọn). */
  level: string;
}

/** Chọn chế độ đồ họa. Chỉ hiện các chế độ engine áp dụng được (ENGINE_SUPPORT: dpr, đổ bóng). */
export function QualityPicker({ settings, onChange, level }: QualityPickerProps) {
  return (
    <label className="quality-picker small">
      Đồ họa{' '}
      <select
        value={settings.mode === 'custom' ? 'medium' : settings.mode}
        onChange={(e) => onChange({ ...settings, mode: e.target.value as QualityMode })}
        aria-describedby="quality-current"
      >
        {MODES.map((m) => (
          <option key={m} value={m}>
            {LABEL[m]}
          </option>
        ))}
      </select>
      <span id="quality-current" className="muted">
        {' '}
        đang chạy: {LABEL[level as QualityMode] ?? level}
      </span>
    </label>
  );
}
