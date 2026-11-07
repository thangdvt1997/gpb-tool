/**
 * Kiểm tra manifest asset (schemaVersion 1). Không sửa dữ liệu: chỉ trả danh sách lỗi/cảnh báo.
 * Chỉ dùng `import type` để Node 24 chạy trực tiếp file này (scripts/assets/validate-manifest.mjs).
 */
import type {
  AssetEntry,
  AssetManifest,
  AssetType,
  GlbFacts,
  PivotKind,
  ValidateOptions,
  ValidationIssue,
  ValidationResult,
} from './schema';

export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1];

export const ASSET_TYPES: readonly AssetType[] = [
  'character',
  'animation',
  'furniture',
  'chair',
  'door',
  'drawer',
  'accessory',
  'prop',
];

/** Socket bắt buộc trên nhân vật. */
export const CHARACTER_SOCKETS: readonly string[] = [
  'hand_l',
  'hand_r',
  'head',
  'neck',
  'back',
  'foot_l',
  'foot_r',
];

/** Socket tương tác: tiền tố "interact." (ví dụ interact.sit, interact.handle). */
export const INTERACT_PREFIX = 'interact.';

/** Pivot đúng theo loại. Loại không có trong bảng chấp nhận mọi PivotKind. */
export const PIVOT_BY_TYPE: Partial<Record<AssetType, readonly PivotKind[]>> = {
  character: ['feet-center'],
  furniture: ['base-center'],
  chair: ['seat-center'],
  door: ['hinge'],
  drawer: ['slide-axis'],
  accessory: ['attach-point'],
  prop: ['base-center', 'custom'],
};

/** Socket tương tác bắt buộc theo loại. */
export const REQUIRED_INTERACT: Partial<Record<AssetType, readonly string[]>> = {
  chair: ['interact.sit'],
  door: ['interact.handle'],
  drawer: ['interact.handle'],
};

/** Ngưỡng phát hiện transform bất thường (mét). Không phải budget hiệu năng. */
export const LIMITS = {
  groundTolerance: 0.01,
  minExtent: 0.001,
  maxExtent: 100,
  characterHeight: [1.3, 2.2] as const,
  scaleRange: [0.001, 1000] as const,
  hashHex: /^[0-9a-f]{64}$/,
  assetId: /^[a-z][a-z0-9]*(\.[a-z0-9][a-z0-9_-]*)+$/,
  semver: /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/,
};

interface Ctx {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function push(
  ctx: Ctx,
  severity: 'error' | 'warning',
  code: string,
  assetId: string | null,
  path: string,
  message: string,
  fix: string,
): void {
  (severity === 'error' ? ctx.errors : ctx.warnings).push({ severity, code, assetId, path, message, fix });
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Duyệt toàn bộ giá trị số; null trong vị trí vector thường là NaN/Infinity đã bị JSON.stringify đổi thành null. */
function scanNonFinite(ctx: Ctx, v: unknown, path: string, assetId: string | null): void {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) {
      push(ctx, 'error', 'NON_FINITE', assetId, path, `Giá trị ${String(v)} không hữu hạn.`, 'Đo lại giá trị từ file nguồn; không thay bằng 0.');
    }
    return;
  }
  if (Array.isArray(v)) v.forEach((x, i) => scanNonFinite(ctx, x, `${path}[${i}]`, assetId));
  else if (isObj(v)) for (const k of Object.keys(v)) scanNonFinite(ctx, v[k], path ? `${path}.${k}` : k, assetId);
}

function checkVec3(ctx: Ctx, v: unknown, path: string, assetId: string | null): v is [number, number, number] {
  if (!Array.isArray(v) || v.length !== 3) {
    push(ctx, 'error', 'BAD_VEC3', assetId, path, 'Phải là mảng 3 số [x, y, z].', 'Ghi đủ 3 thành phần, đơn vị mét.');
    return false;
  }
  let ok = true;
  v.forEach((x, i) => {
    if (x === null) {
      push(ctx, 'error', 'NON_FINITE', assetId, `${path}[${i}]`, 'Giá trị null, có thể là NaN/Infinity bị JSON.stringify đổi thành null.', 'Đo lại giá trị từ file nguồn.');
      ok = false;
    } else if (typeof x !== 'number') {
      push(ctx, 'error', 'BAD_VEC3', assetId, `${path}[${i}]`, `Kiểu ${typeof x}, cần number.`, 'Ghi số, không ghi chuỗi.');
      ok = false;
    } else if (!Number.isFinite(x)) ok = false; // đã báo trong scanNonFinite
  });
  return ok;
}

