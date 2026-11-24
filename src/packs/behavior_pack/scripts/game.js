// The game itself: who is tagged and when they are back, heat and power-ups, the
// round (src/lib/game.mjs, copied here as logic.js) with its countdown, scores on
// the sidebar, the HUD above the hotbar, and the end with fireworks and stats.
// The same as dk.ulfen.lasertag.game.Game on Java.
import { DisplaySlotId, InputPermissionCategory, system, world } from '@minecraft/server';
import { RULES } from './data.js';
import {
  accuracy, botSkill, carrying, clockText, cool, enemies, heatBar, mvp, newGame, onShot, onTag, second, standings, stop, teamMode, touchDropped,
} from './logic.js';
import { padsOf, pointCounts, resetArena, showFlag } from './arena.js';
import { spawnGameBots, removeGameBots } from './bots.js';
import { scopeText } from './guns.js';
import {
  announce, BOT, colour, coloured, DOWN_TAG, isBot, botName, isPlayer, LOG, nameOf, NS, now, plainName, SIGN, sound, teamOf, TEAMS, title, tr,
} from './util.js';

const SAVE = `${NS}:game`;
const OBJECTIVE = NS;
const TEAM_LABEL = { red: 'Red', blue: 'Blue', green: 'Green', yellow: 'Yellow' };
export const teamLabel = (t) => `${colour(t)}${TEAM_LABEL[t]}`;
const teamText = (t) => ({ rawtext: [{ text: colour(t) }, { translate: `${NS}.team.${t}` }, { text: '§r' }] });
const flagText = (t) => ({ rawtext: [{ text: colour(t) }, { translate: `${NS}.flag.${t}` }, { text: '§r' }] });

/** The game being played, or null (free play: lasers still tag, but nothing is counted). */
let game = null;
export const current = () => game;
export const running = () => game?.phase === 'running';

const downUntil = new Map(); // entity id -> tick it is back in
const protectUntil = new Map(); // entity id -> tick it can be tagged again
const powerups = new Map(); // entity id -> { kind: tick it runs out }
const heat = new Map(); // entity id -> { heat, overheated }
const message = new Map(); // player id -> { text, until }: shown instead of the HUD for a moment
let clearAt = 0;

export const isDown = (e) => (downUntil.get(e.id) ?? 0) > now();
export const isProtected = (e) => (protectUntil.get(e.id) ?? 0) > now();
export const isActive = (e) => e?.isValid && !!teamOf(e) && !isDown(e);
export const heatOf = (e) => heat.get(e.id) ?? { heat: 0, overheated: false };
export const setHeat = (e, h) => heat.set(e.id, h);
export const hasPowerup = (e, kind) => (powerups.get(e.id)?.[kind] ?? 0) > now();

function save() {
  try {
    world.setDynamicProperty(SAVE, game ? JSON.stringify(game) : undefined);
  } catch (e) {
    console.warn(`${LOG} could not save the game: ${e}`);
  }
}

/** Something to show above a player's hotbar for a moment, instead of the HUD. */
export function flash(player, key, ...args) {
  if (!isPlayer(player)) return;
  const text = tr(key, ...args);
  message.set(player.id, { text, until: now() + 30 });
  try {
    player.onScreenDisplay.setActionBar(text);
  } catch {}
}

/** Why `entity` can't fire now, or null if it can. */
export function cannotFire(entity) {
  if (!teamOf(entity)) return 'hud.no_vest';
  if (isDown(entity)) return 'down';
  if (game?.phase === 'countdown') return 'hud.not_yet';
  return null;
}

export function recordShot(shooter, hits) {
  onShot(game, nameOf(shooter), hits);
}

// ---------------------------------------------------------------- tags

/**
 * `shooter` tags `target`. Only vests (and bots) of another team, that are in and not
 * just back. A shield takes the hit instead. Returns 'tagged', 'shield' or false.
 */
