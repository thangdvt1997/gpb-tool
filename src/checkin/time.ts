const TZ = 'Asia/Ho_Chi_Minh'; // UTC+7, không có giờ mùa hè

const timeFmt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Giờ HH:mm theo UTC+7 từ chuỗi ISO. Trả về chuỗi rỗng nếu không đọc được. */
export function formatTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : timeFmt.format(d);
}
