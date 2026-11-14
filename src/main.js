import './styles.css';
import './hero-tv.css';
import animationMap from './animation-map.json';
import { initScrollVideo } from './scroll-video.js';
import { resumeSections, skillGroups } from './sections/resume-content.js';
import { renderContactCameraApp } from './contact-phone.js';
import { initContactPhoneScene } from './contact-phone-scene.js';

document.documentElement.classList.add('js');

const app = document.querySelector('#app');
const directContact = location.hash === '#contact';
const directMotionSection = ['#about', '#skills', '#experience'].includes(location.hash)
  ? location.hash
  : null;
if (directContact || directMotionSection) {
  history.replaceState(null, '', `${location.pathname}${location.search}`);
}
const aboutSection = resumeSections.find((section) => section.id === 'about');
const contactSection = resumeSections.find((section) => section.id === 'contact');
const freeSprayColorNames = ['暖膚赭色', '胡桃褐色', '橄欖綠色', '煙霧藍色'];
const contactHandoffConfig = animationMap.sections.find((section) => section.id === 'contact') || {};
const contactHandoffStripCount = contactHandoffConfig.stripCount;
const contactHandoffStrips = Array.from(
  { length: contactHandoffStripCount },
  (_, index) => {
    const y = index / contactHandoffStripCount;
    const height = 1 / contactHandoffStripCount + 0.002;
    return `<rect x="0" y="${y.toFixed(6)}" width="1" height="${height.toFixed(6)}" data-contact-handoff-strip />`;
  },
).join('');

const renderSkillsTitle = () => `
  <h2 id="skills-title" class="skills-title" data-skills-title>
    <span class="skills-title__mask" data-skills-title-line>
      <span class="skills-title__text">技能</span>
    </span>
    <span class="skills-title__mask" data-skills-title-line>
      <span class="skills-title__text">組成能運作的<span class="skills-title__system-mask"><span class="skills-title__system" data-skills-title-system>系統</span></span></span>
    </span>
  </h2>
`;

