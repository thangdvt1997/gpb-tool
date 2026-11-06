// Mô phỏng chu kỳ sống của cây. Hàm thuần: không đọc DB, không đọc đồng hồ hệ thống.
//
// State là object phẳng (thời gian tính bằng epoch ms):
//   { id, name, species, plantedAt, tickAt, water, health, pests, flowers, leaves,
//     seed, lastWaterAt, lastFertilizeAt }
// tickAt luôn nằm trên ranh giới phút: state đã được mô phỏng đến phút đó.
//
// Mô phỏng theo từng phút tuyệt đối (floor(ms / 60000)). Mỗi phút dùng RNG băm từ
// (seed của cây, chỉ số phút), nên kết quả không đổi dù đọc thường xuyên hay thưa,
// trừ khi cây vắng quá 7 ngày (xem MAX_CATCHUP_MINUTES: phần đầu bị bỏ qua).

export const MINUTE_MS = 60_000;
export const DAY_MS = 24 * 60 * MINUTE_MS;
// Thời gian vắng quá 7 ngày không được mô phỏng bù (chỉ mô phỏng 7 ngày gần nhất).
export const MAX_CATCHUP_MINUTES = 7 * 24 * 60;

const WATER_DECAY_PER_MIN = 0.4;
const WATER_LOW = 25;
const WATER_OK = 60;
const HEALTH_DROP_THIRSTY_PER_MIN = 0.05;
const HEALTH_GAIN_WATERED_PER_MIN = 0.02;
const PEST_HEALTH_MIN = 30; // sâu chỉ xuất hiện khi health > 30
const PEST_CHANCE_PER_MIN = 1 / 240;
const MAX_PESTS = 5;
const PEST_DRAIN_PER_MIN = 0.01; // mỗi con sâu
const FLOWER_HEALTH_MIN = 50; // cần health > 50
const FLOWER_INTERVAL_MIN = 120;
const MAX_FLOWERS = 8;
const LEAF_LOSS_HEALTH_MAX = 40; // rụng lá khi health < 40
const LEAF_LOSS_CHANCE_PER_MIN = 1 / 60;
const LEAF_GROW_HEALTH_MIN = 70; // mọc lá khi health >= 70
const LEAF_GROW_CHANCE_PER_MIN = 1 / 180;
const MAX_LEAVES = 24;

const WATER_AMOUNT = 40;
const WATER_COOLDOWN_MS = 5 * MINUTE_MS;
const FERTILIZE_COOLDOWN_MS = 60 * MINUTE_MS;

// Ngưỡng hiển thị "cần làm gì".
const NEEDS_WATER_BELOW = 60;
const NEEDS_FERTILIZE_BELOW = 60;
const NEEDS_PRUNE_AT = 18;

