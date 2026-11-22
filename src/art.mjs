// Pictures drawn in code: 16x16 item icons, block textures (glowing neon on dark
// panels), the vests as worn, and the laser bot's colours.
import { PNG } from 'pngjs';
import { fbm, hex, mix, noise3, pixelIcon, shade } from './lib/texture.mjs';
import { RULES, TEAMS } from './rules.mjs';

// ---------------------------------------------------------------- colours

const rgbHex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
export const TEAM_HEX = Object.fromEntries(TEAMS.map((t) => [t, rgbHex(RULES.colours[t].rgb)]));

export const C = {
  outline: '#0e1018',
  dark: '#232733', mid: '#3a3f4b', light: '#7b8494', white: '#f4f6ff',
  cyan: '#22e6ff', cyanDeep: '#0a8fb0', magenta: '#ff2bd6', magentaDeep: '#9a1286',
  panel: '#161925', panelLight: '#262b3a', night: '#0b0f2a',
};

const P = {
  k: C.outline, d: C.dark, g: C.mid, G: C.light, w: C.white,
  c: C.cyan, C: C.cyanDeep, m: C.magenta, M: C.magentaDeep,
};

const draw = (rows, extra = {}) => pixelIcon(rows, { ...P, ...extra });

/** A vest: dark straps, with glowing sensor pads in the team colour. */
const vestIcon = (team) => draw([
  '................',
  '...kkk....kkk...',
  '...kgk....kgk...',
  '..kkgkkkkkkgkk..',
  '.kddgddddddgddk.',
  '.kdttdddddttddk.',
  '.kdTTdddddTTddk.',
  '.kddddkkkdddddk.',
  '.kdddkTTTkddddk.',
  '.kdddkTtTkddddk.',
  '.kdddkTTTkddddk.',
  '.kddddkkkdddddk.',
  '.kggggggggggggk.',
  '.kdGddGddGddGdk.',
  '..kkkkkkkkkkkk..',
  '................',
], { t: TEAM_HEX[team], T: mix(hex(TEAM_HEX[team]), hex('#ffffff'), 0.45) });

export const ICONS = {
  laser_pistol: draw([
    '................',
    '................',
    '................',
    '................',
    '....kkkkkkkkk...',
    '...kGGGGGGGGGkk.',
    '...kgggmgggggcck',
    '...kgggggggggkk.',
    '...kkkddkkkkk...',
    '....kdddk.kk....',
    '....kddkkk......',
    '...kddMk........',
    '...kddMk........',
    '...kkkkk........',
    '................',
    '................',
  ]),
  laser_blaster: draw([
    '................',
    '................',
    '................',
    '.....kkkk.......',
    '....kcccck......',
    'kkkkkkkkkkkkkk..',
    'kGGGGGGGGGGGGGkk',
    'kgggmmmmggggggcc',
    'kggggggggggggkk.',
    'kkkdkkkkkdkkk...',
    '..kddk..kdk.....',
    '..kddMk..k......',
    '.kddMk..........',
    '.kddMk..........',
    '.kkkkk..........',
    '................',
  ]),
  laser_rifle: draw([
    '................',
    '................',
    '....kkkkkk......',
    '...kGcccccGk....',
    '....kkkkkk......',
    'kk..kkkkkkkkkkk.',
    'kdkkGGGGGGGGGGGk',
    'kddgggmmmggggggc',
    'kddggggggggggkkk',
    'kdkkkdkkkkkkk...',
    'kk..kddk........',
    '....kddMk.......',
    '...kddMk........',
    '...kkkkk........',
    '................',
    '................',
  ]),
  scatter_laser: draw([
    '................',
    '................',
    '...........kkk..',
    '..........kcck..',
    '..kkkkkkkkkkkkk.',
    '.kGGGGGGGGGGcckk',
    '.kgggmmggggggcck',
    '.kgggmmggggggcck',
    '.kGGGGGGGGGGcckk',
    '..kkkdkkkkkkkkk.',
    '...kddk...kcck..',
    '...kddMk...kkk..',
    '..kddMk.........',
    '..kkkkk.........',
    '................',
    '................',
  ]),
  pulse_grenade: draw([
    '................',
    '................',
    '.......kk.......',
    '......kGGk......',
    '.....kkkkkk.....',
    '....kgggGggk....',
    '...kgggGGgggk...',
    '...kccccccccck..',
    '...kmmmmmmmmmk..',
    '...kccccccccck..',
    '...kggggggggk...',
    '....kgggggggk...',
    '.....kkkkkkk....',
    '................',
    '................',
    '................',
  ].map((r) => r.slice(0, 16))),
  ...Object.fromEntries(TEAMS.map((t) => [`vest_${t}`, vestIcon(t)])),
};

