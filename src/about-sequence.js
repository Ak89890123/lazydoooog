import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  aboutScrollDistancePx,
  createAboutScreenContentState,
  createAboutSemanticState,
  getAboutComboHudMotion,
  getAboutComboHudState,
  getAboutComboHudPosition,
  getAboutDesktopComboHudState,
  getAboutDogGroundOffset,
  getAboutDogHorizontalPosition,
  getAboutDogTrickOffset,
  getAboutPlateState,
  mapAboutStateToDesktopProgress,
  mapDesktopProgressToAboutState,
} from './about-sequence-math.js';
import { createAboutWorkflowMediaController } from './about-workflow-media.js';
import {
  createAboutSpriteFrameState,
  createAboutSpriteRenderState,
  validateAboutSpriteManifest,
} from './about-sprite-manifest.js';

gsap.registerPlugin(ScrollTrigger);

const clamp = gsap.utils.clamp(0, 1);
const PLATE_COMPLETION_Q = 0.72;
const COMBO_LABELS = Object.freeze(['OLLIE x1', 'KICKFLIP x2', 'BOARDSLIDE x3']);

const progressBetween = (value, start, end) => (
  clamp((value - start) / Math.max(0.0001, end - start))
);

const renderPlateState = (plate, state) => {
  if (!plate) return;
  if (plate.dataset.manualPress === 'true') return;
  plate.classList.toggle('is-on', state.unlocked);
  plate.dataset.pressFrame = String(state.frame);
};

const createAboutSpriteMediaController = (root, config = {}) => {
  const enabled = config.enabled === true;
  const manifests = new Map();
  const renderedDogs = new Map();
  let destroyed = false;

  root.dataset.aboutSpriteMediaState = enabled ? 'loading' : 'blockout';

  const render = (dog, semantic) => {
    const frameState = createAboutSpriteFrameState(semantic);
    renderedDogs.set(dog, semantic);
    dog.dataset.aboutSpriteSheet = frameState.sheet;
    dog.dataset.aboutSpriteFrame = String(frameState.frame);
    dog.dataset.aboutSpritePose = frameState.pose;
    dog.dataset.aboutSpriteVisible = String(frameState.visible);
    dog.style.visibility = frameState.visible ? '' : 'hidden';

    const manifest = manifests.get(frameState.sheet);
    if (!manifest) {
      dog.dataset.aboutSpriteAssetState = enabled ? 'loading' : 'blockout';
      return frameState;
    }

    const state = createAboutSpriteRenderState(manifest, frameState.frame);
    const renderKey = `${frameState.sheet}:${frameState.frame}`;
    if (dog.dataset.aboutSpriteRenderKey !== renderKey) {
      dog.style.backgroundImage = `url("${state.sheetPath}")`;
      dog.style.backgroundSize = state.backgroundSize;
      dog.style.backgroundPosition = state.backgroundPosition;
      dog.dataset.aboutSpriteRenderKey = renderKey;
    }
    dog.dataset.aboutSpriteAssetState = 'ready';
    return frameState;
  };

  const load = async () => {
    if (!enabled) return;
    try {
      const loaded = await Promise.all(config.manifests.map(async (manifestPath) => {
        const response = await fetch(manifestPath, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`Sprite manifest failed: ${manifestPath}`);
        const manifest = await response.json();
        const validation = validateAboutSpriteManifest(manifest);
        if (!validation.valid) {
          throw new Error(`Invalid sprite manifest: ${manifest.id}`);
        }
        const runtimeManifest = {
          ...manifest,
          sheetPath: new URL(manifest.sheetPath.slice(1), document.baseURI).href,
        };
        const image = new Image();
        image.src = runtimeManifest.sheetPath;
        if (typeof image.decode === 'function') await image.decode();
        return runtimeManifest;
      }));
      if (destroyed) return;
      loaded.forEach((manifest) => manifests.set(manifest.id, manifest));
      root.dataset.aboutSpriteMediaState = 'ready';
      renderedDogs.forEach((semantic, dog) => render(dog, semantic));
    } catch (error) {
      if (destroyed) return;
      root.dataset.aboutSpriteMediaState = 'error';
      console.warn('About sprite media unavailable; keeping blockout', error);
    }
  };

  load();

  return {
    render,
    release(dog) {
      renderedDogs.delete(dog);
    },
    destroy() {
      destroyed = true;
      renderedDogs.clear();
      manifests.clear();
    },
  };
};

