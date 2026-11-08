import { Component, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Avatar } from '../avatar/Avatar';
import {
  ACCESSORIES,
  BODY_TYPES,
  DEFAULT_APPEARANCE,
  SKIN_TONES,
  normalizeAppearance,
} from '../avatar/appearance';
import type { Accessory, Appearance, BodyType, HairStyle, Outfit, ShoeStyle } from '../avatar/appearance';
import { ApiError, completeOnboarding, putAppearance } from '../auth/api';
import { AuthNotice, Spinner } from '../auth/AuthUi';
import { useReducedMotion } from '../settings/reducedMotion';
import { COPY } from './messages';
import {
  ACCESSORY_LIMIT,
  ACCESSORY_OPTIONS,
  BODY_LABELS,
  BOTTOM_COLORS,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_OPTIONS,
  OUTFIT_GROUPS,
  OUTFIT_OPTIONS,
  SHOE_OPTIONS,
  SKIN_LABELS,
  TOP_COLORS,
  accessoryNames,
  labelOf,
  randomAppearance,
  summarize,
  swatchLabel,
} from './creatorOptions';

const DRAFT_KEY = 'onb.appearanceDraft';
const ROTATE_STEP = 0.35;
const DRAG_SENSITIVITY = 0.012;
const UNDO_MS = 8000;
const SUMMARY_DELAY_MS = 500;

/** Bản nháp chỉ chứa appearance, không có email, tên, mật khẩu hay mã. Mọi lỗi lưu trữ đều bị bỏ qua. */
export function loadDraft(): Appearance | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return normalizeAppearance(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveDraft(value: Appearance): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(value));
  } catch {
    // Không dùng được localStorage: bản nháp chỉ còn trong bộ nhớ của trang.
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Bỏ qua.
  }
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

type Tab = 'body' | 'hair' | 'outfit' | 'acc' | 'review';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'body', label: 'Dáng và da' },
  { id: 'hair', label: 'Tóc và mắt' },
  { id: 'outfit', label: 'Trang phục' },
  { id: 'acc', label: 'Phụ kiện' },
  { id: 'review', label: 'Xem lại' },
];

interface Option<V extends string | number> {
  value: V;
  label: string;
  desc?: string;
  swatch?: string;
}

const BODY_CHOICES: readonly Option<BodyType>[] = BODY_TYPES.map((b) => ({ value: b, label: BODY_LABELS[b] }));
const SKIN_CHOICES: readonly Option<number>[] = SKIN_TONES.map((hex, i) => ({
  value: i,
  label: SKIN_LABELS[i],
  swatch: hex,
}));
const HAIR_CHOICES: readonly Option<HairStyle>[] = HAIR_OPTIONS.map((h) => ({
  value: h.id,
  label: h.label,
  desc: h.description,
}));
const HAIR_COLOR_CHOICES: readonly Option<string>[] = HAIR_COLORS.map((s) => ({
  value: s.hex,
  label: s.label,
  swatch: s.hex,
}));
const EYE_CHOICES: readonly Option<string>[] = EYE_COLORS.map((s) => ({ value: s.hex, label: s.label, swatch: s.hex }));
const TOP_CHOICES: readonly Option<string>[] = TOP_COLORS.map((s) => ({ value: s.hex, label: s.label, swatch: s.hex }));
const BOTTOM_CHOICES: readonly Option<string>[] = BOTTOM_COLORS.map((s) => ({
  value: s.hex,
  label: s.label,
  swatch: s.hex,
}));
const OUTFIT_CHOICES: readonly Option<Outfit>[] = OUTFIT_OPTIONS.map((o) => ({
  value: o.id,
  label: o.label,
  desc: o.description,
}));
const SHOE_CHOICES: readonly Option<ShoeStyle>[] = SHOE_OPTIONS.map((s) => ({
  value: s.id,
  label: s.label,
  desc: s.description,
}));

interface OptionGroupProps<V extends string | number> {
  legend: string;
  name: string;
  options: readonly Option<V>[];
  value: V;
  /** Lựa chọn mặc định, được ghi thêm "(mặc định)" trên nhãn. */
  defaultValue?: V;
  variant?: 'card' | 'swatch';
  disabled?: boolean;
  onChange: (value: V) => void;
}

