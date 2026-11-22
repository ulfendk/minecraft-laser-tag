// Used by tools/bds-test.sh: `scriptevent lasertag:selftest` checks that the items,
// blocks and the laser bot exist, then plays laser tag with bots (there are no
// players on the test server): a smoke machine switches, a laser tags a bot of another team and not its own
// or one behind a wall, the tagged bot comes back on its spawn pad, a shield takes
// a hit, the pulse grenade tags, and games of team deathmatch (with bots that fire
// by themselves), capture the flag and king of the hill run and end. It prints
// PASS or FAIL when it is done.
import { BlockPermutation, ItemStack, system, world } from '@minecraft/server';
import { BLOCKS, CREATURES, ITEMS, RULES } from './data.js';
import { alarming, padsOf, soundSiren, toggleSmoke } from './arena.js';
import { counts, joinTeam } from './bots.js';
import { current, givePowerup, isDown, isProtected, startGame, stopGame, tag } from './game.js';
import { fire, fireRay, pulse } from './guns.js';
import { BOT, dist, DOWN_TAG, GAME_BOT_TAG, LOG, nameOf, norm, NS, SIGN, sub, teamOf } from './util.js';

const later = (ticks) => new Promise((resolve) => system.runTimeout(resolve, ticks));
const Y = -60; // the first block above a flat world's grass
const DOWN = RULES.tag.down * 20;
const PROTECT = RULES.tag.protect * 20;

/** Wait (at most `ticks`) until `test()` is true. */
async function until(test, ticks) {
  for (let t = 0; t < ticks; t += 5) {
    if (test()) return true;
    await later(5);
  }
  return test();
}

