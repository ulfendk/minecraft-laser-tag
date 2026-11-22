// Laser bots. The game's AI picks a target and walks after it (entities/laser_bot.json);
// when it "shoots" a bot_shot, the shot is taken away at once and the bot fires a
// laser instead, aimed at its target – and now and then a little off. The console
// brings bots into a game, as many as it was told for each team, at the team's spawn
// pads; how often they shoot and hit is the game's bot skill.
import { world } from '@minecraft/server';
import { RULES } from './data.js';
import { botSkill, botTeams } from './logic.js';
import { current, isActive, isDown, isProtected, recordShot, teamLabel } from './game.js';
import { padsOf } from './arena.js';
import { fireRay, muzzle } from './guns.js';
import { BOT, dist, GAME_BOT_TAG, isBot, isPlayer, norm, NS, sound, sub, teamOf } from './util.js';

const SHOT = `${NS}:bot_shot`;
/** How many shots the game's AI has had the bots fire (for the selftest). */
export const counts = { shots: 0, fired: 0 };

/** Put `bot` on `team`: its colour, its targets and its name. */
export function joinTeam(bot, team, name) {
  bot.setDynamicProperty(`${NS}:team`, team);
  bot.triggerEvent(`${NS}:join_${team}`);
  if (name) bot.nameTag = name;
}

/** The nearest enemy `bot` can see, within its range. */
function target(bot) {
  const team = teamOf(bot);
  const eye = muzzle(bot);
  let best;
  let bestD = RULES.bot.range;
  for (const e of bot.dimension.getEntities({ location: bot.location, maxDistance: RULES.bot.range })) {
    if (e.id === bot.id || !(isPlayer(e) || isBot(e)) || !isActive(e) || isProtected(e)) continue;
    const t = teamOf(e);
    if (!t || t === team) continue;
    const d = dist(e.location, bot.location);
    if (d >= bestD) continue;
    const aim = { x: e.location.x, y: e.location.y + 1, z: e.location.z };
    try {
      const wall = bot.dimension.getBlockFromRay(eye, norm(sub(aim, eye)), { maxDistance: dist(aim, eye), includePassableBlocks: false });
      if (wall) continue;
    } catch {}
    best = e;
    bestD = d;
  }
  return best;
}

/** `bot` fires at its target (if it still has one and its skill takes the shot): usually on target, sometimes just off. */
export function botFire(bot) {
  if (!bot?.isValid || isDown(bot) || !teamOf(bot)) return false;
  const skill = RULES.bot.skills[botSkill(current()?.skill)];
  if (Math.random() > skill.fire) return false;
  const t = target(bot);
  if (!t) return false;
  const eye = muzzle(bot);
  const aim = { x: t.location.x, y: t.location.y + 1, z: t.location.z };
  if (Math.random() > skill.accuracy) {
    // A miss: off to one side by a block or so.
    const a = Math.random() * Math.PI * 2;
    aim.x += Math.cos(a) * 1.2;
    aim.z += Math.sin(a) * 1.2;
    aim.y += (Math.random() - 0.5);
  }
  const result = fireRay(bot, eye, norm(sub(aim, eye)), RULES.bot.range + 4);
  recordShot(bot, result === 'tagged' || result === 'shield' ? 1 : 0);
  sound(bot, 'mob.shulker.shoot', 1.8, 0.6);
  try {
    bot.playAnimation(`animation.${NS}.laser_bot.attack`);
  } catch {}
  return true;
}

/** Bots for a new game: `bots` per team (see botCounts), at the team's pads (or round the console). */
export function spawnGameBots(game, at, bots) {
  const n = {};
  const all = botTeams(game, bots);
  for (const [i, team] of all.entries()) {
    const pads = padsOf(team, at.dimension);
    const pad = pads[i % Math.max(1, pads.length)];
    const a = (i / Math.max(1, all.length)) * Math.PI * 2;
    const where = pad ? { x: pad.x + 0.5, y: pad.y + 1, z: pad.z + 0.5 } : { x: at.location.x + 0.5 + Math.cos(a) * 4, y: at.location.y + 1, z: at.location.z + 0.5 + Math.sin(a) * 4 };
    try {
      const bot = at.dimension.spawnEntity(BOT, where);
      n[team] = (n[team] ?? 0) + 1;
      bot.addTag(GAME_BOT_TAG);
      joinTeam(bot, team, `${teamLabel(team)} Bot ${n[team]}§r`);
      // Without a pad, where it started is its base.
      if (!pad && game.bases) game.bases[`${teamLabel(team)} Bot ${n[team]}§r`] = { ...where, dim: at.dimension.id };
    } catch {}
  }
}

export function removeGameBots(dimension) {
  for (const bot of dimension.getEntities({ type: BOT, tags: [GAME_BOT_TAG] })) {
    try {
      bot.remove();
    } catch {}
  }
}

export function setupBots() {
  world.afterEvents.entitySpawn.subscribe(({ entity }) => {
    if (entity?.typeId !== SHOT) return;
    let owner;
    try {
      owner = entity.getComponent('minecraft:projectile')?.owner;
      if (!owner) owner = entity.dimension.getEntities({ type: BOT, location: entity.location, maxDistance: 2.5, closest: 1 })[0];
    } catch {}
    try {
      entity.remove();
    } catch {}
    counts.shots++;
    if (isBot(owner) && botFire(owner)) counts.fired++;
  });
}
