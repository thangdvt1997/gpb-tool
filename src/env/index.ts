// Điểm vào của module trang trí 3D (src/env).
// renderDetailFor(objectId, props) trả về phần tử React của decor đúng với id vật thể trong it.json,
// hoặc null nếu id không có decor riêng. Mọi decor nhận position là điểm trên sàn (y = 0) tại tâm vật thể.
// Dùng floorPropsOf(obj) để đổi ZoneObject sang props. Kích thước mặc định lấy từ it.json.

import { createElement, type ReactElement } from 'react';
import { layoutRotationY, rotateBoxesAbout, unrotatedOf } from '../layout/applyPoses';
import type { ZoneObject } from '../content/types';
import { DeskDetail, NocWallDetail, ServiceDeskDetail, type DeskSpec, type DeskVariant } from './desk';
import { MeetingRoomDetail } from './meeting';
import { GameCornerDetail } from './game';
import {
  HealthRoomDetail,
  KudosBoardDetail,
  LoungeDetail,
  PantryDetail,
  QuietRoomDetail,
  loungeBlockers,
  pantryBlockers,
} from './lounge';
import { KaraokeRoomDetail } from './karaoke';
import { EventsBoardDetail } from './events';
import { CheckinBoardDetail } from './checkin';
import { seedFromId, type DecorBase, type FloorRect } from './shared';
import { OFFICE_PROP_BLOCKERS } from '../scene/officePropsLayout';

export * from './desk';
export * from './meeting';
export * from './lounge';
export * from './game';
export * from './karaoke';
export * from './events';
export * from './checkin';
export * from './party';
export * from './palette';
export * from './shared';

/** Props để renderDetailFor dựng decor. Mọi trường tùy chọn, mặc định lấy theo id vật thể. */
export interface DetailProps extends DecorBase {
  /** Chiều x của khối (m). Ghi đè kích thước mặc định. */
  width?: number;
  /** Chiều z của khối (m). Ghi đè kích thước mặc định. */
  depth?: number;
  /** Chiều cao (m), dùng cho mặt bàn (desk), bảng và quầy. */
  height?: number;
  /** Hạt giống. Mặc định lấy từ id. */
  seed?: number;
  /** Nhãn hiển thị, ví dụ tên squad trên thẻ tên. */
  label?: string;
  /** Phong cách màn hình của khối bàn. Mặc định theo id. */
  variant?: DeskVariant;
  /** Có cây cảnh (chậu, xương rồng, cây lớn). false thì bỏ hẳn các chi tiết này. Mặc định true. */
  plants?: boolean;
}

// Kích thước [chiều x, chiều z] lấy từ it.json (size). Dùng khi caller không truyền width/depth.
const DESK_SIZE: Partial<Record<string, [number, number]>> = {
  desk_L1: [6, 4.6],
  desk_L2: [6, 4.6],
  desk_L3: [6, 3],
  desk_B1: [5.4, 4.6],
  desk_B2: [5.4, 4.6],
  desk_B3: [4.7, 4.6],
  desk_B4: [4.6, 4.6],
  desk_B5: [4.6, 4.6],
  desk_B6: [4.6, 4.6],
  desk_B7: [6, 4.6],
  open_north: [14.6, 4.7],
};

// Phong cách màn hình theo squad (mẫu, có thể đổi). Cụm ops: SOC, Hạ tầng, Vận hành. Cụm design: Mobile, Product.
const DESK_VARIANT: Partial<Record<string, DeskVariant>> = {
  desk_L1: 'dev',
  desk_L2: 'dev',
  desk_L3: 'ops',
  desk_B1: 'design',
  desk_B2: 'dev',
  desk_B3: 'dev',
  desk_B4: 'dev',
  desk_B5: 'ops',
  desk_B6: 'ops',
  desk_B7: 'design',
  open_north: 'design',
};

// Phòng họp: kích thước và sức chứa từ it.json.
const MEETING: Partial<Record<string, { w: number; d: number; cap: number }>> = {
  mr1: { w: 5, d: 4.7, cap: 8 },
  mr2: { w: 4.3, d: 3, cap: 10 },
  mr3: { w: 4.4, d: 3, cap: 12 },
};

/** Đổi ZoneObject sang props: điểm trên sàn ở tâm vật thể và nhãn (tên squad nếu có). */
export function floorPropsOf(obj: ZoneObject): DetailProps {
  return {
    position: [obj.position[0], 0, obj.position[2]],
    label: obj.squad ?? obj.label,
  };
}