/** Nhóm nút chọn một. Dùng input radio thật để có bàn phím mũi tên và nhóm đúng ngữ nghĩa. */
function OptionGroup<V extends string | number>({
  legend,
  name,
  options,
  value,
  defaultValue,
  variant = 'card',
  disabled = false,
  onChange,
}: OptionGroupProps<V>) {
  return (
    <fieldset className="onb-av-group">
      <legend>{legend}</legend>
      <div className={variant === 'swatch' ? 'onb-av-swatches' : 'onb-av-cards'}>
        {options.map((opt) => {
          const selected = opt.value === value;
          const isDefault = defaultValue !== undefined && opt.value === defaultValue;
          const classes = ['onb-av-choice'];
          if (variant === 'swatch') classes.push('onb-av-choice--swatch');
          if (selected) classes.push('is-selected');
          return (
            <label key={String(opt.value)} className={classes.join(' ')}>
              <input
                className="ui-sr-only"
                type="radio"
                name={name}
                value={String(opt.value)}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(opt.value)}
              />
              {opt.swatch && <span className="onb-av-dot" style={{ background: opt.swatch }} aria-hidden="true" />}
              <span className="onb-av-name">
                {opt.label}
                {isDefault ? ' (mặc định)' : ''}
              </span>
              {opt.desc && <span className="onb-av-desc">{opt.desc}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

interface PreviewProps {
  appearance: Appearance;
  displayName?: string;
  turn: number;
  reduceMotion: boolean;
}

/** Xem trước bằng nhân vật dự phòng (không tải VRM ở bước này). */
function Preview({ appearance, displayName, turn, reduceMotion }: PreviewProps) {
  return (
    <Canvas
      camera={{ position: [0, 0.1, 4.2], fov: 35 }}
      dpr={[1, 1.5]}
      frameloop={reduceMotion ? 'demand' : 'always'}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 4, 3]} intensity={1.1} />
      <group position={[0, -0.85, 0]} rotation={[0, turn, 0]}>
        <Avatar appearance={appearance} displayName={displayName} animation="idle" />
      </group>
    </Canvas>
  );
}

interface BoundaryProps {
  children: ReactNode;
  onRetry: () => void;
}

interface BoundaryState {
  failed: boolean;
}

/** Bắt lỗi khi dựng 3D để không làm sập cả bước tạo nhân vật. */
class PreviewBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="onb-av-fallback">
        <p>Không tải được xem trước.</p>
        <button type="button" className="ui-btn" onClick={this.props.onRetry}>
          Thử lại
        </button>
      </div>
    );
  }
}

export interface AvatarCreatorProps {
  /** Bản nháp ban đầu: bản local, rồi đến appearance trên server, rồi mặc định. */
  initial: Appearance;
  displayName?: string;
  /** Đã lưu và chuyển sang bước hướng dẫn. */
  onSaved: () => void;
  /** Phiên hết hạn (401). */
  onSessionLost: () => void;
  /** Bước trên server đã đổi (409 step_conflict). */
  onStepConflict: () => void;
}

export function AvatarCreator({ initial, displayName, onSaved, onSessionLost, onStepConflict }: AvatarCreatorProps) {
  const [draft, setDraft] = useState<Appearance>(initial);
  const [tab, setTab] = useState<Tab>('body');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [undoTo, setUndoTo] = useState<Appearance | null>(null);
  const [turn, setTurn] = useState(0);
  const [previewKey, setPreviewKey] = useState(0);
  const [announce, setAnnounce] = useState('');
  const [webgl] = useState(hasWebGL);
  const reduceMotion = useReducedMotion();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dragRef = useRef<number | null>(null);

  // Giữ bản nháp trên máy, để tải lại trang hoặc hết phiên không mất lựa chọn.
  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  // Tóm tắt bằng chữ cho trình đọc màn hình, trễ 500 ms sau khi đổi.
  useEffect(() => {
    const timer = window.setTimeout(() => setAnnounce(summarize(draft)), SUMMARY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    if (undoTo === null) return;
    const timer = window.setTimeout(() => setUndoTo(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undoTo]);

  const update = (patch: Partial<Appearance>) => {
    setUndoTo(null);
    setNotice('');
    setDraft((d) => ({ ...d, ...patch }));
  };

  const replaceAll = (next: Appearance, message: string) => {
    setUndoTo(draft);
    setDraft(next);
    setNotice(message);
  };

  const undo = () => {
    if (undoTo === null) return;
    setDraft(undoTo);
    setUndoTo(null);
    setNotice('Đã hoàn tác.');
  };

  const randomize = () => replaceAll(randomAppearance(), 'Đã chọn ngẫu nhiên. Bạn có thể chỉnh lại từng mục.');

  const reset = () =>
    replaceAll({ ...DEFAULT_APPEARANCE, accessories: [...DEFAULT_APPEARANCE.accessories] }, 'Đã khôi phục mặc định.');

  const toggleAccessory = (id: Accessory) => {
    const selected = new Set<Accessory>(draft.accessories);
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      if (selected.size >= ACCESSORY_LIMIT) return;
      selected.add(id);
    }
    update({ accessories: ACCESSORIES.filter((a) => selected.has(a)) });
  };

  const save = async (value: Appearance) => {
    setSaving(true);
    setSaveError(null);
    setUndoTo(null);
    setNotice('Đang lưu nhân vật…');
    try {
      await putAppearance(value);
      await completeOnboarding();
      clearDraft();
      onSaved();
    } catch (err) {
      setSaving(false);
      setNotice('');
      if (err instanceof ApiError && err.status === 401) {
        onSessionLost();
        return;
      }
      if (err instanceof ApiError && err.status === 409 && err.code === 'step_conflict') {
        onStepConflict();
        return;
      }
      setSaveError(err instanceof ApiError && err.status !== 0 ? err.message : COPY.saveNetwork);
    }
  };

  // Khi có mạng lại sau lỗi mạng, tự thử lưu một lần (ONBOARDING_UX mục 6.4).
  useEffect(() => {
    if (!saveError) return;
    const onOnline = () => {
      void save(draft);
    };
    window.addEventListener('online', onOnline, { once: true });
    return () => window.removeEventListener('online', onOnline);
  }, [saveError, draft]);

  const goTo = (index: number) => {
    const next = TABS[index];
    if (!next) return;
    setTab(next.id);
    tabRefs.current[index]?.focus();
  };

  const currentIndex = TABS.findIndex((t) => t.id === tab);

  const onTabKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo((currentIndex + 1) % TABS.length);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo((currentIndex - 1 + TABS.length) % TABS.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      goTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      goTo(TABS.length - 1);
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current === null) return;
    const dx = e.clientX - dragRef.current;
    dragRef.current = e.clientX;
    setTurn((t) => t + dx * DRAG_SENSITIVITY);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onPreviewKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setTurn((t) => t - ROTATE_STEP);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setTurn((t) => t + ROTATE_STEP);
    }
  };

  const reviewRows: readonly { key: string; value: string; target: Tab }[] = [
    { key: 'Dáng', value: BODY_LABELS[draft.bodyType], target: 'body' },
    { key: 'Màu da', value: `Tông ${draft.skinTone + 1}`, target: 'body' },
    {
      key: 'Tóc',
      value: `${labelOf(HAIR_OPTIONS, draft.hairStyle)}, ${swatchLabel(HAIR_COLORS, draft.hairColor)}`,
      target: 'hair',
    },
    { key: 'Trang phục', value: labelOf(OUTFIT_OPTIONS, draft.outfit), target: 'outfit' },
    {
      key: 'Phụ kiện',
      value: draft.accessories.length > 0 ? accessoryNames(draft.accessories) : 'Không có',
      target: 'acc',
    },
  ];

  return (
    <div className="onb-av">
      <div className="ui-actions">
        <button type="button" className="ui-btn" onClick={randomize} disabled={saving}>
          Ngẫu nhiên
        </button>
        <button type="button" className="ui-btn" onClick={reset} disabled={saving}>
          Khôi phục mặc định
        </button>
        <button
          type="button"
          className="ui-btn"
          onClick={() => void save(DEFAULT_APPEARANCE)}
          disabled={saving}
        >
          Bỏ qua, dùng mặc định
        </button>
      </div>

      <div className="onb-av-grid">
        <div className="onb-av-preview">
          <div
            className="onb-av-canvas"
            role="group"
            tabIndex={0}
            aria-label="Xem trước nhân vật. Kéo chuột hoặc dùng phím mũi tên trái và phải để xoay."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onPreviewKey}
          >
            {webgl ? (
              <PreviewBoundary key={previewKey} onRetry={() => setPreviewKey((k) => k + 1)}>
                <Preview appearance={draft} displayName={displayName} turn={turn} reduceMotion={reduceMotion} />
              </PreviewBoundary>
            ) : (
              <p className="onb-av-fallback">
                Không hiển thị được xem trước 3D. Bạn vẫn có thể chọn và lưu nhân vật.
              </p>
            )}
          </div>
          <div className="ui-actions">
            <button type="button" className="ui-btn" onClick={() => setTurn((t) => t - ROTATE_STEP)}>
              Xoay trái
            </button>
            <button type="button" className="ui-btn" onClick={() => setTurn((t) => t + ROTATE_STEP)}>
              Xoay phải
            </button>
            <button type="button" className="ui-btn" onClick={() => setTurn(0)}>
              Đặt lại góc nhìn
            </button>
          </div>
        </div>

        <div className="onb-av-panel">
          <div className="ui-tabs onb-av-tabs" role="tablist" aria-label="Các mục chỉnh nhân vật" onKeyDown={onTabKeyDown}>
            {TABS.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                id={`onb-tab-${t.id}`}
                type="button"
                role="tab"
                className="ui-tab"
                aria-selected={tab === t.id}
                aria-controls="onb-tabpanel"
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="ui-label onb-av-select">
            <span>Mục đang chỉnh</span>
            <select className="ui-input" value={tab} onChange={(e) => setTab(e.target.value as Tab)}>
              {TABS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <div className="onb-av-body" role="tabpanel" id="onb-tabpanel" aria-labelledby={`onb-tab-${tab}`}>
            {tab === 'body' && (
              <>
                <OptionGroup<BodyType>
                  legend="Kiểu dáng"
                  name="onb-body"
                  options={BODY_CHOICES}
                  value={draft.bodyType}
                  defaultValue={DEFAULT_APPEARANCE.bodyType}
                  disabled={saving}
                  onChange={(v) => update({ bodyType: v })}
                />
                <p className="ui-hint">Chỉ thay đổi ngoại hình trong văn phòng.</p>
                <OptionGroup<number>
                  legend="Màu da"
                  name="onb-skin"
                  options={SKIN_CHOICES}
                  value={draft.skinTone}
                  variant="swatch"
                  disabled={saving}
                  onChange={(v) => update({ skinTone: v })}
                />
              </>
            )}

            {tab === 'hair' && (
              <>
                <OptionGroup<HairStyle>
                  legend="Kiểu tóc"
                  name="onb-hair"
                  options={HAIR_CHOICES}
                  value={draft.hairStyle}
                  defaultValue={DEFAULT_APPEARANCE.hairStyle}
                  disabled={saving}
                  onChange={(v) => update({ hairStyle: v })}
                />
                <OptionGroup<string>
                  legend="Màu tóc"
                  name="onb-hair-color"
                  options={HAIR_COLOR_CHOICES}
                  value={draft.hairColor}
                  defaultValue={DEFAULT_APPEARANCE.hairColor}
                  variant="swatch"
                  disabled={saving}
                  onChange={(v) => update({ hairColor: v })}
                />
                <OptionGroup<string>
                  legend="Màu mắt"
                  name="onb-eye"
                  options={EYE_CHOICES}
                  value={draft.eyeColor}
                  defaultValue={DEFAULT_APPEARANCE.eyeColor}
                  variant="swatch"
                  disabled={saving}
                  onChange={(v) => update({ eyeColor: v })}
                />
              </>
            )}

            {tab === 'outfit' && (
              <>
                {OUTFIT_GROUPS.map((group) => (
                  <OptionGroup<Outfit>
                    key={group.label}
                    legend={group.label}
                    name="onb-outfit"
                    options={OUTFIT_CHOICES.filter((o) => group.ids.includes(o.value))}
                    value={draft.outfit}
                    defaultValue={DEFAULT_APPEARANCE.outfit}
                    disabled={saving}
                    onChange={(v) => update({ outfit: v })}
                  />
                ))}
                <OptionGroup<string>
                  legend="Màu áo"
                  name="onb-top"
                  options={TOP_CHOICES}
                  value={draft.topColor}
                  defaultValue={DEFAULT_APPEARANCE.topColor}
                  variant="swatch"
                  disabled={saving}
                  onChange={(v) => update({ topColor: v })}
                />
                <OptionGroup<string>
                  legend="Màu quần, váy"
                  name="onb-bottom"
                  options={BOTTOM_CHOICES}
                  value={draft.bottomColor}
                  defaultValue={DEFAULT_APPEARANCE.bottomColor}
                  variant="swatch"
                  disabled={saving}
                  onChange={(v) => update({ bottomColor: v })}
                />
                <OptionGroup<ShoeStyle>
                  legend="Giày"
                  name="onb-shoes"
                  options={SHOE_CHOICES}
                  value={draft.shoes}
                  defaultValue={DEFAULT_APPEARANCE.shoes}
                  disabled={saving}
                  onChange={(v) => update({ shoes: v })}
                />
              </>
            )}

            {tab === 'acc' && (
              <fieldset className="onb-av-group">
                <legend>Phụ kiện</legend>
                <p className="ui-hint">
                  Đã chọn {draft.accessories.length} trên {ACCESSORY_LIMIT}.
                  {draft.accessories.length >= ACCESSORY_LIMIT
                    ? ' Đã chọn tối đa 6 phụ kiện. Bỏ chọn một mục để thêm mục khác.'
                    : ''}
                </p>
                <div className="onb-av-cards">
                  {ACCESSORY_OPTIONS.map((item) => {
                    const checked = draft.accessories.includes(item.id);
                    const blocked = !checked && draft.accessories.length >= ACCESSORY_LIMIT;
                    const classes = `onb-av-choice${checked ? ' is-selected' : ''}${blocked ? ' is-disabled' : ''}`;
                    return (
                      <label key={item.id} className={classes}>
                        <input
                          className="ui-sr-only"
                          type="checkbox"
                          checked={checked}
                          disabled={blocked || saving}
                          onChange={() => toggleAccessory(item.id)}
                        />
                        <span className="onb-av-name">{item.label}</span>
                        <span className="onb-av-desc">{item.description}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {tab === 'review' && (
              <ul className="onb-av-review">
                {reviewRows.map((row) => (
                  <li key={row.key} className="onb-av-row">
                    <span>
                      <span className="onb-av-key">{row.key}: </span>
                      <span>{row.value}</span>
                    </span>
                    <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setTab(row.target)}>
                      Sửa<span className="ui-sr-only"> {row.key}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="onb-av-inline">
            <AuthNotice tone="info" text={notice} />
            {undoTo !== null && (
              <button type="button" className="ui-btn ui-btn-ghost" onClick={undo}>
                Hoàn tác
              </button>
            )}
          </div>

          <AuthNotice tone="error" text={saveError} />
          {saveError && (
            <div className="ui-actions">
              <button
                type="button"
                className="ui-btn ui-btn-primary"
                disabled={saving}
                onClick={() => void save(draft)}
              >
                Thử lưu lại
              </button>
            </div>
          )}

          <div className="onb-av-nav">
            {currentIndex > 0 ? (
              <button type="button" className="ui-btn" onClick={() => goTo(currentIndex - 1)}>
                Quay lại
              </button>
            ) : (
              <span />
            )}
            {tab !== 'review' ? (
              <button type="button" className="ui-btn ui-btn-primary" onClick={() => goTo(currentIndex + 1)}>
                Tiếp tục
              </button>
            ) : (
              <button
                type="button"
                className="ui-btn ui-btn-primary"
                disabled={saving}
                onClick={() => void save(draft)}
              >
                {saving && <Spinner />}
                {saving ? 'Đang xử lý…' : 'Lưu nhân vật và tiếp tục'}
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="ui-sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