const renderUnlockState = ({
  semantic,
  screens,
  contents,
  flashes,
  plates,
  lights,
  hud,
  progress,
  comboAnchors,
}) => {
  const activeIndex = semantic.stage - 1;

  screens.forEach((screen, index) => {
    const isPrior = index < activeIndex;
    const isCurrent = index === activeIndex;
    const boot = isPrior ? 1 : (isCurrent ? progressBetween(semantic.q, 0.55, 0.65) : 0);
    const content = isPrior ? 1 : (isCurrent ? progressBetween(semantic.q, 0.65, 0.72) : 0);
    const unlocked = semantic.screenUnlockMask[index];

    screen.dataset.screenState = content >= 1
      ? 'content'
      : boot > 0
        ? 'booting'
        : unlocked
          ? 'impact'
          : 'standby';
    gsap.set(screen, {
      autoAlpha: 0.08 + boot * 0.92,
      scale: 0.985 + boot * 0.015,
      filter: `saturate(${0.2 + boot * 0.8})`,
    });
    gsap.set(contents[index], { autoAlpha: content, y: 12 * (1 - content) });

    const flashAmount = isCurrent && semantic.phase === 'boot'
      ? 1 - Math.abs(semantic.phaseRatio * 2 - 1)
      : 0;
    gsap.set(flashes[index], {
      autoAlpha: flashAmount,
      scaleY: 0.04 + flashAmount * 0.96,
      transformOrigin: '50% 50%',
    });

    renderPlateState(plates[index], getAboutPlateState(semantic, index));
    gsap.set(lights[index], {
      autoAlpha: isPrior ? 1 : (isCurrent ? progressBetween(semantic.q, 0.5, 0.65) : 0),
    });
    const comboHud = getAboutDesktopComboHudState(progress, index);
    const motion = getAboutComboHudMotion(comboHud, index);
    const position = getAboutComboHudPosition({
      ...comboAnchors[index],
      index,
      liftY: comboHud.y,
    });
    gsap.set(hud[index], {
      '--combo-entry': comboHud.entryProgress,
      autoAlpha: comboHud.opacity,
      x: position.x + motion.x,
      y: position.y + motion.y,
      scale: motion.scale,
      rotation: motion.rotation,
      rotationY: motion.rotationY,
      transformPerspective: 420,
    });
  });
};

const createScreenSystemRenderer = (scope) => {
  const characterReel = scope.querySelector('[data-about-character-reel]');
  const repeatSystem = scope.querySelector('[data-about-repeat-system]');
  const repeatViewport = repeatSystem?.querySelector('.motion-repeat-viewport');
  const repeatTrack = scope.querySelector('[data-about-repeat-track]');
  const repeatScanner = scope.querySelector('[data-about-repeat-scanner]');
  const repeatStatus = scope.querySelector('[data-about-repeat-status]');

  return (semantic, desktopProgress) => {
    const state = createAboutScreenContentState(semantic, desktopProgress);

    if (characterReel) {
      characterReel.dataset.reelState = state.portraitVisible ? 'active' : 'standby';
    }

    if (repeatSystem && repeatViewport && repeatTrack && repeatScanner && repeatStatus) {
      const trackTravel = Math.max(0, repeatTrack.scrollWidth - repeatViewport.clientWidth + 16);
      const scannerTravel = Math.max(0, repeatViewport.clientWidth - 2);
      repeatSystem.dataset.repeatState = state.repeatDetected ? 'detected' : 'scanning';
      repeatStatus.classList.toggle('is-detected', state.repeatDetected);
      gsap.set(repeatTrack, {
        x: -trackTravel * state.repeatFlowOffset,
        yPercent: -50,
        force3D: true,
      });
      gsap.set(repeatScanner, {
        x: scannerTravel * state.repeatScanProgress,
        autoAlpha: state.repeatScanProgress > 0 && !state.repeatDetected ? 1 : 0,
        force3D: true,
      });
    }

    return state;
  };
};

