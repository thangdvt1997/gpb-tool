// Giới thiệu, trạng thái và quyền riêng tư của hồ sơ (docs/design/PROFILE.md mục 10). Hàm thuần, dễ test.
import { findBlocked } from './profanity.js';

export const BIO_MAX = 280;
export const STATUS_TEXT_MAX = 60;
export const STATUSES = ['free', 'busy', 'meeting', 'away'];
// everyone: mọi người dùng đã đăng nhập; colleagues: cùng tenant; self: chỉ chính chủ.
export const VISIBILITIES = ['everyone', 'colleagues', 'self'];
export const DEFAULT_VISIBILITY = 'colleagues';

const CONTROL_RE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/;
const EXTERNAL_RE = /(:\/\/|^\s*(data|blob|javascript|file):)/i;

export class AboutError extends Error {
  constructor(message, path, code = 'invalid_input') {
    super(message);
    this.path = path;
    this.code = code;
  }
}

function cleanText(value, path, max, { multiline }) {
  if (typeof value !== 'string') throw new AboutError('Giá trị phải là chuỗi.', path);
  let s = value.normalize('NFC').replace(/\r\n?/g, '\n');
  s = multiline ? s.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  s = s.trim();
  if (CONTROL_RE.test(multiline ? s.replace(/\n/g, '') : s)) throw new AboutError('Chứa ký tự không hợp lệ.', path);
  if (EXTERNAL_RE.test(s)) throw new AboutError('Không được chứa đường dẫn.', path);
  if (Array.from(s).length > max) throw new AboutError(`Tối đa ${max} ký tự.`, path, 'too_long');
  if (s !== '' && findBlocked(s)) throw new AboutError('content_rejected', path, 'content_rejected');
  return s;
}

export const validateBio = (v) => cleanText(v, 'bio', BIO_MAX, { multiline: true });
export const validateStatusText = (v) => cleanText(v, 'statusText', STATUS_TEXT_MAX, { multiline: false });

export function validateStatus(v) {
  if (typeof v !== 'string' || !STATUSES.includes(v)) {
    throw new AboutError(`presence chỉ nhận ${STATUSES.join(', ')}.`, 'presence');
  }
  return v;
}

export function validateVisibility(v, path) {
  if (typeof v !== 'string' || !VISIBILITIES.includes(v)) {
    throw new AboutError(`${path} chỉ nhận ${VISIBILITIES.join(', ')}.`, path);
  }
  return v;
}

/** viewer/owner: { id, tenant_id }. Trả true nếu viewer được xem theo mức `visibility`. */
export function canView(visibility, viewer, owner) {
  if (viewer.id === owner.id) return true;
  if (visibility === 'everyone') return true;
  // Tenant 'personal' gom mọi email cá nhân (gmail...), không phải đồng nghiệp thật.
  if (visibility === 'colleagues') return viewer.tenant_id != null && viewer.tenant_id !== 'personal' && viewer.tenant_id === owner.tenant_id;
  return false;
}
