import { describe, expect, it } from 'vitest';
import {
  ENTER_RADIUS,
  compactSdp,
  KEEP_RADIUS,
  MAX_PEERS,
  OPEN_AREA,
  micAnnouncement,
  micLabel,
  nextPeerState,
  pickPeers,
  retryDelayMs,
  roomAt,
  shouldInitiate,
  voiceGain,
  type Candidate,
  type PeerEvent,
  type PeerState,
} from './logic';

const me = { x: 0, z: 0, room: OPEN_AREA };
const at = (id: string, x: number, z = 0, room = OPEN_AREA): Candidate => ({ id, x, z, room });

describe('pickPeers', () => {
  it('chọn gần nhất, tối đa MAX_PEERS', () => {
    const others = Array.from({ length: 10 }, (_, i) => at(`p${i}`, i + 1));
    const got = pickPeers(me, others, new Set());
    expect(got).toHaveLength(MAX_PEERS);
    expect(got).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5']);
  });
  it('người xa hơn bán kính vào bị loại; người đang nối được giữ tới KEEP_RADIUS (trễ)', () => {
    const o = [at('a', ENTER_RADIUS + 2), at('b', KEEP_RADIUS + 1)];
    expect(pickPeers(me, o, new Set())).toEqual([]);
    expect(pickPeers(me, o, new Set(['a', 'b']))).toEqual(['a']);
  });
  it('cùng phòng kín luôn được chọn dù xa, và ưu tiên trước người gần ở ngoài', () => {
    const m = { x: 0, z: 0, room: 'meeting#0' };
    const o = [at('near', 1), at('inroom', 40, 0, 'meeting#0')];
    expect(pickPeers(m, o, new Set(), 1)).toEqual(['inroom']);
  });
  it('bỏ tọa độ không hợp lệ, ổn định khi hòa khoảng cách', () => {
    expect(pickPeers(me, [at('x', NaN), at('b', 3), at('a', 3)], new Set())).toEqual(['a', 'b']);
    expect(pickPeers(me, [at('a', 1)], new Set(), 0)).toEqual([]);
  });
});

describe('voiceGain', () => {
  it('khoảng mở: 1 ở gần, giảm dần, 0 ở xa', () => {
    expect(voiceGain(1, OPEN_AREA, OPEN_AREA).gain).toBe(1);
    const g10 = voiceGain(10, OPEN_AREA, OPEN_AREA).gain;
    const g20 = voiceGain(20, OPEN_AREA, OPEN_AREA).gain;
    expect(g10).toBeGreaterThan(g20);
    expect(g20).toBeGreaterThan(0);
    expect(voiceGain(25, OPEN_AREA, OPEN_AREA).gain).toBe(0);
  });
  it('cùng phòng họp nghe rõ dù cách xa', () => {
    expect(voiceGain(12, 'meeting#1', 'meeting#1')).toEqual({ gain: 1, cutoffHz: 20000 });
  });
  it('khác phòng (qua tường) nhỏ hơn và bị lọc thấp', () => {
    const wall = voiceGain(3, 'meeting#1', OPEN_AREA);
    const open = voiceGain(3, OPEN_AREA, OPEN_AREA);
    expect(wall.gain).toBeLessThan(open.gain);
    expect(wall.cutoffHz).toBeLessThan(open.cutoffHz);
    expect(voiceGain(3, 'meeting#1', 'meeting#2').gain).toBeLessThan(1);
  });
  it('khoảng cách không hợp lệ thì im', () => {
    expect(voiceGain(NaN, OPEN_AREA, OPEN_AREA).gain).toBe(0);
  });
});