const createDesktopRenderer = (root, renderWorkflowMedia, spriteMedia) => {
  const visual = root.querySelector('[data-about-visual]');
  const rig = root.querySelector('.motion-rig');
  const dog = root.querySelector('[data-about-dog]');
  const railFront = root.querySelector('[data-about-rail="front"]');
  const screens = gsap.utils.toArray(root.querySelectorAll('[data-about-screen]'));
  const contents = gsap.utils.toArray(root.querySelectorAll('[data-about-content]'));
  const flashes = gsap.utils.toArray(root.querySelectorAll('[data-about-flash]'));
  const plates = gsap.utils.toArray(root.querySelectorAll('[data-about-plate]'));
  const lights = gsap.utils.toArray(root.querySelectorAll('[data-about-light]'));
  const hud = gsap.utils.toArray(root.querySelectorAll('[data-about-hud]'));
  const renderScreenSystems = createScreenSystemRenderer(root);

  if (!visual || !rig || !dog || screens.length !== 3 || contents.length !== 3) {
    throw new Error('About sequence markup is incomplete');
  }

  const render = (progress, direction = 1) => {
    const semantic = createAboutSemanticState(
      mapDesktopProgressToAboutState(progress, direction),
    );
    const width = rig.clientWidth || window.innerWidth;
    const dogWidth = dog.getBoundingClientRect().width || width * 0.095;
    const dogHeight = dog.offsetHeight || dogWidth;
    const x = getAboutDogHorizontalPosition(semantic) * width - dogWidth / 2;
    const groundY = getAboutDogGroundOffset(semantic) * rig.clientHeight;
    const y = groundY + getAboutDogTrickOffset(semantic) * rig.clientHeight;

    root.dataset.aboutStage = String(semantic.stage);
    root.dataset.aboutQ = semantic.q.toFixed(5);
    root.dataset.aboutPhase = semantic.phase;
    root.dataset.aboutDirection = String(semantic.direction);
    root.style.setProperty('--about-progress', clamp(progress).toFixed(5));
    root.style.setProperty('--about-local-progress', semantic.q.toFixed(5));
    gsap.set(dog, { x, y, force3D: true });
    spriteMedia.render(dog, semantic);
    const railContact = semantic.stage === 3
      ? progressBetween(semantic.q, 0.2, 0.27)
        * (1 - progressBetween(semantic.q, 0.41, 0.48))
      : 0;
    gsap.set(railFront, { autoAlpha: railContact });
    const comboAnchors = hud.map((_, index) => {
      const impactState = { stage: index + 1, q: 0.5, direction };
      const impactX = getAboutDogHorizontalPosition(impactState) * width - dogWidth / 2;
      const impactY = (
        getAboutDogGroundOffset(impactState) + getAboutDogTrickOffset(impactState)
      ) * rig.clientHeight;
      return {
        anchorX: dog.offsetLeft + impactX + dogWidth * 0.5,
        anchorY: dog.offsetTop + impactY + dogHeight * 0.46,
        dogWidth,
        dogHeight,
      };
    });
    renderUnlockState({
      semantic,
      screens,
      contents,
      flashes,
      plates,
      lights,
      hud,
      progress,
      comboAnchors,
    });
    renderScreenSystems(semantic, progress);
    renderWorkflowMedia(semantic);
    return semantic;
  };

  return { render };
};

