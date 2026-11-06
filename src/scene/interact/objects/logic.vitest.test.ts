import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DOOR_DEFAULTS, doorToggle, doorTick, doorLock, doorUnlock, doorBlocked, playerSideOf, leafEnd, doorOf, doorInteractable, registerDoorTicker, type DoorState,
} from './door';
import { chairSit, chairStand, chairSwivel, findStandSpot, chairInteractable } from './chair';
import { computerPower, computerLogin, computerNote, computerWallpaper, computerDoc, screenGlow, canUseComputer, SAMPLE_DOCS, WALLPAPER_COUNT, NOTE_MAX } from './computer';
import { planDrawerToggle, drawerOffset, drawerInteractables, drawerId } from './drawer';
import { isLightGroupOn, toggleLightGroup, switchInteractable, lightGroupId } from './lightSwitch';
import { tvPower, tvChannel, tvVolume, VOLUME_MAX, TV_CHANNELS } from './tv';
import { curtainStep, curtainDaylight, MIN_DAYLIGHT, curtainInteractable, getCurtainDaylight } from './curtain';
import { validatePlacement, snapToSurface, placementSpot, itemInteractable, surfaceInteractable, getHeldItem, clearItemRegistry, SURFACE_PRIORITY_HOLDING, SURFACE_PRIORITY_IDLE } from './smallItem';
import { printerSubmit, printerTick, printerClearJam, QUEUE_MAX, PRINTER_INITIAL, printerOf, printerInteractable, registerPrinterTicker } from './printer';
import { waterTakeCup, waterPour, waterTake, waterTick, waterOf, WATER_INITIAL, waterInteractable, registerWaterTicker, POUR_SECONDS } from './waterCooler';
import { onInteractEvent, onInteractEventType, clearInteractListeners, emitInteractEvent, type InteractEvent } from './interactEvents';
import { tickAll, registerTicker, tickerCount } from './tickers';
import { resetObjectStates, getObjectState, setObjectState } from '../objectStates';
import { registerInteractable, getInteractable, availableActions } from '../registry';
import { resetCharacterState } from '../characterState';

const closed: DoorState = { phase: 'closed', angle: 0, dir: 1, timer: 0 };
const cfg = DOOR_DEFAULTS;

