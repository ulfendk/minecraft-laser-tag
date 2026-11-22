# Laser Tag

Laser tag for Minecraft – a **Bedrock add-on** and a **Java Edition mod (Fabric)**. Put on a team vest, grab a blaster and play with your friends, or against laser bots.

- **Four game modes**: Team Deathmatch, Free-for-all, Capture the Flag, and King of the Hill / Domination.
- **A game console** runs each game, with a countdown, scores, a timer and a heat bar.
- **Arena blocks**: flag stands, control points, power-up stations, smoke machines and sirens.
- **Lasers never hurt**: a tag only puts you out for a few seconds.

**Website (English and Danish):** https://ulfendk.github.io/minecraft-laser-tag/ · part of [all our mods](https://ulfendk.github.io/minecraft-index/)

## Features

| Gun | Range | Time between shots | Shots before overheating |
|---|---|---|---|
| Laser Pistol | 24 blocks | 0.25 s | 12 |
| Laser Blaster | 40 blocks | 0.45 s | 8 |
| Laser Rifle (sneak to zoom) | 80 blocks | 1.4 s | 3 |
| Scatter Laser (5 beams) | 12 blocks | 0.9 s | 4 |
| Pulse Grenade (thrown) | 3.5 blocks round where it lands | – | – |

- **Vests** in red, blue, green and yellow: the vest is your team. If you have no vest, you can't fire and can't be tagged.
- **Being tagged**: you are out for 4 s (slowed, can't fire), then you come back on one of your team's spawn pads. You can't be tagged for 3 s after that. Friendly fire is off.
- **Game Console**: use it to choose the mode, minutes, score to win, 2–4 teams, 0–4 bots on each team (say two kids a side with two bots each) and how good the bots are (easy, normal, hard), then start. On Bedrock this is a form that remembers the last game; on Java, a clickable menu in chat. Use it again to stop the game.
  - Every game has a 5 s countdown, team scores on the sidebar, and the time, score and heat above the hotbar.
  - Tags are announced in chat, along with streaks and double, triple and quad tags, plus a last-minute warning.
  - At the end you get the winner, fireworks, everyone's tags, accuracy and captures, and the MVP.
- **Modes**:
  - **Team Deathmatch**: first to 25.
  - **Free-for-all**: first to 15.
  - **Capture the Flag**: 3 captures. You can only capture while your own flag is home. A dropped flag can be returned by touching it, and goes home on its own after 30 s.
  - **King of the Hill**: one control point. With several points it plays as Domination. Each point held scores 1 a second; first to 120.
- **Power-up stations**: rapid fire (no overheating), a shield (takes one hit), speed, and double points. A station recharges in 30 s.
- **Smoke machines**: fill the arena with haze, like a real laser tag arena: 4 s of smoke, then 8 s of rest, all machines on the same beat. Use one to switch it on or off.
- **Sirens**: shoot one with your laser and it wails, the lights go out for everyone within 48 blocks and a strobe flashes for 10 seconds. Then it needs 3 minutes to recharge. Only players' lasers set it off.
- **Laser bots**: they hunt anyone in another team's vest and the other teams' bots. Only a player's hand can hurt them.
- **Building blocks**: neon panels in seven colours, cover crates, black-light floor and a scoreboard screen.
- **Commands**:
  - Bedrock: `/scriptevent lasertag:start [mode] [minutes] [bots] [teams] [skill]`, where bots is one number for every team or one per team (`2,2`), and `/scriptevent lasertag:stop`.
  - Java: `/lasertag start [mode] [minutes] [bots] [teams] [score]`, `/lasertag stop`, `/lasertag menu`, `/lasertag set bots <team> <n>` and `/lasertag set skill easy|normal|hard`.

All numbers are in [`src/rules.mjs`](src/rules.mjs), shared by both editions. The game rules themselves are in [`src/lib/game.mjs`](src/lib/game.mjs), and the Java mod has a port of them in `GameLogic.java`. A game test plays recorded games on Java and checks that it gets the same results as the JavaScript rules.

## Install

- **Bedrock** (Windows, iPad/iPhone, Android): download `LaserTag.mcaddon` from the [latest release](https://github.com/ulfendk/minecraft-laser-tag/releases/latest) and open it, then turn on *Laser Tag* under the world's Behavior Packs.
- **Java** (Minecraft 26.3, Fabric): put `LaserTag-fabric.jar` in your `mods` folder together with [Fabric API](https://modrinth.com/mod/fabric-api) and [GeckoLib](https://modrinth.com/mod/geckolib).

## Development

Node generates everything for both editions from the specs in `src/`: the bot model, textures, animations, entities, blocks, items, recipes, particles and lang files.

```sh
npm ci
npm run all          # build + validate + unit tests + package (dist/*.mcaddon, *.mcpack)
npm run preview      # renders the bot, items and blocks to build/preview/
npm run site         # builds the website into build/site/
npm run test:server  # Bedrock Dedicated Server test: the script selftest plays games with bots (Docker)
cd java && ./gradlew build runGameTest   # Java mod + game tests (after npm run build)
```

| Path | What |
|---|---|
| `src/rules.mjs` | guns, heat, tag times, modes, flags, control points, power-ups, smoke and bots: every number both editions share |
| `src/lib/game.mjs` | the rules of the game: scores, streaks, flags, control points, heat and the end of a game. Copied into the Bedrock scripts as `logic.js` |
| `src/items.mjs`, `src/blocks.mjs`, `src/creatures.mjs` | the items, blocks and laser bot, with names in English and Danish and their recipes |
| `src/art.mjs`, `src/lib/icon.mjs` | item icons, neon block textures, vests and the pack icon, drawn in code |
| `src/i18n.mjs` | in-game and website texts, English and Danish |
| `src/packs/behavior_pack/scripts/` | Bedrock scripts: `game.js` (the game), `guns.js`, `arena.js` (game blocks), `bots.js`, `console.js` (forms), `selftest.js` |
| `java/` | the Fabric mod: `game/` (`Game`, `GameLogic`, `Arena`, `Lasers`, `Commands`), `LaserBot`, the arena blocks, the game tests |
| `tools/` | build, validate, package, preview, site, release notes and the BDS test; `fixtures.mjs` records games for the Java parity test |

## Releases

Bump `version` in `package.json`, add a section to `CHANGELOG.md`, and push a tag `vX.Y.Z`. The release workflow builds and tests both editions and attaches the `.mcaddon`, `.mcpack` and `.jar` files.

## Support

If you enjoy our mods, you can support us on [GitHub Sponsors](https://github.com/sponsors/ulfendk) or [Buy Me a Coffee](https://buymeacoffee.com/ulfendk).

## License

MIT. Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.