function checkRelativeUrl(ctx: Ctx, url: unknown, path: string, assetId: string, opts: ValidateOptions): void {
  if (typeof url !== 'string' || url.length === 0) {
    push(ctx, 'error', 'MISSING_FIELD', assetId, path, 'Thiếu URL.', 'Ghi đường dẫn tương đối so với manifest, ví dụ "male_real.glb".');
    return;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/') || url.startsWith('\\')) {
    push(ctx, 'error', 'URL_NOT_RELATIVE', assetId, path, `URL "${url}" không tương đối.`, 'Bỏ giao thức/host và dấu "/" đầu; đặt file cạnh manifest hoặc trong thư mục con.');
    return;
  }
  if (url.split(/[\\/]/).includes('..')) {
    push(ctx, 'error', 'URL_ESCAPES', assetId, path, `URL "${url}" chứa "..".`, 'Chép file vào public/models/ rồi trỏ tới đó.');
    return;
  }
  if (url.includes('\\')) {
    push(ctx, 'error', 'URL_BACKSLASH', assetId, path, `URL "${url}" dùng dấu "\\".`, 'Dùng "/" để chạy được trên web.');
    return;
  }
  if (opts.fileExists && !opts.fileExists(url)) {
    push(ctx, 'error', 'FILE_MISSING', assetId, path, `Không tìm thấy file "${url}".`, 'Chép file vào đúng đường dẫn hoặc sửa URL. Không xóa mục khỏi manifest để che lỗi.');
  }
}

function requireField(ctx: Ctx, a: Record<string, unknown>, key: string, base: string, assetId: string, fix: string): boolean {
  if (a[key] === undefined) {
    push(ctx, 'error', 'MISSING_FIELD', assetId, `${base}.${key}`, `Thiếu trường bắt buộc "${key}" cho loại ${String(a.type)}.`, fix);
    return false;
  }
  return true;
}