async function selfTest() {
  const problems = [];
  const check = (ok, problem) => {
    if (!ok) problems.push(problem);
    return ok;
  };
  const dim = world.getDimension('overworld');
  for (const id of ITEMS) {
    try {
      new ItemStack(id, 1);
    } catch {
      problems.push(`missing item ${id}`);
    }
  }
  for (const { id } of BLOCKS) {
    try {
      BlockPermutation.resolve(id);
    } catch {
      problems.push(`missing block ${id}`);
    }
  }
  for (const id of CREATURES) if (!dim.getEntities({ type: id }).length) problems.push(`no ${id} in the world`);
  // The summoned bot wanders and fires: out of the way of the tests.
  for (const b of dim.getEntities({ type: BOT })) b.remove();

  // The arena: pads and flag stands for red and blue, a control point, a power-up station.
  const place = (id, x, z) => dim.getBlock({ x, y: Y, z }).setPermutation(BlockPermutation.resolve(`${NS}:${id}`));
  place('spawn_pad_red', 2, 2);
  place('spawn_pad_blue', 30, 2);
  place('flag_stand_red', 2, 10);
  place('flag_stand_blue', 30, 10);
  place('control_point', 16, 20);
  place('power_station', 16, 30);
  await later(30);
  check(padsOf('red', dim).length === 1 && padsOf('blue', dim).length === 1, 'the spawn pads did not register');
  // A smoke machine is placed on, and switches off and on again.
  place('smoke_machine', 20, 30);
  const smoke = dim.getBlock({ x: 20, y: Y, z: 30 });
  check(smoke.permutation.getState(`${NS}:on`) === true && !toggleSmoke(smoke) && toggleSmoke(smoke), 'the smoke machine did not switch');
  // The siren goes off once, then recharges.
  place('siren', 24, 30);
  const siren = dim.getBlock({ x: 24, y: Y, z: 30 });
  check(siren.permutation.getState(`${NS}:charged`) === true && soundSiren(siren) && alarming(), 'the siren did not go off');
  check(siren.permutation.getState(`${NS}:charged`) === false && !soundSiren(siren), 'the siren went off twice');

  // Two bots that stand still: red shoots blue.
  const bot = (team, x, z) => {
    const b = dim.spawnEntity(BOT, { x, y: Y, z });
    b.addTag(`${NS}_hold`);
    joinTeam(b, team, `Test ${team}`);
    return b;
  };
  const red = bot('red', 10.5, 40.5);
  const blue = bot('blue', 14.5, 40.5);
  const red2 = bot('red', 12.5, 36.5);
  await later(10);
  for (const b of [red, blue, red2]) b.triggerEvent(`${NS}:hold`);
  await later(5);
  const aim = (from, to) => norm(sub({ x: to.location.x, y: to.location.y + 1, z: to.location.z }, from.getHeadLocation()));

  check(fireRay(red, red.getHeadLocation(), aim(red, blue), 20) === 'tagged', 'a laser did not tag a bot of another team');
  check(isDown(blue) && blue.hasTag(DOWN_TAG), 'the tagged bot is not out');
  await later(4);
  check(blue.nameTag.startsWith(SIGN) && nameOf(blue) === 'Test blue', `the tagged bot has no sign above its head (${JSON.stringify(blue.nameTag)})`);
  check(!tag(red, red2), 'a bot tagged its own team');
  await later(DOWN + 10);
  check(!isDown(blue) && !blue.hasTag(DOWN_TAG), 'the tagged bot did not come back');
  check(blue.nameTag === 'Test blue', `the sign stayed above the bot's head (${JSON.stringify(blue.nameTag)})`);
  check(dist(blue.location, { x: 30.5, y: Y + 1, z: 2.5 }) < 1.5, `the tagged bot did not come back on its spawn pad (${JSON.stringify(blue.location)})`);
  check(isProtected(blue) && !tag(red, blue), 'a bot just back could be tagged');
  await later(PROTECT + 5);

  // A gun fires once per click, then waits its cooldown out.
  check(fire(red2, 'laser_rifle') && !fire(red2, 'laser_rifle'), 'a gun did not fire, or fired again at once');
  await later(Math.round(RULES.guns.laser_rifle.cooldown * 20) + 1);
  check(fire(red2, 'laser_rifle'), 'a gun did not fire again after its cooldown');

  // A wall stops a laser.
  blue.teleport({ x: 14.5, y: Y, z: 44.5 });
  red.teleport({ x: 10.5, y: Y, z: 44.5 });
  for (let y = Y; y < Y + 3; y++) dim.getBlock({ x: 12, y, z: 44 }).setType('minecraft:stone');
  await later(5);
  check(!fireRay(red, red.getHeadLocation(), aim(red, blue), 20), 'a laser went through a wall');
  check(!isDown(blue), 'a bot behind a wall was tagged');

  // A shield takes one hit.
  givePowerup(blue, 'shield');
  check(tag(red, blue) === 'shield' && !isDown(blue), 'the shield did not take the hit');
  // The pulse grenade.
  check(pulse(dim, blue.location, red) === 1 && isDown(blue), 'the pulse grenade did not tag');
  await later(DOWN + PROTECT + 10);

  check(!alarming() && siren.permutation.getState(`${NS}:charged`) === false, 'the siren did not stop, or it recharged too soon');

  // Team deathmatch with hard bots, two on red and one on blue, that fire by themselves.
  check(startGame({ mode: 'team_deathmatch', minutes: 3, bots: { red: 2, blue: 1 }, skill: 'hard', teams: 2 }, { dimension: dim, location: { x: 16, y: Y, z: 12 } }), 'the game did not start');
  check(current()?.skill === 'hard', 'the bots are not hard');
  await later(10);
  const allBots = dim.getEntities({ type: BOT, tags: [GAME_BOT_TAG] });
  // Held still until the test's own tag has scored, so they can't tag the test's bots first.
  for (const b of allBots) b.triggerEvent(`${NS}:hold`);
  const reds = allBots.filter((b) => teamOf(b) === 'red');
  check(allBots.length === 3 && reds.length === 2, `${allBots.length} game bots, ${reds.length} on red, not 2 on red and 1 on blue`);
  // One of each team goes on; the second red bot stays held.
  const gameBots = [reds[0], allBots.find((b) => teamOf(b) === 'blue')];
  check(current()?.phase === 'countdown', 'no countdown');
  check(!tag(red, blue), 'a tag counted during the countdown');
  await until(() => current()?.phase === 'running', 140);
  check(current()?.phase === 'running', 'the game did not start after the countdown');
  blue.teleport({ x: 14.5, y: Y, z: 40.5 });
  red.teleport({ x: 10.5, y: Y, z: 40.5 });
  await later(3);
  // The game's bots may already have scored: the tag must add one.
  const before = current().scores.red;
  check(tag(red, blue) === 'tagged' && current().scores.red === before + 1, `the tag did not score (${JSON.stringify(current()?.scores)})`);
  // The game's bots find each other and fire.
  gameBots[0].teleport({ x: 12.5, y: Y, z: 4.5 });
  gameBots[1].teleport({ x: 22.5, y: Y, z: 4.5 });
  for (const b of gameBots) b.triggerEvent(`${NS}:up`);
  const shots = () => gameBots.reduce((n, b) => n + (current()?.stats[nameOf(b)]?.shots ?? 0), 0);
  check(await until(() => shots() > 0, 600), 'the game\'s bots never fired');
  console.log(`${LOG} selftest: the bots fired ${shots()} shots (the AI shot ${counts.shots} times, ${counts.fired} fired), scores ${JSON.stringify(current()?.scores)}`);
  check(stopGame() && current()?.phase === 'over', 'the game did not stop');
  await later(DOWN + PROTECT);

  // Capture the flag: red takes blue's flag and brings it home.
  check(startGame({ mode: 'capture_the_flag', minutes: 3, bots: 0, teams: 2 }, { dimension: dim, location: { x: 16, y: Y, z: 12 } }), 'capture the flag did not start');
  check(!dim.getEntities({ type: BOT, tags: [GAME_BOT_TAG] }).length, 'the last game\'s bots are still there');
  await until(() => current()?.phase === 'running', 140);
  const flagShown = (x) => dim.getBlock({ x, y: Y, z: 10 }).permutation.getState(`${NS}:flag`);
  red.teleport({ x: 30.5, y: Y + 1, z: 10.5 });
  await until(() => current().flags.blue.state === 'carried', 40);
  check(current().flags.blue.state === 'carried' && current().flags.blue.carrier === nameOf(red), `red did not take the blue flag (${JSON.stringify(current().flags.blue)})`);
  await later(10);
  check(flagShown(30) === false, 'the blue flag is still on its stand');
  // Tagged while carrying it: the flag drops, and blue sends it home by touching it.
  check(tag(blue, red) === 'tagged' && current().flags.blue.state === 'dropped', 'the flag was not dropped');
  blue.teleport({ x: 30.5, y: Y, z: 10.5 + 12 });
  await later(5);
  const drop = current().flags.blue.pos;
  blue.teleport({ x: drop[0], y: drop[1], z: drop[2] });
  await until(() => current().flags.blue.state === 'home', 40);
  check(current().flags.blue.state === 'home', 'blue did not send its flag home');
  await later(DOWN + PROTECT);
  blue.teleport({ x: 20.5, y: Y, z: 50.5 });
  red.teleport({ x: 30.5, y: Y + 1, z: 10.5 });
  await until(() => current().flags.blue.state === 'carried', 40);
  red.teleport({ x: 2.5, y: Y + 1, z: 10.5 });
  await until(() => current().scores.red === 1, 40);
  check(current().scores.red === 1 && current().flags.blue.state === 'home', `the flag was not captured (${JSON.stringify(current().scores)})`);
  await later(10);
  check(flagShown(30) === true, 'the blue flag is not back on its stand');
  stopGame();

  // King of the hill: red stands at the control point until it is red's.
  check(startGame({ mode: 'king_of_the_hill', minutes: 3, bots: 0, teams: 2 }, { dimension: dim, location: { x: 16, y: Y, z: 12 } }), 'king of the hill did not start');
  await until(() => current()?.phase === 'running', 140);
  red.teleport({ x: 17.5, y: Y, z: 21.5 });
  await until(() => Object.values(current().points).some((p) => p.owner === 'red'), (RULES.point.capture + 4) * 20);
  check(Object.values(current().points).some((p) => p.owner === 'red'), `red did not take the control point (${JSON.stringify(current().points)})`);
  await later(50);
  check(current().scores.red > 0, 'holding the point did not score');
  check(dim.getBlock({ x: 16, y: Y, z: 20 }).permutation.getState(`${NS}:owner`) === 1, 'the control point does not show red');
  stopGame();

  // A game ends at its score limit, and is cleared away a little later.
  red.teleport({ x: 10.5, y: Y, z: 40.5 });
  blue.teleport({ x: 14.5, y: Y, z: 40.5 });
  check(startGame({ mode: 'team_deathmatch', minutes: 3, scoreLimit: 1, bots: 0, teams: 2 }, { dimension: dim, location: { x: 16, y: Y, z: 12 } }), 'the last game did not start');
  await until(() => current()?.phase === 'running', 140);
  await until(() => !isDown(blue) && !isProtected(blue), 200);
  check(tag(red, blue) === 'tagged' && current().phase === 'over', 'the game did not end at its score limit');
  await until(() => current() === null, 260);
  check(current() === null, 'the finished game was not cleared away');
  check(!world.scoreboard.getObjective(NS), 'the scoreboard is still up');
  check(dim.getBlock({ x: 16, y: Y, z: 30 }).permutation.getState(`${NS}:charged`) === true, 'the power-up station is not charged');

  console.log(`${LOG} selftest: ${ITEMS.length} items, ${BLOCKS.length} blocks, ${CREATURES.length} creature`);
  console.log(problems.length ? `${LOG} selftest FAIL: ${problems.join('; ')}` : `${LOG} selftest PASS`);
}

export function setupSelfTest() {
  system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id === `${NS}:selftest`) selfTest().catch((e) => console.log(`${LOG} selftest FAIL: ${e} ${e?.stack ?? ''}`));
  });
}
