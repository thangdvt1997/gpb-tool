import { Component, Suspense, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import type { Appearance } from './appearance';
import { computePose, createPoseScratch, type AvatarAnimation } from './animation';
import { sampleEmotePose } from '../emotes/player';
import { applyPoseToVrm, type VrmEmoteBones } from '../emotes/applyPose';
import { FallbackAvatar } from './FallbackAvatar';

/** Đường dẫn mặc định của mô hình VRM. Repo không kèm file này. */
export const DEFAULT_VRM_URL = '/models/base.vrm';

/** Gắn plugin VRM vào GLTFLoader. Hàm để ngoài component nên giữ nguyên qua các lần render. */
function registerVrmPlugin(loader: GLTFLoader): void {
  loader.register((parser) => new VRMLoaderPlugin(parser));
}

/** Kiểm tra đối tượng VRM có các trường cần dùng hay không. */
function isVrm(value: unknown): value is VRM {
  return typeof value === 'object' && value !== null && 'humanoid' in value && 'scene' in value;
}

/**
 * Chuẩn bị VRM sau khi tải: bỏ đỉnh thừa, xoay model VRM 0.x để mặt hướng về +Z.
 * Ném lỗi nếu tệp không có dữ liệu VRM, để ErrorBoundary chuyển sang nhân vật dự phòng.
 */
function prepareVrm(gltf: GLTF): VRM {
  const candidate: unknown = gltf.userData.vrm;
  if (!isVrm(candidate)) {
    throw new Error('Tệp mô hình không phải VRM hợp lệ.');
  }
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  if (candidate.meta.metaVersion === '0') {
    VRMUtils.rotateVRM0(candidate);
  }
  return candidate;
}

interface VrmModelProps {
  url: string;
  animation: AvatarAnimation;
  emote: boolean;
}

/**
 * Hiển thị mô hình VRM đã tải. Tư thế được áp lên xương chuẩn hóa (đầu, chân, gốc),
 * tay không điều khiển vì tư thế T của VRM khác rig dự phòng.
 */
function VrmModel({ url, animation, emote }: VrmModelProps) {
  const gltf = useLoader(GLTFLoader, url, registerVrmPlugin);
  const vrm = useMemo(() => prepareVrm(gltf), [gltf]);
  const bones = useMemo<VrmEmoteBones>(
    () => ({
      scene: vrm.scene,
      head: vrm.humanoid.getNormalizedBoneNode('head'),
      leftUpperArm: vrm.humanoid.getNormalizedBoneNode('leftUpperArm'),
      rightUpperArm: vrm.humanoid.getNormalizedBoneNode('rightUpperArm'),
      leftUpperLeg: vrm.humanoid.getNormalizedBoneNode('leftUpperLeg'),
      rightUpperLeg: vrm.humanoid.getNormalizedBoneNode('rightUpperLeg'),
    }),
    [vrm],
  );
  // Gối: chỉ animation thường dùng (ngồi, nhảy, chạy). Emote không điều khiển gối.
  const knees = useMemo(
    () => ({
      left: vrm.humanoid.getNormalizedBoneNode('leftLowerLeg'),
      right: vrm.humanoid.getNormalizedBoneNode('rightLowerLeg'),
    }),
    [vrm],
  );
  const scratch = useMemo(createPoseScratch, []);
  const wasEmote = useRef(false);

  useFrame((state, delta) => {
    if (emote && sampleEmotePose(scratch)) {
      applyPoseToVrm(bones, scratch);
      if (knees.left) knees.left.rotation.x = 0;
      if (knees.right) knees.right.rotation.x = 0;
      wasEmote.current = true;
    } else {
      if (wasEmote.current) {
        // Hết emote: trả tay về tư thế T mặc định của VRM (animation thường không điều khiển tay).
        wasEmote.current = false;
        if (bones.leftUpperArm) bones.leftUpperArm.rotation.set(0, 0, 0);
        if (bones.rightUpperArm) bones.rightUpperArm.rotation.set(0, 0, 0);
      }
      const pose = computePose(animation, state.clock.elapsedTime);
      vrm.scene.position.y = pose.rootY;
      vrm.scene.rotation.y = pose.rootRotY;
      if (bones.head) {
        bones.head.rotation.z = pose.headRotZ;
        bones.head.rotation.y = pose.headRotY + pose.neckRotY;
      }
      if (bones.leftUpperLeg) bones.leftUpperLeg.rotation.x = pose.legLX;
      if (bones.rightUpperLeg) bones.rightUpperLeg.rotation.x = pose.legRX;
      if (knees.left) knees.left.rotation.x = pose.kneeLX;
      if (knees.right) knees.right.rotation.x = pose.kneeRX;
    }
    vrm.update(delta);
  });

  return <primitive object={vrm.scene} />;
}

interface ModelErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface ModelErrorBoundaryState {
  failed: boolean;
}

/** Bắt lỗi khi tải hoặc đọc mô hình, và hiển thị fallback thay vì làm vỡ cảnh. */
class ModelErrorBoundary extends Component<ModelErrorBoundaryProps, ModelErrorBoundaryState> {
  state: ModelErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ModelErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    console.warn('Không tải được mô hình VRM, dùng nhân vật dự phòng.', error);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface VrmAvatarProps {
  /** Đường dẫn tệp .vrm. Mặc định là DEFAULT_VRM_URL. */
  url?: string;
  appearance: Appearance;
  displayName?: string;
  animation?: AvatarAnimation;
  /** true: dùng tư thế từ bộ phát emote (chỉ nhân vật của chính người chơi). */
  emote?: boolean;
}

/**
 * Nhân vật VRM. Khi chưa có file, hoặc tải lỗi, hiển thị FallbackAvatar với cùng ngoại hình.
 * Ngoại hình (appearance) chỉ áp cho nhân vật dự phòng, mô hình VRM giữ nguyên diện mạo của nó.
 */
export function VrmAvatar({ url = DEFAULT_VRM_URL, appearance, displayName, animation = 'idle', emote = false }: VrmAvatarProps) {
  const fallback = <FallbackAvatar appearance={appearance} displayName={displayName} animation={animation} emote={emote} />;
  return (
    <ModelErrorBoundary key={url} fallback={fallback}>
      <Suspense fallback={fallback}>
        <VrmModel url={url} animation={animation} emote={emote} />
      </Suspense>
    </ModelErrorBoundary>
  );
}
