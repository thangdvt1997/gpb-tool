// Env map nhỏ cho sàn đá bóng: một hộp trần trắng có lưới đèn panel phát sáng, nướng qua PMREMGenerator.
// Sàn và hành lang lấy phản chiếu từ đây (ô đèn trần thành các ô sáng chữ nhật trên sàn), không dùng Reflector.
// Chỉ gán vào envMap của vật liệu sàn, không đặt scene.environment, nên vật liệu khác không đổi.
// Dùng chung theo renderer, đếm tham chiếu: dựng lần đầu khi có người dùng, dispose khi không còn ai.

import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { OFFICE_DAY_SCENE as R } from '../theme/tokens';

interface Entry {
  rt: THREE.WebGLRenderTarget;
  refs: number;
}

const cache = new WeakMap<THREE.WebGLRenderer, Entry>();

function bake(gl: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const scene = new THREE.Scene();
  const owned: Array<{ dispose: () => void }> = [];

  // Phòng 24 x 3 x 24 m, nhìn từ trong (BackSide). Tường trắng, sàn xám.
  const roomGeo = new THREE.BoxGeometry(24, 3, 24);
  const roomMat = new THREE.MeshBasicMaterial({ color: R.wallPaint, side: THREE.BackSide });
  const room = new THREE.Mesh(roomGeo, roomMat);
  room.position.y = 1.5;
  scene.add(room);
  owned.push(roomGeo, roomMat);

  const floorGeo = new THREE.PlaneGeometry(24, 24);
  const floorMat = new THREE.MeshBasicMaterial({ color: R.floorStone });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  scene.add(floor);
  owned.push(floorGeo, floorMat);

  // Đèn panel vuông 0,6 x 0,6 m (khớp trần OfficeCeiling.tsx), cách tâm 2,4 m, mặt hướng xuống.
  // Màu > 1 để ô phản chiếu sáng gắt hơn trần.
  const panelGeo = new THREE.PlaneGeometry(0.6, 0.6);
  const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(R.lightPanel).multiplyScalar(4) });
  for (let i = -4; i <= 4; i++) {
    for (let j = -4; j <= 4; j++) {
      const p = new THREE.Mesh(panelGeo, panelMat);
      p.rotation.x = Math.PI / 2;
      p.position.set(i * 2.4, 2.98, j * 2.4);
      scene.add(p);
    }
  }
  owned.push(panelGeo, panelMat);

  const pmrem = new THREE.PMREMGenerator(gl);
  const rt = pmrem.fromScene(scene, 0.02, 0.1, 30);
  pmrem.dispose();
  for (const o of owned) o.dispose();
  return rt;
}

/** Env map phản chiếu cho sàn bóng. Trả null ở khung hình đầu (trước khi nướng xong). */
export function useOfficeEnvMap(): THREE.Texture | null {
  const gl = useThree((s) => s.gl);
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let entry = cache.get(gl);
    if (!entry) {
      entry = { rt: bake(gl), refs: 0 };
      cache.set(gl, entry);
    }
    entry.refs += 1;
    setTex(entry.rt.texture);
    return () => {
      const e = cache.get(gl);
      if (!e) return;
      e.refs -= 1;
      if (e.refs <= 0) {
        e.rt.dispose();
        cache.delete(gl);
      }
    };
  }, [gl]);
  return tex;
}
