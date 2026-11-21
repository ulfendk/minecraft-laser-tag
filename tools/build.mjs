// Generates the behavior pack and resource pack into build/, and the Java
// edition's resources into java/src/generated/resources (tools/java.mjs).
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CREATURES } from '../src/creatures.mjs';
import { BLOCK_RECIPES, BLOCKS, bedrockBlock, blockTextures } from '../src/blocks.mjs';
import { buildItem, ITEMS, RECIPES } from '../src/items.mjs';
import { langEntries, LOCALES } from '../src/i18n.mjs';
import { RULES, TEAMS } from '../src/rules.mjs';
import { vestLayer } from '../src/art.mjs';
import { animationFile } from '../src/lib/anim.mjs';
import {
  buildAnimationControllers, buildBot, buildBotRenderController, buildClientEntity, buildEntitySounds,
  buildProjectile, buildProjectileClient, buildRenderController, projectileModel, PROJECTILES,
} from '../src/lib/entity.mjs';
import { MIN_ENGINE, NS, PACK_NAME, SCRIPT_SERVER_VERSION, SCRIPT_UI_VERSION } from '../src/lib/constants.mjs';
import { packIcon } from '../src/lib/icon.mjs';
import { buildGeometry } from '../src/lib/model.mjs';
import { paintTexture } from '../src/lib/texture.mjs';
import { buildJava } from './java.mjs';
import { fixtures } from './fixtures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build');
const BP = join(OUT, 'behavior_pack');
const RP = join(OUT, 'resource_pack');

const UUID = {
  bpHeader: 'ac8bbf4b-f6be-40d3-ad7e-24bf8519c43f',
  bpData: '9abea5ba-5267-4bc0-8fac-881a2eda5c13',
  bpScript: 'fa280d72-82e7-4530-98ea-a4c0266ce177',
  rpHeader: '576e445d-865b-4724-88bf-8285cf845691',
  rpResources: 'acafdee0-ff7d-44ab-9c8a-15b82ec2af82',
};

async function write(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2) + '\n');
}

function manifests(version) {
  const v = version.split('.').map(Number);
  const metadata = { authors: ['Laser Tag contributors'], license: 'MIT' };
  const bp = {
    format_version: 2,
    header: { name: `${PACK_NAME} v${version} (Behavior)`, description: 'pack.description', uuid: UUID.bpHeader, version: v, min_engine_version: MIN_ENGINE },
    modules: [
      { type: 'data', uuid: UUID.bpData, version: v },
      { type: 'script', language: 'javascript', uuid: UUID.bpScript, version: v, entry: 'scripts/main.js' },
    ],
    dependencies: [
      { uuid: UUID.rpHeader, version: v },
      { module_name: '@minecraft/server', version: SCRIPT_SERVER_VERSION },
      { module_name: '@minecraft/server-ui', version: SCRIPT_UI_VERSION },
    ],
    metadata,
  };
  const rp = {
    format_version: 2,
    header: { name: `${PACK_NAME} v${version} (Resources)`, description: 'pack.description', uuid: UUID.rpHeader, version: v, min_engine_version: MIN_ENGINE },
    modules: [{ type: 'resources', uuid: UUID.rpResources, version: v }],
    dependencies: [{ uuid: UUID.bpHeader, version: v }],
    metadata,
  };
  return { bp, rp };
}

/**
 * Geometry, textures (one per team) and animations of every creature (shared with the
 * Java edition, previews and the site). `texture` is the red team's.
 */
export function buildCreatureArt() {
  return Object.fromEntries(CREATURES.map((c) => {
    const geo = buildGeometry(`geometry.${NS}.${c.id}`, c.model);
    const textures = Object.fromEntries(Object.entries(c.teams).map(([t, m]) => [t, paintTexture(geo, m)]));
    return [c.id, { creature: c, geo, texture: textures.red, textures, animations: animationFile(NS, c.id, c.anims) }];
  }));
}

