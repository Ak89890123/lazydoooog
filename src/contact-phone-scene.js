import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { bindPendingContactLinks } from './contact-phone.js';
import {
  CONTACT_SEQUENCE_PHASES,
  getContactRoachMotionState,
  getContactSequenceState,
} from './contact-sequence-math.js';
import {
  EXPERIENCE_CONTACT_HANDOFF,
  getExperienceContactHandoffState,
  progressBetween,
} from './experience-sequence-math.js';

gsap.registerPlugin(ScrollTrigger);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (start, end, progress) => start + (end - start) * progress;
const smoothstep = (value) => value * value * (3 - 2 * value);

const DEFAULT_CONTACT_CAMERA = Object.freeze({
  encounterXRatio: 0.5,
  dogBoardNoseRatio: 0.22,
  trackStart: 0.08,
  encounterStart: 0.44,
  trackZoom: 1.06,
  encounterZoom: 1.24,
  focusStart: 0.75,
  focusZoom: 4,
  settledYOffsetVh: 0.055,
});

export const screenToContactWorld = (screen, origin, scale) => (
  origin + (screen - origin) / scale
);

export const getContactCameraState = (value, overrides = {}) => {
  const config = { ...DEFAULT_CONTACT_CAMERA, ...overrides };
  const progress = clamp(value, 0, 1);
  const track = smoothstep(progressBetween(
    progress,
    config.trackStart,
    config.encounterStart,
  ));
  const encounter = smoothstep(progressBetween(
    progress,
    config.encounterStart,
    CONTACT_SEQUENCE_PHASES.encounter,
  ));
  const focus = smoothstep(progressBetween(
    progress,
    config.focusStart,
    CONTACT_SEQUENCE_PHASES.settled,
  ));
  const scale = progress < config.encounterStart
    ? lerp(1, config.trackZoom, track)
    : progress <= CONTACT_SEQUENCE_PHASES.encounter
      ? lerp(config.trackZoom, config.encounterZoom, encounter)
      : lerp(config.encounterZoom, config.focusZoom, focus);

  return { progress, track, encounter, focus, scale };
};

export const getContactPhoneTilt = (pointerX, pointerY) => ({
  rotateX: clamp(pointerY, -1, 1) * -3,
  rotateY: clamp(pointerX, -1, 1) * 7,
});

const applyContactSequenceState = (
  section,
  device,
  dog,
  state,
  { interactive = state.phoneReady } = {},
) => {
  const flight = section.querySelector('[data-contact-phone-flight]');

  section.dataset.contactPhase = state.phase;
  section.classList.toggle('is-contact-static', state.staticMode);
  flight.dataset.contactReady = String(state.phoneReady);
  dog.dataset.contactPose = state.dogPose;
  device.inert = !interactive;
  device.setAttribute('aria-hidden', String(!interactive));
  if (!interactive && device.contains(document.activeElement)) document.activeElement.blur();
};

/**
 * Animation contract — Experience -> Contact phone.
 * `resume-experience-contact-handoff` owns strip transforms, camera-rig/dog/phone
 * transforms and visibility, and section state for its pinned range. It requests the
 * Experience controller's dog/card ownership, then kills its trigger and resets styles.
 */
