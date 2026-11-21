import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MinecraftItemTypes } from '@minecraft/vanilla-data';
import { BLOCK_RECIPES, BLOCKS, blockTextures } from '../src/blocks.mjs';
import { CREATURES } from '../src/creatures.mjs';
import { ITEMS, RECIPES } from '../src/items.mjs';
import { langEntries, LOCALES, STRINGS } from '../src/i18n.mjs';
import { RULES, TEAMS } from '../src/rules.mjs';
import { PROJECTILES } from '../src/lib/entity.mjs';
import { NS } from '../src/lib/constants.mjs';

const ctx = { items: ITEMS, blocks: BLOCKS, creatures: CREATURES, projectiles: PROJECTILES, version: '0' };
const recipes = [...RECIPES, ...BLOCK_RECIPES];
const VANILLA = new Set(Object.values(MinecraftItemTypes));
const results = new Set(recipes.map((r) => Object.values(r)[0].result.item));

test('every item has an icon and an English and a Danish name', () => {
  for (const it of ITEMS) {
    assert.ok(it.icon, `${it.id}: icon`);
    assert.equal(it.name.length, 2, `${it.id}: name`);
    assert.ok(it.name.every(Boolean), `${it.id}: name`);
  }
  for (const b of BLOCKS) assert.ok(b.name.every(Boolean), b.id);
  for (const c of CREATURES) assert.ok(c.name.every(Boolean), c.id);
});

test('every in-game text exists in both languages, and the site texts too', () => {
  const [en, da] = LOCALES.map((l) => new Map(langEntries(l, ctx)));
  assert.deepEqual([...en.keys()], [...da.keys()]);
  for (const [k, v] of da) assert.ok(v, `${k} is empty in Danish`);
  assert.deepEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS.da).sort());
  for (const id of [...Object.keys(RULES.guns), RULES.grenade.id]) assert.ok(STRINGS.en.guns[id] && STRINGS.da.guns[id], id);
  for (const m of Object.keys(RULES.modes)) assert.ok(STRINGS.en.modes[m] && STRINGS.da.modes[m], m);
  for (const k of Object.keys(RULES.powerups.kinds)) assert.ok(STRINGS.en.powerups[k] && STRINGS.da.powerups[k] && STRINGS.da.powerNames[k], k);
  // Every message the scripts and the mod send has a text.
  for (const key of ['feed', 'hud.down', 'hud.heat', 'title.tagged', 'over', 'winner', 'draw', 'stats', 'mvp', 'form.title', 'menu.start', 'running',
    ...RULES.streaks.map(([, s]) => `streak.${s}`), ...RULES.multis.map(([, m]) => `multi.${m}`), ...Object.keys(RULES.powerups.kinds).map((k) => `powerup.${k}`),
    ...TEAMS.flatMap((t) => [`team.${t}`, `flag.${t}`]), ...Object.keys(RULES.modes).map((m) => `mode.${m}`)]) {
    assert.ok(en.get(`${NS}.${key}`), `${NS}.${key}`);
  }
});

test('everything can be crafted', () => {
  for (const it of ITEMS) assert.ok(results.has(`${NS}:${it.id}`), it.id);
  for (const b of BLOCKS) assert.ok(results.has(`${NS}:${b.id}`), b.id);
});

test('recipes only use keys they define, and ingredients that exist', () => {
  const ours = new Set([...ITEMS.map((i) => `${NS}:${i.id}`), ...BLOCKS.map((b) => `${NS}:${b.id}`)]);
  for (const r of recipes) {
    const body = Object.values(r)[0];
    for (const row of body.pattern ?? []) for (const ch of row) if (ch !== ' ') assert.ok(body.key[ch], `${body.description.identifier}: ${ch}`);
    const used = body.key ? Object.values(body.key) : body.ingredients;
    for (const { item } of used) {
      assert.ok(item.startsWith('minecraft:') ? VANILLA.has(item) : ours.has(item), `${body.description.identifier}: ${item}`);
    }
  }
});

test('there is a gun item for every gun, a vest for every team, and every team has its game blocks', () => {
  for (const id of Object.keys(RULES.guns)) assert.ok(ITEMS.some((i) => i.id === id && i.kind === 'gun'), id);
  assert.ok(ITEMS.some((i) => i.id === RULES.grenade.id));
  for (const t of TEAMS) {
    assert.ok(ITEMS.some((i) => i.id === `vest_${t}` && i.team === t), `vest_${t}`);
    for (const kind of ['pad', 'flag']) assert.ok(BLOCKS.some((b) => b.kind === kind && b.team === t), `${kind} ${t}`);
    assert.ok(RULES.colours[t], t);
  }
  for (const kind of ['point', 'station']) assert.ok(BLOCKS.some((b) => b.kind === kind), kind);
});

test('block states fit Bedrock, and every look of a block has its pictures', () => {
  for (const b of BLOCKS) {
    if (b.state) assert.ok(b.state.values.length <= 16, b.id);
    const textures = blockTextures(b);
    assert.ok(Object.keys(textures).length >= (b.state ? b.state.values.length : 1), b.id);
    for (const png of Object.values(textures)) assert.ok(Buffer.isBuffer(png), b.id);
  }
});

test('the bot fits its hitbox, and has materials for every team', () => {
  for (const c of CREATURES) {
    const cubes = c.model.bones.flatMap((b) => b.cubes ?? []);
    for (const t of TEAMS) for (const cube of cubes) assert.ok(c.teams[t][cube.mat], `${c.id} ${t}: ${cube.mat}`);
    const top = Math.max(...cubes.map((q) => q.origin[1] + q.size[1]));
    assert.ok(Math.abs(top / 16 - c.size[1]) < 0.4, `${c.id}: model ${top / 16} blocks tall, hitbox ${c.size[1]}`);
  }
});