// ---------------------------------------------------------------- textures

function canvas(w, h, f) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) png.data.set(f(x, y), (y * w + x) * 4);
  return png;
}
const encode = (png) => PNG.sync.write(png);
const edge = (x, y, n = 0) => x <= n || y <= n || x >= 15 - n || y >= 15 - n;

/** Brushed dark panel with a bevelled edge. */
function panel(x, y, seed = 1, base = C.panel) {
  if (x === 0 || y === 0) return shade(hex(base), 1.6);
  if (x === 15 || y === 15) return shade(hex(base), 0.6);
  return shade(hex(base), 0.9 + 0.2 * noise3(x / 3, y, 0, seed));
}

/** A glowing ring (spawn pads, the console's buttons). */
function ring(x, y, colour, r0, r1, cx = 7.5, cy = 7.5) {
  const d = Math.hypot(x - cx, y - cy);
  if (d >= r0 && d <= r1) return mix(hex(colour), hex('#ffffff'), 0.25 * (1 - Math.abs(d - (r0 + r1) / 2)));
  return null;
}

/** A team's spawn pad: a dark plate with a glowing ring and arrow, sides with a stripe. */
const padTop = (team) => encode(canvas(16, 16, (x, y) => ring(x, y, TEAM_HEX[team], 4.5, 6.2)
  ?? (Math.abs(x - 7.5) + Math.abs(y - 6) < 2.6 && y < 9 ? hex(TEAM_HEX[team]) : panel(x, y, 3))));
const padSide = (team) => encode(canvas(16, 16, (x, y) => (y === 3 || y === 4 ? hex(TEAM_HEX[team]) : panel(x, y, 4))));

/** A flag stand: a pole on a plinth, with the team's flag on it (or without, when it is taken). */
const flagSide = (team, withFlag) => encode(canvas(16, 16, (x, y) => {
  if (y >= 13) return y === 13 ? hex(TEAM_HEX[team]) : panel(x, y, 5);
  if (x === 4 || x === 5) return y === 0 ? hex(C.white) : hex(C.light);
  if (withFlag && x >= 6 && x <= 14 && y >= 1 && y <= 7) {
    const wave = Math.sin((x - 6) / 2.2) * 0.12;
    return shade(hex(TEAM_HEX[team]), 0.85 + wave + (y === 1 || y === 7 ? -0.15 : 0.1));
  }
  return shade(hex(C.night), 0.9 + 0.2 * noise3(x / 4, y / 4, 0, 8));
}));
const flagTop = (team) => encode(canvas(16, 16, (x, y) => ring(x, y, TEAM_HEX[team], 5.5, 7.4) ?? panel(x, y, 6)));

/** A control point's side: a beacon panel lit in the owner's colour (white when nobody holds it). */
const pointColour = (owner) => (owner ? TEAM_HEX[owner] : '#c8d0e0');
const pointSide = (owner) => encode(canvas(16, 16, (x, y) => {
  if (edge(x, y, 1)) return panel(x, y, 7, C.panelLight);
  const d = Math.abs(x - 7.5);
  if (d < 2.5) return mix(hex(pointColour(owner)), hex('#ffffff'), 0.35 * (1 - d / 2.5));
  return mix(hex(C.panel), hex(pointColour(owner)), 0.18 + 0.1 * Math.sin(y / 2));
}));
const pointTop = (owner) => encode(canvas(16, 16, (x, y) => ring(x, y, pointColour(owner), 2, 4.5) ?? ring(x, y, pointColour(owner), 6, 7) ?? panel(x, y, 9)));

/** The power-up station: a lit core when charged, a dim one while it recharges. */
const stationSide = (charged) => encode(canvas(16, 16, (x, y) => {
  if (edge(x, y, 1)) return panel(x, y, 10, C.panelLight);
  const d = Math.hypot(x - 7.5, y - 7.5);
  if (d < 4.5) {
    const c = charged ? mix(hex('#ffffff'), hex(C.magenta), d / 4.5) : mix(hex('#3a2a3e'), hex('#1e1824'), d / 4.5);
    return c;
  }
  return charged ? mix(hex(C.panel), hex(C.cyan), 0.12) : hex(C.panel);
}));
const stationTop = (charged) => encode(canvas(16, 16, (x, y) => (Math.abs(x - 7.5) < 1 || Math.abs(y - 7.5) < 1 ? hex(charged ? C.magenta : '#3a2a3e') : panel(x, y, 11))));

