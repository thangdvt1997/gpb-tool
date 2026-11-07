/**
 * Hợp đồng dữ liệu asset 3D (schemaVersion 1).
 * Chuẩn đầy đủ: docs/design/ASSET_STANDARD.md.
 *
 * File này chỉ chứa kiểu (không có giá trị runtime) để validate.ts và
 * scripts/assets/validate-manifest.mjs dùng chung qua `import type`
 * (Node 24 tự bỏ kiểu khi chạy file .ts).
 */

export type Vec3 = [number, number, number];

/** Loại asset. Đồ tĩnh (furniture, prop, chair, door, drawer, accessory) không bắt buộc rig. */
export type AssetType =
  | 'character'
  | 'animation'
  | 'furniture'
  | 'chair'
  | 'door'
  | 'drawer'
  | 'accessory'
  | 'prop';

/**
 * Vị trí origin của asset.
 * - feet-center: nhân vật, giữa hai bàn chân trên mặt sàn.
 * - base-center: bàn, tủ, đồ đặt sàn, tâm đáy chân đế trên mặt sàn.
 * - seat-center: ghế, tâm chân sao (trục xoay) trên mặt sàn.
 * - hinge: cửa, trên trục bản lề, ở mép dưới cánh.
 * - slide-axis: ngăn kéo, trên trục trượt, mặt trước khi đóng.
 * - attach-point: phụ kiện, điểm gắn vào socket.
 * - custom: phải ghi lý do trong `note`.
 */
export type PivotKind =
  | 'feet-center'
  | 'base-center'
  | 'seat-center'
  | 'hinge'
  | 'slide-axis'
  | 'attach-point'
  | 'custom';

export interface Pivot {
  kind: PivotKind;
  /** Độ lệch từ origin file tới pivot chuẩn, đơn vị mét, trong không gian asset. */
  offset: Vec3;
  /** Trục quay/trượt (vector đơn vị) cho hinge/slide-axis. */
  axis?: Vec3;
  note?: string;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
  /** rest: tư thế nghỉ của mesh có skin; local: hộp bao mesh tĩnh. */
  space: 'rest' | 'local';
  /** Cách có số đo, ví dụ "accessor POSITION min/max". Không ghi số ước lượng ở đây. */
  measuredBy: string;
}

export type ColliderProfile =
  | { shape: 'none' }
  | { shape: 'box'; size: Vec3; center: Vec3 }
  | { shape: 'capsule'; radius: number; height: number }
  | { shape: 'cylinder'; radius: number; height: number };

export interface Lod {
  level: number;
  /** URL tương đối so với manifest. LOD 0 thường trùng `url` của asset. */
  url: string;
  /** Số tam giác đã đo. null = chưa đo. */
  triangles: number | null;
}

export type AlphaMode = 'OPAQUE' | 'MASK' | 'BLEND';

export interface MaterialSpec {
  name: string;
  alphaMode: AlphaMode;
  /** Chỉ dùng khi alphaMode = MASK. */
  alphaCutoff?: number;
  doubleSided: boolean;
  /** Ghi các map đang có. Màu (baseColor, emissive) = sRGB; còn lại = linear. */
  maps: Array<'baseColor' | 'normal' | 'metallicRoughness' | 'occlusion' | 'emissive' | 'alpha'>;
  /** true khi đã duyệt việc dùng BLEND (kính, tóc). Mặc định validator cảnh báo BLEND. */
  blendApproved?: boolean;
  /** Chế độ alpha runtime thực dùng khi file gốc xuất BLEND (loader ép lại, ví dụ fixMaterials trong MpfbAvatar). */
  runtimeAlphaMode?: 'OPAQUE' | 'MASK';
  /** ID material dùng chung (ví dụ "real.wood.oak"), nếu có. */
  shared?: string;
}

export interface Socket {
  /** Tên chuẩn, xem SOCKET_NAMES trong validate.ts. */
  name: string;
  /** Gắn theo xương (nhân vật) hoặc node (đồ tĩnh). Có đúng một trong hai, hoặc không có cả hai = gắn vào root. */
  bone?: string;
  node?: string;
  offset: Vec3;
  /** Góc Euler XYZ, độ. */
  rotationDeg?: Vec3;
  /** true = offset đã chỉnh bằng mắt trong scene hoặc đo từ xương/mesh thật (scripts/assets/measure-sockets.mjs). false = mới đặt tại gốc xương. */
  calibrated: boolean;
}

