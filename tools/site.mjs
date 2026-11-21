// Builds the GitHub Pages site into build/site/.
// The latest release is looked up in the browser (GitHub API), with the version
// from package.json as the fallback, so the page stays current between deploys.
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from './build.mjs';
import { render } from './render.mjs';
import { blockLooks } from '../src/blocks.mjs';
import { LANGUAGES, STRINGS } from '../src/i18n.mjs';
import { RULES } from '../src/rules.mjs';
import { NS } from '../src/lib/constants.mjs';
import { upscale } from '../src/lib/png.mjs';

const OUT = 'build/site';
const RP = 'build/resource_pack';
const repo = process.env.GITHUB_REPOSITORY ?? process.env.SITE_REPO ?? 'ulfendk/minecraft-laser-tag';
const [owner, name] = repo.split('/');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const { creatures, items, blocks, version } = await build({ quiet: true });
for (const dir of ['bots', 'items', 'blocks']) await mkdir(join(OUT, 'img', dir), { recursive: true });

for (const { creature: c, geo, textures, animations } of Object.values(creatures)) {
  const idle = animations.animations[`animation.${NS}.${c.id}.idle`];
  for (const [team, png] of Object.entries(textures)) {
    await writeFile(join(OUT, 'img', 'bots', `${team}.png`), render(geo.geometry, png, { yaw: 35, size: 320, anim: idle, time: 0 }));
  }
}
for (const item of items) await writeFile(join(OUT, 'img', 'items', `${item.id}.png`), upscale(item.icon, 4));
// Each block as placed (its first look).
for (const b of blocks) await writeFile(join(OUT, 'img', 'blocks', `${b.id}.png`), upscale(Object.values(blockLooks(b))[0].side, 4));
await copyFile(join(RP, 'pack_icon.png'), join(OUT, 'img', 'icon.png'));
await copyFile(join(RP, 'pack_icon.png'), join(OUT, 'favicon.png'));

const releases = `https://github.com/${repo}/releases`;
const dl = (file) => `${releases}/latest/download/${file}`;

const ROOT_URL = `https://${owner}.github.io/${name}/`;
// The index of all our mods, which every mod's site links back to.
const INDEX_URL = `https://${owner}.github.io/minecraft-index/`;

