import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { careerDistance, careerFrame, careerPhone, careerPose, careerStopProgress, PAPER_HEIGHT, PHONE_HEIGHT, PLANET_TOP } from './career-flight.js';

gsap.registerPlugin(SplitText);
const clamp = gsap.utils.clamp(0, 1);
const smooth = (t) => { const v = clamp(t); return v * v * (3 - 2 * v); };
// The street's camera dives into the throat until 0.95 (skate-runner.js): the street fades out inside it and
// space opens out of the black.
const arrival = (transition) => smooth((transition - 0.92) / 0.08);
// Journey either side of a stop over which its spread arrives or leaves; the two never share the stage.
const REACH = 0.4;
const PAPER_FACES = [
  { src: '/assets/v3/dog-suit.webp', size: 1, seed: 7 },
  { src: '/assets/v3/rocket.webp', size: 0.82, seed: 19 },
];
// A click on the docked sticker crumples it, holds a beat as a ball, then unfolds it again.
const replayState = (face, q) => (q < 0.4
  ? { face, t: q / 0.4, opening: false }
  : { face, t: Math.max(0, q - 0.5) / 0.5, opening: true });

export function initCareerJourney(section, config, streetCanvas, phone) {
  const flight = streetCanvas ? config : { ...config, transitionVh: config.entryVh };
  const pin = section.querySelector('[data-space-pin]');
  const canvas = section.querySelector('[data-space-canvas]');
  const paperCanvas = section.querySelector('[data-paper-canvas]');
  const stops = [...section.querySelectorAll('[data-stop]')];
  const heads = stops.map((stop) => stop.querySelector('h3'));
  const buttons = [...section.querySelectorAll('[data-career-stop]')];
  const title = section.querySelector('.section-head');
  const nav = section.querySelector('[data-career-nav]');
  const sourceCard = streetCanvas?.closest('[data-game]').querySelector('[data-runner-ad]');
  const streetParent = streetCanvas?.parentNode;
  const streetNext = streetCanvas?.nextSibling;
  const streetCard = sourceCard?.cloneNode(true);
  if (streetCard) { streetCard.inert = true; pin.append(streetCard); }
  // The flight ends on the contact phone: it lives in the pin, under the rocket sticker, until cleanup.
  const phoneHome = phone.parentNode;
  const notice = phone.querySelector('[data-phone-notice]');
  pin.insertBefore(phone, paperCanvas);
  const state = { progress: 0 };
  const stage = { width: 0, height: 0 };
  const phoneWidth = phone.offsetWidth;
  const phoneHeight = phone.offsetHeight;
  const replay = { q: 1 };
  let live = true;
  let view = null;
  let paper = null;
  let paperSide = 0;
  let paperFlat = false;
  let replayTween;
  let tween;
  let trigger;
  section.classList.add('is-space');
  section.classList.toggle('is-space-handoff', Boolean(streetCanvas));
  // One paused timeline per spread, scrubbed by render: time 0 -> 1 arrives, 1 holds for reading, 1 -> 2 leaves.
  // The flight carries the world down the screen, so every letter drops into its line mask and out of it again.
  let spreads;
  const type = gsap.context(() => {
    spreads = stops.map((stop, i) => {
      const { chars } = SplitText.create(heads[i], { type: 'chars' });
      const copy = stop.querySelectorAll('.stop-kicker, .stop-org, ul > li');
      return gsap.timeline({ paused: true })
        .from(chars, { yPercent: -112, duration: 0.6, ease: 'power3.out', stagger: { amount: 0.4 } })
        .from(heads[i], { '--rule': 0, duration: 0.6, ease: 'power2.inOut' }, 0.2)
        .from(copy, { autoAlpha: 0, y: -24, duration: 0.4, ease: 'power2.out', stagger: { amount: 0.3 } }, 0.3)
        .to(chars, { yPercent: 112, duration: 0.6, ease: 'power3.in', stagger: { amount: 0.4 } }, 1)
        .to(copy, { autoAlpha: 0, y: 24, duration: 0.4, ease: 'power2.in', stagger: { amount: 0.2 } }, 1)
        .to(heads[i], { '--rule': 0, duration: 0.6, ease: 'power2.inOut' }, 1.4);
    });
  });
  // v3.css sizes a masthead to its row; here it shrinks until its widest line fits the measure. A single line
  // the row keeps short of the measure is tracked out to both margins instead.
  const fit = () => heads.forEach((head) => {
    head.style.fontSize = head.style.letterSpacing = '';
    const cap = parseFloat(getComputedStyle(head).fontSize);
    const widest = Math.max(...[...head.children].map((line) => line.getBoundingClientRect().width));
    const size = Math.min(cap, Math.floor(cap * head.clientWidth / widest));
    head.style.fontSize = `${size}px`;
    if (head.children.length > 1) return;
    const slack = head.clientWidth - widest * size / cap;
    head.style.letterSpacing = `${Math.min(size * 0.6, slack / (head.textContent.length - 1))}px`;
  });
  const render = () => {
    const frame = careerFrame(state.progress, flight, stops.length);
    const entered = !streetCanvas || trigger?.progress > 0;
    if (streetCanvas) {
      if (entered && streetCanvas.parentNode !== pin) {
        pin.insertBefore(streetCanvas, canvas);
        streetCanvas.classList.add('career-street');
      } else if (!entered && streetCanvas.parentNode === pin) {
        streetParent.insertBefore(streetCanvas, streetNext);
        streetCanvas.classList.remove('career-street');
        streetCanvas.style.removeProperty('opacity');
      }
      if (entered) streetCanvas.style.opacity = String(1 - smooth((frame.transition - 0.9) / 0.06));
      canvas.style.opacity = String(arrival(frame.transition));
    }
    streetCanvas?.dispatchEvent(new CustomEvent('runner-collapse', { detail: entered ? frame.transition : 0 }));
    pin.style.opacity = entered ? '1' : '0';
    const reveal = arrival(frame.transition);
    const drop = careerPhone(frame.exit);
    // The section title and station rail leave with the rocket, before the phone comes out.
    const leaving = smooth(frame.exit / 0.3);
    const chrome = reveal * (1 - leaving);
    title.style.opacity = String(chrome);
    nav.style.opacity = String(chrome);
    nav.inert = chrome < 0.1 || !entered;
    if (streetCard && frame.transition < 0.16) {
      if (streetCard.innerHTML !== sourceCard.innerHTML) streetCard.innerHTML = sourceCard.innerHTML;
      streetCard.className = sourceCard.className;
      streetCard.style.cssText = sourceCard.style.cssText;
    }
    if (streetCard) streetCard.style.opacity = String((1 - smooth(frame.transition / 0.16)) * Number(sourceCard.style.opacity));
    stops.forEach((stop, i) => {
      const away = frame.journey - i;
      const time = away > 0 ? 1 + Math.max(clamp(away / REACH), leaving) : reveal * clamp(1 + away / REACH);
      spreads[i].time(time);
      const current = time > 0 && time < 2 && entered;
      stop.classList.toggle('is-current', current);
      stop.setAttribute('aria-hidden', String(!current));
      stop.inert = !current;
      buttons[i].classList.toggle('is-current', i === Math.round(frame.journey) && entered);
      if (i === Math.round(frame.journey) && entered) buttons[i].setAttribute('aria-current', 'step');
      else buttons[i].removeAttribute('aria-current');
    });
    section.style.setProperty('--street-mix', String(1 - smooth(frame.transition / 0.45)));
    // The emptied contact section has no height for the page observer, so the phone keeps the nav past the end.
    if (trigger?.progress > 0) {
      const owner = drop.shown ? 'contact' : 'experience';
      document.querySelectorAll('[data-nav]').forEach((link) => link.classList.toggle('is-active', link.dataset.nav === owner));
    }
    if (entered) view?.render(frame);
    phone.style.visibility = entered && drop.shown ? 'visible' : 'hidden';
    phone.inert = frame.exit < 0.9;
    phone.style.transform = `translate(${drop.x * stage.width - phoneWidth / 2}px, ${drop.y * stage.height - phoneHeight / 2}px) rotate(${drop.angle}rad) scale(${drop.scale * stage.height * PHONE_HEIGHT / phoneHeight})`;
    notice.style.opacity = String(drop.notice);
    notice.style.transform = `translateY(${(drop.notice - 1) * 16}px)`;
    if (paper) {
      // The suit unfolds out of the black hole with the planets; afterwards the scroll frame owns the morphs.
      let sheet = reveal < 1 ? { face: 0, t: reveal, opening: true } : frame.paper;
      paperFlat = sheet.opening && sheet.t === 1;
      if (replay.q < 1 && paperFlat) sheet = replayState(sheet.face, replay.q);
      else if (replay.q < 1) { replayTween.kill(); replay.q = 1; }
      const pose = careerPose(frame, reveal);
      paperCanvas.style.visibility = entered && reveal > 0 ? 'visible' : 'hidden';
      paperCanvas.style.transform = `translate(${pose.x * stage.width - paperSide / 2}px, ${pose.y * stage.height - paperSide / 2}px) rotate(${pose.angle}rad) scale(${pose.scale * reveal})`;
      paper.draw(sheet);
    }
  };
  tween = gsap.to(state, {
    progress: 1, ease: 'none', onUpdate: render,
    scrollTrigger: {
      id: 'career-journey', trigger: section, pin, start: 'top top',
      end: () => `+=${innerHeight * careerDistance(flight, stops.length)}`,
      scrub: config.scrub, anticipatePin: 1, invalidateOnRefresh: true,
      // Fonts that finish loading refresh the triggers (main.js): the mastheads are measured again.
      onToggle: render, onRefresh: () => { fit(); render(); },
      onLeaveBack: () => {
        pin.style.opacity = streetCanvas ? '0' : '1';
        nav.inert = true;
        document.querySelectorAll('[data-nav]').forEach((link) => link.classList.toggle('is-active', link.dataset.nav === 'game'));
      },
    },
  });
  trigger = tween.scrollTrigger;
  const jump = (event) => {
    const button = event.target.closest('[data-career-stop]');
    if (!button) return;
    const progress = careerStopProgress(Number(button.dataset.careerStop), flight, stops.length);
    scrollTo({ top: trigger.start + progress * (trigger.end - trigger.start), behavior: 'smooth' });
  };
  nav.addEventListener('click', jump);
  const replayPaper = () => {
    if (!paperFlat || replay.q < 1) return;
    replayTween = gsap.fromTo(replay, { q: 0 }, { q: 1, duration: 1.8, ease: 'none', onUpdate: render });
  };
  paperCanvas.addEventListener('click', replayPaper);
  const redrawStreet = () => {
    if (trigger.isActive && careerFrame(state.progress, flight, stops.length).transition < 1) render();
  };
  streetCanvas?.addEventListener('runner-frame', redrawStreet);
  streetCanvas?.addEventListener('runner-model-ready', redrawStreet);
  const resize = new ResizeObserver(() => {
    stage.width = pin.clientWidth;
    stage.height = pin.clientHeight;
    view?.resize(stage.width, stage.height);
    paperSide = paper?.resize(stage.height * PAPER_HEIGHT) ?? 0;
    fit();
    render();
  });
  resize.observe(pin);
  const reset = () => {
    section.classList.remove('is-space', 'is-space-handoff');
    section.style.removeProperty('--street-mix');
    if (streetCanvas) {
      streetParent.insertBefore(streetCanvas, streetNext);
      streetCanvas.classList.remove('career-street');
      streetCanvas.style.removeProperty('opacity');
      canvas.style.removeProperty('opacity');
    }
    pin.style.removeProperty('opacity');
    ['transform', 'visibility', 'width', 'height'].forEach((property) => paperCanvas.style.removeProperty(property));
    phoneHome.append(phone);
    phone.inert = false;
    ['transform', 'visibility'].forEach((property) => phone.style.removeProperty(property));
    ['transform', 'opacity'].forEach((property) => notice.style.removeProperty(property));
    title.style.removeProperty('opacity');
    nav.style.removeProperty('opacity');
    nav.inert = false;
    heads.forEach((head) => { head.style.fontSize = head.style.letterSpacing = ''; });
    stops.forEach((stop, i) => {
      stop.classList.remove('is-current');
      stop.removeAttribute('aria-hidden');
      stop.inert = false;
      buttons[i].classList.remove('is-current');
      buttons[i].removeAttribute('aria-current');
    });
  };
  const cleanup = () => {
    if (!live) return;
    live = false;
    resize.disconnect();
    nav.removeEventListener('click', jump);
    paperCanvas.removeEventListener('click', replayPaper);
    replayTween?.kill();
    paper?.dispose();
    paper = null;
    streetCanvas?.removeEventListener('runner-frame', redrawStreet);
    streetCanvas?.removeEventListener('runner-model-ready', redrawStreet);
    streetCanvas?.dispatchEvent(new CustomEvent('runner-collapse', { detail: 0 }));
    trigger.kill();
    tween.kill();
    view?.dispose();
    view = null;
    streetCard?.remove();
    type.revert();
    reset();
  };
  Promise.all([import('three'), import('./career-universe.js'), import('./paper-crumple.js')]).then(([THREE, { createCareerUniverse }, { createPaperCrumple }]) => {
    if (!live) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, config.pixelRatioCap));
    const universe = createCareerUniverse(THREE, PLANET_TOP);
    paper = createPaperCrumple(paperCanvas, PAPER_FACES, render);
    stage.width = pin.clientWidth;
    stage.height = pin.clientHeight;
    paperSide = paper.resize(stage.height * PAPER_HEIGHT);
    // compileAsync polls on a timer that throws once its materials are disposed: release after it settles.
    const compiled = renderer.compileAsync(universe.scene, universe.camera);
    view = {
      resize(width, height) {
        renderer.setSize(width, height, false);
        universe.resize(width, height);
      },
      render(frame) {
        if (!streetCanvas || frame.transition > 0.92) {
          universe.update(frame.journey, frame.travel, arrival(frame.transition));
          renderer.render(universe.scene, universe.camera);
        }
      },
      dispose() {
        compiled.then(() => { universe.dispose(); renderer.dispose(); });
      },
    };
    view.resize(pin.clientWidth, pin.clientHeight);
    compiled.then(() => {
      if (!live) return;
      renderer.render(universe.scene, universe.camera);
      render();
    });
    render();
  }).catch((error) => {
    if (!live) return;
    console.warn('Career universe unavailable; showing the readable timeline', error);
    cleanup();
    ScrollTrigger.refresh();
  });
  render();
  return cleanup;
}
