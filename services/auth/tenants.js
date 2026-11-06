// Phân tenant theo tên miền email.
// - Email cá nhân (gmail.com, outlook.com, ...) vào tenant 'personal' dùng chung.
// - Email doanh nghiệp: mỗi tên miền là một tenant riêng (id = tên miền), tạo tự động khi đăng ký.
// Quy tắc này dùng chung cho đăng ký email/mật khẩu và đăng nhập OAuth.

export const PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.com.vn',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
  'zoho.com',
  'proton.me',
  'protonmail.com',
]);

// email phải đã được chuẩn hóa (chữ thường, không khoảng trắng).
export function tenantFor(email) {
  const domain = email.slice(email.lastIndexOf('@') + 1);
  if (PERSONAL_DOMAINS.has(domain)) {
    return { id: 'personal', type: 'personal', name: 'Tài khoản cá nhân' };
  }
  return { id: domain, type: 'business', name: domain };
}
