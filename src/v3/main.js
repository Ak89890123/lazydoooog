import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import animationMap from '../animation-map.json';
import tv from './tv-frames.json';
import { collectWorks, fitTvPicture, renderWorks } from './works.js';
import { initHero } from './hero.js';
import { initHero3d } from './hero-3d.js';
import { initSkateGame } from './skate-game.js';
import { initSkateRunner, showUnlocks } from './skate-runner.js';
import { initCareerJourney } from './career-journey.js';

gsap.registerPlugin(ScrollTrigger);

const MOTION = '(min-width: 768px) and (prefers-reduced-motion: no-preference)';
const ZOOM_VH = 1.5; // scroll length of the transition TV, in viewport heights: a hold, then the push into it
const HOLD = 0.2; // share of that length where the centred transition TV just shows the next scene
const html = document.documentElement;
const HERO_3D = html.classList.contains('is-hero3d');
const RUNNER = html.classList.contains('is-runner'); // ?game=runner: the scroll run replaces the game
const $ = (selector, scope = document) => scope.querySelector(selector);
// Reduced motion jumps instead of smooth-scrolling (in-page links and the TV remote).
const scrollBehavior = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
const heroMedia = animationMap.sections.find(({ id }) => id === 'hero');

// Drop-in works: works/<folder>/work.json + one preview file (see works/README.md).
const works = collectWorks(
  import.meta.glob('/works/*/work.json', { eager: true, import: 'default' }),
  import.meta.glob('/works/*/preview.{gif,webp,png,jpg}', { eager: true, query: '?url', import: 'default' }),
);
$('[data-tv-wall]').innerHTML = renderWorks(works, tv.frames);