const renderHeroTvSequence = (about) => `
  <section class="hero-tv-sequence" data-hero-tv-sequence aria-label="Hero 與三螢幕控制室動畫">
    <div class="motion-hero-scroll" data-hero-scroll>
      <div class="motion-stage">
        <section id="hero" class="motion-scene motion-hero" data-section aria-labelledby="hero-title">
          <div class="motion-hero-media" aria-hidden="true">
            <img src="/assets/posters/hero-title-scroll-v2.jpg" alt="" decoding="async" />
            <video data-hero-video muted playsinline preload="auto" poster="/assets/posters/hero-title-scroll-v2.jpg">
              <source src="/assets/videos/hero-title-scroll-v2-48fps-delivery.mp4" type="video/mp4" />
              <source src="/assets/videos/hero-title-scroll-v2-24fps-delivery.mp4" type="video/mp4" />
            </video>
          </div>
          <h1 id="hero-title" class="sr-only">LazyDoooog</h1>
        </section>

        <div class="motion-paper-tear" data-paper-tear aria-hidden="true">
          <canvas class="motion-paper-canvas" data-paper-tear-canvas></canvas>
        </div>
      </div>
    </div>

    <section id="about" class="motion-about-slot" data-section data-about-sequence aria-labelledby="about-title">
      <div class="motion-scene motion-corridor" data-about-visual>
        <div class="motion-grain"></div>
        <header class="motion-corridor-head">
          <span class="motion-power-rail" aria-label="螢幕通電進度"><i></i><i></i><i></i></span>
        </header>
        <h2 id="about-title" class="sr-only">關於我與工作方式</h2>
        <div class="motion-rig">
          <img class="motion-frame" src="/assets/references/three-tv-corridor-frame-v2.png" alt="包覆三台螢幕的工業金屬框架" loading="lazy" decoding="async" />
          <div class="motion-light-masks" aria-hidden="true">
            <i data-about-light="1"></i>
            <i data-about-light="2"></i>
            <i data-about-light="3"></i>
          </div>

          <div class="motion-mobile-stage" data-about-mobile-stage="1">
          <article class="motion-screen motion-screen--one" data-about-screen="1">
            <div class="motion-screen-flash" data-about-flash aria-hidden="true"></div>
            <div class="motion-screen-content motion-screen-content--character" data-about-content>
              <div class="motion-character-reel" data-about-character-reel data-reel-state="standby" role="img" aria-label="lazydooog 角色局部特寫循環播放">
                <img class="motion-character-shot motion-character-shot--face" src="/assets/references/lazydooog-leaning-pose-v1.png" alt="" loading="lazy" decoding="async" />
                <img class="motion-character-shot motion-character-shot--hand" src="/assets/references/lazydooog-leaning-pose-v1.png" alt="" loading="lazy" decoding="async" />
                <img class="motion-character-shot motion-character-shot--tail" src="/assets/references/lazydooog-leaning-pose-v1.png" alt="" loading="lazy" decoding="async" />
                <img class="motion-character-shot motion-character-shot--shoes" src="/assets/references/lazydooog-leaning-pose-v1.png" alt="" loading="lazy" decoding="async" />
                <img class="motion-character-shot motion-character-shot--pose" src="/assets/references/lazydooog-leaning-pose-v1.png" alt="" loading="lazy" decoding="async" />
                <span class="motion-character-brand motion-screen-title">Lazydoooog</span>
              </div>
            </div>
            <a
              class="motion-screen-link"
              href="https://www.threads.com/@lazydoooog"
              target="_blank"
              rel="noreferrer"
              aria-label="前往 Lazydoooog Threads"
            ></a>
          </article>
          </div>

          <div class="motion-mobile-stage" data-about-mobile-stage="2">
          <article class="motion-screen motion-screen--two" data-about-screen="2">
            <div class="motion-screen-flash" data-about-flash aria-hidden="true"></div>
            <div class="motion-screen-content motion-screen-content--repeat-video" data-about-content>
              <div class="motion-repeat-media" data-about-repeat-media>
                <video
                  class="motion-repeat-video"
                  autoplay
                  muted
                  loop
                  playsinline
                  preload="none"
                  data-lazy-video
                  data-lazy-poster="/assets/posters/about-repeat-detected-final.png"
                  aria-label="A repeated desk workflow becoming a reliable automation"
                >
                  <source data-lazy-src="/assets/videos/about-repeat-detected.mp4" type="video/mp4" />
                </video>
                <img
                  class="motion-repeat-poster"
                  src="/assets/posters/about-repeat-detected-final.png"
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                <div class="motion-repeat-copy">
                  <span class="motion-screen-title">HOW I WORK</span>
                  <p>I spot repeated work and turn it into reliable automation.</p>
                  <strong>REPEAT DETECTED</strong>
                </div>
              </div>
            </div>
          </article>
          </div>

          <div class="motion-mobile-stage" data-about-mobile-stage="3">
          <article class="motion-screen motion-screen--three" data-about-screen="3">
            <div class="motion-screen-flash" data-about-flash aria-hidden="true"></div>
            <div class="motion-screen-content motion-screen-content--workflow" data-about-content>
              <div class="motion-workflow-media" data-about-workflow-media aria-live="polite">
                <span class="motion-workflow-status motion-screen-title" aria-hidden="true">WORKFLOW <i>/</i> LIVE</span>
                <button class="motion-workflow-play" type="button" data-about-workflow-play hidden>PLAY WORKFLOW</button>
                <div class="motion-workflow-placeholder" data-about-workflow-placeholder aria-label="n8n 工作流程影片預覽">
                  <span data-about-workflow-fallback-label>WORKFLOW</span>
                  <strong data-about-workflow-fallback-title>PREVIEW UNAVAILABLE</strong>
                </div>
              </div>
            </div>
            <a
              class="motion-screen-link"
              href="https://brave-cricket-1e4.notion.site/AI-23f6e83c928880d0b45ff6db26679604"
              target="_blank"
              rel="noreferrer"
              aria-label="查看完整 Notion 專案作品集"
            ></a>
          </article>
          </div>

          <div class="motion-buttons" role="group" aria-label="快速切換電視狀態">
            <button class="motion-power" type="button" data-about-plate="1" data-press-frame="0" aria-label="開啟第一台電視"><span class="motion-power-sprite"><img src="/assets/sprites/about/power-button-states.png" alt="" loading="lazy" /></span></button>
            <button class="motion-power" type="button" data-about-plate="2" data-press-frame="0" aria-label="開啟第二台電視"><span class="motion-power-sprite"><img src="/assets/sprites/about/power-button-states.png" alt="" loading="lazy" /></span></button>
            <button class="motion-power" type="button" data-about-plate="3" data-press-frame="0" aria-label="開啟第三台電視"><span class="motion-power-sprite"><img src="/assets/sprites/about/power-button-states.png" alt="" loading="lazy" /></span></button>
          </div>

          <div class="motion-third-rail motion-third-rail--back" data-about-rail="back" aria-hidden="true"><img src="/assets/sprites/about/boardslide-rail-v3.png" alt="" loading="lazy" /></div>
          <div class="motion-third-rail motion-third-rail--front" data-about-rail="front" aria-hidden="true"><img src="/assets/sprites/about/boardslide-rail-v3.png" alt="" loading="lazy" /></div>
          <div class="motion-hud" aria-hidden="true">
            <span data-about-hud="1">
              <em class="motion-combo-label">OLLIE x1</em>
            </span>
            <span data-about-hud="2">
              <em class="motion-combo-label">KICKFLIP x2</em>
            </span>
            <span data-about-hud="3">
              <em class="motion-combo-label">BOARDSLIDE x3</em>
            </span>
          </div>

          <div class="motion-dog" data-about-dog aria-label="像素滑板狗依序完成 Ollie、Kickflip 與 Boardslide">
            <span class="motion-dog-tail"></span>
            <span class="motion-dog-body"></span>
            <span class="motion-dog-ear"></span>
            <span class="motion-dog-head"></span>
            <span class="motion-dog-muzzle"></span>
            <span class="motion-dog-board"></span>
            <span class="motion-dog-wheel motion-dog-wheel--a"></span>
            <span class="motion-dog-wheel motion-dog-wheel--b"></span>
          </div>
          <p class="motion-mobile-note">向下捲動，依序完成 Ollie、Kickflip 與 Boardslide；每段結尾保留閱讀時間。</p>
        </div>
      </div>
    </section>
  </section>
`;

