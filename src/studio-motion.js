import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createSeekController, waitForMetadata } from './scroll-video.js';
import { mapHeroProgress } from './hero-pacing.js';
import { getStudioHeroState } from './studio-motion-math.js';

gsap.registerPlugin(ScrollTrigger);

export async function initStudioMotion(animationMap) {
  const config = animationMap.studio;
  const heroConfig = animationMap.sections.find(({ id }) => id === 'hero');
  const mm = gsap.matchMedia();
  if (document.documentElement.dataset.motion === 'reduced') return { destroy() {} };
  let destroyed = false;
  const video = document.querySelector('[data-studio-film-video]');
  const film = document.querySelector('[data-studio-film]');
  const paperLayer = document.querySelector('[data-studio-paper]');
  const art = document.querySelector('[data-world-hero]');
  const intro = [...document.querySelectorAll('[data-hero-intro]')];
  let mediaPromise;
  const loadMedia = () => {
    if (!mediaPromise) {
      video.querySelectorAll('[data-src]').forEach((source) => { source.src = source.dataset.src; });
      video.preload = 'auto';
      video.load();
      mediaPromise = waitForMetadata(video);
    }
    return mediaPromise;
  };
  const createResources = async () => {
    const outcomes = await Promise.allSettled([
      import('./studio-world.js').then(({ createStudioWorld }) => createStudioWorld(config.world)),
      import('./paper-tear-transition.js').then(({ createPaperTearTransition }) => createPaperTearTransition({ canvas: paperLayer.querySelector('canvas'), imageUrl: heroConfig.finalFrame, config: heroConfig.paperTear })),
      loadMedia(),
    ]);
    outcomes.forEach((outcome, index) => {
      if (outcome.status === 'rejected') console.warn(`Studio resource ${index} unavailable`, outcome.reason);
    });
    return {
      world: outcomes[0].status === 'fulfilled' ? outcomes[0].value : null,
      paper: outcomes[1].status === 'fulfilled' ? outcomes[1].value : null,
      videoReady: outcomes[2].status === 'fulfilled' && outcomes[2].value,
    };
  };

  mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', (context) => {
    let cancelled = false;
    let seek;
    let localWorld;
    let localPaper;
    let frameCallback = 0;
    let readyTime = -1;
    const heroState = { progress: 0 };
    const syncSurface = () => {
      const aboutTop = document.getElementById('about').getBoundingClientRect().top;
      const contactTop = document.getElementById('contact').getBoundingClientRect().top;
      if (contactTop < innerHeight) localWorld?.setSurface('contact');
      else if (aboutTop < innerHeight * 0.9) localWorld?.setSurface('about');
      else {
        const preview = getStudioHeroState(heroState.progress, config.hero.stages, Math.abs(readyTime - heroConfig.endTime) < 1 / 48).corridorVisible;
        localWorld?.setSurface(preview ? 'about' : 'hero', { preview });
      }
    };
    let paintHero = () => {};
    const onFrame = (_, metadata) => {
      frameCallback = 0;
      readyTime = metadata.mediaTime;
      film.classList.add('has-video-frame');
      paintHero();
    };
    const onSeeked = () => {
      if (video.requestVideoFrameCallback) {
        if (frameCallback) video.cancelVideoFrameCallback(frameCallback);
        frameCallback = video.requestVideoFrameCallback(onFrame);
      } else if (video.readyState >= 2) {
        readyTime = video.currentTime;
        film.classList.add('has-video-frame');
        paintHero();
      }
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('loadeddata', onSeeked);

    createResources().then((resources) => {
      localWorld = resources.world;
      localPaper = resources.paper;
      if (cancelled || destroyed) { localWorld?.destroy(); localPaper?.destroy(); return; }
      context.add(() => {
        const poweredScreens = [...document.querySelectorAll('[data-console-screen]')];
        if (resources.videoReady) {
          video.pause();
          seek = createSeekController(video, { fps: 48, minTime: heroConfig.startTime, maxTime: heroConfig.endTime, normalFrames: 2, catchUpFrames: 10 });
          paintHero = () => {
            const state = getStudioHeroState(heroState.progress, config.hero.stages, Math.abs(readyTime - heroConfig.endTime) < 1 / 48);
            seek.seekTo(mapHeroProgress(state.filmProgress));
            gsap.set(intro, { autoAlpha: state.introOpacity });
            gsap.set(film, { autoAlpha: state.filmOpacity });
            if (localPaper) {
              gsap.set(paperLayer, { autoAlpha: state.paperOpacity });
              localPaper.setProgress(state.tearProgress);
            } else if (state.corridorVisible) {
              gsap.set(film, { autoAlpha: 1 - state.tearProgress });
            }
            art.classList.toggle('is-corridor-preview', state.corridorVisible);
            gsap.set(art, { autoAlpha: state.corridorVisible ? 1 : state.introOpacity });
            syncSurface();
          };
          gsap.to(heroState, {
            progress: 1, ease: 'none', onUpdate: paintHero,
            scrollTrigger: { id: 'studio-hero', trigger: '#hero', pin: '[data-studio-hero-stage]', start: 'top top', end: () => `+=${innerHeight * config.hero.scrollDistanceVh}`, scrub: config.hero.scrub, anticipatePin: 1, invalidateOnRefresh: true },
          });
          paintHero();
        }
        const aboutState = { progress: 0 };
        gsap.to(aboutState, {
          progress: 1, ease: 'none',
          onUpdate: () => {
            localWorld?.setProgress(aboutState.progress);
            poweredScreens.forEach((screen, i) => screen.classList.toggle('is-powered', aboutState.progress >= config.world.screenUnlocks[i]));
          },
          scrollTrigger: {
            id: 'studio-about', trigger: '#about', pin: '[data-about-stage]', start: 'top top',
            end: () => `+=${innerHeight * config.about.scrollDistanceVh}`, scrub: config.about.scrub, anticipatePin: 1, invalidateOnRefresh: true,
          },
        });
        ScrollTrigger.create({ start: 0, end: 'max', onUpdate: syncSurface, onRefresh: syncSurface });
        document.querySelectorAll('.project-art').forEach((target) => {
          gsap.fromTo(target.firstElementChild, { y: 18, rotation: -2 }, { y: -18, rotation: 2, ease: 'none', scrollTrigger: { trigger: target, start: 'top bottom', end: 'bottom top', scrub: 0.8 } });
        });
        ScrollTrigger.sort();
        ScrollTrigger.refresh();
        if (location.hash) {
          const target = ScrollTrigger.getById(`studio-${location.hash.slice(1)}`);
          if (target) window.scrollTo({ top: target.start + 1, behavior: 'instant' });
          else document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' });
        }
        syncSurface();
      });
    });

    return () => {
      cancelled = true;
      seek?.destroy();
      video.pause();
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('loadeddata', onSeeked);
      if (frameCallback) video.cancelVideoFrameCallback(frameCallback);
      localWorld?.destroy();
      localPaper?.destroy();
      art.classList.remove('is-corridor-preview');
      gsap.set([...intro, art, film, paperLayer], { clearProps: 'opacity,visibility' });
      document.querySelectorAll('[data-console-screen]').forEach((screen) => screen.classList.remove('is-powered'));
    };
  });
  const progress = gsap.to('.page-progress span', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: document.documentElement, start: 0, end: 'max', scrub: true } });
  document.fonts?.ready.then(() => { if (!destroyed) ScrollTrigger.refresh(); });
  return { destroy() { destroyed = true; mm.revert(); progress.scrollTrigger?.kill(); progress.kill(); } };
}
