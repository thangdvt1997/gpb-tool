/** Tải blob xuống qua object URL tạm; luôn giải phóng URL. Không dùng data URL làm định danh. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Để trình duyệt kịp bắt đầu tải rồi mới thu hồi.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** Tạo URL xem trước; người gọi phải gọi hàm trả về để thu hồi. */
export function createPreview(blob: Blob): { url: string; revoke: () => void } {
  const url = URL.createObjectURL(blob);
  let done = false;
  return {
    url,
    revoke: () => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
    },
  };
}
