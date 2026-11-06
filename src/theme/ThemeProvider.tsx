import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { applyTheme, currentTheme } from './apply';
import type { ThemeName } from './tokens';

// Khi không ghi đè, theme được tính lại theo lịch mỗi 10 phút.
const AUTO_REFRESH_MS = 10 * 60 * 1000;

export interface ThemeProviderProps {
  // Giá trị ban đầu của state. Khi chế độ tự động bật, giá trị này được thay bằng currentTheme() ngay sau khi mount.
  initial?: ThemeName;
  // Ghi đè thủ công. Khi là null thì dùng theo lịch.
  override?: ThemeName | null;
  children: ReactNode;
}

export interface ThemeContextValue {
  theme: ThemeName;
  // true khi theme đang theo lịch, false khi đang ghi đè thủ công.
  isAuto: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ initial, override = null, children }: ThemeProviderProps) {
  const [autoTheme, setAutoTheme] = useState<ThemeName>(() => initial ?? currentTheme());

  // Chỉ chạy đồng hồ khi không ghi đè. Khi có ghi đè thì không cần cập nhật.
  useEffect(() => {
    if (override !== null) return undefined;
    const refresh = () => setAutoTheme(currentTheme());
    refresh();
    const timer = window.setInterval(refresh, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [override]);

  const theme: ThemeName = override ?? autoTheme;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, isAuto: override === null }),
    [theme, override],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useTheme phải được dùng bên trong <ThemeProvider>.');
  }
  return ctx;
}
