// Chạy: node --test test/profanity.test.js (trong thư mục services/auth, Node >= 20, ESM)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBlocked } from '../profanity.js';

// Một từ đại diện (dạng không dấu và có dấu). Các test còn lại dùng chuỗi tự tạo từ nó.
const BASE = 'dit';
const ACCENTED = 'địt';

test('a) văn bản sạch trả null', () => {
  assert.equal(findBlocked('Xin chào, tôi muốn đặt sân vào chiều mai'), null);
  assert.equal(findBlocked('Hello world'), null);
  assert.equal(findBlocked('Nguyễn Văn An'), null);
});

test('b) từ bị chặn có dấu bị bắt', () => {
  assert.equal(findBlocked(ACCENTED), BASE);
  assert.equal(findBlocked(`tôi nói ${ACCENTED} nhau`), BASE);
});

test('c) cùng từ không dấu bị bắt', () => {
  assert.equal(findBlocked(BASE), BASE);
  assert.equal(findBlocked(`abc ${BASE} xyz`), BASE);
});

test('d) viết hoa và khoảng trắng thừa vẫn bắt', () => {
  assert.equal(findBlocked(BASE.toUpperCase()), BASE);
  assert.equal(findBlocked(ACCENTED.toUpperCase()), BASE);
  assert.equal(findBlocked(`   ${BASE}   `), BASE);
  assert.equal(findBlocked(`xin    chào \t\n  ${BASE}   bạn`), BASE);
});

test('e) ký tự phân cách xen giữa bị bắt', () => {
  assert.equal(findBlocked('d.i.t'), BASE);
  assert.equal(findBlocked('d_i_t'), BASE);
  assert.equal(findBlocked('d-i-t'), BASE);
  assert.equal(findBlocked('d i t'), BASE);
  assert.equal(findBlocked('di.t'), BASE);
  assert.equal(findBlocked('đ.ị.t'), BASE);
});

test('f) chữ lặp kéo dài bị bắt', () => {
  assert.equal(findBlocked('ditttttt'), BASE);
  assert.equal(findBlocked('diiiit'), BASE);
  assert.equal(findBlocked('địttttt'), BASE);
  assert.equal(findBlocked('DIIITTT'), BASE);
});

test('g) từ vô hại chứa chuỗi trùng không bị bắt', () => {
  // Chứa chuỗi con trùng từ trong danh sách nhưng là từ khác.
  for (const word of ['edit', 'audit', 'credit', 'editor', 'additional']) {
    assert.equal(findBlocked(word), null, word);
  }
  // Từ tiếng Việt có dấu gần giống, bỏ dấu sẽ nhập nhằng.
  for (const phrase of ['buổi sáng', 'đeo kính', 'các bạn', 'đi học', 'điều kiện']) {
    assert.equal(findBlocked(phrase), null, phrase);
  }
});

test('h) chuỗi rỗng và giá trị không phải chuỗi không gây lỗi', () => {
  assert.equal(findBlocked(''), null);
  assert.equal(findBlocked(null), null);
  assert.equal(findBlocked(undefined), null);
  assert.equal(findBlocked(123), null);
  assert.equal(findBlocked({}), null);
  assert.equal(findBlocked('   '), null);
});
