export const DEFAULT_SKILL_GROUP_RANGES = Object.freeze([
  Object.freeze({ start: 0.1, end: 0.23 }),
  Object.freeze({ start: 0.27, end: 0.4 }),
  Object.freeze({ start: 0.44, end: 0.57 }),
  Object.freeze({ start: 0.61, end: 0.74 }),
]);

export const clamp01 = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

export const progressBetween = (value, start, end) => {
  if (end <= start) return value >= end ? 1 : 0;
  return clamp01((value - start) / (end - start));
};

export const getExperienceTransitionState = (value) => {
  const progress = clamp01(value);
  const smoothstep = (amount) => amount * amount * (3 - 2 * amount);
  const entry = smoothstep(progressBetween(progress, 0, 0.04));
  const exit = smoothstep(progressBetween(progress, 0.94, 1));
  return {
    progress,
    paintVisible: progress > 0,
    canOpacity: entry * (1 - exit),
  };
};

export const getCanvasPixelRatio = (
  width,
  height,
  pixelRatioCap,
  devicePixelRatio,
  maxPixels = Number.POSITIVE_INFINITY,
) => Math.min(
  pixelRatioCap,
  devicePixelRatio,
  Math.sqrt(maxPixels / Math.max(1, width * height)),
);

export const getSkillGroupProgress = (
  progress,
  index,
  ranges = DEFAULT_SKILL_GROUP_RANGES,
) => {
  const range = ranges[index];
  if (!range) return 0;
  return progressBetween(progress, range.start, range.end);
};

export const getSkillMaskStampCount = (progress, total) => (
  Math.ceil(clamp01(progress) * Math.max(0, Math.floor(total)))
);

export const createDiagonalFillPath = (
  { left, right, top, bottom },
  trackSpacing,
) => {
  const diagonalStep = Math.max(1, trackSpacing) * Math.SQRT2;
  const minSum = left + top;
  const maxSum = right + bottom;
  const points = [];

  const intersections = (sum) => [
    { x: left, y: sum - left },
    { x: right, y: sum - right },
    { x: sum - top, y: top },
    { x: sum - bottom, y: bottom },
  ].filter(({ x, y }) => (
    x >= left && x <= right && y >= top && y <= bottom
  )).filter((point, index, all) => (
    all.findIndex(({ x, y }) => x === point.x && y === point.y) === index
  )).sort((a, b) => a.x - b.x);

  let lineIndex = 0;
  for (
    let sum = maxSum - diagonalStep / 2;
    sum > minSum;
    sum -= diagonalStep
  ) {
    const line = intersections(sum);
    if (line.length < 2) continue;
    points.push(...(lineIndex % 2 === 0 ? line : line.reverse()));
    lineIndex += 1;
  }

  return points;
};

const seededUnit = (value) => {
  const result = Math.sin(value * 12.9898) * 43758.5453;
  return result - Math.floor(result);
};

export const getSprayParticle = (seed, index, radius, overspray = false) => {
  const bandSeed = overspray ? 401 : 0;
  const angle = seededUnit(seed + bandSeed + index * 7.13) * Math.PI * 2;
  const spread = seededUnit(seed + bandSeed + index * 13.7);
  const distance = radius * (overspray
    ? 0.68 + spread * 1.02
    : Math.pow(spread, 1.55) * 0.66);
  const dotRadius = radius * (overspray
    ? 0.008 + seededUnit(seed + bandSeed + index * 19.1) * 0.018
    : 0.025 + seededUnit(seed + bandSeed + index * 19.1) * 0.045);

  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    radius: dotRadius,
  };
};

export const getSkillColorIndex = (
  progress,
  ranges = DEFAULT_SKILL_GROUP_RANGES,
) => {
  const p = clamp01(progress);
  const index = ranges.findIndex((range) => p <= range.end);
  return index === -1 ? Math.max(0, ranges.length - 1) : index;
};

export const createPolylineSampler = (points) => {
  if (!Array.isArray(points) || points.length === 0) {
    return () => ({ x: 0, y: 0, angle: 0 });
  }
  if (points.length === 1) {
    const point = points[0];
    return () => ({ x: point.x, y: point.y, angle: 0 });
  }

  const segments = points.slice(1).map((point, index) => {
    const previous = points[index];
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    return {
      from: previous,
      to: point,
      length: Math.hypot(dx, dy),
      angle: Math.atan2(dy, dx) * (180 / Math.PI),
    };
  });
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);

  return (progress) => {
    const target = clamp01(progress) * totalLength;
    let travelled = 0;

    for (const segment of segments) {
      if (travelled + segment.length >= target || segment === segments.at(-1)) {
        const ratio = segment.length > 0
          ? clamp01((target - travelled) / segment.length)
          : 0;
        return {
          x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
          y: segment.from.y + (segment.to.y - segment.from.y) * ratio,
          angle: segment.angle,
        };
      }
      travelled += segment.length;
    }

    const last = points.at(-1);
    return { x: last.x, y: last.y, angle: 0 };
  };
};

export const samplePolyline = (points, progress) => createPolylineSampler(points)(progress);

export const getSkillToolState = (
  progress,
  paths,
  ranges = DEFAULT_SKILL_GROUP_RANGES,
) => {
  const p = clamp01(progress);
  if (!paths.length) return { x: 0, y: 0, angle: 0, spraying: false };

  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    const path = paths[index] ?? paths.at(-1);
    if (p >= range.start && p <= range.end) {
      return {
        ...samplePolyline(path, progressBetween(p, range.start, range.end)),
        spraying: true,
      };
    }
    if (p < range.start) {
      const previousPath = paths[index - 1];
      if (!previousPath) return { ...samplePolyline(path, 0), spraying: false };
      const previousRange = ranges[index - 1];
      const travel = progressBetween(p, previousRange.end, range.start);
      const from = samplePolyline(previousPath, 1);
      const to = samplePolyline(path, 0);
      return {
        x: from.x + (to.x - from.x) * travel,
        y: from.y + (to.y - from.y) * travel,
        angle: from.angle + (to.angle - from.angle) * travel,
        spraying: false,
      };
    }
  }

  return { ...samplePolyline(paths.at(-1), 1), spraying: false };
};
