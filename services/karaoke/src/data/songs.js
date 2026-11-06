// Bài hát tự sáng tác bằng mã: danh sách nốt MIDI do nhóm viết.
// Không chứa lời hay giai điệu của người khác. Không thêm bài từ nguồn không rõ giấy phép.

const LICENSE = 'Tự sáng tác, giấy phép nội bộ';
const ARTIST = 'Giai điệu nội bộ';
const REST = null;

// Mỗi phần tử của sequence: [midi hoặc REST, số phách]. Một phách = một nốt đen.
// Thời điểm bắt đầu và độ dài tính từ tổng số phách nên không bị lệch do làm tròn.
function buildSong({ id, title, bpm, sequence }) {
  const beatMs = 60000 / bpm;
  const notes = [];
  let beats = 0;
  for (const [midi, length] of sequence) {
    const startMs = Math.round(beats * beatMs);
    beats += length;
    if (midi !== REST) {
      const durationMs = Math.round(beats * beatMs) - startMs;
      notes.push(Object.freeze({ midi, startMs, durationMs }));
    }
  }
  return Object.freeze({
    id,
    title,
    artist: ARTIST,
    durationMs: Math.round(beats * beatMs),
    source: 'generated',
    license: LICENSE,
    notes: Object.freeze(notes),
  });
}

// Nhịp 4/4, 100 BPM, thang C4 (60) đến C5 (72). Tổng 76 phách = 45,6 giây.
const NANG_SOM_SEQUENCE = [
  [REST, 8], // Nhạc dạo hai ô nhịp
  // Đoạn A
  [60, 1], [64, 1], [67, 2],
  [69, 1], [67, 1], [64, 2],
  [62, 1], [65, 1], [69, 1], [67, 1],
  [67, 4],
  // Đoạn A' cao hơn
  [72, 1], [69, 1], [67, 2],
  [65, 1], [64, 1], [62, 2],
  [64, 1], [65, 1], [67, 1], [64, 1],
  [60, 2], [REST, 2],
  // Đoạn B
  [69, 2], [72, 2],
  [71, 1], [69, 1], [67, 1], [65, 1],
  [64, 2], [62, 1], [60, 1],
  [62, 1], [64, 1], [65, 1], [67, 1],
  // Lặp đoạn A, kết bằng nốt C4
  [60, 1], [64, 1], [67, 2],
  [69, 1], [67, 1], [64, 2],
  [62, 1], [65, 1], [69, 1], [67, 1],
  [67, 2], [60, 2],
  // Kết
  [60, 4],
];

// Nhịp 4/4, 80 BPM, thang G3 (55) đến A4 (69). Tổng 60 phách = 45 giây.
const HOANG_HON_SEQUENCE = [
  [REST, 4], // Nhạc dạo một ô nhịp
  // Đoạn A
  [57, 2], [60, 1], [64, 1],
  [62, 2], [59, 1], [57, 1],
  [55, 1], [57, 1], [60, 2],
  [57, 4],
  // Đoạn B
  [64, 1], [65, 1], [64, 1], [62, 1],
  [60, 2], [59, 2],
  [57, 1], [59, 1], [60, 1], [62, 1],
  [64, 2], [69, 2],
  // Đoạn A' cao hơn
  [69, 1], [67, 1], [64, 2],
  [65, 1], [64, 1], [62, 2],
  [60, 1], [62, 1], [64, 2],
  [60, 2], [57, 2],
  // Kết
  [57, 2], [64, 2],
  [57, 4],
];

const MIDI_MIN = 0;
const MIDI_MAX = 127;

// Kiểm tra dữ liệu khi nạp module: sai thì ném lỗi để service không khởi động với dữ liệu hỏng.
function assertValidSong(song) {
  if (typeof song.license !== 'string' || song.license.trim() === '') {
    throw new Error(`Bài ${song.id} thiếu trường license`);
  }
  let prevEnd = 0;
  for (const note of song.notes) {
    if (!Number.isInteger(note.midi) || note.midi < MIDI_MIN || note.midi > MIDI_MAX) {
      throw new Error(`Bài ${song.id} có nốt midi ngoài khoảng: ${note.midi}`);
    }
    if (!Number.isInteger(note.durationMs) || note.durationMs <= 0) {
      throw new Error(`Bài ${song.id} có nốt có độ dài không hợp lệ`);
    }
    // startMs phải >= kết thúc nốt trước: vừa tăng dần vừa không chồng lấn.
    if (!Number.isInteger(note.startMs) || note.startMs < prevEnd) {
      throw new Error(`Bài ${song.id} có nốt không tăng dần hoặc bị chồng lấn`);
    }
    prevEnd = note.startMs + note.durationMs;
  }
}

export const SONGS = Object.freeze([
  buildSong({ id: 'nang-som', title: 'Giai điệu nắng sớm', bpm: 100, sequence: NANG_SOM_SEQUENCE }),
  buildSong({ id: 'hoang-hon', title: 'Giai điệu hoàng hôn', bpm: 80, sequence: HOANG_HON_SEQUENCE }),
]);

for (const song of SONGS) assertValidSong(song);

export function listSongs() {
  return SONGS;
}

export function getSongById(id) {
  return SONGS.find((song) => song.id === id) ?? null;
}
