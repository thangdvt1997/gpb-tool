import nodemailer from 'nodemailer';
import { config } from './config.js';

// MAIL_MODE=smtp: gửi email thật qua SMTP_*.
// MAIL_MODE=log (mặc định): không gửi email, mã OTP chỉ in ra log server. Chỉ dùng để thử nghiệm.
let transport = null;
if (config.mailMode === 'smtp') {
  if (!config.smtp.host || !config.smtp.from) {
    throw new Error('MAIL_MODE=smtp cần SMTP_HOST và MAIL_FROM.');
  }
  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

export function mailMode() {
  return config.mailMode;
}

export async function sendOtp(to, code) {
  const subject = 'Mã xác minh Test App';
  const text =
    `Mã xác minh của bạn: ${code}\n` +
    'Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.';

  if (config.mailMode === 'smtp') {
    await transport.sendMail({ from: config.smtp.from, to, subject, text });
    return;
  }
  console.log(`[mail:log] to=${to} subject="${subject}" code=${code}`);
}