function checkAsset(ctx: Ctx, a: AssetEntry, i: number, m: AssetManifest, opts: ValidateOptions): void {
  const base = `assets[${i}]`;
  const id = a.assetId;
  const raw = a as unknown as Record<string, unknown>;

  if (!LIMITS.assetId.test(id)) {
    push(ctx, 'error', 'BAD_ASSET_ID', id, `${base}.assetId`, `assetId "${id}" sai dạng.`, 'Dùng chữ thường, dạng <nhóm>.<tên>, ví dụ "char.male_real", "furn.desk_bench". Không đổi ID đã phát hành.');
  }
  if (!ASSET_TYPES.includes(a.type)) {
    push(ctx, 'error', 'BAD_TYPE', id, `${base}.type`, `Loại "${String(a.type)}" không hỗ trợ.`, `Chọn một trong: ${ASSET_TYPES.join(', ')}.`);
    return;
  }
  if (typeof a.version !== 'string' || !LIMITS.semver.test(a.version)) {
    push(ctx, 'error', 'BAD_VERSION', id, `${base}.version`, `version "${String(a.version)}" không theo semver.`, 'Ghi dạng 1.0.0; tăng khi file đổi.');
  }
  if (!isObj(a.hash) || a.hash.algo !== 'sha256' || typeof a.hash.value !== 'string' || !LIMITS.hashHex.test(a.hash.value)) {
    push(ctx, 'error', 'BAD_HASH', id, `${base}.hash`, 'hash phải là { algo: "sha256", value: 64 ký tự hex thường }.', 'Tính bằng: node scripts/assets/validate-manifest.mjs --print-facts <file>.');
  }
  if (typeof a.bytes !== 'number' || a.bytes <= 0) {
    push(ctx, 'error', 'BAD_BYTES', id, `${base}.bytes`, 'bytes phải là số dương.', 'Ghi kích thước file thật (byte).');
  }
  if (a.format !== 'glb' && a.format !== 'gltf') {
    push(ctx, 'error', 'BAD_FORMAT', id, `${base}.format`, `format "${String(a.format)}" không hỗ trợ.`, 'Chuyển sang glTF 2.0 (.glb) qua bước import.');
  }
  checkRelativeUrl(ctx, a.url, `${base}.url`, id, opts);

  // scale
  if (typeof a.scale !== 'number' || !Number.isFinite(a.scale) || a.scale <= 0) {
    push(ctx, 'error', 'BAD_SCALE', id, `${base}.scale`, `scale ${String(a.scale)} không hợp lệ (cần số dương hữu hạn).`, 'Xuất lại file ở đơn vị mét và đặt scale = 1.');
  } else if (a.scale < LIMITS.scaleRange[0] || a.scale > LIMITS.scaleRange[1]) {
    push(ctx, 'error', 'SCALE_ABNORMAL', id, `${base}.scale`, `scale ${a.scale} ngoài khoảng ${LIMITS.scaleRange.join('–')}.`, 'Có thể file xuất bằng cm/mm; xuất lại ở mét.');
  } else if (a.scale !== 1) {
    push(ctx, 'warning', 'SCALE_NOT_ONE', id, `${base}.scale`, `scale = ${a.scale}.`, 'Nên xuất lại ở mét để scale = 1; chỉ giữ khác 1 nếu có lý do ghi trong knownIssues.');
  }

  // bounds
  if (!isObj(a.bounds)) {
    push(ctx, 'error', 'MISSING_FIELD', id, `${base}.bounds`, 'Thiếu bounds.', 'Đo bằng --print-facts (accessor POSITION min/max).');
  } else {
    const okMin = checkVec3(ctx, a.bounds.min, `${base}.bounds.min`, id);
    const okMax = checkVec3(ctx, a.bounds.max, `${base}.bounds.max`, id);
    if (okMin && okMax) {
      const ext = [0, 1, 2].map((k) => a.bounds.max[k] - a.bounds.min[k]);
      ext.forEach((e, k) => {
        if (e < 0) {
          push(ctx, 'error', 'BOUNDS_INVERTED', id, `${base}.bounds`, `bounds.min[${k}] > bounds.max[${k}].`, 'Đổi chỗ min/max hoặc đo lại.');
        }
      });
      const maxExt = Math.max(...ext);
      if (maxExt > LIMITS.maxExtent || maxExt < LIMITS.minExtent) {
        push(ctx, 'error', 'BOUNDS_ABNORMAL', id, `${base}.bounds`, `Kích thước lớn nhất ${maxExt.toFixed(4)} m bất thường.`, 'Kiểm tra đơn vị khi xuất (mét, không phải cm/mm).');
      }
      const groundTypes: AssetType[] = ['character', 'furniture', 'chair'];
      const minY = a.bounds.min[1];
      if (groundTypes.includes(a.type) && Math.abs(minY) > LIMITS.groundTolerance) {
        const offY = isObj(a.pivot) && Array.isArray(a.pivot.offset) ? a.pivot.offset[1] : NaN;
        if (Number.isFinite(offY) && Math.abs(minY - offY) <= LIMITS.groundTolerance) {
          push(ctx, 'warning', 'PIVOT_OFFSET_REQUIRED', id, `${base}.pivot.offset`, `Đáy asset ở y = ${minY.toFixed(3)} m; pivot.offset đã ghi độ lệch này.`, 'Loader phải trừ pivot.offset khi đặt vào scene. Nên xuất lại với origin ở mặt sàn để bỏ bước này.');
        } else {
          push(ctx, 'error', 'NOT_ON_GROUND', id, `${base}.bounds.min[1]`, `Đáy asset ở y = ${minY.toFixed(3)} m, lệch origin quá ${LIMITS.groundTolerance} m và pivot.offset không khớp.`, 'Đặt origin ở mặt sàn khi xuất, hoặc ghi pivot.offset bằng độ lệch đã đo; không dịch mesh âm thầm khi nạp.');
        }
      }
      if (a.type === 'character') {
        const h = ext[1];
        if (h < LIMITS.characterHeight[0] || h > LIMITS.characterHeight[1]) {
          push(ctx, 'error', 'CHARACTER_HEIGHT', id, `${base}.bounds`, `Chiều cao ${h.toFixed(3)} m ngoài ${LIMITS.characterHeight.join('–')} m.`, 'Kiểm tra đơn vị và scale khi xuất từ MPFB/Blender.');
        }
      }
    }
    if (a.bounds.space !== 'rest' && a.bounds.space !== 'local') {
      push(ctx, 'error', 'BAD_BOUNDS_SPACE', id, `${base}.bounds.space`, 'space phải là "rest" hoặc "local".', 'Nhân vật có skin dùng "rest".');
    }
    if (typeof a.bounds.measuredBy !== 'string' || !a.bounds.measuredBy) {
      push(ctx, 'error', 'BOUNDS_UNMEASURED', id, `${base}.bounds.measuredBy`, 'Không ghi cách đo bounds.', 'Ghi nguồn số đo; không nhập số ước lượng vào bounds.');
    }
  }

  // pivot
  if (!isObj(a.pivot)) {
    push(ctx, 'error', 'MISSING_FIELD', id, `${base}.pivot`, 'Thiếu pivot.', 'Xem bảng pivot theo loại trong ASSET_STANDARD.md.');
  } else {
    checkVec3(ctx, a.pivot.offset, `${base}.pivot.offset`, id);
    const allowed = PIVOT_BY_TYPE[a.type];
    if (allowed && !allowed.includes(a.pivot.kind)) {
      push(ctx, 'error', 'BAD_PIVOT', id, `${base}.pivot.kind`, `Pivot "${String(a.pivot.kind)}" sai cho loại ${a.type}.`, `Dùng: ${allowed.join(' hoặc ')}.`);
    }
    if ((a.pivot.kind === 'hinge' || a.pivot.kind === 'slide-axis') && !a.pivot.axis) {
      push(ctx, 'error', 'PIVOT_AXIS', id, `${base}.pivot.axis`, `Pivot ${a.pivot.kind} cần trục.`, 'Ghi vector đơn vị, ví dụ [0,1,0] cho bản lề đứng, [0,0,1] cho ngăn kéo trượt ra trước.');
    } else if (a.pivot.axis && checkVec3(ctx, a.pivot.axis, `${base}.pivot.axis`, id)) {
      const len = Math.hypot(...a.pivot.axis);
      if (Math.abs(len - 1) > 1e-3) {
        push(ctx, 'error', 'PIVOT_AXIS', id, `${base}.pivot.axis`, `Trục có độ dài ${len.toFixed(4)}, cần 1.`, 'Chuẩn hóa vector trục.');
      }
    }
    if (a.pivot.kind === 'custom' && !a.pivot.note) {
      push(ctx, 'error', 'PIVOT_NOTE', id, `${base}.pivot.note`, 'Pivot custom không có lý do.', 'Ghi lý do vào pivot.note.');
    }
  }

  // license
  if (!isObj(a.license)) {
    push(ctx, 'error', 'MISSING_FIELD', id, `${base}.license`, 'Thiếu license/source.', 'Ghi license, nguồn, ngày kiểm tra theo ASSET_SOURCES.md.');
  } else {
    for (const k of ['spdx', 'source', 'checkedAt'] as const) {
      if (typeof a.license[k] !== 'string' || !a.license[k]) {
        push(ctx, 'error', 'MISSING_FIELD', id, `${base}.license.${k}`, `Thiếu license.${k}.`, 'Bổ sung từ trang license chính thức của nguồn.');
      }
    }
    if (/\b(NC|ND)\b|GPL/i.test(a.license.spdx ?? '')) {
      push(ctx, 'error', 'LICENSE_NOT_ALLOWED', id, `${base}.license.spdx`, `License "${a.license.spdx}" không nằm trong danh sách cho phép.`, 'Xem ASSET_SOURCES.md mục 1. License của công cụ ghi ở license.tool, không ghi ở spdx.');
    }
    if (a.license.attributionRequired && !a.license.attribution) {
      push(ctx, 'error', 'ATTRIBUTION', id, `${base}.license.attribution`, 'License cần ghi công nhưng thiếu dòng ghi công.', 'Ghi tên tác phẩm, tác giả, nguồn, license.');
    }
    if (a.license.verified !== true) {
      push(ctx, 'warning', 'LICENSE_UNVERIFIED', id, `${base}.license.verified`, 'License chưa xác minh.', 'Mở trang license của đúng mục, lưu bằng chứng, rồi đặt verified = true.');
    }
  }

  // Trường bắt buộc theo loại
  const isStatic = ['furniture', 'chair', 'door', 'drawer', 'prop'].includes(a.type);
  if (a.type === 'character') {
    requireField(ctx, raw, 'rigProfile', base, id, 'Khai báo rigProfile trong manifest.rigProfiles.');
    requireField(ctx, raw, 'sockets', base, id, `Khai báo socket: ${CHARACTER_SOCKETS.join(', ')}.`);
    requireField(ctx, raw, 'morphCapabilities', base, id, 'Ghi { targets: [] } nếu không có morph.');
    requireField(ctx, raw, 'materials', base, id, 'Liệt kê material trong file.');
    requireField(ctx, raw, 'lods', base, id, 'Ít nhất LOD 0.');
    requireField(ctx, raw, 'colliderProfile', base, id, 'Nhân vật dùng capsule.');
  }
  if (a.type === 'animation') {
    requireField(ctx, raw, 'rigProfile', base, id, 'Animation phải nêu rig nguồn.');
    if (requireField(ctx, raw, 'clips', base, id, 'Liệt kê clip trong file.') && (a.clips ?? []).length === 0) {
      push(ctx, 'error', 'NO_CLIPS', id, `${base}.clips`, 'Asset animation không có clip.', 'Xuất lại có action/NLA hoặc đổi type.');
    }
  }
  if (isStatic) {
    requireField(ctx, raw, 'colliderProfile', base, id, 'Ghi { shape: "none" } nếu là decor không va chạm.');
    requireField(ctx, raw, 'materials', base, id, 'Liệt kê material.');
    requireField(ctx, raw, 'lods', base, id, 'Ít nhất LOD 0.');
  }
  if (a.type === 'accessory') {
    requireField(ctx, raw, 'attachTo', base, id, 'Ghi tên socket nhân vật, ví dụ "hand_r".');
    requireField(ctx, raw, 'materials', base, id, 'Liệt kê material.');
  }

  // rigProfile
  const rig = a.rigProfile ? m.rigProfiles?.[a.rigProfile] : undefined;
  if (a.rigProfile && !rig) {
    push(ctx, 'error', 'RIG_UNKNOWN', id, `${base}.rigProfile`, `rigProfile "${a.rigProfile}" không có trong manifest.rigProfiles.`, 'Thêm hồ sơ rig hoặc sửa tên.');
  }

  // sockets
  const sockets = a.sockets ?? [];
  const seen = new Set<string>();
  sockets.forEach((s, k) => {
    const sp = `${base}.sockets[${k}]`;
    if (seen.has(s.name)) {
      push(ctx, 'error', 'DUP_SOCKET', id, `${sp}.name`, `Socket "${s.name}" trùng.`, 'Mỗi tên socket chỉ một lần.');
    }
    seen.add(s.name);
    checkVec3(ctx, s.offset, `${sp}.offset`, id);
    if (s.rotationDeg !== undefined) checkVec3(ctx, s.rotationDeg, `${sp}.rotationDeg`, id);
    if (s.bone && s.node) {
      push(ctx, 'error', 'SOCKET_TARGET', id, sp, 'Socket có cả bone và node.', 'Chỉ chọn một.');
    }
    if (s.bone && rig && !rig.bones.includes(s.bone)) {
      push(ctx, 'error', 'SOCKET_BONE_MISSING', id, `${sp}.bone`, `Xương "${s.bone}" không có trong rig ${rig.id}.`, 'Sửa tên xương theo rigProfile.bones; không đổi tên xương trong file.');
    }
    if (s.bone && !rig) {
      push(ctx, 'error', 'SOCKET_NO_RIG', id, `${sp}.bone`, 'Socket gắn theo xương nhưng asset không có rig.', 'Dùng node hoặc khai báo rigProfile.');
    }
    if (s.calibrated !== true) {
      push(ctx, 'warning', 'SOCKET_UNCALIBRATED', id, sp, `Socket "${s.name}" chưa hiệu chỉnh offset/rotation.`, 'Chỉnh trong scene xem asset, rồi đặt calibrated = true.');
    }
  });
  if (a.type === 'character') {
    for (const name of CHARACTER_SOCKETS) {
      if (!seen.has(name)) {
        push(ctx, 'error', 'SOCKET_MISSING', id, `${base}.sockets`, `Thiếu socket "${name}".`, 'Thêm socket gắn vào xương tương ứng.');
      }
    }
  }
  for (const name of REQUIRED_INTERACT[a.type] ?? []) {
    if (!seen.has(name)) {
      push(ctx, 'error', 'SOCKET_MISSING', id, `${base}.sockets`, `Thiếu socket tương tác "${name}".`, 'Thêm node trống trong file nguồn hoặc khai báo offset đã đo.');
    }
  }

  // lods
  (a.lods ?? []).forEach((l, k) => {
    checkRelativeUrl(ctx, l.url, `${base}.lods[${k}].url`, id, opts);
    if (l.level !== k) {
      push(ctx, 'error', 'LOD_ORDER', id, `${base}.lods[${k}].level`, `LOD thứ ${k} có level ${l.level}.`, 'Sắp LOD theo level 0, 1, 2...');
    }
    if (l.triangles === null) {
      push(ctx, 'warning', 'LOD_UNMEASURED', id, `${base}.lods[${k}].triangles`, 'Chưa đo số tam giác.', 'Chạy --print-facts để đo.');
    }
  });

  // materials
  (a.materials ?? []).forEach((mat, k) => {
    const mp = `${base}.materials[${k}]`;
    if (!['OPAQUE', 'MASK', 'BLEND'].includes(mat.alphaMode)) {
      push(ctx, 'error', 'BAD_ALPHA', id, `${mp}.alphaMode`, `alphaMode "${String(mat.alphaMode)}" không hợp lệ.`, 'Dùng OPAQUE, MASK hoặc BLEND.');
    }
    if (mat.alphaMode === 'MASK' && typeof mat.alphaCutoff !== 'number') {
      push(ctx, 'warning', 'ALPHA_CUTOFF', id, `${mp}.alphaCutoff`, 'MASK không ghi alphaCutoff (glTF mặc định 0.5).', 'Ghi rõ alphaCutoff.');
    }
    // File gốc xuất BLEND nhưng loader ép OPAQUE/MASK lúc chạy (runtimeAlphaMode): không còn rủi ro thứ tự vẽ.
    const overridden = mat.runtimeAlphaMode === 'OPAQUE' || mat.runtimeAlphaMode === 'MASK';
    if (mat.alphaMode === 'BLEND' && !mat.blendApproved && !overridden) {
      push(ctx, 'warning', 'BLEND_UNAPPROVED', id, `${mp}.alphaMode`, `Material "${mat.name}" dùng BLEND (dễ lỗi thứ tự vẽ, không ghi depth).`, 'Da/thân dùng OPAQUE; lông mày, mi, tóc dùng MASK; chỉ giữ BLEND cho kính và đặt blendApproved = true.');
    }
  });

  // morph
  if (a.morphCapabilities) {
    const t = new Set(a.morphCapabilities.targets);
    if (t.size !== a.morphCapabilities.targets.length) {
      push(ctx, 'error', 'DUP_MORPH', id, `${base}.morphCapabilities.targets`, 'Tên morph trùng.', 'Bỏ tên trùng.');
    }
    for (const [g, names] of Object.entries(a.morphCapabilities.groups ?? {})) {
      for (const n of names) {
        if (!t.has(n)) {
          push(ctx, 'error', 'MORPH_GROUP', id, `${base}.morphCapabilities.groups.${g}`, `Nhóm "${g}" chứa "${n}" không có trong targets.`, 'Sửa tên hoặc thêm vào targets.');
        }
      }
    }
  }

  // collider
  const c = a.colliderProfile;
  if (c && (c.shape === 'capsule' || c.shape === 'cylinder') && (!(c.radius > 0) || !(c.height > 0))) {
    push(ctx, 'error', 'BAD_COLLIDER', id, `${base}.colliderProfile`, 'radius/height phải dương.', 'Ghi số đo theo bounds.');
  }
  if (c && c.shape === 'box') {
    if (checkVec3(ctx, c.size, `${base}.colliderProfile.size`, id) && c.size.some((x) => x <= 0)) {
      push(ctx, 'error', 'BAD_COLLIDER', id, `${base}.colliderProfile.size`, 'size phải dương.', 'Ghi số đo theo bounds.');
    }
    checkVec3(ctx, c.center, `${base}.colliderProfile.center`, id);
  }

  // GLB facts (Node)
  if (opts.readGlb && typeof a.url === 'string' && (!opts.fileExists || opts.fileExists(a.url)) && a.format === 'glb') {
    const f = opts.readGlb(a.url);
    if (!f) {
      push(ctx, 'error', 'GLB_UNREADABLE', id, `${base}.url`, 'Không đọc được GLB.', 'Kiểm tra file có đúng glTF 2.0 binary.');
    } else {
      checkFacts(ctx, a, base, f, rig);
    }
  }
}

