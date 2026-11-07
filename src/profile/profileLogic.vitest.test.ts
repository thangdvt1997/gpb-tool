import { describe, expect, it } from 'vitest';
import {
  avatarRefToChoice,
  buildAboutPatch,
  buildProfilePatch,
  checkDisplayName,
  mapProfileError,
  planSync,
  summarizeLook,
  type ApiErrorLike,
} from './profileLogic';

const err = (status: number, code: string, data: Record<string, unknown> | null = null, message = 'm'): ApiErrorLike => ({
  status,
  code,
  message,
  data,
});

describe('checkDisplayName', () => {
  it('chuẩn hóa khoảng trắng và nhận tên hợp lệ', () => {
    const r = checkDisplayName('  Nguyễn   Văn  An ');
    expect(r.ok).toBe(true);
    expect(r.value).toBe('Nguyễn Văn An');
  });
  it('từ chối quá ngắn, quá dài, ký tự điều khiển, đường dẫn', () => {
    expect(checkDisplayName('A').ok).toBe(false);
    expect(checkDisplayName('x'.repeat(81)).ok).toBe(false);
    expect(checkDisplayName('x'.repeat(80)).ok).toBe(true);
    expect(checkDisplayName('ab\u0007c').ok).toBe(false);
    expect(checkDisplayName('http://evil.example').ok).toBe(false);
    expect(checkDisplayName('data:text/html,x').ok).toBe(false);
  });
  it('đếm theo ký tự Unicode, không theo đơn vị UTF-16', () => {
    expect(checkDisplayName('😀😀').ok).toBe(true);
  });
});

describe('buildProfilePatch', () => {
  const base = { name: 'An Nguyễn', avatarRef: null, revision: 3 };
  it('không đổi gì thì báo rỗng', () => {
    expect(buildProfilePatch(base, { name: ' An  Nguyễn', avatar: 'none' })).toEqual({ empty: true });
  });
  it('chỉ gửi trường đã đổi, kèm revision', () => {
    expect(buildProfilePatch(base, { name: 'Bình', avatar: 'none' })).toEqual({ patch: { revision: 3, name: 'Bình' } });
    expect(buildProfilePatch(base, { name: 'An Nguyễn', avatar: 'character' })).toEqual({
      patch: { revision: 3, avatarRef: 'character' },
    });
  });
  it('tên sai trả lỗi', () => {
    expect(buildProfilePatch(base, { name: 'A', avatar: 'none' })).toHaveProperty('error');
  });
  it('avatarRef lạ được coi như none', () => {
    expect(avatarRefToChoice('preset:x')).toBe('none');
    expect(avatarRefToChoice('character')).toBe('character');
  });
});

describe('mapProfileError', () => {
  it('409 conflict kèm revision hiện tại', () => {
    const m = mapProfileError(err(409, 'revision_conflict', { currentRevision: 5 }));
    expect(m.kind).toBe('conflict');
    expect(m.currentRevision).toBe(5);
  });
  it('401, 429, 413, 415', () => {
    expect(mapProfileError(err(401, 'unauthenticated')).kind).toBe('auth');
    const r = mapProfileError(err(429, 'rate_limited', { retryAfter: 2 }));
    expect(r.kind).toBe('rate_limited');
    expect(r.retryAfter).toBe(2);
    expect(r.message).toContain('2');
    expect(mapProfileError(err(413, 'payload_too_large')).kind).toBe('too_large');
    expect(mapProfileError(err(415, 'unsupported_media_type')).kind).toBe('unsupported');
  });
  it('422 giữ path trường lỗi; content_rejected ở tên', () => {
    const a = mapProfileError(err(422, 'invalid_character', { path: 'hair.style' }, 'Sai kiểu'));
    expect(a.kind).toBe('invalid');
    expect(a.field).toBe('hair.style');
    const b = mapProfileError(err(422, 'content_rejected', { path: 'name' }));
    expect(b.message).toContain('Tên');
    expect(b.field).toBe('name');
  });
  it('schema_newer, mạng, 5xx, lỗi không phải ApiError', () => {
    expect(mapProfileError(err(409, 'schema_newer')).kind).toBe('schema_newer');
    expect(mapProfileError(err(0, '')).kind).toBe('network');
    expect(mapProfileError(err(500, 'internal')).kind).toBe('server');
    expect(mapProfileError(new Error('x')).kind).toBe('other');
    expect(mapProfileError(null).kind).toBe('other');
  });
});

describe('summarizeLook và planSync', () => {
  it('tóm tắt look và chịu được dữ liệu lạ', () => {
    const s = summarizeLook({
      meta: { name: 'Đi làm' },
      bodyStyle: 'realistic',
      hair: { style: 'hair-short-01' },
      outfit: { top: {}, bottom: null },
      tattoos: [{}],
      scars: [],
    });
    expect(s).toEqual({ name: 'Đi làm', bodyStyle: 'realistic', hair: 'hair-short-01', outfitPieces: 1, tattoos: 1, scars: 0 });
    expect(summarizeLook(null)).toBeNull();
    expect(summarizeLook([])).toBeNull();
    expect(summarizeLook({})?.name).toBe('Chưa đặt tên');
  });
  it('planSync không tự ghi đè bản cloud khác', () => {
    const none = { look: null, revision: 0, corrupt: false };
    const has = { look: {}, revision: 2, corrupt: false };
    expect(planSync(none, null, null)).toBe('no_local');
    expect(planSync(none, '{"a":1}', null)).toBe('upload');
    expect(planSync(has, '{"a":1}', '{"a":1}')).toBe('same');
    expect(planSync(has, '{"a":1}', '{"a":2}')).toBe('confirm_overwrite');
    expect(planSync({ look: null, revision: 4, corrupt: true }, '{"a":1}', null)).toBe('confirm_overwrite');
  });
});

describe('buildAboutPatch', () => {
  const base = {
    bio: 'a',
    presence: 'free' as const,
    statusText: '',
    profileVisibility: 'colleagues' as const,
    characterVisibility: 'colleagues' as const,
    revision: 3,
  };
  it('chỉ gửi trường đổi, kèm revision', () => {
    const r = buildAboutPatch(base, { ...base, presence: 'busy', bio: ' a ' });
    expect(r).toEqual({ patch: { revision: 3, presence: 'busy' } });
  });
  it('không đổi thì empty', () => {
    expect(buildAboutPatch(base, base)).toEqual({ empty: true });
  });
  it('quá dài hoặc có URL thì báo lỗi theo trường', () => {
    expect(buildAboutPatch(base, { ...base, bio: 'x'.repeat(281) })).toHaveProperty('errors.bio');
    expect(buildAboutPatch(base, { ...base, statusText: 'xem http://a.b' })).toHaveProperty('errors.statusText');
  });
});