const renderContactSection = (section) => {
  return `
    <section id="contact" class="resume-section section--contact section--contact-phone" data-section data-contact-phone aria-labelledby="contact-title">
      <div class="section-stage contact-phone-stage">
        <h2 id="contact-title" class="sr-only">${section.label}</h2>
        <div class="contact-phone-world">
          <div class="experience-contact-base" data-contact-handoff-base></div>
          <svg class="contact-handoff-mask" width="0" height="0" aria-hidden="true" focusable="false">
            <defs>
              <clipPath id="contact-handoff-strip-mask" clipPathUnits="objectBoundingBox">
                ${contactHandoffStrips}
              </clipPath>
            </defs>
          </svg>
          <div class="contact-camera-rig" data-contact-camera-rig>
            <div class="contact-handoff-reveal" data-contact-handoff-reveal aria-hidden="true">
              <div class="contact-skate-scene" data-contact-skate-scene>
                <div class="contact-cockroach" data-contact-cockroach data-contact-roach-phase="crawl">
                  <img src="/assets/sprites/contact/contact-cockroach-v1.png" data-contact-roach-pose="crawl" alt="" loading="lazy" decoding="async" />
                  <img src="/assets/sprites/contact/contact-cockroach-flight-v1.png" data-contact-roach-pose="flight" alt="" loading="lazy" decoding="async" />
                </div>
              </div>
            </div>
            <div class="contact-handoff-dog-layer" aria-hidden="true">
              <div class="contact-handoff-dog" data-contact-dog data-contact-pose="push">
                <img src="/assets/sprites/contact/contact-dog-skate-v2-01-push.png" data-contact-dog-pose="push" alt="" loading="lazy" decoding="async" />
                <img src="/assets/sprites/contact/contact-dog-skate-v2-02-glide.png" data-contact-dog-pose="glide" alt="" loading="lazy" decoding="async" />
                <img src="/assets/sprites/contact/contact-dog-skate-v4-03-airborne.png" data-contact-dog-pose="airborne" alt="" loading="lazy" decoding="async" />
                <img src="/assets/sprites/contact/contact-dog-skate-v7-04-frightened-side-glide-left.png" data-contact-dog-pose="escape" alt="" loading="lazy" decoding="async" />
              </div>
              <img class="contact-startle-reaction" src="/assets/sprites/contact/contact-exclamation-v1.png" data-contact-reaction alt="" loading="lazy" decoding="async" />
            </div>
            <div class="contact-phone-flight" data-contact-phone-flight>
              <div class="contact-phone-device" data-contact-phone-device>
                <span class="contact-phone-shadow" aria-hidden="true"></span>
                <span class="contact-phone-button contact-phone-button--action" aria-hidden="true"></span>
                <span class="contact-phone-button contact-phone-button--volume-up" aria-hidden="true"></span>
                <span class="contact-phone-button contact-phone-button--volume-down" aria-hidden="true"></span>
                <span class="contact-phone-button contact-phone-button--power" aria-hidden="true"></span>
                <div class="contact-phone-body">
                  <div class="contact-phone-screen" data-contact-phone-screen>
                    <span class="contact-phone-island" aria-hidden="true"></span>
                    ${renderContactCameraApp()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
};

const renderSkillsSection = (experienceSection) => {
  return `
    <section id="skills" class="resume-section section--skills" data-section data-skills-sequence aria-labelledby="skills-title">
      <div class="skills-power-cut" data-skills-entry aria-hidden="true">
        <i class="skills-power-cut__blackout"></i>
        <div class="skills-title-slot skills-title-slot--entry" data-skills-title-entry></div>
      </div>
      <div class="skills-wall" data-skills-wall>
        <div class="skills-experience-backdrop" data-experience-backdrop aria-hidden="true">
          <div class="skills-experience-backdrop__world" data-experience-backdrop-world>
            <div class="skills-wall__texture" data-skills-texture></div>
            <canvas class="skills-paint skills-paint--scroll" data-skills-scroll-canvas></canvas>
            <canvas class="skills-paint skills-paint--free" data-skills-free-canvas></canvas>
          </div>
        </div>
        <canvas class="experience-paint" data-experience-paint aria-hidden="true"></canvas>

        <div class="skills-can-rack" data-skills-rack aria-label="噴漆顏色">
          ${skillGroups.map((group, groupIndex) => `
            <button
              class="skills-can-slot skills-can-slot--${groupIndex + 1}"
              type="button"
              data-skills-can="${groupIndex}"
              aria-label="選擇${freeSprayColorNames[groupIndex]}"
              aria-pressed="false"
              disabled
            >
              <span class="skills-can-slot__mount" aria-hidden="true"></span>
              <span class="skills-can-slot__can" aria-hidden="true">
                <img src="/assets/sprites/skills/spray-can-v1.png" alt="" loading="lazy" decoding="async" />
              </span>
            </button>
          `).join('')}
        </div>

        <header class="skills-intro shell" data-skills-title-wall>
          ${renderSkillsTitle()}
        </header>

        <div class="skills-grid shell">
          ${skillGroups.map((group, groupIndex) => `
            <article class="skills-group skills-group--${groupIndex + 1}" data-skill-group>
              <h3>${group.title}</h3>
              <p>${group.description}</p>
              <ul aria-label="${group.title}工具">
                ${group.skills.map((skill) => `<li>${skill}</li>`).join('')}
              </ul>
            </article>
          `).join('')}
        </div>

        <div class="skills-tool" data-skills-tool aria-hidden="true">
          <span class="skills-tool__mist"></span>
          <img src="/assets/sprites/skills/spray-can-v1.png" alt="" loading="lazy" decoding="async" />
        </div>

        <div class="experience-can" data-experience-can aria-hidden="true">
          <span></span>
          <img src="/assets/sprites/skills/spray-can-v1.png" alt="" loading="lazy" decoding="async" />
        </div>
      </div>
      ${renderExperienceSection(experienceSection)}
    </section>
  `;
};

const renderExperienceSection = (section) => `
  <section id="experience" class="resume-section section--experience" data-section data-experience-sequence aria-labelledby="experience-title">
    <div class="experience-stage" data-experience-stage>
      <h2 id="experience-title" class="sr-only">${section.label}</h2>
      <svg class="experience-route-line" aria-hidden="true">
        <defs>
          <filter id="experience-spray-roughness" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035 0.12" numOctaves="2" seed="17" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="13" />
          </filter>
          <mask id="experience-spray-reveal">
            <path class="experience-route-line__reveal" data-experience-route-shape data-experience-route-reveal />
          </mask>
        </defs>
        <path class="experience-route-line__bed" data-experience-route-shape data-experience-route />
        <path class="experience-route-line__mist" data-experience-route-shape />
        <path class="experience-route-line__glow" data-experience-route-shape data-experience-route />
        <path class="experience-route-line__active" data-experience-route-shape data-experience-route />
        <path class="experience-route-line__speckle" pathLength="1" mask="url(#experience-spray-reveal)" data-experience-route-shape />
      </svg>

      <div class="experience-stories">
        ${section.detail}
      </div>

      <div class="experience-dog" data-experience-dog aria-hidden="true">
        <img src="/assets/sprites/experience/experience-dog-glide-v1.png" data-experience-pose="glide" alt="" loading="lazy" decoding="async" />
        <img src="/assets/sprites/experience/experience-dog-turn-v1.png" data-experience-pose="turn" alt="" loading="lazy" decoding="async" />
      </div>
    </div>
  </section>
`;

app.innerHTML = `
  <header class="site-header">
    <a class="header-contact" href="mailto:a89890123@gmail.com">Email ↗</a>
    <nav class="site-nav" aria-label="履歷區段">
      ${resumeSections.map((section) => `<a href="#${section.id}">${section.label}</a>`).join('')}
    </nav>
  </header>
  <main>
    ${renderHeroTvSequence(aboutSection)}
    ${renderSkillsSection(resumeSections.find((item) => item.id === 'experience'))}
    ${renderContactSection(contactSection)}
  </main>
`;

const navLinks = [...document.querySelectorAll('.site-nav a')];
let motionController = null;
let contactPhoneController = null;
let disposed = false;

const setActiveSection = (id) => {
  const contactSection = document.querySelector('[data-contact-phone]');
  const contactBounds = contactSection?.getBoundingClientRect();
  const staticContactOwnsViewport = contactSection?.classList.contains('is-contact-static')
    && contactBounds.top <= window.innerHeight / 2
    && contactBounds.bottom >= window.innerHeight / 2;
  if (
    contactSection?.classList.contains('is-contact-scroll-owner')
    || staticContactOwnsViewport
  ) {
    const ownedSection = staticContactOwnsViewport
      || contactSection.dataset.handoffOwner === 'contact'
      ? 'contact'
      : 'experience';
    if (id !== ownedSection) return;
  }
  document.documentElement.dataset.activeSection = id;
  navLinks.forEach((link) => link.toggleAttribute('aria-current', link.hash === `#${id}`));
};

