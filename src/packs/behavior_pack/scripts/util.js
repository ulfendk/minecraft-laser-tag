// Small helpers shared by the scripts.
import { EquipmentSlot, system, world } from '@minecraft/server';
import { RULES } from './data.js';

export const NS = 'lasertag';
export const LOG = '[Laser Tag]';
export const BOT = `${NS}:laser_bot`;
export const DOWN_TAG = `${NS}_down`;
export const GAME_BOT_TAG = `${NS}_game_bot`;
export const TEAMS = RULES.teams;

export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const norm = (a) => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
export const centre = (b) => ({ x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 });
export const now = () => system.currentTick;

export const isPlayer = (e) => e?.typeId === 'minecraft:player';
export const isBot = (e) => e?.typeId === BOT;

/** `direction` turned off course by up to `degrees`, at random. */
export function spread(direction, degrees) {
  if (!degrees) return direction;
  const r = (degrees * Math.PI) / 180;
  const a = Math.random() * Math.PI * 2;
  const m = Math.sqrt(Math.random()) * r;
  const up = Math.abs(direction.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const cross = (p, q) => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x });
  const u = norm(cross(direction, up));
  const v = cross(direction, u);
  return norm(add(direction, add(scale(u, Math.cos(a) * Math.tan(m)), scale(v, Math.sin(a) * Math.tan(m)))));
}

export function heldItem(player) {
  return player.getComponent('minecraft:inventory')?.container?.getItem(player.selectedSlotIndex);
}

export function equipment(entity, slot) {
  try {
    return entity.getComponent('minecraft:equippable')?.getEquipment(slot);
  } catch {
    return undefined;
  }
}

/**
 * The team an entity plays for: a player's vest, a bot's colour. Undefined for anyone
 * else (they can't fire, and lasers pass them by).
 */
export function teamOf(entity) {
  if (!entity?.isValid) return undefined;
  if (isPlayer(entity)) {
    const vest = equipment(entity, EquipmentSlot.Chest)?.typeId;
    return vest?.startsWith(`${NS}:vest_`) ? vest.slice(`${NS}:vest_`.length) : undefined;
  }
  if (isBot(entity)) {
    const set = entity.getDynamicProperty(`${NS}:team`);
    if (typeof set === 'string') return set;
    const v = entity.getComponent('minecraft:variant')?.value ?? 0;
    return TEAMS[v - 1];
  }
  return undefined;
}

/** The first line of a tagged player's or bot's name tag is the sign above its head. */
export const SIGN = '§c§l';
export const plainName = (nameTag) => (nameTag.startsWith(SIGN) ? nameTag.slice(nameTag.indexOf('\n') + 1) : nameTag);

/** A bot's own name: its name tag is empty while a game hides names. */
export const BOT_NAME = `${NS}:name`;
export function botName(bot) {
  const name = bot.getDynamicProperty(BOT_NAME);
  return typeof name === 'string' ? name : plainName(bot.nameTag ?? '');
}

/** How a player or bot is named in scores and messages. */
export function nameOf(entity) {
  if (isPlayer(entity)) return entity.name;
  return botName(entity) || `Bot ${entity.id}`;
}

/** The colour code of a team's chat text. */
export const colour = (team) => `§${RULES.colours[team]?.chat ?? 'f'}`;
export const coloured = (entityOrName, team) => ({ text: `${colour(team)}${typeof entityOrName === 'string' ? entityOrName : nameOf(entityOrName)}§r` });

/** Arguments for a translated message: plain text, or { translate } / { text } parts. */
const raw = (args) => ({ rawtext: args.map((a) => (typeof a === 'object' ? a : { text: String(a) })) });
export const tr = (key, ...args) => ({ translate: `${NS}.${key}`, with: raw(args) });

/** Show a translated message above the hotbar. */
export function tell(player, key, ...args) {
  try {
    player.onScreenDisplay.setActionBar(tr(key, ...args));
  } catch {}
}

/** A message in everyone's chat. */
export function announce(key, ...args) {
  try {
    world.sendMessage(tr(key, ...args));
  } catch {}
}

export function title(player, text, subtitle, stay = 30) {
  const o = overlays.get(player.id);
  if (o) o.title = { text, subtitle, until: now() + stay + 8 };
  showTitle(player, o ? withCode(o.code, text) : text, subtitle, stay);
}

function showTitle(player, text, subtitle, stay) {
  try {
    player.onScreenDisplay.setTitle(text, { subtitle, fadeInDuration: 2, stayDuration: stay, fadeOutDuration: 6 });
  } catch {}
}

// The scope overlay is switched on by a title made only of formatting codes (src/hud.mjs).
// A title shown meanwhile carries the code too, and the overlay's own title comes back
// once that title has gone.
/** Player id -> { code, title: { text, subtitle, until } }. */
const overlays = new Map();

const withCode = (code, text) => (typeof text === 'string' ? `${code}${text}` : { rawtext: [{ text: code }, ...(text?.rawtext ?? [text])] });

function showOverlay(player, code) {
  try {
    // clearTitle() can leave the old text in the HUD's title binding, so overwrite it.
    if (!code) player.onScreenDisplay.setTitle('§r', { fadeInDuration: 0, stayDuration: 1, fadeOutDuration: 0 });
    else player.onScreenDisplay.setTitle(code, { fadeInDuration: 0, stayDuration: 72000, fadeOutDuration: 0 });
  } catch {}
}

/** Show the HUD overlay with this code for `player`, or none (`undefined`). */
export function setOverlay(player, code) {
  const old = overlays.get(player.id);
  if (code) overlays.set(player.id, { code, title: old?.title });
  else overlays.delete(player.id);
  const left = (old?.title?.until ?? 0) - now();
  // A title still on screen is shown again, with or without the code.
  if (left > 8) showTitle(player, code ? withCode(code, old.title.text) : old.title.text, old.title.subtitle, left - 8);
  else showOverlay(player, code);
}

/** Every tick while an overlay is up: bring its title back once another title has gone. */
export function keepOverlay(player) {
  const o = overlays.get(player.id);
  if (!o?.title || o.title.until > now()) return;
  o.title = undefined;
  showOverlay(player, o.code);
}

export function sound(entity, id, pitch = 1, volume = 1) {
  try {
    entity.dimension.playSound(id, entity.location, { pitch, volume });
  } catch {}
}

/** Everyone in the game: players in a vest and the laser bots. */
export function players() {
  return world.getAllPlayers().filter((p) => teamOf(p));
}
