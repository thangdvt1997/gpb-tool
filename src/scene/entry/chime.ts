// Tiếng chuông thang máy hai nốt (ding-dong), tổng hợp bằng Web Audio, không dùng file.
// Dùng một AudioContext riêng, tạo khi cần. Trình duyệt chưa cho phát (chưa có thao tác người dùng) thì im lặng.

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Một nốt chuông: sóng sin và họa âm bậc ba, tắt dần theo hàm mũ. */
function bell(c: AudioContext, when: number, freq: number, peak: number): void {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 1.1);
  gain.connect(c.destination);
  const oscs = [freq, freq * 3].map((f, i) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, when);
    const g = c.createGain();
    g.gain.value = i === 0 ? 1 : 0.12;
    o.connect(g).connect(gain);
    o.start(when);
    o.stop(when + 1.15);
    return { o, g };
  });
  oscs[0].o.onended = () => {
    for (const { o, g } of oscs) {
      o.disconnect();
      g.disconnect();
    }
    gain.disconnect();
  };
}

/** Phát chuông thang máy, âm lượng nhỏ. Không ném lỗi. */
export function playLiftChime(): void {
  const c = context();
  if (!c) return;
  const play = () => {
    if (c.state !== 'running') return;
    const t = c.currentTime + 0.02;
    bell(c, t, 659.25, 0.12); // E5
    bell(c, t + 0.42, 523.25, 0.1); // C5
  };
  if (c.state === 'running') {
    play();
    return;
  }
  c.resume().then(play, () => undefined);
}