describe('cửa', () => {
  it('mở về phía xa người: người ở phía +n thì dir=+1, phía -n thì -1', () => {
    expect(doorToggle(closed, 1)).toMatchObject({ phase: 'opening', dir: 1 });
    expect(doorToggle(closed, -1)).toMatchObject({ phase: 'opening', dir: -1 });
    // yaw 0: n = +z. Người ở z>0 là phía +.
    expect(playerSideOf(0, 2, { x: 0, z: 0 }, 0)).toBe(1);
    expect(playerSideOf(0, -2, { x: 0, z: 0 }, 0)).toBe(-1);
  });
  it('lá cửa thực sự đi về phía xa người (kiểm hình học)', () => {
    for (const yaw of [0, 1, 2.5]) {
      for (const side of [1, -1] as const) {
        const hinge = { x: 3, z: -2 };
        const e = leafEnd(hinge, yaw, side * 1.2, 1);
        const n = { x: Math.sin(yaw), z: Math.cos(yaw) };
        const dot = (e.x - hinge.x) * n.x + (e.z - hinge.z) * n.z;
        // Đầu lá cửa nằm ở phía NGƯỢC người nếu dir = side là sai; kiểm tra cùng dấu với -side.
        expect(Math.sign(dot)).toBe(-side);
      }
    }
  });
  it('mở tới góc tối đa rồi đứng ở trạng thái open, kẹp góc', () => {
    let s: DoorState = { ...closed, ...doorToggle(closed, 1) } as DoorState;
    let last = 'x';
    for (let i = 0; i < 200 && s.phase === 'opening'; i++) {
      const r = doorTick(s, 0.05, cfg);
      s = r.state;
      last = r.event ?? last;
    }
    expect(s.phase).toBe('open');
    expect(s.angle).toBeCloseTo(cfg.maxAngle);
    expect(Math.abs(s.angle)).toBeLessThanOrEqual(cfg.maxAngle + 1e-9);
    expect(last).toBe('opened');
  });
  it('tự đóng sau thời gian chờ', () => {
    let s: DoorState = { ...closed, phase: 'open', angle: cfg.maxAngle, timer: 1 };
    s = doorTick(s, 0.6, cfg).state;
    expect(s.phase).toBe('open');
    const r = doorTick(s, 0.6, cfg);
    expect(r.state.phase).toBe('closing');
    expect(r.event).toBe('autoclose');
    let c = r.state;
    for (let i = 0; i < 200 && c.phase === 'closing'; i++) c = doorTick(c, 0.05, cfg).state;
    expect(c.phase).toBe('closed');
    expect(c.angle).toBe(0);
  });
  it('autoCloseAfter=0 thì không tự đóng', () => {
    const s: DoorState = { ...closed, phase: 'open', angle: 1, timer: 0 };
    expect(doorTick(s, 5, { ...cfg, autoCloseAfter: 0 }).state.phase).toBe('open');
  });
  it('cửa khóa: không mở; khóa chỉ khi đóng; mở khóa được', () => {
    const locked = { ...closed, phase: 'locked' as const };
    expect(doorToggle(locked, 1)).toBeNull();
    expect(doorLock({ ...closed, phase: 'open' })).toBeNull();
    expect(doorLock(closed)).toEqual({ phase: 'locked', angle: 0 });
    expect(doorUnlock(locked)).toEqual({ phase: 'closed' });
    expect(doorUnlock(closed)).toBeNull();
  });
  it('bấm khi đang chạy thì đảo chiều', () => {
    expect(doorToggle({ ...closed, phase: 'opening', angle: 0.5 }, 1)?.phase).toBe('closing');
    expect(doorToggle({ ...closed, phase: 'closing', angle: 0.5 }, 1)?.phase).toBe('opening');
  });
  it('bị chặn khi đóng: dừng lại và mở lại, không đẩy xuyên người', () => {
    const s: DoorState = { phase: 'closing', angle: 0.6, dir: 1, timer: 0 };
    const r = doorTick(s, 0.05, cfg, () => true);
    expect(r.event).toBe('blocked');
    expect(r.state.phase).toBe('open');
    expect(r.state.angle).toBe(0.6);
  });
  it('bị chặn khi đang mở từ góc 0 thì giữ đóng', () => {
    const r = doorTick({ ...closed, phase: 'opening' }, 0.05, cfg, () => true);
    expect(r.state.phase).toBe('closed');
    expect(r.event).toBe('blocked');
  });
  it('doorBlocked: người đứng sát lá cửa bị tính chặn, người xa thì không', () => {
    const hinge = { x: 0, z: 0 };
    // yaw 0, angle 0: lá nằm dọc +x, từ (0,0) tới (1,0).
    expect(doorBlocked(hinge, 0, 0, 1, [{ x: 0.5, z: 0.1, r: 0.35 }])).toBe(true);
    expect(doorBlocked(hinge, 0, 0, 1, [{ x: 0.5, z: 1.5, r: 0.35 }])).toBe(false);
    expect(doorBlocked(hinge, 0, 0, 1, [])).toBe(false);
  });
});

