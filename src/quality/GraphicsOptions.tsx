import type { QualityConfig } from './levels';
import type { GfxOptions, QualitySettings } from './storage';

const TIER_LABEL = ['Thấp', 'Trung bình', 'Cao'] as const;
const LOD_LABEL: Record<number, string> = { 0.6: 'Gần (cắt sớm)', 1: 'Vừa', 1.5: 'Xa (cắt muộn)' };
const AUTO = 'auto';

export interface GraphicsOptionsProps {
  settings: QualitySettings;
  /** Cấu hình đang chạy (đã gộp mức và ghim), để hiện giá trị hiệu lực. */
  config: QualityConfig;
  onChange: (s: QualitySettings) => void;
}

/**
 * Ba tùy chọn đồ họa riêng (texture, LOD, AO) trong Cài đặt > Hiển thị. "Theo mức đồ họa" = để chế độ
 * Tự động / mức đã chọn quyết định (và tự thích nghi đổi được); chọn giá trị cụ thể là ghim giá trị đó.
 */
export function GraphicsOptions({ settings, config, onChange }: GraphicsOptionsProps): JSX.Element {
  const set = (patch: GfxOptions, drop?: keyof GfxOptions) => {
    const next: GfxOptions = { ...(settings.options ?? {}), ...patch };
    if (drop) delete next[drop];
    onChange({ ...settings, options: Object.keys(next).length ? next : undefined });
  };
  const o = settings.options ?? {};
  return (
    <fieldset className="sp-gfx" style={{ border: 0, padding: 0, margin: '8px 0 0' }}>
      <legend style={{ fontWeight: 600, padding: 0 }}>Đồ họa nâng cao</legend>
      <label className="sp-row">
        <span>Chất lượng texture (đang dùng: {TIER_LABEL[config.textureTier]})</span>
        <select
          id="gfx-texture"
          value={o.textureTier === undefined ? AUTO : String(o.textureTier)}
          onChange={(e) => (e.target.value === AUTO ? set({}, 'textureTier') : set({ textureTier: Number(e.target.value) as QualityConfig['textureTier'] }))}
        >
          <option value={AUTO}>Theo mức đồ họa</option>
          <option value="0">Thấp</option>
          <option value="1">Trung bình</option>
          <option value="2">Cao</option>
        </select>
      </label>
      <label className="sp-row">
        <span>Khoảng nhìn chi tiết nhỏ, LOD (đang dùng: {LOD_LABEL[config.lodDistanceScale] ?? config.lodDistanceScale})</span>
        <select
          id="gfx-lod"
          value={o.lodDistanceScale === undefined ? AUTO : String(o.lodDistanceScale)}
          onChange={(e) => (e.target.value === AUTO ? set({}, 'lodDistanceScale') : set({ lodDistanceScale: Number(e.target.value) }))}
        >
          <option value={AUTO}>Theo mức đồ họa</option>
          <option value="0.6">Gần (cắt sớm)</option>
          <option value="1">Vừa</option>
          <option value="1.5">Xa (cắt muộn)</option>
        </select>
      </label>
      <label className="sp-row">
        <span>Bóng tiếp xúc mềm, AO (đang dùng: {config.ambientOcclusion ? 'bật' : 'tắt'})</span>
        <select
          id="gfx-ao"
          value={o.ambientOcclusion === undefined ? AUTO : o.ambientOcclusion ? 'on' : 'off'}
          onChange={(e) => (e.target.value === AUTO ? set({}, 'ambientOcclusion') : set({ ambientOcclusion: e.target.value === 'on' }))}
        >
          <option value={AUTO}>Theo mức đồ họa</option>
          <option value="on">Bật</option>
          <option value="off">Tắt</option>
        </select>
      </label>
    </fieldset>
  );
}
