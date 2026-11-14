import {
  CONTACT_SEQUENCE_PHASES,
  getContactSequenceState,
} from './contact-sequence-math.js';
import animationMap from './animation-map.json' with { type: 'json' };

const contactHandoffConfig = animationMap.sections.find((section) => section.id === 'contact');

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smoothstep = (value) => value * value * (3 - 2 * value);

export const EXPERIENCE_PHASES = Object.freeze({
  firstArrival: 0.34,
  firstDepart: 0.44,
  secondArrival: 0.68,
  secondDepart: 0.8,
});

export const EXPERIENCE_CONTACT_HANDOFF = Object.freeze({
  stripCount: contactHandoffConfig.stripCount,
  stripOverlap: contactHandoffConfig.stripOverlap,
  revealStart: 0.02,
  revealEnd: 1,
  contactStart: 0.16,
  encounterProgress: CONTACT_SEQUENCE_PHASES.encounter,
  dogExitProgress: CONTACT_SEQUENCE_PHASES.dogExit,
  settledProgress: CONTACT_SEQUENCE_PHASES.settled,
});

export const progressBetween = (progress, start, end) => (
  clamp01((clamp01(progress) - start) / (end - start))
);

const windowWeight = (progress, start, end, feather = 0.015) => Math.min(
  smoothstep(progressBetween(progress, start - feather, start + feather)),
  1 - smoothstep(progressBetween(progress, end - feather, end + feather)),
);

export const getDogPoseWeights = (progress) => {
  const value = clamp01(progress);
  const turn = Math.max(
    windowWeight(value, EXPERIENCE_PHASES.firstDepart, EXPERIENCE_PHASES.secondArrival),
    windowWeight(value, EXPERIENCE_PHASES.secondDepart, 0.96),
  );

  return {
    glide: 1 - turn,
    turn,
  };
};

export const createSerpentineFillPath = (
  { left, right, top, bottom },
  trackSpacing,
) => {
  const spacing = Math.max(1, trackSpacing);
  const points = [];
  let y = bottom;
  let fromRight = true;

  while (y > top) {
    points.push(
      { x: fromRight ? right : left, y },
      { x: fromRight ? left : right, y },
    );
    y = Math.max(top, y - spacing);
    fromRight = !fromRight;
  }

  points.push(
    { x: fromRight ? right : left, y: top },
    { x: fromRight ? left : right, y: top },
  );
  return points;
};

export const splitSerpentineFillPath = (points, splitY) => {
  const firstUpperPoint = points.findIndex((point) => point.y <= splitY);
  const splitIndex = firstUpperPoint < 0
    ? points.length
    : firstUpperPoint;
  return {
    continuation: points.slice(0, splitIndex),
    transition: points.slice(splitIndex),
    splitIndex,
  };
};

export const mapPinnedExperienceIntro = ({
  routeProgress,
  dogProgress,
  routeEndDistance,
  routeLeadDistance,
  centerDistance,
}) => {
  const route = clamp01(routeProgress);
  const dog = clamp01(dogProgress);
  const leadDistance = Math.max(routeEndDistance, routeLeadDistance);
  return {
    drawnDistance: (
      routeEndDistance * route
      + (leadDistance - routeEndDistance) * smoothstep(dog)
    ),
    dogDistance: centerDistance * smoothstep(dog),
    dogVisible: dog > 0,
  };
};

export const getExperienceDocumentRouteState = ({
  routeProgress,
  routeLength,
  routeLeadDistance,
  routeActive,
}) => {
  const route = clamp01(routeProgress);
  const leadDistance = routeActive ? routeLeadDistance : 0;
  return {
    drawnDistance: leadDistance + (routeLength - leadDistance) * route,
    visible: routeActive || route > 0,
  };
};

export const getExperienceHandoffState = (progress, distance) => {
  const range = Math.max(0, distance);
  const value = clamp01(progress);
  const maxShift = range / 2;
  const shift = maxShift * value * value;
  return {
    backdropY: maxShift - shift,
    maxShift,
    stageY: shift === 0 ? 0 : -shift,
  };
};

export const getExperienceDogExitState = ({ progress, startX, endX, y }) => {
  const value = clamp01(progress);
  return {
    x: startX + (endX - startX) * value,
    y,
    visible: value < 1,
  };
};

