# Changelog

## [0.6.0] - 2026-11-22

### Added
- Names are hidden during a game, so the name above your head no longer gives away where you are. They come back when the game ends. A tagged player still shows the TAGGED sign.
- A new console option, After a tag: Back to base or Stay where you are. Back to base sends a tagged player to their team's spawn pad once the stun is over. Without a pad, their base is where they stood when the game started.

### Fixed
- Spawn pads are remembered with the world, so a base far away still works after the world has been closed and opened again.

## [0.5.1] - 2026-11-22

### Fixed
- Bedrock: the laser guns fire again. Since 0.4.1 the check that keeps tagged players from throwing things made every shot look like it came too soon after the last one, so the guns did nothing; the pulse grenade still worked. The time between shots is now kept by the add-on itself.

## [0.5.0] - 2026-11-22

### Added
- Siren: shoot it with your laser and it wails, the lights go out for everyone within 48 blocks and a strobe flashes for 10 seconds. Then its lamp goes dark and it needs 3 minutes to recharge. Only a player's laser sets it off, not the bots'. Crafted from red stained glass, glowstone, redstone, a bell and iron.

## [0.4.1] - 2026-11-22

### Fixed
- A tagged player is now completely frozen: they can't throw, fire, eat or use anything, or use or place blocks, until they are back. Anything they drop goes straight back into their inventory.

## [0.4.0] - 2026-11-22

### Added
- Choose the laser bots for each team on the game console, for example two kids a side with two bots on each team, or bots only on the smaller team. On Bedrock the form has a slider for each team; on Java the chat menu has a row of buttons for each team playing.
- Bot skill: easy, normal or hard. Easy bots shoot less often and miss more; hard bots shoot at every chance and rarely miss.
- The Bedrock console remembers the last game's settings, so the next round is just Start.
- Commands: `/lasertag set bots <team> <n>` and `/lasertag set skill <skill>` on Java. On Bedrock, `/scriptevent lasertag:start` takes bots per team (`2,2` for red and blue) and a skill.

## [0.3.0] - 2026-11-21

### Added
- Smoke Machine: fills the arena with haze, like a real laser tag arena. It pumps smoke for 4 seconds, rests for 8, and every machine keeps the same beat. Use it to switch it on or off. Crafted from iron, iron bars, redstone and a campfire.
- Sponsor links (GitHub Sponsors and Buy Me a Coffee) on the website and in the README.

## [0.2.0] - 2026-11-21

### Changed
- A tag is now much easier to see: the tagged player or bot is stunned for 10 seconds (up from 4), frozen to the spot, with a red TAGGED sign above its head that counts down and sparks flying off the vest. On Java the tagged one also glows through walls.
- Laser bots on Bedrock always show their name above their head.

## [0.1.0] - 2026-11-21

### Added
- Laser guns that fire hitscan beams in your team's colour: the Laser Pistol, Laser Blaster, Laser Rifle (sneak to zoom) and Scatter Laser (five beams). There is no ammunition: guns heat up and must cool down when they overheat. Pulse Grenades tag every enemy vest where they land.
- Laser vests in red, blue, green and yellow. The vest you wear is your team. A tag puts you out for 4 seconds, then you are back on a spawn pad, protected for 3 seconds. Lasers never hurt anyone.
- A Game Console that runs a game: pick the mode, time, score to win, number of teams and bots per team. There is a 5-second countdown, scores on the sidebar, time and heat above the hotbar, and a kill feed. Streaks ("on a roll", "unstoppable", "legendary") and double, triple and quad tags are called out. At the end come the winner, fireworks, everyone's stats and the MVP. A running game is saved with the world.
- Four game modes: Team Deathmatch, Free-for-all, Capture the Flag (flag stands, dropped flags, return home) and King of the Hill / Domination (control points that change colour).
- Arena blocks: spawn pads and flag stands for each team, control points, power-up stations (rapid fire, shield, speed, double points), neon panels in seven colours, cover crates, black-light floor and a scoreboard screen.
- Laser bots that play on a team, hunt the other teams and fire with a reaction delay and the odd miss. The console brings up to 4 onto every team.
- Commands for game hosts: `/scriptevent lasertag:start|stop` on Bedrock, and `/lasertag start|stop|menu` on Java.
- Bedrock add-on and Fabric mod for Minecraft 26.3, and a website in English and Danish.