/** The smoke machine: a round fan grille on a dark box, its lamp lit when it is on. */
const smokeSide = (on) => encode(canvas(16, 16, (x, y) => {
  if (edge(x, y, 1)) return panel(x, y, 14, C.panelLight);
  if (x >= 11 && x <= 12 && y >= 11 && y <= 12) return hex(on ? C.cyan : '#1e3a44');
  const d = Math.hypot(x - 7, y - 7);
  if (d <= 5.2) {
    if (d > 4.3) return hex(on ? '#c8d0e0' : C.light);
    if (d < 1.3) return hex(C.light);
    return y % 2 === 0 ? hex(on ? '#9aa3b4' : '#5a6070') : hex(C.outline);
  }
  return shade(hex(C.dark), 0.9 + 0.2 * noise3(x / 3, y / 3, 2, 14));
}));
const smokeTop = (on) => encode(canvas(16, 16, (x, y) => {
  if (edge(x, y, 1)) return panel(x, y, 15, C.panelLight);
  if (x >= 3 && x <= 12 && y >= 3 && y <= 12) return (x + y) % 3 === 0 ? hex(C.outline) : mix(hex(C.mid), hex('#e8ecf4'), on ? 0.35 : 0);
  return panel(x, y, 16);
}));

/** The siren: a red rotating lamp over a hazard-striped base, lit when it is charged. */
const sirenSide = (charged) => encode(canvas(16, 16, (x, y) => {
  if (y >= 12) return ((x + y) >> 1) % 2 ? hex('#f5c400') : hex(C.outline);
  if (y === 11 || x === 0 || x === 15 || y === 0) return hex(C.mid);
  const d = Math.hypot(x - 7.5, (y - 6) * 1.2);
  if (d <= 5.5) {
    const lens = charged ? mix(hex('#ffd0d0'), hex('#ff2020'), d / 5.5) : mix(hex('#5a1e1e'), hex('#2a1010'), d / 5.5);
    return x === 7 || x === 8 ? mix(lens, hex('#ffffff'), charged ? 0.35 : 0.05) : lens;
  }
  return panel(x, y, 17);
}));
const sirenTop = (charged) => encode(canvas(16, 16, (x, y) => {
  const d = Math.hypot(x - 7.5, y - 7.5);
  if (d <= 5.5) return charged ? mix(hex('#ffe0e0'), hex('#ff2020'), d / 5.5) : mix(hex('#5a1e1e'), hex('#2a1010'), d / 5.5);
  return panel(x, y, 18, C.panelLight);
}));

/** Game console: a screen with a scoreboard on it and a row of buttons. */
const consoleFront = () => encode(canvas(16, 16, (x, y) => {
  if (edge(x, y)) return hex(C.mid);
  if (y >= 2 && y <= 9 && x >= 2 && x <= 13) {
    if (y === 2 || y === 9 || x === 2 || x === 13) return hex(C.dark);
    if (y === 4 && x >= 4 && x <= 6) return hex(TEAM_HEX.red);
    if (y === 4 && x >= 9 && x <= 11) return hex(TEAM_HEX.blue);
    if (y === 6 && (x === 4 || x === 6 || x === 9 || x === 11)) return hex(C.white);
    return mix(hex(C.night), hex(C.cyanDeep), 0.3 + 0.1 * Math.sin(y * 1.7));
  }
  if (y === 12 && x >= 3 && x <= 12 && x % 3 === 0) return hex([TEAM_HEX.red, TEAM_HEX.blue, TEAM_HEX.green, TEAM_HEX.yellow][x / 3 - 1]);
  return shade(hex(C.dark), 0.95 + 0.1 * noise3(x, y, 1, 12));
}));
const consoleTop = () => encode(canvas(16, 16, (x, y) => (y === 7 || y === 8 ? hex(C.cyan) : panel(x, y, 13, C.panelLight))));

/** Neon panel: dark glass with glowing tubes along its edges and across the middle. */
const neon = (colour) => encode(canvas(16, 16, (x, y) => {
  if (x === 1 || x === 14 || y === 1 || y === 14 || (x + y === 15 && x > 2 && x < 13)) return mix(hex(colour), hex('#ffffff'), 0.3);
  if (x === 2 || x === 13 || y === 2 || y === 13 || x === 0 || y === 0 || x === 15 || y === 15) return mix(hex(C.panel), hex(colour), 0.35);
  return mix(hex(C.panel), hex(colour), 0.08 + 0.06 * noise3(x / 4, y / 4, 3, 2));
}));

