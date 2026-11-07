/**
 * Trả focus về nút mở sau khi hộp thoại đã tháo khỏi DOM.
 * Hoãn hai khung hình: nếu focus ngay trong lúc tháo hộp thoại aria-modal, Chrome chưa dựng lại cây trợ năng
 * cho phần trang bị che, NVDA đọc trạng thái cũ của nút (aria-expanded="true" thay vì "false").
 * Chỉ trả focus khi focus hiện đang ở body (không giành focus người dùng đã chuyển sang chỗ khác).
 */
export function restoreFocusLater(target: HTMLElement | null | undefined): void {
  if (!target) return;
  let done = false;
  const run = (): void => {
    if (done) return;
    done = true;
    if (!target.isConnected) return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) return;
    target.focus();
  };
  // Cảnh 3D nặng (GPU phần mềm) có thể làm một khung hình kéo dài cả giây: hẹn giờ 120 ms là mốc dự phòng.
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(run));
  setTimeout(run, 120);
}