/** Builds the page for one language. Pages for other languages live in a subfolder. */
function page(lang) {
  const L = LANGUAGES[lang];
  const t = STRINGS[lang];
  const up = L.dir ? '../' : '';
  const link = (href) => (text) => `<a href="${href}">${esc(text)}</a>`;
  const home = `${INDEX_URL}${L.dir ? L.dir + '/' : ''}`;
  const i = lang === 'da' ? 1 : 0;
  const itemName = (id) => items.find((it) => it.id === id).name[i];
  const card = (title, text) => `      <div class="feature"><h3>${esc(title)}</h3><p>${text}</p></div>`;

  const gunStats = (id) => {
    if (id === RULES.grenade.id) return [[t.statRadius, t.blocks_(RULES.grenade.radius)]];
    const g = RULES.guns[id];
    const rate = Math.round((10 / g.cooldown)) / 10;
    return [[t.statRange, t.blocks_(g.range)], [t.statRate, String(rate).replace('.', lang === 'da' ? ',' : '.')], [t.statHeat, String(Math.ceil(RULES.heat.max / g.heat))]];
  };
  const gunHtml = Object.entries(t.guns).map(([id, text]) => `
      <article class="card gun">
        <div class="item-art"><img src="${up}img/items/${id}.png" alt="" width="64" height="64"></div>
        <div class="card-body">
          <h3>${esc(itemName(id))}</h3>
          <p>${esc(text)}</p>
          <dl class="stats">${gunStats(id).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        </div>
      </article>`).join('');

  const modeNames = { team_deathmatch: ['Team Deathmatch', 'Hold mod hold'], free_for_all: ['Free-for-all', 'Alle mod alle'], capture_the_flag: ['Capture the Flag', 'Erobr flaget'], king_of_the_hill: ['King of the Hill', 'Bakkens konge'] };
  const modeIcons = { team_deathmatch: 'blocks/neon_panel_red', free_for_all: 'blocks/neon_panel_yellow', capture_the_flag: 'blocks/flag_stand_blue', king_of_the_hill: 'blocks/control_point' };
  const modeHtml = Object.entries(t.modes).map(([id, text]) => `
      <article class="card mode">
        <div class="item-art"><img src="${up}img/${modeIcons[id]}.png" alt="" width="64" height="64"></div>
        <div class="card-body"><h3>${esc(modeNames[id][i])}</h3><p>${esc(text)}</p></div>
      </article>`).join('');

  const powerHtml = Object.entries(t.powerups).map(([id, text]) => card(t.powerNames[id], esc(text))).join('\n');

  const botHtml = Object.keys(RULES.colours).map((team) => `
      <div class="bot"><img src="${up}img/bots/${team}.png" alt="" loading="lazy" width="320" height="320"></div>`).join('');

  const itemHtml = [
    ...items.map((it) => `
        <li><img src="${up}img/items/${it.id}.png" alt="" width="48" height="48"><span>${esc(it.name[i])}</span></li>`),
    ...blocks.map((b) => `
        <li><img src="${up}img/blocks/${b.id}.png" alt="" width="48" height="48"><span>${esc(b.name[i])}</span></li>`),
  ].join('');

  const switcher = Object.entries(LANGUAGES)
    .filter(([code]) => code !== lang)
    .map(([code, other]) => `<a class="lang" href="${up}${other.dir ? other.dir + '/' : ''}" hreflang="${other.htmlLang}" lang="${other.htmlLang}">${esc(other.label)}</a>`)
    .join('');
  const alternates = Object.values(LANGUAGES)
    .map((other) => `<link rel="alternate" hreflang="${other.htmlLang}" href="${ROOT_URL}${other.dir ? other.dir + '/' : ''}">`)
    .join('\n');

const html = `<!doctype html>
<html lang="${L.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.description)}">
${alternates}
<link rel="icon" href="${up}favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #f1f2fa; --surface: #ffffff; --ink: #141629; --muted: #555a78; --line: #dcdff0;
  --accent: #b0149a; --accent-ink: #fff; --accent-2: #0a7fa0; --chip: #e9eaf7; --hero-from: #0b0f2a; --hero-to: #5a1a8a;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #090b1c; --surface: #131632; --ink: #eef0ff; --muted: #a3a8cc; --line: #262a52;
    --accent: #ff4fe0; --accent-ink: #120414; --accent-2: #22e6ff; --chip: #1c2046; --hero-from: #05061a; --hero-to: #3a0f5e;
  }
}
:root[data-theme="dark"] {
  --bg: #090b1c; --surface: #131632; --ink: #eef0ff; --muted: #a3a8cc; --line: #262a52;
  --accent: #ff4fe0; --accent-ink: #120414; --accent-2: #22e6ff; --chip: #1c2046; --hero-from: #05061a; --hero-to: #3a0f5e;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
img { image-rendering: pixelated; max-width: 100%; }
a { color: var(--accent); }
h1, h2, h3 { font-family: "Pixelify Sans", system-ui, sans-serif; font-weight: 500; line-height: 1.15; letter-spacing: .01em; }
.wrap { max-width: 1100px; margin: 0 auto; padding: 0 16px; }
header.hero { color: #fff8ec; background: linear-gradient(180deg, var(--hero-from), var(--hero-to)); padding: 48px 0 56px; }
.hero .wrap { display: grid; grid-template-columns: auto 1fr; gap: 32px; align-items: center; }
.hero img.icon { width: 160px; height: 160px; border-radius: 12px; box-shadow: 0 8px 30px rgb(0 0 0 / .35); }
.hero h1 { font-size: clamp(2.2rem, 6vw, 3.6rem); margin: 0 0 8px; }
.hero p { margin: 0 0 20px; font-size: 1.15rem; max-width: 52ch; color: #e6e2ff; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 10px; font-weight: 700; text-decoration: none; background: #ffd36b; color: #2b1d0e; box-shadow: 0 3px 0 #b8862c; }
.btn:hover { transform: translateY(-1px); }
.btn.ghost { background: transparent; color: #fff3df; box-shadow: inset 0 0 0 2px rgb(255 243 223 / .6); }
.version { font-size: .95rem; color: #e6e2ff; }
.which { margin: 16px 0 6px; background: rgb(0 0 0 / .22); border: 1px solid rgb(255 243 223 / .35); border-radius: 10px; padding: 10px 14px; max-width: 62ch; font-size: .95rem; color: #fff3df; }
.which b { color: #fff; }
.hero .langs { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: -28px; margin-bottom: 8px; }
.hero .langs a { color: #fff3df; font-weight: 600; text-decoration: none; padding: 4px 12px; border-radius: 999px; box-shadow: inset 0 0 0 1.5px rgb(255 243 223 / .55); font-size: .9rem; }
.hero .langs a:hover { background: rgb(255 255 255 / .12); }
.version strong { color: #fff; }
main section { padding: 48px 0 8px; }
h2 { font-size: 2rem; margin: 0 0 8px; }
.lede { color: var(--muted); margin: 0 0 24px; max-width: 70ch; }
.steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; padding: 0; list-style: none; counter-reset: s; }
.steps li { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px 16px 16px 56px; position: relative; }
.steps li::before { counter-increment: s; content: counter(s); position: absolute; left: 16px; top: 14px; width: 28px; height: 28px; border-radius: 50%; background: var(--accent); color: var(--accent-ink); display: grid; place-items: center; font-weight: 700; }
.note { color: var(--muted); font-size: .92rem; }
h3.edition { margin: 18px 0 10px; font: 700 1.15rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
.bots { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
.bot { aspect-ratio: 1; border-radius: 14px; overflow: hidden; background: linear-gradient(180deg, #0b0f2a 0, #2a0f4a 70%, #ff2bd6 70%, #22e6ff 100%); display: grid; place-items: center; }
.bot img { width: 100%; height: auto; }
.item-art { display: grid; place-items: center; padding: 22px 0; background: linear-gradient(180deg, #0b0f2a, #2a0f4a); }
.item-art img { width: 96px; height: 96px; }
.stats { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; }
.stats div { background: var(--chip); border-radius: 8px; padding: 4px 10px; }
.stats dt { font-size: .75rem; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.stats dd { margin: 0; font-weight: 700; }
.lede + .features { margin-top: 0; }
.card-body { padding: 14px 16px 16px; }
.card h3 { margin: 0; font: 700 1.3rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; }
.card p { margin: 0 0 10px; }
.features { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.feature { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px; }
.feature h3 { margin: 0 0 6px; font: 700 1.1rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; }
.feature p { margin: 0; color: var(--muted); }
.feature em { font-style: normal; font-family: ui-monospace, monospace; font-size: .92em; }
.items { display: flex; flex-wrap: wrap; gap: 12px; list-style: none; padding: 0; }
.items li { display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 8px 14px 8px 8px; }
footer { margin-top: 56px; padding: 28px 0 40px; border-top: 1px solid var(--line); color: var(--muted); font-size: .9rem; }
@media (max-width: 640px) {
  .hero .wrap { grid-template-columns: 1fr; text-align: center; justify-items: center; }
  .hero img.icon { width: 112px; height: 112px; }
  .actions { justify-content: center; }
}
</style>
</head>
<body>
<header class="hero">
  <nav class="langs wrap"><a class="home" href="${home}">← ${esc(t.allMods)}</a><span>${switcher}</span></nav>
  <div class="wrap">
    <img class="icon" src="${up}img/icon.png" alt="" width="160" height="160">
    <div>
      <h1>${esc(t.name)}</h1>
      <p>${esc(t.tagline)}</p>
      <div class="actions">
        <a class="btn" id="download" href="${dl(`LaserTag.mcaddon`)}">⬇ ${esc(t.download)}</a>
        <a class="btn" href="${dl('LaserTag-fabric.jar')}">⬇ ${esc(t.downloadJava)}</a>
        <a class="btn ghost" href="${releases}">${esc(t.allVersions)}</a>
      </div>
      <p class="which">${t.which}</p>
      <p class="version" id="version">${esc(t.latestVersion)}: <strong>${esc(version)}</strong></p>
    </div>
  </div>
</header>
<main class="wrap">
  <section id="install">
    <h2>${esc(t.install)}</h2>
    <h3 class="edition">${esc(t.bedrockTitle)}</h3>
    <ol class="steps">
${t.steps(`<a href="${dl('LaserTag.mcaddon')}">LaserTag.mcaddon</a>`).map((step) => `      <li>${step}</li>`).join('\n')}
    </ol>
    <p class="note">${t.serverNote(link(dl('LaserTag_BP.mcpack')), link(dl('LaserTag_RP.mcpack')))}</p>
    <h3 class="edition">${esc(t.javaTitle)}</h3>
    <ol class="steps">
${t.javaSteps(
    `<a href="${dl('LaserTag-fabric.jar')}">LaserTag-fabric.jar</a>`,
    '<a href="https://fabricmc.net/use/installer/">Fabric Loader</a>',
    '<a href="https://modrinth.com/mod/fabric-api">Fabric API</a>',
    '<a href="https://modrinth.com/mod/geckolib">GeckoLib</a>',
  ).map((step) => `      <li>${step}</li>`).join('\n')}
    </ol>
    <h3 class="edition">${esc(t.upgradeTitle)}</h3>
    <ol class="steps">
${t.upgradeSteps.map((step) => `      <li>${step}</li>`).join('\n')}
    </ol>
    <p class="note">${t.upgradeServer}</p>
    <p>${t.upgradeJava}</p>
  </section>

  <section id="how">
    <h2>${esc(t.howTitle)}</h2>
    <div class="features">
${t.how.map(([title, text]) => card(title, esc(text))).join('\n')}
    </div>
  </section>

  <section id="modes">
    <h2>${esc(t.modesTitle)}</h2>
    <div class="grid">${modeHtml}
    </div>
  </section>

  <section id="lasers">
    <h2>${esc(t.lasersTitle)}</h2>
    <p class="lede">${esc(t.lasersLede)}</p>
    <div class="grid">${gunHtml}
    </div>
  </section>

  <section id="vests">
    <h2>${esc(t.vestsTitle)}</h2>
    <div class="features">
${t.vests.map(([title, text]) => card(title, esc(text))).join('\n')}
    </div>
  </section>

  <section id="arena">
    <h2>${esc(t.arenaTitle)}</h2>
    <div class="features">
${t.arena.map(([title, text]) => card(title, esc(text))).join('\n')}
    </div>
  </section>

  <section id="powerups">
    <h2>${esc(t.powerTitle)}</h2>
    <div class="features">
${powerHtml}
    </div>
  </section>

  <section id="bots">
    <h2>${esc(t.botsTitle)}</h2>
    <p class="lede">${esc(t.bots)}</p>
    <div class="bots">${botHtml}
    </div>
  </section>

  <section id="tips">
    <h2>${esc(t.tipsTitle)}</h2>
    <div class="features">
${t.tips.map(([title, text]) => card(title, text)).join('\n')}
    </div>
  </section>

  <section id="items">
    <h2>${esc(t.itemsTitle)}</h2>
    <ul class="items">${itemHtml}
    </ul>
  </section>
</main>
<footer>
  <div class="wrap">
    <p>${t.footerSource(link(`https://github.com/${repo}`), link(`https://github.com/${repo}/issues`))}</p>
    <p>${esc(t.footerLegal)}</p>
    <p>${link(home)(`← ${t.allMods}`)}</p>
  </div>
</footer>
<script>
// Latest release from GitHub
fetch('https://api.github.com/repos/${owner}/${name}/releases/latest')
  .then((r) => (r.ok ? r.json() : null))
  .then((rel) => {
    if (!rel || !rel.tag_name) return;
    const date = new Date(rel.published_at).toLocaleDateString('${L.dateLocale}', { year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('version').innerHTML = '${t.latestVersion}: <strong>' + rel.tag_name.replace(/^v/, '') + '</strong> · ${t.released} ' + date;
  })
  .catch(() => {});

// Reload when a new release has been published. The site is redeployed with every release
// and writes version.json; compare it with the version this page was built with.
const PAGE_VERSION = '${version}';
let reloading = false;
function checkForUpdate() {
  if (reloading || document.hidden) return;
  fetch('${up}version.json?t=' + Date.now(), { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((v) => {
      if (!v || !v.version || v.version === PAGE_VERSION) return;
      // Reload once per new version: if the cached page is still the old one, don't loop.
      let tried = null;
      try { tried = sessionStorage.getItem('lasertag-reloaded-for'); } catch {}
      if (tried === v.version) return;
      try { sessionStorage.setItem('lasertag-reloaded-for', v.version); } catch {}
      reloading = true;
      location.reload();
    })
    .catch(() => {});
}
setInterval(checkForUpdate, 10 * 60 * 1000);
checkForUpdate();
document.addEventListener('visibilitychange', checkForUpdate);
</script>
</body>
</html>
`;
  return html;
}

for (const [lang, L] of Object.entries(LANGUAGES)) {
  const dir = join(OUT, L.dir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), page(lang));
}
await writeFile(join(OUT, '.nojekyll'), '');
await writeFile(join(OUT, 'version.json'), JSON.stringify({ version }) + '\n');
console.log(`Site written to ${OUT}/ (${Object.keys(LANGUAGES).join(' + ')}, repo ${repo})`);
