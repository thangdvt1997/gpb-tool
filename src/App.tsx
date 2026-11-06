import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ITOffice } from './scene/ITOffice';
import { InteractionHelp, InteractionHud } from './scene/interact';
import { HelpLayer, HelpReplayButton } from './help';
import { Minimap } from './minimap';
import { SpatialAudioListener } from './audio/spatial';
import { QualityPicker, clampDpr, useQuality } from './quality';
import { PerfOverlay, PerfProbe } from './perf';
import { EditorLayer, EditorPanel, LayoutEditorHost } from './editor';
import { audioZoneAt, audioZoneRects } from './scene/audioZones';
import { LiveRegion, announce } from './a11y';
import { QuickWheel, useQuickHost } from './emotes/quick';
import { PhotoPanel, PhotoScene } from './photo/PhotoMode';
import { createPersistManager } from './persist';
import { appearanceToLook } from './fashion/migrate';
import { DEFAULT_APPEARANCE } from './avatar/appearance';
import type { CharacterLook } from './fashion/types';
import { PLANT_IDS } from './scene/itFixtures';
import { Panel } from './ui/Panel';
import { DisplayPanel } from './ui/DisplayPanel';
import { PlantPanel } from './ui/PlantPanel';
import itZone from './content/zones/it.json';
import type { Role, ZoneDef } from './content/types';
import { ApiError, getOnboarding, getPreferences, getSession, logout } from './auth/api';
import type { AuthUser, Session } from './auth/api';
import { AuthScreen } from './auth/AuthScreen';
import { OnboardingWizard } from './onboarding/OnboardingWizard';
import type { WizardStart } from './onboarding/OnboardingWizard';
import type { Appearance } from './avatar/appearance';
import { DisplayProvider, isBoardId, isTvId } from './display';
import { LayoutProvider } from './layout';
import { CARE_ROLES, PlantToolbar } from './plants';
import type { PlantTool } from './plants';
import { useTheme } from './theme/ThemeProvider';
import type { ThemeName } from './theme/tokens';
import type { PartyTheme } from './env';
import { DuelPanel } from './duel/DuelPanel';
import { DuelBanner } from './duel/DuelBanner';
import { getActiveDuel } from './duel/api';
import type { Duel } from './duel/types';
import { EmotePanel } from './ui/EmotePanel';
import { useEmoteHotkeys } from './emotes/useEmoteHotkeys';
import './hud.css';

const zone = itZone as unknown as ZoneDef;
// Thư viện asset (TASK 18) nạp lười: AssetViewer kéo theo GLTFLoader.
const LibraryPanel = lazy(() => import('./library').then((m) => ({ default: m.LibraryPanel })));
const audioRects = audioZoneRects(zone.objects);

const ROLE_LABEL: Record<Role, string> = {
  employee: 'Nhân viên',
  it: 'Nhân viên IT',
  moderator: 'Kiểm duyệt viên',
  admin: 'Admin IT',
};

type Phase = 'checking' | 'anonymous' | 'onboarding' | 'authenticated' | 'error';

/** Chọn bước của wizard theo bước server đang giữ (ONBOARDING_UX mục 9). */
function startFromSession(session: Session): WizardStart {
  const step = session.onboardingStep === 'password' ? 'password' : session.onboardingStep === 'appearance' ? 'avatar' : 'welcome';
  return {
    step,
    email: session.user.email,
    name: session.user.name,
    resendInSeconds: null,
    user: session.user,
    appearance: session.appearance,
  };
}