/** The vests as worn: the vanilla chestplate model with the team's picture. */
function attachable(item) {
  return {
    format_version: '1.10.0',
    'minecraft:attachable': {
      description: {
        identifier: `${NS}:${item.id}`,
        materials: { default: 'armor', enchanted: 'armor_enchanted' },
        textures: { default: `textures/models/${NS}/${item.id}`, enchanted: 'textures/misc/enchanted_item_glint' },
        geometry: { default: 'geometry.humanoid.armor.chestplate' },
        scripts: { parent_setup: 'variable.chest_layer_visible = 0.0;' },
        render_controllers: ['controller.render.armor'],
      },
    },
  };
}

/** A beam is a line of these, one every few tenths of a block; sparks burst where it hits. */
function particles() {
  const out = {};
  const colours = { ...Object.fromEntries(TEAMS.map((t) => [t, RULES.colours[t].rgb])), white: [235, 240, 255] };
  for (const [name, rgb] of Object.entries(colours)) {
    const color = [...rgb.map((v) => Math.round((v / 255) * 100) / 100), 1];
    const texture = { texture_width: 128, texture_height: 128, uv: [0, 24], uv_size: [8, 8] };
    out[`laser_${name}`] = {
      format_version: '1.10.0',
      particle_effect: {
        description: { identifier: `${NS}:laser_${name}`, basic_render_parameters: { material: 'particles_add', texture: 'textures/particle/particles' } },
        components: {
          'minecraft:emitter_rate_instant': { num_particles: 1 },
          'minecraft:emitter_lifetime_once': { active_time: 0.2 },
          'minecraft:emitter_shape_point': {},
          'minecraft:particle_lifetime_expression': { max_lifetime: 0.25 },
          'minecraft:particle_appearance_billboard': { size: [0.08, 0.08], facing_camera_mode: 'lookat_xyz', uv: texture },
          'minecraft:particle_appearance_tinting': { color },
        },
      },
    };
    out[`spark_${name}`] = {
      format_version: '1.10.0',
      particle_effect: {
        description: { identifier: `${NS}:spark_${name}`, basic_render_parameters: { material: 'particles_add', texture: 'textures/particle/particles' } },
        components: {
          'minecraft:emitter_rate_instant': { num_particles: 14 },
          'minecraft:emitter_lifetime_once': { active_time: 0.1 },
          'minecraft:emitter_shape_sphere': { radius: 0.2, direction: 'outwards' },
          'minecraft:particle_initial_speed': 3,
          'minecraft:particle_motion_dynamic': { linear_drag_coefficient: 4 },
          'minecraft:particle_lifetime_expression': { max_lifetime: 0.5 },
          'minecraft:particle_appearance_billboard': { size: [0.1, 0.1], facing_camera_mode: 'lookat_xyz', uv: texture },
          'minecraft:particle_appearance_tinting': { color },
        },
      },
    };
  }
  // Smoke machine haze: big, soft, slow puffs that drift, grow and fade.
  const smoke = RULES.smoke;
  out.haze = {
    format_version: '1.10.0',
    particle_effect: {
      description: { identifier: `${NS}:haze`, basic_render_parameters: { material: 'particles_blend', texture: 'textures/particle/particles' } },
      components: {
        'minecraft:emitter_rate_instant': { num_particles: smoke.puffs },
        'minecraft:emitter_lifetime_once': { active_time: 0.1 },
        'minecraft:emitter_shape_sphere': { radius: 0.4, direction: 'outwards' },
        'minecraft:particle_initial_speed': `math.random(${smoke.drift * 10}, ${smoke.drift * 20})`,
        'minecraft:particle_motion_dynamic': { linear_acceleration: [0, 0.04, 0], linear_drag_coefficient: 0.5 },
        'minecraft:particle_lifetime_expression': { max_lifetime: 'math.random(5, 8)' },
        'minecraft:particle_initial_spin': { rotation: 'math.random(0, 360)' },
        'minecraft:particle_appearance_billboard': {
          size: ['0.8 + v.particle_age / v.particle_lifetime * 1.4', '0.8 + v.particle_age / v.particle_lifetime * 1.4'],
          facing_camera_mode: 'rotate_xyz',
          uv: { texture_width: 128, texture_height: 128, uv: [56, 0], uv_size: [8, 8] },
        },
        'minecraft:particle_appearance_tinting': {
          color: [0.8, 0.82, 0.9, '0.4 * math.clamp(v.particle_age, 0, 1) * math.clamp((v.particle_lifetime - v.particle_age) / 2, 0, 1)'],
        },
      },
    },
  };
  return out;
}

