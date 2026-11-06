// Nhân vật cá nhân lưu trên server (docs/design/PROFILE.md). Module này không phụ thuộc DB hay Express.
//
// Nguồn chuẩn của CharacterLook: src/fashion/types.ts (LOOK_SCHEMA_VERSION, CharacterLook, BODY_STYLES) và
// src/fashion/rules.ts (validate chi tiết theo catalog). Server KHÔNG sao lại catalog: ở đây chỉ kiểm tra cấu trúc
// (đủ khóa cấp 1, đúng kiểu, giới hạn độ sâu, số phần tử, độ dài chuỗi, kích thước) và chặn mọi chuỗi trông như
// đường dẫn ảnh ngoài. Giá trị id lạ trong catalog vẫn qua được; client chạy validate() của rules.ts khi đọc.
//
// Quy tắc ghi: dữ liệu sai thì TỪ CHỐI (ném CharacterError), không tự sửa, để client biết bản lưu khác bản gửi.
// Quy tắc đọc: migrateStoredCharacter() đưa bản cũ lên schema hiện tại; bản hỏng hoặc mới hơn server thì báo trạng thái.

// Khớp LOOK_SCHEMA_VERSION trong src/fashion/types.ts. Tăng số này thì phải thêm bước vào MIGRATIONS.
export const CHARACTER_SCHEMA_VERSION = 1;
// Khớp MAX_LOOK_BYTES trong src/fashion/persistence.ts (byte UTF-8 của JSON.stringify(look)).
export const MAX_CHARACTER_BYTES = 64 * 1024;

// Khớp BODY_STYLES trong src/fashion/types.ts.
export const BODY_STYLES = Object.freeze(['realistic', 'chibi']);
// Khóa cấp 1 của CharacterLook. Thiếu hoặc thừa đều bị từ chối.
export const LOOK_KEYS = Object.freeze([
  'version',
  'meta',
  'bodyStyle',
  'body',
  'face',
  'hair',
  'skin',
  'tattoos',
  'scars',
  'outfit',
  'accessories',
]);
const OBJECT_KEYS = Object.freeze(['body', 'face', 'hair', 'skin', 'outfit', 'accessories']);
const LAYER_KEYS = Object.freeze(['tattoos', 'scars']);
const META_KEYS = Object.freeze(['name', 'presetId', 'legacyOutfit']);

export const LIMITS = Object.freeze({
  maxDepth: 8,
  maxNodes: 4000,
  maxArray: 32,
  maxLayers: 12, // TATTOO_LIMITS.maxLayers và SCAR_LIMITS.maxLayers
  maxString: 120,
  maxName: 40, // MAX_NAME_LENGTH trong rules.ts
  maxId: 64,
});

const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// Ký tự điều khiển C0, C1 và ngắt dòng Unicode (U+2028, U+2029): chuỗi hợp lệ không cần chúng.
const CONTROL_RE = {
  test(s) {
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029) return true;
    }
    return false;
  },
};
// Không cho chuỗi trỏ tới tài nguyên ngoài (ảnh lạ, data URI, blob).
const EXTERNAL_RE = /(:\/\/|^\s*(data|blob|javascript|file):)/i;

export class CharacterError extends Error {
  constructor(message, { path = '', code = 'invalid_character' } = {}) {
    super(message);
    this.path = path;
    this.code = code;
  }
}

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const fail = (message, path, code) => {
  throw new CharacterError(message, { path, code });
};

export function byteLength(text) {
  return Buffer.byteLength(text, 'utf8');
}

