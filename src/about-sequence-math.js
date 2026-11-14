const EPSILON = 1e-9;
const STAGE_TWO_IMPACT_PROGRESS = 0.423;
const COMBO_HUD_START = 0.5;
const COMBO_HUD_ENTRY_END = 0.58;
const COMBO_HUD_FADE_START = 0.86;
const COMBO_HUD_END = 0.96;

export const ABOUT_DESKTOP_STAGE_RANGES = Object.freeze([
  Object.freeze({ stage: 1, start: 0, end: 0.28, qStart: 0, qEnd: 1 }),
  Object.freeze({ stage: 2, start: 0.28, end: STAGE_TWO_IMPACT_PROGRESS, qStart: 0, qEnd: 0.5 }),
  Object.freeze({ stage: 2, start: STAGE_TWO_IMPACT_PROGRESS, end: 0.5, qStart: 0.5, qEnd: 1 }),
  Object.freeze({ stage: 3, start: 0.5, end: 0.8, qStart: 0, qEnd: 0.75 }),
  Object.freeze({ stage: 3, start: 0.8, end: 1, qStart: 0.75, qEnd: 1 }),
]);

export const ABOUT_LOCAL_PHASES = Object.freeze([
  Object.freeze({ id: 'entry', start: 0, end: 0.1 }),
  Object.freeze({ id: 'trick', start: 0.1, end: 0.5 }),
  Object.freeze({ id: 'impact', start: 0.5, end: 0.55 }),
  Object.freeze({ id: 'boot', start: 0.55, end: 0.65 }),
  Object.freeze({ id: 'content', start: 0.65, end: 0.72 }),
  Object.freeze({ id: 'exit_or_transit', start: 0.72, end: 0.75 }),
  Object.freeze({ id: 'reading_or_recovery', start: 0.75, end: 1 }),
]);

export const clampAboutProgress = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const interpolate = (value, inStart, inEnd, outStart, outEnd) => {
  if (Math.abs(inEnd - inStart) <= EPSILON) return outStart;
  const ratio = (value - inStart) / (inEnd - inStart);
  return outStart + (outEnd - outStart) * ratio;
};

const progressBetween = (value, start, end) => (
  clampAboutProgress(interpolate(value, start, end, 0, 1))
);

const ABOUT_DOG_CONTACT_Y = Object.freeze([0, 0.071, 0.043]);

const smoothstep = (value) => value * value * (3 - 2 * value);
const smootherstep = (value) => value ** 3 * (value * (value * 6 - 15) + 10);

const pingPong = (value) => {
  const wrapped = ((value % 2) + 2) % 2;
  return 1 - Math.abs(wrapped - 1);
};

export const canonicalizeAboutState = ({ stage, q, direction = 1 }) => {
  const safeStage = Math.min(3, Math.max(1, Math.round(Number(stage) || 1)));
  const safeQ = clampAboutProgress(q);
  const safeDirection = direction < 0 ? -1 : 1;

  if (safeStage === 1 && safeQ >= 1 - EPSILON) {
    return { stage: 2, q: 0, direction: safeDirection };
  }
  if (safeStage === 2 && safeQ >= 1 - EPSILON) {
    return { stage: 3, q: 0, direction: safeDirection };
  }
  return { stage: safeStage, q: safeQ, direction: safeDirection };
};

export const mapDesktopProgressToAboutState = (progress, direction = 1) => {
  const p = clampAboutProgress(progress);
  const range = ABOUT_DESKTOP_STAGE_RANGES.find(({ end }) => p < end - EPSILON)
    ?? ABOUT_DESKTOP_STAGE_RANGES.at(-1);
  const q = interpolate(p, range.start, range.end, range.qStart, range.qEnd);
  return canonicalizeAboutState({ stage: range.stage, q, direction });
};

export const mapAboutStateToDesktopProgress = (state) => {
  const { stage, q } = canonicalizeAboutState(state);
  if (stage === 1) return 0.28 * q;
  if (stage === 2 && q < 0.5 - EPSILON) {
    return interpolate(q, 0, 0.5, 0.28, STAGE_TWO_IMPACT_PROGRESS);
  }
  if (stage === 2) return interpolate(q, 0.5, 1, STAGE_TWO_IMPACT_PROGRESS, 0.5);
  if (q < 0.75 - EPSILON) return 0.5 + 0.3 * (q / 0.75);
  return 0.8 + 0.2 * ((q - 0.75) / 0.25);
};

export const describeAboutPhase = (qValue) => {
  const q = clampAboutProgress(qValue);
  const phase = ABOUT_LOCAL_PHASES.find(({ end }) => q < end - EPSILON)
    ?? ABOUT_LOCAL_PHASES.at(-1);
  const phaseRatio = q >= 1
    ? 1
    : interpolate(q, phase.start, phase.end, 0, 1);
  return {
    phase: phase.id,
    phaseRatio: clampAboutProgress(phaseRatio),
  };
};

