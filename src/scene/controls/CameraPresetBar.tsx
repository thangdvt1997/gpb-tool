import { useSyncExternalStore } from 'react';
import { keyLabel } from '../../settings/rebindFlow';
import { keyFor } from './bindings';
import { CAMERA_PRESETS, getActivePresetId, selectPreset, subscribePreset } from './cameraPresets';

/**
 * Thanh chọn camera điểm đặt sẵn. Chỉ hiện khi đang dùng một preset (vào bằng phím preset, mặc định C);
 * nút "Về nhân vật" hoặc Esc thoát về camera theo nhân vật.
 */
export function CameraPresetBar(): JSX.Element | null {
  const active = useSyncExternalStore(subscribePreset, getActivePresetId, () => null);
  if (active === null) return null;
  return (
    <div
      role="toolbar"
      aria-label="Camera điểm đặt sẵn"
      data-testid="camera-preset-bar"
      style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, padding: 6, borderRadius: 8, background: 'rgba(20,22,26,.88)', font: '13px system-ui, sans-serif', zIndex: 20 }}
    >
      {CAMERA_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={p.id === active}
          data-preset={p.id}
          onClick={() => selectPreset(p.id)}
          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #666', color: '#f2f2f2', background: p.id === active ? '#2f6fd0' : 'transparent', cursor: 'pointer' }}
        >
          {p.label}
        </button>
      ))}
      <button type="button" onClick={() => selectPreset(null)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #666', color: '#f2f2f2', background: 'transparent', cursor: 'pointer' }}>
        Về nhân vật ({keyLabel(keyFor('cameraPreset'))}/Esc)
      </button>
    </div>
  );
}
