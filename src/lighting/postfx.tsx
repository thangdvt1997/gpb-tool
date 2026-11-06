import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface OptionalBloomProps {
  /** Bật bloom. Nên để false mặc định: bloom đắt trên máy yếu. */
  enabled: boolean;
  /** Cường độ bloom. Mặc định 0.5. */
  strength?: number;
}

/**
 * Bloom tuỳ chọn. Khi bật, EffectComposer tiếp quản việc vẽ (priority 1 trong useFrame).
 * Khi tắt, component không render gì và R3F tự vẽ như bình thường.
 */
export function OptionalBloom({ enabled, strength = 0.5 }: OptionalBloomProps) {
  if (!enabled) return null;
  return <BloomPipeline strength={strength} />;
}

function BloomPipeline({ strength }: { strength: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  const composerRef = useRef<EffectComposer | null>(null);
  const bloomRef = useRef<UnrealBloomPass | null>(null);

  // Tạo trong effect (không dùng useMemo) để StrictMode không tạo hai composer rồi bỏ một cái không dispose.
  useEffect(() => {
    const composer = new EffectComposer(gl);
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), strength, 0.4, 0.85);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(bloom);
    // OutputPass chuyển sang sRGB và áp tone mapping, vì composer làm mất bước này của R3F.
    composer.addPass(new OutputPass());
    composerRef.current = composer;
    bloomRef.current = bloom;
    return () => {
      composer.dispose();
      bloom.dispose();
      composerRef.current = null;
      bloomRef.current = null;
    };
    // Khi gl, scene hoặc camera đổi thì tạo lại. Cường độ và kích thước cập nhật ở effect bên dưới.
  }, [gl, scene, camera]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(width, height);
  }, [gl, width, height]);

  useEffect(() => {
    if (bloomRef.current) bloomRef.current.strength = strength;
  }, [strength]);

  useFrame((_, delta) => {
    composerRef.current?.render(delta);
  }, 1);

  return null;
}
