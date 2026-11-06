/** Mô hình mục thư viện thống nhất (task 18). Gộp manifest GLB, catalog thời trang, phụ kiện và đạo cụ văn phòng. */

export type LibraryKind = 'character' | 'outfit' | 'accessory' | 'furniture' | 'prop' | 'animation';

export const LIBRARY_KINDS: readonly LibraryKind[] = ['character', 'outfit', 'accessory', 'furniture', 'prop', 'animation'];

export const KIND_LABELS: Readonly<Record<LibraryKind, string>> = {
  character: 'Nhân vật',
  outfit: 'Trang phục',
  accessory: 'Phụ kiện',
  furniture: 'Nội thất',
  prop: 'Đạo cụ',
  animation: 'Hoạt ảnh',
};

/** Nguồn dữ liệu của mục. */
export type LibrarySource = 'manifest' | 'fashion-catalog' | 'accessory-catalog' | 'office-props';

export interface LibraryLicense {
  /** SPDX hoặc "LicenseRef-internal" cho đồ sinh bằng mã trong repo. Rỗng = thiếu giấy phép. */
  spdx: string;
  source: string;
  author?: string;
  attributionRequired: boolean;
  /** Đã có người kiểm tra giấy phép chưa. */
  verified: boolean;
}

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  /** Tên tiếng Việt. */
  name: string;
  description: string;
  tags: string[];
  license: LibraryLicense | null;
  /** URL GLB tương đối theo origin (ví dụ /models/male_real.glb). null = đồ dựng bằng mã, không có tệp. */
  file: string | null;
  bytes: number | null;
  triangles: number | null;
  version: string | null;
  source: LibrarySource;
  /** false = không dùng được (xem reasons). */
  usable: boolean;
  /** Lý do không dùng được hoặc cảnh báo. */
  reasons: string[];
  warnings: string[];
}
