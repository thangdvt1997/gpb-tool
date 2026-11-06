// Texture vẽ bằng canvas cho cụm lối vào: thép chải, bảng số tầng LED, ảnh cabin nhìn từ ngoài.
// Không dùng file ngoài. Người gọi dispose texture khi không dùng nữa.

import * as THREE from 'three';
import { canvasTexture, makeRng } from '../../env/shared';
import type { EntryColors } from './colors';

/**
 * Vân thép chải dọc: nền xám sáng, các vệt mảnh sáng tối ngẫu nhiên. Nhân với màu vật liệu,
 * nên texture chỉ chứa độ sáng (thang xám), không chứa màu.
 */
export function brushedTexture(): THREE.CanvasTexture {
  const rng = makeRng(7);
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = 'rgb(222,222,222)';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = rng() * w;
      const v = rng() < 0.5 ? 255 : 150;
      ctx.strokeStyle = `rgba(${v},${v},${v},${0.05 + rng() * 0.12})`;
      ctx.lineWidth = 0.5 + rng() * 1.2;
      ctx.beginPath();
      const y0 = rng() * h * 0.3;
      ctx.moveTo(x, y0);
      ctx.lineTo(x + (rng() - 0.5) * 2, y0 + h * (0.5 + rng() * 0.6));
      ctx.stroke();
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Bảng số tầng dạng LED: mũi tên lên và số "7" màu hổ phách, có quầng sáng nhẹ. */
export function indicatorTexture(colors: EntryColors): THREE.CanvasTexture {
  return canvasTexture(320, 104, (ctx, w, h) => {
    ctx.fillStyle = colors.indicatorBg;
    ctx.fillRect(0, 0, w, h);
    // Lưới chấm LED mờ phía sau, giống ma trận điểm.
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let y = 6; y < h; y += 8) for (let x = 6; x < w; x += 8) ctx.fillRect(x, y, 2, 2);

    ctx.shadowColor = colors.indicatorGlyph;
    ctx.shadowBlur = 14;
    ctx.fillStyle = colors.indicatorGlyph;
    // Mũi tên lên.
    ctx.beginPath();
    ctx.moveTo(w * 0.22, h * 0.24);
    ctx.lineTo(w * 0.32, h * 0.62);
    ctx.lineTo(w * 0.12, h * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(w * 0.195, h * 0.6, w * 0.05, h * 0.18);
    // Số tầng.
    ctx.font = `bold ${Math.round(h * 0.82)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('7', w * 0.62, h * 0.54);
  });
}

/**
 * Ảnh cabin nhìn từ hành lang, dán sau cánh cửa. Lõi thang trong cảnh là khối đặc, nên khi cửa mở
 * người đứng ngoài thấy ảnh này thay cho mặt khối. Từ trong cabin, mặt này quay lưng nên không vẽ.
 */
export function cabinTexture(colors: EntryColors): THREE.CanvasTexture {
  return canvasTexture(256, 456, (ctx, w, h) => {
    const wall = ctx.createLinearGradient(0, 0, w, 0);
    wall.addColorStop(0, colors.steelDark);
    wall.addColorStop(0.5, colors.steelLight);
    wall.addColorStop(1, colors.steelDark);
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);
    // Vách sau tối hơn, có phối cảnh.
    ctx.fillStyle = colors.cabinWall;
    ctx.fillRect(w * 0.16, h * 0.08, w * 0.68, h * 0.8);
    // Sàn cabin.
    ctx.fillStyle = colors.cabinFloor;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w * 0.16, h * 0.88);
    ctx.lineTo(w * 0.84, h * 0.88);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    // Đèn trần.
    const glow = ctx.createLinearGradient(0, 0, 0, h * 0.2);
    glow.addColorStop(0, colors.light);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(w * 0.16, h * 0.08, w * 0.68, h * 0.14);
    ctx.fillStyle = colors.light;
    ctx.fillRect(0, 0, w, h * 0.05);
    // Tay vịn.
    ctx.fillStyle = colors.steelLight;
    ctx.fillRect(w * 0.16, h * 0.6, w * 0.68, h * 0.015);
    ctx.fillRect(0, h * 0.62, w * 0.16, h * 0.012);
    ctx.fillRect(w * 0.84, h * 0.62, w * 0.16, h * 0.012);
  });
}