export const getAboutScreenUnlockMask = ({ stage, q }) => {
  const canonical = canonicalizeAboutState({ stage, q });
  const unlockedBeforeStage = canonical.stage - 1;
  const currentUnlocked = canonical.q >= 0.5 - EPSILON ? 1 : 0;
  const unlockedCount = Math.min(3, unlockedBeforeStage + currentUnlocked);
  return [0, 1, 2].map((index) => index < unlockedCount);
};

export const createAboutSemanticState = (state) => {
  const canonical = canonicalizeAboutState(state);
  const phase = describeAboutPhase(canonical.q);
  return {
    ...canonical,
    ...phase,
    screenUnlockMask: getAboutScreenUnlockMask(canonical),
  };
};

export const getAboutComboHudState = (qValue) => {
  const q = clampAboutProgress(qValue);
  const entryProgress = progressBetween(q, COMBO_HUD_START, COMBO_HUD_ENTRY_END);
  const fadeProgress = progressBetween(q, COMBO_HUD_FADE_START, COMBO_HUD_END);
  return {
    opacity: q >= COMBO_HUD_START && q < COMBO_HUD_END
      ? entryProgress * (1 - fadeProgress)
      : 0,
    y: fadeProgress ? -18 * fadeProgress : 0,
    entryProgress,
  };
};

const DESKTOP_COMBO_STARTS = Object.freeze(
  [1, 2, 3].map((stage) => mapAboutStateToDesktopProgress({ stage, q: COMBO_HUD_START })),
);
const DESKTOP_COMBO_DURATION = mapAboutStateToDesktopProgress({ stage: 3, q: COMBO_HUD_END })
  - DESKTOP_COMBO_STARTS[2];
const DESKTOP_COMBO_FADE_DURATION = mapAboutStateToDesktopProgress({
  stage: 3,
  q: COMBO_HUD_END,
}) - mapAboutStateToDesktopProgress({ stage: 3, q: COMBO_HUD_FADE_START });
const DESKTOP_COMBO_ENTRY_DURATION = mapAboutStateToDesktopProgress({
  stage: 3,
  q: COMBO_HUD_ENTRY_END,
}) - DESKTOP_COMBO_STARTS[2];
const COMBO_HUD_DOG_OFFSETS = Object.freeze([
  Object.freeze({ x: -0.72, y: -0.78 }),
  Object.freeze({ x: 0.76, y: -0.98 }),
  Object.freeze({ x: -0.88, y: -0.72 }),
]);

export const getAboutDesktopComboHudState = (progressValue, indexValue) => {
  const progress = clampAboutProgress(progressValue);
  const index = Math.min(2, Math.max(0, Math.round(Number(indexValue) || 0)));
  const start = DESKTOP_COMBO_STARTS[index];
  const end = start + DESKTOP_COMBO_DURATION;
  const entryProgress = progressBetween(progress, start, start + DESKTOP_COMBO_ENTRY_DURATION);
  const fadeProgress = progressBetween(progress, end - DESKTOP_COMBO_FADE_DURATION, end);
  return {
    opacity: progress >= start && progress < end
      ? entryProgress * (1 - fadeProgress)
      : 0,
    y: fadeProgress ? -18 * fadeProgress : 0,
    entryProgress,
  };
};

export const getAboutComboHudMotion = (state, indexValue) => {
  const t = clampAboutProgress(state?.entryProgress);
  const index = Math.min(2, Math.max(0, Math.round(Number(indexValue) || 0)));
  const impact = Math.sin(Math.PI * t);

  if (index === 0) {
    return {
      x: 0,
      y: 18 * (1 - t) - 10 * impact,
      scale: 0.58 + 0.42 * t + 0.12 * impact,
      rotation: -6 * (1 - t),
      rotationY: 0,
    };
  }
  if (index === 1) {
    return {
      x: 0,
      y: 0,
      scale: 0.72 + 0.28 * t,
      rotation: -18 * (1 - t),
      rotationY: -110 * (1 - t),
    };
  }
  return {
    x: 46 * (t - 1),
    y: 0,
    scale: 0.88 + 0.12 * t,
    rotation: 3 * (t - 1),
    rotationY: 0,
  };
};

export const getAboutComboHudPosition = ({
  anchorX,
  anchorY,
  dogWidth,
  dogHeight,
  index,
  liftY = 0,
}) => {
  const safeIndex = Math.min(2, Math.max(0, Math.round(Number(index) || 0)));
  const offset = COMBO_HUD_DOG_OFFSETS[safeIndex];
  return {
    x: anchorX + dogWidth * offset.x,
    y: anchorY + dogHeight * offset.y + liftY,
  };
};

export const getAboutPlateState = (state, index) => {
  const semantic = createAboutSemanticState(state);
  const safeIndex = Math.min(2, Math.max(0, Math.round(Number(index) || 0)));
  const activeIndex = semantic.stage - 1;
  const pressProgress = safeIndex < activeIndex
    ? 1
    : safeIndex === activeIndex
      ? progressBetween(semantic.q, 0.47, 0.53)
      : 0;

  return {
    pressProgress,
    frame: pressProgress >= 0.82 ? 2 : pressProgress >= 0.12 ? 1 : 0,
    unlocked: semantic.screenUnlockMask[safeIndex],
  };
};

