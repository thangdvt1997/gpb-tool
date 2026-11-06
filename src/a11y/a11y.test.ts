/**
 * Test thuần (không DOM, không framework). Chạy bằng runA11yTests(); mỗi kết quả {name, ok, error}.
 * Không phụ thuộc node:assert để tsc (không có @types/node) vẫn qua.
 */
import { createAnnouncer } from './announce';
import { checkContrast, checkTouchTarget, contrastRatio, isLargeText, parseColor } from './contrast';
import { createFocusStack, initialFocusTarget, nextFocusIndex, shouldCloseOnKey, tabOrder } from './focusLogic';
import { auditInteractables, hasErrors, isReadableLabel } from './interactAudit';
import { createMoveController, stepOnGrid } from './keyboardMove';

export interface TestResult {
  name: string;
  ok: boolean;
  error?: string;
}

function eq(actual: unknown, expected: unknown, msg = ''): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} mong ${e}, nhận ${a}`);
}
function truthy(v: unknown, msg: string): void {
  if (!v) throw new Error(msg);
}

const tests: Array<[string, () => void]> = [
  ['focus: vòng Tab tới/lui và quay vòng', () => {
    eq(nextFocusIndex(3, 0, false), 1);
    eq(nextFocusIndex(3, 2, false), 0);
    eq(nextFocusIndex(3, 0, true), 2);
    eq(nextFocusIndex(3, -1, false), 0);
    eq(nextFocusIndex(3, -1, true), 2);
    eq(nextFocusIndex(0, 0, false), -1);
  }],
  ['focus: thứ tự Tab theo tabindex dương rồi DOM, loại disabled/hidden/âm', () => {
    const order = tabOrder([
      { id: 'a', domIndex: 0 },
      { id: 'b', domIndex: 1, tabIndex: 2 },
      { id: 'c', domIndex: 2, tabIndex: 1 },
      { id: 'd', domIndex: 3, tabIndex: -1 },
      { id: 'e', domIndex: 4, disabled: true },
      { id: 'f', domIndex: 5, hidden: true },
      { id: 'g', domIndex: 6, tabIndex: 0 },
    ]).map((i) => i.id);
    eq(order, ['c', 'b', 'a', 'g']);
  }],
  ['focus: mục tiêu ban đầu', () => {
    eq(initialFocusTarget(['x', 'y'], 'y'), { kind: 'item', id: 'y' });
    eq(initialFocusTarget(['x', 'y'], 'z'), { kind: 'item', id: 'x' });
    eq(initialFocusTarget([]), { kind: 'container' });
  }],
  ['focus: ngăn xếp trả focus về nơi mở, lớp dưới đóng không cướp focus', () => {
    const s = createFocusStack<string>();
    s.push('modal1', 'nút mở 1');
    s.push('modal2', 'nút mở 2');
    truthy(s.isTop('modal2') && !s.isTop('modal1'), 'chỉ lớp trên cùng nhận phím');
    eq(s.remove('modal1'), { restoreTo: null, wasTop: false });
    eq(s.remove('modal2'), { restoreTo: 'nút mở 2', wasTop: true });
    eq(s.size(), 0);
    eq(s.remove('khong-co'), null);
  }],
  ['focus: Esc đóng đúng điều kiện', () => {
    truthy(shouldCloseOnKey('Escape', { isTop: true }), 'đóng khi là lớp trên');
    truthy(!shouldCloseOnKey('Escape', { isTop: false }), 'không đóng lớp dưới');
    truthy(!shouldCloseOnKey('Escape', { isTop: true, composing: true }), 'không đóng khi IME');
    truthy(!shouldCloseOnKey('Escape', { isTop: true, locked: true }), 'không đóng khi khóa');
    truthy(!shouldCloseOnKey('Enter', { isTop: true }), 'phím khác');
  }],
  ['contrast: đen/trắng 21:1, cùng màu 1:1', () => {
    const w = parseColor('#fff');
    const b = parseColor('#000000');
    truthy(w && b, 'parse');
    eq(Math.round(contrastRatio(b!, w!) * 100) / 100, 21);
    eq(contrastRatio(w!, w!), 1);
  }],
  ['contrast: giá trị tham chiếu #767676 trên trắng ~4.54 đạt AA, #777 không', () => {
    const ok = checkContrast('#767676', '#ffffff');
    const bad = checkContrast('#777777', '#ffffff');
    truthy(ok && ok.pass && ok.ratio === 4.54, `#767676: ${JSON.stringify(ok)}`);
    truthy(bad && !bad.pass && bad.ratio === 4.48, `#777: ${JSON.stringify(bad)}`);
  }],
  ['contrast: chữ lớn và UI dùng ngưỡng 3; AAA chữ thường 7', () => {
    const r = checkContrast('#949494', '#ffffff', 'large-text');
    truthy(r && r.pass && r.required === 3, 'chữ lớn');
    eq(checkContrast('#949494', '#ffffff', 'text')?.pass, false);
    eq(checkContrast('#767676', '#ffffff', 'text', 'AAA')?.pass, false);
    truthy(isLargeText(24, false) && isLargeText(19, true) && !isLargeText(19, false), 'isLargeText');
  }],
  ['contrast: rgb(), alpha và màu lạ', () => {
    eq(parseColor('rgb(255, 0, 0)'), { r: 255, g: 0, b: 0, a: undefined });
    eq(parseColor('rgba(0,0,0,0.5)')?.a, 0.5);
    eq(parseColor('xanh'), null);
    eq(checkContrast('xanh', '#fff'), null);
    // Đen 50% trên trắng = xám 127.5 -> thấp hơn đen đặc
    const half = checkContrast('rgba(0,0,0,0.5)', '#ffffff');
    truthy(half && half.ratio < 21 && half.ratio > 3, 'alpha được trộn lên nền');
  }],
  ['vùng chạm: 24 đạt AA, 44 đạt khuyến nghị', () => {
    eq(checkTouchTarget(23, 40).pass, false);
    eq(checkTouchTarget(24, 24).pass, true);
    eq(checkTouchTarget(24, 24).recommended, false);
    eq(checkTouchTarget(44, 44).recommended, true);
  }],
  ['live: chống trùng và giới hạn tần suất, assertive không bị giới hạn', () => {
    let t = 0;
    const a = createAnnouncer({ now: () => t, dedupeMs: 1000, minGapMs: 300 });
    const got: string[] = [];
    a.subscribe((x) => got.push(`${x.politeness}:${x.message}`));
    eq(a.announce('Đã lưu'), true);
    t = 100;
    eq(a.announce('Đã lưu'), false);
    eq(a.announce('Khác'), false); // polite trong 300 ms
    eq(a.announce('Lỗi mạng', 'assertive'), true);
    t = 500;
    eq(a.announce('Khác'), true);
    t = 1500;
    eq(a.announce('Đã lưu'), true);
    eq(a.announce('   '), false);
    eq(got, ['polite:Đã lưu', 'assertive:Lỗi mạng', 'polite:Khác', 'polite:Đã lưu']);
  }],
  ['kiểm tra vật: nhãn đọc được', () => {
    truthy(isReadableLabel('Cửa chính', 'door_1'), 'nhãn tốt');
    truthy(!isReadableLabel('chair_03'), 'mã thô');
    truthy(!isReadableLabel('door_1', 'door_1'), 'trùng id');
    truthy(!isReadableLabel(' '), 'rỗng');
    truthy(!isReadableLabel('---'), 'chỉ ký hiệu');
  }],
  ['kiểm tra vật: phát hiện lỗi và cảnh báo', () => {
    const issues = auditInteractables([
      { id: 'door', label: 'Cửa chính', actions: [{ id: 'open', label: 'Mở cửa' }] },
      { id: 'chair_03', label: 'chair_03', actions: [{ id: 'sit', label: () => 'Ngồi' }] },
      { id: 'door', label: 'Cửa phụ', actions: [] },
      { id: 'tv', label: 'Cửa chính', actions: [{ id: 'a', label: 'x' }, { id: 'a', label: 'Bật' }] },
    ]);
    const msgs = issues.map((i) => `${i.severity}:${i.id}`);
    truthy(msgs.includes('error:chair_03'), 'nhãn thô');
    truthy(msgs.includes('error:door'), 'trùng id');
    truthy(msgs.includes('warn:door'), 'không hành động');
    truthy(msgs.includes('warn:tv'), 'nhãn trùng');
    truthy(msgs.includes('error:tv'), 'nhãn hành động ngắn / trùng id hành động');
    truthy(hasErrors(issues), 'hasErrors');
    eq(auditInteractables([{ id: 'a', label: 'Bàn họp', actions: [{ id: 'use', label: 'Sử dụng' }] }]), []);
  }],
  ['di chuyển: bước theo lưới 4 hướng', () => {
    const g = { cell: 0.5 };
    eq(stepOnGrid({ x: 1, z: 1 }, 'right', g), { x: 1.5, z: 1 });
    eq(stepOnGrid({ x: 1, z: 1 }, 'left', g), { x: 0.5, z: 1 });
    eq(stepOnGrid({ x: 1, z: 1 }, 'up', g), { x: 1, z: 0.5 });
    eq(stepOnGrid({ x: 1, z: 1 }, 'down', g, 3), { x: 1, z: 2.5 });
  }],
  ['di chuyển: lệch lưới thì hút vào ô gần nhất theo hướng; không tích lũy sai số', () => {
    const g = { cell: 0.5 };
    eq(stepOnGrid({ x: 1.2, z: 0 }, 'right', g), { x: 1.5, z: 0 });
    eq(stepOnGrid({ x: 1.2, z: 0 }, 'left', g), { x: 1, z: 0 });
    let p = { x: 0, z: 0 };
    for (let i = 0; i < 10; i++) p = stepOnGrid(p, 'right', { cell: 0.1 });
    eq(p, { x: 1, z: 0 });
  }],
  ['di chuyển: kẹp theo giới hạn', () => {
    const g = { cell: 1, bounds: { minX: 0, maxX: 3, minZ: 0, maxZ: 3 } };
    eq(stepOnGrid({ x: 3, z: 0 }, 'right', g), { x: 3, z: 0 });
    eq(stepOnGrid({ x: 0, z: 0 }, 'up', g), { x: 0, z: 0 });
  }],
  ['di chuyển: chọn, di chuyển, xác nhận', () => {
    const c = createMoveController({ grid: { cell: 0.5 } });
    eq(c.confirm().type, 'rejected');
    c.select('desk', { x: 2.1, z: 1 }, 'Bàn làm việc');
    eq(c.state().pos, { x: 2, z: 1 });
    c.step('right');
    c.step('down', 2);
    eq(c.state().pos, { x: 2.5, z: 2 });
    const r = c.confirm();
    eq(r, { type: 'committed', id: 'desk', from: { x: 2.1, z: 1 }, to: { x: 2.5, z: 2 } });
    eq(c.state().phase, 'idle');
    truthy(c.state().message.startsWith('Đã đặt Bàn làm việc'), 'thông báo xác nhận');
  }],
  ['di chuyển: hủy trả về vị trí gốc; vị trí không hợp lệ không xác nhận được', () => {
    const c = createMoveController({
      grid: { cell: 1 },
      isValid: (_id, p) => !(p.x === 2 && p.z === 0),
    });
    c.select('chair', { x: 0, z: 0 });
    c.step('right');
    c.step('right');
    eq(c.state().valid, false);
    eq(c.confirm(), { type: 'rejected', reason: 'Vị trí không hợp lệ' });
    eq(c.state().phase, 'moving');
    c.step('right');
    eq(c.state().valid, true);
    c.step('left');
    c.step('left');
    eq(c.cancel(), { type: 'cancelled', id: 'chair', restore: { x: 0, z: 0 } });
    eq(c.state().phase, 'idle');
  }],
  ['di chuyển: nhập số ô lưới', () => {
    const c = createMoveController({ grid: { cell: 0.5 } });
    c.select('a', { x: 0, z: 0 });
    c.setCell(4, -2);
    eq(c.state().pos, { x: 2, z: -1 });
    // Không có chọn thì bước không làm gì
    const d = createMoveController({ grid: { cell: 1 } });
    eq(d.step('left').phase, 'idle');
  }],
];

export function runA11yTests(): TestResult[] {
  return tests.map(([name, fn]) => {
    try {
      fn();
      return { name, ok: true };
    } catch (e) {
      return { name, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}
