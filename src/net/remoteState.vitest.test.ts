import { describe, expect, it } from 'vitest';
import { lerpAngle, RemoteStore } from './remoteState';

const P = (id: string, t: number, x: number, z = 0, yaw = 0, anim = 'walk') => ({ id, name: id, x, z, yaw, anim, seq: t, t });

describe('RemoteStore', () => {
  it('nội suy tuyến tính giữa hai mẫu', () => {
    const s = new RemoteStore();
    s.push(P('a', 1000, 0));
    s.push(P('a', 1100, 1));
    expect(s.sample('a', 1050)?.x).toBeCloseTo(0.5);
  });

  it('gói đến sai thứ tự được chèn đúng chỗ; trùng t bị bỏ', () => {
    const s = new RemoteStore();
    s.push(P('a', 1200, 2));
    s.push(P('a', 1000, 0));
    s.push(P('a', 1100, 1));
    s.push(P('a', 1100, 99));
    expect(s.sample('a', 1050)?.x).toBeCloseTo(0.5);
    expect(s.sample('a', 1150)?.x).toBeCloseTo(1.5);
  });

  it('trước mẫu đầu và sau mẫu cuối giữ nguyên mẫu biên (không ngoại suy)', () => {
    const s = new RemoteStore();
    s.push(P('a', 1000, 0));
    s.push(P('a', 1100, 1));
    expect(s.sample('a', 500)?.x).toBe(0);
    expect(s.sample('a', 5000)?.x).toBe(1);
  });

  it('teleport: khoảng cách lớn không nội suy xuyên không gian', () => {
    const s = new RemoteStore({ teleportMeters: 6 });
    s.push(P('a', 1000, 0));
    s.push(P('a', 1100, 20));
    expect(s.sample('a', 1050)?.x).toBe(0);
    expect(s.sample('a', 1100)?.x).toBe(20);
  });

  it('yaw nội suy theo cung ngắn qua ±π', () => {
    expect(lerpAngle(3.0, -3.0, 0.5)).toBeCloseTo(3.1416, 2);
    const s = new RemoteStore();
    s.push(P('a', 0, 0, 0, 3.0));
    s.push(P('a', 100, 0, 0, -3.0));
    const y = s.sample('a', 50)!.yaw;
    expect(Math.abs(Math.cos(y) + 1)).toBeLessThan(0.01);
  });

  it('giới hạn số mẫu; remove và reset xóa lịch sử', () => {
    const s = new RemoteStore({ maxSamples: 3 });
    for (let i = 0; i < 10; i++) s.push(P('a', i * 100, i));
    expect(s.sample('a', 0)?.x).toBe(7);
    s.push(P('b', 0, 0));
    s.remove('a');
    expect(s.ids()).toEqual(['b']);
    s.reset([P('c', 0, 0)]);
    expect(s.ids()).toEqual(['c']);
    expect(s.nameOf('c')).toBe('c');
    expect(s.sample('zzz', 0)).toBeNull();
  });

  it('sampleNow dùng độ trễ nội suy và chênh lệch đồng hồ', () => {
    const s = new RemoteStore({ interpDelayMs: 100 });
    s.syncClock(10_000, 1000); // server nhanh hơn client 9000 ms
    s.push(P('a', 9900, 0));
    s.push(P('a', 10_000, 1));
    // client 1100 -> server 10100 -> trừ 100 = 10000
    expect(s.sampleNow('a', 1100)?.x).toBe(1);
    expect(s.sampleNow('a', 1050)?.x).toBeCloseTo(0.5);
  });
});