describe('ghế', () => {
  it('chiếm chỗ: người khác không ngồi được, mình ngồi lại được', () => {
    const s = { occupant: 'a', swivel: 0 };
    expect(chairSit(s, 'b')).toBeNull();
    expect(chairSit(s, 'a')).toEqual({ occupant: 'a' });
    expect(chairSit({ occupant: '', swivel: 0 }, 'b')).toEqual({ occupant: 'b' });
  });
  it('chỉ người ngồi mới đứng dậy; xoay ghế bị khóa khi người khác ngồi', () => {
    expect(chairStand({ occupant: 'a', swivel: 0 }, 'b')).toBeNull();
    expect(chairStand({ occupant: 'a', swivel: 0 }, 'a')).toEqual({ occupant: '' });
    expect(chairSwivel({ occupant: 'a', swivel: 0 }, 'b', 1)).toBeNull();
  });
  it('xoay ghế quấn về [-π, π]', () => {
    const p = chairSwivel({ occupant: '', swivel: 3 }, 'me', 1);
    expect(Math.abs(p!.swivel!)).toBeLessThanOrEqual(Math.PI);
    expect(p!.swivel).toBeCloseTo(4 - 2 * Math.PI);
  });
  it('chỗ đứng: ưu tiên sau lưng, hết chỗ thì thử bên, bít hết thì null', () => {
    const seat = { x: 0, z: 0, yaw: Math.PI }; // nhìn -z, sau lưng là +z
    const back = findStandSpot(seat, () => true)!;
    expect(back.z).toBeGreaterThan(0.5);
    const side = findStandSpot(seat, (x, z) => !(z > 0.5))!;
    expect(Math.abs(side.x)).toBeGreaterThan(0.5);
    expect(findStandSpot(seat, () => false)).toBeNull();
  });
});

describe('máy tính', () => {
  it('bật/tắt; tắt thì đăng xuất', () => {
    const s = { on: false, user: '', wallpaper: 0, note: '', doc: 0 };
    expect(computerPower(s)).toEqual({ on: true });
    expect(computerPower({ ...s, on: true, user: 'a' })).toEqual({ on: false, user: '' });
  });
  it('đăng nhập giả chỉ khi bật và chưa đăng nhập; tên rỗng dùng khach', () => {
    const base = { on: true, user: '', wallpaper: 0, note: '', doc: 0 };
    expect(computerLogin({ ...base, on: false }, 'x')).toBeNull();
    expect(computerLogin({ ...base, user: 'a' }, 'x')).toBeNull();
    expect(computerLogin(base, '  ')).toEqual({ user: 'khach' });
  });
  it('ghi chú cần đăng nhập và bị cắt độ dài; hình nền/tài liệu quay vòng', () => {
    const s = { on: true, user: 'a', wallpaper: 0, note: '', doc: 0 };
    expect(computerNote({ ...s, user: '' }, 'hi')).toBeNull();
    expect(computerNote(s, 'x'.repeat(NOTE_MAX + 50))!.note).toHaveLength(NOTE_MAX);
    expect(computerWallpaper(s, -1).wallpaper).toBe(WALLPAPER_COUNT - 1);
    expect(computerDoc({ ...s, doc: SAMPLE_DOCS.length - 1 }).doc).toBe(0);
  });
  it('màn hình phát sáng: tắt=0, chưa đăng nhập dịu hơn đã đăng nhập', () => {
    const s = { on: false, user: '', wallpaper: 0, note: '', doc: 0 };
    expect(screenGlow(s).intensity).toBe(0);
    expect(screenGlow({ ...s, on: true }).intensity).toBeLessThan(screenGlow({ ...s, on: true, user: 'a' }).intensity);
  });
  it('điều kiện dùng: đứng gần hoặc đang ngồi ghế gắn', () => {
    expect(canUseComputer({ x: 0, z: 0 }, { x: 0.5, z: 0 }, 1, false)).toBe(true);
    expect(canUseComputer({ x: 5, z: 0 }, { x: 0.5, z: 0 }, 1, false)).toBe(false);
    expect(canUseComputer({ x: 5, z: 0 }, { x: 0.5, z: 0 }, 1, true)).toBe(true);
  });
});

