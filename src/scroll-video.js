import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  heroPacingMap,
  mapHeroProgress,
} from './hero-pacing.js';
import { createSeekController, waitForMetadata } from './media-seek.js';
import { initAboutSequence } from './about-sequence.js';
import { initSkillsSequence } from './skills-sequence.js';
import { initExperienceSequence } from './experience-sequence.js';

gsap.registerPlugin(ScrollTrigger);

if (location.search.includes('benchmark=1')) {
  globalThis.__resumeAnimationDebug = () => ({
    scrollTriggers: ScrollTrigger.getAll().length,
    gsapAnimations: gsap.globalTimeline.getChildren(true, true, true).length,
  });
}

const FILM_DURATION = heroPacingMap.balanced.timelineDuration ?? 5.6;
const DEFAULT_TITLE_HOLD_DURATION = 1.15;
const DEFAULT_TEAR_SWAP_DURATION = 0.16;
const DEFAULT_TEAR_DURATION = 2.15;
const DEFAULT_TEAR_EXIT_FADE = 0.16;

export { createSeekController, waitForMetadata };

const dispatchSection = (() => {
  let active = '';
  return (id) => {
    if (id === active) return;
    active = id;
    window.dispatchEvent(new CustomEvent('resume:section', { detail: id }));
  };
})();

const setPowerState = (buttons, dots, index, on) => {
  buttons[index]?.classList.toggle('is-on', on);
  dots[index]?.classList.toggle('is-on', on);
};

const revealFallback = (root, video, screens, contents, buttons, dots) => {
  root.classList.add('is-motion-fallback');
  video.pause();
  try {
    video.currentTime = heroPacingMap.media.startTime;
  } catch {
    // Poster-only fallback does not require a successful seek.
  }
  gsap.set(screens, { autoAlpha: 1, scale: 1, filter: 'none', clearProps: 'transform' });
  gsap.set(contents, { autoAlpha: 1, y: 0, clearProps: 'transform' });
  buttons.forEach((_, index) => setPowerState(buttons, dots, index, true));
};