export async function build({ quiet = false } = {}) {
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  await rm(BP, { recursive: true, force: true });
  await rm(RP, { recursive: true, force: true });

  // Hand-written files first; generated files may add to the same folders.
  await cp(join(ROOT, 'src', 'packs', 'behavior_pack'), BP, { recursive: true });
  await cp(join(ROOT, 'src', 'packs', 'resource_pack'), RP, { recursive: true });

  const { bp, rp } = manifests(pkg.version);
  await write(join(BP, 'manifest.json'), bp);
  await write(join(RP, 'manifest.json'), rp);
  const icon = packIcon();
  await write(join(BP, 'pack_icon.png'), icon);
  await write(join(RP, 'pack_icon.png'), icon);

  // The laser bot
  const creatures = buildCreatureArt();
  const sounds = {};
  for (const { creature: c, geo, textures, animations } of Object.values(creatures)) {
    await write(join(BP, 'entities', `${c.id}.json`), buildBot(c));
    await write(join(RP, 'models', 'entity', `${c.id}.geo.json`), geo.geometry);
    for (const [team, png] of Object.entries(textures)) await write(join(RP, 'textures', 'entity', NS, `${c.id}_${team}.png`), png);
    await write(join(RP, 'animations', `${c.id}.animation.json`), animations);
    await write(join(RP, 'animation_controllers', `${c.id}.animation_controllers.json`), buildAnimationControllers(c));
    await write(join(RP, 'entity', `${c.id}.entity.json`), buildClientEntity(c));
    await write(join(RP, 'render_controllers', `${c.id}.render_controllers.json`), buildBotRenderController(c));
    sounds[`${NS}:${c.id}`] = buildEntitySounds(c);
  }
  await write(join(RP, 'sounds.json'), { entity_sounds: { entities: sounds } });

  // Projectiles: the thrown pulse grenade and the bots' shot.
  for (const p of PROJECTILES) {
    const geo = buildGeometry(`geometry.${NS}.${p.id}`, projectileModel(p));
    const texture = paintTexture(geo, { core: { base: p.id === 'bot_shot' ? '#22e6ff' : '#ff2bd6', shading: 0.3 } });
    await write(join(BP, 'entities', `${p.id}.json`), buildProjectile(p));
    await write(join(RP, 'models', 'entity', `${p.id}.geo.json`), geo.geometry);
    await write(join(RP, 'textures', 'entity', NS, `${p.id}.png`), texture);
    await write(join(RP, 'entity', `${p.id}.entity.json`), buildProjectileClient(p));
    await write(join(RP, 'render_controllers', `${p.id}.render_controllers.json`), buildRenderController(p.id));
  }

  for (const [name, json] of Object.entries(particles())) await write(join(RP, 'particles', `${name}.json`), json);

  // Items, and the vests as worn
  const itemTextures = {};
  const vests = {};
  for (const item of ITEMS) {
    await write(join(BP, 'items', `${item.id}.json`), buildItem(item));
    await write(join(RP, 'textures', 'items', NS, `${item.id}.png`), item.icon);
    itemTextures[`${NS}_${item.id}`] = { textures: `textures/items/${NS}/${item.id}` };
    if (item.kind === 'vest') {
      vests[item.team] = vestLayer(item.team);
      await write(join(RP, 'textures', 'models', NS, `${item.id}.png`), vests[item.team]);
      await write(join(RP, 'attachables', `${item.id}.json`), attachable(item));
    }
  }
  await write(join(RP, 'textures', 'item_texture.json'), { resource_pack_name: NS, texture_name: 'atlas.items', texture_data: itemTextures });

  // Blocks
  const terrain = {};
  const blockTextureFiles = {};
  for (const block of BLOCKS) {
    await write(join(BP, 'blocks', `${block.id}.json`), bedrockBlock(block));
    for (const [name, png] of Object.entries(blockTextures(block))) {
      await write(join(RP, 'textures', 'blocks', NS, `${name}.png`), png);
      terrain[`${NS}_${name}`] = { textures: `textures/blocks/${NS}/${name}` };
      blockTextureFiles[name] = png;
    }
  }
  await write(join(RP, 'textures', 'terrain_texture.json'), { resource_pack_name: NS, texture_name: 'atlas.terrain', padding: 8, num_mip_levels: 4, texture_data: terrain });
  await write(join(RP, 'textures', 'flipbook_textures.json'), []);
  await write(join(RP, 'blocks.json'), { format_version: '1.21.40', ...Object.fromEntries(BLOCKS.map((b) => [`${NS}:${b.id}`, { sound: b.sound }])) });

  const recipes = [...RECIPES, ...BLOCK_RECIPES];
  for (const recipe of recipes) {
    const body = Object.values(recipe)[0];
    await write(join(BP, 'recipes', `${body.description.identifier.split(':')[1]}.json`), { format_version: '1.12', ...recipe });
  }

  // Data for the scripts, and the game's rules, which they share with the tests and the Java mod.
  await write(join(BP, 'scripts', 'data.js'), [
    '// Generated by tools/build.mjs',
    `export const RULES = ${JSON.stringify(RULES)};`,
    `export const ITEMS = ${JSON.stringify(ITEMS.map((i) => `${NS}:${i.id}`))};`,
    `export const BLOCKS = ${JSON.stringify(BLOCKS.map((b) => ({ id: `${NS}:${b.id}`, kind: b.kind ?? null, team: b.team ?? null })))};`,
    `export const CREATURES = ${JSON.stringify(CREATURES.map((c) => `${NS}:${c.id}`))};`,
    `export const PROJECTILES = ${JSON.stringify(PROJECTILES.map((p) => `${NS}:${p.id}`))};`,
    '',
  ].join('\n'));
  const logic = await readFile(join(ROOT, 'src', 'lib', 'game.mjs'), 'utf8');
  await write(join(BP, 'scripts', 'logic.js'), logic.replace("from '../rules.mjs'", "from './data.js'"));

  // Language
  const langs = {};
  for (const locale of LOCALES) {
    const entries = langEntries(locale, { items: ITEMS, blocks: BLOCKS, creatures: CREATURES, projectiles: PROJECTILES, version: pkg.version });
    langs[locale] = entries;
    const text = entries.map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
    for (const pack of [BP, RP]) await write(join(pack, 'texts', `${locale}.lang`), text);
  }
  for (const pack of [BP, RP]) await write(join(pack, 'texts', 'languages.json'), LOCALES);

  await buildJava({
    creatures, items: ITEMS, blocks: BLOCKS, blockTextures: blockTextureFiles, recipes, langs, icon, vests, rules: RULES,
    fixtures: fixtures(), OUT: join(ROOT, 'java', 'src', 'generated', 'resources'),
  });

  if (!quiet) {
    console.log(`Built ${PACK_NAME} ${pkg.version}: ${CREATURES.length} creature, ${PROJECTILES.length} projectiles, ${ITEMS.length} items, ${BLOCKS.length} blocks, ${recipes.length} recipes; Java resources in java/src/generated/resources`);
  }
  return { creatures, items: ITEMS, blocks: BLOCKS, version: pkg.version };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
