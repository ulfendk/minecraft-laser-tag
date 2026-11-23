// Test only (tools/bds-player.sh): simulated players do what kids do with the add-on –
// put on a vest, aim a laser gun at someone on another team and click – and the log
// says whether it worked. Needs the Beta APIs experiment, so it is not in the add-on.
import { EquipmentSlot, GameMode, ItemStack, system, world } from '@minecraft/server';
import * as gametest from '@minecraft/server-gametest';

const LOG = '[Player test]';
const DOWN = 'lasertag_down';
const later = (ticks) => new Promise((resolve) => system.runTimeout(resolve, ticks));

function player(name, x, z, team, mode = GameMode.Survival, vest = true) {
  const dimension = world.getDimension('overworld');
  const p = gametest.spawnSimulatedPlayer({ dimension, x, y: -60, z }, name, mode);
  if (vest) p.getComponent('minecraft:equippable').setEquipment(EquipmentSlot.Chest, new ItemStack(`lasertag:vest_${team}`));
  return p;
}

/** One shot: `shooter` aims `gun` at a blue target `gap` blocks away and clicks (twice for the sniper: scope, fire). */
async function shot(name, { gun = 'laser_blaster', gap = 6, wall = false, mode = GameMode.Survival, z = 20.5, vest = true } = {}) {
  const dimension = world.getDimension('overworld');
  const shooter = player(`S ${name}`, 4.5, z, 'red', mode, vest);
  const target = player(`T ${name}`, 4.5 + gap, z, 'blue');
  if (wall) for (let y = -60; y < -57; y++) for (let dz = -2; dz <= 2; dz++) dimension.getBlock({ x: Math.floor(4.5 + gap) + 1, y, z: Math.floor(z) + dz })?.setType('minecraft:stone');
  await later(20);
  shooter.getComponent('minecraft:inventory').container.setItem(0, new ItemStack(`lasertag:${gun}`));
  shooter.selectedSlotIndex = 0;
  shooter.lookAtEntity(target);
  await later(5);
  let used = shooter.useItemInSlot(0);
  if (gun === 'laser_sniper') {
    await later(10);
    shooter.lookAtEntity(target);
    used = shooter.useItemInSlot(0) && used;
  }
  await later(10);
  const ok = target.hasTag(DOWN);
  console.log(`${LOG} ${name}: used ${used}, target tagged ${ok}`);
  shooter.disconnect();
  target.disconnect();
  await later(20);
  return ok;
}

async function run() {
  if (typeof gametest.spawnSimulatedPlayer !== 'function') throw new Error(`no spawnSimulatedPlayer; the module has ${Object.keys(gametest).join(', ')}`);
  const results = [];
  for (const gun of ['laser_pistol', 'laser_blaster', 'laser_rifle', 'scatter_laser', 'laser_sniper', 'spread_cannon']) results.push(await shot(gun, { gun }));
  // The sniper reaches right across a big arena.
  results.push(await shot('sniper far', { gun: 'laser_sniper', gap: 90, z: 44.5 }));
  results.push(await shot('close up', { gap: 2, z: 24.5 }));
  results.push(await shot('wall behind', { gap: 3, wall: true, z: 28.5 }));
  results.push(await shot('creative', { mode: GameMode.Creative, z: 32.5 }));
  // Without a vest a gun does nothing (and says so).
  results.push(!(await shot('no vest', { z: 36.5, vest: false })));
  // Names are hidden while a game is on, and come back after.
  const kid = player('Kid', 4.5, 40.5, 'red');
  await later(20);
  const overworld = world.getDimension('overworld');
  overworld.runCommand('scriptevent lasertag:start team_deathmatch 3 0 2');
  await later(30);
  const during = kid.nameTag;
  overworld.runCommand('scriptevent lasertag:stop');
  await later(30);
  const after = kid.nameTag;
  const names = during === '' && after === 'Kid';
  console.log(`${LOG} names: during the game ${JSON.stringify(during)}, after ${JSON.stringify(after)}`);
  results.push(names);
  kid.disconnect();
  console.log(`${LOG} ${results.every(Boolean) ? 'PASS' : 'FAIL'}`);
}

system.afterEvents.scriptEventReceive.subscribe((e) => {
  if (e.id !== 'lasertag:playertest') return;
  run().catch((err) => console.log(`${LOG} FAIL ${err}`));
});
