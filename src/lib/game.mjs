// The rules of the game, with no Minecraft in them: scores, streaks, flags, control
// points, heat and the end of a round. The Bedrock scripts use this file as it is
// (tools/build.mjs copies it to scripts/logic.js) and the Java mod has the same
// rules in dk.ulfen.lasertag.game.GameLogic; tools/fixtures.mjs records a game
// played here and a Java game test plays it again and compares.
//
// A game is plain data (saved as JSON): the runtimes call second() once a second
// and the on*/touch* functions when things happen, and act on the events returned.
// `who` is a player's name or a bot's id; teams are the names in RULES.teams.
import { RULES } from '../rules.mjs';

export const MODES = Object.keys(RULES.modes);

/** A new game, counting down. `settings`: mode, minutes, scoreLimit (0 = the mode's), teams (how many). */
export function newGame({ mode = 'team_deathmatch', minutes = RULES.console.startMinutes, scoreLimit = 0, teams = 2 } = {}) {
  const m = RULES.modes[mode] ?? RULES.modes.team_deathmatch;
  const playing = RULES.teams.slice(0, Math.max(2, Math.min(RULES.teams.length, teams)));
  return {
    mode: RULES.modes[mode] ? mode : 'team_deathmatch',
    phase: 'countdown',
    countdown: RULES.console.countdown,
    clock: 0,
    left: minutes * 60,
    scoreLimit: scoreLimit > 0 ? scoreLimit : m.scoreLimit,
    teams: playing,
    scores: m.teams ? Object.fromEntries(playing.map((t) => [t, 0])) : {},
    stats: {},
    flags: Object.fromEntries(playing.map((t) => [t, { state: 'home', carrier: null, pos: null, returnAt: 0 }])),
    points: {},
  };
}

export const teamMode = (game) => RULES.modes[game.mode].teams;

/** Whether `a` (on team `ta`) may tag `b` (on team `tb`): never yourself, never your own team (except in free-for-all). */
export function enemies(game, a, ta, b, tb) {
  if (a === b) return false;
  if (!game || teamMode(game)) return ta !== tb;
  return true;
}

function stat(game, who) {
  return (game.stats[who] ??= { tags: 0, tagged: 0, shots: 0, hits: 0, captures: 0, streak: 0, best: 0, recent: [] });
}

function addScore(game, key, n) {
  game.scores[key] = (game.scores[key] ?? 0) + n;
}

export function streakName(n) {
  const hit = RULES.streaks.find(([at]) => at === n);
  return hit ? hit[1] : null;
}

export function multiName(n) {
  let name = null;
  for (const [at, m] of RULES.multis) if (n >= at) name = m;
  return name;
}

/** A shot was fired; `hits` is how many vests it tagged. */
export function onShot(game, who, hits) {
  if (!game || game.phase !== 'running') return;
  const s = stat(game, who);
  s.shots++;
  if (hits > 0) s.hits++;
}

/**
 * `who` (team `team`) tagged `target` (team `targetTeam`) at `pos`. `double` when the
 * shooter has double points. Returns the events: score, streak and multi-tag names,
 * and a dropped flag if the target was carrying one.
 */
export function onTag(game, { who, team, target, targetTeam, pos = null, double = false }) {
  const events = [];
  if (!game || game.phase !== 'running') return events;
  const s = stat(game, who);
  const t = stat(game, target);
  s.tags++;
  s.streak++;
  s.best = Math.max(s.best, s.streak);
  s.recent = [...s.recent.filter((c) => game.clock - c < RULES.tag.multiWindow), game.clock];
  t.tagged++;
  t.streak = 0;
  const points = double ? 2 : 1;
  if (game.mode === 'team_deathmatch') addScore(game, team, points);
  if (game.mode === 'free_for_all') addScore(game, who, points);
  if (game.mode === 'team_deathmatch' || game.mode === 'free_for_all') events.push({ type: 'score', key: game.mode === 'free_for_all' ? who : team, points });
  const streak = streakName(s.streak);
  if (streak) events.push({ type: 'streak', who, name: streak });
  const multi = s.recent.length >= 2 ? multiName(s.recent.length) : null;
  if (multi) events.push({ type: 'multi', who, name: multi });
  events.push(...dropFlags(game, target, pos));
  checkLimit(game, events);
  return events;
}

// ---------------------------------------------------------------- capture the flag

