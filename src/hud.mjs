// The sniper's scope on the Bedrock HUD. The scripts set a title made only of formatting
// codes, which shows nothing on screen, and ui/hud_screen.json shows the scope overlay
// while that code is in the title (the same trick as Realistic Hunting's scopes).
import { PNG } from 'pngjs';
import { NS } from './lib/constants.mjs';

/** Formatting codes that draw nothing on their own. */
export const SCOPE_CODE = '§s§c§o§p';
export const SCOPE_SIZE = 256;

const contains = (code) => `(not ((#hud_title_text_string - '${code}') = #hud_title_text_string))`;

/** ui/hud_screen.json: the round scope in the middle, black bars beside it on wide screens. */
export function hudScreen() {
  return {
    namespace: 'hud',
    root_panel: {
      modifications: [{
        array_name: 'controls',
        operation: 'insert_front',
        value: [{ [`${NS}_scope@hud.${NS}_scope`]: {} }],
      }],
    },
    [`${NS}_scope`]: {
      type: 'panel',
      size: ['100%', '100%'],
      bindings: [
        { binding_name: '#hud_title_text_string' },
        { binding_type: 'view', source_property_name: contains(SCOPE_CODE), target_property_name: '#visible' },
      ],
      controls: [
        { left: { type: 'image', texture: `textures/ui/${NS}/black`, anchor_from: 'left_middle', anchor_to: 'left_middle', size: ['50%-50%y+1px', '100%'] } },
        { right: { type: 'image', texture: `textures/ui/${NS}/black`, anchor_from: 'right_middle', anchor_to: 'right_middle', size: ['50%-50%y+1px', '100%'] } },
        { lens: { type: 'image', texture: `textures/ui/${NS}/scope`, anchor_from: 'center', anchor_to: 'center', size: ['100%y', '100%'] } },
      ],
    },
  };
}

/**
 * The lens: black outside a round field of view, a thin dark ring, and a laser-red reticle
 * (posts from the edge, a fine cross with a gap and a dot in the middle, range dots).
 * Java draws the same reticle at runtime (client/ScopeHud.java).
 */
export function scopeTexture() {
  const N = SCOPE_SIZE, c = N / 2, R = N / 2 - 4;
  const png = new PNG({ width: N, height: N });
  const set = (x, y, rgba) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    png.data.set(rgba, (y * N + x) * 4);
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
    if (d > R) set(x, y, [0, 0, 0, 255]);
    else if (d > R - 2) set(x, y, [30, 30, 30, 255]);
    else if (d > R - 14) set(x, y, [0, 0, 0, Math.round(((d - (R - 14)) / 12) * 150)]);
    else set(x, y, [0, 0, 0, 0]);
  }
  const post = [12, 12, 12, 255], red = [255, 40, 60, 255];
  const rect = (x0, y0, x1, y1, rgba) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, rgba);
  };
  const inner = Math.round(R * 0.42), gap = 4;
  rect(c - R, c - 2, c - inner, c + 2, post); rect(c + inner, c - 2, c + R, c + 2, post);
  rect(c - 2, c + inner, c + 2, c + R, post); rect(c - 2, c - R, c + 2, c - inner, post);
  rect(c - inner, c, c - gap, c + 1, red); rect(c + gap, c, c + inner, c + 1, red);
  rect(c, c - inner, c + 1, c - gap, red); rect(c, c + gap, c + 1, c + inner, red);
  rect(c - 1, c - 1, c + 2, c + 2, red);
  for (const k of [-2, -1, 1, 2]) {
    const o = Math.round((k * inner) / 3);
    rect(c + o - 1, c - 1, c + o + 1, c + 2, red);
    rect(c - 1, c + o - 1, c + 2, c + o + 1, red);
  }
  return PNG.sync.write(png);
}

/** A plain black texture for the bars beside the round scope. */
export function black() {
  const png = new PNG({ width: 4, height: 4 });
  for (let i = 0; i < 16; i++) png.data.set([0, 0, 0, 255], i * 4);
  return PNG.sync.write(png);
}
