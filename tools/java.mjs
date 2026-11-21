// Generates the Java edition's resources (java/src/generated/resources) from the
// same specs as the Bedrock packs. GeckoLib reads the Bedrock geometry and
// animation formats directly, so the laser bot's model and animations are shared as-is.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { NS } from '../src/lib/constants.mjs';
import { eggIcon } from '../src/lib/texture.mjs';
import { blockLooks, valueName } from '../src/blocks.mjs';

const BEDROCK_TO_JAVA_SOUNDS = {
  'random.click': 'ui.button.click',
  'random.anvil_land': 'block.anvil.land',
  'random.break': 'entity.item.break',
  'step.stone': 'block.stone.step',
};

// Items whose Java id differs from the Bedrock one.
const JAVA_ITEMS = {};
const javaItem = (id) => {
  const full = id.includes(':') ? id : `minecraft:${id}`;
  return JAVA_ITEMS[full] ?? full;
};
const javaSound = (s) => {
  const j = BEDROCK_TO_JAVA_SOUNDS[s];
  if (!j) throw new Error(`No Java sound mapped for Bedrock sound "${s}" (tools/java.mjs)`);
  return `minecraft:${j}`;
};

async function write(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2) + '\n');
}

/** Stats read by the Java mod at startup (dk.ulfen.lasertag.LaserData). */
function creatureRecord(c) {
  return {
    id: c.id, width: c.size[0], height: c.size[1], health: c.health, speed: c.speed,
    animations: Object.keys(c.anims),
    sounds: { ambient: javaSound(c.sounds.ambient), hurt: javaSound(c.sounds.hurt), death: javaSound(c.sounds.death), step: javaSound(c.sounds.step), pitchMin: c.sounds.pitch[0], pitchMax: c.sounds.pitch[1] },
  };
}

/** A block that drops itself. */
const blockLoot = (id) => ({
  type: 'minecraft:block',
  pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: `${NS}:${id}` }], conditions: [{ condition: 'minecraft:survives_explosion' }] }],
});

/** Bedrock recipe -> Java recipe. */
function javaRecipe(recipe) {
  const [type, body] = Object.entries(recipe)[0];
  const name = body.description.identifier.split(':')[1];
  const result = { id: javaItem(body.result.item), count: body.result.count ?? 1 };
  if (type === 'minecraft:recipe_shaped') {
    return [name, {
      type: 'minecraft:crafting_shaped', category: 'equipment', pattern: body.pattern,
      key: Object.fromEntries(Object.entries(body.key).map(([k, v]) => [k, javaItem(v.item)])),
      result,
    }];
  }
  if (type === 'minecraft:recipe_shapeless') {
    return [name, { type: 'minecraft:crafting_shapeless', category: 'misc', ingredients: body.ingredients.map((i) => javaItem(i.item)), result }];
  }
  throw new Error(`Unknown recipe type ${type}`);
}

async function itemModel(A, id, parent) {
  await write(join(A, 'models', 'item', `${id}.json`), { parent, textures: { layer0: `${NS}:item/${id}` } });
  await write(join(A, 'items', `${id}.json`), { model: { type: 'minecraft:model', model: `${NS}:item/${id}` } });
}