/**
 * Trả về phần tử decor cho id vật thể, hoặc null nếu id không có decor riêng.
 * Các id không có decor (WC, thang, kho, phòng SOC, phòng máy chủ, dự phòng, lối vào, bảng thông báo) trả null.
 */
export function renderDetailFor(objectId: string, props: DetailProps = {}): ReactElement | null {
  const seed = props.seed ?? seedFromId(objectId);
  const base: DecorBase = { position: props.position, scale: props.scale, rotationY: props.rotationY };

  const deskVariant = DESK_VARIANT[objectId];
  if (deskVariant) {
    const [dw, dd] = DESK_SIZE[objectId] ?? [1.2, 1.2];
    return createElement(DeskDetail, {
      ...base,
      width: props.width ?? dw,
      depth: props.depth ?? dd,
      seed,
      variant: props.variant ?? deskVariant,
      plants: props.plants,
    });
  }

  const meeting = MEETING[objectId];
  if (meeting) {
    return createElement(MeetingRoomDetail, {
      ...base,
      width: props.width ?? meeting.w,
      depth: props.depth ?? meeting.d,
      capacity: meeting.cap,
      plants: props.plants,
    });
  }

  switch (objectId) {
    case 'service_desk':
      return createElement(ServiceDeskDetail, { ...base, width: props.width ?? 4.5, depth: props.depth ?? 1.2 });
    case 'util_quiet':
      return createElement(QuietRoomDetail, { ...base, seed, plants: props.plants });
    case 'util_health':
      return createElement(HealthRoomDetail, base);
    case 'karaoke_room':
      return createElement(KaraokeRoomDetail, {
        ...base,
        width: props.width ?? 4.4,
        depth: props.depth ?? 3.2,
        seed,
      });
    case 'games_corner':
      return createElement(GameCornerDetail, { ...base, seed });
    case 'events_board':
      return createElement(EventsBoardDetail, {
        ...base,
        width: props.width ?? 2.0,
        height: props.height ?? 2.2,
      });
    case 'checkin_board':
      // Bảng ghi danh trên tường Tây của lõi thang máy 2, mặt hướng Tây vào sảnh: xoay -90 độ.
      // Có decor nên ITOffice gắn lớp chọn vô hình: bấm bảng mở action 'checkin_board'.
      return createElement(CheckinBoardDetail, {
        ...base,
        width: props.width ?? 1.8,
        height: props.height ?? 1.2,
        rotationY: props.rotationY ?? -Math.PI / 2,
      });
    case 'kudos_board':
      // Bảng nằm trên tường Đông, mặt hướng Tây (vào trong lounge): xoay -90 độ.
      return createElement(KudosBoardDetail, {
        ...base,
        width: props.width ?? 3,
        height: props.height ?? 2,
        seed,
        rotationY: props.rotationY ?? -Math.PI / 2,
      });
    case 'noc_wall':
      return createElement(NocWallDetail, { ...base, width: props.width ?? 13.5, seed });
    case 'lounge':
      return createElement(LoungeDetail, { ...base, seed, plants: props.plants });
    case 'pantry':
      return createElement(PantryDetail, {
        ...base,
        width: props.width ?? 6,
        depth: props.depth ?? 6.5,
        seed,
        plants: props.plants,
      });
    case 'util_coffee':
      return createElement(PantryDetail, {
        ...base,
        width: props.width ?? 4,
        depth: props.depth ?? 2.4,
        seed,
        plants: props.plants,
      });
    default:
      return null;
  }
}

/** Bàn làm việc (desk_*, open_north) và quầy Service Desk. Chúng được gom vào DeskDecorField cho cả khu. */
export function deskSpecOf(obj: ZoneObject, plants: boolean): DeskSpec | null {
  const variant = DESK_VARIANT[obj.id];
  if (variant) {
    return {
      id: obj.id,
      x: obj.position[0],
      z: obj.position[2],
      width: obj.size[0],
      depth: obj.size[2],
      height: obj.size[1],
      variant,
      seed: seedFromId(obj.id),
      chairs: true,
      plants,
    };
  }
  if (obj.id === 'service_desk') {
    return {
      id: obj.id,
      x: obj.position[0],
      z: obj.position[2],
      width: obj.size[0],
      depth: obj.size[2],
      height: obj.size[1],
      variant: 'ops',
      seed: 11,
      chairs: false,
      plants,
    };
  }
  return null;
}

