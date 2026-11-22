// The laser guns: hitscan rays drawn as a line of glowing particles in the
// shooter's team colour. A ray stops at the first block that isn't see-through
// and tags the first vest (or bot) in its way. Guns heat up instead of using
// ammunition. The pulse grenade tags every enemy vest round where it lands.
import { system, world } from '@minecraft/server';
import { RULES } from './data.js';
import { shotHeat } from './logic.js';
import { cannotFire, flash, hasPowerup, heatOf, recordShot, setHeat, tag } from './game.js';
import { soundSiren } from './arena.js';
import { add, dist, heldItem, isBot, isPlayer, NS, scale, sound, spread, teamOf } from './util.js';

const GUNS = Object.fromEntries(Object.entries(RULES.guns).map(([id, g]) => [`${NS}:${id}`, { id, ...g }]));
const GRENADE = `${NS}:${RULES.grenade.id}`;

/** The first player or bot with a team along the ray, closer than `max`. */
function firstTarget(dimension, from, direction, max, shooter) {
  if (max <= 0.1) return undefined;
  let hits = [];
  try {
    hits = dimension.getEntitiesFromRay(from, direction, { maxDistance: max, ignoreBlockCollision: true, includeLiquidBlocks: false, includePassableBlocks: false });
  } catch {
    return undefined;
  }
  for (const h of hits) {
    if (h.entity.id === shooter?.id || !(isPlayer(h.entity) || isBot(h.entity)) || !teamOf(h.entity)) continue;
    if (h.distance <= max) return h;
  }
  return undefined;
}

/** How far a ray gets before it hits a block (`range` if it hits nothing), and the block. */
function blockHit(dimension, from, direction, range) {
  try {
    const hit = dimension.getBlockFromRay(from, direction, { maxDistance: range, includeLiquidBlocks: false, includePassableBlocks: false });
    if (hit) return { distance: dist(from, add(hit.block.location, hit.faceLocation)), block: hit.block };
  } catch {}
  return { distance: range };
}

/** A beam of particles from `from` along `direction` for `length` blocks. */
export function beam(dimension, from, direction, length, team) {
  const step = 0.4;
  const name = `${NS}:laser_${team ?? 'white'}`;
  for (let s = 0.6; s < length; s += step) {
    try {
      dimension.spawnParticle(name, add(from, scale(direction, s)));
    } catch {
      break;
    }
  }
}

/**
 * Fire one ray from `from` along `direction` for `shooter`: draw it, and tag what it
 * hits: a player or bot, or a siren (when a player fired). Returns 'tagged', 'shield',
 * 'blocked', 'siren' or false.
 */
export function fireRay(shooter, from, direction, range) {
  const dimension = shooter.dimension;
  const { distance: wall, block } = blockHit(dimension, from, direction, range);
  const hit = firstTarget(dimension, from, direction, wall, shooter);
  const length = hit ? hit.distance : wall;
  beam(dimension, from, direction, length, teamOf(shooter));
  if (!hit) return block && isPlayer(shooter) && soundSiren(block) ? 'siren' : false;
  return tag(shooter, hit.entity) || 'blocked';
}

/** Where a gun's shots start: from the eyes, a little forward. */
export const muzzle = (entity) => entity.getHeadLocation();

/** A player pulls the trigger of `gun` (`item`: the gun in their hand, for its cooldown). */
export function fire(player, gunId, item) {
  const g = RULES.guns[gunId];
  const cooldown = item?.getComponent('minecraft:cooldown');
  if (cooldown && cooldown.getCooldownTicksRemaining(player) > 0) return false;
  const why = cannotFire(player);
  if (why) {
    if (why !== 'down') {
      flash(player, why);
      player.playSound('random.click', { pitch: 0.6 });
    }
    return false;
  }
  const h = heatOf(player);
  if (h.overheated) {
    player.playSound('random.fizz', { pitch: 1.6, volume: 0.6 });
    return false;
  }
  cooldown?.startCooldown(player);
  const after = shotHeat(h, gunId, hasPowerup(player, 'rapid_fire'));
  setHeat(player, after);
  if (after.overheated) player.playSound('random.fizz', { pitch: 1.2 });
  const from = muzzle(player);
  const view = player.getViewDirection();
  let tagged = 0;
  for (let i = 0; i < g.rays; i++) {
    const result = fireRay(player, from, spread(view, g.spread), g.range);
    if (result === 'tagged' || result === 'shield') tagged++;
  }
  recordShot(player, tagged);
  sound(player, 'mob.shulker.shoot', { laser_pistol: 2, laser_blaster: 1.7, laser_rifle: 1.2, scatter_laser: 1.4 }[gunId] ?? 1.6, 0.7);
  return true;
}

/** The pulse grenade went off at `location`: every enemy vest within its radius is tagged. */
export function pulse(dimension, location, source) {
  const team = teamOf(source);
  try {
    dimension.spawnParticle(`${NS}:spark_${team ?? 'white'}`, location);
    dimension.playSound('firework.blast', location, { pitch: 1.4 });
  } catch {}
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    try {
      dimension.spawnParticle(`${NS}:laser_${team ?? 'white'}`, { x: location.x + Math.cos(a) * RULES.grenade.radius, y: location.y + 0.3, z: location.z + Math.sin(a) * RULES.grenade.radius });
    } catch {}
  }
  if (!source?.isValid) return 0;
  let n = 0;
  for (const e of dimension.getEntities({ location, maxDistance: RULES.grenade.radius })) {
    if (e.id === source.id || !(isPlayer(e) || isBot(e))) continue;
    if (tag(source, e) === 'tagged') n++;
  }
  return n;
}

export function setupGuns() {
  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    const g = GUNS[itemStack?.typeId];
    if (!g || !isPlayer(source)) return;
    system.run(() => fire(source, g.id, itemStack));
  });
  world.afterEvents.projectileHitBlock.subscribe((e) => {
    if (e.projectile?.typeId === GRENADE) pulse(e.dimension, e.location, e.source);
  });
  world.afterEvents.projectileHitEntity.subscribe((e) => {
    if (e.projectile?.typeId === GRENADE) pulse(e.dimension, e.location, e.source);
  });
  // The rifle zooms in while you sneak.
  system.runInterval(() => {
    for (const p of world.getAllPlayers()) {
      if (!p.isSneaking || heldItem(p)?.typeId !== `${NS}:laser_rifle`) continue;
      try {
        p.addEffect('slowness', 8, { amplifier: 4, showParticles: false });
      } catch {}
    }
  }, 5);
}
