import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import {
  EXPERIENCE_CONTACT_HANDOFF,
  createExperienceRoutePath,
  getExperienceDocumentRouteState,
  getExperienceDogExitState,
  getExperienceDogRouteHoldState,
  getExperienceHandoffState,
  getDogPoseWeights,
  mapIndependentExperienceTracks,
  mapPinnedExperienceIntro,
} from './experience-sequence-math.js';

gsap.registerPlugin(ScrollTrigger, SplitText);

export const initExperienceSequence = (
  animationMap,
  { contact, getSkillsTrigger = () => null } = {},
) => {
  const root = document.querySelector('[data-experience-sequence]');
  if (!root) throw new Error('Experience route markup is missing');

  const config = animationMap.sections.find((section) => section.id === 'experience') || {};
  const contactConfig = animationMap.sections.find((section) => section.id === 'contact') || {};
  const stage = root.querySelector('[data-experience-stage]');
  const routeShapes = [...root.querySelectorAll('[data-experience-route-shape]')];
  const routePath = root.querySelector('[data-experience-route]');
  const routeLine = routePath?.closest('.experience-route-line');
  const drawnRoutes = [...root.querySelectorAll(
    '.experience-route-line__mist, .experience-route-line__glow, '
    + '.experience-route-line__active, [data-experience-route-reveal]',
  )];
  const cards = [...root.querySelectorAll('.career-route li')];
  const dog = root.querySelector('[data-experience-dog]');
  const poses = dog ? [...dog.querySelectorAll('[data-experience-pose]')] : [];
  const sharedRoot = root.closest('[data-skills-sequence]');
  const backdrop = sharedRoot?.querySelector('[data-experience-backdrop]');
  const backdropWorld = backdrop?.querySelector('[data-experience-backdrop-world]');
  const experiencePaint = sharedRoot?.querySelector('[data-experience-paint]');
  if (
    !sharedRoot
    || !backdrop
    || !backdropWorld
    || !experiencePaint
    || !contact
    || !stage
    || !routePath
    || !routeLine
    || drawnRoutes.length === 0
    || cards.length === 0
    || !dog
    || poses.length === 0
  ) {
    throw new Error('Experience route markup is incomplete');
  }
  const paintHome = experiencePaint.parentElement;
  const syncPaintLayerOwner = (backdropOwnsPaint) => {
    const owner = backdropOwnsPaint ? backdrop : paintHome;
    if (experiencePaint.parentElement !== owner) owner.append(experiencePaint);
  };

  const cardScans = cards.map((card) => {
    const scan = document.createElement('i');
    scan.className = 'experience-card-scan';
    scan.setAttribute('aria-hidden', 'true');
    card.prepend(scan);
    return scan;
  });

  const stageHeightVh = config.stageHeightVh ?? 260;
  root.style.setProperty('--experience-stage-height', `${stageHeightVh}svh`);
  sharedRoot.style.setProperty('--experience-stage-height', `${stageHeightVh}svh`);

  const mm = gsap.matchMedia();
  let routeAnimation = null;
  let dogAnimation = null;
  let sceneHold = null;
  let backgroundPin = null;
  let introHandoff = null;
  let cardSplits = [];
  let cardTimelines = [];
  let routeLength = 1;
  let routeReady = false;
  let introRouteDistance = 1;
  let introRouteLeadDistance = 1;
  let lastRouteProgress = 0;
  let lastDogProgress = 0;
  let pinnedIntroActive = false;
  let pinnedRouteProgress = 0;
  let pinnedDogProgress = 0;
  let handoffHoldActive = false;
  let handoffComplete = false;
  let introHandoffDistance = 0;
  let introHandoffProgress = 0;
  let contactHandoffActive = false;
  let contactDogFrame = null;
  let lastDogRouteDistance = 0;
  let sceneHoldStartRouteRatio = 0;
  let sceneHoldStartDistance = 0;
  let sceneHoldEndDistance = 0;
  let sceneHoldTravelEnd = 1;
  let lastSceneHoldProgress = 0;

  const setContactCardOwnership = (active) => {
    cardTimelines.forEach((timeline) => {
      const trigger = timeline?.scrollTrigger;
      if (!trigger) return;
      if (active) {
        trigger.disable(false);
        timeline.progress(1);
      } else if (!trigger.enabled) {
        trigger.enable(false, false);
        trigger.update();
      }
    });
  };

  const syncContactDogFrame = () => {
    const stageRect = stage.getBoundingClientRect();
    const routePoint = routePath.getPointAtLength(lastDogRouteDistance);
    contactDogFrame = {
      x: routePoint.x,
      y: routePoint.y,
      width: dog.offsetWidth,
      stageWidth: stageRect.width,
    };
  };

  const renderContactDogExit = (progress) => {
    if (!contactDogFrame) return;
    const frame = contactDogFrame;
    const state = getExperienceDogExitState({
      progress,
      startX: frame.x,
      endX: frame.stageWidth + frame.width / 2,
      y: frame.y,
    });
    gsap.set(dog, {
      autoAlpha: state.visible ? 1 : 0,
      x: state.x,
      y: state.y,
      xPercent: -50,
      yPercent: -50,
      scaleX: -1,
      rotation: 0,
    });
  };

  /**
   * Ownership handoff — Experience -> Contact.
   * While the Contact ScrollTrigger is active, Contact disables card triggers and owns
   * dog transforms plus stage/backdrop visibility. Releasing the handoff re-enables
   * cards and restores the saved route, dog, or scene-hold state.
   */
  const releaseContactHandoff = (state = null) => {
    contactHandoffActive = false;
    contactDogFrame = null;
    setContactCardOwnership(false);
    sharedRoot.classList.remove('is-experience-contact-handoff-owner');
    if (state?.sceneOwner === 'contact') {
      sharedRoot.classList.add('is-experience-contact-handoff-complete');
      return;
    }
    sharedRoot.classList.remove('is-experience-contact-handoff-complete');
    gsap.set([backdrop, stage], { autoAlpha: 1 });
    handoffHoldActive = Boolean(sceneHold?.isActive);
    handoffComplete = false;
    if (!routeReady) return;
    renderRoute(lastRouteProgress);
    if (handoffHoldActive) renderSceneHold(lastSceneHoldProgress);
    else renderDog(lastDogProgress);
  };

  const syncContactHandoff = ({
    active = false,
    state = null,
    remeasure = false,
  } = {}) => {
    if (!active) {
      releaseContactHandoff(state);
      return true;
    }
    if (!state) return false;
    if (!contactHandoffActive || remeasure) {
      const wasHeld = handoffHoldActive;
      contactHandoffActive = false;
      handoffHoldActive = false;
      handoffComplete = false;
      releasePinnedIntro();
      renderRoute(lastRouteProgress);
      if (wasHeld && sceneHold?.isActive) renderSceneHold(lastSceneHoldProgress);
      else renderDog(lastDogProgress);
      handoffHoldActive = wasHeld;
      contactHandoffActive = true;
      sharedRoot.classList.remove('is-experience-contact-handoff-complete');
      sharedRoot.classList.add('is-experience-contact-handoff-owner');
      setContactCardOwnership(true);
      syncContactDogFrame();
    }
    setPose(1);
    gsap.set([backdrop, stage], { autoAlpha: state.experienceVisible ? 1 : 0 });
    renderContactDogExit(state.exitProgress);
    root.dataset.experienceContactProgress = state.progress.toFixed(4);
    return true;
  };

  const setPose = (progress) => {
    const weights = getDogPoseWeights(progress);
    poses.forEach((image) => {
      image.style.opacity = weights[image.dataset.experiencePose].toFixed(4);
    });
  };

  const getRouteDistanceAtY = (targetY) => {
    let low = 0;
    let high = routeLength;
    for (let index = 0; index < 16; index += 1) {
      const middle = (low + high) / 2;
      if (routePath.getPointAtLength(middle).y < targetY) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  };

  const setDrawnDistance = (distance) => {
    drawnRoutes.forEach((path) => {
      path.style.strokeDashoffset = String(routeLength - Math.min(routeLength, distance));
    });
  };

  const positionDog = (routeDistance, progress, visible) => {
    const distance = gsap.utils.clamp(0, routeLength, routeDistance);
    lastDogRouteDistance = distance;
    const routePoint = routePath.getPointAtLength(distance);
    const behind = routePath.getPointAtLength(Math.max(0, distance - routeLength * 0.008));
    const ahead = routePath.getPointAtLength(Math.min(routeLength, distance + routeLength * 0.008));
    const direction = ahead.x >= behind.x ? 1 : -1;
    const slope = Math.atan2(ahead.y - behind.y, Math.abs(ahead.x - behind.x)) * (180 / Math.PI);

    gsap.set(dog, {
      autoAlpha: visible ? 1 : 0,
      x: routePoint.x,
      y: routePoint.y,
      xPercent: -50,
      yPercent: -50,
      scaleX: direction,
      rotation: gsap.utils.clamp(-6, 6, slope * 0.12),
    });
    setPose(progress);
  };

  const renderRoute = (progress) => {
    lastRouteProgress = progress;
    if (pinnedIntroActive) return;
    const state = mapIndependentExperienceTracks({
      routeProgress: progress,
      dogProgress: lastDogProgress,
    });
    const routeState = getExperienceDocumentRouteState({
      routeProgress: state.line,
      routeLength,
      routeLeadDistance: introRouteLeadDistance,
      routeActive: Boolean(routeAnimation?.scrollTrigger?.isActive),
    });
    gsap.set(routeLine, { autoAlpha: routeState.visible ? 1 : 0 });
    setDrawnDistance(routeState.drawnDistance);
    root.dataset.experienceRouteProgress = state.line.toFixed(4);
  };

  const renderDog = (progress) => {
    lastDogProgress = progress;
    if (pinnedIntroActive || handoffHoldActive || handoffComplete || contactHandoffActive) return;
    const stageBounds = stage.getBoundingClientRect();
    const viewportCenter = window.innerHeight / 2;
    const dogDistance = getRouteDistanceAtY(viewportCenter - stageBounds.top);
    const dogVisible = stageBounds.top <= viewportCenter && stageBounds.bottom >= viewportCenter;
    positionDog(dogDistance, progress, dogVisible);
    root.dataset.experienceDogProgress = progress.toFixed(4);
  };

  const renderSceneHold = (progress) => {
    lastSceneHoldProgress = progress;
    if (!routeReady || contactHandoffActive) return;
    const state = getExperienceDogRouteHoldState({
      progress,
      travelEnd: sceneHoldTravelEnd,
      startDistance: sceneHoldStartDistance,
      endDistance: sceneHoldEndDistance,
    });
    positionDog(state.routeDistance, state.poseProgress, true);
    root.dataset.experienceDogHoldProgress = Math.min(
      1,
      progress / sceneHoldTravelEnd,
    ).toFixed(4);
  };

  const applyPinnedIntro = () => {
    pinnedIntroActive = pinnedRouteProgress > 0 || pinnedDogProgress > 0;
    root.classList.toggle('is-experience-pinned-intro', pinnedIntroActive);
    if (!pinnedIntroActive) {
      gsap.set(stage, { clearProps: 'transform' });
      if (!routeReady) return;
      renderRoute(lastRouteProgress);
      renderDog(lastDogProgress);
      return;
    }
    gsap.set(routeLine, { autoAlpha: 1 });

    const handoff = getExperienceHandoffState(
      introHandoffProgress,
      introHandoffDistance,
    );
    const state = mapPinnedExperienceIntro({
      routeProgress: pinnedRouteProgress,
      dogProgress: pinnedDogProgress,
      routeEndDistance: introRouteDistance,
      routeLeadDistance: introRouteLeadDistance,
      centerDistance: getRouteDistanceAtY(
        window.innerHeight * 0.5 - handoff.stageY,
      ),
    });
    gsap.set(stage, { y: handoff.stageY });
    setDrawnDistance(state.drawnDistance);
    positionDog(state.dogDistance, 0, state.dogVisible);
  };

  const releasePinnedIntro = () => {
    if (!pinnedIntroActive && !root.classList.contains('is-experience-pinned-intro')) return;
    pinnedIntroActive = false;
    root.classList.remove('is-experience-pinned-intro');
    gsap.set(stage, { clearProps: 'transform' });
    if (!routeReady) return;
    renderRoute(lastRouteProgress);
    renderDog(lastDogProgress);
  };

  const syncPinnedIntro = ({
    active = true,
    routeProgress = 0,
    dogProgress = 0,
  } = {}) => {
    if (!active) {
      releasePinnedIntro();
      return;
    }
    if (handoffHoldActive || handoffComplete || contactHandoffActive) {
      releasePinnedIntro();
      return;
    }
    if (routeAnimation?.scrollTrigger?.isActive) return;
    pinnedRouteProgress = routeProgress;
    pinnedDogProgress = dogProgress;
    applyPinnedIntro();
  };

  const resize = () => {
    const bounds = stage.getBoundingClientRect();
    const route = createExperienceRoutePath({
      width: bounds.width,
      height: bounds.height,
    });
    routeShapes.forEach((path) => path.setAttribute('d', route));
    routeLength = routePath.getTotalLength();
    routeReady = true;
    introRouteDistance = getRouteDistanceAtY(Math.min(bounds.height, window.innerHeight * 1.02));
    introRouteLeadDistance = getRouteDistanceAtY(
      Math.min(bounds.height, window.innerHeight * 2.02),
    );
    drawnRoutes.forEach((path) => {
      path.style.strokeDasharray = String(routeLength);
    });
    if (pinnedIntroActive) applyPinnedIntro();
    else {
      renderRoute(lastRouteProgress);
      renderDog(lastDogProgress);
    }
  };

  mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
    root.classList.remove('is-experience-fallback');
    const skillsPin = getSkillsTrigger();
    if (!skillsPin) throw new Error('Skills pin is missing before Experience handoff');
    const syncIntroHandoffGeometry = () => {
      introHandoffDistance = Math.min(72, Math.round(window.innerHeight * 0.08));
      sharedRoot.style.setProperty(
        '--experience-handoff-shift',
        `${introHandoffDistance / 2}px`,
      );
    };
    const renderIntroHandoff = (progress) => {
      introHandoffProgress = progress;
      const state = getExperienceHandoffState(progress, introHandoffDistance);
      if (progress >= 1) {
        gsap.set([backdropWorld, experiencePaint], { clearProps: 'transform' });
      } else {
        gsap.set([backdropWorld, experiencePaint], { y: state.backdropY });
      }
      syncPaintLayerOwner(progress >= 1);
      if (pinnedIntroActive) applyPinnedIntro();
    };
    syncIntroHandoffGeometry();
    renderIntroHandoff(0);
    resize();
    const routePlayhead = { progress: 0 };
    const dogPlayhead = { progress: 0 };
    /**
     * Animation contract — Skills -> Experience document.
     * Skills owns the pinned route/dog intro until these document triggers enter.
     * Route, dog, and card timelines then own their stroke/transform/reveal properties;
     * matchMedia cleanup kills them, reverts SplitText, and clears styles.
     */
    routeAnimation = gsap.to(routePlayhead, {
      progress: 1,
      duration: 1,
      ease: 'none',
      onUpdate: () => renderRoute(routePlayhead.progress),
      scrollTrigger: {
        id: 'resume-experience-document-route',
        trigger: root,
        start: 'top top',
        end: 'bottom 150%',
        scrub: config.routeScrub ?? 0.4,
        invalidateOnRefresh: true,
        onRefreshInit: () => {
          syncIntroHandoffGeometry();
          resize();
        },
        onRefresh: () => renderRoute(routePlayhead.progress),
        onEnter: releasePinnedIntro,
        onEnterBack: releasePinnedIntro,
      },
    });
    dogAnimation = gsap.to(dogPlayhead, {
      progress: 1,
      duration: 1,
      ease: 'none',
      onUpdate: () => renderDog(dogPlayhead.progress),
      scrollTrigger: {
        id: 'resume-experience-document-dog',
        trigger: root,
        start: 'top top',
        end: 'bottom center',
        scrub: config.dogScrub ?? config.scrub ?? 0.55,
        invalidateOnRefresh: true,
        onRefresh: () => renderDog(dogPlayhead.progress),
        onUpdate: () => renderDog(dogPlayhead.progress),
        onEnter: releasePinnedIntro,
        onEnterBack: releasePinnedIntro,
        onToggle: (self) => {
          root.dataset.experienceActive = String(self.isActive);
          if (self.isActive) {
            window.dispatchEvent(new CustomEvent('resume:section', { detail: 'experience' }));
          }
        },
      },
    });
    cardSplits = cards.map((card, index) => {
      const date = card.querySelector('time');
      const dateTrack = date?.querySelector('.experience-date__track');
      const dateValues = date
        ? [...date.querySelectorAll('.experience-date__value')]
        : [];
      const title = card.querySelector('strong');
      const company = card.querySelector('.experience-company');
      const copy = card.querySelector('p');
      const scan = cardScans[index];
      const scanOrigin = index === 0 ? 'left center' : 'right center';

      if (
        !date
        || !dateTrack
        || dateValues.length !== 2
        || !title
        || !company
        || !copy
      ) {
        throw new Error(`Experience card ${index + 1} content is incomplete`);
      }

      return SplitText.create(title, {
        type: 'lines',
        mask: 'lines',
        autoSplit: true,
        linesClass: 'experience-title-line',
        onSplit: (split) => {
          const timeline = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
              id: `resume-experience-card-${index + 1}`,
              trigger: card,
              start: () => `top ${Math.round(
                window.innerHeight * 0.96 - introHandoffDistance / 2,
              )}px`,
              end: () => `top ${Math.round(
                window.innerHeight * 0.38 - introHandoffDistance / 2,
              )}px`,
              scrub: config.cardScrub ?? 0.7,
              invalidateOnRefresh: true,
              onUpdate: (self) => {
                root.dataset[`experienceCard${index + 1}Progress`] = self.progress.toFixed(4);
              },
            },
          });

          timeline
            .set(split.lines, { autoAlpha: 0, yPercent: 110 }, 0)
            .fromTo(
              card,
              { autoAlpha: 0, y: 16 },
              { autoAlpha: 1, y: 0, duration: 0.2 },
              0,
            )
            .fromTo(
              scan,
              { autoAlpha: 0, scaleX: 0, transformOrigin: scanOrigin },
              {
                autoAlpha: 0.86,
                scaleX: 1,
                duration: 0.3,
              },
              0.06,
            )
            .to(scan, { autoAlpha: 0, duration: 0.12 }, 0.34)
            .set(date, { autoAlpha: 1 }, 0)
            .fromTo(
              dateTrack,
              { autoAlpha: 0, scaleX: 0, transformOrigin: 'left center' },
              { autoAlpha: 1, scaleX: 1, duration: 0.24 },
              0.14,
            )
            .fromTo(
              dateValues,
              { autoAlpha: 0, y: 5 },
              { autoAlpha: 1, y: 0, duration: 0.2, stagger: 0.04 },
              0.3,
            )
            .to(
              split.lines,
              {
                autoAlpha: 1,
                yPercent: 0,
                duration: 0.42,
                stagger: 0.1,
              },
              0.42,
            )
            .fromTo(
              company,
              { autoAlpha: 0, y: 8 },
              { autoAlpha: 1, y: 0, duration: 0.24 },
              0.9,
            )
            .fromTo(
              copy,
              { autoAlpha: 0, y: 10 },
              { autoAlpha: 1, y: 0, duration: 0.3 },
              1.12,
            );

          cardTimelines[index] = timeline;
          if (contactHandoffActive) setContactCardOwnership(true);
          return timeline;
        },
      });
    });
    introHandoff = ScrollTrigger.create({
      id: 'resume-experience-intro-handoff',
      trigger: sharedRoot,
      start: () => skillsPin.end - introHandoffDistance,
      end: () => skillsPin.end,
      invalidateOnRefresh: true,
      onRefreshInit: syncIntroHandoffGeometry,
      onRefresh: (self) => renderIntroHandoff(self.progress),
      onUpdate: (self) => renderIntroHandoff(self.progress),
    });
    const getHandoffHoldDistance = () => Math.round(
      window.innerHeight * (config.handoffHoldDistanceVh ?? 0.7),
    );
    const getContactHandoffDistance = () => Math.max(
      window.innerHeight * (contactConfig.scrollDistanceVh ?? 5),
      3200,
    );
    const getSceneHoldEnd = () => `top top-=${Math.round(
      getContactHandoffDistance() * EXPERIENCE_CONTACT_HANDOFF.contactStart
    )}px`;
    const syncBackdropGeometry = () => {
      const styles = getComputedStyle(sharedRoot);
      backdrop.style.setProperty(
        '--skills-experience-wall-height',
        styles.getPropertyValue('--skills-experience-wall-height'),
      );
      backdrop.style.setProperty(
        '--skills-wall-viewport-height',
        styles.getPropertyValue('--skills-wall-viewport-height'),
      );
      backdrop.style.setProperty(
        '--experience-handoff-shift',
        styles.getPropertyValue('--experience-handoff-shift'),
      );
    };
    const syncSceneHoldGeometry = (captureStart = false, trigger = sceneHold) => {
      const stageBounds = stage.getBoundingClientRect();
      if (captureStart) {
        const startPoint = routePath.getPointAtLength(lastDogRouteDistance);
        sceneHoldStartRouteRatio = gsap.utils.clamp(
          0,
          1,
          startPoint.y / stageBounds.height,
        );
      }
      sceneHoldStartDistance = getRouteDistanceAtY(
        stageBounds.height * sceneHoldStartRouteRatio,
      );
      const finalCardBounds = cards.at(-1).getBoundingClientRect();
      const targetViewportY = gsap.utils.clamp(
        window.innerHeight / 2,
        window.innerHeight - dog.offsetHeight * 0.55,
        finalCardBounds.top + finalCardBounds.height / 2,
      );
      sceneHoldEndDistance = getRouteDistanceAtY(
        gsap.utils.clamp(0, stageBounds.height, targetViewportY - stageBounds.top),
      );
      const contactTrigger = ScrollTrigger.getById('resume-experience-contact-handoff');
      const holdStart = trigger?.start ?? 0;
      const holdEnd = trigger?.end ?? (
        holdStart
        + getHandoffHoldDistance()
        + getContactHandoffDistance() * EXPERIENCE_CONTACT_HANDOFF.contactStart
      );
      const contactStart = contactTrigger?.start ?? holdStart + getHandoffHoldDistance();
      sceneHoldTravelEnd = gsap.utils.clamp(
        0.01,
        1,
        (contactStart - holdStart) / Math.max(1, holdEnd - holdStart),
      );
    };
    const beginSceneHold = (self) => {
      handoffComplete = false;
      handoffHoldActive = false;
      releasePinnedIntro();
      renderRoute(lastRouteProgress);
      if (!contactHandoffActive) renderDog(lastDogProgress);
      syncSceneHoldGeometry(!contactHandoffActive, self);
      handoffHoldActive = true;
      if (contactHandoffActive) syncContactDogFrame();
      else renderSceneHold(self.progress);
    };
    syncBackdropGeometry();
    backgroundPin = ScrollTrigger.create({
      id: 'resume-experience-background-exit',
      trigger: cards.at(-1),
      start: 'top 32%',
      endTrigger: contact,
      end: getSceneHoldEnd,
      pin: backdrop,
      pinSpacing: false,
      pinReparent: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onRefreshInit: syncBackdropGeometry,
      onToggle: (self) => {
        sharedRoot.classList.toggle(
          'is-experience-exit-background-pinned',
          self.isActive,
        );
      },
    });
    sceneHold = ScrollTrigger.create({
      id: 'resume-experience-contact-scene-hold',
      trigger: cards.at(-1),
      start: 'top 32%',
      endTrigger: contact,
      end: getSceneHoldEnd,
      pin: stage,
      pinSpacing: false,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onEnter: beginSceneHold,
      onEnterBack: beginSceneHold,
      onRefresh: (self) => {
        syncSceneHoldGeometry(false, self);
        if (self.isActive && !contactHandoffActive) renderSceneHold(self.progress);
      },
      onUpdate: (self) => renderSceneHold(self.progress),
      onLeave: () => {
        handoffHoldActive = false;
        handoffComplete = true;
      },
      onLeaveBack: () => {
        handoffHoldActive = false;
        handoffComplete = false;
        renderDog(lastDogProgress);
      },
    });
    renderRoute(0);
    renderDog(0);

    return () => {
      syncPaintLayerOwner(false);
      releaseContactHandoff();
      releasePinnedIntro();
      routeAnimation?.kill();
      dogAnimation?.kill();
      sceneHold?.kill();
      backgroundPin?.kill();
      introHandoff?.kill();
      cardSplits.forEach((split) => split.revert());
      routeAnimation = null;
      dogAnimation = null;
      sceneHold = null;
      backgroundPin = null;
      introHandoff = null;
      cardSplits = [];
      cardTimelines = [];
      handoffHoldActive = false;
      handoffComplete = false;
      lastSceneHoldProgress = 0;
      delete root.dataset.experienceDogHoldProgress;
      introHandoffDistance = 0;
      introHandoffProgress = 0;
      sharedRoot.classList.remove('is-experience-contact-handoff-owner');
      sharedRoot.classList.remove('is-experience-contact-handoff-complete');
      sharedRoot.classList.remove('is-experience-exit-background-pinned');
      sharedRoot.style.removeProperty('--experience-handoff-shift');
      gsap.set([backdropWorld, experiencePaint], { clearProps: 'transform' });
      gsap.set(
        [backdrop, stage, routeLine, dog, ...cards, ...cardScans],
        { clearProps: 'transform,opacity,visibility' },
      );
      delete root.dataset.experienceContactProgress;
      drawnRoutes.forEach((path) => {
        path.style.removeProperty('stroke-dasharray');
        path.style.removeProperty('stroke-dashoffset');
      });
    };
  });

  mm.add('(max-width: 767px), (prefers-reduced-motion: reduce)', () => {
    root.classList.add('is-experience-fallback');
    gsap.set(cards, { autoAlpha: 1, clearProps: 'transform' });
    gsap.set(cardScans, { autoAlpha: 0, clearProps: 'transform' });
    return () => {
      root.classList.remove('is-experience-fallback');
      gsap.set(cards, { clearProps: 'opacity,visibility,transform' });
      gsap.set(cardScans, { clearProps: 'opacity,visibility,transform' });
    };
  });

  return {
    syncPinnedIntro,
    syncContactHandoff,
    scrollToStart(behavior = 'smooth') {
      const documentStart = window.scrollY + root.getBoundingClientRect().top;
      const target = Math.max(dogAnimation?.scrollTrigger?.start ?? documentStart, documentStart);
      window.scrollTo({
        top: target + Math.max(2, introHandoffDistance + 1),
        behavior,
      });
    },
    destroy() {
      releaseContactHandoff();
      releasePinnedIntro();
      mm.revert();
      routeAnimation?.kill();
      dogAnimation?.kill();
      sceneHold?.kill();
      backgroundPin?.kill();
      introHandoff?.kill();
      cardSplits.forEach((split) => split.revert());
      cardScans.forEach((scan) => scan.remove());
    },
  };
};