// Duyệt toàn bộ cây: độ sâu, số nút, kiểu giá trị, độ dài chuỗi, khóa an toàn. Gom chuỗi người dùng tự gõ
// (khóa 'name' hoặc 'text') vào userText để route kiểm tra từ tục.
function walk(value, path, depth, state) {
  state.nodes += 1;
  if (state.nodes > LIMITS.maxNodes) fail('Cấu hình nhân vật có quá nhiều phần tử.', path, 'too_complex');
  if (depth > LIMITS.maxDepth) fail('Cấu hình nhân vật lồng quá sâu.', path, 'too_complex');

  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('Giá trị số không hợp lệ.', path);
    return;
  }
  if (typeof value === 'string') {
    if (value.length > LIMITS.maxString) fail(`Chuỗi dài quá ${LIMITS.maxString} ký tự.`, path);
    if (CONTROL_RE.test(value)) fail('Chuỗi chứa ký tự điều khiển.', path);
    if (EXTERNAL_RE.test(value)) fail('Không chấp nhận đường dẫn hay ảnh bên ngoài.', path, 'external_ref');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > LIMITS.maxArray) fail(`Danh sách quá ${LIMITS.maxArray} phần tử.`, path);
    value.forEach((item, i) => walk(item, `${path}[${i}]`, depth + 1, state));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key) || !KEY_RE.test(key)) fail('Tên khóa không hợp lệ.', `${path}.${key}`);
      const childPath = path ? `${path}.${key}` : key;
      if ((key === 'name' || key === 'text') && typeof child === 'string' && child !== '') {
        state.userText.push(child);
      }
      walk(child, childPath, depth + 1, state);
    }
    return;
  }
  fail('Kiểu dữ liệu không hợp lệ.', path);
}

function checkIdOrNull(value, path) {
  if (value === null) return;
  if (typeof value !== 'string' || value.length > LIMITS.maxId) fail('Phải là chuỗi id hoặc null.', path);
}

// Kiểm tra một CharacterLook ở schema hiện tại. Trả { look, bytes, userText } với look là bản sao sạch
// (thứ tự khóa cấp 1 cố định). Ném CharacterError khi sai; code 'too_large' khi vượt MAX_CHARACTER_BYTES.
export function validateCharacter(input) {
  if (!isPlainObject(input)) fail('Cấu hình nhân vật phải là một đối tượng JSON.', '');

  // Kích thước kiểm trước để không duyệt dữ liệu khổng lồ.
  const text = JSON.stringify(input);
  const bytes = byteLength(text);
  if (bytes > MAX_CHARACTER_BYTES) {
    fail(`Cấu hình nhân vật quá lớn (tối đa ${MAX_CHARACTER_BYTES / 1024} KB).`, '', 'too_large');
  }

  for (const key of Object.keys(input)) {
    if (!LOOK_KEYS.includes(key)) fail('Có trường không thuộc cấu hình nhân vật.', key, 'unknown_field');
  }
  for (const key of LOOK_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) fail('Thiếu trường bắt buộc.', key, 'missing_field');
  }

  if (input.version !== CHARACTER_SCHEMA_VERSION) {
    fail(`version phải là ${CHARACTER_SCHEMA_VERSION}.`, 'version', 'unsupported_version');
  }
  if (!BODY_STYLES.includes(input.bodyStyle)) fail('bodyStyle không hợp lệ.', 'bodyStyle');

  const meta = input.meta;
  if (!isPlainObject(meta)) fail('meta phải là đối tượng.', 'meta');
  for (const key of Object.keys(meta)) {
    if (!META_KEYS.includes(key)) fail('Có trường không thuộc meta.', `meta.${key}`, 'unknown_field');
  }
  if (typeof meta.name !== 'string' || Array.from(meta.name).length > LIMITS.maxName) {
    fail(`meta.name phải là chuỗi tối đa ${LIMITS.maxName} ký tự.`, 'meta.name');
  }
  checkIdOrNull(meta.presetId ?? null, 'meta.presetId');
  checkIdOrNull(meta.legacyOutfit ?? null, 'meta.legacyOutfit');

  for (const key of OBJECT_KEYS) {
    if (!isPlainObject(input[key])) fail(`${key} phải là đối tượng.`, key);
  }
  for (const key of LAYER_KEYS) {
    const list = input[key];
    if (!Array.isArray(list)) fail(`${key} phải là danh sách.`, key);
    if (list.length > LIMITS.maxLayers) fail(`Tối đa ${LIMITS.maxLayers} lớp.`, key);
    list.forEach((item, i) => {
      if (!isPlainObject(item)) fail('Mỗi lớp phải là đối tượng.', `${key}[${i}]`);
    });
  }

  const state = { nodes: 0, userText: [] };
  walk(input, '', 0, state);

  // Bản sao sâu qua JSON (đã chắc chắn là dữ liệu JSON thuần), khóa cấp 1 theo thứ tự LOOK_KEYS.
  const copy = JSON.parse(text);
  const look = {};
  for (const key of LOOK_KEYS) look[key] = copy[key];
  look.meta = {
    name: copy.meta.name,
    presetId: copy.meta.presetId ?? null,
    legacyOutfit: copy.meta.legacyOutfit ?? null,
  };
  return { look, bytes: byteLength(JSON.stringify(look)), userText: state.userText };
}