export async function buildJava({ creatures, items, blocks, blockTextures, recipes, langs, icon, vests, rules, fixtures, OUT }) {
  await rm(OUT, { recursive: true, force: true });
  const A = join(OUT, 'assets', NS);
  const D = join(OUT, 'data', NS);

  // The laser bot: one texture per team (dk.ulfen.lasertag.client.BotRenderer picks it).
  for (const { creature: c, geo, textures, animations } of Object.values(creatures)) {
    await write(join(A, 'geckolib', 'models', 'entity', `${c.id}.geo.json`), geo.geometry);
    await write(join(A, 'geckolib', 'animations', 'entity', `${c.id}.animation.json`), animations);
    for (const [team, png] of Object.entries(textures)) await write(join(A, 'textures', 'entity', `${c.id}_${team}.png`), png);
    await write(join(A, 'textures', 'item', `${c.id}_spawn_egg.png`), eggIcon(c.egg[0], c.egg[1], 7));
    await itemModel(A, `${c.id}_spawn_egg`, 'minecraft:item/generated');
  }
  await write(join(D, 'creatures.json'), Object.values(creatures).map(({ creature }) => creatureRecord(creature)));
  await write(join(D, 'rules.json'), rules);
  await write(join(D, 'fixtures.json'), fixtures);

  // Items
  for (const item of items) {
    await write(join(A, 'textures', 'item', `${item.id}.png`), item.icon);
    await itemModel(A, item.id, item.handheld ? 'minecraft:item/handheld' : 'minecraft:item/generated');
  }

  await write(join(D, 'tags', 'item', 'repairs_vest.json'), { values: ['minecraft:leather'] });

  // Vests: worn with the vanilla model, drawn from the same pictures as on Bedrock.
  for (const [team, png] of Object.entries(vests)) {
    await write(join(A, 'equipment', `vest_${team}.json`), { layers: { humanoid: [{ texture: `${NS}:vest_${team}` }] } });
    await write(join(A, 'textures', 'entity', 'equipment', 'humanoid', `vest_${team}.png`), png);
  }

  // Blocks: one model for each look, and a blockstate that picks it.
  for (const [name, png] of Object.entries(blockTextures)) await write(join(A, 'textures', 'block', `${name}.png`), png);
  for (const block of blocks) {
    const looks = Object.entries(blockLooks(block));
    for (const [suffix, faces] of looks) {
      const t = (face) => `${NS}:block/${block.id}${suffix}${face ? `_${face}` : ''}`;
      await write(join(A, 'models', 'block', `${block.id}${suffix}.json`), faces.top
        ? { parent: 'minecraft:block/cube_bottom_top', textures: { side: t(), top: t('top'), bottom: faces.bottom ? t('bottom') : t() } }
        : { parent: 'minecraft:block/cube_all', textures: { all: t() } });
    }
    const variants = block.state
      ? Object.fromEntries(block.state.values.map((v) => [`${block.state.name}=${v}`, { model: `${NS}:block/${block.id}_${valueName(v)}` }]))
      : { '': { model: `${NS}:block/${block.id}` } };
    await write(join(A, 'blockstates', `${block.id}.json`), { variants });
    await write(join(A, 'items', `${block.id}.json`), { model: { type: 'minecraft:model', model: `${NS}:block/${block.id}${looks[0][0]}` } });
    await write(join(D, 'loot_table', 'blocks', `${block.id}.json`), blockLoot(block.id));
  }
  await write(join(OUT, 'data', 'minecraft', 'tags', 'block', 'mineable', 'pickaxe.json'), { values: blocks.map((b) => `${NS}:${b.id}`) });

  for (const recipe of recipes) {
    const [name, body] = javaRecipe(recipe);
    await write(join(D, 'recipe', `${name}.json`), body);
  }

  // Language files: Bedrock keys -> Java keys.
  for (const [locale, entries] of Object.entries(langs)) {
    const out = {};
    for (const [k, v] of entries) {
      let m;
      if ((m = k.match(new RegExp(`^entity\\.${NS}:(.+)\\.name$`)))) out[`entity.${NS}.${m[1]}`] = v;
      else if ((m = k.match(new RegExp(`^item\\.spawn_egg\\.entity\\.${NS}:(.+)\\.name$`)))) out[`item.${NS}.${m[1]}_spawn_egg`] = v;
      else if ((m = k.match(new RegExp(`^item\\.${NS}:(.+)\\.name$`)))) out[`item.${NS}.${m[1]}`] = v;
      else if ((m = k.match(new RegExp(`^tile\\.${NS}:(.+)\\.name$`)))) out[`block.${NS}.${m[1]}`] = v;
      else if (k.startsWith(`${NS}.`) || k.startsWith('itemGroup.')) out[k] = v;
    }
    await write(join(A, 'lang', `${locale.toLowerCase()}.json`), out);
  }

  await write(join(A, 'icon.png'), icon);
}
