import {
  ACTION_IDS, DEFAULT_BINDINGS, applyMouseDelta, defaultSettings, exportJson, findConflicts,
  importJson, migrateLegacy, rebind, sanitize, swapBindings,
} from './schema';

/**
 * Test thuần, không phụ thuộc thư viện test: gọi runSettingsSelfTest() từ bất kỳ runner nào
 * và kiểm tra failures rỗng. Chưa được chạy trong môi trường này.
 */
export function runSettingsSelfTest(): { passed: number; failures: string[] } {
  const failures: string[] = [];
  let passed = 0;
  const t = (name: string, cond: boolean): void => {
    if (cond) passed++;
    else failures.push(name);
  };

  // Kiểm tra giá trị
  const s1 = sanitize({ mouse: { sensitivity: 99, invertY: 'x' }, volume: -3, controlMode: 'zzz', touch: { joystickSize: 5 } });
  t('kẹp độ nhạy', s1.mouse.sensitivity === 3);
  t('sai kiểu invertY dùng mặc định', s1.mouse.invertY === false);
  t('kẹp âm lượng', s1.volume === 0);
  t('controlMode sai dùng mặc định', s1.controlMode === 'rightMouse');
  t('kẹp joystick', s1.touch.joystickSize === 80);
  t('NaN dùng mặc định', sanitize({ volume: NaN }).volume === 0.5);
  t('đầu vào rác', sanitize(null).mouse.sensitivity === 1 && sanitize('abc').volume === 0.5);
  t('phím sai bị bỏ', sanitize({ bindings: { jump: 'F5', run: 123 } }).bindings.jump === 'Space');
  t('nhận phím hợp lệ', sanitize({ bindings: { jump: 'KeyJ' } }).bindings.jump === 'KeyJ');
  t('lưu có trùng phím thì về mặc định', sanitize({ bindings: { jump: 'KeyW' } }).bindings.jump === 'Space');

  // Migrate cài đặt cũ
  const m = migrateLegacy({ sensitivity: 2.5, volume: 0.8, helpHidden: true }, { highlight: false, keyHints: true });
  t('migrate độ nhạy và âm lượng', m.mouse.sensitivity === 2.5 && m.volume === 0.8);
  t('migrate helpHidden tắt gợi ý', m.hintsEnabled === false);
  t('migrate highlight', m.highlightEnabled === false);
  t('migrate thiếu dữ liệu dùng mặc định', migrateLegacy(null, null).hintsEnabled === true);
  t('migrate chỉ có interact', migrateLegacy(null, { keyHints: false }).hintsEnabled === false);
  t('migrate giữ phím mặc định', migrateLegacy({}, {}).bindings.interact === 'KeyE');

  // Đảo trục
  const base = defaultSettings().mouse;
  const a = applyMouseDelta(10, 4, { ...base, sensitivity: 2, invertY: true });
  t('đảo Y', a.dx === 20 && a.dy === -8);
  const b = applyMouseDelta(10, 4, { ...base, invertX: true });
  t('đảo X', b.dx === -10 && b.dy === 4);
  const c = applyMouseDelta(10, 4, base);
  t('không đảo', c.dx === 10 && c.dy === 4);

  // Xung đột phím
  t('mặc định không trùng', findConflicts(DEFAULT_BINDINGS).length === 0);
  const r1 = rebind(DEFAULT_BINDINGS, 'jump', 'KeyW');
  t('trùng phím báo lỗi', !r1.ok && r1.error === 'conflict' && r1.conflictWith === 'moveForward');
  const r2 = rebind(DEFAULT_BINDINGS, 'jump', 'KeyJ');
  t('đổi phím không trùng', r2.ok && r2.bindings.jump === 'KeyJ');
  const r3 = rebind(DEFAULT_BINDINGS, 'jump', 'F5');
  t('phím giữ riêng bị từ chối', !r3.ok && r3.error === 'invalid-key');
  t('khác ngữ cảnh không trùng', rebind(DEFAULT_BINDINGS, 'editor', 'Escape').ok);
  const cf = findConflicts({ ...DEFAULT_BINDINGS, jump: 'KeyW' });
  t('findConflicts phát hiện', cf.length === 1 && cf[0].actions.includes('jump') && cf[0].actions.includes('moveForward'));
  const sw = swapBindings(DEFAULT_BINDINGS, 'moveForward', 'moveBack');
  t('hoán đổi không trùng', sw.moveForward === 'KeyS' && sw.moveBack === 'KeyW' && findConflicts(sw).length === 0);

  // Xuất nhập JSON
  const imp = importJson(exportJson({ ...defaultSettings(), volume: 0.2 }));
  t('xuất rồi nhập', imp.ok && imp.settings.volume === 0.2);
  t('nhập JSON hỏng', !importJson('{').ok);
  t('nhập mảng', !importJson('[]').ok);
  t('nhập trùng phím báo lỗi', !importJson('{"bindings":{"jump":"KeyW"}}').ok);
  t('nhập phím sai báo lỗi', !importJson('{"bindings":{"jump":"<x>"}}').ok);
  const big = importJson('{"volume":9}');
  t('nhập kẹp số', big.ok && big.settings.volume === 1);
  t('đủ action', ACTION_IDS.every((id) => typeof DEFAULT_BINDINGS[id] === 'string'));

  return { passed, failures };
}
