import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import type { Role, ZoneDef, ZoneObject } from '../content/types';
import { getMyCheckin } from '../checkin/api';
import { setCheckinBoardStatus } from '../env';
import {
  ENTRY_DROP,
  ENTRY_FIXTURE_IDS,
  EntryFixtures,
  EntrySequence,
  MOD_DESK_ID,
  entryBlockers,
  prefersReducedMotion,
  rig,
  useArrivalChime,
  type EntryResult,
} from './entry';
import type { AmbientZone } from '../audio/engine';
import type { Appearance } from '../avatar/appearance';
import type { CharacterLook } from '../fashion/types';
import { useServices } from '../data/useServices';
import { decorBlockersOf, DeskDecorField, PartyDecor, zoneDecorOf, type PartyTheme } from '../env';
import { LIGHT_PRESETS, type ThemeName } from '../lighting/presets';
import { OptionalBloom } from '../lighting/postfx';
import { ZoneLights, type LightZone } from '../lighting/rigs';
import { AmbientAudio } from './AmbientAudio';
import { Corridors } from './Corridors';
import { LoungeLink, NorthCorridor } from './corridors';
import { audioZoneAt, audioZoneRects } from './audioZones';
import { DeskField } from './Desks';
import { NocTiles } from './NocWall';
import { DecorBoxes, InstancedBoxes, ObjectBoxes, type BoxItem } from './InstancedBoxes';
import { Floorplan } from './Floorplan';
import { Player } from './Player';
import { SceneContext, stateOf, type ObjState, type SceneState } from './context';
import { collisionRects, labelY, partsOf, toWorldX, toWorldZ, type Part, type V3 } from './layout';
import { isObjectInOffice } from './officeBounds';
import { BOARD_IDS, TV_IDS, TvScreen, WhiteboardScreen } from '../display';
import { carePlantAndSync, PlantMesh, TOOL_ACTION, usePlants } from '../plants';
import type { PlantTool } from '../plants';
import { BOARD_FIXTURES, PLANT_SPOTS, TV_FIXTURES } from './itFixtures';
import { OFFICE_PROP_SHADOWS } from './officePropsLayout';
import { CityView } from '../window';
import type { Duel } from '../duel/types';
import { DuelLayer, useSelfId } from './social/DuelLayer';
import { SocialLayer } from './social/SocialLayer';
import { createSocialWorld } from './social/world';
import { InteractionLayer, useInteractionSelect } from './interact';

interface Props {
  zone: ZoneDef;
  selected: string | null;
  onSelect: (id: string) => void;
  /** Trang trí lễ hội. Mặc định 'none' (không vẽ gì, và không vẽ cây cảnh). Đặt trên khu dự phòng. */
  theme?: PartyTheme;
  /** Chủ đề ánh sáng. Mặc định 'office-day'. */
  lightTheme?: ThemeName;
  /** Ngoại hình nhân vật người chơi. Không truyền thì dùng DEFAULT_APPEARANCE. */
  appearance?: Appearance;
  /** Ngoại hình fashion của người chơi (mô hình MPFB). */
  look?: CharacterLook | null;
  /** Bật âm nền. Âm chỉ phát sau thao tác của người dùng. Mặc định false. */
  audioEnabled?: boolean;
  /** Dụng cụ chăm cây đang chọn. Có dụng cụ thì bấm cây là chăm, không thì bấm cây là mở panel. Mặc định null. */
  plantTool?: PlantTool | null;
  /** Tên người đang đăng nhập, in trên huy hiệu trong chuỗi cảnh ghi danh. */
  userName?: string;
  /** Vai trò người đang đăng nhập. Vật thể chỉ dành cho vai trò khác (bàn kiểm duyệt) bị ẩn. */
  role?: Role;
  /** id người đăng nhập. Không truyền thì hỏi /api/auth/me một lần. */
  userId?: string;
  /**
   * Trận đang diễn ra nếu HUD đã poll sẵn (App.tsx). Truyền (kể cả null) thì ITOffice không poll thêm.
   * Bỏ trống thì ITOffice tự poll mỗi 3 giây khi tab hiển thị.
   */
  duel?: Duel | null;
  /** Tùy chọn phản ứng khi bị va của chính người dùng. Không truyền thì mặc định bật. */
  reactBump?: boolean;
}

/**
 * Trạng thái vào tầng. loading: đang hỏi getMyCheckin(). sequence: chạy chuỗi cảnh ghi danh.
 * done: người chơi điều khiển được, xuất hiện tại spawn.
 */
