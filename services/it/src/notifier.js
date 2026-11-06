// Stub: chỉ ghi log, không gửi gì ra ngoài. Thay bằng kênh thật (chat/email) khi có yêu cầu.
export function notify(event) {
  console.log(`[notifier] ${event.type} ${event.id} severity=${event.severity}`);
}
