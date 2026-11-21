// Pack icon: a blaster firing across a dark arena with a neon grid floor, a red
// and a blue beam crossing, drawn at 32x32 and scaled up.
import { PNG } from 'pngjs';
import { hex, mix } from './texture.mjs';

export function packIcon(scale = 8) {
  const N = 32;
  const px = Array.from({ length: N }, () => new Array(N));
  // Night sky of the arena: deep blue at the top, purple towards the floor.
  for (let y = 0; y < N; y++) {
    const c = mix(hex('#070a1e'), hex('#2a0f4a'), y / 20);
    for (let x = 0; x < N; x++) px[y][x] = c;
  }
  const set = (x, y, c) => {
    if (x >= 0 && x < N && y >= 0 && y < N) px[y][x] = hex(c);
  };
  const fill = (x0, y0, x1, y1, c) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c);
  };
  // The neon grid floor, in perspective.
  for (let y = 20; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const depth = (y - 19) / 12;
      const line = (y - 20) % Math.max(1, Math.round(1 + depth * 3)) === 0 || Math.abs(((x - 16) / depth) % 6) < 0.9;
      px[y][x] = line ? mix(hex('#ff2bd6'), hex('#22e6ff'), (y - 20) / 12) : mix(hex('#140827'), hex('#1c0c36'), depth);
    }
  }
  // Cover blocks in the distance.
  fill(3, 15, 7, 19, '#262b3a'); fill(3, 15, 7, 15, '#22e6ff');
  fill(24, 13, 29, 19, '#262b3a'); fill(24, 13, 29, 13, '#ff2bd6');
  // Two beams crossing: red from the left, blue from the right.
  for (let x = 0; x < N; x++) {
    const yr = Math.round(6 + x * 0.32);
    const yb = Math.round(16 - x * 0.3);
    set(x, yr, '#ff3040'); set(x, yr + 1, '#ff98a0');
    set(x, yb, '#288cff'); set(x, yb - 1, '#9ccaff');
  }
  // A burst where they cross.
  for (let y = 7; y < 16; y++)
    for (let x = 12; x < 22; x++) {
      const d = Math.hypot(x - 16.5, y - 11);
      if (d < 3) px[y][x] = mix(hex('#ffffff'), hex('#ffd828'), d / 3);
    }
  // The blaster in front, pointing up to the right.
  fill(6, 24, 19, 26, '#3a3f4b');
  fill(7, 23, 18, 23, '#7b8494');
  fill(10, 25, 13, 25, '#ff2bd6');
  fill(20, 24, 21, 25, '#22e6ff');
  fill(8, 27, 10, 31, '#232733'); fill(8, 27, 8, 31, '#3a3f4b');
  fill(22, 23, 23, 24, '#ffffff');

  const png = new PNG({ width: N * scale, height: N * scale });
  for (let y = 0; y < N * scale; y++)
    for (let x = 0; x < N * scale; x++) png.data.set(px[Math.floor(y / scale)][Math.floor(x / scale)], (y * N * scale + x) * 4);
  return PNG.sync.write(png);
}
