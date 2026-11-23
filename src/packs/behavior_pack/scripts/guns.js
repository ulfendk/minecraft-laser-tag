// The laser guns: hitscan rays drawn as a line of glowing particles in the
// shooter's team colour. A ray stops at the first block that isn't see-through
// and tags the first vest (or bot) in its way. Guns heat up instead of using
// ammunition. The pulse grenade tags every enemy vest round where it lands.
//
// The laser sniper fires only through its scope, like Realistic Hunting's rifles: use it to
// raise the scope, use it again to fire. Tap sneak for the next zoom level, hold sneak to
// hold your breath and steady the sway (not for too long). Jump or switch items to lower
// it. The spread cannon fires one big blast, then kicks you back and has to reload.
import { system, world } from '@minecraft/server';
import { RULES, SCOPE_CODE } from './data.js';
import { shotHeat } from './logic.js';
import { cannotFire, flash, hasPowerup, heatOf, isDown, recordShot, setHeat, tag } from './game.js';
import { soundSiren } from './arena.js';
import { add, dist, heldItem, isBot, isPlayer, now, NS, scale, keepOverlay, setOverlay, sound, spread, teamOf, tr } from './util.js';

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

/** Player id -> the tick each gun of theirs can fire again. */
const nextShot = new Map();

// ---------------------------------------------------------------- the sniper's scope

const SNIPER = 'laser_sniper';
const CANNON = 'spread_cannon';
/** Player id -> { zoom, breath, holding, shaky, sneakAt, sway: {x, y}, t, range }. */
const scoped = new Map();

export const isScoped = (player) => scoped.has(player.id);

function setZoom(player, s) {
  try {
    player.runCommand(`camera @s fov_set ${RULES.guns[SNIPER].scope[s.zoom]} 0.15`);
  } catch {}
}

export function raiseScope(player) {
  if (scoped.has(player.id)) return;
  const s = { zoom: 0, breath: 100, holding: false, shaky: 0, sneakAt: -1, sway: { x: 0, y: 0 }, t: Math.random() * 1000, range: '—' };
  scoped.set(player.id, s);
  setZoom(player, s);
  setOverlay(player, SCOPE_CODE);
  try { player.playSound('item.spyglass.use'); } catch {}
}

export function lowerScope(player) {
  if (!scoped.delete(player.id)) return;
  try {
    player.runCommand('camera @s fov_clear 0.15');
  } catch {}
  setOverlay(player, undefined);
  try { player.playSound('item.spyglass.stop_using'); } catch {}
}

/** Magnification at each zoom level (against Minecraft's normal 70° field of view). */
const magnification = (zoom) => Math.round(70 / RULES.guns[SNIPER].scope[zoom]);

/** Zoom, range and breath, for above the hotbar while looking through the scope. */
export function scopeText(player) {
  const s = scoped.get(player.id);
  if (!s) return undefined;
  const parts = [tr('hud.scope', magnification(s.zoom), s.range)];
  if (s.holding) parts.push({ text: '  §a' }, tr('hud.steady'));
  else if (s.shaky > 0) parts.push({ text: '  §c' }, tr('hud.shaky'));
  return { rawtext: parts };
}

/** Smooth 1-D noise for the sway. */
const wobble = (t, seed) => Math.sin(t * 0.9 + seed) * 0.6 + Math.sin(t * 2.3 + seed * 1.7) * 0.3 + Math.sin(t * 5.1 + seed * 0.3) * 0.1;

function tickScope(player, tick) {
  const s = scoped.get(player.id);
  if (!s) return;
  if (heldItem(player)?.typeId !== `${NS}:${SNIPER}` || isDown(player)) {
    lowerScope(player);
    return;
  }
  keepOverlay(player);
  // Sneak: tap = next zoom level, hold = hold your breath.
  if (player.isSneaking) {
    if (s.sneakAt < 0) s.sneakAt = tick;
    if (tick - s.sneakAt > 6 && s.shaky <= 0) {
      s.holding = true;
      s.breath -= 1;
      if (s.breath <= 0) {
        s.holding = false;
        s.shaky = 60;
      }
    }
  } else {
    if (s.sneakAt >= 0 && tick - s.sneakAt <= 6) {
      s.zoom = (s.zoom + 1) % RULES.guns[SNIPER].scope.length;
      setZoom(player, s);
      try { player.playSound('random.click', { pitch: 1.8, volume: 0.4 }); } catch {}
    }
    s.sneakAt = -1;
    s.holding = false;
    s.breath = Math.min(100, s.breath + 0.8);
  }
  if (s.shaky > 0) s.shaky--;

  // Sway in degrees: less when crouched, almost none holding your breath, a lot out of breath or on the move.
  let amp = 0.15 * RULES.guns[SNIPER].sway;
  if (player.isSneaking) amp *= 0.45;
  if (s.holding) amp *= 0.12;
  if (s.shaky > 0) amp *= 2.5;
  const v = player.getVelocity();
  if (Math.hypot(v.x, v.z) > 0.05) amp *= 3;
  s.t += 0.05;
  const target = { x: wobble(s.t, 1.3) * amp, y: wobble(s.t, 7.9) * amp };
  try {
    const r = player.getRotation();
    player.setRotation({ x: r.x + (target.x - s.sway.x), y: r.y + (target.y - s.sway.y) });
  } catch {}
  s.sway = target;

  if (tick % 4 === 0) {
    s.range = rangeTo(player);
    // Players in a game see this in their HUD (game.js); the others get it here.
    if (!teamOf(player)) {
      try { player.onScreenDisplay.setActionBar(scopeText(player)); } catch {}
    }
  }
}