export function tag(shooter, target) {
  const ts = teamOf(shooter);
  const tt = teamOf(target);
  if (!ts || !tt || !target.isValid || isDown(target) || isProtected(target)) return false;
  if (game && game.phase !== 'running') return false;
  if (!enemies(game, nameOf(shooter), ts, nameOf(target), tt)) return false;
  sparks(target, tt);
  if (hasPowerup(target, 'shield')) {
    delete powerups.get(target.id).shield;
    sound(target, 'break.amethyst_cluster', 1.2);
    flash(target, 'hud.shield_hit');
    return 'shield';
  }
  const pos = [target.location.x, target.location.y, target.location.z];
  goDown(target, shooter);
  flash(shooter, 'hud.you_tagged', coloured(target, tt));
  if (isPlayer(shooter)) shooter.playSound('random.orb', { pitch: 1.6 });
  if (game) {
    announce('feed', coloured(shooter, ts), coloured(target, tt));
    handle(onTag(game, { who: nameOf(shooter), team: ts, target: nameOf(target), targetTeam: tt, pos, double: hasPowerup(shooter, 'double_points') }));
    save();
  }
  return 'tagged';
}

function sparks(entity, team) {
  try {
    entity.dimension.spawnParticle(`${NS}:spark_${team}`, { x: entity.location.x, y: entity.location.y + 1.1, z: entity.location.z });
  } catch {}
}

/** Stunned for a while: can't move or fire, with a sign above the head; then back at a spawn pad. */
function goDown(entity, by) {
  downUntil.set(entity.id, now() + RULES.tag.down * 20);
  try {
    entity.addTag(DOWN_TAG);
  } catch {}
  sound(entity, 'beacon.deactivate', 1.4);
  showSign(entity, RULES.tag.down);
  if (isBot(entity)) {
    entity.triggerEvent(`${NS}:down`);
    return;
  }
  stun(entity, true);
  title(entity, { rawtext: [{ text: '§c' }, { translate: `${NS}.title.tagged` }] }, tr('title.by', by ? coloured(by, teamOf(by)) : '?'), RULES.tag.down * 20 - 10);
}

/** Back in: at one of the team's spawn pads, if it has any, and safe for a moment. */
function comeBack(entity) {
  downUntil.delete(entity.id);
  if (!entity.isValid) return;
  wakeUp(entity);
  // Bots held still (the selftest's targets) stay held.
  if (isBot(entity)) entity.triggerEvent(entity.hasTag(`${NS}_hold`) ? `${NS}:hold` : `${NS}:up`);
  // Back to base, unless the game says to carry on from where you were tagged. Bots always go
  // home to their spawn pad.
  if (isBot(entity) || game?.afterTag !== 'stay') respawn(entity);
  protectUntil.set(entity.id, now() + RULES.tag.protect * 20);
  sound(entity, 'beacon.activate', 1.6);
}

/** No longer tagged: no sign, free to move. */
function wakeUp(entity) {
  try {
    entity.removeTag(DOWN_TAG);
  } catch {}
  hideSign(entity);
  if (isPlayer(entity)) stun(entity, false);
}

/** A player that can't walk, jump or sneak (the slowness is for clients that ignore it). */
function stun(player, on) {
  try {
    player.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, !on);
  } catch {}
  try {
    if (on) player.addEffect('slowness', RULES.tag.down * 20, { amplifier: 255, showParticles: false });
    else player.removeEffect('slowness');
  } catch {}
}

/** The sign above a tagged head: a first line on its name tag, counting down. */
function showSign(entity, seconds) {
  try {
    const rest = restName(entity);
    const text = `${SIGN}>> TAGGED ${seconds} <<§r${rest ? `\n${rest}` : ''}`;
    if (entity.nameTag !== text) entity.nameTag = text;
  } catch {}
}

function hideSign(entity) {
  try {
    const name = restName(entity);
    if (entity.nameTag !== name) entity.nameTag = name;
  } catch {}
}

// ---------------------------------------------------------------- hidden names

/** Players and bots whose names are hidden: a name above your head gives away where you are. */
const hidden = new Set();
const hiding = () => !!game && game.phase !== 'over';
/** What is on a name tag without a sign: a player's or bot's name, but nothing while a game is on. */
const restName = (entity) => (hiding() ? '' : isPlayer(entity) ? entity.name : botName(entity));

/** Every laser bot in the world. */
function allBots() {
  const out = [];
  for (const dim of ['overworld', 'nether', 'the_end']) {
    try {
      out.push(...world.getDimension(dim).getEntities({ type: BOT }));
    } catch {}
  }
  return out;
}