type EntryState =
  | { kind: 'loading' }
  | { kind: 'sequence' }
  | { kind: 'done'; spawn?: { x: number; z: number; rotY?: number } };

/** Vật thể chỉ hiện với người có vai trò trong roles (người khác không thấy, không bấm được). */
const ROLE_GATED_IDS: ReadonlySet<string> = new Set([MOD_DESK_ID]);

const LIGHT_ZONES: readonly LightZone[] = ['office', 'lounge', 'game', 'karaoke', 'events', 'meeting', 'server', 'soc'];

/**
 * Cụm đèn trong rigs.tsx viết theo tọa độ bản vẽ. Ba khu game, karaoke, events được rigs đặt tạm ở khu dự phòng,
 * nên cụm đèn được dời tới vật thể thật trong it.json. ref là tâm cụm đèn (bản vẽ), target là id vật thể.
 */
const LIGHT_SHIFT: Partial<Record<LightZone, { ref: [number, number]; target: string }>> = {
  game: { ref: [17.5, 7.5], target: 'games_corner' },
  karaoke: { ref: [23, 6.7], target: 'karaoke_room' },
  events: { ref: [27.4, 4.6], target: 'events_board' },
};

const ZERO: V3 = [0, 0, 0];

/**
 * Cảnh thành phố ngoài cửa kính Đông-Nam. Gốc CityView nằm dưới góc kính bên ngoài, tại góc Đông-Nam của sàn
 * (world (29, 0, 15), sàn 58 x 30 m). Trục -Z của CityView hướng ra ngoài, nên quay -3π/4 để hướng về phía Đông-Nam.
 */
const CITY_ORIGIN: V3 = [29, 0, 15];
const CITY_ROTATION_Y = (-3 * Math.PI) / 4;

/** Mảnh phẳng sát sàn (cao không quá 5 cm) luôn giữ lại, vì decor không vẽ sàn. */
const FLAT_MAX_HEIGHT = 0.05;
const HIGHLIGHT_Y = 0.04;
const ACTIVE_HIGHLIGHT = '#4f8cff';

/**
 * Nền sáng dưới vật thể có decor khi đang rê chuột hoặc chọn.
 * Vật thể có decor không còn khối hộp để đổi màu, nên cần lớp này để giữ phản hồi trực quan.
 */
function DecorHighlight({ obj, state }: { obj: ZoneObject; state: ObjState }) {
  const [w, , d] = obj.size;
  const active = state === 'active';
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[obj.position[0], HIGHLIGHT_Y, obj.position[2]]}>
      <planeGeometry args={[w + 0.3, d + 0.3]} />
      <meshBasicMaterial
        color={active ? ACTIVE_HIGHLIGHT : '#ffffff'}
        transparent
        opacity={active ? 0.6 : 0.25}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * Cây chăm sóc (services/plants). Dữ liệu đọc qua usePlants (kho dùng chung, không gọi thêm mạng).
 * Cây không có trong danh sách server thì không vẽ. Cây luôn vẽ, không phụ thuộc theme.
 */
function PlantFixtures({
  selected,
  tool,
  onSelect,
}: {
  selected: string | null;
  tool: PlantTool | null;
  onSelect: (id: string) => void;
}) {
  const { plants } = usePlants();
  return (
    <>
      {plants.map((plant) => {
        const spot = PLANT_SPOTS[plant.id];
        if (!spot) return null;
        return (
          <PlantMesh
            key={plant.id}
            plant={plant}
            position={spot}
            selected={selected === plant.id}
            onClick={(id) => {
              // Đang cầm dụng cụ thì bấm cây là chăm cây. Không thì mở panel của cây.
              if (tool) void carePlantAndSync(id, TOOL_ACTION[tool]);
              else onSelect(id);
            }}
          />
        );
      })}
    </>
  );
}

/**
 * Khối CNTT theo mặt bằng (xem docs/FLOORPLAN_IT.md).
 * Mọi vật thể đi qua cùng một SceneContext để chọn và rê chuột đồng nhất.
 *
 * Quy tắc vẽ: vật thể có decor (bàn, quầy, lounge, pantry, phòng và các khu khác) được vẽ bằng decor.
 * Khối hộp của nó bị bỏ, chỉ giữ mảnh kính và mảnh phẳng sát sàn. Bàn được gom vào DeskDecorField cho cả khu.
 * Vật thể có decor nhận một lớp chọn vô hình để vẫn bấm và rê được.
 *
 * Quy tắc va chạm: vật thể đặc chặn theo footprint của chính nó (it.json). Lounge và pantry chặn theo
 * ô do decor tạo ra (decorBlockersOf), nên đồ đạc chặn đúng chỗ đồ đạc được vẽ.
 */