function near(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

function checkFacts(ctx: Ctx, a: AssetEntry, base: string, f: GlbFacts, rig: AssetManifest['rigProfiles'][string] | undefined): void {
  const id = a.assetId;
  if (a.hash?.value && f.sha256 !== a.hash.value) {
    push(ctx, 'error', 'HASH_MISMATCH', id, `${base}.hash.value`, `sha256 file (${f.sha256.slice(0, 12)}…) khác manifest.`, 'File đã đổi: đo lại bounds/triangles, tăng version, cập nhật hash.');
  }
  if (typeof a.bytes === 'number' && f.bytes !== a.bytes) {
    push(ctx, 'error', 'BYTES_MISMATCH', id, `${base}.bytes`, `File ${f.bytes} byte, manifest ghi ${a.bytes}.`, 'Cập nhật bytes cùng hash.');
  }
  // File không có hình học (animation thuần): boundsMin/Max không hữu hạn, không có gì để so với bounds khai báo.
  const fileHasGeometry = f.boundsMin.every(Number.isFinite) && f.boundsMax.every(Number.isFinite);
  if (fileHasGeometry && a.bounds && Array.isArray(a.bounds.min) && Array.isArray(a.bounds.max)) {
    for (let k = 0; k < 3; k++) {
      if (!near(a.bounds.min[k], f.boundsMin[k], 0.002) || !near(a.bounds.max[k], f.boundsMax[k], 0.002)) {
        push(ctx, 'error', 'BOUNDS_MISMATCH', id, `${base}.bounds`, `Bounds trục ${'xyz'[k]} khác file (file: ${f.boundsMin[k].toFixed(3)}..${f.boundsMax[k].toFixed(3)}).`, 'Ghi lại bounds theo --print-facts.');
        break;
      }
    }
  }
  const lod0 = a.lods?.[0];
  if (lod0 && lod0.url === a.url && lod0.triangles !== null && lod0.triangles !== f.triangles) {
    push(ctx, 'error', 'TRIANGLES_MISMATCH', id, `${base}.lods[0].triangles`, `File có ${f.triangles} tam giác, manifest ghi ${lod0.triangles}.`, 'Cập nhật số đo.');
  }
  if (rig) {
    const missing = rig.bones.filter((b) => !f.joints.includes(b));
    if (missing.length) {
      push(ctx, 'error', 'RIG_BONES_MISSING', id, `${base}.rigProfile`, `File thiếu xương: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}.`, 'Kiểm tra rig trước khi đổi tên; không đổi tên xương hàng loạt khi chưa rà clip phụ thuộc.');
    }
    if (a.type === 'character' && f.joints.length !== rig.bones.length) {
      push(ctx, 'warning', 'RIG_BONE_COUNT', id, `${base}.rigProfile`, `File có ${f.joints.length} xương, hồ sơ ${rig.bones.length}.`, 'Đồng bộ rigProfile.bones với skin.joints.');
    }
  }
  for (const t of a.morphCapabilities?.targets ?? []) {
    if (!f.morphTargets.includes(t)) {
      push(ctx, 'error', 'MORPH_MISSING', id, `${base}.morphCapabilities.targets`, `File không có morph "${t}".`, 'Xuất lại có shape key hoặc bỏ tên khỏi manifest.');
    }
  }
  for (const c of a.clips ?? []) {
    if (!f.animations.includes(c.name)) {
      push(ctx, 'error', 'CLIP_NOT_IN_FILE', id, `${base}.clips`, `File không có clip "${c.name}".`, 'Kiểm tra tên action khi xuất từ Blender.');
    }
  }
  for (const s of a.sockets ?? []) {
    if (s.node && !f.nodes.includes(s.node)) {
      push(ctx, 'error', 'SOCKET_NODE_MISSING', id, `${base}.sockets`, `File không có node "${s.node}" cho socket "${s.name}".`, 'Thêm empty trong Blender hoặc sửa tên node.');
    }
    if (s.bone && !f.joints.includes(s.bone)) {
      push(ctx, 'error', 'SOCKET_BONE_MISSING', id, `${base}.sockets`, `File không có xương "${s.bone}" cho socket "${s.name}".`, 'Sửa tên xương theo file.');
    }
  }
  for (const mat of a.materials ?? []) {
    const fm = f.materials.find((x) => x.name === mat.name);
    if (!fm) {
      push(ctx, 'error', 'MATERIAL_MISSING', id, `${base}.materials`, `File không có material "${mat.name}".`, 'Sửa tên theo file.');
    } else if (fm.alphaMode !== mat.alphaMode || fm.doubleSided !== mat.doubleSided) {
      push(ctx, 'error', 'MATERIAL_MISMATCH', id, `${base}.materials`, `Material "${mat.name}" trong file: ${fm.alphaMode}, doubleSided=${fm.doubleSided}.`, 'Manifest phải ghi đúng trạng thái file; sửa file nguồn rồi đo lại, không sửa manifest cho khớp mong muốn.');
    }
  }
}

/** Kiểm tra toàn bộ manifest. Không thay đổi đối tượng đầu vào. */
export function validateManifest(input: unknown, opts: ValidateOptions = {}): ValidationResult {
  const ctx: Ctx = { errors: [], warnings: [] };
  if (!isObj(input)) {
    push(ctx, 'error', 'NOT_OBJECT', null, '', 'Manifest không phải object JSON.', 'Kiểm tra file JSON.');
    return { ok: false, ...ctx };
  }
  scanNonFinite(ctx, input, '', null);
  const m = input as unknown as AssetManifest;
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(m.schemaVersion as number)) {
    push(ctx, 'error', 'SCHEMA_VERSION', null, 'schemaVersion', `schemaVersion ${String(m.schemaVersion)} không hỗ trợ.`, 'Dùng migrateManifest() trong src/assets/migrate.ts để nâng lên 1.');
    return { ok: false, ...ctx };
  }
  if (m.units !== 'm') push(ctx, 'error', 'UNITS', null, 'units', 'units phải là "m".', 'Xuất asset ở mét.');
  if (m.upAxis !== 'Y') push(ctx, 'error', 'UP_AXIS', null, 'upAxis', 'upAxis phải là "Y" (Three.js).', 'Bật +Y Up khi xuất glTF từ Blender.');
  if (m.forward !== '+Z') push(ctx, 'error', 'FORWARD', null, 'forward', 'forward phải là "+Z".', 'Xem ASSET_STANDARD.md mục 2.');
  if (!isObj(m.rigProfiles)) push(ctx, 'error', 'MISSING_FIELD', null, 'rigProfiles', 'Thiếu rigProfiles.', 'Ghi {} nếu chưa có rig.');
  else {
    for (const [key, r] of Object.entries(m.rigProfiles)) {
      const rp = `rigProfiles.${key}`;
      if (r.id !== key) push(ctx, 'error', 'RIG_ID', null, `${rp}.id`, `id "${r.id}" khác khóa "${key}".`, 'Đặt id trùng khóa.');
      if (!Array.isArray(r.bones) || r.bones.length === 0) {
        push(ctx, 'error', 'RIG_BONES', null, `${rp}.bones`, 'Danh sách xương rỗng.', 'Chép từ skin.joints (--print-facts).');
        continue;
      }
      if (new Set(r.bones).size !== r.bones.length) push(ctx, 'error', 'RIG_DUP_BONE', null, `${rp}.bones`, 'Tên xương trùng.', 'Mỗi xương một tên.');
      if (!r.bones.includes(r.rootBone)) push(ctx, 'error', 'RIG_ROOT', null, `${rp}.rootBone`, `rootBone "${r.rootBone}" không có trong bones.`, 'Sửa rootBone.');
      for (const [hum, bone] of Object.entries(r.retargetMap ?? {})) {
        if (!r.bones.includes(bone)) push(ctx, 'error', 'RETARGET_BONE', null, `${rp}.retargetMap.${hum}`, `Xương "${bone}" không có trong rig.`, 'Sửa mapping.');
      }
    }
  }
  if (!Array.isArray(m.assets)) {
    push(ctx, 'error', 'MISSING_FIELD', null, 'assets', 'Thiếu mảng assets.', 'Thêm "assets": [].');
    return { ok: false, ...ctx };
  }
  const ids = new Map<string, number>();
  m.assets.forEach((a, i) => {
    if (!isObj(a)) {
      push(ctx, 'error', 'NOT_OBJECT', null, `assets[${i}]`, 'Mục asset không phải object.', 'Sửa JSON.');
      return;
    }
    const id = typeof a.assetId === 'string' ? a.assetId : '';
    if (!id) {
      push(ctx, 'error', 'MISSING_FIELD', null, `assets[${i}].assetId`, 'Thiếu assetId.', 'Đặt ID ổn định, không đổi sau khi phát hành.');
      return;
    }
    if (ids.has(id)) {
      push(ctx, 'error', 'DUP_ASSET_ID', id, `assets[${i}].assetId`, `assetId trùng với assets[${ids.get(id)}].`, 'Đổi ID của mục mới; không đổi ID mục cũ đã được tham chiếu.');
    } else ids.set(id, i);
    checkAsset(ctx, a as unknown as AssetEntry, i, m, opts);
  });

  // Tham chiếu chéo: accessory -> socket nhân vật; clip mong đợi -> asset animation cùng rig.
  const chars = m.assets.filter((a) => isObj(a) && a.type === 'character');
  m.assets.forEach((a, i) => {
    if (!isObj(a)) return;
    if (a.type === 'accessory' && a.attachTo) {
      const any = chars.some((c) => (c.sockets ?? []).some((s) => s.name === a.attachTo));
      if (!any) {
        push(ctx, 'error', 'ATTACH_SOCKET_MISSING', a.assetId, `assets[${i}].attachTo`, `Không nhân vật nào có socket "${a.attachTo}".`, `Dùng một trong: ${CHARACTER_SOCKETS.join(', ')}.`);
      }
    }
    if (a.type === 'character') {
      const available = new Set(
        m.assets
          .filter((x) => isObj(x) && x.type === 'animation' && x.rigProfile === a.rigProfile)
          .flatMap((x) => (x.clips ?? []).map((c) => c.name)),
      );
      for (const clip of a.expectedClips ?? []) {
        if (!available.has(clip)) {
          push(ctx, 'warning', 'CLIP_MISSING', a.assetId, `assets[${i}].expectedClips`, `Chưa có clip "${clip}" cho rig ${String(a.rigProfile)}.`, 'Thêm asset animation cùng rigProfile, hoặc retarget có kiểm tra.');
        }
      }
    }
  });

  return { ok: ctx.errors.length === 0, ...ctx };
}

/** Định dạng một dòng lỗi để in ra console. */
export function formatIssue(x: ValidationIssue): string {
  const who = x.assetId ?? '(manifest)';
  return `[${x.severity.toUpperCase()}] ${x.code} ${who} @ ${x.path || '/'}: ${x.message}\n    -> Sửa: ${x.fix}`;
}