const navigateToSection = (id, updateHash = true, behaviorOverride = null) => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior = behaviorOverride ?? (reduced ? 'auto' : 'smooth');
  if (id === 'contact' && contactPhoneController?.scrollToSettled(behavior)) {
    if (updateHash) history.pushState(null, '', `#${id}`);
    return;
  }
  if (motionController?.scrollToSection(id, behavior)) {
    if (updateHash) history.pushState(null, '', `#${id}`);
    return;
  }

  document.getElementById(id)?.scrollIntoView({ behavior, block: 'start' });
  if (updateHash) history.pushState(null, '', `#${id}`);
};

navLinks.forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  navigateToSection(link.hash.slice(1));
}));

window.addEventListener('resume:section', (event) => setActiveSection(event.detail));

const observer = new IntersectionObserver((entries) => {
  const desktopMotion = matchMedia('(min-width: 768px) and (prefers-reduced-motion: no-preference)').matches;
  const visible = entries
    .filter((entry) => (
      entry.isIntersecting
      && (
        !desktopMotion
        || !['hero', 'about', 'skills', 'experience', 'contact'].includes(entry.target.id)
        || (entry.target.id === 'contact' && entry.target.classList.contains('is-contact-static'))
      )
    ))
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (visible) setActiveSection(visible.target.id);
}, { threshold: [0.25, 0.5, 0.75] });

