const between = (value, start, end) => Math.min(1, Math.max(0, (value - start) / (end - start)));

export function getStudioHeroState(value, stages, finalFrameReady = true) {
  const progress = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const cover = finalFrameReady ? between(progress, stages.coverStart, stages.coverEnd) : 0;
  return {
    progress,
    introOpacity: 1 - between(progress, 0, stages.filmStart),
    filmProgress: between(progress, stages.filmStart, stages.filmEnd),
    filmOpacity: cover === 1 ? 0 : between(progress, stages.filmStart * 0.5, stages.filmStart),
    paperOpacity: cover,
    corridorVisible: cover === 1,
    tearProgress: cover === 1 ? between(progress, stages.tearStart, 1) : 0,
  };
}