/** Decor của khu, tách thành bàn (vẽ chung) và các decor riêng. */
export interface ZoneDecor {
  desks: DeskSpec[];
  /** Mỗi vật thể có decor riêng một phần tử. id là id vật thể. */
  items: Array<{ id: string; el: ReactElement }>;
  /** Quầy/bàn đã xoay theo bố cục: spec dựng từ vật chưa xoay, vẽ trong group quay quanh (cx, cz). Không nằm trong desks. */
  rotatedDesks: Array<{ spec: DeskSpec; desks: readonly DeskSpec[]; cx: number; cz: number; rotationY: number }>;
}

/** Bọc phần tử vẽ ở toạ độ thế giới vào group quay quanh (cx, cz) một góc rotationY. */
function rotatedAbout(el: ReactElement, cx: number, cz: number, rotationY: number, name: string): ReactElement {
  return createElement(
    'group',
    { name, position: [cx, 0, cz], rotation: [0, rotationY, 0] },
    createElement('group', { position: [-cx, 0, -cz] }, el),
  );
}

/** Dựng decor cho cả khu. Kích thước lấy từ it.json. plants false thì bỏ cây cảnh. */
export function zoneDecorOf(objects: readonly ZoneObject[], plants: boolean): ZoneDecor {
  const desks: DeskSpec[] = [];
  const rotatedDesks: ZoneDecor['rotatedDesks'] = [];
  const items: ZoneDecor['items'] = [];
  for (const obj of objects) {
    // Vật đã xoay theo bố cục: dựng hình từ vật chưa xoay (kích thước gốc) rồi quay cả khối quanh tâm.
    const o = unrotatedOf(obj);
    const rotationY = layoutRotationY(obj);
    const [cx, cz] = [o.position[0], o.position[2]];
    const spec = deskSpecOf(o, plants);
    if (spec) {
      if (obj.layoutRot) rotatedDesks.push({ spec, desks: [spec], cx, cz, rotationY });
      else desks.push(spec);
    }
    if (DESK_VARIANT[o.id]) continue; // bàn thường đã nằm trong desks
    const el = renderDetailFor(o.id, { ...floorPropsOf(o), plants });
    if (!el) continue;
    items.push({
      id: o.id,
      el: obj.layoutRot ? rotatedAbout(el, cx, cz, rotationY, `rot-${o.id}`) : el,
    });
  }
  return { desks, items, rotatedDesks };
}

/**
 * Các ô chặn đi lại do decor tạo ra: lounge, pantry, khu cà phê. Tọa độ three.js.
 * Vật thể đặc (bàn, phòng kính, quầy) đã có footprint trong src/scene/layout.ts.
 * Kèm ô chặn của đạo cụ văn phòng thật (OFFICE_PROP_BLOCKERS), vẽ trong src/scene/OfficeProps.tsx.
 */
export function decorBlockersOf(objects: readonly ZoneObject[], plants: boolean): FloorRect[] {
  const out: FloorRect[] = [];
  for (const obj of objects) {
    // Đã xoay theo bố cục: ô chặn tính trên vật chưa xoay rồi quay quanh tâm.
    const o = unrotatedOf(obj);
    const center: [number, number] = [o.position[0], o.position[2]];
    let rects: FloorRect[] = [];
    if (o.id === 'lounge') {
      rects = loungeBlockers(center, plants);
    } else if (o.id === 'pantry' || o.id === 'util_coffee') {
      // Kích thước khu lấy từ it.json, khớp với mặc định của renderDetailFor.
      rects = pantryBlockers(center, o.size[0], o.size[2], plants);
    }
    out.push(...(obj.layoutRot ? rotateBoxesAbout(rects, center[0], center[1], obj.layoutRot) : rects));
  }
  // Đạo cụ văn phòng thật đứng dưới sàn (bình chữa cháy, máy lọc nước, tủ hồ sơ, cây lớn, thùng rác).
  // Chỉ thêm khi khu có sàn chính (có vật thể), footprint không chồng vật thể nào (src/scene/officePropsLayout.ts).
  if (objects.length > 0) out.push(...OFFICE_PROP_BLOCKERS);
  return out;
}