export const CARE_ACTIONS = ['water', 'remove_pests', 'pick_flowers', 'prune_leaves', 'fertilize'];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Hạt giống FNV-1a 32 bit từ id cây. Lưu vào cột seed khi tạo cây.
export function seedFromId(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// RNG xác định cho một phút: băm (seed, minute) rồi chạy mulberry32. Cùng đầu vào cho cùng dãy số.
function randomFor(seed, minute) {
  let x = (seed ^ Math.imul(minute, 0x9e3779b1)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  let state = x;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ageDaysOf(state, nowMs) {
  return Math.max(0, Math.floor((nowMs - state.plantedAt) / DAY_MS));
}

// Giai đoạn, tính từ tuổi và health ngay lúc gọi (không lưu riêng).
// Thứ tự ưu tiên: wilted > seedling > growing/mature/flowering.
// - seedling: dưới 1 ngày tuổi.
// - growing: từ 1 đến dưới 3 ngày, health dưới 40.
// - mature: health từ 40 trở lên mà chưa đủ 3 ngày để ra hoa; hoặc từ 3 ngày trở lên nhưng health từ 20 đến dưới 40.
// - flowering: từ 3 ngày trở lên và health từ 40 trở lên.
export function stageOf(state, nowMs) {
  if (state.health < 20) return 'wilted';
  const age = nowMs - state.plantedAt;
  if (age < DAY_MS) return 'seedling';
  const healthy = state.health >= 40;
  if (age < 3 * DAY_MS) return healthy ? 'mature' : 'growing';
  return healthy ? 'flowering' : 'mature';
}

export function statusOf(state) {
  if (state.health < 20) return 'wilting';
  if (state.water < WATER_LOW) return 'thirsty';
  if (state.pests > 0) return 'pests';
  return 'healthy';
}

export function needsOf(state) {
  const needs = [];
  if (state.water < NEEDS_WATER_BELOW) needs.push('water');
  if (state.pests > 0) needs.push('pests');
  if (state.leaves >= NEEDS_PRUNE_AT) needs.push('prune');
  if (state.health < NEEDS_FERTILIZE_BELOW) needs.push('fertilize');
  return needs;
}

// Một phút mô phỏng, sửa trực tiếp object s (chỉ dùng bên trong advance trên bản sao).
// Luôn rút đủ 3 số ngẫu nhiên mỗi phút để dãy số không phụ thuộc điều kiện.
function stepInPlace(s, minute) {
  const draw = randomFor(s.seed, minute);
  const rPest = draw();
  const rLeafLoss = draw();
  const rLeafGrow = draw();

  // 1. Nước giảm đều.
  s.water = Math.max(0, s.water - WATER_DECAY_PER_MIN);

  // 2. Sâu xuất hiện, xét health đầu phút (chưa đổi ở bước 3).
  if (s.health > PEST_HEALTH_MIN && s.pests < MAX_PESTS && rPest < PEST_CHANCE_PER_MIN) {
    s.pests += 1;
  }

  // 3. Sức khỏe: thiếu nước làm giảm, đủ nước và không có sâu thì hồi nhẹ, sâu luôn rút bớt.
  let delta = -PEST_DRAIN_PER_MIN * s.pests;
  if (s.water < WATER_LOW) delta -= HEALTH_DROP_THIRSTY_PER_MIN;
  else if (s.water >= WATER_OK && s.pests === 0) delta += HEALTH_GAIN_WATERED_PER_MIN;
  s.health = clamp(s.health + delta, 0, 100);

  // 4. Hoa: tại các phút chia hết cho 120 (theo đồng hồ), nếu đang ra hoa và health > 50 thì thêm 1 hoa.
  if (
    minute % FLOWER_INTERVAL_MIN === 0 &&
    s.health > FLOWER_HEALTH_MIN &&
    s.flowers < MAX_FLOWERS &&
    stageOf(s, minute * MINUTE_MS) === 'flowering'
  ) {
    s.flowers += 1;
  }

  // 5. Lá: rụng khi health thấp, mọc khi health tốt.
  if (s.health < LEAF_LOSS_HEALTH_MAX && s.leaves > 0 && rLeafLoss < LEAF_LOSS_CHANCE_PER_MIN) {
    s.leaves -= 1;
  }
  if (s.health >= LEAF_GROW_HEALTH_MIN && s.leaves < MAX_LEAVES && rLeafGrow < LEAF_GROW_CHANCE_PER_MIN) {
    s.leaves += 1;
  }
}

// Đưa state tới nowMs: chạy từng phút từ tickAt (không gồm) đến phút hiện tại (gồm).
// Trả về object mới, hoặc chính state nếu không có phút nào trôi qua.
export function advance(state, nowMs) {
  const endMinute = Math.floor(nowMs / MINUTE_MS);
  let minute = Math.floor(state.tickAt / MINUTE_MS);
  if (endMinute <= minute) return state;
  if (endMinute - minute > MAX_CATCHUP_MINUTES) minute = endMinute - MAX_CATCHUP_MINUTES;

  const next = { ...state };
  for (let m = minute + 1; m <= endMinute; m += 1) {
    stepInPlace(next, m);
  }
  next.tickAt = endMinute * MINUTE_MS;
  return next;
}

// Trạng thái ban đầu khi seed. Cây được tạo ageDays ngày trước, mô phỏng bắt đầu từ bây giờ.
export function initialState(plant, nowMs, { ageDays, water, health, pests, flowers, leaves }) {
  return {
    id: plant.id,
    name: plant.name,
    species: plant.species,
    plantedAt: nowMs - ageDays * DAY_MS,
    tickAt: Math.floor(nowMs / MINUTE_MS) * MINUTE_MS,
    water,
    health,
    pests,
    flowers,
    leaves,
    seed: seedFromId(plant.id),
    lastWaterAt: null,
    lastFertilizeAt: null,
  };
}

function accept(state, message) {
  return { ok: true, state, message };
}

function reject(status, error) {
  return { ok: false, status, error };
}

// Áp dụng một hành động chăm sóc lên state ĐÃ được advance tới nowMs.
// Trả { ok: true, state, message } hoặc { ok: false, status, error }. Không sửa state đầu vào.
export function applyCare(state, action, nowMs) {
  switch (action) {
    case 'water': {
      if (state.lastWaterAt !== null && nowMs - state.lastWaterAt < WATER_COOLDOWN_MS) {
        return reject(409, 'Cây vừa được tưới, đợi thêm vài phút.');
      }
      const water = Math.min(100, state.water + WATER_AMOUNT);
      const message = water >= WATER_OK ? 'Đã tưới nước. Cây đã đủ nước.' : 'Đã tưới nước. Cây vẫn cần thêm nước.';
      return accept({ ...state, water, health: Math.min(100, state.health + 2), lastWaterAt: nowMs }, message);
    }
    case 'remove_pests': {
      if (state.pests === 0) return reject(409, 'Cây không có sâu.');
      return accept({ ...state, pests: 0, health: Math.min(100, state.health + 3) }, 'Đã bắt hết sâu. Cây khỏe hơn.');
    }
    case 'pick_flowers': {
      if (state.flowers === 0) return reject(409, 'Cây chưa có hoa.');
      return accept({ ...state, flowers: 0 }, 'Đã hái hết hoa.');
    }
    case 'prune_leaves': {
      if (state.leaves === 0) return reject(409, 'Cây không còn lá để tỉa.');
      const removed = Math.max(1, Math.floor(state.leaves * 0.2));
      return accept(
        { ...state, leaves: state.leaves - removed, health: Math.min(100, state.health + 1) },
        `Đã tỉa ${removed} lá.`,
      );
    }
    case 'fertilize': {
      if (state.lastFertilizeAt !== null && nowMs - state.lastFertilizeAt < FERTILIZE_COOLDOWN_MS) {
        return reject(409, 'Cây vừa được bón phân, đợi thêm một lúc.');
      }
      return accept(
        { ...state, health: Math.min(100, state.health + 8), lastFertilizeAt: nowMs },
        'Đã bón phân. Cây khỏe hơn.',
      );
    }
    default:
      return reject(400, 'Hành động chăm sóc không hợp lệ');
  }
}

// Dạng trả về cho client. health và water làm tròn; các giá trị khác giữ nguyên.
export function viewPlant(state, nowMs) {
  return {
    id: state.id,
    name: state.name,
    species: state.species,
    stage: stageOf(state, nowMs),
    health: Math.round(state.health),
    water: Math.round(state.water),
    pests: state.pests,
    flowers: state.flowers,
    leaves: state.leaves,
    ageDays: ageDaysOf(state, nowMs),
    status: statusOf(state),
    needs: needsOf(state),
    updatedAt: new Date(state.tickAt).toISOString(),
  };
}
