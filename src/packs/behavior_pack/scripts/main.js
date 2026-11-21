import { system, world } from '@minecraft/server';
import { registerArena } from './arena.js';
import { setupBots } from './bots.js';
import { registerConsole } from './console.js';
import { setupGame } from './game.js';
import { setupGuns } from './guns.js';
import { setupSelfTest } from './selftest.js';
import { LOG } from './util.js';

system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
  registerConsole(blockComponentRegistry);
  registerArena(blockComponentRegistry);
});

world.afterEvents.worldLoad.subscribe(() => {
  setupGame();
  setupGuns();
  setupBots();
  setupSelfTest();
  console.log(`${LOG} loaded`);
});