export const NEON = { white: '#e8f0ff', red: TEAM_HEX.red, blue: TEAM_HEX.blue, green: TEAM_HEX.green, yellow: TEAM_HEX.yellow, cyan: C.cyan, magenta: C.magenta };

export const BLOCK_TEXTURES = {
  game_console: { side: consoleFront(), top: consoleTop() },
  scoreboard_screen: {
    side: encode(canvas(16, 16, (x, y) => {
      if (edge(x, y)) return hex(C.mid);
      const row = Math.floor((y - 2) / 3);
      if (y >= 2 && y <= 13 && x >= 2 && x <= 13 && (y - 2) % 3 < 2 && row < 4) {
        const team = TEAMS[row];
        const len = [10, 7, 5, 3][row];
        if (x <= 3) return hex(TEAM_HEX[team]);
        if (x >= 5 && x < 5 + len - 2) return mix(hex(TEAM_HEX[team]), hex('#ffffff'), 0.4);
      }
      return mix(hex(C.night), hex(C.cyanDeep), 0.15);
    })),
  },
  cover_crate: {
    side: encode(canvas(16, 16, (x, y) => {
      if (edge(x, y, 1)) return x <= 1 || y <= 1 ? hex(C.light) : hex(C.mid);
      if (x === y || x === 15 - y) return hex(C.cyan);
      return shade(hex(C.dark), 0.9 + 0.2 * noise3(x / 2, y / 2, 4, 3));
    })),
  },
  blacklight_floor: {
    side: encode(canvas(16, 16, (x, y) => {
      const n = fbm(x / 4, y / 4, 0, 19);
      if (Math.abs(n - 0.5) < 0.025) return hex(C.magenta);
      if (Math.abs(n - 0.35) < 0.02) return hex(C.cyan);
      if ((x * 7 + y * 13) % 29 === 0) return hex('#d6ff3a');
      return shade(hex('#140c2a'), 0.85 + 0.3 * noise3(x / 3, y / 3, 1, 5));
    })),
  },
};

export const PAD = { top: padTop, side: padSide };
export const FLAG = { side: flagSide, top: flagTop };
export const POINT = { side: pointSide, top: pointTop };
export const STATION = { side: stationSide, top: stationTop };
export const SMOKE = { side: smokeSide, top: smokeTop };
export const SIREN = { side: sirenSide, top: sirenTop };
export const NEON_TEXTURE = neon;

/** The vests as worn, in the vanilla 64x32 armour layout: dark straps with glowing pads. */
export function vestLayer(team) {
  const t = hex(TEAM_HEX[team]);
  return encode(canvas(64, 32, (x, y) => {
    // Body front 20..28 x 20..32, back 32..40, sides 16..20 and 28..32; arms 40..56.
    const body = y >= 20 && x >= 16 && x < 40;
    const arms = y >= 20 && x >= 40 && x < 56;
    if (body) {
      const u = x < 28 ? x - 20 : x - 32;
      if ((u === 1 || u === 6) && y < 26) return mix(t, hex('#ffffff'), 0.4);
      if (u >= 2 && u <= 5 && y >= 23 && y <= 26) return mix(t, hex('#ffffff'), y === 24 || y === 25 ? 0.5 : 0);
      if (y === 29) return t;
      return shade(hex(C.dark), 0.9 + 0.2 * noise3(x / 2, y / 2, 0, 4));
    }
    if (arms && y >= 20 && y <= 23) return y === 22 ? t : hex(C.dark);
    return [0, 0, 0, 0];
  }));
}

/** The laser bot's materials for each team: dark armour, white plates and lights in the team colour. */
export function botMaterials(team) {
  const glow = TEAM_HEX[team];
  return {
    shell: { base: '#e8ecf4', layers: [(c, { p }) => shade(c, 0.92 + 0.12 * noise3(p[0] / 3, p[1] / 3, p[2] / 3, 2))] },
    frame: { base: '#2a2f3c', layers: [(c, { p }) => shade(c, 0.9 + 0.2 * noise3(p[0], p[1], p[2], 5))] },
    light: { base: glow, shading: 0 },
    visor: { base: mix(hex(glow), hex('#ffffff'), 0.35), shading: 0 },
    gun: '#3a3f4b',
  };
}
