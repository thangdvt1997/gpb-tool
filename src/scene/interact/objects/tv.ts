import type { InteractableDef, Footprint, InteractPoint } from '../registry';
import { getObjectState, setObjectState, type ObjectState } from '../objectStates';
import { emitInteractEvent } from './interactEvents';

/** TV: bật/tắt, đổi kênh mẫu (vòng tròn), âm lượng 0..VOLUME_MAX. */
export const VOLUME_MAX = 10;
export const TV_CHANNELS: readonly { name: string; color: number }[] = [
  { name: 'Bản tin nội bộ', color: 0x2f6fb3 },
  { name: 'Lịch họp hôm nay', color: 0x3c9d6b },
  { name: 'Video giới thiệu', color: 0xb35a2f },
  { name: 'Đồng hồ', color: 0x6b4fb3 },
];

export interface TvState {
  on: boolean;
  channel: number;
  volume: number;
}

export function tvOf(s: ObjectState): TvState {
  return {
    on: s.on === true,
    channel: typeof s.channel === 'number' ? s.channel : 0,
    volume: typeof s.volume === 'number' ? s.volume : 3,
  };
}

export const tvPower = (s: TvState): Partial<TvState> => ({ on: !s.on });

/** Đổi kênh chỉ khi đang bật; vòng tròn qua count kênh. */
export function tvChannel(s: TvState, delta: number, count = TV_CHANNELS.length): Partial<TvState> | null {
  if (!s.on || count <= 0) return null;
  return { channel: (((s.channel + delta) % count) + count) % count };
}

/** Chỉnh âm lượng, kẹp [0, VOLUME_MAX]; null nếu tắt hoặc không đổi. */
export function tvVolume(s: TvState, delta: number): Partial<TvState> | null {
  if (!s.on) return null;
  const v = Math.min(VOLUME_MAX, Math.max(0, Math.round(s.volume + delta)));
  return v === s.volume ? null : { volume: v };
}

export interface TvOptions {
  id: string;
  label?: string;
  footprint: Footprint;
  point?: InteractPoint;
  baseY?: number;
  height?: number;
  channels?: number;
}

export function tvInteractable(o: TvOptions): InteractableDef {
  const at = { x: o.footprint.cx, z: o.footprint.cz };
  const cur = () => tvOf(getObjectState(o.id));
  const n = o.channels ?? TV_CHANNELS.length;
  const on = (c: { state: ObjectState }) => tvOf(c.state).on;
  const apply = (p: Partial<TvState> | null, type: 'tv.channel' | 'tv.volume') => {
    if (!p) return;
    setObjectState(o.id, p);
    emitInteractEvent({ type, id: o.id, ...at, data: { ...(p as Record<string, number>) } });
  };
  return {
    id: o.id,
    kind: 'tv',
    label: o.label ?? 'TV',
    footprint: o.footprint,
    baseY: o.baseY ?? 1.1,
    height: o.height ?? 0.97,
    point: o.point,
    maxDistance: 3,
    defaultState: { on: false, channel: 0, volume: 3 },
    actions: [
      {
        id: 'power',
        label: (c) => (tvOf(c.state).on ? 'Tắt TV' : 'Bật TV'),
        run: () => {
          const s = cur();
          setObjectState(o.id, tvPower(s));
          emitInteractEvent({ type: s.on ? 'tv.off' : 'tv.on', id: o.id, ...at });
        },
      },
      { id: 'channel', label: 'Đổi kênh', when: on, run: () => apply(tvChannel(cur(), 1, n), 'tv.channel') },
      { id: 'vol_up', label: 'Tăng âm lượng', when: on, run: () => apply(tvVolume(cur(), 1), 'tv.volume') },
      { id: 'vol_down', label: 'Giảm âm lượng', when: on, run: () => apply(tvVolume(cur(), -1), 'tv.volume') },
    ],
  };
}