export const initAboutSequence = (animationMap) => {
  const root = document.querySelector('[data-about-sequence]');
  if (!root) throw new Error('About sequence root is missing');
  const powerCut = document.querySelector('[data-skills-entry]');
  const powerCutOwner = powerCut?.parentElement;
  const skillsTitle = document.querySelector('[data-skills-title]');
  const titleEntry = powerCut?.querySelector('[data-skills-title-entry]');
  const titleWall = document.querySelector('[data-skills-title-wall]');
  if (!powerCut || !powerCutOwner || !skillsTitle || !titleEntry || !titleWall) {
    throw new Error('About-to-skills power cut markup is missing');
  }

  const config = animationMap.sections.find((section) => section.id === 'about') || {};
  const distanceVh = config.scrollDistanceVh ?? 5;
  const powerCutFadeDistanceVh = config.powerCutFadeDistanceVh ?? 0.6;
  const powerCutHoldDistanceVh = config.powerCutHoldDistanceVh ?? 0.15;
  const desktopDistanceVh = distanceVh + powerCutFadeDistanceVh + powerCutHoldDistanceVh;
  const scrub = config.scrub ?? 0.35;
  const mobileAllocation = (config.mobileFallback?.allocationSvh ?? 160) / 100;
  const workflowMedia = createAboutWorkflowMediaController(root, config.workflowMedia);
  const spriteMedia = createAboutSpriteMediaController(root, config.spriteMedia);
  const interactivePlates = gsap.utils.toArray(root.querySelectorAll('[data-about-plate]'));
  const renderer = createDesktopRenderer(
    root,
    (semantic) => workflowMedia.render(semantic),
    spriteMedia,
  );
  const mm = gsap.matchMedia();
  const desktopMedia = window.matchMedia(
    '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
  );
  const mobileMedia = window.matchMedia(
    '(max-width: 767px) and (prefers-reduced-motion: no-preference)',
  );
  let trigger = null;
  let desktopAnimation = null;
  let mobileTriggers = [];
  let mobileAnimations = [];
  let semanticState = createAboutSemanticState({ stage: 1, q: 0, direction: 1 });
  let stableSemanticState = semanticState;
  root.dataset.aboutStableSemantic = '1:0.00000:1';
  let pendingRestore = null;
  let forcedDirection = null;
  let restoreTimer = 0;
  let activePressTimeline = null;
  let activePressPlate = null;
  const directionReleaseEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'];

  const releaseForcedDirection = () => {
    forcedDirection = null;
    directionReleaseEvents.forEach((eventName) => {
      window.removeEventListener(eventName, releaseForcedDirection);
    });
  };

  const armDirectionRelease = () => {
    directionReleaseEvents.forEach((eventName) => {
      window.removeEventListener(eventName, releaseForcedDirection);
      window.addEventListener(eventName, releaseForcedDirection, { passive: true });
    });
  };

  const isWithinTrigger = (item) => item && (
    window.scrollY >= item.start - 1 && window.scrollY <= item.end + 1
  );

  const queueSemanticRestore = (items) => {
    if (pendingRestore) return;
    const activeIndex = items.findIndex((item) => item?.isActive || isWithinTrigger(item));
    if (activeIndex < 0) return;
    const captured = { ...stableSemanticState };
    semanticState = captured;
    stableSemanticState = captured;
    pendingRestore = { ...captured };
    root.dataset.aboutRestoreQueued = `${captured.stage}:${captured.q.toFixed(5)}:${captured.direction}`;
    root.classList.add('is-about-rebuilding');
  };

  const captureBeforeMatchMediaRevert = (items) => {
    if (!items.some((item) => item?.isActive || isWithinTrigger(item))) return;
    pendingRestore = { ...stableSemanticState };
    root.dataset.aboutRestoreQueued = `${stableSemanticState.stage}:${stableSemanticState.q.toFixed(5)}:${stableSemanticState.direction}`;
    root.classList.add('is-about-rebuilding');
  };

  const onDesktopMediaChange = (event) => {
    if (!event.matches) captureBeforeMatchMediaRevert([trigger]);
  };
  const onMobileMediaChange = (event) => {
    if (!event.matches) captureBeforeMatchMediaRevert(mobileTriggers);
  };
  desktopMedia.addEventListener('change', onDesktopMediaChange);
  mobileMedia.addEventListener('change', onMobileMediaChange);

  const finishRestore = (target, render) => {
    if (!pendingRestore) return;
    const captured = pendingRestore;
    pendingRestore = null;
    clearTimeout(restoreTimer);
    restoreTimer = window.setTimeout(() => {
      ScrollTrigger.refresh();
      restoreTimer = window.setTimeout(() => {
        restoreTimer = 0;
        forcedDirection = captured.direction;
        const restoreTarget = target(captured);
        root.dataset.aboutRestoreApplied = `${captured.stage}:${captured.q.toFixed(5)}:${captured.direction}@${Math.round(restoreTarget)}`;
        const previousScrollBehavior = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';
        window.scrollTo(0, restoreTarget);
        ScrollTrigger.update();
        render(captured);
        semanticState = captured;
        stableSemanticState = captured;
        root.classList.remove('is-about-rebuilding');
        requestAnimationFrame(() => {
          document.documentElement.style.scrollBehavior = previousScrollBehavior;
          armDirectionRelease();
        });
      }, 50);
    }, 260);
  };

  const cancelActivePress = () => {
    activePressTimeline?.kill();
    activePressTimeline = null;
    if (!activePressPlate) return;
    const index = Number(activePressPlate.dataset.aboutPlate) - 1;
    activePressPlate.removeAttribute('data-manual-press');
    renderPlateState(activePressPlate, getAboutPlateState(semanticState, index));
    activePressPlate = null;
  };

  const seekToPlateCompletion = (index) => {
    if (!trigger || !desktopAnimation) return;
    const stage = index + 1;
    const targetProgress = mapAboutStateToDesktopProgress({ stage, q: PLATE_COMPLETION_Q });
    const desktopProgress = targetProgress * distanceVh / desktopDistanceVh;
    const direction = desktopProgress < trigger.progress ? -1 : 1;
    const targetY = Math.ceil(trigger.start + (trigger.end - trigger.start) * desktopProgress) + 1;
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;

    forcedDirection = direction;
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, targetY);
    ScrollTrigger.update();
    desktopAnimation.progress(desktopProgress, true);
    semanticState = renderer.render(targetProgress, direction);
    stableSemanticState = semanticState;
    root.dataset.aboutPlayheadProgress = targetProgress.toFixed(5);
    root.dataset.aboutStableSemantic = `${stage}:${PLATE_COMPLETION_Q.toFixed(5)}:${direction}`;
    root.dataset.aboutManualJump = `${stage}:${PLATE_COMPLETION_Q.toFixed(5)}`;

    requestAnimationFrame(() => {
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
      armDirectionRelease();
    });
  };

  const onPlateClick = (event) => {
    if (!trigger || !desktopAnimation) return;
    cancelActivePress();
    const plate = event.currentTarget;
    const index = Number(plate.dataset.aboutPlate) - 1;
    plate.dataset.manualPress = 'true';
    plate.dataset.pressFrame = '1';
    activePressPlate = plate;
    const timeline = gsap.timeline({
      onComplete: () => {
        if (activePressTimeline === timeline) activePressTimeline = null;
        if (activePressPlate === plate) activePressPlate = null;
      },
    });
    activePressTimeline = timeline;
    timeline.call(() => {
      plate.dataset.pressFrame = '2';
      plate.removeAttribute('data-manual-press');
      seekToPlateCompletion(index);
    }, [], 0.18);
  };

  /**
   * Animation contract — About -> Skills.
   * Desktop owns About scene state and `powerCut` autoAlpha; mobile owns cloned stage
   * layers plus the shared semantic/workflow state. The final About range hands
   * `powerCut` and the Skills title to Skills. Cleanup kills triggers and restores DOM.
   */
  mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
    root.classList.remove('is-about-fallback');
    titleEntry.append(skillsTitle);
    document.body.append(powerCut);
    const playhead = { progress: 0 };
    let scrollDirection = 1;
    const renderDesktopProgress = (timelineProgress, direction) => {
      const desktopProgress = clamp(timelineProgress);
      const travelVh = desktopProgress * desktopDistanceVh;
      const aboutProgress = clamp(travelVh / distanceVh);
      const powerCutProgress = progressBetween(
        travelVh,
        distanceVh,
        distanceVh + powerCutFadeDistanceVh,
      );
      gsap.set(powerCut, { autoAlpha: powerCutProgress });
      return {
        ...renderer.render(aboutProgress, direction),
        aboutProgress,
        desktopProgress,
      };
    };
    semanticState = renderDesktopProgress(0, 1);
    desktopAnimation = gsap.to(playhead, {
      progress: 1,
      duration: 1,
      ease: 'none',
      onUpdate: (self) => {
        semanticState = renderDesktopProgress(
          playhead.progress,
          forcedDirection ?? scrollDirection,
        );
        root.dataset.aboutPlayheadProgress = semanticState.aboutProgress.toFixed(5);
        if (trigger?.isActive && Math.abs(playhead.progress - trigger.progress) <= 0.02) {
          stableSemanticState = semanticState;
          root.dataset.aboutStableSemantic = `${semanticState.stage}:${semanticState.q.toFixed(5)}:${semanticState.direction}`;
        }
      },
      scrollTrigger: {
        id: 'resume-about-sequence',
        trigger: root,
        start: 'top top',
        end: () => `+=${aboutScrollDistancePx(window.innerHeight, desktopDistanceVh)}`,
        pin: true,
        scrub,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          scrollDirection = self.direction;
          root.dataset.aboutScrollProgress = self.progress.toFixed(5);
        },
        onEnter: () => {
          root.dataset.aboutActive = 'true';
          workflowMedia.render(semanticState);
        },
        onEnterBack: () => {
          root.dataset.aboutActive = 'true';
          workflowMedia.render(semanticState);
        },
        onLeave: () => {
          root.dataset.aboutActive = 'false';
          workflowMedia.pauseForExit(1);
        },
        onLeaveBack: () => {
          root.dataset.aboutActive = 'false';
          workflowMedia.pauseForExit(-1);
        },
        onRefresh: (self) => {
          const expected = aboutScrollDistancePx(window.innerHeight, desktopDistanceVh);
          const actual = self.end - self.start;
          root.dataset.aboutDistanceValid = Math.abs(actual - expected) <= 1 ? 'true' : 'false';
          scrollDirection = self.direction;
          semanticState = renderDesktopProgress(
            playhead.progress,
            forcedDirection ?? scrollDirection,
          );
          if (self.isActive && Math.abs(playhead.progress - self.progress) <= 0.02) {
            stableSemanticState = semanticState;
            root.dataset.aboutStableSemantic = `${semanticState.stage}:${semanticState.q.toFixed(5)}:${semanticState.direction}`;
          }
        },
      },
    });
    trigger = desktopAnimation.scrollTrigger;
    finishRestore(
      (captured) => {
        const desktopProgress = captured.desktopProgress
          ?? mapAboutStateToDesktopProgress(captured) * distanceVh / desktopDistanceVh;
        return trigger.start + (trigger.end - trigger.start) * desktopProgress;
      },
      (captured) => {
        const desktopProgress = captured.desktopProgress
          ?? mapAboutStateToDesktopProgress(captured) * distanceVh / desktopDistanceVh;
        desktopAnimation.progress(desktopProgress);
        semanticState = renderDesktopProgress(
          desktopProgress,
          captured.direction,
        );
        stableSemanticState = semanticState;
      },
    );

    return () => {
      cancelActivePress();
      queueSemanticRestore([trigger]);
      trigger?.kill();
      desktopAnimation?.kill();
      trigger = null;
      desktopAnimation = null;
      titleWall.append(skillsTitle);
      powerCutOwner.prepend(powerCut);
      gsap.set(powerCut, { clearProps: 'all' });
      gsap.set(root.querySelectorAll('[data-about-screen], [data-about-content], [data-about-flash], [data-about-light], [data-about-hud], [data-about-rail], [data-about-repeat-track], [data-about-repeat-scanner]'), { clearProps: 'all' });
      gsap.set(root.querySelector('[data-about-dog]'), { clearProps: 'transform' });
    };
  });

  mm.add('(max-width: 767px) and (prefers-reduced-motion: no-preference)', () => {
    root.classList.add('is-about-mobile');
    const stages = gsap.utils.toArray(root.querySelectorAll('[data-about-mobile-stage]'));
    const desktopDog = root.querySelector('[data-about-dog]');
    const sourcePlates = gsap.utils.toArray(root.querySelectorAll('[data-about-plate]'));
    const layers = stages.map((stage, index) => {
      const layer = document.createElement('div');
      layer.className = 'motion-mobile-action-layer';
      layer.style.setProperty('--mobile-signal', [
        'var(--motion-green)',
        'var(--motion-pink)',
        'var(--motion-orange)',
      ][index]);
      layer.setAttribute('aria-hidden', 'true');
      const dog = desktopDog.cloneNode(true);
      dog.classList.add('motion-mobile-dog');
      dog.removeAttribute('data-about-dog');
      dog.removeAttribute('aria-label');
      const plate = sourcePlates[index].cloneNode(true);
      plate.classList.add('motion-mobile-plate');
      plate.removeAttribute('data-about-plate');
      plate.style.setProperty('--signal', 'var(--mobile-signal)');
      const hud = document.createElement('span');
      hud.className = 'motion-mobile-hud';
      hud.dataset.combo = String(index + 1);
      const label = document.createElement('em');
      label.className = 'motion-combo-label';
      label.textContent = COMBO_LABELS[index];
      hud.append(label);
      layer.append(dog, plate, hud);
      stage.append(layer);
      return { layer, dog, plate, hud };
    });
    const screenSystemRenderers = stages.map((stage) => createScreenSystemRenderer(stage));

    const renderMobileStage = (index, qValue, direction, publish = true) => {
      const q = clamp(qValue);
      const semantic = createAboutSemanticState({ stage: index + 1, q, direction });
      const stage = stages[index];
      const screen = stage.querySelector('[data-about-screen]');
      const content = stage.querySelector('[data-about-content]');
      const flash = stage.querySelector('[data-about-flash]');
      const { dog, plate, hud } = layers[index];
      const width = stage.clientWidth || window.innerWidth;
      const dogWidth = dog.getBoundingClientRect().width || width * 0.3;
      const dogHeight = dog.offsetHeight || dogWidth;
      const travel = progressBetween(q, 0, 0.75);
      const x = -dogWidth * 1.2 + travel * (width + dogWidth * 2.4);
      const y = getAboutDogTrickOffset(semantic) * Math.min(stage.clientHeight, window.innerHeight);
      const boot = progressBetween(q, 0.55, 0.65);
      const reveal = progressBetween(q, 0.65, 0.72);
      const flashAmount = semantic.phase === 'boot'
        ? 1 - Math.abs(semantic.phaseRatio * 2 - 1)
        : 0;

      if (publish) {
        root.dataset.aboutStage = String(semantic.stage);
        root.dataset.aboutQ = semantic.q.toFixed(5);
        root.dataset.aboutPhase = semantic.phase;
        root.dataset.aboutDirection = String(semantic.direction);
        semanticState = semantic;
        workflowMedia.render(semantic);
      }
      screen.dataset.screenState = reveal >= 1
        ? 'content'
        : boot > 0
          ? 'booting'
          : q >= 0.5
            ? 'impact'
            : 'standby';
      gsap.set(screen, { filter: `saturate(${0.2 + boot * 0.8})` });
      gsap.set(content, { autoAlpha: reveal, y: 12 * (1 - reveal) });
      gsap.set(flash, {
        autoAlpha: flashAmount,
        scaleY: 0.04 + flashAmount * 0.96,
        transformOrigin: '50% 50%',
      });
      gsap.set(dog, { x, y, force3D: true });
      spriteMedia.render(dog, semantic);
      renderPlateState(plate, getAboutPlateState(semantic, index));
      const comboHud = getAboutComboHudState(q);
      const motion = getAboutComboHudMotion(comboHud, index);
      const impactTravel = progressBetween(0.5, 0, 0.75);
      const impactX = -dogWidth * 1.2 + impactTravel * (width + dogWidth * 2.4);
      const position = getAboutComboHudPosition({
        anchorX: dog.offsetLeft + impactX + dogWidth * 0.5,
        anchorY: dog.offsetTop + dogHeight * 0.46,
        dogWidth,
        dogHeight,
        index,
        liftY: comboHud.y,
      });
      gsap.set(hud, {
        '--combo-entry': comboHud.entryProgress,
        autoAlpha: comboHud.opacity,
        x: position.x + motion.x,
        y: position.y + motion.y,
        scale: motion.scale,
        rotation: motion.rotation,
        rotationY: motion.rotationY,
        transformPerspective: 420,
      });
      screenSystemRenderers[index](semantic, mapAboutStateToDesktopProgress(semantic));
      return semantic;
    };

    let activeMobileIndex = 0;
    semanticState = renderMobileStage(0, 0, 1);
    stableSemanticState = semanticState;
    stages.slice(1).forEach((_, index) => renderMobileStage(index + 1, 0, 1, false));
    mobileAnimations = stages.map((stage, index) => {
      const playhead = { progress: 0 };
      let scrollDirection = 1;
      const animation = gsap.to(playhead, {
        progress: 1,
        duration: 1,
        ease: 'none',
        onUpdate: (self) => {
          if (activeMobileIndex === index) {
            root.dataset.aboutPlayheadProgress = playhead.progress.toFixed(5);
          }
          const rendered = renderMobileStage(
            index,
            playhead.progress,
            forcedDirection ?? scrollDirection,
            activeMobileIndex === index,
          );
          const item = mobileTriggers[index];
          if (
            item?.isActive
            && activeMobileIndex === index
            && Math.abs(playhead.progress - item.progress) <= 0.02
          ) {
            stableSemanticState = rendered;
            root.dataset.aboutStableSemantic = `${rendered.stage}:${rendered.q.toFixed(5)}:${rendered.direction}`;
          }
        },
        scrollTrigger: {
          id: `resume-about-mobile-stage-${index + 1}`,
          trigger: stage,
          start: 'top top',
          end: () => `+=${aboutScrollDistancePx(window.innerHeight, mobileAllocation)}`,
          pin: true,
          scrub,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onToggle: (self) => {
            if (self.isActive) activeMobileIndex = index;
            if (index === 0) root.dataset.aboutActive = String(self.isActive);
          },
          onUpdate: (self) => {
            scrollDirection = self.direction;
            if (self.isActive) {
              activeMobileIndex = index;
              root.dataset.aboutScrollProgress = self.progress.toFixed(5);
            }
          },
          onEnter: () => {
            if (index === activeMobileIndex) workflowMedia.render(semanticState);
          },
          onEnterBack: () => {
            if (index === activeMobileIndex) workflowMedia.render(semanticState);
          },
          onLeave: () => {
            if (index === stages.length - 1) workflowMedia.pauseForExit(1);
          },
          onLeaveBack: () => {
            if (index === 0) workflowMedia.pauseForExit(-1);
          },
          onRefresh: (self) => {
            scrollDirection = self.direction;
            renderMobileStage(
              index,
              playhead.progress,
              forcedDirection ?? scrollDirection,
              activeMobileIndex === index,
            );
          },
        },
      });
      return animation;
    });
    mobileTriggers = mobileAnimations.map((animation) => animation.scrollTrigger);
    finishRestore(
      (captured) => {
        const item = mobileTriggers[captured.stage - 1];
        return item.start + (item.end - item.start) * captured.q;
      },
      (captured) => {
        mobileAnimations[captured.stage - 1].progress(captured.q);
        activeMobileIndex = captured.stage - 1;
        semanticState = renderMobileStage(
          captured.stage - 1,
          captured.q,
          captured.direction,
        );
        stableSemanticState = semanticState;
      },
    );

    return () => {
      queueSemanticRestore(mobileTriggers);
      mobileTriggers.forEach((item) => item.kill());
      mobileAnimations.forEach((item) => item.kill());
      mobileTriggers = [];
      mobileAnimations = [];
      layers.forEach(({ layer, dog }) => {
        spriteMedia.release(dog);
        layer.remove();
      });
      root.classList.remove('is-about-mobile');
    };
  });

  mm.add('(prefers-reduced-motion: reduce)', () => {
    pendingRestore = null;
    clearTimeout(restoreTimer);
    restoreTimer = 0;
    root.classList.remove('is-about-rebuilding');
    root.classList.add('is-about-fallback');
    const workflowScreen = root.querySelector('[data-about-screen="3"]');
    workflowMedia.render(
      createAboutSemanticState({ stage: 1, q: 0, direction: 1 }),
      { reducedMotion: true },
    );
    const observer = workflowScreen && 'IntersectionObserver' in window
      ? new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          workflowMedia.render(
            createAboutSemanticState({ stage: 3, q: 1, direction: 1 }),
            { reducedMotion: true },
          );
        } else {
          workflowMedia.pauseForExit(entry.boundingClientRect.top < 0 ? 1 : -1);
        }
      }, { threshold: 0.35 })
      : null;
    if (workflowScreen && observer) observer.observe(workflowScreen);
    return () => {
      observer?.disconnect();
      workflowMedia.pauseForExit(1);
      root.classList.remove('is-about-fallback');
    };
  });

  interactivePlates.forEach((plate) => plate.addEventListener('click', onPlateClick));

  return {
    scrollToStart(behavior = 'smooth') {
      const target = trigger?.start ?? mobileTriggers[0]?.start ?? root.offsetTop;
      window.scrollTo({ top: target, behavior });
    },
    destroy() {
      cancelActivePress();
      interactivePlates.forEach((plate) => plate.removeEventListener('click', onPlateClick));
      desktopMedia.removeEventListener('change', onDesktopMediaChange);
      mobileMedia.removeEventListener('change', onMobileMediaChange);
      clearTimeout(restoreTimer);
      releaseForcedDirection();
      mm.revert();
      trigger?.kill();
      desktopAnimation?.kill();
      mobileTriggers.forEach((item) => item.kill());
      mobileAnimations.forEach((item) => item.kill());
      workflowMedia.destroy();
      spriteMedia.destroy();
    },
  };
};