document.querySelectorAll('[data-section]').forEach((section) => observer.observe(section));
setActiveSection('hero');

const repeatVideo = document.querySelector('[data-lazy-video]');
const repeatVideoSources = repeatVideo
  ? [...repeatVideo.querySelectorAll('source[data-lazy-src]')]
  : [];
const activateRepeatVideo = () => {
  if (!repeatVideo || repeatVideo.dataset.lazyReady === 'true') return;
  repeatVideoSources.forEach((source) => {
    source.src = source.dataset.lazySrc;
    source.removeAttribute('data-lazy-src');
  });
  repeatVideo.poster = repeatVideo.dataset.lazyPoster || '';
  repeatVideo.preload = 'metadata';
  repeatVideo.dataset.lazyReady = 'true';
  repeatVideo.load();
};
const repeatVideoObserver = repeatVideo && 'IntersectionObserver' in window
  ? new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) {
      repeatVideo.pause();
      return;
    }
    activateRepeatVideo();
    repeatVideo.play().catch(() => {});
  }, { rootMargin: '360px 0px' })
  : null;
if (repeatVideoObserver) repeatVideoObserver.observe(repeatVideo);
else activateRepeatVideo();

const deferredBackgrounds = [
  {
    section: document.getElementById('about'),
    targets: [...document.querySelectorAll('.motion-mobile-stage')],
    asset: '/assets/references/three-tv-corridor-v2.png',
  },
  {
    section: document.getElementById('skills'),
    targets: [
      ...document.querySelectorAll('.skills-wall__texture, .experience-contact-base, .experience-stage'),
    ],
    asset: '/assets/textures/skills-industrial-wall-v1.png',
  },
  {
    section: document.getElementById('contact'),
    targets: [...document.querySelectorAll('.contact-skate-scene')],
    asset: '/assets/backgrounds/contact-workshop-v1.png',
  },
].filter(({ section, targets }) => section && targets.length > 0);

const deferredBackgroundObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries, backgroundObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const deferred = deferredBackgrounds.find(({ section }) => section === entry.target);
      deferred?.targets.forEach((target) => {
        target.style.setProperty('--deferred-background-image', `url("${deferred.asset}")`);
      });
      backgroundObserver.unobserve(entry.target);
    });
  }, { rootMargin: '1200px 0px' })
  : null;

if (deferredBackgroundObserver) {
  deferredBackgrounds.forEach(({ section }) => deferredBackgroundObserver.observe(section));
} else {
  deferredBackgrounds.forEach(({ targets, asset }) => targets.forEach((target) => {
    target.style.setProperty('--deferred-background-image', `url("${asset}")`);
  }));
}

try {
  contactPhoneController = initContactPhoneScene(animationMap);
} catch (error) {
  console.error('Contact phone initialization failed', error);
}

if (directContact) {
  contactPhoneController?.startEntrance({ staticMode: true });
}

initScrollVideo(animationMap)
  .then((controller) => {
    if (disposed) {
      controller.destroy();
      return;
    }
    motionController = controller;
    if (!directContact) {
      contactPhoneController?.startEntrance({
        experienceHandoff: controller.syncContactHandoff,
      });
    }
    document.documentElement.classList.add('motion-ready');
  })
  .catch((error) => {
    console.error('Hero motion initialization failed', error);
    if (!directContact) contactPhoneController?.startEntrance({ staticMode: true });
    document.documentElement.classList.add('motion-fallback');
  })
  .then(() => {
    if (disposed) return;
    if (directContact) {
      const pageReady = document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
      Promise.all([document.fonts?.ready ?? Promise.resolve(), pageReady]).then(() => {
        requestAnimationFrame(() => {
          if (disposed) return;
          history.replaceState(null, '', '#contact');
          document.getElementById('contact')?.scrollIntoView({ behavior: 'instant', block: 'start' });
          setActiveSection('contact');
        });
      });
    }
    if (!directContact && directMotionSection) {
      requestAnimationFrame(() => {
        history.replaceState(null, '', directMotionSection);
        navigateToSection(directMotionSection.slice(1), false, 'auto');
      });
    }
  });

window.addEventListener('pagehide', () => {
  disposed = true;
  observer.disconnect();
  repeatVideoObserver?.disconnect();
  deferredBackgroundObserver?.disconnect();
  repeatVideo?.pause();
  motionController?.destroy();
  contactPhoneController?.destroy();
}, { once: true });
