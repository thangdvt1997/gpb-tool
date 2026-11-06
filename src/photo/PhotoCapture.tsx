import { useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { playerPose } from '../scene/controls/playerPose';
import {
  clampToBounds,
  computeFollowPose,
  type Bounds,
  type FixedPreset,
  type FollowParams,
  type Vec3,
} from './cameraModes';
import { buildPhotoFileName, buildPhotoMetadata, formatInfo, type PhotoCameraKind, type PhotoFormat, type PhotoMetadata } from './filename';
import { aspectRatio, clampFov, computeCropRect, computeOutputSize, isBlankPixels, type AspectId } from './framing';

export interface FreeCam {
  position: Vec3;
  yaw: number;
  pitch: number;
}

export interface CaptureOptions {
  aspect: AspectId;
  /** Cạnh dài mong muốn (px). Bị chặn bởi vùng nguồn thực của canvas và giới hạn thiết bị. */
  longEdge: number;
  format: PhotoFormat;
  /** 0..1, chỉ cho JPEG. */
  quality?: number;
  hudHidden: boolean;
}

export type CaptureResult =
  | { ok: true; blob: Blob; fileName: string; width: number; height: number; reducedReason: string; metadata: PhotoMetadata }
  | { ok: false; error: 'no-crop' | 'no-size' | 'blank' | 'tainted' | 'encode' | 'busy' };

export interface PhotoCaptureApi {
  capture: (o: CaptureOptions) => Promise<CaptureResult>;
}

export interface PhotoCaptureProps {
  /** Photo mode đang bật: component mới điều khiển camera. Tắt thì khôi phục camera đã lưu. */
  active: boolean;
  mode: PhotoCameraKind;
  follow: FollowParams;
  fixed?: FixedPreset | null;
  free: FreeCam;
  /** Vùng cho phép của camera tự do. */
  bounds: Bounds;
  /** FOV dọc (độ) khi chụp. Bỏ trống thì giữ FOV hiện tại. */
  fov?: number;
  apiRef: MutableRefObject<PhotoCaptureApi | null>;
}

const MAX_PIXELS = 16_000_000;
const tmp = new Vector3();

/**
 * Đặt BÊN TRONG <Canvas>, SAU component điều khiển camera chính (useFrame cùng ưu tiên chạy theo thứ tự đăng ký).
 * Không ghi vào playerPose hay trạng thái nhân vật. Không dùng useFrame ưu tiên dương (tránh tắt render tự động của R3F).
 */
export function PhotoCapture({ active, mode, follow, fixed, free, bounds, fov, apiRef }: PhotoCaptureProps): null {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const saved = useRef<{ pos: Vector3; quat: Quaternion; fov: number } | null>(null);
  const busy = useRef(false);

  // Lưu camera khi vào, khôi phục khi ra (hoặc unmount).
  useEffect(() => {
    if (!active) return undefined;
    saved.current = {
      pos: camera.position.clone(),
      quat: camera.quaternion.clone(),
      fov: camera instanceof PerspectiveCamera ? camera.fov : 0,
    };
    return () => {
      const s = saved.current;
      saved.current = null;
      if (!s) return;
      camera.position.copy(s.pos);
      camera.quaternion.copy(s.quat);
      if (camera instanceof PerspectiveCamera && s.fov > 0) {
        camera.fov = s.fov;
        camera.updateProjectionMatrix();
      }
    };
  }, [active, camera]);

  useFrame(() => {
    if (!active) return;
    if (mode === 'follow') {
      const p = computeFollowPose(playerPose, follow);
      camera.position.set(p.position.x, p.position.y, p.position.z);
      camera.lookAt(p.target.x, p.target.y, p.target.z);
    } else if (mode === 'fixed' && fixed) {
      camera.position.set(fixed.position.x, fixed.position.y, fixed.position.z);
      camera.lookAt(fixed.target.x, fixed.target.y, fixed.target.z);
    } else if (mode === 'free') {
      const q = clampToBounds(free.position, bounds);
      camera.position.set(q.x, q.y, q.z);
      const cp = Math.cos(free.pitch);
      tmp.set(q.x + Math.sin(free.yaw) * cp, q.y - Math.sin(free.pitch), q.z + Math.cos(free.yaw) * cp);
      camera.lookAt(tmp);
    }
    const f = mode === 'fixed' && fixed ? fixed.fov : fov;
    if (f !== undefined && camera instanceof PerspectiveCamera) {
      const next = clampFov(f);
      if (Math.abs(camera.fov - next) > 1e-4) {
        camera.fov = next;
        camera.updateProjectionMatrix();
      }
    }
  });

  useEffect(() => {
    apiRef.current = {
      capture: async (o) => {
        if (busy.current) return { ok: false, error: 'busy' };
        busy.current = true;
        let out: HTMLCanvasElement | null = null;
        try {
          // Vẽ lại ngay để buffer còn nội dung (preserveDrawingBuffer mặc định false); toBlob chụp đồng bộ ngay sau đó.
          gl.render(scene, camera);
          const src = gl.domElement;
          const ratio = aspectRatio(o.aspect, src.width, src.height);
          const crop = computeCropRect(src.width, src.height, ratio);
          if (!crop) return { ok: false, error: 'no-crop' };
          const size = computeOutputSize(ratio, o.longEdge, {
            maxTexture: gl.capabilities.maxTextureSize,
            maxPixels: MAX_PIXELS,
            maxLongEdge: Math.max(crop.w, crop.h),
          });
          if (!size) return { ok: false, error: 'no-size' };
          out = document.createElement('canvas');
          out.width = size.width;
          out.height = size.height;
          const ctx = out.getContext('2d');
          if (!ctx) return { ok: false, error: 'encode' };
          if (o.format === 'jpeg') {
            // JPEG không có alpha: nền trắng cho vùng trong suốt. PNG giữ nguyên alpha của canvas.
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size.width, size.height);
          }
          ctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, size.width, size.height);
          try {
            const probe = ctx.getImageData(0, 0, Math.min(64, size.width), Math.min(64, size.height));
            const mid = ctx.getImageData(size.width >> 1, size.height >> 1, Math.min(64, size.width >> 1 || 1), Math.min(64, size.height >> 1 || 1));
            if (isBlankPixels(probe.data) && isBlankPixels(mid.data)) return { ok: false, error: 'blank' };
          } catch {
            return { ok: false, error: 'tainted' };
          }
          const { mime } = formatInfo(o.format);
          const blob = await new Promise<Blob | null>((res) => {
            try {
              out!.toBlob(res, mime, o.quality ?? 0.92);
            } catch {
              res(null);
            }
          });
          if (!blob || blob.size === 0 || blob.type !== mime) return { ok: false, error: 'encode' };
          const date = new Date();
          return {
            ok: true,
            blob,
            fileName: buildPhotoFileName({ mode, width: size.width, height: size.height, format: o.format, date }),
            width: size.width,
            height: size.height,
            reducedReason: size.reason,
            metadata: buildPhotoMetadata({
              date,
              mode,
              width: size.width,
              height: size.height,
              format: o.format,
              aspect: o.aspect,
              hudHidden: o.hudHidden,
            }),
          };
        } catch (e) {
          if (e instanceof DOMException && e.name === 'SecurityError') return { ok: false, error: 'tainted' };
          return { ok: false, error: 'encode' };
        } finally {
          if (out) {
            out.width = 0;
            out.height = 0;
          }
          busy.current = false;
        }
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [gl, scene, camera, mode, apiRef]);

  return null;
}