// Works channel: the TV nearest the centre is "on". Motion pins the section and scrubs the shelf;
// static reading uses native horizontal scrolling with snap points. With reverse (the 3D hero), the
// shelf is the conveyor that printed the TVs: CH 01 starts at its right end and later channels arrive
// from the left as it moves right. In motion a transition TV follows the last channel: its screen shows
// a copy of the next section, and the view pushes into it until the copy stands 1:1 over the real
// section, which waits under the pin (v3.css).
function initChannels(section, reverse) {
  const viewport = $('[data-tv-viewport]', section);
  const track = $('[data-tv-wall]', section);
  const tvs = [...track.querySelectorAll('.tv')];
  const exit = $('.tv-exit', track);
  const stops = [...tvs, exit];
  const next = section.nextElementSibling;
  const label = $('[data-channel]', section);
  const pad = (n) => String(n).padStart(2, '0');
  let active = -1;
  let trigger = null;
  let mirror = () => {};
  let powerFeed = () => {};
  const centers = (items) => items.map((item) => item.offsetLeft + item.offsetWidth / 2);
  const nearest = (center, items = tvs) => centers(items).reduce((best, x, i, all) => (Math.abs(x - center) < Math.abs(all[best] - center) ? i : best), 0);
  const travel = () => Math.max(0, track.offsetWidth - innerWidth);
  const progressAt = (index) => {
    const along = travel() ? gsap.utils.clamp(0, 1, (centers(stops)[index] - innerWidth / 2) / travel()) : 0;
    return reverse ? 1 - along : along;
  };
  // Index tvs.length is the transition TV: it has no channel number, and turning it on renews its picture.
  const setActive = (index) => {
    if (index === active || !tvs.length) return;
    active = index;
    stops.forEach((item, i) => item.classList.toggle('is-on', i === index));
    if (index < tvs.length) label.textContent = `CH ${pad(index + 1)} / ${pad(tvs.length)}`;
    else mirror();
    powerFeed(index === tvs.length);
  };
  const goTo = (index) => {
    const i = Math.max(0, Math.min(tvs.length - 1, index));
    const center = centers(tvs)[i];
    if (trigger) {
      window.scrollTo({ top: trigger.start + progressAt(i) * (trigger.end - trigger.start), behavior: scrollBehavior() });
    } else {
      viewport.scrollTo({ left: center - viewport.clientWidth / 2, behavior: scrollBehavior() });
    }
  };
  $('[data-channel-prev]', section).addEventListener('click', () => goTo(active - 1));
  $('[data-channel-next]', section).addEventListener('click', () => goTo(active + 1));
  viewport.addEventListener('scroll', () => {
    if (!trigger) setActive(nearest(viewport.scrollLeft + viewport.clientWidth / 2));
  }, { passive: true });
  track.addEventListener('focusin', (event) => {
    const index = tvs.findIndex((item) => item.contains(event.target));
    if (index >= 0 && trigger) goTo(index);
  });
  setActive(0);
  return {
    pin() {
      const pin = $('[data-works-pin]', section);
      const layers = [$('[data-works-backdrop]', section), $('.section-head', section), viewport];
      const screen = $('.tv-screen', exit);
      const liveCanvases = [...next.querySelectorAll('canvas')];
      const feed = RUNNER ? document.createElement('div') : $('.tv-feed', exit);
      if (RUNNER) {
        feed.className = 'runner-picture';
        feed.hidden = true;
        pin.append(feed);
      }
      const refreshModels = () => { if (active === tvs.length) mirror(); };
      next.addEventListener('runner-model-ready', refreshModels);
      const refreshFrame = () => {
        if (active === tvs.length) feed.querySelector('canvas')?.getContext('2d').drawImage(liveCanvases[0], 0, 0);
      };
      next.addEventListener('runner-frame', refreshFrame);
      const glide = () => Math.max(innerHeight * 0.6, travel());
      let plan = null;
      const boot = { open: 0.012 };
      let bootTween = null;
      // Cover the visible part of the glass, then end at the viewport's exact size and position.
      // Use the zoom plan rather than reading layout on each scrub frame.
      const fillFeed = () => {
        const copy = feed.firstElementChild;
        if (!RUNNER || !copy) return;
        const zoom = gsap.getProperty(viewport, 'scale');
        const [cx, cy, w, h] = zoomPlan().screen;
        const sx = cx + (gsap.getProperty(track, 'x') - (reverse ? 0 : -travel())) * zoom;
        const { x, y, scale } = fitTvPicture([sx, cy, w, h], zoom, innerWidth, innerHeight);
        // Draw once in pin pixels, behind the bezel. Opposing parent/child scales jitter in Chrome's
        // raster compositor even when getBoundingClientRect() reports a stationary picture.
        feed.hidden = active !== tvs.length;
        const visibleHeight = h * zoom * boot.open;
        feed.style.clipPath = `inset(${Math.max(0, cy - visibleHeight / 2)}px ${Math.max(0, innerWidth - sx - w * zoom / 2)}px ${Math.max(0, innerHeight - cy - visibleHeight / 2)}px ${Math.max(0, sx - w * zoom / 2)}px)`;
        Object.assign(copy.style, {
          left: `${sx + (x - w / 2) * zoom}px`,
          top: `${cy + (y - h / 2) * zoom}px`,
          transform: `scale(${scale * zoom})`,
        });
      };
      powerFeed = (on) => {
        if (!RUNNER) return;
        bootTween?.kill();
        boot.open = 0.012;
        gsap.set(feed, { opacity: 0.2, filter: 'brightness(2.6) saturate(0.3)' });
        if (on) {
          bootTween = gsap.timeline({ onUpdate: fillFeed })
            .to(boot, { open: 1, duration: 0.42, ease: 'power3.out' }, 0)
            .to(feed, { opacity: 1, duration: 0.2, ease: 'none' }, 0)
            .to(feed, { filter: 'brightness(1) saturate(1)', duration: 0.6, ease: 'power1.out' }, 0);
          if (gsap.getProperty(viewport, 'scale') > 1) bootTween.progress(1);
        }
        fillFeed();
      };
      // Measured at scale 1 with the shelf at its end, in pin coordinates: the transition screen's centre
      // becomes every layer's transform origin (part of the tween, so a refresh cannot reset it), and the
      // end scale makes that screen (plus room for the bezel's rounded corners) cover the viewport.
      // Scale grows exponentially, so the push keeps one speed.
      const zoomPlan = () => {
        if (plan) return plan;
        const scales = layers.map((el) => gsap.getProperty(el, 'scale'));
        gsap.set(layers, { scale: 1 });
        const [frame, box, ...rects] = [pin, screen, ...layers].map((el) => el.getBoundingClientRect());
        layers.forEach((el, i) => gsap.set(el, { scale: scales[i] }));
        const left = box.left + (reverse ? 0 : -travel()) - gsap.getProperty(track, 'x') - frame.left;
        const top = box.top - frame.top;
        const [cx, cy] = [left + box.width / 2, top + box.height / 2];
        const origins = rects.map((r) => `${frame.left + cx - r.left}px ${frame.top + cy - r.top}px`);
        const end = 1.2 * Math.max(Math.max(cx, frame.width - cx) / (box.width / 2), Math.max(cy, frame.height - cy) / (box.height / 2));
        // The copy ends 1:1 at the pin's top left, so before the push it stands at origin × (1 − 1/end).
        return (plan = { end, origins, screen: [cx, cy, box.width, box.height], copy: [cx - cx / end - left, cy - cy / end - top] });
      };
      // The transition TV's picture: a copy of the next section, sized and placed so that at the end of
      // the push it stands 1:1 where the real one then is, at the pin's top. Canvases keep their frame.
      mirror = () => {
        const { end, copy: [x, y] } = zoomPlan();
        const copy = next.cloneNode(true);
        if (RUNNER && !copy.querySelector('[data-game] > canvas')) {
          const image = liveCanvases[0].cloneNode();
          image.classList.remove('career-street'); image.style.removeProperty('opacity');
          copy.querySelector('[data-game]').prepend(image);
        }
        copy.removeAttribute('id');
        copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
        copy.inert = true;
        const live = liveCanvases;
        copy.querySelectorAll('canvas').forEach((canvas, i) => canvas.getContext('2d').drawImage(live[i], 0, 0));
        Object.assign(copy.style, {
          position: 'absolute',
          margin: '0',
          width: `${next.offsetWidth}px`,
          height: `${next.offsetHeight}px`,
          left: `${x}px`,
          top: `${y}px`,
          transform: `scale(${1 / end})`,
          transformOrigin: '0 0',
        });
        feed.replaceChildren(copy);
        fillFeed();
      };
      ScrollTrigger.create({ trigger: section, pin, start: 'top top', end: () => `+=${glide() + innerHeight * ZOOM_VH}` });
      const syncChannel = () => {
        if (ScrollTrigger.isRefreshing) return;
        setActive(nearest(innerWidth / 2 - gsap.getProperty(track, 'x'), stops));
        fillFeed();
      };
      ScrollTrigger.addEventListener('refresh', syncChannel);
      const tween = gsap.fromTo(track, { x: () => (reverse ? -travel() : 0) }, {
        x: () => (reverse ? 0 : -travel()),
        ease: 'none',
        onUpdate: syncChannel,
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => `+=${glide()}`,
          scrub: 0.6,
          invalidateOnRefresh: true,
          // Refresh can restore the finished tween without firing its onUpdate again.
          onRefresh: syncChannel,
        },
      });
      gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: () => `top+=${glide()} top`,
          end: () => `+=${innerHeight * ZOOM_VH}`,
          // The pin releases at this scroll position, so the picture must arrive on the same frame.
          scrub: true,
          invalidateOnRefresh: true,
          // Every refresh measures the works DOM unscaled (this plan and the 3D hero's landing).
          onRefreshInit: () => {
            plan = null;
            return gsap.set(layers, { scale: 1 });
          },
          onRefresh: () => active === tvs.length && mirror(),
        },
        // The aligned copy yields immediately: a timed fade would move the released pin over the
        // fixed runner. Scrolling back restores the TV on the same frame.
        onUpdate() {
          if (this.progress() > HOLD) bootTween?.progress(1);
          fillFeed();
          pin.classList.toggle('is-through', this.progress() === 1);
        },
      })
        .fromTo(layers, { scale: 1, transformOrigin: (i) => zoomPlan().origins[i] }, {
          scale: () => zoomPlan().end,
          transformOrigin: (i) => zoomPlan().origins[i],
          ease: (t) => (zoomPlan().end ** t - 1) / (zoomPlan().end - 1),
          duration: 1 - HOLD,
        }, HOLD)
        // The screen glass would be magnified as much as the picture; it clears while the push runs.
        .fromTo(exit, { '--glass': 1 }, { '--glass': 0, ease: 'none', duration: 1 - HOLD }, HOLD);
      trigger = tween.scrollTrigger;
      // Match the runner's one-gesture/one-ad glide, including trackpad momentum.
      // The preceding hero's spacer can receive the hit, so listen on window within this scroll range.
      let wheelTween = null, wheelAt = -Infinity;
      const wheel = (event) => {
        const { start, end } = trigger;
        if (event.ctrlKey || !event.deltaY || scrollY < start - 1 || scrollY > end + 1) return;
        const fresh = event.timeStamp - wheelAt > 200; // same quiet gap as the runner
        wheelAt = event.timeStamp;
        if (wheelTween?.isActive() || !fresh) { event.preventDefault(); return; }
        const positions = stops.map((_, i) => start + progressAt(i) * (end - start));
        const target = event.deltaY > 0
          ? positions.find((y) => y > scrollY + 1)
          : positions.findLast((y) => y < scrollY - 1);
        if (target === undefined) return; // a new gesture at either end enters the hero or TV zoom
        event.preventDefault();
        const scroll = { y: scrollY };
        let last = scrollY;
        wheelTween = gsap.to(scroll, {
          y: Math.round(target), duration: 0.8, ease: 'power2.inOut',
          onUpdate: () => {
            if (Math.abs(scrollY - last) > 1) return wheelTween.kill(); // keys, scrollbar or a link took over
            scrollTo(0, scroll.y);
            last = scrollY;
          },
        });
      };
      window.addEventListener('wheel', wheel, { passive: false });
      if (RUNNER && active === tvs.length) {
        mirror();
        powerFeed(true);
      }
      return () => {
        ScrollTrigger.removeEventListener('refresh', syncChannel);
        window.removeEventListener('wheel', wheel);
        wheelTween?.kill();
        trigger = null;
        mirror = () => {};
        powerFeed = () => {};
        bootTween?.kill();
        feed.replaceChildren();
        if (RUNNER) feed.remove();
        next.removeEventListener('runner-model-ready', refreshModels);
        next.removeEventListener('runner-frame', refreshFrame);
        pin.classList.remove('is-through');
        gsap.set(layers, { clearProps: 'transform,transformOrigin' });
      };
    },
  };
}