export const initScrollVideo = async (animationMap) => {
  const root = document.querySelector('[data-hero-tv-sequence]');
  const heroScroll = root?.querySelector('[data-hero-scroll]');
  const stage = root?.querySelector('.motion-stage');
  const hero = root?.querySelector('.motion-hero');
  const corridor = root?.querySelector('[data-about-visual]');
  const video = root?.querySelector('[data-hero-video]');
  const paperLayer = root?.querySelector('[data-paper-tear]');
  const paperCanvas = root?.querySelector('[data-paper-tear-canvas]');

  if (!root || !heroScroll || !stage || !hero || !corridor || !video || !paperLayer || !paperCanvas) {
    throw new Error('Hero TV sequence markup is incomplete');
  }

  const heroConfig = animationMap.sections.find((section) => section.id === 'hero') || {};
  const startTime = heroConfig.startTime ?? heroPacingMap.media.startTime;
  const endTime = heroConfig.endTime ?? heroPacingMap.media.endTime;
  const scrollDistanceVh = heroConfig.heroScrollDistanceVh
    ?? heroConfig.sequenceScrollDistanceVh
    ?? 10;
  const scrub = heroConfig.scrub ?? 0.5;
  const titleHoldDuration = heroConfig.titleHoldDuration ?? DEFAULT_TITLE_HOLD_DURATION;
  const paperConfig = heroConfig.paperTear || {};
  const tearSwapDuration = paperConfig.swapDuration ?? DEFAULT_TEAR_SWAP_DURATION;
  const tearDuration = paperConfig.duration ?? DEFAULT_TEAR_DURATION;
  const tearExitFade = paperConfig.exitFadeDuration ?? DEFAULT_TEAR_EXIT_FADE;
  const screens = gsap.utils.toArray(root.querySelectorAll('.motion-screen'));
  const screenContents = gsap.utils.toArray(root.querySelectorAll('.motion-screen-content'));
  const buttons = gsap.utils.toArray(root.querySelectorAll('.motion-power'));
  const dots = gsap.utils.toArray(root.querySelectorAll('.motion-power-rail i'));
  const finalFrame = paperConfig.image || heroConfig.finalFrame;
  const setHeroScrollHeight = () => {
    const desktopMotion = matchMedia(
      '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
    ).matches;
    if (desktopMotion) {
      heroScroll.style.height = `${Math.round(window.innerHeight * scrollDistanceVh)}px`;
    } else {
      heroScroll.style.removeProperty('height');
    }
  };
  setHeroScrollHeight();
  const shouldLoadPaper = matchMedia(
    '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
  ).matches;
  const paperPromise = shouldLoadPaper && finalFrame
    ? import('./paper-tear-transition.js')
      .then(({ createPaperTearTransition }) => createPaperTearTransition({
        canvas: paperCanvas,
        imageUrl: finalFrame,
        config: paperConfig,
      }))
      .catch((error) => {
        console.warn('Paper tear transition unavailable; using crossfade fallback', error);
        return null;
      })
    : Promise.resolve(null);
  const [ready, paperResult] = await Promise.all([
    waitForMetadata(video),
    paperPromise,
  ]);
  const paperTear = paperResult;
  root.classList.toggle('has-media-error', !ready);
  root.classList.toggle('has-paper-fallback', !paperTear);
  root.style.setProperty('--hero-scroll-distance', String(scrollDistanceVh));
  video.pause();
  const revealVideoFrame = () => {
    if (video.currentTime <= startTime) return;
    root.classList.add('has-hero-video-frame');
    video.removeEventListener('seeked', revealVideoFrame);
  };
  video.addEventListener('seeked', revealVideoFrame);

  const mm = gsap.matchMedia();
  let master = null;
  let seekController = null;

  mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
    root.classList.remove('is-motion-fallback');
    if (!ready) {
      revealFallback(root, video, screens, screenContents, buttons, dots);
      return undefined;
    }

    const hasPaperTear = Boolean(paperTear);
    const paperStart = FILM_DURATION + titleHoldDuration;
    const activeTransitionDuration = hasPaperTear
      ? tearSwapDuration + tearDuration
      : 0.36;
    const corridorRevealStart = hasPaperTear
      ? paperStart + tearSwapDuration
      : paperStart;
    const corridorStart = paperStart + activeTransitionDuration - (hasPaperTear ? tearExitFade : 0);
    const handoffComplete = hasPaperTear
      ? paperStart + tearSwapDuration + tearDuration
      : paperStart + 0.36;

    seekController = createSeekController(video, {
      fps: heroPacingMap.media.fps,
      minTime: startTime,
      maxTime: endTime,
    });
    seekController.jumpTo(startTime);

    const playhead = { progress: 0 };
    const holdState = { progress: 0 };
    const paperState = { progress: 0 };
    paperTear?.setProgress(0);
    gsap.set(hero, { autoAlpha: 1, clearProps: 'transform' });
    gsap.set(corridor, { autoAlpha: 0, zIndex: 1, clearProps: 'transform,clipPath' });
    gsap.set(paperLayer, { autoAlpha: 0 });
    buttons.forEach((_, index) => setPowerState(buttons, dots, index, false));

    /**
     * Animation contract — Hero -> About.
     * Owns video currentTime, hero/paper/corridor autoAlpha, and paper tear progress
     * across `resume-hero-tv-sequence`. Ownership passes hero -> paper -> corridor;
     * matchMedia cleanup kills the timeline/seek controller and resets paper state.
     */
    master = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        id: 'resume-hero-tv-sequence',
        trigger: heroScroll,
        start: 'top top',
        end: () => `+=${Math.round(window.innerHeight * scrollDistanceVh)}`,
        pin: stage,
        pinSpacing: false,
        scrub,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onRefreshInit: setHeroScrollHeight,
        onRefresh: () => video.pause(),
        onUpdate: (self) => {
          root.style.setProperty('--sequence-progress', self.progress.toFixed(4));
        },
      },
    });

    master
      .addLabel('film', 0)
      .to(playhead, {
        progress: 1,
        duration: FILM_DURATION,
        onUpdate: () => {
          video.pause();
          seekController.seekTo(mapHeroProgress(playhead.progress));
        },
      }, 'film')
      .addLabel('title-hold', FILM_DURATION)
      .to(holdState, { progress: 1, duration: titleHoldDuration }, 'title-hold');

    if (hasPaperTear) {
      master
        .addLabel('paper-tear', paperStart)
        .to(paperLayer, {
          autoAlpha: 1,
          duration: tearSwapDuration,
          ease: 'none',
        }, 'paper-tear')
        .set(hero, { autoAlpha: 0 }, `paper-tear+=${tearSwapDuration}`)
        .set(corridor, { autoAlpha: 1 }, `paper-tear+=${tearSwapDuration}`)
        .to(paperState, {
          progress: 1,
          duration: tearDuration,
          ease: 'none',
          onUpdate: () => paperTear.setProgress(paperState.progress),
        }, `paper-tear+=${tearSwapDuration}`)
        .to(paperLayer, {
          autoAlpha: 0,
          duration: tearExitFade,
          ease: 'power1.out',
        }, corridorStart - tearExitFade);
    } else {
      master
        .addLabel('paper-tear', paperStart)
        .fromTo(corridor, {
          autoAlpha: 0,
        }, {
          autoAlpha: 1,
          duration: 0.36,
          ease: 'none',
          immediateRender: false,
        }, 'paper-tear')
        .to(hero, { autoAlpha: 0, duration: 0.36, ease: 'none' }, 'paper-tear');
    }

    master
      .addLabel('about_handoff_complete', handoffComplete);

    master.eventCallback('onUpdate', () => {
      const previewActive = master.time() >= corridorRevealStart && master.progress() < 0.99999;
      root.classList.toggle('is-about-preview', previewActive);
      dispatchSection(previewActive ? 'about' : 'hero');
    });

    ScrollTrigger.refresh();

    return () => {
      master?.kill();
      seekController?.destroy();
      paperTear?.setProgress(0);
      gsap.set(paperLayer, { autoAlpha: 0 });
      root.classList.remove('is-about-preview');
      master = null;
      seekController = null;
    };
  });

  mm.add('(max-width: 767px), (prefers-reduced-motion: reduce)', () => {
    setHeroScrollHeight();
    paperTear?.setProgress(0);
    gsap.set(paperLayer, { autoAlpha: 0 });
    revealFallback(root, video, screens, screenContents, buttons, dots);
    return () => root.classList.remove('is-motion-fallback');
  });

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }

  const aboutController = initAboutSequence(animationMap);
  const skillsController = initSkillsSequence(animationMap);
  const experienceController = initExperienceSequence(animationMap, {
    contact: document.querySelector('[data-contact-phone]'),
    getSkillsTrigger: () => ScrollTrigger.getById('resume-skills-spray-wall'),
  });
  skillsController.setExperienceIntro(experienceController.syncPinnedIntro);
  ScrollTrigger.refresh();

  return {
    syncContactHandoff: experienceController.syncContactHandoff,
    scrollToSection(id, behavior = 'smooth') {
      if (id === 'about') {
        aboutController.scrollToStart(behavior);
        return true;
      }
      if (id === 'skills') {
        skillsController.scrollToStart(behavior);
        return true;
      }
      if (id === 'experience') {
        experienceController.scrollToStart(behavior);
        return true;
      }
      if (id !== 'hero' || !master?.scrollTrigger) return false;
      const trigger = master.scrollTrigger;
      const top = trigger.start;
      window.scrollTo({ top, behavior });
      return true;
    },
    destroy() {
      video.removeEventListener('seeked', revealVideoFrame);
      mm.revert();
      ScrollTrigger.getById('resume-hero-tv-sequence')?.kill();
      seekController?.destroy();
      master?.kill();
      aboutController.destroy();
      skillsController.destroy();
      experienceController.destroy();
      paperTear?.destroy();
    },
  };
};
