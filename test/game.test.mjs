import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/lib/game.mjs';
import { RULES } from '../src/rules.mjs';

const running = (settings) => {
  const g = G.newGame(settings);
  for (let i = 0; i < RULES.console.countdown; i++) G.second(g);
  return g;
};

test('a game counts down, then runs', () => {
  const g = G.newGame({ mode: 'team_deathmatch', minutes: 3 });
  const events = [];
  for (let i = 0; i < RULES.console.countdown; i++) events.push(...G.second(g));
  assert.deepEqual(events.map((e) => e.type), [...Array(RULES.console.countdown - 1).fill('countdown'), 'go']);
  assert.equal(g.phase, 'running');
  assert.equal(g.left, 180);
  assert.deepEqual(g.scores, { red: 0, blue: 0 });
});

test('no scoring before GO or after the end', () => {
  const g = G.newGame({});
  assert.deepEqual(G.onTag(g, { who: 'a', team: 'red', target: 'b', targetTeam: 'blue' }), []);
  assert.equal(g.scores.red, 0);
});

test('team deathmatch: tags score for the team, the limit ends it', () => {
  const g = running({ mode: 'team_deathmatch', scoreLimit: 2 });
  G.onTag(g, { who: 'a', team: 'red', target: 'b', targetTeam: 'blue' });
  const events = G.onTag(g, { who: 'a', team: 'red', target: 'c', targetTeam: 'blue' });
  assert.equal(g.scores.red, 2);
  assert.equal(g.phase, 'over');
  assert.deepEqual(events.at(-1), { type: 'over', winner: 'red' });
  assert.ok(events.some((e) => e.type === 'multi' && e.name === 'double'));
});

test('double points count twice', () => {
  const g = running({ mode: 'team_deathmatch' });
  G.onTag(g, { who: 'a', team: 'red', target: 'b', targetTeam: 'blue', double: true });
  assert.equal(g.scores.red, 2);
});

test('free-for-all: everyone is an enemy, players score for themselves', () => {
  const g = running({ mode: 'free_for_all' });
  assert.ok(G.enemies(g, 'a', 'red', 'b', 'red'));
  assert.ok(!G.enemies(g, 'a', 'red', 'a', 'red'));
  G.onTag(g, { who: 'a', team: 'red', target: 'b', targetTeam: 'red' });
  assert.deepEqual(g.scores, { a: 1 });
  assert.ok(!G.enemies(running({ mode: 'team_deathmatch' }), 'a', 'red', 'b', 'red'));
  assert.ok(!G.enemies(null, 'a', 'red', 'b', 'red'));
});

test('streaks are announced at 3, 5 and 8, and broken by being tagged', () => {
  const g = running({ mode: 'team_deathmatch' });
  const names = [];
  for (let i = 0; i < 8; i++) {
    for (const e of G.onTag(g, { who: 'a', team: 'red', target: `b${i}`, targetTeam: 'blue' })) if (e.type === 'streak') names.push(e.name);
    G.second(g);
    G.second(g);
    G.second(g);
  }
  assert.deepEqual(names, ['on_a_roll', 'unstoppable', 'legendary']);
  G.onTag(g, { who: 'x', team: 'blue', target: 'a', targetTeam: 'red' });
  assert.equal(g.stats.a.streak, 0);
  assert.equal(g.stats.a.best, 8);
});

test('capture the flag: take, drop, return, capture', () => {
  const g = running({ mode: 'capture_the_flag' });
  assert.equal(G.touchStand(g, { who: 'a', team: 'red', standTeam: 'blue' })[0].type, 'flag_taken');
  assert.deepEqual(G.carrying(g, 'a'), ['blue']);
  // Home without your own flag on its stand: no capture.
  G.touchStand(g, { who: 'b', team: 'blue', standTeam: 'red' });
  assert.deepEqual(G.touchStand(g, { who: 'a', team: 'red', standTeam: 'red' }), []);
  // b is tagged and drops the red flag; red touches it to send it home.
  G.onTag(g, { who: 'c', team: 'red', target: 'b', targetTeam: 'blue', pos: [1, 2, 3] });
  assert.equal(g.flags.red.state, 'dropped');
  assert.deepEqual(g.flags.red.pos, [1, 2, 3]);
  assert.equal(G.touchDropped(g, { who: 'c', team: 'red', flagTeam: 'red' })[0].type, 'flag_returned');
  const events = G.touchStand(g, { who: 'a', team: 'red', standTeam: 'red' });
  assert.equal(events[0].type, 'captured');
  assert.equal(g.scores.red, 1);
  assert.equal(g.flags.blue.state, 'home');
  assert.equal(g.stats.a.captures, 1);
});

