// The laser bot: a small two-legged robot that plays laser tag on a team. Its
// visor, chest light and antenna glow in the team colour (one texture per team).
// Models are cubes in pixels: y is up, the bot faces -z, +x is its left.
import { botAnims } from './lib/anim.mjs';
import { botMaterials } from './art.mjs';
import { RULES, TEAMS } from './rules.mjs';

export const bot = {
  id: 'laser_bot',
  name: ['Laser Bot', 'Laserrobot'],
  size: [0.7, 1.7],
  health: RULES.bot.health,
  speed: 0.3,
  egg: ['#e8ecf4', '#22e6ff'],
  sounds: { ambient: 'random.click', hurt: 'random.anvil_land', death: 'random.break', step: 'step.stone', pitch: [1.4, 1.7] },
  model: {
    bones: [
      { name: 'root', pivot: [0, 0, 0] },
      { name: 'leg_l', parent: 'root', pivot: [2.5, 8, 0], cubes: [
        { origin: [1, 2, -1.5], size: [3, 6, 3], mat: 'frame' },
        { origin: [0.5, 0, -2.5], size: [4, 2, 5], mat: 'shell' },
      ] },
      { name: 'leg_r', parent: 'root', pivot: [-2.5, 8, 0], cubes: [
        { origin: [-4, 2, -1.5], size: [3, 6, 3], mat: 'frame' },
        { origin: [-4.5, 0, -2.5], size: [4, 2, 5], mat: 'shell' },
      ] },
      { name: 'body', parent: 'root', pivot: [0, 8, 0], cubes: [
        { origin: [-4, 8, -2], size: [8, 2, 4], mat: 'frame' },
        { origin: [-5, 10, -3], size: [10, 7, 6], mat: 'shell' },
        // The chest light (it shows the team) and the battery pack on its back.
        { origin: [-2, 12, -4], size: [4, 3, 1], mat: 'light' },
        { origin: [-3, 11, 3], size: [6, 5, 2], mat: 'frame' },
      ] },
      { name: 'head', parent: 'body', pivot: [0, 17, 0], cubes: [
        { origin: [-3.5, 17, -3.5], size: [7, 6, 7], mat: 'shell' },
        { origin: [-3, 19, -4.5], size: [6, 2, 1], mat: 'visor' },
      ] },
      { name: 'antenna', parent: 'head', pivot: [2, 23, 1], cubes: [
        { origin: [1.5, 23, 0.5], size: [1, 3, 1], mat: 'frame' },
        { origin: [1, 26, 0], size: [2, 2, 2], mat: 'light' },
      ] },
      { name: 'arm_r', parent: 'body', pivot: [-6, 16, 0], cubes: [
        { origin: [-8, 9, -1.5], size: [3, 8, 3], mat: 'shell' },
        // The blaster in its hand, along the arm: it points ahead when the arm is up.
        { origin: [-8.5, 3, -2], size: [4, 6, 4], mat: 'gun' },
        { origin: [-7.5, 1, -1], size: [2, 2, 2], mat: 'light' },
      ] },
      { name: 'arm_l', parent: 'body', pivot: [6, 16, 0], cubes: [
        { origin: [5, 9, -1.5], size: [3, 8, 3], mat: 'shell' },
      ] },
    ],
  },
  // One set of materials (and so one texture) for each team.
  teams: Object.fromEntries(TEAMS.map((t) => [t, botMaterials(t)])),
  materials: botMaterials('red'),
  anims: botAnims(),
};

export const CREATURES = [bot];
