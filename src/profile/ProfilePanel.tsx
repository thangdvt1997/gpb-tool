import './profile.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  deleteCloudCharacter,
  getCloudCharacter,
  getMyAbout,
  getProfile,
  putMyAbout,
  putCloudCharacter,
  putProfile,
} from '../auth/api';
import type { CloudCharacter, MyAbout, MyProfile } from '../auth/api';
import { validate } from '../fashion/rules';
import type { CharacterLook } from '../fashion/types';
import {
  avatarRefToChoice,
  BIO_MAX,
  buildAboutPatch,
  buildProfilePatch,
  mapProfileError,
  planSync,
  PRESENCE_LABELS,
  STATUS_TEXT_MAX,
  summarizeLook,
  VISIBILITY_LABELS,
} from './profileLogic';
import type { AboutForm, AvatarChoice, MappedError, PresenceKey, VisibilityKey } from './profileLogic';

interface Props {
  /** Nhân vật đang dùng trong trình chỉnh sửa (null nếu chưa có). Nút đồng bộ gửi bản này lên máy chủ. */
  currentLook: CharacterLook | null;
  /** Người dùng chọn dùng bản cloud: nhận look đã qua validate() của rules.ts. */
  onUseCloudLook?: (look: CharacterLook) => void;
  /** Gọi sau khi tên đổi thành công để chỗ khác (HUD) cập nhật. */
  onNameChanged?: (name: string) => void;
  onClose: () => void;
}

function toAboutForm(a: MyAbout): AboutForm {
  return {
    bio: a.bio,
    presence: a.presence,
    statusText: a.statusText,
    profileVisibility: a.profileVisibility,
    characterVisibility: a.characterVisibility,
  };
}

type Notice = { kind: 'ok' | 'err'; text: string; err?: MappedError } | null;

