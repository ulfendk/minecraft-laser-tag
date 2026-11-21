// Games played with the shared rules (src/lib/game.mjs), step by step, with what
// came out of every step. The Java game test GameLogicTests replays them against
// dk.ulfen.lasertag.game.GameLogic and compares, so both editions keep the same rules.
// Written to data/lasertag/fixtures.json in the Java resources by tools/build.mjs.
import * as G from '../src/lib/game.mjs';

const snapshot = (g) => ({
  phase: g.phase, left: g.left, clock: g.clock,
  scores: { ...g.scores },
  flags: Object.fromEntries(Object.entries(g.flags).map(([k, f]) => [k, { state: f.state, carrier: f.carrier }])),
  points: Object.fromEntries(Object.entries(g.points).map(([k, p]) => [k, { owner: p.owner, team: p.team, progress: p.progress }])),
});

/** Plays `steps` ([op, args]) from a new game with `settings`. */
function play(name, settings, steps) {
  const game = G.newGame(settings);
  const out = [];
  for (const [op, args = {}] of steps) {
    let events = [];
    if (op === 'second') events = G.second(game, args);
    else if (op === 'seconds') for (let i = 0; i < args.n; i++) events.push(...G.second(game, args));
    else if (op === 'shot') G.onShot(game, args.who, args.hits);
    else if (op === 'tag') events = G.onTag(game, args);
    else if (op === 'stand') events = G.touchStand(game, args);
    else if (op === 'dropped') events = G.touchDropped(game, args);
    else if (op === 'stop') events = G.stop(game);
    else throw new Error(`Unknown op ${op}`);
    out.push({ op, args, events: events.map((e) => e.type + (e.name ? `:${e.name}` : '') + (e.winner !== undefined ? `:${e.winner}` : '')), state: snapshot(game) });
  }
  return { name, settings, steps: out, winner: G.winner(game), mvp: G.mvp(game) };
}

const go = ['seconds', { n: 5 }];
const tag = (who, team, target, targetTeam, extra = {}) => ['tag', { who, team, target, targetTeam, ...extra }];

export function fixtures() {
  const games = [
    play('team deathmatch to the score limit', { mode: 'team_deathmatch', minutes: 3, scoreLimit: 4 }, [
      go,
      tag('alice', 'red', 'bob', 'blue'),
      ['shot', { who: 'alice', hits: 0 }],
      ['second'],
      tag('alice', 'red', 'bob', 'blue'),
      tag('alice', 'red', 'carl', 'blue'),
      tag('bob', 'blue', 'alice', 'red', { double: true }),
      ['seconds', { n: 4 }],
      tag('dora', 'red', 'bob', 'blue'),
      ['second'],
    ]),
    play('free for all runs out of time', { mode: 'free_for_all', minutes: 1 }, [
      go,
      tag('alice', 'red', 'bob', 'red'),
      tag('bob', 'red', 'alice', 'red'),
      tag('bob', 'red', 'carl', 'blue'),
      ['seconds', { n: 60 }],
    ]),
    play('capture the flag', { mode: 'capture_the_flag', minutes: 5, scoreLimit: 2 }, [
      go,
      ['stand', { who: 'alice', team: 'red', standTeam: 'blue' }],
      tag('bob', 'blue', 'alice', 'red', { pos: [1, 2, 3] }),
      ['dropped', { who: 'carl', team: 'red', flagTeam: 'blue' }],
      ['stand', { who: 'carl', team: 'red', standTeam: 'red' }],
      ['stand', { who: 'bob', team: 'blue', standTeam: 'red' }],
      tag('alice', 'red', 'bob', 'blue', { pos: [4, 5, 6] }),
      ['seconds', { n: 31 }],
      ['stand', { who: 'carl', team: 'red', standTeam: 'blue' }],
      ['stand', { who: 'dora', team: 'blue', standTeam: 'red' }],
      ['stand', { who: 'carl', team: 'red', standTeam: 'red' }],
      ['dropped', { who: 'alice', team: 'red', flagTeam: 'red' }],
      tag('alice', 'red', 'dora', 'blue', { pos: [0, 0, 0] }),
      ['dropped', { who: 'alice', team: 'red', flagTeam: 'red' }],
      ['stand', { who: 'carl', team: 'red', standTeam: 'blue' }],
      ['stand', { who: 'carl', team: 'red', standTeam: 'red' }],
    ]),
    play('king of the hill', { mode: 'king_of_the_hill', minutes: 5, scoreLimit: 12, teams: 3 }, [
      go,
      ['seconds', { n: 3, points: { a: { red: 2 } } }],
      ['seconds', { n: 2, points: { a: { red: 2, blue: 1 } } }],
      ['seconds', { n: 4, points: { a: { blue: 3 }, b: { green: 1 } } }],
      ['seconds', { n: 3, points: { a: {}, b: { green: 1 } } }],
      ['seconds', { n: 6, points: { a: { blue: 1 }, b: { green: 5 } } }],
      ['seconds', { n: 10, points: { b: { green: 1 } } }],
    ]),
    play('stopped at the console', { mode: 'team_deathmatch', minutes: 10, teams: 4 }, [
      ['second'],
      go,
      tag('alice', 'yellow', 'bob', 'green'),
      ['stop'],
      ['second'],
    ]),
  ];
  // Heat: a blaster fired until it overheats, then left to cool.
  const heat = [];
  let h = { heat: 0, overheated: false };
  for (let i = 0; i < 9; i++) {
    h = G.shotHeat(h, 'laser_blaster');
    heat.push({ op: 'shot', ...h });
  }
  for (let i = 0; i < 6; i++) {
    h = G.cool(h, 0.5);
    heat.push({ op: 'cool', ...h });
  }
  heat.push({ op: 'rapid', ...G.shotHeat(h, 'laser_rifle', true) });
  return { games, heat, names: [1, 2, 3, 4, 5, 6, 8, 9].map((n) => ({ n, streak: G.streakName(n), multi: G.multiName(n) })) };
}
