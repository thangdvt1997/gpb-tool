// Sảnh mở chibi: thảm tròn, hai cây lớn bo tròn, dải cửa sổ trời trên mặt lõi thang. Bố cục ở lobbyLayout.ts.
// Draw call: khối mờ (thảm, chậu, tán) 1, cửa sổ (không nhận đèn, sáng như trời) 1. Không bấm được (raycast tắt),
// nên bấm quầy Service Desk xuyên qua thảm như cũ.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { UNIT_BOX, UNIT_CYL, UNIT_SPHERE } from '../../env/shared';
import { toWorldX, toWorldZ } from '../layout';
import { Batch } from './merge';
import { LOBBY_PALETTE as P, LOBBY_PLANTS, LOBBY_RUG, LOBBY_WINDOWS } from './lobbyLayout';

const noRaycast = () => undefined;

function build() {
  const solid = new Batch();
  const sky = new Batch();

  // Thảm tròn hai lớp, nổi trên sàn sảnh (0,032).
  const rx = toWorldX(LOBBY_RUG.x);
  const rz = toWorldZ(LOBBY_RUG.y);
  solid.add(UNIT_CYL, null, [rx, 0.036, rz], [LOBBY_RUG.r, 0.008, LOBBY_RUG.r], P.rug);
  solid.add(UNIT_CYL, null, [rx, 0.041, rz], [LOBBY_RUG.core, 0.004, LOBBY_RUG.core], P.rugCore);

  // Cây: chậu bo (trụ thon + vành), ba khối tán tròn như phác thảo.
  for (const p of LOBBY_PLANTS) {
    const x = toWorldX(p.x);
    const z = toWorldZ(p.y);
    solid.add(UNIT_CYL, null, [x, 0.25, z], [p.pot, 0.5, p.pot], P.pot);
    solid.add(UNIT_CYL, null, [x, 0.52, z], [p.pot + 0.03, 0.06, p.pot + 0.03], P.pot);
    solid.add(UNIT_CYL, null, [x, 0.75, z], [0.04, 0.5, 0.04], P.leafDark);
    solid.add(UNIT_SPHERE, null, [x, 1.25, z], [p.crown, p.crown * 0.95, p.crown], P.leaf);
    solid.add(UNIT_SPHERE, null, [x - p.crown * 0.6, 0.98, z + 0.05], [p.crown * 0.65, p.crown * 0.6, p.crown * 0.65], P.leafDark);
    solid.add(UNIT_SPHERE, null, [x + p.crown * 0.6, 0.98, z - 0.05], [p.crown * 0.65, p.crown * 0.6, p.crown * 0.65], P.leafDark);
  }

  // Dải cửa sổ: nền tường, khung trời, đồi, mây, mặt trời, thanh dọc trắng. Mỗi lớp lệch ra 2–5 mm khỏi tường.
  for (const w of LOBBY_WINDOWS) {
    const face = toWorldX(w.wallX);
    const z0 = toWorldZ(w.y0);
    const z1 = toWorldZ(w.y1);
    const len = z1 - z0;
    const cz = (z0 + z1) / 2;
    const h = w.top - w.bottom;
    const cy = (w.top + w.bottom) / 2;
    const at = (o: number) => face + w.dir * o;
    solid.add(UNIT_BOX, null, [at(0.006), cy, cz], [0.012, h + 0.12, len + 0.12], P.wall);
    sky.add(UNIT_BOX, null, [at(0.014), cy, cz], [0.004, h, len], P.sky);
    sky.add(UNIT_BOX, null, [at(0.017), w.bottom + h * 0.14, cz], [0.004, h * 0.28, len], P.hill);
    sky.add(UNIT_SPHERE, null, [at(0.018), w.bottom + h * 0.7, z0 + len * 0.22], [0.002, h * 0.1, 0.22], P.cloud);
    sky.add(UNIT_SPHERE, null, [at(0.018), w.bottom + h * 0.62, z0 + len * 0.55], [0.002, h * 0.08, 0.18], P.cloud);
    sky.add(UNIT_SPHERE, null, [at(0.019), w.bottom + h * 0.68, z0 + len * 0.86], [0.002, h * 0.16, h * 0.16], P.sun);
    for (let i = 1; i < w.panes; i++) {
      solid.add(UNIT_BOX, null, [at(0.022), cy, z0 + (len * i) / w.panes], [0.012, h, 0.05], P.cloud);
    }
    solid.add(UNIT_BOX, null, [at(0.022), w.bottom, cz], [0.014, 0.05, len], P.cloud);
  }

  return { solid: solid.build(), sky: sky.build() };
}

export function OpenLobby() {
  const res = useMemo(() => {
    const geo = build();
    const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    return { geo, solidMat, skyMat };
  }, []);
  useEffect(
    () => () => {
      res.geo.solid?.dispose();
      res.geo.sky?.dispose();
      res.solidMat.dispose();
      res.skyMat.dispose();
    },
    [res],
  );
  return (
    <group name="open-lobby">
      {res.geo.solid && <mesh geometry={res.geo.solid} material={res.solidMat} raycast={noRaycast} receiveShadow />}
      {res.geo.sky && <mesh geometry={res.geo.sky} material={res.skyMat} raycast={noRaycast} />}
    </group>
  );
}
