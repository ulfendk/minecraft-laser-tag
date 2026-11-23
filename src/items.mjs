// Items: the laser guns, the pulse grenade and the vests in the four team colours.
// Names are [English, Danish].
import { NS } from './lib/constants.mjs';
import { ICONS } from './art.mjs';
import { RULES, TEAMS } from './rules.mjs';

const mc = (id) => (id.includes(':') ? id : `minecraft:${id}`);

export const TEAM_NAMES = {
  red: ['Red', 'Rød'],
  blue: ['Blue', 'Blå'],
  green: ['Green', 'Grøn'],
  yellow: ['Yellow', 'Gul'],
};
const DYES = { red: 'red_dye', blue: 'blue_dye', green: 'lime_dye', yellow: 'yellow_dye' };

const gun = (id, name, cooldown = RULES.guns[id].cooldown) => ({
  id, name, category: 'equipment', stack: 1, handheld: true, kind: 'gun',
  components: {
    'minecraft:hand_equipped': true,
    // Fired from scripts/guns.js; the cooldown keeps one click one shot.
    'minecraft:cooldown': { category: `${NS}:${id}`, duration: cooldown },
  },
});

export const ITEMS = [
  gun('laser_pistol', ['Laser Pistol', 'Laserpistol']),
  gun('laser_blaster', ['Laser Blaster', 'Laserblaster']),
  gun('laser_rifle', ['Laser Rifle', 'Lasergevær']),
  gun('scatter_laser', ['Scatter Laser', 'Spredelaser']),
  // The first click raises the scope, so the bolt's cycle is kept by the script alone.
  gun('laser_sniper', ['Laser Sniper', 'Lasersnigskytte'], 0.25),
  gun('spread_cannon', ['Spread Cannon', 'Spredekanon']),
  {
    id: RULES.grenade.id, name: ['Pulse Grenade', 'Pulsgranat'], category: 'equipment', stack: 16, kind: 'grenade',
    components: {
      'minecraft:throwable': { do_swing_animation: true, launch_power_scale: 1.0, max_launch_power: 1.0 },
      'minecraft:projectile': { projectile_entity: `${NS}:${RULES.grenade.id}`, minimum_critical_power: 1.0 },
    },
  },
  ...TEAMS.map((team) => ({
    id: `vest_${team}`, name: [`${TEAM_NAMES[team][0]} Laser Vest`, `${TEAM_NAMES[team][1]} laservest`], category: 'equipment', stack: 1, kind: 'vest', team,
    // A vest gives no protection: it only tells the game which team you are on.
    components: { 'minecraft:wearable': { slot: 'slot.armor.chest', protection: 0 } },
  })),
].map((item) => ({ ...item, icon: ICONS[item.id] }));

// ---------------------------------------------------------------- recipes

const keyOf = (key) => Object.fromEntries(Object.entries(key).map(([k, v]) => [k, { item: mc(v) }]));

export function shaped(id, pattern, key, count = 1, result = `${NS}:${id}`) {
  return {
    'minecraft:recipe_shaped': {
      description: { identifier: `${NS}:${id}` },
      tags: ['crafting_table'],
      pattern,
      key: keyOf(key),
      result: { item: result, count },
      unlock: [{ item: mc(Object.values(key)[0]) }],
    },
  };
}

export function shapeless(id, ingredients, count = 1, result = `${NS}:${id}`) {
  return {
    'minecraft:recipe_shapeless': {
      description: { identifier: `${NS}:${id}` },
      tags: ['crafting_table'],
      ingredients: ingredients.map((i) => ({ item: mc(i) })),
      result: { item: result, count },
      unlock: [{ item: mc(ingredients[0]) }],
    },
  };
}

const I = 'iron_ingot', R = 'redstone', G = 'glass_pane', A = 'amethyst_shard';
export const RECIPES = [
  shaped('laser_pistol', ['IIA', ' R '], { I, A, R }),
  shaped('laser_blaster', ['IIA', 'RIG'], { I, A, R, G }),
  shaped('laser_rifle', ['  G', 'IIA', 'R  '], { G, I, A, R }),
  shaped('scatter_laser', [' AA', 'IIA', 'R  '], { A, I, R }),
  shaped('laser_sniper', ['SGG', 'IIA', 'R  '], { S: 'spyglass', G, I, A, R }),
  shaped('spread_cannon', ['AAA', 'IIA', 'RI '], { A, I, R }),
  shaped(RULES.grenade.id, [' I ', 'IRI', ' A '], { I, R, A }, 4),
  ...TEAMS.map((t) => shaped(`vest_${t}`, ['L L', 'DRD', 'LLL'], { L: 'leather', D: DYES[t], R }, 1)),
];

export function buildItem(item) {
  return {
    format_version: '1.21.90',
    'minecraft:item': {
      description: { identifier: `${NS}:${item.id}`, menu_category: { category: item.category ?? 'items' } },
      components: {
        'minecraft:icon': `${NS}_${item.id}`,
        'minecraft:display_name': { value: `item.${NS}:${item.id}.name` },
        'minecraft:max_stack_size': item.stack ?? 64,
        ...(item.components ?? {}),
      },
    },
  };
}
