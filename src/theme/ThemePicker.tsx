import { useId } from 'react';
import type { ChangeEvent } from 'react';
import { THEME_NAMES } from './tokens';
import type { ThemeName } from './tokens';

const THEME_LABELS: Record<ThemeName, string> = {
  'office-day': 'Ngày làm việc',
  'after-work': 'Sau giờ làm',
  tet: 'Tết',
  midautumn: 'Trung thu',
  party: 'Tiệc',
};

export interface ThemePickerProps {
  value: ThemeName;
  onChange(name: ThemeName): void;
  // Danh sách theme được phép chọn. Mặc định là tất cả.
  allowed?: ThemeName[];
}

// Ô chọn giao diện. Nên đặt value trong allowed, nếu không select sẽ hiện mục đầu tiên.
export function ThemePicker({ value, onChange, allowed }: ThemePickerProps) {
  const selectId = useId();
  const options: readonly ThemeName[] = allowed
    ? THEME_NAMES.filter((name) => allowed.includes(name))
    : THEME_NAMES;

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    onChange(event.target.value as ThemeName);
  }

  return (
    <div className="theme-picker">
      <label htmlFor={selectId}>Giao diện</label>
      <select id={selectId} value={value} onChange={handleChange} aria-label="Chọn giao diện">
        {options.map((name) => (
          <option key={name} value={name}>
            {THEME_LABELS[name]}
          </option>
        ))}
      </select>
    </div>
  );
}
