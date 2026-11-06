import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { stateOf, toneFor, useScene } from './context';
import type { Part, V3 } from './layout';

export interface BoxItem {
  pos: V3;
  size: V3;
  color: string;
  /** Id vật thể sở hữu mảnh này. Bấm hoặc rê vào mảnh sẽ tác động tới vật thể đó. */
  owner?: string;
}

/** Một hình hộp đơn vị dùng chung cho mọi InstancedMesh, tạo một lần khi nạp module. */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const WHITE = '#ffffff';

interface BoxesProps {
  items: BoxItem[];
  glass?: boolean;
  interactive?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Chỉ dùng để bắt chuột: vật liệu visible=false nên không vẽ (0 draw call). Vẫn nhận raycast và sự kiện. */
  hitOnly?: boolean;
  /** Độ nhám vật liệu đặc (mặc định 0,7). Tường sơn mờ dùng 0,92. */
  roughness?: number;
}

/** Nhiều hình hộp trong một lệnh vẽ (InstancedMesh). Màu từng mảnh lấy từ items. */
export function InstancedBoxes({
  items,
  glass = false,
  interactive = true,
  castShadow = false,
  receiveShadow = false,
  hitOnly = false,
  roughness = 0.7,
}: BoxesProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { select, hover, unhover } = useScene();

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      p.set(it.pos[0], it.pos[1], it.pos[2]);
      s.set(it.size[0], it.size[1], it.size[2]);
      mesh.setMatrixAt(i, m.compose(p, q, s));
      mesh.setColorAt(i, c.set(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items]);

  if (items.length === 0) return null;

  const ownerOf = (e: { instanceId?: number }) =>
    e.instanceId === undefined ? undefined : items[e.instanceId]?.owner;

  const handlers: {
    onClick?: (e: ThreeEvent<MouseEvent>) => void;
    onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
    onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  } = interactive
    ? {
        onClick: (e) => {
          const id = ownerOf(e);
          if (id === undefined) return;
          e.stopPropagation();
          select(id);
        },
        onPointerOver: (e) => {
          const id = ownerOf(e);
          if (id === undefined) return;
          e.stopPropagation();
          hover(id);
        },
        onPointerOut: (e) => {
          const id = ownerOf(e);
          if (id !== undefined) unhover(id);
        },
      }
    : {};

  return (
    <instancedMesh
      ref={ref}
      args={[UNIT_BOX, undefined, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      {...handlers}
    >
      {hitOnly ? (
        // visible=false: renderer bỏ qua (không tốn draw call), raycaster của three vẫn bắt trúng nên bấm và rê vẫn chạy.
        <meshBasicMaterial visible={false} />
      ) : glass ? (
        <meshPhysicalMaterial color={WHITE} transparent opacity={0.25} roughness={0.1} depthWrite={false} />
      ) : (
        <meshStandardMaterial color={WHITE} roughness={roughness} metalness={0} />
      )}
    </instancedMesh>
  );
}

/** Các mảnh có chủ sở hữu (khối đặc, kính): màu theo trạng thái chọn và rê chuột. */
export function ObjectBoxes({ parts, glass = false }: { parts: Part[]; glass?: boolean }) {
  const { selected, hovered } = useScene();
  const items = useMemo<BoxItem[]>(
    () =>
      parts.map((p) => ({
        pos: p.pos,
        size: p.size,
        owner: p.owner,
        color: toneFor(p.color, stateOf(p.owner, selected, hovered)),
      })),
    [parts, selected, hovered],
  );
  return <InstancedBoxes items={items} glass={glass} castShadow={!glass} receiveShadow />;
}

/** Trang trí bên trong phòng hoặc trên tường, không bấm. */
export function DecorBoxes({ parts }: { parts: Part[] }) {
  const items = useMemo<BoxItem[]>(() => parts.map((p) => ({ pos: p.pos, size: p.size, color: p.color })), [parts]);
  return <InstancedBoxes items={items} interactive={false} castShadow receiveShadow />;
}