export function ITOffice({
  zone: fullZone,
  selected,
  onSelect,
  theme = 'none',
  lightTheme = 'office-day',
  appearance,
  look,
  audioEnabled = false,
  plantTool = null,
  userName = '',
  role,
  userId,
  duel,
  reactBump,
}: Props) {
  // Ẩn vật thể chỉ dành cho vai trò khác (bàn kiểm duyệt chỉ moderator và admin thấy).
  // Chỉ dựng vật thể có footprint nằm trọn trong chữ L (officeBounds.ts, isObjectInOffice); vật khác không dựng,
  // không va chạm, không tương tác. Dữ liệu it.json giữ nguyên. Lối vào tầng 7 đã nằm trong L, không có ngoại lệ.
  const zone = useMemo<ZoneDef>(
    () => ({
      ...fullZone,
      objects: fullZone.objects.filter(
        (o) => isObjectInOffice(o) && (!ROLE_GATED_IDS.has(o.id) || (role !== undefined && o.roles.includes(role))),
      ),
    }),
    [fullZone, role],
  );
  const { services } = useServices();

  // Sổ va chạm, thi đấu, NPC của cảnh. Dựng một lần; useFrame đọc và ghi tại chỗ.
  const world = useMemo(createSocialWorld, []);
  const selfId = useSelfId(userId);
  useEffect(() => {
    if (selfId === null || reactBump === undefined) return undefined;
    world.reactBump.set(selfId, reactBump);
    return () => {
      world.reactBump.delete(selfId);
    };
  }, [world, selfId, reactBump]);

  // Ghi danh cổng tầng 7: chưa ghi danh hôm nay thì chạy chuỗi cảnh, đã ghi danh thì xuất hiện thẳng ở sảnh.
  // Lỗi khi hỏi trạng thái cũng cho vào thẳng: ghi danh không chặn truy cập.
  const [entry, setEntry] = useState<EntryState>({ kind: 'loading' });
  const arrival = useArrivalChime(entry.kind === 'done');

  const refreshBoard = useCallback(async () => {
    const r = await getMyCheckin();
    if (r.ok) setCheckinBoardStatus({ checkedIn: r.data.checkedIn, at: r.data.checkin?.at });
    else setCheckinBoardStatus({ checkedIn: false, at: undefined });
    return r;
  }, []);

  useEffect(() => {
    rig.snap = prefersReducedMotion();
    let alive = true;
    void refreshBoard().then((r) => {
      if (!alive) return;
      setEntry(r.ok && !r.data.checkedIn ? { kind: 'sequence' } : { kind: 'done' });
    });
    return () => {
      alive = false;
    };
  }, [refreshBoard]);

  useEffect(() => {
    setCheckinBoardStatus({ theme: lightTheme });
  }, [lightTheme]);

  const onEntryFinish = useCallback(
    (result: EntryResult) => {
      setEntry({ kind: 'done', spawn: ENTRY_DROP });
      if (result === 'checked') arrival.rebase();
      // Đọc lại trạng thái thật: bỏ qua giữa lúc quét thì máy chủ vẫn có thể đã ghi danh.
      void refreshBoard();
    },
    [arrival, refreshBoard],
  );
  const [hovered, setHovered] = useState<string | null>(null);
  const [audioZone, setAudioZone] = useState<AmbientZone>('office');
  const audioZoneRef = useRef<AmbientZone>('office');

  const preset = LIGHT_PRESETS[lightTheme];
  // Cây cảnh chỉ vẽ khi có chủ đề. Theme 'none' là mặc định nên khu không có cây.
  const showPlants = theme !== 'none';

  const reserved = useMemo(() => zone.objects.filter((o) => o.kind === 'reserved'), [zone]);
  const nocObjects = useMemo(() => zone.objects.filter((o) => o.action === 'noc'), [zone]);
  const obstacles = useMemo(
    () => [...collisionRects(zone.objects), ...decorBlockersOf(zone.objects, showPlants), ...entryBlockers(zone.objects)],
    [zone, showPlants],
  );
  const audioRects = useMemo(() => audioZoneRects(zone.objects), [zone]);

  // Decor của khu. desks: mọi bàn và quầy dịch vụ, vẽ chung một lần. items: decor riêng từng vật thể.
  const decor = useMemo(() => zoneDecorOf(zone.objects, showPlants), [zone, showPlants]);
  // Thang máy, bàn an ninh, bàn kiểm duyệt do EntryFixtures vẽ: coi như có decor (bỏ khối hộp, có lớp chọn).
  const decorIds = useMemo(
    () =>
      new Set([
        ...decor.desks.map((d) => d.id),
        ...decor.items.map((d) => d.id),
        ...zone.objects.filter((o) => ENTRY_FIXTURE_IDS.has(o.id)).map((o) => o.id),
      ]),
    [decor, zone],
  );
  const decorObjects = useMemo(() => zone.objects.filter((o) => decorIds.has(o.id)), [zone, decorIds]);
  // Bàn không có decor vẫn vẽ bằng DeskField. Hiện mọi bàn đều có decor nên danh sách này thường rỗng.
  const plainDesks = useMemo(
    () => zone.objects.filter((o) => o.kind === 'desk' && !decorIds.has(o.id)),
    [zone, decorIds],
  );

  // Gom mảnh hình hộp theo lớp để giảm số lần vẽ (instancing).
  const parts = useMemo(() => {
    const solid: Part[] = [];
    const glass: Part[] = [];
    const decorParts: Part[] = [];
    for (const o of zone.objects) {
      const covered = decorIds.has(o.id);
      for (const p of partsOf(o)) {
        if (p.layer === 'glass') {
          glass.push(p);
        } else if (!covered) {
          if (p.layer === 'decor') decorParts.push(p);
          else solid.push(p);
        } else if (p.layer === 'box' && p.size[1] <= FLAT_MAX_HEIGHT) {
          solid.push(p);
        }
      }
    }
    return { solid, glass, decor: decorParts };
  }, [zone, decorIds]);

  // Lớp chọn vô hình: một hộp đúng footprint cho mỗi vật thể có decor.
  const hitItems = useMemo<BoxItem[]>(
    () => decorObjects.map((o) => ({ pos: o.position, size: o.size, owner: o.id, color: '#ffffff' })),
    [decorObjects],
  );

  const highlighted = useMemo(
    () => decorObjects.filter((o) => stateOf(o.id, selected, hovered) !== 'idle'),
    [decorObjects, selected, hovered],
  );

  // Cụm đèn của khu game, karaoke, events được dời tới vật thể thật. Vật đích bị ẩn (ngoài chữ L) thì không
  // dựng cụm đèn đó, thay vì để đèn ở vị trí tạm trong khu dự phòng.
  const { lightShift, lightZones } = useMemo(() => {
    const out: Partial<Record<LightZone, V3>> = {};
    const zones: LightZone[] = [];
    for (const lz of LIGHT_ZONES) {
      const shift = LIGHT_SHIFT[lz];
      if (!shift) {
        zones.push(lz);
        continue;
      }
      const target = zone.objects.find((o) => o.id === shift.target);
      if (!target) continue;
      zones.push(lz);
      out[lz] = [target.position[0] - toWorldX(shift.ref[0]), 0, target.position[2] - toWorldZ(shift.ref[1])];
    }
    return { lightShift: out, lightZones: zones };
  }, [zone]);

  // Trang trí lễ hội đặt trên khu dự phòng (vùng hatch), kích thước theo khu đó.
  const festival: ZoneObject | undefined = reserved[0];

  // Khu âm thanh theo vị trí người chơi. setState chỉ chạy khi đổi khu.
  const onMove = useCallback(
    (x: number, z: number) => {
      const next = audioZoneAt(audioRects, x, z);
      if (next === audioZoneRef.current) return;
      audioZoneRef.current = next;
      setAudioZone(next);
    },
    [audioRects],
  );

  // Tương tác: vật có action. Bấm vật ở gần và đang nhìn vào thì dùng ngay, ở xa thì tự đi tới rồi dùng.
  const interactSelect = useInteractionSelect(obstacles, entry.kind === 'done', onSelect);

  const scene: SceneState = useMemo(
    () => ({
      selected,
      hovered,
      select: interactSelect,
      hover: (id: string | null) => setHovered(id),
      unhover: (id: string) => setHovered((h) => (h === id ? null : h)),
    }),
    [selected, hovered, interactSelect],
  );

  return (
    <SceneContext.Provider value={scene}>
      <ambientLight color={preset.ambientColor} intensity={preset.ambientIntensity} />
      {/* Không đổ bóng ở đây: ngân sách đèn có bóng (tối đa 2) do rigs.tsx quản lý. */}
      <directionalLight position={[6, 12, 6]} intensity={0.9} />

      {lightZones.map((lz) => (
        <group key={lz} position={lightShift[lz] ?? ZERO}>
          <ZoneLights zone={lz} theme={lightTheme} />
        </group>
      ))}
      {/* Bloom tắt mặc định cho máy yếu. Bật khi cần thử hiệu ứng. */}
      <OptionalBloom enabled={false} strength={preset.bloomStrength} />

      <Floorplan reserved={reserved} />
      <Corridors theme={lightTheme} />
      <NorthCorridor theme={lightTheme} />
      <LoungeLink theme={lightTheme} />
      <DeskField objects={plainDesks} />
      <DeskDecorField desks={decor.desks} extraShadows={OFFICE_PROP_SHADOWS} />
      <ObjectBoxes parts={parts.solid} />
      <ObjectBoxes parts={parts.glass} glass />
      <DecorBoxes parts={parts.decor} />
      <InstancedBoxes items={hitItems} hitOnly />

      {decor.items.map(({ id, el }) => (
        <Fragment key={id}>{el}</Fragment>
      ))}
      {highlighted.map((o) => (
        <DecorHighlight key={`hl-${o.id}`} obj={o} state={stateOf(o.id, selected, hovered)} />
      ))}

      {/* Tivi, bảng vẽ và cây không có trong it.json. Vị trí lấy từ itFixtures.ts, khớp services/layout/data/zone.json. */}
      {TV_IDS.map((id) => {
        const f = TV_FIXTURES[id];
        return (
          <TvScreen
            key={id}
            tvId={id}
            position={f.position}
            rotation={[0, f.rotationY, 0]}
            size={f.size}
            onClick={onSelect}
          />
        );
      })}
      {BOARD_IDS.map((id) => {
        const f = BOARD_FIXTURES[id];
        return (
          <WhiteboardScreen
            key={id}
            boardId={id}
            position={f.position}
            rotation={[0, f.rotationY, 0]}
            size={f.size}
            onClick={onSelect}
          />
        );
      })}
      <PlantFixtures selected={selected} tool={plantTool} onSelect={onSelect} />

      {festival && (
        <PartyDecor
          theme={theme}
          position={[festival.position[0], 0, festival.position[2]]}
          width={festival.size[0]}
          depth={festival.size[2]}
        />
      )}

      {nocObjects.map((o) => (
        <NocTiles key={o.id} obj={o} services={services} />
      ))}

      {zone.objects.map((o) => (
        <Html
          key={`label-${o.id}`}
          position={[o.position[0], labelY(o), o.position[2]]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div className="label">{o.label}</div>
        </Html>
      ))}

      <group position={CITY_ORIGIN} rotation={[0, CITY_ROTATION_Y, 0]}>
        <CityView timeOfDay="noon" />
      </group>

      <EntryFixtures objects={zone.objects} theme={lightTheme} />
      {entry.kind === 'sequence' && (
        <EntrySequence
          userName={userName}
          checkedIn={false}
          onFinish={onEntryFinish}
          appearance={appearance}
          objects={zone.objects}
        />
      )}
      {/* Player chỉ mount sau khi EntrySequence xong, nên phím bị khóa suốt chuỗi ghi danh (Player có prop enabled nếu cần khóa thêm). */}
      {/* SocialLayer mount trước Player để vị trí bị đẩy ra được ghi lại trước khi Player di chuyển tiếp. */}
      <SocialLayer world={world} />
      {entry.kind === 'done' && (
        <Player
          obstacles={obstacles}
          appearance={appearance}
          look={look}
          onMove={onMove}
          spawn={entry.spawn}
          world={world}
          selfId={selfId ?? 'self'}
        />
      )}
      <InteractionLayer objects={zone.objects} enabled={entry.kind === 'done'} hovered={hovered} onUse={onSelect} />
      <DuelLayer world={world} myId={selfId} duel={duel} />
      <AmbientAudio zone={audioZone} enabled={audioEnabled} />
    </SceneContext.Provider>
  );
}