// Các bước nâng schema. MIGRATIONS[n] nhận dữ liệu ở version n, trả dữ liệu ở version n + 1.
// Version 0: CharacterLook trước khi có trường version/bodyStyle (bản nháp đầu của fashion). Bổ sung giá trị mặc định
// đúng như types.ts ghi (bodyStyle mặc định 'realistic', meta.presetId/legacyOutfit mặc định null).
export const MIGRATIONS = Object.freeze({
  0: (data) => {
    const next = { ...data, version: 1 };
    if (next.bodyStyle === undefined) next.bodyStyle = 'realistic';
    const meta = isPlainObject(next.meta) ? next.meta : {};
    next.meta = {
      name: typeof meta.name === 'string' ? meta.name : '',
      presetId: meta.presetId ?? null,
      legacyOutfit: meta.legacyOutfit ?? null,
    };
    if (next.tattoos === undefined) next.tattoos = [];
    if (next.scars === undefined) next.scars = [];
    return next;
  },
});

// Đọc bản đã lưu (cột schema_version và data). Không bao giờ ném lỗi.
// Trả về một trong:
//   { status: 'ok', look, schemaVersion, migrated }  dữ liệu dùng được (migrated = true nếu đã nâng schema)
//   { status: 'newer', schemaVersion }               bản do server mới hơn ghi; server này không đọc được
//   { status: 'corrupt' }                            JSON hỏng hoặc không qua validate sau khi migrate
export function migrateStoredCharacter(schemaVersion, dataText) {
  if (!Number.isInteger(schemaVersion) || schemaVersion < 0) return { status: 'corrupt' };
  if (schemaVersion > CHARACTER_SCHEMA_VERSION) return { status: 'newer', schemaVersion };
  let data;
  try {
    data = typeof dataText === 'string' ? JSON.parse(dataText) : dataText;
  } catch {
    return { status: 'corrupt' };
  }
  if (!isPlainObject(data)) return { status: 'corrupt' };

  let version = schemaVersion;
  try {
    while (version < CHARACTER_SCHEMA_VERSION) {
      const step = MIGRATIONS[version];
      if (!step) return { status: 'corrupt' };
      data = step(data);
      version += 1;
    }
    const { look } = validateCharacter(data);
    return { status: 'ok', look, schemaVersion: version, migrated: version !== schemaVersion };
  } catch {
    return { status: 'corrupt' };
  }
}

// ---------- Hồ sơ ----------

export const PROFILE_NAME_MIN = 2;
export const PROFILE_NAME_MAX = 80; // giống /register
// Tham chiếu ảnh đại diện: không nhận URL hay ảnh tải lên. Chỉ:
//   'character'          vẽ từ nhân vật cá nhân
//   'preset:<id>'        một ảnh có sẵn trong bundle client (id chữ thường, số, gạch ngang)
//   null                 không có
const AVATAR_REF_RE = /^(character|preset:[a-z0-9][a-z0-9-]{0,39})$/;

export function validateAvatarRef(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !AVATAR_REF_RE.test(value)) {
    fail("avatarRef chỉ nhận null, 'character' hoặc 'preset:<id>'.", 'avatarRef');
  }
  return value;
}

export function validateDisplayName(value) {
  if (typeof value !== 'string') fail('Tên hiển thị phải là chuỗi.', 'name');
  const name = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (CONTROL_RE.test(name)) fail('Tên chứa ký tự không hợp lệ.', 'name');
  if (EXTERNAL_RE.test(name)) fail('Tên không được chứa đường dẫn.', 'name');
  const len = Array.from(name).length;
  if (len < PROFILE_NAME_MIN || len > PROFILE_NAME_MAX) {
    fail(`Tên hiển thị từ ${PROFILE_NAME_MIN} đến ${PROFILE_NAME_MAX} ký tự.`, 'name');
  }
  return name;
}
