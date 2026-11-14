const clamp = (t) => Math.min(1, Math.max(0, t));
const smooth = (t) => { const v = clamp(t); return v * v * (3 - 2 * v); };
// Share of a suit <-> rocket morph spent crumpling; the rest unfolds the other sticker.
const CRUMPLE = 0.42;
const ROCKET = { face: 1, t: 1, opening: true };
// The exit after the last stop, as shares of config.exitVh: the camera flies on over the last planet,
// the rocket accelerates out through the top edge (gone by EXIT_CLIMB), and the phone leaves it on the way up.
const EXIT_FLY = 0.6;
const EXIT_CLIMB = 0.5;
const PHONE_DROP = 0.3;
const EXIT_PASS = 0.45; // journey past the last stop at which career-universe.js hides its globe
const exitTravel = (exit) => Math.sin(Math.PI * clamp(exit / EXIT_FLY));
const climb = (exit) => 0.9 * (exit / EXIT_CLIMB) ** 2;

// paper: face 0 = space suit, 1 = rocket; t runs 0 -> 1 through one phase; opening = ball -> flat.
function morph(m, from, to) {
  if (m <= 0) return { face: from, t: 1, opening: true };
  if (m < CRUMPLE) return { face: from, t: m / CRUMPLE, opening: false };
  return { face: to, t: (m - CRUMPLE) / (1 - CRUMPLE), opening: true };
}

export function careerDistance(config, count) {
  return config.transitionVh + count * config.holdVh + (count - 1) * config.jumpVh + config.exitVh;
}

export function careerStopProgress(index, config, count) {
  return (config.transitionVh + index * (config.holdVh + config.jumpVh) + config.holdVh / 2) / careerDistance(config, count);
}

// Holds are real scroll distance: stopping the wheel always stops the flight, in both directions.
// Inside a hold the arriving rocket crumples into the suit, then before leaving the suit crumples into the rocket.
// The last hold ends the same way; exit then runs 0 -> 1 while the rocket flies on and drops the phone.
export function careerFrame(progress, config, count) {
  const distance = clamp(progress) * careerDistance(config, count);
  const transition = clamp(distance / config.transitionVh);
  const route = Math.max(0, distance - config.transitionVh);
  const leg = Math.min(count - 1, Math.floor(route / (config.holdVh + config.jumpVh)));
  const local = route - leg * (config.holdVh + config.jumpVh);
  const jump = leg < count - 1 ? clamp((local - config.holdVh) / config.jumpVh) : 0;
  const exit = leg < count - 1 ? 0 : clamp((local - config.holdVh) / config.exitVh);
  const depart = clamp((local - config.holdVh + config.morphVh) / config.morphVh);
  const arrive = leg > 0 ? clamp(local / config.morphVh) : 1;
  const paper = jump > 0 || exit > 0 ? ROCKET : depart > 0 ? morph(depart, 0, 1) : morph(arrive, 1, 0);
  return {
    transition,
    journey: leg + smooth(jump) + EXIT_PASS * smooth(exit / EXIT_FLY),
    travel: exit > 0 ? exitTravel(exit) : Math.sin(Math.PI * jump),
    paper,
    exit,
  };
}

// A docked globe is centred on the bottom edge, so its top is this far down the viewport;
// career-journey.js hands it to career-universe.js to size the globes, and the sticker stands on it.
export const PLANET_TOP = 0.7;
// The sticker stands centred on the docked planet; the rocket turns its nose up the route.
// x/y are viewport fractions of its centre; scale multiplies PAPER_HEIGHT (viewport heights).
export const PAPER_HEIGHT = 0.205;
const ROCKET_TURN = -0.79; // rocket.webp points up-right at about 45 degrees
export function careerPose({ journey, travel, paper, exit }, reveal = 1) {
  const bend = Math.sin(journey * Math.PI);
  // The turn follows the morph, so the sticker swap hidden in the paper ball never jumps: 0 suit, 1 rocket.
  const open = paper.opening ? paper.t : 1 - paper.t;
  const lean = paper.face ? (1 + open) / 2 : (1 - open) / 2;
  const scale = 1 - travel * 0.12;
  // The globe grows from its centre on the bottom edge while it is revealed; the feet ride its top.
  const feet = 1 - (1 - PLANET_TOP) * reveal;
  return {
    x: 0.5,
    y: feet - PAPER_HEIGHT * scale * reveal / 2 - travel * 0.05 - climb(exit),
    scale,
    angle: lean * ROCKET_TURN - bend * travel * 0.04,
  };
}

// The phone leaves the climbing rocket small and tilted, falls to the middle of the stage and keeps
// growing to its resting size. x/y are viewport fractions of its centre; scale 1 is the resting size.
// Resting height in viewport heights: centred, it clears the 64px top bar and the 72px footer from 600px up.
export const PHONE_HEIGHT = 0.76;
const PHONE_Y = 0.5;
const DROP_Y = careerPose({ journey: 0, travel: exitTravel(PHONE_DROP), paper: ROCKET, exit: PHONE_DROP }).y;
export function careerPhone(exit) {
  const k = clamp((exit - PHONE_DROP) / (1 - PHONE_DROP));
  const fall = smooth(k / 0.5);
  return {
    shown: k > 0,
    x: 0.5,
    y: DROP_Y + (PHONE_Y - DROP_Y) * fall,
    scale: 0.1 + 0.9 * smooth(k),
    angle: -0.6 * (1 - fall),
    notice: clamp((exit - 0.86) / 0.14),
  };
}