/** Hồ sơ cá nhân: tên hiển thị, ảnh đại diện và nhân vật lưu trên máy chủ. Dữ liệu nằm trên server, không có localStorage. */
import { useReturnFocus } from '../a11y/useReturnFocus';
export function ProfilePanel({ currentLook, onUseCloudLook, onNameChanged, onClose }: Props) {
  useReturnFocus();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [cloud, setCloud] = useState<CloudCharacter | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<MappedError | null>(null);

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<AvatarChoice>('none');
  const [nameError, setNameError] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileNotice, setProfileNotice] = useState<Notice>(null);

  // about === null: máy chủ auth chưa hỗ trợ (404) nên ẩn giới thiệu, trạng thái, quyền riêng tư.
  const [about, setAbout] = useState<MyAbout | null>(null);
  const [aboutForm, setAboutForm] = useState<AboutForm>({
    bio: '',
    presence: 'free',
    statusText: '',
    profileVisibility: 'colleagues',
    characterVisibility: 'colleagues',
  });
  const [aboutErrors, setAboutErrors] = useState<{ bio?: string; statusText?: string }>({});
  const [aboutBusy, setAboutBusy] = useState(false);
  const [aboutNotice, setAboutNotice] = useState<Notice>(null);

  const [charBusy, setCharBusy] = useState(false);
  const [charNotice, setCharNotice] = useState<Notice>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Chặn setState sau khi panel đã đóng.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [p, c] = await Promise.all([getProfile(), getCloudCharacter()]);
      if (!alive.current) return;
      setProfile(p);
      setCloud(c);
      setName(p.name);
      setAvatar(avatarRefToChoice(p.avatarRef));
      // Trường mới là phần phụ: lỗi (kể cả 404 của máy chủ cũ) chỉ làm ẩn mục này, không chặn hồ sơ.
      const a = await getMyAbout().catch(() => null);
      if (!alive.current) return;
      setAbout(a);
      if (a) setAboutForm(toAboutForm(a));
    } catch (e) {
      if (alive.current) setLoadError(mapProfileError(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Đếm ngược khi bị giới hạn tần suất (429).
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [cooldownUntil]);
  const waitSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  function startCooldown(e: MappedError) {
    if (e.kind === 'rate_limited') {
      const until = Date.now() + (e.retryAfter ?? 2) * 1000;
      setNow(Date.now());
      setCooldownUntil(until);
    }
  }

  async function saveProfile(ev: FormEvent) {
    ev.preventDefault();
    if (!profile || profileBusy) return;
    const built = buildProfilePatch(profile, { name, avatar });
    if ('error' in built) {
      setNameError(built.error);
      return;
    }
    setNameError(null);
    if ('empty' in built) {
      setProfileNotice({ kind: 'ok', text: 'Không có thay đổi.' });
      return;
    }
    setProfileBusy(true);
    setProfileNotice(null);
    try {
      const next = await putProfile(built.patch);
      if (!alive.current) return;
      setProfile(next);
      setName(next.name);
      setAvatar(avatarRefToChoice(next.avatarRef));
      setProfileNotice({ kind: 'ok', text: 'Đã lưu hồ sơ.' });
      if (built.patch.name !== undefined) onNameChanged?.(next.name);
    } catch (e) {
      if (!alive.current) return;
      const m = mapProfileError(e);
      if (m.kind === 'invalid' && m.field === 'name') setNameError(m.message);
      setProfileNotice({ kind: 'err', text: m.message, err: m });
      startCooldown(m);
    } finally {
      if (alive.current) setProfileBusy(false);
    }
  }

  async function saveAbout(ev: FormEvent) {
    ev.preventDefault();
    if (!about || aboutBusy) return;
    const built = buildAboutPatch(about, aboutForm);
    if ('errors' in built) {
      setAboutErrors(built.errors);
      return;
    }
    setAboutErrors({});
    if ('empty' in built) {
      setAboutNotice({ kind: 'ok', text: 'Không có thay đổi.' });
      return;
    }
    setAboutBusy(true);
    setAboutNotice(null);
    try {
      const next = await putMyAbout(built.patch);
      if (!alive.current) return;
      setAbout(next);
      setAboutForm(toAboutForm(next));
      setAboutNotice({ kind: 'ok', text: 'Đã lưu giới thiệu và quyền riêng tư.' });
    } catch (e) {
      if (!alive.current) return;
      const m = mapProfileError(e);
      if (m.field === 'bio' || m.field === 'statusText') setAboutErrors({ [m.field]: m.message });
      setAboutNotice({ kind: 'err', text: m.message, err: m });
      startCooldown(m);
    } finally {
      if (alive.current) setAboutBusy(false);
    }
  }

  async function doUpload(revision: number, look: CharacterLook) {
    setCharBusy(true);
    setCharNotice(null);
    setConfirmOverwrite(false);
    try {
      const saved = await putCloudCharacter(revision, look);
      if (!alive.current) return;
      setCloud(saved);
      setCharNotice({ kind: 'ok', text: 'Đã đồng bộ nhân vật lên máy chủ.' });
    } catch (e) {
      if (!alive.current) return;
      const m = mapProfileError(e);
      setCharNotice({ kind: 'err', text: m.message, err: m });
      startCooldown(m);
    } finally {
      if (alive.current) setCharBusy(false);
    }
  }

  function syncCurrent() {
    if (!cloud || charBusy) return;
    if (!currentLook) {
      setCharNotice({ kind: 'err', text: 'Chưa có nhân vật đang dùng để đồng bộ.' });
      return;
    }
    const localJson = JSON.stringify(currentLook);
    const cloudJson = cloud.look ? JSON.stringify(cloud.look) : null;
    const plan = planSync(cloud, localJson, cloudJson);
    if (plan === 'same') {
      setCharNotice({ kind: 'ok', text: 'Bản trên máy chủ đã trùng với nhân vật hiện tại.' });
    } else if (plan === 'confirm_overwrite') {
      // Không tự ghi đè bản cloud: người dùng phải xác nhận.
      setConfirmOverwrite(true);
      setCharNotice(null);
    } else if (plan === 'upload') {
      void doUpload(cloud.revision, currentLook);
    }
  }

  function useCloud() {
    if (!cloud?.look || !onUseCloudLook) return;
    const result = validate(cloud.look);
    onUseCloudLook(result.look);
    const extra = result.warnings.length > 0 ? ` (${result.warnings.length} mục đã được điều chỉnh theo quy tắc hiện hành)` : '';
    setCharNotice({ kind: 'ok', text: `Đã nạp nhân vật từ máy chủ${extra}.` });
  }

  async function removeCloud() {
    setCharBusy(true);
    setConfirmDelete(false);
    try {
      await deleteCloudCharacter();
      if (!alive.current) return;
      const c = await getCloudCharacter();
      if (!alive.current) return;
      setCloud(c);
      setCharNotice({ kind: 'ok', text: 'Đã xóa nhân vật trên máy chủ.' });
    } catch (e) {
      if (alive.current) setCharNotice({ kind: 'err', text: mapProfileError(e).message });
    } finally {
      if (alive.current) setCharBusy(false);
    }
  }

  const aboutDirty =
    about !== null &&
    (aboutForm.bio !== about.bio ||
      aboutForm.presence !== about.presence ||
      aboutForm.statusText !== about.statusText ||
      aboutForm.profileVisibility !== about.profileVisibility ||
      aboutForm.characterVisibility !== about.characterVisibility);
  const setAboutField = <K extends keyof AboutForm>(key: K, value: AboutForm[K]) => {
    setAboutForm((f) => ({ ...f, [key]: value }));
    setAboutErrors({});
  };

  const summary = cloud?.look ? summarizeLook(cloud.look) : null;
  const dirty = profile !== null && (name !== profile.name || avatar !== avatarRefToChoice(profile.avatarRef));

  return (
    <aside className="ui-panel profile-panel" role="dialog" aria-modal="false" aria-labelledby="profile-title">
      <header className="ui-panel-header">
        <h2 className="ui-panel-title" id="profile-title">
          Hồ sơ của tôi
        </h2>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={onClose} aria-label="Đóng hồ sơ">
          ✕
        </button>
      </header>

      {loading && (
        <p className="ui-hint" role="status">
          Đang tải hồ sơ…
        </p>
      )}

      {loadError && (
        <div role="alert" className="profile-error">
          <p>{loadError.message}</p>
          {loadError.kind !== 'auth' && (
            <button type="button" className="ui-btn" onClick={() => void load()}>
              Thử lại
            </button>
          )}
        </div>
      )}

      {profile && cloud && (
        <>
          <form className="profile-form" onSubmit={(e) => void saveProfile(e)} noValidate aria-label="Thông tin hồ sơ">
            <label className="ui-field">
              <span className="ui-label">Tên hiển thị</span>
              <input
                className="ui-input"
                type="text"
                value={name}
                maxLength={120}
                autoComplete="nickname"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? 'profile-name-error' : 'profile-name-hint'}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
              />
              {nameError ? (
                <span className="ui-hint profile-field-error" id="profile-name-error" role="alert">
                  {nameError}
                </span>
              ) : (
                <span className="ui-hint" id="profile-name-hint">
                  2 đến 80 ký tự. Hiển thị cho đồng nghiệp trong danh bạ.
                </span>
              )}
            </label>

            <div className="ui-field">
              <span className="ui-label" id="profile-email-label">
                Email
              </span>
              <output className="profile-readonly" aria-labelledby="profile-email-label">
                {profile.email}
              </output>
              <span className="ui-hint">
                Email{profile.department ? ' và phòng ban' : ''} không đổi được tại đây. Chỉ bạn thấy email.
              </span>
            </div>

            <fieldset className="ui-field profile-avatar">
              <legend className="ui-label">Ảnh đại diện</legend>
              <label>
                <input type="radio" name="avatar" checked={avatar === 'none'} onChange={() => setAvatar('none')} /> Không dùng
              </label>
              <label>
                <input
                  type="radio"
                  name="avatar"
                  checked={avatar === 'character'}
                  disabled={!cloud.look}
                  onChange={() => setAvatar('character')}
                />{' '}
                Vẽ từ nhân vật đã lưu
              </label>
              {!cloud.look && <span className="ui-hint">Cần đồng bộ nhân vật lên máy chủ trước.</span>}
            </fieldset>

            <div role={profileNotice?.kind === 'err' ? 'alert' : 'status'} aria-live="polite" className="profile-notice">
              {profileNotice && <p className={profileNotice.kind === 'err' ? 'profile-error' : 'profile-ok'}>{profileNotice.text}</p>}
              {profileNotice?.err?.kind === 'conflict' && (
                <button type="button" className="ui-btn" onClick={() => void load()}>
                  Tải lại bản mới nhất
                </button>
              )}
            </div>

            <button type="submit" className="ui-btn ui-btn-primary" disabled={profileBusy || !dirty || waitSeconds > 0}>
              {profileBusy ? 'Đang lưu…' : waitSeconds > 0 ? `Chờ ${waitSeconds}s` : 'Lưu hồ sơ'}
            </button>
          </form>

          {about && (
            <form className="profile-form" onSubmit={(e) => void saveAbout(e)} noValidate aria-label="Giới thiệu và quyền riêng tư">
              <label className="ui-field">
                <span className="ui-label">Giới thiệu</span>
                <textarea
                  className="ui-input"
                  rows={3}
                  value={aboutForm.bio}
                  maxLength={BIO_MAX * 2}
                  aria-invalid={aboutErrors.bio ? true : undefined}
                  onChange={(e) => setAboutField('bio', e.target.value)}
                />
                <span className={aboutErrors.bio ? 'ui-hint profile-field-error' : 'ui-hint'} role={aboutErrors.bio ? 'alert' : undefined}>
                  {aboutErrors.bio ?? `${Array.from(aboutForm.bio).length}/${BIO_MAX} ký tự.`}
                </span>
              </label>

              <label className="ui-field">
                <span className="ui-label">Trạng thái</span>
                <select
                  className="ui-input"
                  value={aboutForm.presence}
                  onChange={(e) => setAboutField('presence', e.target.value as PresenceKey)}
                >
                  {(Object.keys(PRESENCE_LABELS) as PresenceKey[]).map((k) => (
                    <option key={k} value={k}>
                      {PRESENCE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="ui-field">
                <span className="ui-label">Câu trạng thái</span>
                <input
                  className="ui-input"
                  type="text"
                  value={aboutForm.statusText}
                  maxLength={STATUS_TEXT_MAX * 2}
                  aria-invalid={aboutErrors.statusText ? true : undefined}
                  onChange={(e) => setAboutField('statusText', e.target.value)}
                />
                <span className={aboutErrors.statusText ? 'ui-hint profile-field-error' : 'ui-hint'} role={aboutErrors.statusText ? 'alert' : undefined}>
                  {aboutErrors.statusText ?? `Tối đa ${STATUS_TEXT_MAX} ký tự.`}
                </span>
              </label>

              <label className="ui-field">
                <span className="ui-label">Ai xem được hồ sơ</span>
                <select
                  className="ui-input"
                  value={aboutForm.profileVisibility}
                  onChange={(e) => setAboutField('profileVisibility', e.target.value as VisibilityKey)}
                >
                  {(Object.keys(VISIBILITY_LABELS) as VisibilityKey[]).map((k) => (
                    <option key={k} value={k}>
                      {VISIBILITY_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="ui-field">
                <span className="ui-label">Ai xem được nhân vật</span>
                <select
                  className="ui-input"
                  value={aboutForm.characterVisibility}
                  onChange={(e) => setAboutField('characterVisibility', e.target.value as VisibilityKey)}
                >
                  {(Object.keys(VISIBILITY_LABELS) as VisibilityKey[]).map((k) => (
                    <option key={k} value={k}>
                      {VISIBILITY_LABELS[k]}
                    </option>
                  ))}
                </select>
                <span className="ui-hint">Đồng nghiệp là người cùng tổ chức (cùng tên miền email công ty).</span>
              </label>

              <div role={aboutNotice?.kind === 'err' ? 'alert' : 'status'} aria-live="polite" className="profile-notice">
                {aboutNotice && <p className={aboutNotice.kind === 'err' ? 'profile-error' : 'profile-ok'}>{aboutNotice.text}</p>}
                {aboutNotice?.err?.kind === 'conflict' && (
                  <button type="button" className="ui-btn" onClick={() => void load()}>
                    Tải lại bản mới nhất
                  </button>
                )}
              </div>

              <button type="submit" className="ui-btn ui-btn-primary" disabled={aboutBusy || !aboutDirty || waitSeconds > 0}>
                {aboutBusy ? 'Đang lưu…' : waitSeconds > 0 ? `Chờ ${waitSeconds}s` : 'Lưu giới thiệu'}
              </button>
            </form>
          )}

          <section className="profile-character" aria-labelledby="profile-char-title">
            <h3 id="profile-char-title" className="ui-label">
              Nhân vật trên máy chủ
            </h3>
            {cloud.corrupt && (
              <p role="alert" className="profile-error">
                Bản lưu trên máy chủ bị hỏng. Đồng bộ lại sẽ thay thế bản đó.
              </p>
            )}
            {summary ? (
              <dl className="profile-summary">
                <dt>Tên bộ</dt>
                <dd>{summary.name}</dd>
                <dt>Dáng người</dt>
                <dd>{summary.bodyStyle === 'chibi' ? 'Chibi' : 'Người trưởng thành'}</dd>
                <dt>Món trang phục</dt>
                <dd>{summary.outfitPieces}</dd>
                <dt>Hình xăm / sẹo</dt>
                <dd>
                  {summary.tattoos} / {summary.scars}
                </dd>
                <dt>Cập nhật</dt>
                <dd>{cloud.updatedAt ? new Date(cloud.updatedAt).toLocaleString('vi-VN') : 'Không rõ'}</dd>
              </dl>
            ) : (
              !cloud.corrupt && <p className="ui-hint">Chưa có nhân vật nào được lưu trên máy chủ.</p>
            )}
            {cloud.migrated && <p className="ui-hint">Bản lưu ở định dạng cũ, sẽ được nâng cấp khi bạn đồng bộ lần tới.</p>}

            <div className="profile-actions">
              <button type="button" className="ui-btn ui-btn-primary" onClick={syncCurrent} disabled={charBusy || waitSeconds > 0}>
                {charBusy ? 'Đang đồng bộ…' : waitSeconds > 0 ? `Chờ ${waitSeconds}s` : 'Đồng bộ nhân vật hiện tại lên máy chủ'}
              </button>
              {cloud.look !== null && onUseCloudLook && (
                <button type="button" className="ui-btn" onClick={useCloud} disabled={charBusy}>
                  Dùng bản trên máy chủ
                </button>
              )}
              {cloud.look !== null && (
                <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setConfirmDelete(true)} disabled={charBusy}>
                  Xóa bản trên máy chủ
                </button>
              )}
            </div>

            {confirmOverwrite && currentLook && (
              <div role="alertdialog" aria-labelledby="profile-overwrite-title" className="profile-confirm">
                <p id="profile-overwrite-title">
                  Máy chủ đã có một nhân vật khác. Ghi đè bằng nhân vật hiện tại? Bản cũ trên máy chủ sẽ mất.
                </p>
                <button type="button" className="ui-btn ui-btn-primary" onClick={() => void doUpload(cloud.revision, currentLook)}>
                  Ghi đè
                </button>
                <button type="button" className="ui-btn" onClick={() => setConfirmOverwrite(false)}>
                  Giữ bản trên máy chủ
                </button>
              </div>
            )}

            {confirmDelete && (
              <div role="alertdialog" aria-labelledby="profile-delete-title" className="profile-confirm">
                <p id="profile-delete-title">Xóa nhân vật trên máy chủ? Nhân vật cục bộ không bị ảnh hưởng.</p>
                <button type="button" className="ui-btn ui-btn-primary" onClick={() => void removeCloud()}>
                  Xóa
                </button>
                <button type="button" className="ui-btn" onClick={() => setConfirmDelete(false)}>
                  Hủy
                </button>
              </div>
            )}

            <div role={charNotice?.kind === 'err' ? 'alert' : 'status'} aria-live="polite" className="profile-notice">
              {charNotice && <p className={charNotice.kind === 'err' ? 'profile-error' : 'profile-ok'}>{charNotice.text}</p>}
              {charNotice?.err?.kind === 'conflict' && (
                <button type="button" className="ui-btn" onClick={() => void load()}>
                  Tải lại bản trên máy chủ để chọn
                </button>
              )}
            </div>
          </section>
        </>
      )}
    </aside>
  );
}
