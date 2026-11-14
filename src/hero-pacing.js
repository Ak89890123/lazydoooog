const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

export const heroPacingMap = deepFreeze({
  media: {
    startTime: 0,
    endTime: 10.375,
    fps: 48,
  },
  balanced: {
    interpolation: 'monotone_cubic',
    timelineDuration: 6.2935469635,
    anchors: [
      { progress: 0, time: 0 },
      { progress: 0.2201990647, time: 3 },
      { progress: 0.3890087475, time: 4.5 },
      { progress: 0.4521350576, time: 5.25 },
      { progress: 0.5742261297, time: 6.25 },
      { progress: 0.6690243116, time: 7 },
      { progress: 0.7152639028, time: 7.5 },
      { progress: 0.8576319514, time: 8.9 },
      { progress: 1, time: 10.375 },
    ],
  },
});

const clamp = (min, max, value) => Math.min(max, Math.max(min, value));

const findSegment = (values, value) => {
  if (value <= values[0]) return 0;
  if (value >= values.at(-1)) return values.length - 2;

  let low = 0;
  let high = values.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] <= value) low = middle;
    else high = middle;
  }
  return low;
};

const endpointDerivative = (here, next, hereSpan, nextSpan) => {
  let derivative = (
    (2 * hereSpan + nextSpan) * here - hereSpan * next
  ) / (hereSpan + nextSpan);

  if (Math.sign(derivative) !== Math.sign(here)) derivative = 0;
  else if (
    Math.sign(here) !== Math.sign(next)
    && Math.abs(derivative) > Math.abs(3 * here)
  ) {
    derivative = 3 * here;
  }
  return derivative;
};

const monotoneDerivatives = (xs, ys) => {
  const spans = xs.slice(1).map((value, index) => value - xs[index]);
  const slopes = ys.slice(1).map((value, index) => (
    (value - ys[index]) / spans[index]
  ));

  if (xs.length === 2) return [slopes[0], slopes[0]];

  const derivatives = new Array(xs.length);
  derivatives[0] = endpointDerivative(slopes[0], slopes[1], spans[0], spans[1]);
  derivatives[derivatives.length - 1] = endpointDerivative(
    slopes.at(-1),
    slopes.at(-2),
    spans.at(-1),
    spans.at(-2),
  );

  for (let index = 1; index < xs.length - 1; index += 1) {
    const before = slopes[index - 1];
    const after = slopes[index];
    if (before * after <= 0) {
      derivatives[index] = 0;
      continue;
    }

    const beforeWeight = 2 * spans[index] + spans[index - 1];
    const afterWeight = spans[index] + 2 * spans[index - 1];
    derivatives[index] = (beforeWeight + afterWeight) / (
      beforeWeight / before + afterWeight / after
    );
  }
  return derivatives;
};

const createMapper = (anchors) => {
  const xs = anchors.map((anchor) => anchor.progress);
  const ys = anchors.map((anchor) => anchor.time);
  const derivatives = monotoneDerivatives(xs, ys);

  const map = (rawProgress) => {
    const progress = clamp(0, 1, rawProgress);
    if (progress === 0) return ys[0];
    if (progress === 1) return ys.at(-1);

    const index = findSegment(xs, progress);
    const span = xs[index + 1] - xs[index];
    const t = (progress - xs[index]) / span;
    const squared = t * t;
    const cubed = squared * t;

    return (
      (2 * cubed - 3 * squared + 1) * ys[index]
      + (cubed - 2 * squared + t) * span * derivatives[index]
      + (-2 * cubed + 3 * squared) * ys[index + 1]
      + (cubed - squared) * span * derivatives[index + 1]
    );
  };

  const inverse = (rawTime) => {
    const time = clamp(ys[0], ys.at(-1), rawTime);
    if (time === ys[0]) return 0;
    if (time === ys.at(-1)) return 1;

    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 60; iteration += 1) {
      const middle = (low + high) / 2;
      if (map(middle) < time) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  };

  return { inverse, map };
};

const balancedMapper = createMapper(heroPacingMap.balanced.anchors);

export const mapHeroProgress = (progress) => balancedMapper.map(progress);
export const progressForHeroTime = (time) => balancedMapper.inverse(time);
