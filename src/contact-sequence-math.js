const clamp = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

const progressBetween = (progress, start, end) => (
  clamp((progress - start) / (end - start))
);

export const CONTACT_SEQUENCE_PHASES = Object.freeze({
  approachEnd: 0.34,
  roachEnter: 0.16,
  roachTakeoff: 0.42,
  airborneStart: 0.53,
  encounter: 0.53,
  escapeStart: 0.62,
  phoneDropEnd: 0.67,
  roachExit: 0.71,
  dogExit: 0.75,
  settled: 0.88,
});

const CONTACT_PHONE_DOG_REGISTRATION = Object.freeze({
  x: 0.7,
  y: 0.55,
  rotation: 0,
  scale: 0.065,
});

export const getContactSequenceState = (value, { staticMode = false } = {}) => {
  if (staticMode) {
    return {
      progress: 1,
      phase: 'settled',
      dogPose: 'escape',
      phoneRegistration: null,
      phoneOwnership: 'settled',
      phoneRotation: 0,
      phoneBehindDog: false,
      phoneReady: true,
      staticMode: true,
    };
  }

  const progress = clamp(value);
  const phase = progress < CONTACT_SEQUENCE_PHASES.approachEnd
    ? 'approach'
    : progress < CONTACT_SEQUENCE_PHASES.roachTakeoff
      ? 'ride'
      : progress < CONTACT_SEQUENCE_PHASES.airborneStart
        ? 'roach-flight'
        : progress < CONTACT_SEQUENCE_PHASES.escapeStart
          ? 'airborne'
          : progress < CONTACT_SEQUENCE_PHASES.dogExit
            ? 'escape'
            : progress < CONTACT_SEQUENCE_PHASES.settled
              ? 'focus'
              : 'settled';
  const dogPose = progress < CONTACT_SEQUENCE_PHASES.airborneStart
    ? (Math.min(5, Math.floor(progress / 0.08)) % 2 === 0 ? 'push' : 'glide')
    : progress < CONTACT_SEQUENCE_PHASES.escapeStart
      ? 'airborne'
      : 'escape';
  const phoneBehindDog = progress < CONTACT_SEQUENCE_PHASES.escapeStart;
  const phoneRegistration = phoneBehindDog
    ? { ...CONTACT_PHONE_DOG_REGISTRATION }
    : null;

  return {
    progress,
    phase,
    dogPose,
    phoneRegistration,
    phoneOwnership: phoneBehindDog
      ? 'dog'
      : progress >= CONTACT_SEQUENCE_PHASES.settled
        ? 'settled'
        : 'landed',
    phoneRotation: 0,
    phoneBehindDog,
    phoneReady: progress >= CONTACT_SEQUENCE_PHASES.settled,
    staticMode: false,
  };
};

export const getContactRoachMotionState = (value) => {
  const progress = clamp(value);
  const visible = progress >= CONTACT_SEQUENCE_PHASES.roachEnter
    && progress < CONTACT_SEQUENCE_PHASES.roachExit;
  return {
    phase: progress < CONTACT_SEQUENCE_PHASES.roachEnter
      ? 'hidden'
      : progress < CONTACT_SEQUENCE_PHASES.roachTakeoff
        ? 'crawl'
        : progress < CONTACT_SEQUENCE_PHASES.roachExit
          ? 'flight'
          : 'gone',
    visible,
    crawl: progressBetween(
      progress,
      CONTACT_SEQUENCE_PHASES.roachEnter,
      CONTACT_SEQUENCE_PHASES.roachTakeoff,
    ),
    flightIn: progressBetween(
      progress,
      CONTACT_SEQUENCE_PHASES.roachTakeoff,
      CONTACT_SEQUENCE_PHASES.encounter,
    ),
    flightOut: progressBetween(
      progress,
      CONTACT_SEQUENCE_PHASES.encounter,
      CONTACT_SEQUENCE_PHASES.roachExit,
    ),
  };
};