const createContactEntrance = (
  section,
  device,
  config = {},
  { staticMode = false, experienceHandoff = null } = {},
) => {
  const stage = section.querySelector('.contact-phone-stage');
  const base = section.querySelector('[data-contact-handoff-base]');
  const reveal = section.querySelector('[data-contact-handoff-reveal]');
  const strips = [...section.querySelectorAll('[data-contact-handoff-strip]')];
  const flight = section.querySelector('[data-contact-phone-flight]');
  const scene = section.querySelector('[data-contact-skate-scene]');
  const cameraRig = section.querySelector('[data-contact-camera-rig]');
  const dog = section.querySelector('[data-contact-dog]');
  const roach = section.querySelector('[data-contact-cockroach]');
  const reaction = section.querySelector('[data-contact-reaction]');
  const assets = [...section.querySelectorAll(
    '[data-contact-dog-pose], [data-contact-roach-pose], [data-contact-reaction]',
  )];
  if (
    !stage
    || !base
    || !reveal
    || strips.length === 0
    || !flight
    || !scene
    || !cameraRig
    || !dog
    || !roach
    || !reaction
  ) return () => {};

  const mm = gsap.matchMedia();
  let handoff = null;
  let assetFailed = false;
  let handoffActive = false;
  let lastActiveSection = null;
  let refreshProgress = null;
  let lastHandoffState = null;
  const geometry = {};
  const cameraConfig = { ...DEFAULT_CONTACT_CAMERA, ...config.camera };
  const contactDogScale = 1.35;
  const startYRatio = 0.66;
  const stateOptions = {
    stripCount: strips.length,
    stripOverlap: config.stripOverlap ?? EXPERIENCE_CONTACT_HANDOFF.stripOverlap,
  };
  const releaseState = getContactSequenceState(
    CONTACT_SEQUENCE_PHASES.escapeStart - 0.000001,
  );

  const getPhoneTransform = (registration, dogX, dogY, dogScale) => ({
    x: dogX + geometry.dogWidth * dogScale * (registration.x - 0.5) - geometry.width / 2,
    y: dogY + geometry.dogHeight * dogScale * (registration.y - 0.5) - geometry.height / 2,
    scale: geometry.dogWidth / device.offsetWidth * registration.scale * dogScale,
    rotation: registration.rotation,
  });

  const syncActiveSection = (id) => {
    lastActiveSection = id;
    if (document.documentElement.dataset.activeSection === id) return;
    window.dispatchEvent(new CustomEvent('resume:section', { detail: id }));
  };
  const setStripWidths = (state) => {
    if (state.cleanupReady) {
      strips.forEach((strip) => strip.style.removeProperty('transform'));
      return;
    }
    strips.forEach((strip, index) => {
      strip.style.transform = `scaleX(${state.strips[index].progress.toFixed(4)})`;
    });
  };
  const measure = () => {
    geometry.width = window.innerWidth;
    geometry.height = window.innerHeight;
    geometry.dogWidth = dog.offsetWidth;
    geometry.dogHeight = dog.offsetHeight;
    geometry.startX = -geometry.dogWidth * 0.55;
    geometry.startY = geometry.height * startYRatio;
    geometry.cameraOriginX = geometry.width * cameraConfig.encounterXRatio;
    geometry.encounterX = geometry.cameraOriginX
      - geometry.dogWidth * contactDogScale * cameraConfig.dogBoardNoseRatio;
    geometry.encounterY = Math.max(
      geometry.startY,
      geometry.height * 0.975 - geometry.dogHeight * contactDogScale / 2,
    );
    geometry.roachY = geometry.height * 0.82;
    geometry.roachGroundX = geometry.width * 0.72;
    geometry.roachFaceX = geometry.cameraOriginX
      + geometry.dogWidth * contactDogScale * 0.12;
    geometry.roachFaceY = geometry.encounterY
      - geometry.dogHeight * contactDogScale * 0.27;
    gsap.set(cameraRig, {
      transformOrigin: `${cameraConfig.encounterXRatio * 100}% ${(geometry.encounterY / geometry.height) * 100}%`,
    });
  };
  const activateHandoff = (state) => {
    if (handoffActive) return;
    const activated = experienceHandoff?.({ active: true, state });
    if (!activated) return;
    handoffActive = true;
    section.classList.add('is-contact-scroll-owner');
    measure();
  };
  const deactivateHandoff = (state = lastHandoffState) => {
    if (!handoffActive) return;
    handoffActive = false;
    gsap.set(base, { autoAlpha: 0 });
    experienceHandoff?.({ active: false, state });
  };
  const render = (progress, { syncSection = true, remeasure = false } = {}) => {
    const state = getExperienceContactHandoffState(progress, stateOptions);
    lastHandoffState = state;
    if (progress > 0 && !state.cleanupReady && !handoffActive) activateHandoff(state);
    if (handoffActive) {
      experienceHandoff?.({ active: true, state, remeasure });
    }
    setStripWidths(state);
    section.dataset.handoffPhase = state.phase;
    section.dataset.handoffOwner = state.sceneOwner;
    section.classList.toggle('is-contact-owned', state.cleanupReady);
    gsap.set(base, { autoAlpha: 0 });
    const phoneReveal = smoothstep(progressBetween(
      state.contact.progress,
      CONTACT_SEQUENCE_PHASES.escapeStart,
      CONTACT_SEQUENCE_PHASES.phoneDropEnd,
    ));
    gsap.set(flight, {
      autoAlpha: state.contactVisible && !state.contact.phoneBehindDog ? phoneReveal : 0,
    });
    applyContactSequenceState(section, device, dog, state.contact, {
      interactive: state.contactInteractive,
    });

    if (
      syncSection
      && (
        state.activeSection !== lastActiveSection
        || document.documentElement.dataset.activeSection !== state.activeSection
      )
    ) syncActiveSection(state.activeSection);
    if (!handoffActive) return;

    const { encounterProgress } = EXPERIENCE_CONTACT_HANDOFF;
    const motionProgress = state.contact.progress;
    const approach = progressBetween(
      motionProgress,
      0,
      encounterProgress,
    );
    const dogExit = progressBetween(
      motionProgress,
      CONTACT_SEQUENCE_PHASES.escapeStart,
      CONTACT_SEQUENCE_PHASES.dogExit,
    );
    const escapeTravel = dogExit * dogExit;
    const airborne = progressBetween(
      motionProgress,
      CONTACT_SEQUENCE_PHASES.airborneStart,
      CONTACT_SEQUENCE_PHASES.escapeStart,
    );
    const dogScale = contactDogScale;
    const dogX = dogExit > 0
      ? gsap.utils.interpolate(
        geometry.encounterX,
        -geometry.dogWidth * contactDogScale,
        escapeTravel,
      )
      : gsap.utils.interpolate(geometry.startX, geometry.encounterX, state.dog.travel)
        + Math.sin(airborne * Math.PI) * geometry.width * 0.012;
    const dogY = gsap.utils.interpolate(geometry.startY, geometry.encounterY, approach)
      - Math.sin(airborne * Math.PI) * geometry.height * 0.17;
    gsap.set(dog, {
      autoAlpha: state.dog.visible ? 1 : 0,
      x: dogX,
      y: dogY,
      xPercent: -50,
      yPercent: -50,
      scaleX: dogScale,
      scaleY: dogScale,
      rotation: Math.sin(airborne * Math.PI) * -3,
    });

    const roachMotion = getContactRoachMotionState(motionProgress);
    const crawl = smoothstep(roachMotion.crawl);
    const flightIn = smoothstep(roachMotion.flightIn);
    const flightOut = smoothstep(roachMotion.flightOut);
    roach.dataset.contactRoachPhase = motionProgress < CONTACT_SEQUENCE_PHASES.roachTakeoff
      ? 'crawl'
      : 'flight';
    const crawlWobble = Math.sin(crawl * Math.PI * 7);
    const crawlJitterX = crawlWobble + Math.sin(crawl * Math.PI * 17) * 0.5;
    const crawlJitterY = Math.sin(crawl * Math.PI * 11)
      + Math.sin(crawl * Math.PI * 23) * 0.38;
    const flightInWobble = 1 - flightIn;
    const flightOutWobble = 1 - flightOut;
    const flightInJitterX = Math.sin(flightIn * Math.PI * 5)
      + Math.sin(flightIn * Math.PI * 13) * 0.45;
    const flightInJitterY = Math.sin(flightIn * Math.PI * 8)
      + Math.sin(flightIn * Math.PI * 19) * 0.4;
    const flightOutJitterX = Math.sin(flightOut * Math.PI * 6)
      + Math.sin(flightOut * Math.PI * 15) * 0.45;
    const flightOutJitterY = Math.sin(flightOut * Math.PI * 7)
      + Math.sin(flightOut * Math.PI * 18) * 0.35;
    const roachX = roachMotion.phase === 'crawl'
      ? gsap.utils.interpolate(geometry.width * 1.08, geometry.roachGroundX, crawl)
        + crawlJitterX * geometry.width * 0.012
      : flightOut > 0
        ? gsap.utils.interpolate(geometry.roachFaceX, geometry.width * 1.06, flightOut)
          + flightOutJitterX * geometry.width * 0.05 * flightOutWobble
        : gsap.utils.interpolate(geometry.roachGroundX, geometry.roachFaceX, flightIn)
          + flightInJitterX * geometry.width * 0.045 * flightInWobble;
    const roachY = roachMotion.phase === 'crawl'
      ? geometry.roachY + crawlJitterY * geometry.height * 0.012
      : flightOut > 0
        ? gsap.utils.interpolate(geometry.roachFaceY, geometry.height * 0.28, flightOut)
          + flightOutJitterY * geometry.height * 0.06 * flightOutWobble
        : gsap.utils.interpolate(geometry.roachY, geometry.roachFaceY, flightIn)
          - Math.sin(flightIn * Math.PI) * geometry.height * 0.16
          + flightInJitterY * geometry.height * 0.025 * flightInWobble;
    gsap.set(roach, {
      autoAlpha: state.contactVisible && roachMotion.visible ? 1 : 0,
      x: roachX,
      y: roachY,
      xPercent: -50,
      yPercent: -50,
      rotation: roachMotion.phase === 'crawl'
        ? -8 + crawlJitterX * 13
        : (Math.sin((flightIn + flightOut) * Math.PI * 9)
          + Math.sin((flightIn + flightOut) * Math.PI * 23) * 0.35) * 24,
      scale: roachMotion.phase === 'crawl'
        ? gsap.utils.interpolate(0.88, 1, crawl)
        : flightOut > 0
          ? gsap.utils.interpolate(1.3, 1, flightOut)
          : gsap.utils.interpolate(1, 1.3, flightIn),
    });

    const reactionRise = smoothstep(progressBetween(
      motionProgress,
      CONTACT_SEQUENCE_PHASES.encounter - 0.005,
      CONTACT_SEQUENCE_PHASES.encounter + 0.025,
    ));
    const reactionFall = smoothstep(progressBetween(
      motionProgress,
      CONTACT_SEQUENCE_PHASES.encounter + 0.055,
      CONTACT_SEQUENCE_PHASES.escapeStart,
    ));
    gsap.set(reaction, {
      autoAlpha: state.encounterReady ? reactionRise * (1 - reactionFall) : 0,
      x: dogX + geometry.dogWidth * dogScale * 0.34,
      y: dogY - geometry.dogHeight * dogScale * 0.4,
      xPercent: -50,
      yPercent: -50,
      scale: gsap.utils.interpolate(0.5, 1.08, reactionRise),
      rotation: gsap.utils.interpolate(-10, 3, reactionRise),
    });

    const releaseDogScale = contactDogScale;
    const releaseTransform = {
      ...getPhoneTransform(
        releaseState.phoneRegistration,
        geometry.encounterX,
        geometry.encounterY,
        releaseDogScale,
      ),
      rotation: 0,
    };
    const cameraState = getContactCameraState(motionProgress, {
      ...cameraConfig,
      focusZoom: 1 / releaseTransform.scale,
    });
    const encounterCameraScale = getContactCameraState(
      encounterProgress,
      cameraConfig,
    ).scale;
    const releaseScreenX = geometry.cameraOriginX + (
      geometry.width / 2 + releaseTransform.x - geometry.cameraOriginX
    ) * encounterCameraScale;
    const releaseScreenY = geometry.encounterY + (
      geometry.height / 2 + releaseTransform.y - geometry.encounterY
    ) * encounterCameraScale;
    const landedScreenY = releaseScreenY + geometry.height * 0.14;
    const phoneDrop = smoothstep(progressBetween(
      motionProgress,
      CONTACT_SEQUENCE_PHASES.escapeStart,
      CONTACT_SEQUENCE_PHASES.phoneDropEnd,
    ));
    if (state.contact.phoneOwnership === 'dog') {
      gsap.set(flight, getPhoneTransform(
        state.contact.phoneRegistration,
        dogX,
        dogY,
        dogScale,
      ));
    } else {
      gsap.set(flight, {
        x: releaseTransform.x,
        y: screenToContactWorld(
          gsap.utils.interpolate(releaseScreenY, landedScreenY, phoneDrop),
          geometry.encounterY,
          encounterCameraScale,
        ) - geometry.height / 2,
        scale: releaseTransform.scale,
        rotation: 0,
      });
    }

    const phoneWorldX = geometry.width / 2 + releaseTransform.x;
    const phoneWorldY = screenToContactWorld(
      landedScreenY,
      geometry.encounterY,
      encounterCameraScale,
    );
    const cameraX = cameraState.focus === 0
      ? 0
      : gsap.utils.interpolate(
        releaseScreenX,
        geometry.width / 2,
        cameraState.focus,
      ) - (
        geometry.cameraOriginX
        + (phoneWorldX - geometry.cameraOriginX) * cameraState.scale
      );
    const cameraY = cameraState.focus === 0
      ? 0
      : gsap.utils.interpolate(
        landedScreenY,
        geometry.height * (0.5 + cameraConfig.settledYOffsetVh),
        cameraState.focus,
      ) - (
        geometry.encounterY
        + (phoneWorldY - geometry.encounterY) * cameraState.scale
      );
    gsap.set(cameraRig, {
      x: cameraX,
      y: cameraY,
      scale: cameraState.scale,
    });
  };
  const settleStatic = () => {
    handoff?.kill();
    handoff = null;
    section.classList.remove('is-contact-scroll-owner');
    deactivateHandoff(null);
    const state = getExperienceContactHandoffState(1, {
      ...stateOptions,
      staticMode: true,
    });
    setStripWidths(state);
    section.dataset.handoffPhase = state.phase;
    section.dataset.handoffOwner = state.sceneOwner;
    section.classList.add('is-contact-owned');
    applyContactSequenceState(section, device, dog, state.contact);
    gsap.set(scene, { display: 'none' });
    gsap.set(base, { display: 'none' });
    gsap.set(dog, { display: 'none' });
    gsap.set([roach, reaction], { display: 'none' });
    gsap.set(cameraRig, { clearProps: 'transform,transformOrigin' });
    gsap.set(flight, { clearProps: 'transform' });
  };
  const resetEntranceState = () => {
    strips.forEach((strip) => strip.style.removeProperty('transform'));
    section.classList.remove('is-contact-owned', 'is-contact-static', 'is-contact-scroll-owner');
    delete section.dataset.handoffPhase;
    delete section.dataset.handoffOwner;
    delete section.dataset.contactPhase;
    flight.removeAttribute('data-contact-ready');
    dog.removeAttribute('data-contact-pose');
    device.inert = false;
    device.removeAttribute('aria-hidden');
    [scene, cameraRig, base, dog, roach, reaction, flight]
      .forEach((element) => element.removeAttribute('style'));
  };
  const onAssetError = () => {
    assetFailed = true;
    settleStatic();
  };

  assets.forEach((asset) => {
    asset.addEventListener('error', onAssetError);
    if (asset.complete && !asset.naturalWidth) assetFailed = true;
  });
  mm.add({
    desktop: '(min-width: 768px)',
    mobile: '(max-width: 767px)',
    reduceMotion: '(prefers-reduced-motion: reduce)',
  }, ({ conditions }) => {
    if (
      staticMode
      || !experienceHandoff
      || !conditions.desktop
      || conditions.reduceMotion
      || assetFailed
    ) {
      settleStatic();
      return resetEntranceState;
    }

    gsap.set(scene, { display: 'block', autoAlpha: 1 });
    gsap.set(base, { display: 'block', autoAlpha: 0 });
    gsap.set(cameraRig, { clearProps: 'transform,transformOrigin' });
    gsap.set([roach, reaction], { display: 'block', autoAlpha: 0 });
    gsap.set(dog, { autoAlpha: 0 });
    gsap.set(flight, { autoAlpha: 0, scale: 0.16, rotation: 0 });
    applyContactSequenceState(section, device, dog, getContactSequenceState(0));
    handoff = ScrollTrigger.create({
      id: 'resume-experience-contact-handoff',
      trigger: section,
      start: 'top top',
      end: () => `+=${Math.max(
        window.innerHeight * (config.scrollDistanceVh ?? 5),
        3200,
      )}`,
      pin: stage,
      scrub: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onRefreshInit: (self) => {
        refreshProgress = handoffActive ? self.progress : null;
      },
      onRefresh: (self) => {
        const progress = refreshProgress ?? self.progress;
        if (refreshProgress !== null) {
          window.scrollTo({
            top: gsap.utils.interpolate(self.start, self.end, refreshProgress),
            behavior: 'auto',
          });
        }
        refreshProgress = null;
        if (handoffActive) measure();
        render(progress, {
          syncSection: self.isActive || progress > 0,
          remeasure: handoffActive,
        });
      },
      onUpdate: (self) => render(self.progress),
      onEnter: (self) => {
        activateHandoff(getExperienceContactHandoffState(self.progress, stateOptions));
        render(self.progress);
      },
      onEnterBack: (self) => {
        activateHandoff(getExperienceContactHandoffState(self.progress, stateOptions));
        render(self.progress);
      },
      onLeave: () => {
        render(1);
        deactivateHandoff(lastHandoffState);
        section.classList.remove('is-contact-scroll-owner');
      },
      onLeaveBack: () => {
        render(0);
        deactivateHandoff(lastHandoffState);
        section.classList.remove('is-contact-scroll-owner');
      },
    });
    render(0, { syncSection: false });

    return () => {
      handoff?.kill();
      handoff = null;
      deactivateHandoff();
      resetEntranceState();
    };
  });

  return () => {
    assets.forEach((asset) => asset.removeEventListener('error', onAssetError));
    handoff?.kill();
    deactivateHandoff();
    mm.revert();
    resetEntranceState();
  };
};