export interface RigProfile {
  id: string;
  /** Danh sách xương đúng thứ tự skin.joints trong file. */
  bones: string[];
  rootBone: string;
  restPose: 'T' | 'A' | 'other' | 'unknown';
  units: 'm';
  rootMotion: 'in-place' | 'root-motion' | 'unknown';
  /** Ánh xạ tên humanoid (VRM/Unity) sang tên xương của rig để retarget. */
  retargetMap: Record<string, string>;
  note?: string;
}

export interface MorphCapabilities {
  targets: string[];
  /** Nhóm gợi ý, ví dụ face/body. Chỉ chứa tên có trong `targets`. */
  groups?: Record<string, string[]>;
}

export interface Clip {
  name: string;
  durationSec: number | null;
  loop: boolean;
  rootMotion: 'in-place' | 'root-motion' | 'unknown';
}

export interface LicenseInfo {
  /** SPDX nếu có, ví dụ "CC0-1.0", "CC-BY-4.0". */
  spdx: string;
  source: string;
  sourceUrl?: string;
  author?: string;
  /** Công cụ tạo/chuyển đổi và license của công cụ (không phải license của asset). */
  tool?: { name: string; license: string; url?: string };
  attributionRequired: boolean;
  attribution?: string;
  /** Đường dẫn file gốc trước khi chép vào public/. */
  originPath?: string;
  checkedAt: string;
  verified: boolean;
}

export interface AssetEntry {
  assetId: string;
  type: AssetType;
  version: string;
  hash: { algo: 'sha256'; value: string };
  bytes: number;
  /** Tương đối so với file manifest, không bắt đầu bằng "/", không có "..". */
  url: string;
  format: 'glb' | 'gltf';
  /** Tỷ lệ nhập (đồng nhất). Asset đúng chuẩn mét = 1. */
  scale: number;
  bounds: Bounds;
  pivot: Pivot;
  colliderProfile?: ColliderProfile;
  lods?: Lod[];
  materials?: MaterialSpec[];
  sockets?: Socket[];
  /** ID trong manifest.rigProfiles. */
  rigProfile?: string;
  morphCapabilities?: MorphCapabilities;
  /** animation: các clip có trong file. */
  clips?: Clip[];
  /** character: các clip cần có. Thiếu thì validator cảnh báo. */
  expectedClips?: string[];
  /** accessory: tên socket trên nhân vật để gắn. */
  attachTo?: string;
  license: LicenseInfo;
  /** Ghi chú trạng thái/lỗi đã biết. */
  knownIssues?: string[];
}

export interface AssetManifest {
  schemaVersion: 1;
  units: 'm';
  upAxis: 'Y';
  /** Hướng nhìn trước của nhân vật và mặt trước đồ vật trong không gian asset. */
  forward: '+Z';
  generatedAt?: string;
  rigProfiles: Record<string, RigProfile>;
  assets: AssetEntry[];
}

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  severity: Severity;
  code: string;
  /** null khi lỗi ở cấp manifest. */
  assetId: string | null;
  /** Đường dẫn trường, ví dụ "assets[0].bounds.min[1]". */
  path: string;
  message: string;
  fix: string;
}

/** Thông tin đọc từ file GLB (do môi trường Node cung cấp; trình duyệt có thể bỏ qua). */
export interface GlbFacts {
  bytes: number;
  sha256: string;
  triangles: number;
  boundsMin: Vec3;
  boundsMax: Vec3;
  joints: string[];
  morphTargets: string[];
  animations: string[];
  nodes: string[];
  materials: Array<{ name: string; alphaMode: AlphaMode; doubleSided: boolean }>;
}

export interface ValidateOptions {
  /** Trả về true nếu URL (đã resolve theo manifest) tồn tại. Bỏ qua kiểm tra file nếu không có. */
  fileExists?: (url: string) => boolean;
  /** Đọc thông tin GLB. Trả về null nếu không đọc được. */
  readGlb?: (url: string) => GlbFacts | null;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
