export const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export const targetTimeForProgress = (progress, duration, endPadding = 0.04) => {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return clamp(progress) * Math.max(0, duration - endPadding);
};

export const maxStepForLag = (
  lag,
  fps = 24,
  normalFrames = 2,
  catchUpFrames = 10,
  catchUpThreshold = 0.5,
) => {
  const frames = Math.abs(lag) > catchUpThreshold
    ? catchUpFrames
    : normalFrames;
  return frames / fps;
};

export const stepToward = (current, target, maxStep) => {
  if (![current, target, maxStep].every(Number.isFinite) || maxStep <= 0) {
    return current;
  }
  const delta = target - current;
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
};

export const snapTimeToFrame = (
  value,
  fps = 24,
  minTime = 0,
  maxTime = Number.POSITIVE_INFINITY,
) => {
  if (![value, fps, minTime, maxTime].every((item) => (
    Number.isFinite(item) || item === Number.POSITIVE_INFINITY
  )) || fps <= 0 || maxTime < minTime) {
    return minTime;
  }

  const clamped = Math.min(maxTime, Math.max(minTime, value));
  const frame = Math.round((clamped - minTime) * fps);
  return Math.min(maxTime, minTime + frame / fps);
};