/** Range finder: blocks to whatever is under the crosshair. */
function rangeTo(player) {
  const max = RULES.guns[SNIPER].range * 2;
  const eye = player.getHeadLocation();
  let best = Infinity;
  try {
    const e = player.getEntitiesFromViewDirection({ maxDistance: max })[0];
    if (e) best = e.distance;
    const b = player.dimension.getBlockFromRay(eye, player.getViewDirection(), { maxDistance: max, includeLiquidBlocks: true, includePassableBlocks: false });
    if (b) best = Math.min(best, dist(eye, add(b.block.location, b.faceLocation)));
  } catch {}
  return best === Infinity ? '—' : String(Math.round(best));
}

/** A player uses a gun: the sniper's first use raises the scope, every other use fires. */
export function use(player, gunId, item) {
  if (gunId === SNIPER && !scoped.has(player.id)) {
    raiseScope(player);
    return false;
  }
  return fire(player, gunId, item);
}

/**
 * A player pulls the trigger of `gun` (`item`: the gun in their hand, for its cooldown bar).
 * The time between shots is kept here, not read from the item: once anything has looked
 * at the use first (the frozen check in game.js), Bedrock has already started the item's
 * own cooldown by the time this runs, and every shot would look too soon.
 */
export function fire(player, gunId, item) {
  const g = RULES.guns[gunId];
  const key = `${player.id} ${gunId}`;
  if ((nextShot.get(key) ?? 0) > now()) return false;
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
  nextShot.set(key, now() + Math.round(g.cooldown * 20) - 1);
  try {
    item?.getComponent('minecraft:cooldown')?.startCooldown(player);
  } catch {}
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
  sound(player, 'mob.shulker.shoot', { laser_pistol: 2, laser_blaster: 1.7, laser_rifle: 1.2, scatter_laser: 1.4, laser_sniper: 0.9, spread_cannon: 0.6 }[gunId] ?? 1.6, gunId === CANNON ? 1 : 0.7);
  afterShot(player, gunId, view);
  return true;
}

/** The sniper's bolt, and the spread cannon's kick and reload. */
function afterShot(player, gunId, view) {
  const g = RULES.guns[gunId];
  if (gunId === SNIPER) {
    system.runTimeout(() => {
      if (player.isValid) try { player.playSound('random.click', { pitch: 0.8, volume: 0.6 }); } catch {}
    }, Math.round(g.cooldown * 12));
  }
  if (gunId === CANNON) {
    sound(player, 'random.explode', 1.8, 0.35);
    try {
      const h = Math.hypot(view.x, view.z) || 1;
      player.applyKnockback({ x: (-view.x / h) * g.recoil, z: (-view.z / h) * g.recoil }, 0.15);
    } catch {}
    flash(player, 'hud.reloading');
    system.runTimeout(() => {
      if (!player.isValid) return;
      try {
        player.playSound('random.click', { pitch: 1.1 });
        player.playSound('beacon.activate', { pitch: 2, volume: 0.4 });
      } catch {}
    }, Math.round(g.cooldown * 20));
  }
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
    system.run(() => use(source, g.id, itemStack));
  });
  world.afterEvents.playerButtonInput.subscribe(({ player, button, newButtonState }) => {
    if (button === 'Jump' && newButtonState === 'Pressed') lowerScope(player);
  });
  world.afterEvents.playerLeave.subscribe(({ playerId }) => scoped.delete(playerId));
  system.runInterval(() => {
    if (!scoped.size) return;
    const tick = now();
    for (const p of world.getAllPlayers()) tickScope(p, tick);
  }, 1);
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