/** The flags `who` is carrying. */
export const carrying = (game, who) => Object.keys(game?.flags ?? {}).filter((f) => game.flags[f].state === 'carried' && game.flags[f].carrier === who);

/** `who` drops every flag they carry where they are (they were tagged, or left). */
export function dropFlags(game, who, pos) {
  const events = [];
  for (const f of carrying(game, who)) {
    game.flags[f] = { state: 'dropped', carrier: null, pos, returnAt: game.clock + RULES.flag.returnAfter };
    events.push({ type: 'flag_dropped', flag: f, who });
  }
  return events;
}

/** `who` (team `team`) touches the flag stand of `standTeam`. */
export function touchStand(game, { who, team, standTeam }) {
  const events = [];
  if (!game || game.mode !== 'capture_the_flag' || game.phase !== 'running') return events;
  const flag = game.flags[standTeam];
  if (!flag) return events;
  if (team === standTeam) {
    // Home with the enemy's flag, and your own flag is home too: a capture.
    const held = carrying(game, who);
    if (!held.length || flag.state !== 'home') return events;
    for (const f of held) {
      game.flags[f] = { state: 'home', carrier: null, pos: null, returnAt: 0 };
      addScore(game, team, 1);
      stat(game, who).captures++;
      events.push({ type: 'captured', flag: f, who, team });
    }
    checkLimit(game, events);
  } else if (flag.state === 'home' && game.flags[team] !== undefined) {
    game.flags[standTeam] = { state: 'carried', carrier: who, pos: null, returnAt: 0 };
    events.push({ type: 'flag_taken', flag: standTeam, who });
  }
  return events;
}

/** `who` (team `team`) touches the dropped flag of `flagTeam`: their own goes home, an enemy's is picked up. */
export function touchDropped(game, { who, team, flagTeam }) {
  const events = [];
  const flag = game?.flags[flagTeam];
  if (!flag || flag.state !== 'dropped' || game.phase !== 'running') return events;
  if (team === flagTeam) {
    game.flags[flagTeam] = { state: 'home', carrier: null, pos: null, returnAt: 0 };
    events.push({ type: 'flag_returned', flag: flagTeam, who });
  } else if (game.flags[team] !== undefined) {
    game.flags[flagTeam] = { state: 'carried', carrier: who, pos: null, returnAt: 0 };
    events.push({ type: 'flag_taken', flag: flagTeam, who });
  }
  return events;
}

// ---------------------------------------------------------------- control points

/**
 * One second at a control point. `counts`: how many active players of each team stand
 * next to it. One team alone pushes it its way (one step per player, at most maxPush):
 * first it takes the point back from its owner (down to 0), then it builds it up (to
 * `capture`) and owns it. Two teams at once: nothing moves. Nobody: unfinished
 * progress slips back. Returns the point, and an event when it changes hands.
 */
export function pushPoint(point, counts) {
  const P = RULES.point;
  const p = { owner: point?.owner ?? null, team: point?.team ?? null, progress: point?.progress ?? 0 };
  const present = Object.entries(counts).filter(([, n]) => n > 0);
  let event = null;
  if (present.length === 1) {
    const [team, n] = present[0];
    const push = Math.min(n, P.maxPush);
    if (p.owner === team) {
      p.team = team;
      p.progress = P.capture;
    } else if (p.owner) {
      p.progress -= push;
      if (p.progress <= 0) {
        event = { type: 'point_lost', team: p.owner, by: team };
        p.owner = null;
        p.team = team;
        p.progress = 0;
      }
    } else if (p.team && p.team !== team && p.progress > 0) {
      p.progress = Math.max(0, p.progress - push);
      if (p.progress === 0) p.team = team;
    } else {
      p.team = team;
      p.progress = Math.min(P.capture, p.progress + push);
      if (p.progress >= P.capture) {
        p.owner = team;
        event = { type: 'point_taken', team };
      }
    }
  } else if (present.length === 0) {
    if (p.owner) p.progress = Math.min(P.capture, p.progress + P.decay);
    else if (p.progress > 0) {
      p.progress = Math.max(0, p.progress - P.decay);
      if (p.progress === 0) p.team = null;
    }
  }
  return { point: p, event };
}

// ---------------------------------------------------------------- the clock

/**
 * One second of the game. `points`: { key: counts } for every control point in the
 * arena (king of the hill). Returns the events: countdown, go, a minute left, flags
 * going home, points changing hands, and the end.
 */
