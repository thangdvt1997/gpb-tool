// Danh sách phòng đặt được (seed). Id phải khớp với các object có action "booking" trong src/content/zones/it.json.
// mr1 đến mr3 chưa có zone trong yêu cầu, đặt tạm 'Chưa xác định'.
export const ROOMS = Object.freeze([
  { id: 'mr1', name: 'Phòng họp 1', capacity: 8, zone: 'Chưa xác định' },
  { id: 'mr2', name: 'Phòng họp 2', capacity: 10, zone: 'Chưa xác định' },
  { id: 'mr3', name: 'Phòng họp 3', capacity: 12, zone: 'Chưa xác định' },
  { id: 'util_quiet', name: 'Phòng nghỉ yên tĩnh', capacity: 4, zone: 'Khu L1' },
  { id: 'util_health', name: 'Phòng y tế và phòng mẹ và bé', capacity: 2, zone: 'Lounge' },
]);