/** Theme có trang trí lễ hội thì vẽ trang trí đó. Các theme còn lại không vẽ gì. */
function partyOf(theme: ThemeName): PartyTheme {
  return theme === 'tet' || theme === 'midautumn' || theme === 'party' ? theme : 'none';
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const [start, setStart] = useState<WizardStart | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  /** Đã có phiên đầy đủ: vào văn phòng nếu onboarding xong, nếu không thì mở wizard đúng bước. */
  const enterSession = (session: Session) => {
    setNotice(null);
    if (session.onboardingStep === 'done') {
      setUser(session.user);
      setAppearance(session.appearance);
      setPhase('authenticated');
    } else {
      setStart(startFromSession(session));
      setPhase('onboarding');
    }
  };

  // Khi mở app: có phiên đầy đủ thì vào tiếp, chỉ có phiên tạm (osid) thì tiếp tục đặt mật khẩu, không có gì thì màn đăng nhập.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const session = await getSession();
        if (!alive) return;
        if (session.onboardingStep === 'done') {
          setUser(session.user);
          setAppearance(session.appearance);
          setPhase('authenticated');
        } else {
          setStart(startFromSession(session));
          setPhase('onboarding');
        }
      } catch (err) {
        if (!alive) return;
        if (!(err instanceof ApiError) || err.status !== 401) {
          setPhase('error');
          return;
        }
        if (err.code === 'onboarding_session') {
          try {
            const ob = await getOnboarding();
            if (!alive) return;
            if (ob.email) {
              setStart({ step: 'password', email: ob.email, name: '', resendInSeconds: null, user: null, appearance: null });
              setPhase('onboarding');
              return;
            }
          } catch {
            if (!alive) return;
          }
        }
        setPhase('anonymous');
      }
    })();
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (phase === 'authenticated' && user) {
    return (
      <Workspace
        user={user}
        appearance={appearance}
        onLoggedOut={() => {
          setUser(null);
          setAppearance(null);
          setStart(null);
          setPhase('anonymous');
        }}
      />
    );
  }

  if (phase === 'onboarding' && start) {
    return (
      <OnboardingWizard
        start={start}
        onFinished={(u) => {
          setUser(u);
          setStart(null);
          setPhase('authenticated');
          // Wizard không trả về ngoại hình, nên lấy lại từ phiên sau khi xong onboarding.
          void getSession()
            .then((s) => setAppearance(s.appearance))
            .catch(() => setAppearance(null));
        }}
        onExit={(email, message) => {
          setLoginEmail(email);
          setNotice(message ?? null);
          setStart(null);
          setPhase('anonymous');
        }}
      />
    );
  }

  if (phase === 'anonymous') {
    return (
      <AuthScreen
        initialEmail={loginEmail}
        notice={notice}
        onAuthenticated={enterSession}
        onNeedVerification={(email, resendInSeconds) => {
          setNotice(null);
          setStart({ step: 'otp', email, name: '', resendInSeconds, user: null, appearance: null });
          setPhase('onboarding');
        }}
        onStartRegister={(email) => {
          setNotice(null);
          setStart({ step: 'name', email, name: '', resendInSeconds: null, user: null, appearance: null });
          setPhase('onboarding');
        }}
      />
    );
  }

  if (phase === 'error') {
    return (
      <div className="app-error" role="alert">
        <p>Không kiểm tra được phiên đăng nhập. Kiểm tra kết nối rồi thử lại.</p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setPhase('checking');
            setAttempt((n) => n + 1);
          }}
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div className="app-status" role="status">
      Đang tải…
    </div>
  );
}

interface WorkspaceProps {
  user: AuthUser;
  appearance: Appearance | null;
  onLoggedOut: () => void;
}

