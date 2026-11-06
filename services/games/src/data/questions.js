// Bộ câu hỏi đố vui kiến thức chung, do GPBank tự soạn (không sao chép từ nguồn khác).
// answer là chỉ số (0–3) của đáp án đúng. Trường answer không bao giờ được trả ra API.
const RAW_QUESTIONS = [
  {
    id: 1,
    text: 'Thủ đô của Việt Nam là thành phố nào?',
    choices: ['Thành phố Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Huế'],
    answer: 1,
  },
  {
    id: 2,
    text: 'Vịnh nào ở Quảng Ninh có hàng nghìn đảo đá vôi và được UNESCO công nhận là di sản thiên nhiên thế giới?',
    choices: ['Vịnh Hạ Long', 'Vịnh Nha Trang', 'Vịnh Vân Phong', 'Vịnh Cam Ranh'],
    answer: 0,
  },
  {
    id: 3,
    text: 'Đỉnh núi cao nhất Việt Nam có tên là gì?',
    choices: ['Bà Đen', 'Lang Biang', 'Fansipan', 'Bạch Mã'],
    answer: 2,
  },
  {
    id: 4,
    text: 'Hòn đảo lớn nhất Việt Nam là đảo nào?',
    choices: ['Cát Bà', 'Lý Sơn', 'Côn Đảo', 'Phú Quốc'],
    answer: 3,
  },
  {
    id: 5,
    text: 'Vùng nào của Việt Nam có sản lượng cà phê và hồ tiêu lớn nhất cả nước?',
    choices: ['Tây Nguyên', 'Đồng bằng sông Cửu Long', 'Đông Bắc Bộ', 'Tây Bắc'],
    answer: 0,
  },
  {
    id: 6,
    text: 'Vùng nào được coi là vựa lúa lớn nhất Việt Nam?',
    choices: ['Đồng bằng sông Hồng', 'Đồng bằng sông Cửu Long', 'Cao nguyên Lâm Viên', 'Cao nguyên Đồng Văn'],
    answer: 1,
  },
  {
    id: 7,
    text: 'Cơ quan nào trong cơ thể người có nhiệm vụ bơm máu đi khắp cơ thể?',
    choices: ['Phổi', 'Gan', 'Tim', 'Thận'],
    answer: 2,
  },
  {
    id: 8,
    text: 'Thực vật hấp thụ khí nào từ không khí để quang hợp?',
    choices: ['Oxy', 'Nitơ', 'Hiđrô', 'Cacbon đioxit'],
    answer: 3,
  },
  {
    id: 9,
    text: 'Bộ răng vĩnh viễn đầy đủ của người trưởng thành có bao nhiêu chiếc, kể cả răng khôn?',
    choices: ['32', '28', '30', '36'],
    answer: 0,
  },
  {
    id: 10,
    text: 'Xương nào là xương dài nhất trong cơ thể người?',
    choices: ['Xương chày', 'Xương đùi', 'Xương cánh tay', 'Xương sườn'],
    answer: 1,
  },
  {
    id: 11,
    text: 'Loài động vật nào có vú nhưng lại đẻ trứng?',
    choices: ['Cá heo', 'Dơi', 'Thú mỏ vịt', 'Thỏ'],
    answer: 2,
  },
  {
    id: 12,
    text: 'Tết Nguyên đán là ngày đầu của tháng nào trong lịch âm?',
    choices: ['Tháng 7', 'Tháng 8', 'Tháng 12', 'Tháng Giêng'],
    answer: 3,
  },
  {
    id: 13,
    text: 'Loại bánh nào có hình vuông, thường được gói trong dịp Tết?',
    choices: ['Bánh chưng', 'Bánh tét', 'Bánh trung thu', 'Bánh đa'],
    answer: 0,
  },
  {
    id: 14,
    text: 'Tác giả của truyện thơ Truyện Kiều là ai?',
    choices: ['Hồ Xuân Hương', 'Nguyễn Trãi', 'Nguyễn Du', 'Tố Hữu'],
    answer: 2,
  },
  {
    id: 15,
    text: 'Quốc khánh Việt Nam được tổ chức vào ngày nào?',
    choices: ['30 tháng 4', '19 tháng 5', '20 tháng 11', '2 tháng 9'],
    answer: 3,
  },
  {
    id: 16,
    text: 'Đơn vị đo nhiệt độ cơ bản trong Hệ đo lường quốc tế (SI) là gì?',
    choices: ['Fahrenheit', 'Kelvin', 'Celsius', 'Rankine'],
    answer: 1,
  },
  {
    id: 17,
    text: 'Dãy số 2, 4, 8, 16, … tiếp theo là số nào?',
    choices: ['18', '24', '32', '64'],
    answer: 2,
  },
  {
    id: 18,
    text: 'Một hình vuông có cạnh dài 7 cm. Chu vi của hình vuông là bao nhiêu?',
    choices: ['14 cm', '21 cm', '49 cm', '28 cm'],
    answer: 3,
  },
  {
    id: 19,
    text: 'Có bao nhiêu số nguyên tố nhỏ hơn 10?',
    choices: ['4', '3', '5', '6'],
    answer: 0,
  },
  {
    id: 20,
    text: 'Một món hàng giá 500.000 đồng đang giảm 20%. Giá sau khi giảm là bao nhiêu?',
    choices: ['420.000 đồng', '400.000 đồng', '380.000 đồng', '450.000 đồng'],
    answer: 1,
  },
];

export const QUESTIONS = Object.freeze(
  RAW_QUESTIONS.map((q) =>
    Object.freeze({ id: q.id, text: q.text, choices: Object.freeze([...q.choices]), answer: q.answer }),
  ),
);
