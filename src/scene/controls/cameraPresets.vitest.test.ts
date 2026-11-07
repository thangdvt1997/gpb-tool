import { describe, it, expect, afterEach } from 'vitest';
import { CAMERA_PRESETS, getPreset, nextPresetId, selectPreset, cyclePreset, setPresetApplier, setActivePresetId, getActivePresetId } from './cameraPresets';
import { isInsideOffice } from '../officeBounds';
import { MODE_POLICY } from './cameraModes';
import { DEFAULT_BINDINGS } from '../../settings/schema';

describe('camera điểm đặt sẵn', () => {
  afterEach(() => {
    setPresetApplier(null);
    setActivePresetId(null);
  });

  it('đủ năm preset theo room.txt, id duy nhất', () => {
    expect(CAMERA_PRESETS.map((p) => p.id)).toEqual(['overview', 'corridor_left', 'corridor_bottom', 'desk_cluster', 'meeting_room']);
    expect(new Set(CAMERA_PRESETS.map((p) => p.id)).size).toBe(5);
  });

  it('mọi điểm nhìn nằm trong hình L', () => {
    for (const p of CAMERA_PRESETS) expect(isInsideOffice(p.x, p.z), p.id).toBe(true);
  });

  it('góc và khoảng cách nằm trong giới hạn chế độ overview (không bị kẹp lệch)', () => {
    const pol = MODE_POLICY.overview;
    for (const p of CAMERA_PRESETS) {
      expect(p.dist, p.id).toBeGreaterThanOrEqual(pol.minDist);
      expect(p.dist, p.id).toBeLessThanOrEqual(pol.maxDist);
      expect(p.pitch, p.id).toBeGreaterThanOrEqual(pol.minPitch);
      expect(p.pitch, p.id).toBeLessThanOrEqual(pol.maxPitch);
    }
  });

  it('vòng phím: lần lượt từng preset rồi thoát (null)', () => {
    let cur: string | null = null;
    const seen: (string | null)[] = [];
    for (let i = 0; i < 6; i++) {
      cur = nextPresetId(cur);
      seen.push(cur);
    }
    expect(seen).toEqual(['overview', 'corridor_left', 'corridor_bottom', 'desk_cluster', 'meeting_room', null]);
    expect(nextPresetId('không_có')).toBeNull();
  });

  it('selectPreset gọi hàm áp; thiếu camera hoặc id sai thì false', () => {
    expect(selectPreset('overview')).toBe(false);
    const applied: (string | null)[] = [];
    setPresetApplier((p) => {
      applied.push(p?.id ?? null);
      setActivePresetId(p?.id ?? null);
    });
    expect(selectPreset('nope')).toBe(false);
    expect(cyclePreset()).toBe(true);
    expect(getActivePresetId()).toBe('overview');
    expect(cyclePreset()).toBe(true);
    expect(getActivePresetId()).toBe('corridor_left');
    expect(selectPreset(null)).toBe(true);
    expect(getActivePresetId()).toBeNull();
    expect(applied).toEqual(['overview', 'corridor_left', null]);
    expect(getPreset('meeting_room')?.label).toBe('Phòng họp');
  });

  it('phím mặc định C, không trùng phím gameplay khác', () => {
    expect(DEFAULT_BINDINGS.cameraPreset).toBe('KeyC');
    expect(Object.entries(DEFAULT_BINDINGS).filter(([k, v]) => k !== 'cameraPreset' && v === 'KeyC')).toEqual([]);
  });
});