function Workspace({ user, appearance, onLoggedOut }: WorkspaceProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [plantTool, setPlantTool] = useState<PlantTool | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [duelOpen, setDuelOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [activeDuel, setActiveDuel] = useState<Duel | null>(null);
  const [reactBump, setReactBumpState] = useState(true);
  const pollSeq = useRef(0);
  const { theme } = useTheme();
  useEmoteHotkeys(!emoteOpen && !duelOpen);
  const getQuickContext = useQuickHost();
  const [libraryOpen, setLibraryOpen] = useState(false);
  // Chất lượng đồ họa (TASK 13) + đo khung (TASK 08): PerfProbe đẩy mẫu vào bộ tự thích nghi.
  const quality = useQuality();
  const dprCap = clampDpr(typeof window === 'undefined' ? 1 : window.devicePixelRatio, quality.config.dprCap);

  // Look của nhân vật: suy ra từ ngoại hình trên máy chủ, rồi bị bản lưu cục bộ (src/persist) ghi đè nếu có.
  const [look, setLook] = useState<CharacterLook>(() => appearanceToLook(appearance ?? DEFAULT_APPEARANCE).look);
  const lookRef = useRef(look);
  lookRef.current = look;
  useEffect(() => {
    if (appearance) setLook(appearanceToLook(appearance).look);
  }, [appearance]);

  // Lưu và khôi phục trạng thái (TASK 06). Bố cục vật do máy chủ giữ (LayoutProvider) nên không lưu cục bộ;
  // vị trí nhân vật chưa khôi phục vì Player chỉ đọc spawn khi mount (chuỗi ghi danh quyết định spawn).
  const persist = useMemo(
    () =>
      createPersistManager(
        { getLook: () => lookRef.current, getLayoutOverrides: () => ({}), getColliders: () => [] },
        {
          applyLook: setLook,
          applyLayoutOverrides: () => undefined,
          placeCharacter: () => undefined,
        },
      ),
    [],
  );
  useEffect(() => {
    const off = persist.attach();
    void persist.loadSnapshot().then((r) => {
      if (!r.ok) announce(`Không khôi phục được bản lưu: ${r.error}`, 'assertive');
    });
    return off;
  }, [persist]);

  /** Hỏi trận đang diễn ra. Bỏ kết quả cũ nếu đã có lần hỏi mới hơn. */
  const pollDuel = useCallback(async () => {
    const seq = ++pollSeq.current;
    const r = await getActiveDuel();
    if (seq !== pollSeq.current || !r.ok) return;
    setActiveDuel(r.data);
  }, []);

  // Poll mỗi 3 giây, chỉ khi tab hiển thị; tab ẩn thì dừng, hiện lại thì hỏi ngay.
  useEffect(() => {
    let timer: number | null = null;
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    const sync = () => {
      if (document.visibilityState === 'visible') {
        if (timer === null) {
          void pollDuel();
          timer = window.setInterval(() => void pollDuel(), 3000);
        }
      } else {
        stop();
      }
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      stop();
      pollSeq.current++;
    };
  }, [pollDuel]);

  // Đọc tùy chọn phản ứng va chạm một lần khi đăng nhập. Lỗi thì giữ mặc định bật.
  useEffect(() => {
    let alive = true;
    getPreferences()
      .then((p) => {
        if (alive) setReactBumpState(p.reactBump);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user.id]);

  const selectedObj = zone.objects.find((o) => o.id === selected) ?? null;
  // Tivi và bảng vẽ không nằm trong it.json, nên panel của chúng được chọn theo id.
  const displayKind = selected !== null && isTvId(selected) ? 'tv' : selected !== null && isBoardId(selected) ? 'board' : null;
  const selectedPlant = selected !== null && PLANT_IDS.includes(selected) ? selected : null;
  const canCare = CARE_ROLES.includes(user.role);
  const tenantLabel = user.tenant.type === 'personal' ? 'Tài khoản cá nhân' : user.tenant.name;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
      onLoggedOut();
    } catch (err) {
      setLoggingOut(false);
      const msg = err instanceof ApiError ? err.message : 'Không đăng xuất được. Thử lại.';
      setLogoutError(msg);
      announce(msg, 'assertive');
    }
  };

  return (
    <DisplayProvider>
      <LayoutProvider>
        <LayoutEditorHost objects={zone.objects} role={user.role}>
        {(editor) => (
        <div className="app">
          <header className="topbar">
            <div className="topbar-title">
              <strong>Test App</strong> · {zone.name}
            </div>
            <div className="topbar-user">
              <div className="topbar-who">
                <span className="topbar-email" title={user.email}>
                  {user.email}
                </span>
                <span className="muted small">
                  {tenantLabel} · Vai trò: {ROLE_LABEL[user.role]}
                </span>
                {logoutError && (
                  <span className="topbar-error" role="alert">
                    {logoutError}
                  </span>
                )}
              </div>
              <button type="button" className="btn btn-ghost" onClick={handleLogout} disabled={loggingOut}>
                {loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
              </button>
            </div>
          </header>

          <Canvas
            shadows={quality.config.shadows}
            dpr={[1, dprCap]}
            camera={{ position: [0, 7, 16], fov: 50 }}
            onPointerMissed={() => setSelected(null)}
          >
            <ITOffice
              zone={zone}
              selected={editor.state.active ? editor.state.selectedId : selected}
              onSelect={(id) => {
                // Chế độ sắp xếp (TASK 17): bấm vào vật để nhấc lên, vật theo con trỏ tới lần thả.
                if (editor.state.active) {
                  if (id !== null) {
                    editor.dispatch({ type: 'select', id });
                    editor.dispatch({ type: 'dragStart' });
                  }
                  return;
                }
                setSelected(id);
              }}
              lightTheme={theme}
              theme={partyOf(theme)}
              appearance={appearance ?? undefined}
              look={look}
              plantTool={canCare ? plantTool : null}
              userName={user.name}
              role={user.role}
              userId={user.id}
              duel={activeDuel}
              reactBump={reactBump}
            />
            <PhotoScene />
            <SpatialAudioListener getZone={(x, z) => audioZoneAt(audioRects, x, z)} />
            <PerfProbe adaptive={quality.adaptive} onQualityChange={quality.onChange} />
            <EditorLayer state={editor.state} dispatch={editor.dispatch} />
          </Canvas>
          <PerfOverlay />
          <Minimap zone={zone} role={user.role} plants={partyOf(theme) !== 'none'} />

          <footer className="hint">W S A D di chuyển · Giữ chuột phải để xoay · Chuột trái để đi tới · E để dùng vật · Esc đóng · Dữ liệu là mẫu (mock)</footer>
          <InteractionHelp />
          <InteractionHud />
          <HelpLayer />
          <HelpReplayButton />
          <LiveRegion />
          <QuickWheel getContext={getQuickContext} enabled={!duelOpen && !emoteOpen} />
          <PhotoPanel />

          {selectedObj && <Panel obj={selectedObj} role={user.role} onClose={() => setSelected(null)} />}
          {displayKind !== null && selected !== null && (
            <DisplayPanel kind={displayKind} id={selected} role={user.role} onClose={() => setSelected(null)} />
          )}
          {selectedPlant !== null && (
            <PlantPanel
              plantId={selectedPlant}
              role={user.role}
              currentTool={plantTool}
              onToolChange={setPlantTool}
              onClose={() => setSelected(null)}
            />
          )}
          <nav className="ui-hud" data-hud aria-label="Thi đấu và biểu cảm">
            <button
              type="button"
              className="ui-hud-chip"
              aria-label="Thi đấu"
              aria-haspopup="dialog"
              aria-expanded={duelOpen}
              onClick={() => setDuelOpen((v) => !v)}
            >
              <span aria-hidden="true" className="ui-hud-chip-icon">⚔</span>
              <span className="ui-hud-chip-label">Thi đấu</span>
            </button>
            <button
              type="button"
              className="ui-hud-chip"
              aria-label="Biểu cảm"
              aria-haspopup="dialog"
              aria-expanded={emoteOpen}
              onClick={() => setEmoteOpen((v) => !v)}
            >
              <span aria-hidden="true" className="ui-hud-chip-icon">☺</span>
              <span className="ui-hud-chip-label">Biểu cảm</span>
            </button>
          </nav>
          {activeDuel && (
            <div className="hud-duel">
              <DuelBanner duel={activeDuel} currentUserId={user.id} onChange={() => void pollDuel()} />
            </div>
          )}
          {duelOpen && (
            <div className="hud-duel-panel">
              <DuelPanel
                currentUserId={user.id}
                onClose={() => setDuelOpen(false)}
                onDuelStart={() => void pollDuel()}
              />
            </div>
          )}
          {emoteOpen && (
            <EmotePanel
              onClose={() => setEmoteOpen(false)}
              onReactBumpChange={setReactBumpState}
            />
          )}
          {canCare && <PlantToolbar tool={plantTool} onToolChange={setPlantTool} />}
          <aside className="hud-tools" aria-label="Công cụ">
            <QualityPicker settings={quality.settings} onChange={quality.setSettings} level={quality.level} />
            <button type="button" className="btn btn-ghost" aria-expanded={libraryOpen} onClick={() => setLibraryOpen((v) => !v)}>
              Thư viện
            </button>
            {(user.role === 'it' || user.role === 'admin') && (
              <EditorPanel state={editor.state} dispatch={editor.dispatch} onSave={() => void editor.save()} />
            )}
          </aside>
          {libraryOpen && (
            <Suspense fallback={null}>
              <LibraryPanel onClose={() => setLibraryOpen(false)} />
            </Suspense>
          )}
        </div>
        )}
        </LayoutEditorHost>
      </LayoutProvider>
    </DisplayProvider>
  );
}