describe('ngăn kéo', () => {
  const sib = (open: number | null, locked = -1) =>
    [0, 1, 2].map((i) => ({ id: `d${i}`, open: i === open, locked: i === locked }));
  it('mở ngăn mới thì đóng ngăn đang mở', () => {
    const p = planDrawerToggle(sib(0), 1);
    expect(p.patches).toEqual({ d1: { open: true }, d0: { open: false } });
  });
  it('bấm ngăn đang mở thì đóng; ngăn khóa thì từ chối; chỉ số sai từ chối', () => {
    expect(planDrawerToggle(sib(1), 1).patches).toEqual({ d1: { open: false } });
    expect(planDrawerToggle(sib(null, 2), 2).denied).toBe(true);
    expect(planDrawerToggle(sib(null), 9).denied).toBe(true);
  });
  it('hành trình bị kẹp trong ray', () => {
    expect(drawerOffset(2, 0.3)).toBe(0.3);
    expect(drawerOffset(-1, 0.3)).toBe(0);
  });
});

describe('TV, rèm, công tắc', () => {
  it('TV: chỉ đổi kênh/âm lượng khi bật; kênh vòng tròn; âm lượng kẹp', () => {
    const off = { on: false, channel: 0, volume: 3 };
    expect(tvPower(off)).toEqual({ on: true });
    expect(tvChannel(off, 1)).toBeNull();
    expect(tvChannel({ ...off, on: true, channel: TV_CHANNELS.length - 1 }, 1)).toEqual({ channel: 0 });
    expect(tvChannel({ ...off, on: true, channel: 0 }, -1)).toEqual({ channel: TV_CHANNELS.length - 1 });
    expect(tvVolume({ ...off, on: true, volume: VOLUME_MAX }, 1)).toBeNull();
    expect(tvVolume({ ...off, on: true, volume: 0 }, -1)).toBeNull();
    expect(tvVolume({ ...off, on: true, volume: 3 }, 2)).toEqual({ volume: 5 });
  });
  it('rèm: bước kẹp 0..1, ánh sáng ngày không xuống 0', () => {
    expect(curtainStep(0.9, 0.25)).toBe(1);
    expect(curtainStep(0.1, -0.25)).toBe(0);
    expect(curtainDaylight(0)).toBe(MIN_DAYLIGHT);
    expect(curtainDaylight(1)).toBe(1);
    expect(curtainDaylight(0.5)).toBeGreaterThan(curtainDaylight(0.25));
  });
});

describe('đồ nhỏ', () => {
  const surf = { id: 's', minX: 0, maxX: 1, minZ: 0, maxZ: 1, y: 0.75 };
  it('đặt hợp lệ trên mặt phẳng, trả cao độ mặt', () => {
    expect(validatePlacement(0.5, 0.5, 0.05, [surf], [])).toMatchObject({ ok: true, y: 0.75 });
  });
  it('nhô ra mép hoặc ngoài mặt thì từ chối (không đổ, không xuyên)', () => {
    expect(validatePlacement(0.98, 0.5, 0.05, [surf], [])).toEqual({ ok: false, reason: 'no_surface' });
    expect(validatePlacement(3, 3, 0.05, [surf], [])).toEqual({ ok: false, reason: 'no_surface' });
  });
  it('chồng vật khác thì từ chối', () => {
    expect(validatePlacement(0.5, 0.5, 0.05, [surf], [{ id: 'o', x: 0.55, z: 0.5, r: 0.05 }])).toEqual({ ok: false, reason: 'overlap' });
    expect(validatePlacement(0.5, 0.5, 0.05, [surf], [{ id: 'o', x: 0.7, z: 0.5, r: 0.05 }]).ok).toBe(true);
  });
  it('snap kéo điểm vào trong mặt; điểm đặt nằm trước mặt người', () => {
    const p = snapToSurface(5, -5, 0.05, surf);
    expect(p).toEqual({ x: 0.95, z: 0.05 });
    const q = placementSpot({ x: 0, z: 0, yaw: 0 }, 1);
    expect(q.x).toBeCloseTo(0);
    expect(q.z).toBeCloseTo(1);
  });
});

