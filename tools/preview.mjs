// Renders the laser bot (from several sides, in each team's colours, walking, firing
// and tagged) into build/preview/, plus build/preview/sheet.png with the bots, every
// item and every block, which is attached to each release.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from './build.mjs';
import { render, sheet } from './render.mjs';
import { blockLooks } from '../src/blocks.mjs';
import { NS } from '../src/lib/constants.mjs';
import { upscale } from '../src/lib/png.mjs';

const OUT = 'build/preview';
const { creatures, items, blocks } = await build({ quiet: true });
await mkdir(OUT, { recursive: true });

const CELL = 192;
const portraits = [];
for (const { creature: c, geo, textures, animations } of Object.values(creatures)) {
  const get = (n) => animations.animations[`animation.${NS}.${c.id}.${n}`];
  const idle = get('idle');
  const views = [
    render(geo.geometry, textures.red, { yaw: 35, anim: idle, time: 0 }),
    render(geo.geometry, textures.red, { yaw: 325, anim: idle, time: 0 }),
    render(geo.geometry, textures.red, { yaw: 90, pitch: 5, anim: idle, time: 0 }),
    render(geo.geometry, textures.blue, { yaw: 35, anim: get('walk'), time: 0.2 }),
    render(geo.geometry, textures.green, { yaw: 35, anim: get('attack'), time: 0.08 }),
    render(geo.geometry, textures.yellow, { yaw: 35, anim: get('down'), time: 0.5 }),
  ];
  await writeFile(join(OUT, `${c.id}.png`), sheet(views, { cols: 3 }));
  for (const t of Object.keys(textures)) portraits.push(render(geo.geometry, textures[t], { yaw: 35, size: CELL, anim: idle, time: 0 }));
}
const icons = items.map((i) => upscale(i.icon, 8));
// Each block as placed (its first look), side and top.
const tiles = blocks.flatMap((b) => {
  const faces = Object.values(blockLooks(b))[0];
  return [upscale(faces.side, 8), ...(faces.top ? [upscale(faces.top, 8)] : [])];
});
await writeFile(join(OUT, 'sheet.png'), sheet([...portraits, ...icons, ...tiles], { cols: 8, cell: CELL }));
console.log(`Wrote previews to ${OUT}/`);