export const initContactPhoneScene = (animationMap = {}) => {
  const section = document.querySelector('[data-contact-phone]');
  const device = section?.querySelector('[data-contact-phone-device]');
  const os = section?.querySelector('[data-phone-os]');
  const home = section?.querySelector('[data-phone-home]');
  const app = section?.querySelector('[data-camera-app]');
  const openCamera = section?.querySelector('[data-open-camera]');
  const homeIndicator = section?.querySelector('[data-phone-home-indicator]');
  if (!section || !device || !os || !home || !app || !openCamera || !homeIndicator) {
    return {
      startEntrance() {},
      scrollToSettled() { return false; },
      destroy() {},
    };
  }
  const config = animationMap.sections?.find((item) => item.id === 'contact') || {};

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
  const status = app.querySelector('[data-camera-status]');
  const bootLabel = status.textContent;
  const shutter = app.querySelector('[data-camera-shutter]');
  const lastShot = app.querySelector('[data-camera-last]');
  const facingLabel = app.querySelector('[data-camera-facing-label]');
  const zoomButtons = [...app.querySelectorAll('[data-camera-zoom]')];
  let flashEnabled = false;
  let hasCapture = false;
  let captureTimer = 0;
  let switchTimer = 0;
  const bootTimers = [];
  let homeGestureStart = null;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let frame = 0;
  let visible = false;

  const tick = (time) => {
    const controlsActive = device.matches(':hover, :focus-within');
    if (device.inert || controlsActive) {
      targetX = 0;
      targetY = 0;
      currentX = 0;
      currentY = 0;
    } else {
      currentX += (targetX - currentX) * 0.075;
      currentY += (targetY - currentY) * 0.075;
    }
    const { rotateX, rotateY } = getContactPhoneTilt(currentX, currentY);
    const floatY = 0;
    device.style.setProperty('--contact-phone-float', `${floatY.toFixed(2)}px`);
    device.style.setProperty('--contact-phone-rotate-x', `${rotateX.toFixed(2)}deg`);
    device.style.setProperty('--contact-phone-rotate-y', `${rotateY.toFixed(2)}deg`);
    frame = visible ? requestAnimationFrame(tick) : 0;
  };

  const start = () => {
    if (!frame && finePointer && !reducedMotion) frame = requestAnimationFrame(tick);
  };
  const onPointerMove = (event) => {
    const rect = section.getBoundingClientRect();
    targetX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    targetY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  };
  const onPointerLeave = () => {
    targetX = 0;
    targetY = 0;
  };

  const setStatus = (message) => {
    status.textContent = message;
  };

  const clearBootTimers = () => {
    bootTimers.forEach(clearTimeout);
    bootTimers.length = 0;
  };

  const bootCamera = () => {
    clearBootTimers();
    app.dataset.cameraState = 'booting';
    setStatus(bootLabel);
    if (reducedMotion) {
      app.dataset.cameraState = 'ready';
      setStatus('相機已就緒');
      return;
    }
    bootTimers.push(window.setTimeout(() => { app.dataset.cameraState = 'focusing'; }, 140));
    bootTimers.push(window.setTimeout(() => {
      app.dataset.cameraState = 'ready';
      setStatus('相機已就緒');
    }, 520));
  };

  const setPhoneScreen = (screen, moveFocus = true) => {
    if (moveFocus) document.activeElement?.blur();
    const cameraActive = screen === 'camera';
    os.dataset.phoneScreen = cameraActive ? 'camera' : 'home';
    home.setAttribute('aria-hidden', String(cameraActive));
    home.inert = cameraActive;
    app.setAttribute('aria-hidden', String(!cameraActive));
    app.inert = !cameraActive;
    homeIndicator.setAttribute('aria-hidden', String(!cameraActive));
    homeIndicator.tabIndex = cameraActive ? 0 : -1;

    if (cameraActive) {
      bootCamera();
      if (moveFocus) shutter.focus({ preventScroll: true });
      return;
    }

    clearBootTimers();
    clearTimeout(switchTimer);
    app.classList.remove('is-camera-switching', 'is-camera-captured', 'is-camera-flashing');
    if (moveFocus) openCamera.focus({ preventScroll: true });
  };

  const openCameraApp = () => setPhoneScreen('camera');
  const returnHome = () => setPhoneScreen('home');

  const capture = () => {
    clearTimeout(captureTimer);
    app.classList.remove('is-camera-captured', 'is-camera-flashing');
    if (!reducedMotion) {
      requestAnimationFrame(() => {
        app.classList.add('is-camera-captured');
        if (flashEnabled) app.classList.add('is-camera-flashing');
      });
      captureTimer = window.setTimeout(() => {
        app.classList.remove('is-camera-captured', 'is-camera-flashing');
      }, 520);
    }
    hasCapture = true;
    setStatus('已拍攝');
  };

  const flipCamera = () => {
    clearTimeout(switchTimer);
    app.classList.add('is-camera-switching');
    switchTimer = window.setTimeout(() => {
      const facing = app.dataset.cameraFacing === 'rear' ? 'front' : 'rear';
      app.dataset.cameraFacing = facing;
      facingLabel.textContent = facing === 'front' ? 'FRONT' : 'REAR';
      app.classList.remove('is-camera-switching');
      setStatus(facing === 'front' ? '前鏡頭已就緒' : '相機已就緒');
    }, reducedMotion ? 0 : 240);
  };

  const onCameraClick = (event) => {
    const control = event.target.closest('button');
    if (!control) return;
    if (control.matches('[data-camera-shutter]')) capture();
    if (control.matches('[data-camera-flip]')) flipCamera();
    if (control.matches('[data-camera-flash]')) {
      flashEnabled = !flashEnabled;
      control.setAttribute('aria-pressed', String(flashEnabled));
      app.dataset.cameraFlash = flashEnabled ? 'on' : 'off';
      setStatus(flashEnabled ? '閃光燈已開啟' : '閃光燈已關閉');
    }
    if (control.matches('[data-camera-zoom]')) {
      const zoom = Number(control.dataset.cameraZoom);
      app.style.setProperty('--contact-camera-zoom', String(zoom));
      zoomButtons.forEach((button) => {
        button.setAttribute('aria-pressed', String(button === control));
      });
      setStatus(`${zoom} 倍鏡頭`);
    }
    if (control.matches('[data-camera-last]')) {
      setStatus(hasCapture ? '最近一次拍攝' : '尚未拍攝');
    }
  };

  const onHomeGestureStart = (event) => {
    homeGestureStart = event.clientY;
    homeIndicator.setPointerCapture?.(event.pointerId);
  };
  const onHomeGestureEnd = (event) => {
    if (homeGestureStart !== null && homeGestureStart - event.clientY >= 48) returnHome();
    homeGestureStart = null;
  };
  const onHomeGestureCancel = () => {
    homeGestureStart = null;
  };
  const onKeyDown = (event) => {
    if (event.key === 'Escape' && visible && os.dataset.phoneScreen === 'camera') returnHome();
  };

  openCamera.addEventListener('click', openCameraApp);
  homeIndicator.addEventListener('click', returnHome);
  homeIndicator.addEventListener('pointerdown', onHomeGestureStart);
  homeIndicator.addEventListener('pointerup', onHomeGestureEnd);
  homeIndicator.addEventListener('pointercancel', onHomeGestureCancel);
  document.addEventListener('keydown', onKeyDown);

  app.addEventListener('click', onCameraClick);
  const unbindPendingContactLinks = bindPendingContactLinks(home);
  setPhoneScreen('home', false);
  let destroyContactEntrance = () => {};
  let entranceStarted = false;

  if (finePointer && !reducedMotion) {
    section.addEventListener('pointermove', onPointerMove, { passive: true });
    section.addEventListener('pointerleave', onPointerLeave, { passive: true });
  }

  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
  }, { rootMargin: '20%' });
  visibilityObserver.observe(section);

  return {
    startEntrance(options) {
      if (entranceStarted) return;
      entranceStarted = true;
      destroyContactEntrance = createContactEntrance(section, device, config, options);
    },
    scrollToSettled(behavior = 'smooth') {
      const trigger = ScrollTrigger.getById('resume-experience-contact-handoff');
      if (!trigger) return false;
      window.scrollTo({
        top: gsap.utils.interpolate(
          trigger.start,
          trigger.end,
          EXPERIENCE_CONTACT_HANDOFF.contactStart
            + (1 - EXPERIENCE_CONTACT_HANDOFF.contactStart)
              * EXPERIENCE_CONTACT_HANDOFF.settledProgress,
        ),
        behavior,
      });
      return true;
    },
    destroy() {
      cancelAnimationFrame(frame);
      clearTimeout(captureTimer);
      clearTimeout(switchTimer);
      bootTimers.forEach(clearTimeout);
      visibilityObserver.disconnect();
      destroyContactEntrance();
      unbindPendingContactLinks();
      app.removeEventListener('click', onCameraClick);
      openCamera.removeEventListener('click', openCameraApp);
      homeIndicator.removeEventListener('click', returnHome);
      homeIndicator.removeEventListener('pointerdown', onHomeGestureStart);
      homeIndicator.removeEventListener('pointerup', onHomeGestureEnd);
      homeIndicator.removeEventListener('pointercancel', onHomeGestureCancel);
      document.removeEventListener('keydown', onKeyDown);
      section.removeEventListener('pointermove', onPointerMove);
      section.removeEventListener('pointerleave', onPointerLeave);
      app.style.removeProperty('--contact-camera-zoom');
      device.style.removeProperty('--contact-phone-float');
      device.style.removeProperty('--contact-phone-rotate-x');
      device.style.removeProperty('--contact-phone-rotate-y');
    },
  };
};
