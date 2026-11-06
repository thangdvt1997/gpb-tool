/**
 * Áp lớp xăm lên vật liệu thân. Vật liệu gốc có thể dùng chung với bộ đệm useLoader nên KHÔNG sửa tại chỗ:
 * tạo bản sao vật liệu cho mesh, chèn một lần lấy mẫu texture xăm sau map_fragment (giữ map gốc, ánh sáng, morph, skinning),
 * và trả handle để cập nhật/gỡ. Gỡ = trả vật liệu gốc, huỷ bản sao và texture.
 * Texture xăm dùng cùng UV với map gốc (vMapUv), flipY = false khớp quy ước UV glTF.
 */
import * as THREE from 'three';

export interface TattooOverlayHandle {
  /** Báo canvas đã đổi, tải lại texture. */
  update(): void;
  setOpacity(o: number): void;
  /** Gỡ sạch: trả vật liệu gốc, huỷ texture và vật liệu bản sao. Gọi nhiều lần an toàn. */
  dispose(): void;
  readonly texture: THREE.Texture;
}

export const TATTOO_CACHE_KEY = 'tattoo-overlay-v1';

/** Chèn đoạn GLSL vào fragment shader (xuất ra riêng để test). */
export function patchFragment(src: string): string | null {
  if (!src.includes('#include <map_fragment>')) return null;
  return 'uniform sampler2D tattooMap;\nuniform float tattooOpacity;\n' + src.replace(
    '#include <map_fragment>',
    `#include <map_fragment>
#ifdef USE_MAP
  vec4 tattooTex = texture2D( tattooMap, vMapUv );
  diffuseColor.rgb = mix( diffuseColor.rgb, tattooTex.rgb, tattooTex.a * tattooOpacity );
#endif`,
  );
}

type Source = HTMLCanvasElement | OffscreenCanvas;

/**
 * Trả null nếu mesh không có vật liệu chuẩn có map (không có UV/map thì không thể trộn lên da).
 * Mesh nhiều vật liệu: chỉ áp lên vật liệu đầu có map.
 */
export function applyTattooOverlay(bodyMesh: THREE.Mesh, canvas: Source): TattooOverlayHandle | null {
  const original = bodyMesh.material;
  const list = Array.isArray(original) ? original : [original];
  const idx = list.findIndex((m) => (m as THREE.MeshStandardMaterial).map);
  if (idx < 0) return null;
  const base = list[idx] as THREE.MeshStandardMaterial;

  const tex = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;

  const uniforms = { tattooMap: { value: tex }, tattooOpacity: { value: 1 } };
  const mat = base.clone();
  mat.name = base.name;
  const prevHook = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prevHook?.call(mat, shader, renderer);
    const patched = patchFragment(shader.fragmentShader);
    if (!patched) return;
    shader.uniforms.tattooMap = uniforms.tattooMap;
    shader.uniforms.tattooOpacity = uniforms.tattooOpacity;
    shader.fragmentShader = patched;
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + TATTOO_CACHE_KEY;
  mat.needsUpdate = true;

  bodyMesh.material = Array.isArray(original) ? list.map((m, i) => (i === idx ? mat : m)) : mat;
  let disposed = false;

  return {
    texture: tex,
    update() { if (!disposed) tex.needsUpdate = true; },
    setOpacity(o: number) { uniforms.tattooOpacity.value = Math.min(1, Math.max(0, Number.isFinite(o) ? o : 1)); },
    dispose() {
      if (disposed) return;
      disposed = true;
      // Chỉ trả vật liệu gốc nếu mesh còn đang giữ bản sao của ta.
      const cur = bodyMesh.material;
      if (Array.isArray(cur)) bodyMesh.material = cur.map((m) => (m === mat ? base : m));
      else if (cur === mat) bodyMesh.material = base;
      tex.dispose();
      mat.dispose();
    },
  };
}