/** Hide every player's and bot's name while a game is on, and give them back after. */
function hideNames() {
  for (const p of [...world.getAllPlayers(), ...allBots()]) {
    if (hiding()) hidden.add(p.id);
    else if (!hidden.delete(p.id)) continue;
    if (!isDown(p)) hideSign(p);
  }
}

/**
 * Send `entity` to its base: one of its team's spawn pads (in its dimension), or else, in
 * a game, where it stood when the game started.
 */
export function respawn(entity) {
  const team = teamOf(entity);
  const pads = team ? padsOf(team, entity.dimension) : [];
  const pad = pads[Math.floor(Math.random() * pads.length)];
  const base = game?.bases?.[nameOf(entity)];
  const to = pad ? { x: pad.x + 0.5, y: pad.y + 1, z: pad.z + 0.5, dim: entity.dimension.id } : base;
  if (!to) return false;
  try {
    entity.teleport({ x: to.x, y: to.y, z: to.z }, { dimension: world.getDimension(to.dim) });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- power-ups

export function givePowerup(entity, kind) {
  const k = RULES.powerups.kinds[kind];
  if (!k) return;
  const p = powerups.get(entity.id) ?? {};
  p[kind] = now() + k.seconds * 20;
  powerups.set(entity.id, p);
  if (kind === 'speed') {
    try {
      entity.addEffect('speed', k.seconds * 20, { amplifier: 1, showParticles: false });
    } catch {}
  }
  if (kind === 'rapid_fire') heat.set(entity.id, { heat: 0, overheated: false });
  sound(entity, 'beacon.power', 1.5);
  flash(entity, `powerup.${kind}`);
}

// ---------------------------------------------------------------- the round

/** Everyone in the game: players in a vest, and the bots, in the game's dimension. */
function participants() {
  const dimension = world.getDimension(game?.origin?.dim ?? 'overworld');
  return [...world.getAllPlayers().filter((p) => teamOf(p)), ...dimension.getEntities({ type: BOT })];
}

const findByName = (who) => {
  const p = world.getAllPlayers().find((x) => x.name === who);
  if (p) return p;
  const dimension = world.getDimension(game?.origin?.dim ?? 'overworld');
  return dimension.getEntities({ type: BOT, name: who })[0];
};

/**
 * Start a game. `settings`: mode, minutes, scoreLimit, teams, bots (one number for every
 * team, or { red: 2, blue: 1 }), skill (the bots': easy, normal or hard) and afterTag
 * (base: back to base once the stun is over; stay: carry on from where you were tagged).
 * `at`: { dimension, location } of the console. False if one is on already.
 */
export function startGame(settings, at, starter) {
  if (game && game.phase !== 'over') return false;
  game = newGame(settings);
  game.skill = botSkill(settings.skill);
  game.afterTag = settings.afterTag === 'stay' ? 'stay' : 'base';
  game.bases = {};
  game.origin = { dim: at.dimension.id, x: at.location.x, y: at.location.y, z: at.location.z };
  clearAt = 0;
  for (const id of downUntil.keys()) {
    const entity = world.getEntity(id);
    if (entity?.isValid) wakeUp(entity);
  }
  for (const map of [downUntil, protectUntil, powerups, heat]) map.clear();
  for (const p of world.getAllPlayers()) wakeUp(p);
  hideNames();
  setupScoreboard();
  resetArena();
  removeGameBots(at.dimension);
  spawnGameBots(game, at, settings.bots ?? 0);
  hideNames();
  // Everyone nearby in a vest goes to their team's pad; without one, where they stand is their base.
  for (const p of world.getAllPlayers()) {
    if (!teamOf(p) || p.dimension.id !== at.dimension.id || Math.hypot(p.location.x - at.location.x, p.location.z - at.location.z) > RULES.console.reach) continue;
    if (!respawn(p)) game.bases[p.name] = { x: p.location.x, y: p.location.y, z: p.location.z, dim: p.dimension.id };
  }
  announce('started', starter ? { text: nameOf(starter) } : { text: '§7Laser Tag§r' }, { translate: `${NS}.mode.${game.mode}` }, Math.round(game.left / 60), game.scoreLimit);
  showCountdown(game.countdown);
  save();
  return true;
}

/** Stop the game now (from the console or a command). */
export function stopGame() {
  if (!game || game.phase === 'over') return false;
  announce('stopped');
  handle(stop(game));
  save();
  return true;
}

function showCountdown(n) {
  for (const p of participants()) {
    if (!isPlayer(p)) continue;
    title(p, `§e${n}`, tr('title.ready'), 20);
    p.playSound('note.pling', { pitch: 1 + (RULES.console.countdown - n) * 0.1 });
  }
}

/** Act on what the rules say happened. */
export function handle(events) {
  for (const e of events) {
    switch (e.type) {
      case 'countdown':
        showCountdown(e.n);
        break;
      case 'go':
        for (const p of participants()) {
          if (!isPlayer(p)) continue;
          title(p, { rawtext: [{ text: '§a' }, { translate: `${NS}.title.go` }] }, '', 20);
          p.playSound('random.levelup', { pitch: 1.4 });
        }
        break;
      case 'minute':
        announce('minute');
        break;
      case 'streak': {
        const who = findByName(e.who);
        announce(`streak.${e.name}`, who ? coloured(who, teamOf(who)) : e.who);
        break;
      }
      case 'multi': {
        const who = findByName(e.who);
        if (isPlayer(who)) title(who, ' ', { rawtext: [{ text: '§6' }, tr(`multi.${e.name}`)] }, 20);
        break;
      }
      case 'flag_taken': {
        const who = findByName(e.who);
        announce('flag_taken', who ? coloured(who, teamOf(who)) : e.who, flagText(e.flag));
        showFlag(e.flag, false);
        world.getAllPlayers().forEach((p) => p.playSound('note.bell', { pitch: 1.2 }));
        break;
      }
      case 'flag_dropped': {
        const who = findByName(e.who);
        announce('flag_dropped', who ? coloured(who, teamOf(who)) : e.who, flagText(e.flag));
        break;
      }
      case 'flag_returned':
        announce('flag_returned', flagText(e.flag));
        showFlag(e.flag, true);
        break;
      case 'captured': {
        const who = findByName(e.who);
        announce('captured', who ? coloured(who, teamOf(who)) : e.who, flagText(e.flag));
        showFlag(e.flag, true);
        world.getAllPlayers().forEach((p) => p.playSound('random.totem', { volume: 0.5 }));
        break;
      }
      case 'point_taken':
        announce('point_taken', teamText(e.team));
        break;
      case 'point_lost':
        announce('point_lost', teamText(e.team));
        break;
      case 'over':
        finish(e.winner);
        break;
      default:
        break;
    }
  }
}

function finish(winner) {
  const winnerText = !winner ? tr('draw')
    : teamMode(game) ? tr('winner', teamText(winner))
      : tr('winner', { text: winner });
  for (const p of world.getAllPlayers()) {
    title(p, { rawtext: [{ text: '§6' }, { translate: `${NS}.over` }] }, winnerText, 80);
    p.playSound('random.levelup');
  }
  announce('over');
  hideNames();
  world.sendMessage(winnerText);
  const rows = Object.entries(game.stats).sort((a, b) => b[1].tags - a[1].tags);
  for (const [who, s] of rows) announce('stats', who, s.tags, s.tagged, `${accuracy(s)}%`, s.captures);
  const best = mvp(game);
  if (best) announce('mvp', { text: `§6${best}§r` });
  fireworks(winner);
  clearAt = now() + 200;
}

function fireworks(winner) {
  const dimension = world.getDimension(game.origin.dim);
  const spots = (winner && TEAMS.includes(winner) ? padsOf(winner, dimension) : []).slice(0, 4);
  if (!spots.length) spots.push({ x: Math.floor(game.origin.x), y: Math.floor(game.origin.y), z: Math.floor(game.origin.z) });
  for (const [i, s] of spots.entries()) {
    system.runTimeout(() => {
      try {
        dimension.spawnEntity('minecraft:fireworks_rocket', { x: s.x + 0.5, y: s.y + 1.5, z: s.z + 0.5 });
      } catch {}
    }, i * 8);
  }
}

// ---------------------------------------------------------------- scoreboard and HUD

function setupScoreboard() {
  try {
    const old = world.scoreboard.getObjective(OBJECTIVE);
    if (old) world.scoreboard.removeObjective(old);
    const obj = world.scoreboard.addObjective(OBJECTIVE, 'Laser Tag');
    world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, { objective: obj });
    updateScoreboard();
  } catch (e) {
    console.warn(`${LOG} scoreboard: ${e}`);
  }
}

function updateScoreboard() {
  const obj = world.scoreboard.getObjective(OBJECTIVE);
  if (!obj || !game) return;
  try {
    for (const [key, score] of Object.entries(game.scores)) obj.setScore(teamMode(game) ? teamLabel(key) : key, score);
  } catch {}
}

function clearScoreboard() {
  try {
    const obj = world.scoreboard.getObjective(OBJECTIVE);
    if (obj) world.scoreboard.removeObjective(obj);
  } catch {}
}

/** The line above the hotbar: time left, the scores, your heat and what you carry. */
function hud(player) {
  const m = message.get(player.id);
  if (m && m.until > now()) return m.text;
  if (isDown(player)) return tr('hud.down', Math.ceil((downUntil.get(player.id) - now()) / 20));
  const h = heatOf(player);
  if (h.overheated) return tr('hud.overheated');
  const parts = [];
  const scope = scopeText(player);
  if (scope) parts.push(scope);
  if (game && game.phase === 'running') {
    parts.push(tr('hud.time', clockText(game.left)));
    const top = standings(game).slice(0, 4);
    if (teamMode(game)) parts.push({ text: top.map(([t, s]) => `${colour(t)}${s}§r`).join(' : ') });
    else parts.push({ text: `§e${game.scores[player.name] ?? 0}§r` });
    const flags = carrying(game, player.name);
    if (flags.length) parts.push(tr('hud.carrying', flagText(flags[0])));
  }
  const p = powerups.get(player.id) ?? {};
  const on = Object.keys(p).filter((k) => p[k] > now());
  if (on.length) parts.push({ text: `§d${on.map((k) => ({ rapid_fire: '⚡', shield: '🛡', speed: '»', double_points: '×2' })[k]).join(' ')}§r` });
  parts.push(tr('hud.heat', `${h.heat > 70 ? '§c' : h.heat > 40 ? '§e' : '§b'}${heatBar(h)}§r`));
  const rawtext = [];
  parts.forEach((part, i) => {
    if (i) rawtext.push({ text: '  §8|§r  ' });
    rawtext.push(part);
  });
  return { rawtext };
}

// ---------------------------------------------------------------- the clock

function everySecond() {
  if (!game) return;
  if (game.phase === 'over') {
    if (clearAt && now() >= clearAt) {
      clearScoreboard();
      removeGameBots(world.getDimension(game.origin.dim));
      game = null;
      clearAt = 0;
      save();
    }
    return;
  }
  const events = second(game, { points: pointCounts(world.getDimension(game.origin.dim)) });
  handle(events);
  updateScoreboard();
  save();
}

/** Dropped flags: shown with particles, picked up or sent home by whoever touches them. */
function droppedFlags() {
  if (!running() || game.mode !== 'capture_the_flag') return;
  const dimension = world.getDimension(game.origin.dim);
  for (const [team, flag] of Object.entries(game.flags)) {
    if (flag.state === 'carried') {
      const carrier = findByName(flag.carrier);
      if (carrier?.isValid) {
        try {
          dimension.spawnParticle(`${NS}:spark_${team}`, { x: carrier.location.x, y: carrier.location.y + 2.3, z: carrier.location.z });
        } catch {}
      }
    }
    if (flag.state !== 'dropped' || !flag.pos) continue;
    const at = { x: flag.pos[0], y: flag.pos[1] + 0.5, z: flag.pos[2] };
    try {
      dimension.spawnParticle(`${NS}:spark_${team}`, at);
    } catch {}
    for (const e of dimension.getEntities({ location: at, maxDistance: RULES.flag.touch })) {
      if (!isActive(e)) continue;
      const events = touchDropped(game, { who: nameOf(e), team: teamOf(e), flagTeam: team });
      if (events.length) {
        handle(events);
        save();
        break;
      }
    }
  }
}

function everyTick() {
  const t = now();
  for (const [id, until] of downUntil) {
    const entity = world.getEntity(id);
    if (!entity) downUntil.delete(id);
    else if (until <= t) comeBack(entity);
    else {
      showSign(entity, Math.ceil((until - t) / 20));
      // Sparks fly off a tagged vest twice a second.
      if ((until - t) % 10 < 2) sparks(entity, teamOf(entity));
    }
  }
  for (const [id, h] of heat) {
    if (h.heat <= 0 && !h.overheated) heat.delete(id);
    else heat.set(id, cool(h, 0.1));
  }
}

function load() {
  try {
    const saved = world.getDynamicProperty(SAVE);
    game = typeof saved === 'string' ? JSON.parse(saved) : null;
    if (game?.phase === 'over') game = null;
  } catch {
    game = null;
  }
  if (!game) clearScoreboard();
  // Nobody stays down across a restart, and a name hidden by a game that is over comes back.
  for (const p of world.getAllPlayers()) {
    if (!game && p.nameTag === '') p.nameTag = p.name;
    wakeUp(p);
  }
  for (const dim of ['overworld', 'nether', 'the_end']) {
    for (const bot of world.getDimension(dim).getEntities({ type: BOT, tags: [DOWN_TAG] })) {
      wakeUp(bot);
      bot.triggerEvent(`${NS}:up`);
    }
  }
}

export function setupGame() {
  load();
  system.runInterval(everySecond, 20);
  system.runInterval(everyTick, 2);
  system.runInterval(droppedFlags, 5);
  system.runInterval(() => {
    hideNames();
    for (const p of world.getAllPlayers()) {
      if (!teamOf(p) && !message.has(p.id)) continue;
      if (!teamOf(p) && (message.get(p.id)?.until ?? 0) <= now()) {
        message.delete(p.id);
        continue;
      }
      try {
        p.onScreenDisplay.setActionBar(hud(p));
      } catch {}
    }
  }, 10);
  // Frozen while tagged: nothing to throw, fire, eat, use or place until you are back.
  world.beforeEvents.itemUse.subscribe((e) => {
    if (isDown(e.source)) e.cancel = true;
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((e) => {
    if (isDown(e.player)) e.cancel = true;
  });
  // ... and what you drop comes back to you (Bedrock doesn't say who dropped it: the one
  // tagged whose hands it left).
  world.afterEvents.entitySpawn.subscribe(({ entity }) => {
    if (entity?.typeId !== 'minecraft:item') return;
    const p = entity.dimension.getPlayers({ location: entity.location, maxDistance: 2, closest: 1 })[0];
    if (!p || !isDown(p)) return;
    try {
      const stack = entity.getComponent('minecraft:item')?.itemStack;
      if (stack && !p.getComponent('minecraft:inventory')?.container?.addItem(stack)) entity.remove();
    } catch {}
  });
  // Left while tagged: free to move when you are back.
  world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    if (initialSpawn && !isDown(player)) wakeUp(player);
  });
  // Left in a hurry: drop what you carry.
  world.afterEvents.playerLeave.subscribe(({ playerName }) => {
    if (running()) handle(dropFlagsOf(playerName));
  });
  // Commands for game hosts: /scriptevent lasertag:stop, and
  // /scriptevent lasertag:start [mode] [minutes] [bots] [teams] [skill] [base|stay], where bots is one
  // number for every team or one per team in team order (2,2 or 2,2,1,0).
  system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id === `${NS}:start`) {
      const [mode, minutes, bots = '0', teams, skill, afterTag] = (event.message ?? '').trim().split(/\s+/);
      const each = bots.split(',');
      const source = event.sourceEntity ?? world.getAllPlayers()[0];
      const at = source ? { dimension: source.dimension, location: source.location } : { dimension: world.getDimension('overworld'), location: { x: 0, y: 0, z: 0 } };
      startGame({
        mode: RULES.modes[mode] ? mode : 'team_deathmatch',
        minutes: Number(minutes) || RULES.console.startMinutes,
        bots: each.length > 1 ? Object.fromEntries(RULES.teams.map((t, i) => [t, Number(each[i]) || 0])) : Number(bots) || 0,
        teams: Number(teams) || 2,
        skill,
        afterTag,
      }, at, isPlayer(source) ? source : undefined);
    } else if (event.id === `${NS}:stop`) stopGame();
  });
}

function dropFlagsOf(name) {
  const events = [];
  for (const f of carrying(game, name)) {
    game.flags[f] = { state: 'home', carrier: null, pos: null, returnAt: 0 };
    events.push({ type: 'flag_returned', flag: f, who: null });
  }
  return events;
}
