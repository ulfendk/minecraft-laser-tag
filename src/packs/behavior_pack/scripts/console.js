// The game console: use it to set up and start a game (mode, minutes, score to win,
// teams, how many laser bots on each team and how good they are), or, while one is on,
// to stop it. It remembers what was picked last, so the next round is one click.
import { system, world } from '@minecraft/server';
import { MessageFormData, ModalFormData } from '@minecraft/server-ui';
import { RULES } from './data.js';
import { botSkill, MODES } from './logic.js';
import { current, startGame, stopGame } from './game.js';
import { NS } from './util.js';

const t = (key) => ({ translate: `${NS}.${key}` });

function askToStop(player) {
  new MessageFormData()
    .title(t('form.stop_title'))
    .body(t('form.stop_body'))
    .button1(t('form.stop'))
    .button2(t('form.keep'))
    .show(player)
    .then((r) => {
      if (!r.canceled && r.selection === 0) stopGame();
    })
    .catch(() => {});
}

const LAST = `${NS}:console`;
const SKILLS = Object.keys(RULES.bot.skills);

/** What was picked on a console last time (or the defaults). */
function lastChoice() {
  let c = {};
  try {
    c = JSON.parse(world.getDynamicProperty(LAST) ?? '{}');
  } catch {}
  return {
    mode: MODES.includes(c.mode) ? c.mode : MODES[0],
    minutes: RULES.console.minutes.includes(c.minutes) ? c.minutes : RULES.console.startMinutes,
    scoreLimit: Number(c.scoreLimit) || 0,
    teams: Math.max(2, Math.min(RULES.teams.length, Number(c.teams) || 2)),
    bots: typeof c.bots === 'object' && c.bots ? c.bots : {},
    skill: botSkill(c.skill),
  };
}

function askToStart(player, block) {
  const minutes = RULES.console.minutes;
  const last = lastChoice();
  const form = new ModalFormData()
    .title(t('form.title'))
    .dropdown(t('form.mode'), MODES.map((m) => t(`mode.${m}`)), { defaultValueIndex: MODES.indexOf(last.mode) })
    .dropdown(t('form.minutes'), minutes.map(String), { defaultValueIndex: minutes.indexOf(last.minutes) })
    .slider(t('form.score'), 0, 50, { valueStep: 1, defaultValue: Math.min(50, last.scoreLimit) })
    .slider(t('form.teams'), 2, RULES.teams.length, { valueStep: 1, defaultValue: last.teams });
  // A slider for each team's bots; the teams after the number playing don't count.
  for (const team of RULES.teams) {
    form.slider({ translate: `${NS}.form.bots_team`, with: { rawtext: [{ translate: `${NS}.team.${team}` }] } }, 0, RULES.console.botsPerTeam,
      { valueStep: 1, defaultValue: Math.min(RULES.console.botsPerTeam, Number(last.bots[team]) || 0) });
  }
  form
    .dropdown(t('form.skill'), SKILLS.map((k) => t(`skill.${k}`)), { defaultValueIndex: SKILLS.indexOf(last.skill) })
    .submitButton(t('form.start'))
    .show(player)
    .then((r) => {
      if (r.canceled || !r.formValues) return;
      const [mode, minute, scoreLimit, teams, ...rest] = r.formValues;
      const skill = SKILLS[rest[RULES.teams.length]];
      // Kept for every team (the game leaves out the teams not playing), so they come back next time.
      const bots = Object.fromEntries(RULES.teams.map((team, i) => [team, rest[i]]));
      const settings = { mode: MODES[mode], minutes: minutes[minute], scoreLimit, teams, bots, skill };
      world.setDynamicProperty(LAST, JSON.stringify(settings));
      startGame(settings, { dimension: block.dimension, location: block.location }, player);
    })
    .catch(() => {});
}

export function openConsole(player, block) {
  const game = current();
  if (game && game.phase !== 'over') askToStop(player);
  else askToStart(player, block);
}

export function registerConsole(registry) {
  registry.registerCustomComponent(`${NS}:console`, {
    onPlayerInteract: ({ player, block }) => {
      if (player) system.run(() => openConsole(player, block));
    },
  });
}
