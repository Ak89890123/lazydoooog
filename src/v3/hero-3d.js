import { gsap } from 'gsap';
import { createLazyTitle } from './lazy-title.js';
import { createHeroTitle } from './hero-title.js';

// Prototype 3D Hero (?hero=3d, docs/v3-motion-contract.md). Owns the scene progress, the intro and
// About overlays and the hand-off: the works section waits under the pinned stage and takes over at
// the pin end, when the zoomed camera holds the exact framing of its TV row.
const band = (p, from, to) => gsap.utils.clamp(0, 1, (p - from) / (to - from));
// LAZY's window (scramble, then fold into the column) plays at LAZY_SPEED. The pin grows by the extra
// scroll it needs, so everything outside the window keeps its pace; the scene slows with it inside.
const LAZY_START = 0.18;
const LAZY_END = 0.20 + 0.16 / 0.7;
const LAZY_SPEED = 0.6;
const LAZY_EXTRA = (LAZY_END - LAZY_START) * (1 / LAZY_SPEED - 1);
const sceneProgress = (scroll) => {
  const t = scroll * (1 + LAZY_EXTRA);
  if (t < LAZY_START) return t;
  return t < LAZY_START + LAZY_EXTRA / (1 - LAZY_SPEED) ? LAZY_START + (t - LAZY_START) * LAZY_SPEED : t - LAZY_EXTRA;
};

export function initHero3d(section, works, config) {
  const stage = section.querySelector('[data-hero-stage]');
  const mount = section.querySelector('[data-hero-3d]');
  const intro = section.querySelector('[data-hero-intro]');
  const about = section.querySelector('[data-hero-about]');
  const backdrop = works.querySelector('[data-works-backdrop]');
  const worksUi = works.querySelectorAll('.tv-tag');
  const firstPreview = works.querySelector('.tv-screen img');
  const state = { progress: 0 };
  const lazy = createLazyTitle(about);
  const title = createHeroTitle(intro.querySelector('h1'));
  let scene = null;
  let destroyed = false;

  const paint = () => {
    const p = sceneProgress(state.progress);
    gsap.set(intro, { autoAlpha: 1 - band(p, 0.12, 0.19) });
    // The title starts dissolving early so it reads before the intro's gradient fades.
    title.progress(band(p, 0.04, 0.19));
    gsap.set(about, { autoAlpha: Math.min(band(p, 0.18, 0.20), 1 - band(p, 0.44, 0.51)) });
    // LAZY scrambles while About fades in, then folds; it finishes before About fades at 0.44.
    lazy.progress(band(p, LAZY_START, LAZY_END));
    scene?.setProgress(p);
  };
  // The stage hides only at the pin end. The works section continues that frame: its TVs stand where
  // the 3D ones did, over a copy of the same frame without them.
  const showStage = (on) => {
    if (!on) scene?.snapshot(backdrop);
    gsap.set(stage, { autoAlpha: on ? 1 : 0 });
    scene?.setShown(on);
    gsap.to(worksUi, { autoAlpha: on ? 0 : 1, duration: on ? 0 : 0.45, overwrite: true });
    // The scene normally plays CH 01 into a canvas that replaces this <img>. Where it cannot decode
    // the GIF, the 3D TV showed frame 0, and a new fragment restarts the real preview from it.
    if (!on && firstPreview && !firstPreview.hidden) firstPreview.src = `${firstPreview.getAttribute('src').split('#')[0]}#${Date.now()}`;
  };

  gsap.set(worksUi, { autoAlpha: 0 });
  const trigger = gsap.to(state, {
    progress: 1,
    ease: 'none',
    onUpdate: paint,
    scrollTrigger: {
      trigger: section,
      pin: stage,
      start: 'top top',
      end: () => `+=${innerHeight * config.scrollDistanceVh * (1 + LAZY_EXTRA)}`,
      scrub: config.scrub,
      invalidateOnRefresh: true,
      onRefresh: (self) => {
        scene?.layout();
        showStage(self.progress < 1);
      },
      onLeave: () => showStage(false),
      // Scrolling back, the works shelf's scrub is still gliding home. The stage returns at once: the
      // scene keeps its TVs that far along the belt, so they ride in while the camera pulls away.
      onEnterBack: () => showStage(true),
    },
  }).scrollTrigger;

  import('./hero-3d-scene.js')
    .then(({ createWorkshop }) => {
      if (destroyed) return;
      scene = createWorkshop(mount, works);
      scene.layout();
      showStage(trigger.progress < 1); // also start the moving backdrop when loaded below the hero
      paint();
    })
    .catch((error) => {
      console.warn('3D hero unavailable; showing the poster', error);
      mount.classList.add('is-failed');
      mount.dispatchEvent(new Event('v3-hero-ready', { bubbles: true }));
    });

  return () => {
    destroyed = true;
    mount.dispatchEvent(new Event('v3-hero-ready', { bubbles: true }));
    scene?.destroy();
    backdrop.width = 0;
    mount.classList.remove('is-failed');
    gsap.killTweensOf(worksUi);
    lazy.revert();
    title.revert();
    gsap.set([stage, intro, about, ...worksUi], { clearProps: 'opacity,visibility' });
  };
}
