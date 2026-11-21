// The arena's game blocks. Each one ticks (minecraft:tick) and so tells the game
// where it is: spawn pads (where teams start and come back), flag stands (take the
// flag, bring it home), control points (who stands next to them) and power-up
// stations (walk on when it glows). The Java twins are in dk.ulfen.lasertag.block.
import { world } from '@minecraft/server';
import { BLOCKS, RULES } from './data.js';
import { pickPowerup, touchStand } from './logic.js';
import { current, givePowerup, handle, isActive, running } from './game.js';
import { centre, dist, isPlayer, nameOf, NS, now, teamOf, TEAMS } from './util.js';

const KINDS = Object.fromEntries(BLOCKS.filter((b) => b.kind).map((b) => [b.id, b]));
const STATE = { flag: `${NS}:flag`, owner: `${NS}:owner`, charged: `${NS}:charged` };

/** Every game block seen ticking: "dim x y z" -> { kind, team, dim, pos, seen }. */
const blocks = new Map();
const rechargeAt = new Map(); // station key -> tick
const keyOf = (dimension, p) => `${dimension.id} ${p.x} ${p.y} ${p.z}`;

/** Entries of one kind, in one dimension, whose block is still there. */
function entries(kind, dimension, team) {
  const out = [];
  for (const [key, e] of blocks) {
    if (e.kind !== kind || e.dim !== dimension.id || (team && e.team !== team)) continue;
    let block;
    try {
      block = dimension.getBlock(e.pos);
    } catch {
      block = undefined;
    }
    // Not loaded: trust it. Loaded and something else now: forget it.
    if (block && !KINDS[block.typeId]) {
      blocks.delete(key);
      continue;
    }
    out.push({ key, ...e });
  }
  return out;
}

export const padsOf = (team, dimension) => entries('pad', dimension, team).map((e) => e.pos);

/** For each control point: how many active players and bots of each team are next to it. */
export function pointCounts(dimension) {
  const out = {};
  for (const e of entries('point', dimension)) {
    if (now() - e.seen > 60) continue;
    const counts = {};
    const at = { x: e.pos.x + 0.5, y: e.pos.y + 1, z: e.pos.z + 0.5 };
    for (const ent of dimension.getEntities({ location: at, maxDistance: RULES.point.radius })) {
      if (!isActive(ent)) continue;
      const t = teamOf(ent);
      counts[t] = (counts[t] ?? 0) + 1;
    }
    out[e.key] = counts;
  }
  return out;
}

function setState(block, name, value) {
  try {
    if (block.permutation.getState(name) !== value) block.setPermutation(block.permutation.withState(name, value));
  } catch {}
}

/** Show or hide a team's flag on its stands. */
export function showFlag(team, shown) {
  for (const [, e] of blocks) {
    if (e.kind !== 'flag' || e.team !== team) continue;
    try {
      const block = world.getDimension(e.dim).getBlock(e.pos);
      if (block && KINDS[block.typeId]) setState(block, STATE.flag, shown);
    } catch {}
  }
}

/** A new game: every flag on its stand, every point free, every station charged. */
export function resetArena() {
  rechargeAt.clear();
  for (const [, e] of blocks) {
    try {
      const block = world.getDimension(e.dim).getBlock(e.pos);
      if (!block || !KINDS[block.typeId]) continue;
      if (e.kind === 'flag') setState(block, STATE.flag, true);
      if (e.kind === 'point') setState(block, STATE.owner, 0);
      if (e.kind === 'station') setState(block, STATE.charged, true);
    } catch {}
  }
}

/** Active players and bots standing on top of `block`. */
function onTop(block, reach) {
  const at = { x: block.location.x + 0.5, y: block.location.y + 1, z: block.location.z + 0.5 };
  return block.dimension.getEntities({ location: at, maxDistance: reach }).filter((e) => isActive(e) && dist(e.location, at) <= reach);
}

function particle(dimension, name, at) {
  try {
    dimension.spawnParticle(`${NS}:${name}`, at);
  } catch {}
}

/** A glowing ring round the top of a block. */
function ring(block, colour, radius, n = 8) {
  const c = centre(block.location);
  const phase = (now() / 20) % (Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    particle(block.dimension, `laser_${colour}`, { x: c.x + Math.cos(a) * radius, y: block.location.y + 1.05, z: c.z + Math.sin(a) * radius });
  }
}

function tickPad(block, info) {
  ring(block, info.team, 0.45, 4);
}

function tickFlag(block, info) {
  const game = current();
  const ctf = game && game.mode === 'capture_the_flag' && game.phase !== 'over' && game.flags[info.team];
  const shown = !ctf || game.flags[info.team].state === 'home';
  setState(block, STATE.flag, shown);
  if (!ctf || !running()) return;
  for (const e of onTop(block, RULES.flag.touch)) {
    const events = touchStand(game, { who: nameOf(e), team: teamOf(e), standTeam: info.team });
    if (events.length) handle(events);
  }
}

function tickPoint(block, key) {
  const game = current();
  const point = game?.mode === 'king_of_the_hill' ? game.points[key] : undefined;
  const owner = point?.owner ? TEAMS.indexOf(point.owner) + 1 : 0;
  setState(block, STATE.owner, owner);
  ring(block, point?.owner ?? point?.team ?? 'white', RULES.point.radius, 16);
  // Tell the players next to it how far along they are.
  if (point && point.team && !point.owner && point.progress > 0) {
    for (const e of onTop(block, RULES.point.radius)) {
      if (isPlayer(e) && teamOf(e) === point.team) {
        try {
          e.onScreenDisplay.setActionBar({ translate: `${NS}.hud.capturing`, with: [String(point.progress), String(RULES.point.capture)] });
        } catch {}
      }
    }
  }
}

function tickStation(block, key) {
  const charged = block.permutation.getState(STATE.charged);
  if (!charged) {
    if ((rechargeAt.get(key) ?? 0) <= now()) setState(block, STATE.charged, true);
    return;
  }
  ring(block, 'white', 0.4, 3);
  for (const e of onTop(block, RULES.powerups.touch)) {
    if (!isPlayer(e)) continue;
    givePowerup(e, pickPowerup(Math.random()));
    setState(block, STATE.charged, false);
    rechargeAt.set(key, now() + RULES.powerups.recharge * 20);
    break;
  }
}

function tick(block) {
  const info = KINDS[block.typeId];
  if (!info) return;
  const key = keyOf(block.dimension, block.location);
  blocks.set(key, { kind: info.kind, team: info.team, dim: block.dimension.id, pos: { ...block.location }, seen: now() });
  if (info.kind === 'pad') tickPad(block, info);
  else if (info.kind === 'flag') tickFlag(block, info);
  else if (info.kind === 'point') tickPoint(block, key);
  else if (info.kind === 'station') tickStation(block, key);
}

export function registerArena(registry) {
  registry.registerCustomComponent(`${NS}:arena`, {
    onTick: ({ block }) => tick(block),
    onPlace: ({ block }) => tick(block),
  });
}

/** For the selftest: a station that is empty now recharges at once. */
export function rechargeNow(block) {
  rechargeAt.set(keyOf(block.dimension, block.location), 0);
}
