// The laser bot and the projectiles -> Bedrock files: behaviour entity, client
// entity, render controller, animation controllers, sounds.
import { NS } from './constants.mjs';
import { RULES, TEAMS } from '../rules.mjs';

const fam = (value, operator = '==') => ({ test: 'is_family', subject: 'other', operator, value });
const notDown = { test: 'has_tag', subject: 'other', operator: '!=', value: `${NS}_down` };

/** Families of a bot on `team`, which other bots look for. */
export const botFamily = (team) => `${NS}_${team}`;

// ---------------------------------------------------------------- the laser bot

/**
 * The game's AI walks a bot towards players in another team's vest and other teams'
 * bots, and "shoots" a bot_shot at them. The script hears that shot, takes it away
 * and fires a laser instead (scripts/bots.js), so the bot's shots work like a
 * player's. A tagged bot is `down`: it stands still and doesn't shoot.
 */
export function buildBot(c) {
  const enemies = (team) => ({
    any_of: [
      {
        all_of: [fam('player'), notDown, {
          any_of: TEAMS.filter((t) => t !== team).map((t) => ({ test: 'has_equipment', subject: 'other', domain: 'torso', value: `${NS}:vest_${t}` })),
        }],
      },
      { all_of: [fam(`${NS}_bot`), fam(botFamily(team), '!='), notDown] },
    ],
  });
  const groups = Object.fromEntries(TEAMS.map((team, i) => [`${NS}:team_${team}`, {
    'minecraft:variant': { value: i + 1 },
    'minecraft:type_family': { family: [`${NS}_bot`, botFamily(team), NS, 'mob'] },
    'minecraft:behavior.nearest_attackable_target': {
      priority: 2, must_see: true, reselect_targets: true, scan_interval: 10, within_radius: RULES.bot.sight,
      entity_types: [{ filters: enemies(team), max_dist: RULES.bot.sight }],
    },
  }]));
  groups[`${NS}:armed`] = {
    'minecraft:movement': { value: c.speed },
    'minecraft:mark_variant': { value: 0 },
    'minecraft:shooter': { def: `${NS}:bot_shot` },
    'minecraft:behavior.ranged_attack': {
      priority: 3, speed_multiplier: 1.0, attack_radius: RULES.bot.range,
      attack_interval_min: RULES.bot.interval[0], attack_interval_max: RULES.bot.interval[1],
    },
  };
  groups[`${NS}:down`] = { 'minecraft:movement': { value: 0 }, 'minecraft:mark_variant': { value: 1 } };
  // Stands still and doesn't shoot, but can be tagged (the selftest's targets).
  groups[`${NS}:hold`] = { 'minecraft:movement': { value: 0 }, 'minecraft:mark_variant': { value: 0 } };
  const teamGroups = TEAMS.map((t) => `${NS}:team_${t}`);
  const events = {
    'minecraft:entity_spawned': {
      sequence: [
        { add: { component_groups: [`${NS}:armed`] } },
        { randomize: teamGroups.map((g) => ({ weight: 1, add: { component_groups: [g] } })) },
      ],
    },
    ...Object.fromEntries(TEAMS.map((t) => [`${NS}:join_${t}`, {
      remove: { component_groups: teamGroups.filter((g) => g !== `${NS}:team_${t}`) },
      add: { component_groups: [`${NS}:team_${t}`] },
    }])),
    [`${NS}:down`]: { remove: { component_groups: [`${NS}:armed`] }, add: { component_groups: [`${NS}:down`] } },
    [`${NS}:up`]: { remove: { component_groups: [`${NS}:down`, `${NS}:hold`] }, add: { component_groups: [`${NS}:armed`] } },
    [`${NS}:hold`]: { remove: { component_groups: [`${NS}:armed`, `${NS}:down`] }, add: { component_groups: [`${NS}:hold`] } },
  };
  return {
    format_version: '1.21.90',
    'minecraft:entity': {
      description: { identifier: `${NS}:${c.id}`, spawn_category: 'creature', is_spawnable: true, is_summonable: true },
      component_groups: groups,
      components: {
        'minecraft:type_family': { family: [`${NS}_bot`, NS, 'mob'] },
        'minecraft:collision_box': { width: c.size[0], height: c.size[1] },
        'minecraft:health': { value: c.health, max: c.health },
        // Lasers never hurt; only a player's hand or weapon (to clear bots away) and the void do.
        'minecraft:damage_sensor': {
          triggers: [
            { on_damage: { filters: fam('player') }, cause: 'entity_attack', deals_damage: 'yes' },
            { cause: 'void', deals_damage: 'yes' },
            { cause: 'all', deals_damage: 'no' },
          ],
        },
        'minecraft:fire_immune': {},
        'minecraft:breathable': { breathes_water: true, total_supply: 15, suffocate_time: 0 },
        'minecraft:nameable': { always_show: true },
        'minecraft:persistent': {},
        'minecraft:physics': {},
        'minecraft:jump.static': {},
        'minecraft:movement.basic': {},
        'minecraft:navigation.walk': { avoid_water: true, avoid_damage_blocks: true, can_open_doors: true },
        'minecraft:pushable': { is_pushable: true, is_pushable_by_piston: true },
        'minecraft:follow_range': { value: RULES.bot.sight, max: RULES.bot.sight },
        'minecraft:conditional_bandwidth_optimization': {},
        'minecraft:ambient_sound_interval': { event_name: 'ambient', range: 16, value: 10 },
        'minecraft:behavior.float': { priority: 0 },
        'minecraft:behavior.random_stroll': { priority: 6, speed_multiplier: 0.8 },
        'minecraft:behavior.look_at_player': { priority: 7, look_distance: 8, probability: 0.02 },
        'minecraft:behavior.random_look_around': { priority: 8 },
      },
      events,
    },
  };
}

