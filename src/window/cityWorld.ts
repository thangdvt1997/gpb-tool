/**
 * Ghép toàn bộ cảnh ngoài cửa kính thành một nhóm three.js, cập nhật theo thời gian tuyệt đối,
 * đổi khung giờ và giải phóng tài nguyên. Không dùng React ở đây, CityView chỉ là lớp bọc.
 */
import * as THREE from 'three';
import { buildActors, updateActors } from './cityActors';
import {
  buildClouds,
  buildGround,
  buildLamps,
  buildMidrise,
  buildOppositeTower,
  buildResidential,
  buildSky,
  buildSkyline,
  buildTrees,
  makeCityTextures,
  setInstance,
  type Trash,
} from './cityMeshes';
import { applyTimePreset, createSharedUniforms } from './cityShader';
import { presetFor, type TimeOfDay, type TimePreset } from './timeOfDay';

export interface CityWorld {
  /** Nhóm gốc, đặt trong scene với hệ toạ độ cục bộ của CityView. */
  group: THREE.Group;
  /** Cập nhật theo thời gian tuyệt đối (giây). Tự giới hạn tần số: 30 Hz, và 1 Hz khi tab ẩn. */
  update(elapsed: number): void;
  /** Đổi khung giờ. Chỉ cập nhật uniform và đèn, không dựng lại hình học. */
  setTimeOfDay(key: TimeOfDay): void;
  /** Giải phóng mọi geometry, material, texture và InstancedMesh đã tạo. */
  dispose(): void;
}

const ACTIVE_INTERVAL = 1 / 30;
const HIDDEN_INTERVAL = 1;
const CLOUD_RANGE = 800;

const wrap = (v: number, m: number) => ((v % m) + m) % m;

export function createCityWorld(timeOfDay: TimeOfDay): CityWorld {
  const trash: Trash = [];
  const shared = createSharedUniforms();
  const tex = makeCityTextures(trash);

  const group = new THREE.Group();
  const sky = buildSky(trash);
  group.add(sky.mesh);
  group.add(buildGround(shared, tex, trash));
  group.add(buildOppositeTower(shared, trash));
  group.add(buildMidrise(shared, tex, trash));

  const residential = buildResidential(shared, trash);
  group.add(residential.bodies);
  if (residential.balconies) group.add(residential.balconies);

  group.add(buildSkyline(shared, trash));
  group.add(buildLamps(shared, trash));

  const trees = buildTrees(shared, tex, trash);
  group.add(trees.trunks, trees.leavesNear);
  if (trees.leavesFar) group.add(trees.leavesFar);

  const clouds = buildClouds(shared, tex, trash);
  group.add(clouds.mesh);

  const actors = buildActors(shared, trash);
  group.add(actors.cars, actors.headlights, actors.bikes, actors.torsos, actors.heads);

  let current: TimePreset = presetFor(timeOfDay);
  applyTimePreset(shared, sky.material, current);
  let lastTick = Number.NEGATIVE_INFINITY;

  const update = (elapsed: number) => {
    const hidden = typeof document !== 'undefined' && document.hidden;
    const interval = hidden ? HIDDEN_INTERVAL : ACTIVE_INTERVAL;
    if (elapsed - lastTick < interval) return;
    lastTick = elapsed;

    shared.uTime.value = elapsed;

    for (let i = 0; i < clouds.specs.length; i++) {
      const c = clouds.specs[i];
      const x = wrap(c.x0 - c.speed * elapsed, CLOUD_RANGE) - CLOUD_RANGE / 2;
      setInstance(clouds.mesh, i, [x, c.y, c.z], [c.sx, c.sy, 1]);
    }
    clouds.mesh.instanceMatrix.needsUpdate = true;

    updateActors(actors, elapsed, current.headlightAmount);
  };

  const setTimeOfDay = (key: TimeOfDay) => {
    current = presetFor(key);
    applyTimePreset(shared, sky.material, current);
    // Buộc cập nhật ở khung hình kế tiếp để đèn xe đổi ngay.
    lastTick = Number.NEGATIVE_INFINITY;
  };

  const dispose = () => {
    // Không xoá danh sách: StrictMode có thể gọi dispose rồi mount lại cùng một thể hiện.
    for (const r of trash) r.dispose();
  };

  return { group, update, setTimeOfDay, dispose };
}
