// Blocks: the game console, the arena's game blocks (spawn pads, flag stands, a
// control point, a power-up station, a smoke machine, a siren) and neon building blocks. Every block is a
// full cube, with its own top where it has one; textures come from src/art.mjs.
// A block with a `state` looks different for each value of it (the flag on its
// stand or taken, who holds a control point, a charged power-up station or siren, a
// smoke machine on or off).
// Names are [English, Danish].
import { NS } from './lib/constants.mjs';
import { BLOCK_TEXTURES, FLAG, NEON, NEON_TEXTURE, PAD, POINT, SIREN, SMOKE, STATION } from './art.mjs';
import { TEAM_NAMES, shaped } from './items.mjs';
import { TEAMS } from './rules.mjs';

const NEON_NAMES = {
  white: ['White Neon Panel', 'Hvidt neonpanel'],
  red: ['Red Neon Panel', 'Rødt neonpanel'],
  blue: ['Blue Neon Panel', 'Blåt neonpanel'],
  green: ['Green Neon Panel', 'Grønt neonpanel'],
  yellow: ['Yellow Neon Panel', 'Gult neonpanel'],
  cyan: ['Cyan Neon Panel', 'Cyan neonpanel'],
  magenta: ['Magenta Neon Panel', 'Magenta neonpanel'],
};
const DYES = { white: 'white_dye', red: 'red_dye', blue: 'blue_dye', green: 'lime_dye', yellow: 'yellow_dye', cyan: 'cyan_dye', magenta: 'magenta_dye' };
const WOOL = { red: 'red_wool', blue: 'blue_wool', green: 'lime_wool', yellow: 'yellow_wool' };

/** Bedrock block state names (Java uses the part after the colon). */
export const STATES = { flag: `${NS}:flag`, owner: `${NS}:owner`, charged: `${NS}:charged`, on: `${NS}:on` };

const metal = { hardness: 3, sound: 'metal' };

export const BLOCKS = [
  {
    id: 'game_console', name: ['Game Console', 'Spilkonsol'], faces: BLOCK_TEXTURES.game_console, ...metal, light: 7, map: '#22e6ff',
    component: 'console',
  },
  ...TEAMS.map((team) => ({
    id: `spawn_pad_${team}`, name: [`${TEAM_NAMES[team][0]} Spawn Pad`, `${TEAM_NAMES[team][1]} startplade`],
    faces: { side: PAD.side(team), top: PAD.top(team) }, ...metal, light: 10, map: '#232733', team, kind: 'pad', component: 'arena', tick: 20,
  })),
  ...TEAMS.map((team) => ({
    id: `flag_stand_${team}`, name: [`${TEAM_NAMES[team][0]} Flag Stand`, `${TEAM_NAMES[team][1]} flagstander`],
    ...metal, light: 9, map: '#232733', team, kind: 'flag', component: 'arena', tick: 5,
    // With its flag (the first value is the block as placed) or without, when it has been taken.
    state: { name: 'flag', values: [true, false] },
    looks: (flag) => ({ side: FLAG.side(team, flag), top: FLAG.top(team) }),
  })),
  {
    id: 'control_point', name: ['Control Point', 'Kontrolpunkt'], ...metal, light: 12, map: '#c8d0e0', kind: 'point', component: 'arena', tick: 20,
    // Who holds it: 0 nobody, 1–4 the teams in order.
    state: { name: 'owner', values: [0, ...TEAMS.map((_, i) => i + 1)] },
    looks: (owner) => ({ side: POINT.side(TEAMS[owner - 1]), top: POINT.top(TEAMS[owner - 1]) }),
  },
  {
    id: 'power_station', name: ['Power-up Station', 'Powerup-station'], ...metal, light: 10, map: '#ff2bd6', kind: 'station', component: 'arena', tick: 5,
    state: { name: 'charged', values: [true, false] },
    looks: (charged) => ({ side: STATION.side(charged), top: STATION.top(charged) }),
  },
  {
    // Pumps haze over the arena in bursts while it is on; use it to switch it on or off.
    id: 'smoke_machine', name: ['Smoke Machine', 'Røgmaskine'], ...metal, light: 3, map: '#3a3f4b', kind: 'smoke', component: 'arena', tick: 10,
    state: { name: 'on', values: [true, false] },
    looks: (on) => ({ side: SMOKE.side(on), top: SMOKE.top(on) }),
  },
  {
    // Shoot it: the lights go out and a strobe flashes. Charged (lamp lit) or recharging.
    id: 'siren', name: ['Siren', 'Sirene'], ...metal, light: 8, map: '#ff3b3b', kind: 'siren', component: 'arena', tick: 10,
    state: { name: 'charged', values: [true, false] },
    looks: (charged) => ({ side: SIREN.side(charged), top: SIREN.top(charged) }),
  },
  { id: 'scoreboard_screen', name: ['Scoreboard Screen', 'Resultattavle'], faces: BLOCK_TEXTURES.scoreboard_screen, ...metal, light: 10, map: '#0b0f2a' },
  ...Object.entries(NEON).map(([colour, hexColour]) => ({
    id: `neon_panel_${colour}`, name: NEON_NAMES[colour], faces: { side: NEON_TEXTURE(hexColour) }, hardness: 0.8, sound: 'glass', light: 15, map: hexColour,
  })),
  { id: 'cover_crate', name: ['Cover Crate', 'Dækningskasse'], faces: BLOCK_TEXTURES.cover_crate, ...metal, light: 4, map: '#3a3f4b' },
  { id: 'blacklight_floor', name: ['Black-light Floor', 'Blacklight-gulv'], faces: BLOCK_TEXTURES.blacklight_floor, hardness: 1.5, sound: 'stone', light: 6, map: '#140c2a' },
];

