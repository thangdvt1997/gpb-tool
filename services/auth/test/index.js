// Điểm vào cho `node --test test/` (Node >= 22 coi đối số thư mục là module, cần index.js).
// Chạy riêng từng file vẫn được: node --test test/*.test.js
import './character.test.js';
import './profanity.test.js';
import './http.test.js';
