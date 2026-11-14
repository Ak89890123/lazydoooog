// Shared media seeking for scroll-scrubbed video. Kept free of section modules
// so lightweight entries can reuse it without bundling the prototype sequences.
import {
  maxStepForLag,
  snapTimeToFrame,
  stepToward,
} from './scroll-video-math.js';

const METADATA_TIMEOUT_MS = 8000;

export const waitForMetadata = (video) => new Promise((resolve) => {
  if (video.readyState >= 1 && Number.isFinite(video.duration)) {
    resolve(true);
    return;
  }

  let timer;
  const finish = (ready) => {
    clearTimeout(timer);
    video.removeEventListener('loadedmetadata', onReady);
    video.removeEventListener('error', onError);
    resolve(ready);
  };
  const onReady = () => finish(true);
  const onError = () => finish(false);

  video.addEventListener('loadedmetadata', onReady, { once: true });
  video.addEventListener('error', onError, { once: true });
  timer = window.setTimeout(() => finish(false), METADATA_TIMEOUT_MS);
});

export const createSeekController = (video, options) => {
  const {
    fps = 24,
    minTime = 0,
    maxTime = video.duration,
    normalFrames = 2,
    catchUpFrames = 10,
    catchUpThreshold = 0.5,
    catchUpDeadlineMs = 400,
  } = options;
  const clampTime = (value) => Math.min(maxTime, Math.max(minTime, value));
  const frameTolerance = 0.45 / fps;
  const frameTime = (value) => snapTimeToFrame(value, fps, minTime, maxTime);
  let target = frameTime(minTime);
  let frame = 0;
  let deadline = 0;
  let destroyed = false;

  const clearDeadline = () => {
    if (!deadline) return;
    clearTimeout(deadline);
    deadline = 0;
  };

  const write = (value) => {
    try {
      video.currentTime = frameTime(value);
    } catch {
      // The poster remains visible if the browser rejects an early media seek.
    }
  };

  const armDeadline = () => {
    if (deadline || destroyed || catchUpDeadlineMs <= 0) return;
    deadline = window.setTimeout(() => {
      deadline = 0;
      if (destroyed) return;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      write(target);
    }, catchUpDeadlineMs);
  };

  const schedule = () => {
    if (!frame && !destroyed) frame = requestAnimationFrame(update);
  };

  const update = () => {
    frame = 0;
    if (destroyed || video.seeking) return;

    const current = video.currentTime || minTime;
    const lag = target - current;
    const maxStep = maxStepForLag(
      lag,
      fps,
      normalFrames,
      catchUpFrames,
      catchUpThreshold,
    );
    const next = stepToward(current, target, maxStep);
    if (Math.abs(next - current) < frameTolerance) {
      clearDeadline();
      return;
    }

    write(next);
    if (Math.abs(next - target) > frameTolerance) schedule();
    else clearDeadline();
  };

  const onSeeked = () => schedule();
  video.addEventListener('seeked', onSeeked);

  return {
    jumpTo(value) {
      target = frameTime(clampTime(value));
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      clearDeadline();
      write(target);
    },
    seekTo(value) {
      target = frameTime(clampTime(value));
      if (Math.abs(target - (video.currentTime || minTime)) > catchUpThreshold) armDeadline();
      else clearDeadline();
      schedule();
    },
    destroy() {
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
      clearDeadline();
      video.removeEventListener('seeked', onSeeked);
    },
  };
};