export const getAboutDogGroundOffset = (state) => {
  const semantic = createAboutSemanticState(state);
  const target = ABOUT_DOG_CONTACT_Y[semantic.stage - 1];
  const start = semantic.stage === 1 ? 0 : ABOUT_DOG_CONTACT_Y[semantic.stage - 2];
  const travel = smootherstep(progressBetween(semantic.q, 0, 0.1));
  return interpolate(travel, 0, 1, start, target);
};

export const getAboutDogHorizontalPosition = (state) => {
  const { stage, q } = createAboutSemanticState(state);

  if (stage === 1) {
    if (q < 0.1) return interpolate(smootherstep(progressBetween(q, 0, 0.1)), 0, 1, -0.06, -0.03);
    if (q < 0.5) return interpolate(smootherstep(progressBetween(q, 0.1, 0.5)), 0, 1, -0.03, 0.185);
    if (q < 0.72) return 0.185;
    return interpolate(smootherstep(progressBetween(q, 0.72, 1)), 0, 1, 0.185, 0.32);
  }

  if (stage === 2) {
    if (q < 0.1) return interpolate(smootherstep(progressBetween(q, 0, 0.1)), 0, 1, 0.32, 0.335);
    if (q < 0.5) return interpolate(smootherstep(progressBetween(q, 0.1, 0.5)), 0, 1, 0.335, 0.505);
    if (q < 0.72) return 0.505;
    return interpolate(smootherstep(progressBetween(q, 0.72, 1)), 0, 1, 0.505, 0.605);
  }

  if (q < 0.1) return interpolate(smootherstep(progressBetween(q, 0, 0.1)), 0, 1, 0.605, 0.625);
  if (q < 0.5) return interpolate(smootherstep(progressBetween(q, 0.1, 0.5)), 0, 1, 0.625, 0.82);
  if (q < 0.72) return 0.82;
  if (q < 0.96) return interpolate(smootherstep(progressBetween(q, 0.72, 0.96)), 0, 1, 0.82, 1.08);
  return 1.08;
};

export const getAboutDogTrickOffset = (state) => {
  const semantic = createAboutSemanticState(state);
  if (semantic.q < 0.1 || semantic.q >= 0.5) return 0;
  const t = progressBetween(semantic.q, 0.1, 0.5);

  if (semantic.stage === 1) {
    if (t < 0.12) return Math.sin((t / 0.12) * Math.PI) * 0.012;
    if (t < 0.52) return interpolate(smootherstep((t - 0.12) / 0.4), 0, 1, 0, -0.105);
    return interpolate(smootherstep((t - 0.52) / 0.48), 0, 1, -0.105, 0);
  }

  if (semantic.stage === 2) {
    if (t < 0.18) return Math.sin((t / 0.18) * Math.PI) * 0.018;
    if (t < 0.48) return interpolate(smootherstep((t - 0.18) / 0.3), 0, 1, 0, -0.205);
    if (t < 0.62) return -0.205 - Math.sin(((t - 0.48) / 0.14) * Math.PI) * 0.02;
    return interpolate(smootherstep((t - 0.62) / 0.38), 0, 1, -0.205, 0);
  }

  if (t < 0.25) return interpolate(smoothstep(t / 0.25), 0, 1, 0, -0.08);
  if (t < 0.875) return -0.08;
  return interpolate(smoothstep((t - 0.875) / 0.125), 0, 1, -0.08, 0);
};

export const createAboutScreenContentState = (state, desktopProgress) => {
  const semantic = createAboutSemanticState(state);
  const progress = Number.isFinite(desktopProgress)
    ? clampAboutProgress(desktopProgress)
    : mapAboutStateToDesktopProgress(semantic);
  const portraitStart = 0.28 * 0.65;
  const quietStart = 0.8;
  const activeClock = progressBetween(progress, portraitStart, quietStart) * 2.4;
  const quietClock = progress > quietStart
    ? progressBetween(progress, quietStart, 1) * 0.35
    : 0;
  const portraitClock = activeClock + quietClock;

  let repeatFlowOffset = 0;
  let repeatScanProgress = 0;
  let repeatDetected = false;
  if (semantic.stage === 2) {
    repeatFlowOffset = pingPong(progressBetween(semantic.q, 0.1, 0.72) * 2.5);
    repeatScanProgress = progressBetween(semantic.q, 0.55, 0.72);
    repeatDetected = semantic.q >= 0.72 - EPSILON;
  } else if (semantic.stage === 3) {
    repeatFlowOffset = 0.5;
    repeatScanProgress = 1;
    repeatDetected = true;
  }

  return {
    portraitVisible: progress >= portraitStart - EPSILON,
    portraitQuiet: progress >= quietStart - EPSILON,
    portraitX: pingPong(portraitClock),
    portraitY: pingPong(portraitClock * 0.73 + 0.24),
    repeatFlowOffset,
    repeatScanProgress,
    repeatDetected,
  };
};

export const aboutScrollDistancePx = (viewportHeight, distanceVh = 5) => {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0;
  return Math.round(viewportHeight * distanceVh);
};
