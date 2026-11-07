/**
 * Bảo vệ mesh thân khỏi hai bộ dựng vỏ cùng lúc. Mỗi MpfbOutfit "nhận" mesh thân trước khi đổi geometry da;
 * bộ thứ hai thấy geometry da đã bị bộ thứ nhất thay (thiếu tam giác) và coi đó là geometry gốc, nên phân vùng sai,
 * vỏ gần như rỗng và da bị ẩn không được vỏ che: thân biến mất. Geometry gốc cũng được ghi nhớ trên mesh để
 * mọi lần dọn đều trả đúng bản gốc.
 */
import type * as THREE from 'three';

// WeakMap thay vì userData: Object3D.clone() sao chép userData qua JSON nên sẽ mang theo dữ liệu sai sang bản sao.
const OWNER = new WeakMap<THREE.Mesh, object>();
const BASE = new WeakMap<THREE.Mesh, THREE.BufferGeometry>();

/** Nhận mesh thân. false nếu bộ dựng khác đang giữ (không được đụng vào mesh). */
export function claimBody(body: THREE.Mesh, token: object): boolean {
  const cur = OWNER.get(body);
  if (cur && cur !== token) return false;
  OWNER.set(body, token);
  if (!BASE.has(body)) BASE.set(body, body.geometry);
  return true;
}

/** Geometry gốc của thân (trước mọi thay đổi của vỏ). */
export function baseGeometryOf(body: THREE.Mesh): THREE.BufferGeometry {
  return BASE.get(body) ?? body.geometry;
}

export function releaseBody(body: THREE.Mesh, token: object): void {
  if (OWNER.get(body) !== token) return;
  const base = BASE.get(body);
  if (base) body.geometry = base;
  OWNER.delete(body);
}

/** Dấu hiệu nhận ra shader của vỏ trang phục trong mã fragment (để phát hiện lỗi biên dịch của chính vỏ). */
export const SHELL_SHADER_MARKER = 'uPatMap';

export function isShellShaderSource(fragmentSource: string | null | undefined): boolean {
  return !!fragmentSource && fragmentSource.includes(SHELL_SHADER_MARKER);
}
