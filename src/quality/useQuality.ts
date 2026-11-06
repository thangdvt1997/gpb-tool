import { useCallback, useMemo, useState } from 'react';
import { createAdaptiveController, type Change } from './adaptive';
import type { QualityLevel } from './levels';
import { effectiveConfig, readDeviceHints, resolveQuality } from './resolve';
import { loadQualitySettings, saveQualitySettings, type QualitySettings } from './storage';

/**
 * Trạng thái chất lượng đồ họa cho App (TASK 13): cài đặt lưu cục bộ, mức hiện tại, bộ tự thích nghi.
 * PerfProbe (src/perf) đẩy mẫu khung vào `adaptive` và gọi `onChange` khi mức đổi.
 */
export function useQuality(maxDrawCalls = 200) {
  const [settings, setSettingsState] = useState<QualitySettings>(() => loadQualitySettings());
  const hints = useMemo(() => readDeviceHints(), []);
  const initial = useMemo(() => resolveQuality(settings, hints), [settings, hints]);
  // Tạo lại bộ điều khiển khi người dùng đổi chế độ.
  const adaptive = useMemo(() => {
    const a = createAdaptiveController({ initial: initial.level, ceiling: initial.ceiling, maxDrawCalls });
    a.setEnabled(initial.adaptive);
    return a;
  }, [initial.level, initial.ceiling, initial.adaptive, maxDrawCalls]);
  const [level, setLevel] = useState<QualityLevel>(initial.level);
  const [lastChange, setLastChange] = useState<Change | null>(null);

  const setSettings = useCallback((s: QualitySettings) => {
    saveQualitySettings(s);
    setSettingsState(s);
    const r = resolveQuality(s, hints);
    // Cùng chế độ thì useMemo không tạo lại bộ thích nghi: đặt mức cho nó để HUD và bộ điều khiển không lệch.
    adaptive.setLevel(r.level);
    setLevel(r.level);
  }, [hints, adaptive]);
  const onChange = useCallback((c: Change) => {
    setLevel(c.to);
    setLastChange(c);
  }, []);

  const config = effectiveConfig(settings, level);
  return { settings, setSettings, level, config, adaptive: initial.adaptive ? adaptive : undefined, onChange, lastChange };
}