test('a dropped flag goes home by itself', () => {
  const g = running({ mode: 'capture_the_flag' });
  G.touchStand(g, { who: 'a', team: 'red', standTeam: 'blue' });
  G.dropFlags(g, 'a', [0, 0, 0]);
  let returned = false;
  for (let i = 0; i < RULES.flag.returnAfter; i++) returned ||= G.second(g).some((e) => e.type === 'flag_returned');
  assert.ok(returned);
  assert.equal(g.flags.blue.state, 'home');
});

test('control points: taken by one team, contested, neutralised, retaken', () => {
  const C = RULES.point.capture;
  let p = null;
  let event;
  for (let i = 0; i < C; i++) ({ point: p, event } = G.pushPoint(p, { red: 1 }));
  assert.equal(p.owner, 'red');
  assert.equal(event.type, 'point_taken');
  ({ point: p } = G.pushPoint(p, { red: 1, blue: 3 }));
  assert.equal(p.owner, 'red');
  assert.equal(p.progress, C);
  ({ point: p } = G.pushPoint(p, { blue: 10 }));
  assert.equal(p.progress, C - RULES.point.maxPush);
  ({ point: p, event } = G.pushPoint(p, { blue: 3 }));
  assert.equal(p.owner, null);
  assert.equal(event.type, 'point_lost');
  ({ point: p } = G.pushPoint(p, { blue: 2 }));
  assert.equal(p.team, 'blue');
  assert.equal(p.progress, 2);
  ({ point: p } = G.pushPoint(p, {}));
  assert.equal(p.progress, 1);
});

test('king of the hill scores a point a second for each point held', () => {
  const g = running({ mode: 'king_of_the_hill', scoreLimit: 5 });
  let events = [];
  for (let i = 0; i < RULES.point.capture + 10 && g.phase === 'running'; i++) events = G.second(g, { points: { a: { green: 1 }, b: {} } });
  assert.equal(g.phase, 'running', 'green is not playing: it can hold nothing');
  const h = running({ mode: 'king_of_the_hill', scoreLimit: 5 });
  for (let i = 0; i < RULES.point.capture + 10 && h.phase === 'running'; i++) events = G.second(h, { points: { a: { red: 3 } } });
  assert.equal(h.phase, 'over');
  assert.equal(events.at(-1).winner, 'red');
});

test('the clock: a minute left, then over', () => {
  const g = running({ mode: 'team_deathmatch', minutes: 2 });
  const types = [];
  for (let i = 0; i < 120; i++) types.push(...G.second(g).map((e) => e.type));
  assert.ok(types.includes('minute'));
  assert.equal(types.at(-1), 'over');
  assert.equal(G.winner(g), null);
  assert.deepEqual(G.stop(g), []);
});

test('heat: shots heat up, an overheated gun works again once cold, rapid fire never heats', () => {
  let h = { heat: 0, overheated: false };
  let shots = 0;
  while (!h.overheated) {
    h = G.shotHeat(h, 'laser_blaster');
    shots++;
  }
  assert.equal(shots, Math.ceil(RULES.heat.max / RULES.guns.laser_blaster.heat));
  h = G.cool(h, 1);
  assert.ok(h.overheated);
  h = G.cool(h, 10);
  assert.deepEqual(h, { heat: 0, overheated: false });
  assert.deepEqual(G.shotHeat({ heat: 50, overheated: false }, 'laser_rifle', true), { heat: 50, overheated: false });
  assert.equal(G.heatBar({ heat: 50 }), '▮▮▮▮▮▯▯▯▯▯');
});

test('stats, MVP, power-ups, bots and the clock text', () => {
  const g = running({ mode: 'team_deathmatch', teams: 3 });
  G.onShot(g, 'a', 1);
  G.onShot(g, 'a', 0);
  G.onTag(g, { who: 'a', team: 'red', target: 'b', targetTeam: 'blue' });
  assert.equal(G.accuracy(g.stats.a), 50);
  assert.equal(G.mvp(g), 'a');
  assert.deepEqual(G.botTeams(g, 2), ['red', 'blue', 'green', 'red', 'blue', 'green']);
  // Two kids a side, and two bots on each team; or bots only where they are wanted.
  assert.deepEqual(G.botTeams(g, { red: 2, blue: 2 }), ['red', 'blue', 'red', 'blue']);
  assert.deepEqual(G.botTeams(g, { red: 1, blue: 3, yellow: 4 }), ['red', 'blue', 'blue', 'blue']);
  assert.deepEqual(G.botCounts(g, { red: 9, green: -1 }), { red: 4, blue: 0, green: 0 });
  assert.equal(G.botSkill('hard'), 'hard');
  assert.equal(G.botSkill('nope'), 'normal');
  assert.equal(G.pickPowerup(0), 'rapid_fire');
  assert.equal(G.pickPowerup(0.999), 'double_points');
  assert.equal(G.clockText(125), '2:05');
});