describe('máy in', () => {
  const s0: ReturnType<typeof printerOf> = { ...PRINTER_INITIAL };
  it('hàng đợi có giới hạn', () => {
    expect(printerSubmit({ ...s0, queue: QUEUE_MAX })).toBeNull();
    expect(printerSubmit(s0)).toEqual({ queue: 1 });
  });
  it('in xong một lệnh: giảm hàng đợi, tăng done', () => {
    let s = { ...s0, queue: 1 };
    let ev: string | null = null;
    for (let i = 0; i < 100 && s.queue > 0; i++) {
      const r = printerTick(s, 0.1, 2, 0, () => 1);
      s = r.state;
      ev = r.event ?? ev;
    }
    expect(s).toMatchObject({ queue: 0, done: 1, progress: 0 });
    expect(ev).toBe('done');
  });
  it('kẹt giấy đứng yên đến khi gỡ, rồi in tiếp', () => {
    let s = { ...s0, queue: 1 };
    for (let i = 0; i < 100 && !s.jam; i++) s = printerTick(s, 0.1, 2, 1, () => 0).state;
    expect(s.jam).toBe(true);
    const frozen = printerTick(s, 5, 2, 1, () => 0).state;
    expect(frozen).toEqual(s);
    s = { ...s, ...printerClearJam(s)! };
    expect(s.jam).toBe(false);
    for (let i = 0; i < 100 && s.queue > 0; i++) s = printerTick(s, 0.1, 2, 0, () => 1).state;
    expect(s.done).toBe(1);
    expect(printerClearJam(s)).toBeNull();
  });
});

describe('cây nước', () => {
  it('trình tự lấy cốc -> rót -> đầy -> lấy', () => {
    let s = { ...WATER_INITIAL } as ReturnType<typeof waterOf>;
    s = { ...s, ...waterTakeCup(s)! };
    expect(s.tray).toBe('empty');
    expect(s.cups).toBe(19);
    expect(waterTakeCup(s)).toBeNull();
    expect(waterTake({ ...s, tray: 'pouring' })).toBeNull();
    s = { ...s, ...waterPour(s, 'hot')! };
    expect(s.tray).toBe('pouring');
    let done = false;
    let t = 0;
    while (!done && t < 20) {
      const r = waterTick(s, 0.1);
      s = r.state;
      done = r.done;
      t += 0.1;
    }
    expect(done).toBe(true);
    expect(t).toBeGreaterThanOrEqual(POUR_SECONDS.hot - 0.11);
    s = { ...s, ...waterTake(s)! };
    expect(s).toMatchObject({ tray: '', drunk: 1 });
  });
  it('nước nóng rót lâu hơn nước lạnh; hết cốc thì không lấy được', () => {
    expect(POUR_SECONDS.hot).toBeGreaterThan(POUR_SECONDS.cold);
    expect(waterTakeCup({ ...WATER_INITIAL, cups: 0 } as ReturnType<typeof waterOf>)).toBeNull();
  });
});

describe('bus sự kiện và tickers', () => {
  beforeEach(() => clearInteractListeners());
  it('nghe theo loại và theo tiền tố, hủy đăng ký', () => {
    const all: string[] = [];
    const doors: string[] = [];
    const off = onInteractEvent((e) => all.push(e.type));
    onInteractEventType(['door.'], (e) => doors.push(e.type));
    emitInteractEvent({ type: 'door.open', id: 'a' });
    emitInteractEvent({ type: 'tv.on', id: 'b' });
    off();
    emitInteractEvent({ type: 'door.close', id: 'a' });
    expect(all).toEqual(['door.open', 'tv.on']);
    expect(doors).toEqual(['door.open', 'door.close']);
  });
  it('tickAll kẹp dt và gọi từng ticker; hủy ticker', () => {
    const fn = vi.fn();
    const off = registerTicker('t1', fn);
    const n = tickerCount();
    tickAll(5);
    expect(fn).toHaveBeenCalledWith(0.1);
    off();
    expect(tickerCount()).toBe(n - 1);
  });
});