export const getExperienceDogRouteHoldState = ({
  progress,
  travelEnd,
  startDistance,
  endDistance,
}) => {
  const travel = progressBetween(progress, 0, travelEnd);
  return {
    routeDistance: startDistance + (endDistance - startDistance) * travel,
    poseProgress: 0.8 + travel * 0.2,
  };
};

export const getExperienceContactHandoffState = (
  value,
  {
    staticMode = false,
    stripCount: configuredStripCount = EXPERIENCE_CONTACT_HANDOFF.stripCount,
    stripOverlap: configuredStripOverlap = EXPERIENCE_CONTACT_HANDOFF.stripOverlap,
    contactStart: configuredContactStart = EXPERIENCE_CONTACT_HANDOFF.contactStart,
  } = {},
) => {
  const progress = staticMode ? 1 : clamp01(value);
  const {
    revealStart,
    revealEnd,
    encounterProgress,
    dogExitProgress,
    settledProgress,
  } = EXPERIENCE_CONTACT_HANDOFF;
  const stripCount = Math.max(1, Math.round(configuredStripCount));
  const stripOverlap = Math.min(0.99, Math.max(0, configuredStripOverlap));
  const contactStart = Math.min(0.99, Math.max(0.01, configuredContactStart));
  const exitProgress = progressBetween(progress, 0, contactStart);
  const contactProgress = progressBetween(progress, contactStart, 1);
  const stripDuration = (revealEnd - revealStart) / (
    1 + (stripCount - 1) * (1 - stripOverlap)
  );
  const stripStagger = stripDuration * (1 - stripOverlap);
  const strips = Array.from({ length: stripCount }, (_, index) => {
    const launchOrder = stripCount - index - 1;
    const start = revealStart + launchOrder * stripStagger;
    return {
      index,
      launchOrder,
      origin: 'left',
      progress: progressBetween(exitProgress, start, start + stripDuration),
    };
  });
  const cleanupReady = exitProgress === 1 && strips.every((strip) => strip.progress === 1);
  const contact = getContactSequenceState(contactProgress, { staticMode });
  const contactReady = cleanupReady && contact.phoneReady;
  const sceneOwner = cleanupReady
    ? 'contact'
    : progress === 0
      ? 'experience'
      : 'handoff';
  const phase = contact.phoneReady
    ? 'cleanup'
    : contactProgress > 0
      ? 'exit'
      : progress > 0
        ? 'hold'
        : 'entry';
  return {
    progress,
    exitProgress,
    phase,
    sceneOwner,
    activeSection: sceneOwner === 'contact' ? 'contact' : 'experience',
    experienceVisible: !cleanupReady,
    contactVisible: contactProgress > 0 || staticMode,
    contactInteractive: contactReady,
    maskActive: !staticMode && progress > 0 && !cleanupReady,
    revealProgress: strips.reduce((sum, strip) => sum + strip.progress, 0) / stripCount,
    strips,
    encounterReady: contactProgress + Number.EPSILON >= encounterProgress,
    cleanupReady,
    dog: {
      travel: progressBetween(contactProgress, 0, encounterProgress),
      visible: contactProgress > 0 && contactProgress < dogExitProgress,
      pose: contact.dogPose,
    },
    contact,
  };
};

export const createExperienceRoutePath = ({ width, height }) => [
  `M ${width * 0.44},${height * -0.02}`,
  `C ${width * 0.34},${height * 0.08} ${width * 0.24},${height * 0.24} ${width * 0.28},${height * 0.36}`,
  `C ${width * 0.34},${height * 0.53} ${width * 0.6},${height * 0.52} ${width * 0.72},${height * 0.68}`,
  `C ${width * 0.79},${height * 0.8} ${width * 0.67},${height * 0.97} ${width * 0.56},${height * 1.16}`,
].join(' ');

const getDogPose = (progress) => {
  const turning = (
    (progress >= EXPERIENCE_PHASES.firstDepart && progress < EXPERIENCE_PHASES.secondArrival)
    || (progress >= EXPERIENCE_PHASES.secondDepart && progress < 0.96)
  );
  return turning ? 'turn' : 'glide';
};

export const mapIndependentExperienceTracks = ({
  routeProgress,
  dogProgress,
}) => {
  const route = clamp01(routeProgress);
  const dog = clamp01(dogProgress);
  return {
    line: route,
    dog,
    pose: getDogPose(dog),
  };
};