function startPhoneClock() {
  const times = document.querySelectorAll('[data-phone-time]');
  const date = $('[data-phone-date]');
  const timeFormat = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dateFormat = new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' });
  const tick = () => {
    const now = new Date();
    times.forEach((el) => { el.textContent = timeFormat.format(now); });
    date.textContent = dateFormat.format(now);
  };
  tick();
  setInterval(tick, 30000);
}

function initNav() {
  const links = [...document.querySelectorAll('[data-nav]')];
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.target.id === 'experience' && entry.target.classList.contains('is-space')) return;
      if (entry.isIntersecting) links.forEach((link) => link.classList.toggle('is-active', link.dataset.nav === entry.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('main > section').forEach((section) => observer.observe(section));
  const bar = $('[data-progress]');
  let frame = 0;
  const paint = () => {
    frame = 0;
    const max = html.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
  };
  addEventListener('scroll', () => { frame ||= requestAnimationFrame(paint); }, { passive: true });
  paint();
  // In-page links scroll smoothly from JS (CSS smooth scrolling would break ScrollTrigger) and move focus.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    const target = link && document.getElementById(link.hash.slice(1));
    if (!target) return;
    event.preventDefault();
    if (target.id === 'experience' && target.classList.contains('is-space')) $('[data-career-stop="0"]', target).click();
    else scrollTo({ top: target.getBoundingClientRect().top + scrollY, behavior: scrollBehavior() });
    history.pushState(null, '', link.hash);
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
}

const channels = initChannels($('#works'), HERO_3D);
if (RUNNER) showUnlocks($('#game'));
else initSkateGame($('#game'), tv.obstacles);
startPhoneClock();
initNav();

if (/[?&]motion=off\b/.test(location.search)) {
  html.classList.remove('is-motion');
} else {
  gsap.matchMedia().add(MOTION, () => {
    html.classList.add('is-motion');
    const hero = HERO_3D
      ? initHero3d($('#hero'), $('#works'), animationMap.v3.hero3d)
      : initHero($('#hero'), heroMedia, animationMap.v3.hero);
    // Pinned triggers are created in page order so each start counts the pins above it.
    const cleanups = [
      hero,
      channels.pin(),
      RUNNER ? initSkateRunner($('#game'), animationMap.v3.runner, animationMap.v3.experience.groundHole) : null,
      initCareerJourney($('#experience'), animationMap.v3.experience, RUNNER ? $('#game canvas') : null, $('[data-phone]')),
    ];
    ScrollTrigger.refresh();
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    return () => {
      cleanups.forEach((cleanup) => cleanup?.());
      html.classList.remove('is-motion');
    };
  });
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  document.fonts?.addEventListener('loadingdone', () => ScrollTrigger.refresh());
}
