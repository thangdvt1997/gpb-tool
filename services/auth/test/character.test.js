// Chạy: node --test test/character.test.js (trong thư mục services/auth, Node >= 20, ESM). Không cần DB hay npm install.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARACTER_SCHEMA_VERSION,
  MAX_CHARACTER_BYTES,
  CharacterError,
  validateCharacter,
  migrateStoredCharacter,
  validateAvatarRef,
  validateDisplayName,
} from '../character.js';

// Look tối thiểu đúng cấu trúc CharacterLook v1 (giá trị trong nhóm chỉ là mẫu, server không kiểm catalog).
function sampleLook() {
  return {
    version: 1,
    meta: { name: 'Đi làm', presetId: null, legacyOutfit: null },
    bodyStyle: 'realistic',
    body: { base: 'male', height: 170, weight: 0.5, torso: { chest: 0.4, waist: 0.5 } },
    face: { eyes: { color: '#3b2a1e', size: 0.5 } },
    hair: { style: 'hair-short-01', color: '#2b1d14' },
    skin: { tone: 1, moles: [] },
    tattoos: [{ uid: 't1', templateId: 'tt-text-script', region: 'forearm-left', text: 'Bình an', opacity: 0.8 }],
    scars: [],
    outfit: { top: { itemId: 'top-polo', color: '#f4f4f2', patterns: [] } },
    accessories: { rings: [], glasses: null },
  };
}

function expectError(fn, code, path) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof CharacterError, `phải là CharacterError, nhận ${err}`);
    if (code) assert.equal(err.code, code);
    if (path !== undefined) assert.equal(err.path, path);
    return true;
  });
}

test('look hợp lệ được chấp nhận, khóa cấp 1 theo thứ tự cố định', () => {
  const input = sampleLook();
  const reordered = Object.fromEntries(Object.entries(input).reverse());
  const { look, bytes, userText } = validateCharacter(reordered);
  assert.deepEqual(Object.keys(look), Object.keys(input));
  assert.deepEqual(look, input);
  assert.ok(bytes > 0 && bytes <= MAX_CHARACTER_BYTES);
  assert.deepEqual(userText.sort(), ['Bình an', 'Đi làm'].sort());
});

test('kết quả là bản sao, sửa input sau đó không ảnh hưởng', () => {
  const input = sampleLook();
  const { look } = validateCharacter(input);
  input.tattoos[0].text = 'khác';
  assert.equal(look.tattoos[0].text, 'Bình an');
});

test('không phải đối tượng: từ chối', () => {
  for (const v of [null, undefined, [], 'abc', 42, true]) expectError(() => validateCharacter(v), 'invalid_character');
});

test('thiếu hoặc thừa khóa cấp 1: từ chối', () => {
  const missing = sampleLook();
  delete missing.skin;
  expectError(() => validateCharacter(missing), 'missing_field', 'skin');

  const extra = { ...sampleLook(), userId: 2 };
  expectError(() => validateCharacter(extra), 'unknown_field', 'userId');

  const metaExtra = sampleLook();
  metaExtra.meta.owner = 5;
  expectError(() => validateCharacter(metaExtra), 'unknown_field', 'meta.owner');
});

test('sai version hoặc bodyStyle: từ chối', () => {
  expectError(() => validateCharacter({ ...sampleLook(), version: 2 }), 'unsupported_version', 'version');
  expectError(() => validateCharacter({ ...sampleLook(), version: '1' }), 'unsupported_version');
  expectError(() => validateCharacter({ ...sampleLook(), bodyStyle: 'cartoon' }), 'invalid_character', 'bodyStyle');
});

test('sai kiểu nhóm và số lớp', () => {
  expectError(() => validateCharacter({ ...sampleLook(), body: [] }), 'invalid_character', 'body');
  expectError(() => validateCharacter({ ...sampleLook(), tattoos: {} }), 'invalid_character', 'tattoos');
  expectError(() => validateCharacter({ ...sampleLook(), scars: ['x'] }), 'invalid_character', 'scars[0]');
  const many = Array.from({ length: 13 }, (_, i) => ({ uid: `t${i}` }));
  expectError(() => validateCharacter({ ...sampleLook(), tattoos: many }), 'invalid_character', 'tattoos');
});

test('meta.name quá 40 ký tự: từ chối; đúng 40 ký tự có dấu: nhận', () => {
  const ok = sampleLook();
  ok.meta.name = 'ă'.repeat(40);
  validateCharacter(ok);
  const long = sampleLook();
  long.meta.name = 'a'.repeat(41);
  expectError(() => validateCharacter(long), 'invalid_character', 'meta.name');
});