describe('roomAt', () => {
  const rects = [
    { zone: 'lounge', minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
    { zone: 'meeting', minX: 0, maxX: 4, minZ: 0, maxZ: 4 },
    { zone: 'meeting', minX: 10, maxX: 14, minZ: 0, maxZ: 4 },
  ];
  it('mỗi phòng họp có mã riêng; lounge (không tường) tính là khoảng mở', () => {
    expect(roomAt(rects, 2, 2)).toBe('meeting#1');
    expect(roomAt(rects, 12, 2)).toBe('meeting#2');
    expect(roomAt(rects, -5, -5)).toBe(OPEN_AREA);
    expect(roomAt(rects, 50, 50)).toBe(OPEN_AREA);
  });
});

describe('shouldInitiate', () => {
  it('đúng một phía tạo offer', () => {
    expect(shouldInitiate('a', 'b')).toBe(true);
    expect(shouldInitiate('b', 'a')).toBe(false);
  });
});

describe('nextPeerState', () => {
  const run = (start: PeerState, ev: PeerEvent[]) => ev.reduce(nextPeerState, start);
  it('đường người gọi: idle -> offering -> connecting -> connected', () => {
    expect(run('idle', ['local_offer'])).toBe('offering');
    expect(run('idle', ['local_offer', 'answer'])).toBe('connecting');
    expect(run('idle', ['local_offer', 'answer', 'ice_connected'])).toBe('connected');
  });
  it('đường người nghe: idle -> answering -> connected', () => {
    expect(run('idle', ['remote_offer', 'ice_connected'])).toBe('connected');
  });
  it('mất kết nối tạm thời rồi phục hồi; failed/closed là trạng thái cuối', () => {
    expect(run('connected', ['ice_disconnected'])).toBe('connecting');
    expect(run('connected', ['ice_disconnected', 'ice_connected'])).toBe('connected');
    expect(run('connecting', ['ice_failed', 'ice_connected'])).toBe('failed');
    expect(run('connected', ['bye', 'ice_connected'])).toBe('closed');
    expect(run('offering', ['close'])).toBe('closed');
  });
  it('timeout: chưa nối được thì failed, đã nối thì bỏ qua', () => {
    expect(run('offering', ['timeout'])).toBe('failed');
    expect(run('connected', ['timeout'])).toBe('connected');
  });
  it('answer lạc (không ở offering) không đổi trạng thái', () => {
    expect(run('connected', ['answer'])).toBe('connected');
    expect(run('idle', ['answer'])).toBe('idle');
  });
});

describe('retryDelayMs và nhãn', () => {
  it('lùi mũ có trần 30 s', () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelayMs)).toEqual([3000, 6000, 12000, 24000, 30000, 30000]);
  });
  it('nhãn tiếng Việt theo trạng thái', () => {
    expect(micLabel(false)).toBe('Bật mic');
    expect(micLabel(true)).toBe('Tắt mic');
    expect(micAnnouncement(true)).toContain('Đã bật mic');
    expect(micAnnouncement(false)).toBe('Đã tắt mic.');
  });
});

describe('compactSdp', () => {
  const cand = (n: number, proto: string, ip: string, typ: string) => `a=candidate:${n} 1 ${proto} 100 ${ip} ${4000 + n} typ ${typ}`;
  const sdp = [
    'v=0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    ...Array.from({ length: 10 }, (_, i) => cand(i, 'udp', `172.17.0.${i}`, 'host')),
    cand(20, 'udp', '198.204.229.10', 'host'),
    cand(21, 'tcp', '198.204.229.10', 'host'),
    ...Array.from({ length: 6 }, (_, i) => cand(30 + i, 'udp', '203.0.113.5', 'srflx')),
    ...Array.from({ length: 5 }, (_, i) => cand(40 + i, 'udp', '198.204.229.10', 'relay')),
    'a=end-of-candidates',
    '',
  ].join('\r\n');
  it('giữ quota theo loại, bỏ TCP, host công khai đứng trước host mạng riêng, giữ các dòng khác', () => {
    const out = compactSdp(sdp);
    const c = out.split('\r\n').filter((l) => l.startsWith('a=candidate:'));
    expect(c.filter((l) => l.endsWith('typ relay'))).toHaveLength(3);
    expect(c.filter((l) => l.endsWith('typ srflx'))).toHaveLength(2);
    expect(c.filter((l) => l.endsWith('typ host'))).toHaveLength(3);
    expect(c.some((l) => l.includes(' tcp '))).toBe(false);
    expect(c.some((l) => l.includes('198.204.229.10') && l.endsWith('typ host'))).toBe(true);
    expect(out).toContain('m=audio 9 UDP/TLS/RTP/SAVPF 111');
    expect(out).toContain('a=end-of-candidates');
    expect(out.length).toBeLessThan(sdp.length / 2);
  });
  it('SDP không có ứng viên giữ nguyên', () => {
    expect(compactSdp('v=0\r\nm=audio 9 X 1\r\n')).toBe('v=0\r\nm=audio 9 X 1\r\n');
  });
});
