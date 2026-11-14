import { gsap } from 'gsap';
import { createSeekController, waitForMetadata } from '../media-seek.js';
import { mapHeroProgress } from '../hero-pacing.js';
import { getStudioHeroState } from '../studio-motion-math.js';
import { createLazyTitle } from './lazy-title.js';
import { createHeroTitle } from './hero-title.js';

// Hero film -> intact paper -> tear -> About, inside one pinned stage.
// Owns video time, intro/film/paper/about visibility and tear progress (docs/v3-motion-contract.md).
const DECODE_GRACE_MS = 700;

export function initHero(section, media, config) {
  const stage = section.querySelector('[data-hero-stage]');
  const video = section.querySelector('[data-hero-video]');
  const film = section.querySelector('[data-hero-film]');
  const paperLayer = section.querySelector('[data-hero-paper]');
  const intro = section.querySelector('[data-hero-intro]');
  const about = section.querySelector('[data-hero-about]');
  const state = { progress: 0 };
  const lazy = createLazyTitle(about);
  const title = createHeroTitle(intro.querySelector('h1'));
  let destroyed = false;
  let seek = null;
  let paper = null;
  let mediaReady = false;
  let readyTime = -1;
  let frameRequest = 0;
  let gateTimer = 0;
  let forced = false;

  const paint = () => {
    if (state.progress < config.stages.filmEnd) {
      forced = false;
      clearTimeout(gateTimer);
      gateTimer = 0;
    }
    // The paper takes over once the final film frame is on screen. Without media it covers the poster.
    // A lagging decoder is sent straight to the final frame and gets DECODE_GRACE_MS to present it
    // before the hand-off proceeds anyway, so the Hero never stalls or cross-fades two different frames.
    const finalFrame = !mediaReady || forced || Math.abs(readyTime - media.endTime) < 1 / 48;
    if (!finalFrame && !gateTimer && state.progress >= config.stages.coverStart) {
      seek?.jumpTo(media.endTime);
      gateTimer = setTimeout(() => {
        forced = true;
        paint();
      }, DECODE_GRACE_MS);
    }
    const s = getStudioHeroState(state.progress, config.stages, finalFrame);
    seek?.seekTo(mapHeroProgress(s.filmProgress));
    gsap.set(intro, { autoAlpha: s.introOpacity });
    title.progress(1 - s.introOpacity);
    gsap.set(about, { autoAlpha: s.corridorVisible ? 1 : 0 });
    if (paper) {
      gsap.set(film, { autoAlpha: s.corridorVisible ? 0 : 1 });
      gsap.set(paperLayer, { autoAlpha: s.paperOpacity });
      paper.setProgress(s.tearProgress);
    } else {
      gsap.set(film, { autoAlpha: s.corridorVisible ? 1 - s.tearProgress : 1 });
    }
    about.style.setProperty('--reveal', s.tearProgress.toFixed(3));
    // The scramble is the first quarter of LAZY's timeline, so its fold still starts at tearProgress 0.4.
    lazy.progress(gsap.utils.clamp(0, 1, (s.tearProgress - 0.2) / 0.8));
  };

  // Track the frame actually on screen. A paused video presents frames only after seeks, so this loop is idle otherwise.
  const onFrame = (_, metadata) => {
    readyTime = metadata.mediaTime;
    paint();
    frameRequest = video.requestVideoFrameCallback(onFrame);
  };
  const onSeeked = () => {
    readyTime = video.currentTime;
    paint();
  };
  if (video.requestVideoFrameCallback) frameRequest = video.requestVideoFrameCallback(onFrame);
  else video.addEventListener('seeked', onSeeked);
  video.querySelectorAll('source[data-src]').forEach((source) => { source.src = source.dataset.src; });
  video.preload = 'auto';
  video.load();

  gsap.to(state, {
    progress: 1,
    ease: 'none',
    onUpdate: paint,
    scrollTrigger: {
      trigger: section,
      pin: stage,
      start: 'top top',
      end: () => `+=${innerHeight * config.scrollDistanceVh}`,
      scrub: config.scrub,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  });

  Promise.allSettled([
    waitForMetadata(video),
    import('../paper-tear-transition.js').then(({ createPaperTearTransition }) => createPaperTearTransition({
      canvas: paperLayer.querySelector('canvas'),
      imageUrl: media.finalFrame,
      config: media.paperTear,
    })),
  ]).then(([metadata, paperResult]) => {
    const created = paperResult.status === 'fulfilled' ? paperResult.value : null;
    if (destroyed) {
      created?.destroy();
      return;
    }
    if (!created) console.warn('Paper tear unavailable; using a crossfade', paperResult.reason);
    paper = created;
    if (metadata.status === 'fulfilled' && metadata.value) {
      video.pause();
      seek = createSeekController(video, { fps: 48, minTime: media.startTime, maxTime: media.endTime });
      mediaReady = true;
    }
    paint();
  });

  return () => {
    destroyed = true;
    clearTimeout(gateTimer);
    seek?.destroy();
    paper?.destroy();
    if (frameRequest) video.cancelVideoFrameCallback(frameRequest);
    video.removeEventListener('seeked', onSeeked);
    video.pause();
    lazy.revert();
    title.revert();
    gsap.set([intro, film, paperLayer, about], { clearProps: 'opacity,visibility' });
    about.style.removeProperty('--reveal');
  };
}