// ---- Tích hợp với objectStates + registry ----
describe('tích hợp registry', () => {
  const fp = { cx: 0, cz: 0, hx: 0.5, hz: 0.5 };
  const events: InteractEvent[] = [];
  beforeEach(() => {
    resetObjectStates();
    resetCharacterState();
    clearInteractListeners();
    clearItemRegistry();
    events.length = 0;
    onInteractEvent((e) => events.push(e));
  });
  const run = (id: string, action: string) => {
    const d = getInteractable(id)!;
    availableActions(d).find((a) => a.id === action)!.run({ id, def: d, state: getObjectState(id), character: 'walking', setState: (p) => setObjectState(id, p) });
  };
  const ids = (id: string) => availableActions(getInteractable(id)!).map((a) => a.id);

  it('cửa: E mở về phía xa người, phát sự kiện, tick đưa tới góc tối đa rồi tự đóng', () => {
    const o = { id: 'door1', hinge: { x: 0, z: 0 }, yaw: 0, length: 1, footprint: fp, getPlayer: () => ({ x: 0.5, z: 3 }), config: { autoCloseAfter: 1 } };
    const off = [registerInteractable(doorInteractable(o)), registerDoorTicker(o)];
    run('door1', 'toggle');
    expect(doorOf(getObjectState('door1'))).toMatchObject({ phase: 'opening', dir: 1 });
    for (let i = 0; i < 100; i++) tickAll(0.05);
    expect(doorOf(getObjectState('door1')).phase).toBe('closed'); // đã mở, chờ 1 s, rồi tự đóng
    expect(events.map((e) => e.type)).toContain('door.open');
    expect(events.some((e) => e.type === 'door.close' && e.data?.settled)).toBe(true);
    off.forEach((f) => f());
  });
  it('cửa: người đứng chắn đường lá cửa thì cửa không xuyên qua', () => {
    // Người ở phía -n (z<0) nên cửa mở về +n... đặt người ở phía mở (z>0, sát lá) để chặn.
    const o = { id: 'door2', hinge: { x: 0, z: 0 }, yaw: 0, length: 1, footprint: fp, getPlayer: () => ({ x: 0.5, z: -0.2 }) };
    const off = [registerInteractable(doorInteractable(o)), registerDoorTicker(o)];
    setObjectState('door2', { phase: 'opening', dir: 1 });
    for (let i = 0; i < 100; i++) tickAll(0.05);
    expect(events.some((e) => e.type === 'door.blocked')).toBe(true);
    off.forEach((f) => f());
  });
  it('cửa khóa: chỉ còn hành động báo khóa', () => {
    registerInteractable(doorInteractable({ id: 'door3', hinge: { x: 0, z: 0 }, yaw: 0, length: 1, footprint: fp, getPlayer: () => ({ x: 0, z: 1 }), startLocked: true }));
    expect(ids('door3')).toEqual(['knock']);
    run('door3', 'knock');
    expect(events[0].type).toBe('door.locked');
  });
  it('ngăn kéo: chỉ một ngăn mở, ngăn khóa phát sự kiện khóa', () => {
    drawerInteractables({ id: 'cab', count: 3, footprint: fp, at: { x: 0, z: 0 }, yaw: 0, locked: [2] }).forEach(registerInteractable);
    run(drawerId('cab', 0), 'toggle');
    run(drawerId('cab', 1), 'toggle');
    expect(getObjectState(drawerId('cab', 0)).open).toBe(false);
    expect(getObjectState(drawerId('cab', 1)).open).toBe(true);
    run(drawerId('cab', 2), 'toggle');
    expect(getObjectState(drawerId('cab', 2)).open).toBe(false);
    expect(events[events.length - 1].type).toBe('drawer.locked');
  });
  it('công tắc: đổi nhóm đèn thật và phát sự kiện cho hệ đèn', () => {
    registerInteractable(switchInteractable({ id: 'sw', groups: ['z1', 'z2'], footprint: fp }));
    expect(isLightGroupOn('z1')).toBe(true);
    run('sw', 'toggle');
    expect(isLightGroupOn('z1')).toBe(false);
    expect(isLightGroupOn('z2')).toBe(false);
    expect(events.filter((e) => e.type === 'light.switch').map((e) => e.data!.group)).toEqual(['z1', 'z2']);
    expect(getObjectState(lightGroupId('z1')).on).toBe(false);
    expect(toggleLightGroup('z1')).toBe(true);
  });
  it('TV: nhãn theo trạng thái, hành động phụ chỉ khi bật', async () => {
    const { tvInteractable } = await import('./tv');
    registerInteractable(tvInteractable({ id: 'tv1', footprint: fp }));
    expect(ids('tv1')).toEqual(['power']);
    run('tv1', 'power');
    expect(ids('tv1')).toEqual(['power', 'channel', 'vol_up', 'vol_down']);
    run('tv1', 'vol_up');
    expect(getObjectState('tv1').volume).toBe(4);
  });
  it('rèm: kéo từng bước, daylight theo trạng thái', () => {
    registerInteractable(curtainInteractable({ id: 'cur', footprint: fp }));
    expect(ids('cur')).toEqual(['close']); // mặc định mở hết
    run('cur', 'close');
    run('cur', 'close');
    expect(getObjectState('cur').open).toBe(0.5);
    expect(getCurtainDaylight('cur')).toBeLessThan(1);
    expect(ids('cur')).toEqual(['close', 'open']);
  });
  it('ghế: chiếm chỗ làm người khác bị từ chối, đứng dậy nhả chỗ', () => {
    const sit = vi.fn();
    const stand = vi.fn();
    registerInteractable(chairInteractable({ id: 'ch', seat: { x: 0, z: 0, yaw: Math.PI }, footprint: fp, hooks: { sit, stand, isFree: () => true } }));
    run('ch', 'sit');
    expect(sit).toHaveBeenCalledOnce();
    expect(getObjectState('ch').occupant).toBe('me');
    setObjectState('ch', { occupant: 'other' });
    expect(ids('ch')).toEqual(['occupied']);
    setObjectState('ch', { occupant: 'me' });
  });
  it('ghế: ghi tên mình nhưng chưa ngồi (yêu cầu ngồi thất bại) thì vẫn ngồi lại được', () => {
    const sit = vi.fn();
    registerInteractable(chairInteractable({ id: 'ch3', seat: { x: 0, z: 0, yaw: 0 }, footprint: fp, hooks: { sit, stand: vi.fn(), isFree: () => true } }));
    setObjectState('ch3', { occupant: 'me' });
    expect(ids('ch3')).toContain('sit');
    run('ch3', 'sit');
    expect(sit).toHaveBeenCalledOnce();
  });
  it('ghế: đứng dậy bị từ chối khi không có chỗ trống', () => {
    const stand = vi.fn();
    const d = chairInteractable({ id: 'ch2', seat: { x: 0, z: 0, yaw: 0 }, footprint: fp, hooks: { sit: vi.fn(), stand, isFree: () => false } });
    registerInteractable(d);
    setObjectState('ch2', { occupant: 'me' });
    const a = d.actions.find((x) => x.id === 'stand')!;
    a.run({ id: 'ch2', def: d, state: getObjectState('ch2'), character: 'seated', setState: () => {} });
    expect(stand).not.toHaveBeenCalled();
    expect(getObjectState('ch2').occupant).toBe('me');
    expect(events[events.length - 1].type).toBe('chair.denied');
  });
  it('mặt đặt: ưu tiên cao khi đang cầm đồ, thấp khi tay không', () => {
    const home = { x: 0.5, y: 0.75, z: 0.5 };
    registerInteractable(itemInteractable({ id: 'mug', label: 'Cốc', home, footprint: fp }));
    const surf = { id: 's2', minX: 0, maxX: 2, minZ: 0, maxZ: 2, y: 0.75 };
    const d = surfaceInteractable({ id: 'shelf', label: 'Tủ', surface: surf, footprint: fp, getPlayer: () => ({ x: 1, z: 0.5, yaw: 0 }), itemInfo: () => ({ r: 0.05, home }) });
    expect(d.priority).toBe(SURFACE_PRIORITY_IDLE);
    run('mug', 'pickup');
    expect(d.priority).toBe(SURFACE_PRIORITY_HOLDING);
    registerInteractable(d);
    run('shelf', 'return');
    expect(d.priority).toBe(SURFACE_PRIORITY_IDLE);
  });
  it('đồ nhỏ: một vật trên tay, đặt hợp lệ lưu vị trí, trả về chỗ cũ', () => {
    const home = { x: 0.5, y: 0.75, z: 0.5 };
    registerInteractable(itemInteractable({ id: 'cup', label: 'Cốc', home, footprint: fp }));
    registerInteractable(itemInteractable({ id: 'book', label: 'Sách', home: { x: 0.2, y: 0.75, z: 0.2 }, footprint: fp }));
    const surf = { id: 's', minX: 0, maxX: 2, minZ: 0, maxZ: 2, y: 0.75 };
    registerInteractable(surfaceInteractable({
      id: 'desk', label: 'Bàn', surface: surf, footprint: fp,
      getPlayer: () => ({ x: 1, z: 0.5, yaw: 0 }),
      itemInfo: () => ({ r: 0.05, home }),
    }));
    run('cup', 'pickup');
    expect(getHeldItem()).toBe('cup');
    expect(ids('book')).toEqual([]); // đã cầm một vật, vật thứ hai không nhặt được
    run('desk', 'place');
    expect(getHeldItem()).toBeNull();
    expect(getObjectState('cup')).toMatchObject({ where: 'placed', y: 0.75 });
    expect(getObjectState('cup').x).toBeCloseTo(1);
    expect(getObjectState('cup').z).toBeCloseTo(1.2);
    run('cup', 'pickup');
    run('desk', 'return');
    expect(getObjectState('cup')).toMatchObject({ where: 'home', x: 0.5, z: 0.5 });
  });
  it('máy in: gửi lệnh, tick in xong, kẹt giấy rồi gỡ', () => {
    const o = { id: 'pr', footprint: fp, secondsPerJob: 1, jamChance: 1, rng: () => 0 };
    const off = [registerInteractable(printerInteractable(o)), registerPrinterTicker(o)];
    run('pr', 'print');
    expect(printerOf(getObjectState('pr')).queue).toBe(1);
    for (let i = 0; i < 30; i++) tickAll(0.1);
    expect(printerOf(getObjectState('pr')).jam).toBe(true);
    expect(ids('pr')).toEqual(['clear']);
    run('pr', 'clear');
    expect(printerOf(getObjectState('pr')).jam).toBe(false);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['printer.queue', 'printer.jam', 'printer.clear']));
    off.forEach((f) => f());
  });
  it('cây nước: tick rót theo thời gian và phát water.done', () => {
    const o = { id: 'wc', footprint: fp };
    const off = [registerInteractable(waterInteractable(o)), registerWaterTicker(o)];
    run('wc', 'cup');
    run('wc', 'cold');
    expect(ids('wc')).toEqual(['wait']);
    for (let i = 0; i < 40; i++) tickAll(0.1);
    expect(waterOf(getObjectState('wc')).tray).toBe('full');
    expect(events.map((e) => e.type)).toContain('water.done');
    run('wc', 'take');
    expect(waterOf(getObjectState('wc')).drunk).toBe(1);
    off.forEach((f) => f());
  });
});
