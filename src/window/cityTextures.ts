/**
 * Texture tạo bằng canvas (không dùng file ảnh ngoài).
 * Mỗi hàm trả về một THREE.CanvasTexture mới; người gọi chịu trách nhiệm dispose.
 */
import * as THREE from 'three';
import { createRng } from './traffic';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không tạo được ngữ cảnh canvas 2D');
  return [canvas, ctx];
}

function finish(canvas: HTMLCanvasElement, wrap: boolean, srgb: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (wrap) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Mặt đá xám lát ô, mỗi texture bằng 8 × 8 ô, ô 1 m. Đặt repeat theo kích thước mặt. */
export function makeStoneTexture(seed = 11): THREE.CanvasTexture {
  const S = 512;
  const T = 64;
  const [canvas, g] = makeCanvas(S, S);
  const rng = createRng(seed);
  g.fillStyle = '#5e6165';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += T) {
    for (let x = 0; x < S; x += T) {
      const v = 128 + Math.floor(rng() * 24 - 12);
      g.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      g.fillRect(x + 3, y + 3, T - 6, T - 6);
    }
  }
  return finish(canvas, true, true);
}

/**
 * Mặt đường nhựa: u chạy dọc đường, v chạy ngang. Một texture dài 20 m.
 * Vạch đứt giữa đường, hai vạch liền mép. Đặt repeat.x = chiều dài / 20.
 */
export function makeRoadTexture(seed = 23): THREE.CanvasTexture {
  const W = 256;
  const H = 512;
  const [canvas, g] = makeCanvas(W, H);
  const rng = createRng(seed);
  g.fillStyle = '#3c3f45';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const v = 52 + Math.floor(rng() * 30);
    g.fillStyle = `rgba(${v},${v},${v + 3},0.55)`;
    g.fillRect(rng() * W, rng() * H, 2, 2);
  }
  g.fillStyle = '#e8e6df';
  // Vạch đứt giữa: 4 vạch trên 20 m, mỗi vạch 2.5 m.
  for (let x = 0; x < W; x += 64) {
    g.fillRect(x, H / 2 - 4, 32, 8);
  }
  // Hai vạch liền mép đường.
  g.fillRect(0, 10, W, 8);
  g.fillRect(0, H - 18, W, 8);
  return finish(canvas, true, true);
}

/** Cỏ và thảm xanh, dùng cho dải phân cách và khu công viên. */
export function makeGrassTexture(seed = 31): THREE.CanvasTexture {
  const S = 256;
  const [canvas, g] = makeCanvas(S, S);
  const rng = createRng(seed);
  g.fillStyle = '#4c7f3e';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2200; i++) {
    const l = 80 + Math.floor(rng() * 60);
    g.fillStyle = `rgba(${Math.floor(l * 0.6)},${l},${Math.floor(l * 0.4)},0.6)`;
    g.fillRect(rng() * S, rng() * S, 2, 2);
  }
  return finish(canvas, true, true);
}

export interface FacadeOptions {
  body: string;
  glass: string;
  cols: number;
  rows: number;
  /** Tỉ lệ cửa sổ bật đèn ban đêm (0 đến 1). */
  litAmount: number;
  seed?: number;
}

/**
 * Mặt đứng có lưới cửa sổ. Một texture bao một toà nhà (u theo cột, v theo tầng).
 * Cửa sổ bật đèn có màu ấm, số lượng theo litAmount.
 */
export function makeFacadeTexture(opts: FacadeOptions): THREE.CanvasTexture {
  const S = 512;
  const [canvas, g] = makeCanvas(S, S);
  const rng = createRng(opts.seed ?? 41);
  g.fillStyle = opts.body;
  g.fillRect(0, 0, S, S);
  const cw = S / opts.cols;
  const rh = S / opts.rows;
  for (let r = 0; r < opts.rows; r++) {
    for (let c = 0; c < opts.cols; c++) {
      const lit = rng() < opts.litAmount;
      g.fillStyle = lit ? '#ffd58a' : opts.glass;
      g.fillRect(c * cw + cw * 0.14, r * rh + rh * 0.22, cw * 0.72, rh * 0.5);
    }
  }
  return finish(canvas, false, true);
}

/** Lá dải hình thuôn cho tán cây, nền trong suốt. Dùng với alphaTest. */
export function makeLeafTexture(): THREE.CanvasTexture {
  const W = 64;
  const H = 256;
  const [canvas, g] = makeCanvas(W, H);
  g.clearRect(0, 0, W, H);
  g.beginPath();
  g.moveTo(W / 2, H);
  g.quadraticCurveTo(0, H * 0.5, W / 2, 0);
  g.quadraticCurveTo(W, H * 0.5, W / 2, H);
  g.closePath();
  const grad = g.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, '#2d6b35');
  grad.addColorStop(1, '#63b058');
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = 'rgba(180,230,150,0.5)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(W / 2, H - 6);
  g.lineTo(W / 2, 6);
  g.stroke();
  return finish(canvas, false, true);
}

/** Đám mây mềm: gradient toả tròn, alpha giảm dần ra mép. */
export function makeCloudTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const [canvas, g] = makeCanvas(W, H);
  const grad = g.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  return finish(canvas, false, true);
}