export function second(game, { points = {} } = {}) {
  const events = [];
  if (!game || game.phase === 'over') return events;
  if (game.phase === 'countdown') {
    game.countdown--;
    if (game.countdown > 0) events.push({ type: 'countdown', n: game.countdown });
    else {
      game.phase = 'running';
      events.push({ type: 'go' });
    }
    return events;
  }
  game.clock++;
  game.left--;
  if (game.left === RULES.console.warnAt) events.push({ type: 'minute' });
  for (const [f, flag] of Object.entries(game.flags)) {
    if (flag.state === 'dropped' && game.clock >= flag.returnAt) {
      game.flags[f] = { state: 'home', carrier: null, pos: null, returnAt: 0 };
      events.push({ type: 'flag_returned', flag: f, who: null });
    }
  }
  if (game.mode === 'king_of_the_hill') {
    for (const [key, counts] of Object.entries(points)) {
      const { point, event } = pushPoint(game.points[key], counts);
      game.points[key] = point;
      if (event) events.push({ ...event, key });
      if (point.owner && game.scores[point.owner] !== undefined) addScore(game, point.owner, 1);
    }
    // Points that are gone from the arena stop counting.
    for (const key of Object.keys(game.points)) if (!(key in points)) delete game.points[key];
  }
  checkLimit(game, events);
  if (game.phase !== 'over' && game.left <= 0) finish(game, events);
  return events;
}

function checkLimit(game, events) {
  if (game.phase !== 'running' || !game.scoreLimit) return;
  if (Object.values(game.scores).some((s) => s >= game.scoreLimit)) finish(game, events);
}

function finish(game, events) {
  game.phase = 'over';
  events.push({ type: 'over', winner: winner(game) });
}

/** Ends the game now (stopped at the console). */
export function stop(game) {
  const events = [];
  if (game && game.phase !== 'over') finish(game, events);
  return events;
}

/** Scores from the top: [[team or player, score], …]. Ties keep the order they were added in. */
export function standings(game) {
  return Object.entries(game?.scores ?? {}).sort((a, b) => b[1] - a[1]);
}

/** The team or player with the most points, or null when nobody scored or it is a tie. */
export function winner(game) {
  const [first, second] = standings(game);
  if (!first || first[1] <= 0 || (second && second[1] === first[1])) return null;
  return first[0];
}

/** Hits per shot, in whole percent. */
export const accuracy = (s) => (s.shots ? Math.round((100 * s.hits) / s.shots) : 0);

/** The most valuable player: tags and captures count, being tagged a little against. */
export function mvp(game) {
  let best = null;
  let bestScore = 0;
  for (const [who, s] of Object.entries(game?.stats ?? {})) {
    const score = 2 * s.tags + 5 * s.captures - s.tagged;
    if (score > bestScore) {
      best = who;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------- guns

/** Heat after a shot from `gun`: { heat, overheated }. With rapid fire nothing heats up. */
export function shotHeat(h, gun, rapid = false) {
  if (rapid) return { heat: h.heat, overheated: false };
  const heat = Math.min(RULES.heat.max, h.heat + RULES.guns[gun].heat);
  return { heat, overheated: heat >= RULES.heat.max };
}

/** Heat after `seconds` of cooling. An overheated gun works again once it is cold. */
export function cool(h, seconds) {
  const rate = h.overheated ? RULES.heat.overheatCoolPerSecond : RULES.heat.coolPerSecond;
  const heat = Math.max(0, h.heat - rate * seconds);
  return { heat, overheated: h.overheated && heat > 0 };
}

/** A heat bar of ten pieces, for the action bar. */
export function heatBar(h) {
  const n = Math.round((h.heat / RULES.heat.max) * 10);
  return '▮'.repeat(n) + '▯'.repeat(10 - n);
}

/** Which power-up a power-up station hands out, from a random number in [0, 1). */
export function pickPowerup(r) {
  const kinds = Object.keys(RULES.powerups.kinds);
  return kinds[Math.min(kinds.length - 1, Math.floor(r * kinds.length))];
}

/** The team of each bot the console brings into a game: `perTeam` on every team, taking turns. */
export function botTeams(game, perTeam) {
  const out = [];
  for (let i = 0; i < perTeam; i++) for (const t of game.teams) out.push(t);
  return out;
}

/** m:ss */
export const clockText = (seconds) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;
