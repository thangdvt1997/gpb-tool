// Năm cây có sẵn trong văn phòng. Chỉ dùng để seed khi khởi động và kiểm tra id đầu vào.
// species chỉ để hiển thị, không ảnh hưởng mô phỏng.
export const PLANT_CATALOG = [
  { id: 'plant_lobby', name: 'Cây lưỡi hổ (sảnh)', species: 'snake' },
  { id: 'plant_lounge_a', name: 'Cây trầu bà (lounge A)', species: 'pothos' },
  { id: 'plant_lounge_b', name: 'Cây kim tiền (lounge B)', species: 'zz' },
  { id: 'plant_meeting', name: 'Cây bạch mã (phòng họp)', species: 'palm' },
  { id: 'plant_north', name: 'Cây sen đá (khu Bắc)', species: 'succulent' },
];

export const PLANT_IDS = new Set(PLANT_CATALOG.map((plant) => plant.id));

// Trạng thái ban đầu khi seed. Cây được coi như đã trồng 2 ngày, chưa có lịch sử mô phỏng.
export const SEED_STATE = { water: 80, health: 90, pests: 0, flowers: 0, leaves: 12 };
export const SEED_AGE_DAYS = 2;