const I = 'iron_ingot', R = 'redstone', L = 'glowstone', G = 'glass';
export const BLOCK_RECIPES = [
  shaped('game_console', ['IGI', 'RAR', 'III'], { I, G, R, A: 'amethyst_shard' }),
  ...TEAMS.map((t) => shaped(`spawn_pad_${t}`, ['DRD', 'III'], { D: `${t === 'green' ? 'lime' : t}_dye`, R, I })),
  ...TEAMS.map((t) => shaped(`flag_stand_${t}`, ['SW', 'S ', 'II'], { S: 'stick', W: WOOL[t], I })),
  shaped('control_point', ['GLG', 'RIR', 'III'], { G, L, R, I }),
  shaped('power_station', ['ALA', 'RIR', 'III'], { A: 'amethyst_shard', L, R, I }),
  shaped('smoke_machine', ['IBI', 'RCR', 'III'], { I, B: 'iron_bars', R, C: 'campfire' }),
  shaped('siren', ['GLG', 'RNR', 'III'], { G: 'red_stained_glass', L, R, N: 'bell', I }),
  shaped('scoreboard_screen', ['GGG', 'GRG', 'III'], { G, R, I }),
  ...Object.keys(NEON).map((c) => shaped(`neon_panel_${c}`, ['GDG', 'DLD', 'GDG'], { G, D: DYES[c], L }, 8)),
  shaped('cover_crate', ['NPN', 'PCP', 'NPN'], { N: 'iron_nugget', P: 'oak_planks', C: 'cyan_dye' }, 4),
  shaped('blacklight_floor', ['BMB', 'MLM', 'BMB'], { B: 'black_concrete', M: 'magenta_dye', L }, 8),
];

/** The value of a state as it appears in texture and model names. */
export const valueName = (v) => (typeof v === 'boolean' ? (v ? 'on' : 'off') : String(v));

/** The faces of a block, for each look: { suffix: { side, top?, bottom? } } ('' when the block has one look). */
export function blockLooks(block) {
  if (!block.state) return { '': block.faces };
  return Object.fromEntries(block.state.values.map((v) => [`_${valueName(v)}`, block.looks(v)]));
}

/** Texture atlas names (terrain_texture.json) and the pictures they point at. */
export function blockTextures(block) {
  const out = {};
  for (const [suffix, faces] of Object.entries(blockLooks(block))) {
    for (const [face, png] of Object.entries(faces)) out[`${block.id}${suffix}${face === 'side' ? '' : `_${face}`}`] = png;
  }
  return out;
}

export function bedrockBlock(block) {
  const tex = (name) => `${NS}_${name}`;
  const look = (suffix, faces) => {
    const m = { '*': { texture: tex(`${block.id}${suffix}`), render_method: 'opaque' } };
    if (faces.top) m.up = { texture: tex(`${block.id}${suffix}_top`), render_method: 'opaque' };
    if (faces.top) m.down = { texture: tex(faces.bottom ? `${block.id}${suffix}_bottom` : `${block.id}${suffix}`), render_method: 'opaque' };
    return m;
  };
  const looks = Object.entries(blockLooks(block));
  const state = block.state && STATES[block.state.name];
  const components = {
    'minecraft:geometry': 'minecraft:geometry.full_block',
    'minecraft:material_instances': look(...looks[0]),
    'minecraft:destructible_by_mining': { seconds_to_destroy: block.hardness },
    'minecraft:destructible_by_explosion': { explosion_resistance: block.hardness * 3 },
    'minecraft:map_color': block.map,
    'minecraft:display_name': `tile.${NS}:${block.id}.name`,
    ...(block.light ? { 'minecraft:light_emission': block.light } : {}),
    // The console opens its menu, the arena's blocks run the game around them (scripts/console.js, scripts/arena.js).
    ...(block.component ? { [`${NS}:${block.component}`]: {} } : {}),
    ...(block.tick ? { 'minecraft:tick': { interval_range: [block.tick, block.tick], looping: true } } : {}),
  };
  const condition = (v) => `q.block_state('${state}') == ${typeof v === 'boolean' ? v : v}`;
  return {
    format_version: '1.21.90',
    'minecraft:block': {
      description: {
        identifier: `${NS}:${block.id}`,
        menu_category: { category: 'construction' },
        ...(state ? { states: { [state]: block.state.values } } : {}),
      },
      components,
      ...(state ? {
        permutations: block.state.values.slice(1).map((v, i) => ({
          condition: condition(v),
          components: { 'minecraft:material_instances': look(...looks[i + 1]) },
        })),
      } : {}),
    },
  };
}
