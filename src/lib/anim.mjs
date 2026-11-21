// Keyframed animations for the laser bot. Everything is plain keyframes (no
// Molang), so GeckoLib on the Java edition reads the same files.
//
// Rotation convention (Bedrock): +x pitches a bone's front (-z) downwards and
// swings a hanging limb backwards.

const r = (n) => Math.round(n * 100) / 100;
const TAU = Math.PI * 2;
const sin = (phase, offset = 0) => Math.sin((phase + offset) * TAU);

/** Sample f(phase in [0,1)) into n keyframes over `length` seconds (looping). */
function cycle(length, n, f) {
  const out = {};
  for (let k = 0; k <= n; k++) out[r((k / n) * length).toFixed(2)] = f((k % n) / n).map(r);
  return out;
}

const loop = (length, bones) => ({ loop: true, animation_length: length, bones });
const once = (length, bones) => ({ animation_length: length, bones });

/** The laser bot: a stiff little two-legged robot that holds its blaster up and kicks back when it fires. */
export function botAnims() {
  const n = 8;
  return {
    idle: loop(3, {
      body: { position: cycle(3, n, (p) => [0, 0.2 * sin(p), 0]) },
      head: { rotation: cycle(3, n, (p) => [0, 10 * sin(p, 0.2), 0]) },
      antenna: { rotation: cycle(3, n, (p) => [6 * sin(p), 0, 4 * sin(p, 0.3)]) },
      arm_r: { rotation: cycle(3, n, (p) => [-80 + 2 * sin(p), 0, 0]) },
      arm_l: { rotation: cycle(3, n, (p) => [-60 + 2 * sin(p, 0.5), 0, 0]) },
    }),
    walk: loop(0.8, {
      leg_l: { rotation: cycle(0.8, n, (p) => [28 * sin(p), 0, 0]) },
      leg_r: { rotation: cycle(0.8, n, (p) => [28 * sin(p, 0.5), 0, 0]) },
      body: { rotation: cycle(0.8, n, (p) => [0, 0, 3 * sin(p)]), position: cycle(0.8, n, (p) => [0, 0.4 * Math.abs(sin(p)), 0]) },
      arm_r: { rotation: cycle(0.8, n, (p) => [-80 + 4 * sin(p), 0, 0]) },
      arm_l: { rotation: cycle(0.8, n, (p) => [-60 + 4 * sin(p, 0.5), 0, 0]) },
      antenna: { rotation: cycle(0.8, n, (p) => [-10 + 8 * sin(p), 0, 0]) },
    }),
    // A shot: the blaster kicks up and back.
    attack: once(0.4, {
      arm_r: { rotation: { '0.0': [-80, 0, 0], '0.08': [-105, 0, 0], '0.4': [-80, 0, 0] } },
      arm_l: { rotation: { '0.0': [-60, 0, 0], '0.08': [-80, 0, 0], '0.4': [-60, 0, 0] } },
      body: { rotation: { '0.0': [0, 0, 0], '0.08': [-4, 0, 0], '0.4': [0, 0, 0] } },
    }),
    // Tagged: it slumps forward with its arms down.
    down: loop(1, {
      body: { rotation: { '0.0': [22, 0, 0], '1.0': [22, 0, 0] } },
      head: { rotation: { '0.0': [25, 0, 0], '1.0': [25, 0, 0] } },
      arm_r: { rotation: { '0.0': [0, 0, 8], '1.0': [0, 0, 8] } },
      arm_l: { rotation: { '0.0': [0, 0, -8], '1.0': [0, 0, -8] } },
    }),
  };
}

/** Wrap one creature's animations into a Bedrock animation file. */
export function animationFile(ns, id, anims) {
  return { format_version: '1.8.0', animations: Object.fromEntries(Object.entries(anims).map(([name, a]) => [`animation.${ns}.${id}.${name}`, a])) };
}
