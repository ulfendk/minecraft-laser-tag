// The game console: use it to set up and start a game (mode, minutes, score to win,
// bots per team, teams), or, while one is on, to stop it.
import { system } from '@minecraft/server';
import { MessageFormData, ModalFormData } from '@minecraft/server-ui';
import { RULES } from './data.js';
import { MODES } from './logic.js';
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

function askToStart(player, block) {
  const minutes = RULES.console.minutes;
  new ModalFormData()
    .title(t('form.title'))
    .dropdown(t('form.mode'), MODES.map((m) => t(`mode.${m}`)), { defaultValueIndex: 0 })
    .dropdown(t('form.minutes'), minutes.map(String), { defaultValueIndex: Math.max(0, minutes.indexOf(RULES.console.startMinutes)) })
    .slider(t('form.score'), 0, 50, { valueStep: 1, defaultValue: 0 })
    .slider(t('form.bots'), 0, RULES.console.botsPerTeam, { valueStep: 1, defaultValue: 0 })
    .slider(t('form.teams'), 2, RULES.teams.length, { valueStep: 1, defaultValue: 2 })
    .submitButton(t('form.start'))
    .show(player)
    .then((r) => {
      if (r.canceled || !r.formValues) return;
      const [mode, minute, scoreLimit, bots, teams] = r.formValues;
      startGame({ mode: MODES[mode], minutes: minutes[minute], scoreLimit, bots, teams }, { dimension: block.dimension, location: block.location }, player);
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