const anim = (c, name) => `animation.${NS}.${c.id}.${name}`;

export function buildAnimationControllers(c) {
  return {
    format_version: '1.10.0',
    animation_controllers: {
      [`controller.animation.${NS}.${c.id}.move`]: {
        initial_state: 'default',
        states: {
          default: { animations: ['idle'], transitions: [{ walking: 'query.ground_speed > 0.3' }, { down: 'query.mark_variant == 1' }], blend_transition: 0.2 },
          walking: { animations: ['walk'], transitions: [{ default: 'query.ground_speed <= 0.3' }, { down: 'query.mark_variant == 1' }], blend_transition: 0.2 },
          down: { animations: ['down'], transitions: [{ default: 'query.mark_variant == 0' }], blend_transition: 0.3 },
        },
      },
    },
  };
}

export function buildClientEntity(c) {
  const animations = Object.fromEntries(Object.keys(c.anims).map((n) => [n, anim(c, n)]));
  animations.move_controller = `controller.animation.${NS}.${c.id}.move`;
  animations.look_at_target = `animation.${NS}.common.look_at_target`;
  return {
    format_version: '1.10.0',
    'minecraft:client_entity': {
      description: {
        identifier: `${NS}:${c.id}`,
        materials: { default: 'entity_emissive_alpha' },
        // One texture per team; the render controller picks by variant (1–4).
        textures: Object.fromEntries(TEAMS.map((t) => [t, `textures/entity/${NS}/${c.id}_${t}`])),
        geometry: { default: `geometry.${NS}.${c.id}` },
        animations,
        scripts: { animate: ['move_controller', 'look_at_target'] },
        render_controllers: [`controller.render.${NS}.${c.id}`],
        spawn_egg: { base_color: c.egg[0], overlay_color: c.egg[1] },
      },
    },
  };
}

export function buildBotRenderController(c) {
  return {
    format_version: '1.8.0',
    render_controllers: {
      [`controller.render.${NS}.${c.id}`]: {
        arrays: { textures: { 'Array.teams': TEAMS.map((t) => `Texture.${t}`) } },
        geometry: 'Geometry.default',
        materials: [{ '*': 'Material.default' }],
        textures: ['Array.teams[math.clamp(query.variant - 1, 0, 3)]'],
      },
    },
  };
}

export function buildRenderController(id) {
  return {
    format_version: '1.8.0',
    render_controllers: {
      [`controller.render.${NS}.${id}`]: {
        geometry: 'Geometry.default',
        materials: [{ '*': 'Material.default' }],
        textures: ['Texture.default'],
      },
    },
  };
}

export function buildEntitySounds(c) {
  const s = c.sounds;
  return { volume: 1.0, pitch: s.pitch, events: { ambient: s.ambient, hurt: s.hurt, death: s.death, step: s.step } };
}

// ---------------------------------------------------------------- projectiles

/**
 * The thrown pulse grenade, and the bots' shot (which the script takes away the
 * moment it appears and replaces with a laser). Neither hurts anything: the
 * script hears the grenade land and tags the vests round it.
 */
export const PROJECTILES = [
  { id: RULES.grenade.id, size: [3, 3, 3], gravity: 0.05, power: 1.0 },
  { id: 'bot_shot', size: [1, 1, 1], gravity: 0, power: 1.6 },
];

export function projectileModel(p) {
  const [w, , d] = p.size;
  return { bones: [{ name: 'root', pivot: [0, 0, 0], cubes: [{ origin: [-w / 2, 0, -d / 2], size: p.size, mat: 'core' }] }] };
}

export function buildProjectile(p) {
  return {
    format_version: '1.21.90',
    'minecraft:entity': {
      description: { identifier: `${NS}:${p.id}`, is_spawnable: false, is_summonable: true },
      components: {
        'minecraft:collision_box': { width: 0.25, height: 0.25 },
        'minecraft:projectile': {
          on_hit: { remove_on_hit: {} },
          power: p.power,
          gravity: p.gravity,
          uncertainty_base: 1,
          uncertainty_multiplier: 0,
          anchor: 1,
          offset: [0, -0.1, 0],
        },
        'minecraft:fire_immune': {},
        'minecraft:physics': {},
        'minecraft:pushable': { is_pushable: false, is_pushable_by_piston: true },
        'minecraft:despawn': { despawn_from_distance: { min_distance: 32, max_distance: 64 } },
      },
    },
  };
}

export function buildProjectileClient(p) {
  return {
    format_version: '1.10.0',
    'minecraft:client_entity': {
      description: {
        identifier: `${NS}:${p.id}`,
        materials: { default: 'entity_emissive_alpha' },
        textures: { default: `textures/entity/${NS}/${p.id}` },
        geometry: { default: `geometry.${NS}.${p.id}` },
        animations: { spin: `animation.${NS}.common.spin` },
        scripts: { animate: ['spin'] },
        render_controllers: [`controller.render.${NS}.${p.id}`],
      },
    },
  };
}
