/**
 * Danh sách vật thể người chơi được phép di chuyển. Bàn làm việc (desk_*) luôn cố định.
 * Id khớp với src/content/zones/it.json và các module hiển thị (tivi, bảng, cây).
 */
const MOVABLE: ReadonlySet<string> = new Set<string>([
  'service_desk',
  'games_corner',
  'karaoke_room',
  'kudos_board',
  'util_coffee',
  'pantry',
  'lounge',
  'tv_lobby',
  'tv_lounge',
  'tv_meeting',
  'whiteboard_mr1',
  'design_board',
  'plant_lobby',
  'plant_lounge_a',
  'plant_lounge_b',
  'plant_meeting',
  'plant_north',
]);

/** Mảng id di chuyển được, theo thứ tự cố định. Dùng để duyệt các vật đang nằm trên sàn. */
export const MOVABLE_IDS: readonly string[] = [...MOVABLE];

/** Bàn làm việc và mọi id bắt đầu bằng desk_: không bao giờ di chuyển được. */
export function isDesk(id: string): boolean {
  return id.startsWith('desk_');
}

/** true nếu vật thể nằm trong danh sách và không phải bàn làm việc. */
export function isMovable(id: string): boolean {
  return !isDesk(id) && MOVABLE.has(id);
}
