/**
 * Vật liệu tự viết cho cảnh ngoài. Ánh sáng do uniform của khung giờ điều khiển,
 * không dùng đèn của scene (đèn trong văn phòng không được chiếu lên thành phố).
 * Tất cả vật liệu dùng chung một bộ uniform, nên đổi khung giờ chỉ cập nhật vài giá trị.
 * Hỗ trợ: instancing, instanceColor, vertex color, texture, alpha test, gió lay lá, nhịp bước người.
 */
import * as THREE from 'three';
import type { TimePreset } from './timeOfDay';

export interface CityUniforms {
  uTime: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSunStrength: { value: number };
  uAmbient: { value: THREE.Color };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
}

export function createSharedUniforms(): CityUniforms {
  return {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.2, 0.9, 0.35).normalize() },
    uSunColor: { value: new THREE.Color('#fff6e8') },
    uSunStrength: { value: 1 },
    uAmbient: { value: new THREE.Color('#8090a0') },
    uFogColor: { value: new THREE.Color('#c4d6e4') },
    uFogNear: { value: 80 },
    uFogFar: { value: 500 },
  };
}

/** Cập nhật uniform dùng chung theo khung giờ. Gọi khi timeOfDay đổi, không gọi trong vòng lặp khung hình. */
export function applyTimePreset(shared: CityUniforms, sky: THREE.ShaderMaterial | null, preset: TimePreset): void {
  shared.uSunDir.value.set(...preset.sunDirection).normalize();
  shared.uSunColor.value.set(preset.sunColor);
  shared.uSunStrength.value = preset.sunIntensity * 0.4;
  shared.uAmbient.value
    .set(preset.hemiSky)
    .lerp(new THREE.Color(preset.hemiGround), 0.4)
    .multiplyScalar(preset.hemiIntensity * 0.6);
  shared.uFogColor.value.set(preset.fog);
  shared.uFogNear.value = preset.fogNear;
  shared.uFogFar.value = preset.fogFar;
  if (sky) {
    (sky.uniforms.uTop.value as THREE.Color).set(preset.sky.top);
    (sky.uniforms.uHorizon.value as THREE.Color).set(preset.sky.horizon);
    (sky.uniforms.uGlowC.value as THREE.Color).set(preset.sky.sunGlow);
    (sky.uniforms.uSunDir.value as THREE.Vector3).copy(shared.uSunDir.value);
  }
}

const VERT = /* glsl */ `
uniform float uTime;
uniform float uSway;
uniform float uGait;
uniform vec3 uColor;
attribute float aLeg;
attribute float aPhase;
attribute float aOmega;
varying vec3 vN;
varying vec2 vUv;
varying vec3 vCol;
varying float vDepth;
void main() {
  vec3 p = position;
  float ph = 0.0;
  #ifdef USE_INSTANCING
  ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
  #endif
  // Lá cây đung đưa: đỉnh lá (uv.y lớn) lay nhiều hơn gốc.
  if (uSway > 0.0) {
    float b = uv.y;
    p.x += sin(uTime * 1.3 + ph) * 0.16 * b * uSway;
    p.z += cos(uTime * 1.1 + ph * 1.7) * 0.10 * b * uSway;
  }
  // Người đi bộ: chân đung theo aLeg (+1 trái, -1 phải), biên độ tăng theo độ xa khỏi hông.
  if (uGait > 0.5) {
    float s = sin(uTime * aOmega + aPhase);
    float hip = clamp((0.85 - p.y) / 0.85, 0.0, 1.0);
    p.z += s * aLeg * 0.22 * hip;
    p.y += 0.025 * abs(s);
  }
  mat4 model = modelMatrix;
  #ifdef USE_INSTANCING
  model = modelMatrix * instanceMatrix;
  #endif
  vec4 wp = model * vec4(p, 1.0);
  vN = normalize(mat3(model) * normal);
  vCol = uColor;
  #ifdef USE_COLOR
  vCol *= color;
  #endif
  #ifdef USE_INSTANCING_COLOR
  vCol *= instanceColor;
  #endif
  vUv = uv;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunStrength;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform sampler2D uMap;
uniform float uUseMap;
uniform float uAlphaTest;
uniform float uOpacity;
varying vec3 vN;
varying vec2 vUv;
varying vec3 vCol;
varying float vDepth;
void main() {
  vec4 tex = vec4(1.0);
  if (uUseMap > 0.5) tex = texture2D(uMap, vUv);
  if (tex.a < uAlphaTest) discard;
  float ndl = max(dot(normalize(vN), uSunDir), 0.0);
  vec3 lit = vCol * tex.rgb * (uAmbient + uSunColor * uSunStrength * ndl);
  float f = smoothstep(uFogNear, uFogFar, vDepth);
  vec3 c = mix(lit, uFogColor, f);
  gl_FragColor = vec4(c, tex.a * uOpacity);
  #include <colorspace_fragment>
}
`;

export interface CityMaterialOpts {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  alphaTest?: number;
  opacity?: number;
  transparent?: boolean;
  depthWrite?: boolean;
  /** Biên độ lay theo gió (0 là không lay). */
  sway?: number;
  /** Bật hoạt ảnh bước chân cho người (cần thuộc tính aLeg, aPhase, aOmega). */
  gait?: boolean;
  vertexColors?: boolean;
  doubleSide?: boolean;
}

/** Tạo một vật liệu chiếu sáng theo khung giờ, dùng chung uniform với các vật liệu khác. */
export function createCityMaterial(shared: CityUniforms, o: CityMaterialOpts = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: shared.uTime,
      uSunDir: shared.uSunDir,
      uSunColor: shared.uSunColor,
      uSunStrength: shared.uSunStrength,
      uAmbient: shared.uAmbient,
      uFogColor: shared.uFogColor,
      uFogNear: shared.uFogNear,
      uFogFar: shared.uFogFar,
      uColor: { value: new THREE.Color(o.color ?? '#ffffff') },
      uMap: { value: o.map ?? null },
      uUseMap: { value: o.map ? 1 : 0 },
      uAlphaTest: { value: o.alphaTest ?? 0 },
      uOpacity: { value: o.opacity ?? 1 },
      uSway: { value: o.sway ?? 0 },
      uGait: { value: o.gait ? 1 : 0 },
    },
    transparent: o.transparent ?? false,
    depthWrite: o.depthWrite ?? true,
    side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    vertexColors: o.vertexColors ?? false,
  });
}

/** Vật liệu bầu trời: gradient theo độ cao, quầng mặt trời, không chịu sương. */
export function createSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uGlowC;
      uniform vec3 uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += uGlowC * pow(s, 10.0) * 0.6;
        col = mix(col, uHorizon, 1.0 - smoothstep(-0.08, 0.0, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    uniforms: {
      uTop: { value: new THREE.Color('#4a86c8') },
      uHorizon: { value: new THREE.Color('#c9dcea') },
      uGlowC: { value: new THREE.Color('#fff4dc') },
      uSunDir: { value: new THREE.Vector3(0.2, 0.9, 0.35).normalize() },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}
