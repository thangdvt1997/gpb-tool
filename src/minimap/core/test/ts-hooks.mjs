// Hook nạp module chỉ dùng trong test: cho phép import trực tiếp file .ts thật của dự án (layout.ts,
// officeBounds.ts, officePropsLayout.ts, entry/placement.ts) bằng tính năng bỏ kiểu của Node (>= 22.18 / 23.6),
// để test dùng đúng nguồn dữ liệu của cảnh 3D thay vì chép số liệu.
// - Import tương đối không đuôi từ file .ts: thử thêm '.ts'.
// - 'three': thay bằng bản giả tối thiểu (máy chưa cài node_modules; test không gọi hàm nào của three).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, next) {
  if (specifier === 'three') {
    return { url: new URL('./three-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  const parent = context.parentURL ?? '';
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    parent.endsWith('.ts') &&
    !/\.(m|c)?(j|t)sx?$|\.json$/.test(specifier)
  ) {
    const url = new URL(specifier + '.ts', parent);
    if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
  }
  return next(specifier, context);
}