test('chặn URL, data URI, ký tự điều khiển, chuỗi dài, số không hữu hạn', () => {
  const url = sampleLook();
  url.hair.texture = 'https://evil.example/a.png';
  expectError(() => validateCharacter(url), 'external_ref', 'hair.texture');

  const dataUri = sampleLook();
  dataUri.skin.decal = 'data:image/png;base64,AAAA';
  expectError(() => validateCharacter(dataUri), 'external_ref', 'skin.decal');

  const ctrl = sampleLook();
  ctrl.tattoos[0].text = 'a' + String.fromCharCode(0) + 'b';
  expectError(() => validateCharacter(ctrl), 'invalid_character', 'tattoos[0].text');

  const lineSep = sampleLook();
  lineSep.tattoos[0].text = 'a' + String.fromCharCode(0x2028) + 'b';
  expectError(() => validateCharacter(lineSep), 'invalid_character');

  const longStr = sampleLook();
  longStr.hair.style = 'x'.repeat(121);
  expectError(() => validateCharacter(longStr), 'invalid_character', 'hair.style');

  const nan = sampleLook();
  nan.body.height = Number.POSITIVE_INFINITY;
  expectError(() => validateCharacter(nan), 'invalid_character', 'body.height');
});

test('khóa nguy hiểm và lồng quá sâu: từ chối', () => {
  const proto = sampleLook();
  proto.body = JSON.parse('{"__proto__": {"x": 1}}');
  expectError(() => validateCharacter(proto), 'invalid_character', 'body.__proto__');

  const deep = sampleLook();
  let node = deep.face;
  for (let i = 0; i < 10; i += 1) {
    node.n = {};
    node = node.n;
  }
  expectError(() => validateCharacter(deep), 'too_complex');
});

test('quá MAX_CHARACTER_BYTES: mã too_large (route trả 413)', () => {
  const big = sampleLook();
  // Nhiều chuỗi ngắn hợp lệ để vượt 64 KB mà không chạm giới hạn độ dài chuỗi.
  big.face.blob = Array.from({ length: 30 }, () => Array.from({ length: 30 }, () => 'y'.repeat(100)));
  expectError(() => validateCharacter(big), 'too_large', '');
});

test('migrate: bản v1 đọc nguyên vẹn, migrated = false', () => {
  const look = sampleLook();
  const out = migrateStoredCharacter(1, JSON.stringify(look));
  assert.equal(out.status, 'ok');
  assert.equal(out.migrated, false);
  assert.equal(out.schemaVersion, CHARACTER_SCHEMA_VERSION);
  assert.deepEqual(out.look, look);
});

test('migrate: bản v0 (chưa có version/bodyStyle/meta đủ) được nâng lên v1', () => {
  const v0 = sampleLook();
  delete v0.version;
  delete v0.bodyStyle;
  delete v0.scars;
  v0.meta = { name: 'Cũ' };
  const out = migrateStoredCharacter(0, JSON.stringify(v0));
  assert.equal(out.status, 'ok');
  assert.equal(out.migrated, true);
  assert.equal(out.look.version, 1);
  assert.equal(out.look.bodyStyle, 'realistic');
  assert.deepEqual(out.look.meta, { name: 'Cũ', presetId: null, legacyOutfit: null });
  assert.deepEqual(out.look.scars, []);
  // Bản đã migrate qua được validate khi ghi lại.
  validateCharacter(out.look);
});

test('migrate: bản mới hơn server, JSON hỏng, version lạ', () => {
  assert.deepEqual(migrateStoredCharacter(CHARACTER_SCHEMA_VERSION + 1, '{}'), {
    status: 'newer',
    schemaVersion: CHARACTER_SCHEMA_VERSION + 1,
  });
  assert.deepEqual(migrateStoredCharacter(1, '{không phải json'), { status: 'corrupt' });
  assert.deepEqual(migrateStoredCharacter(1, '[]'), { status: 'corrupt' });
  assert.deepEqual(migrateStoredCharacter(-1, '{}'), { status: 'corrupt' });
  assert.deepEqual(migrateStoredCharacter(1.5, '{}'), { status: 'corrupt' });
  // Đúng JSON nhưng không qua validate sau migrate.
  assert.deepEqual(migrateStoredCharacter(1, JSON.stringify({ version: 1 })), { status: 'corrupt' });
});

test('avatarRef chỉ nhận null, character, preset:<id>', () => {
  assert.equal(validateAvatarRef(null), null);
  assert.equal(validateAvatarRef('character'), 'character');
  assert.equal(validateAvatarRef('preset:office-01'), 'preset:office-01');
  for (const v of ['https://x.example/a.png', 'data:image/png;base64,AA', 'preset:', 'preset:../x', 'preset:A', '', 5, {}]) {
    expectError(() => validateAvatarRef(v), 'invalid_character', 'avatarRef');
  }
});

test('tên hiển thị: chuẩn hoá khoảng trắng, giới hạn độ dài, chặn ký tự lạ', () => {
  assert.equal(validateDisplayName('  Nguyễn   Văn  An '), 'Nguyễn Văn An');
  expectError(() => validateDisplayName('A'), 'invalid_character', 'name');
  expectError(() => validateDisplayName('a'.repeat(81)), 'invalid_character', 'name');
  expectError(() => validateDisplayName('xem http://a.example'), 'invalid_character', 'name');
  expectError(() => validateDisplayName('a' + String.fromCharCode(7) + 'b'), 'invalid_character', 'name');
  expectError(() => validateDisplayName(42), 'invalid_character', 'name');
});
