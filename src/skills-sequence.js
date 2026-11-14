import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  DEFAULT_SKILL_GROUP_RANGES,
  clamp01,
  createPolylineSampler,
  createDiagonalFillPath,
  getCanvasPixelRatio,
  getExperienceTransitionState,
  getSprayParticle,
  getSkillColorIndex,
  getSkillGroupProgress,
  getSkillMaskStampCount,
  getSkillToolState,
  progressBetween,
} from './skills-sequence-math.js';
import {
  createSerpentineFillPath,
  splitSerpentineFillPath,
} from './experience-sequence-math.js';

gsap.registerPlugin(ScrollTrigger);

const DEFAULT_COLORS = ['#bd7d4e', '#658c89', '#658c89', '#bd7d4e'];
const CAN_HUES = [53, -95, -95, 53];
const FREE_COLORS = ['#c99573', '#8f5f49', '#7f8954', '#647b91'];
const FREE_CAN_HUES = [44, 28, 78, -125];
const STAMPS_PER_GROUP = 160;
const LONG_CANVAS_PIXEL_BUDGET = 12_000_000;

const seeded = (value) => {
  const result = Math.sin(value * 12.9898) * 43758.5453;
  return result - Math.floor(result);
};

const getStrokeStamp = (sampler, index, seed, radius) => {
  const point = sampler(index / Math.max(1, STAMPS_PER_GROUP - 1));
  return {
    x: point.x + (seeded(seed + index * 2.7) - 0.5) * radius * 0.45,
    y: point.y + (seeded(seed + index * 4.1) - 0.5) * radius * 0.4,
    radius: radius * (0.78 + seeded(seed + index * 5.3) * 0.36),
    angle: point.angle,
  };
};

const createTextCutoutMask = (wall, groups, pixelRatioCap) => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: true });

  const drawRun = (text, rect, style, wallRect) => {
    if (!text.trim() || rect.width === 0 || rect.height === 0) return;
    context.font = style.font;
    context.fontKerning = 'auto';
    context.textAlign = 'start';
    context.textBaseline = 'alphabetic';
    if ('letterSpacing' in context) context.letterSpacing = style.letterSpacing;
    const metrics = context.measureText(text);
    const ascent = metrics.actualBoundingBoxAscent;
    const descent = metrics.actualBoundingBoxDescent;
    const baseline = rect.top - wallRect.top + (rect.height - ascent - descent) / 2 + ascent;
    context.fillText(text, rect.left - wallRect.left, baseline);
  };

  const drawTextNode = (node, style, wallRect) => {
    const text = node.textContent ?? '';
    if (!text.trim()) return;
    const range = document.createRange();
    let runStart = 0;
    let runTop = null;

    for (let index = 0; index < text.length; index += 1) {
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const rect = range.getBoundingClientRect();
      if (runTop !== null && Math.abs(rect.top - runTop) > 1) {
        range.setStart(node, runStart);
        range.setEnd(node, index);
        drawRun(text.slice(runStart, index), range.getBoundingClientRect(), style, wallRect);
        runStart = index;
      }
      if (rect.width > 0) runTop = rect.top;
    }

    range.setStart(node, runStart);
    range.setEnd(node, text.length);
    drawRun(text.slice(runStart), range.getBoundingClientRect(), style, wallRect);
  };

  const resize = (width, height) => {
    const ratio = Math.min(pixelRatioCap, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#fff';
    const wallRect = wall.getBoundingClientRect();

    groups.forEach((group) => {
      group.querySelectorAll('h3, p, li').forEach((element) => {
        const style = getComputedStyle(element);
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) drawTextNode(walker.currentNode, style, wallRect);

        const marker = getComputedStyle(element, '::before').content.replace(/^['"]|['"]$/g, '');
        if (marker && marker !== 'none') {
          const rect = element.getBoundingClientRect();
          drawRun(marker, rect, style, wallRect);
        }
      });
    });
  };

  return { canvas, resize };
};

export const createSprayPainter = (
  canvas,
  pixelRatioCap = 1.5,
  maxPixels = Number.POSITIVE_INFINITY,
) => {
  const context = canvas.getContext('2d', { alpha: true });
  let width = 0;
  let height = 0;
  let ratio = 1;

  const resize = (nextWidth, nextHeight) => {
    width = Math.max(1, Math.round(nextWidth));
    height = Math.max(1, Math.round(nextHeight));
    ratio = getCanvasPixelRatio(
      width,
      height,
      pixelRatioCap,
      window.devicePixelRatio || 1,
      maxPixels,
    );
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const clear = () => {
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
  };

  const clearRect = (x, y, clearWidth, clearHeight) => {
    context.save();
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(x, y, clearWidth, clearHeight);
    context.restore();
  };

  const copy = (sourceCanvas, copyHeight = height) => {
    const sourceHeight = Math.min(
      sourceCanvas.height,
      Math.ceil(copyHeight * ratio),
    );
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(
      sourceCanvas,
      0,
      0,
      sourceCanvas.width,
      sourceHeight,
      0,
      0,
      canvas.width,
      sourceHeight,
    );
    context.restore();
  };

  const erase = (mask) => {
    context.save();
    context.globalCompositeOperation = 'destination-out';
    context.globalAlpha = 1;
    context.drawImage(mask, 0, 0, width, height);
    context.restore();
  };

  const stamp = (
    x,
    y,
    radius,
    color,
    seed,
    strength = 1,
    dotScale = 1,
    hazeScale = 1,
    dotCount = 7,
    angle = 0,
    directional = false,
  ) => {
    context.save();
    context.globalCompositeOperation = 'source-over';
    context.translate(x, y);
    if (directional) {
      context.rotate(angle * (Math.PI / 180));
      context.scale(1.28, 0.82);
    }
    const gradient = context.createRadialGradient(0, 0, radius * 0.12, 0, 0, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(directional ? 0.68 : 0.56, color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.globalAlpha = (directional ? 0.07 : 0.12) * strength * hazeScale;
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    if (directional) {
      for (let index = 0; index < 12; index += 1) {
        const particleAngle = seeded(seed + index * 9.7) * Math.PI * 2;
        const distance = radius * (0.58 + seeded(seed + index * 15.3) * 0.72);
        const dotRadius = radius * (0.006 + seeded(seed + index * 21.7) * 0.012);
        context.globalAlpha = 0.08 + seeded(seed + index * 4.7) * 0.1;
        context.fillStyle = color;
        context.beginPath();
        context.arc(
          x + Math.cos(particleAngle) * distance,
          y + Math.sin(particleAngle) * distance,
          dotRadius,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    }

    for (let index = 0; index < dotCount; index += 1) {
      const particleAngle = seeded(seed + index * 7.13) * Math.PI * 2;
      const distance = radius * (0.45 + seeded(seed + index * 13.7) * 0.95);
      const dotRadius = radius * (0.018 + seeded(seed + index * 19.1) * 0.032) * dotScale;
      context.globalAlpha = (0.14 + seeded(seed + index * 3.1) * 0.2) * strength;
      context.fillStyle = color;
      context.beginPath();
      context.arc(
        x + Math.cos(particleAngle) * distance,
        y + Math.sin(particleAngle) * distance,
        dotRadius,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    context.restore();
  };

  const sprayStamp = (x, y, radius, color, seed) => {
    context.save();
    context.globalCompositeOperation = 'source-over';

    const pigment = context.createRadialGradient(x, y, 0, x, y, radius * 0.82);
    pigment.addColorStop(0, color);
    pigment.addColorStop(0.46, color);
    pigment.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.globalAlpha = 0.115;
    context.fillStyle = pigment;
    context.beginPath();
    context.arc(x, y, radius * 0.82, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = color;
    context.globalAlpha = 0.48;
    context.beginPath();
    for (let index = 0; index < 20; index += 1) {
      const particle = getSprayParticle(seed, index, radius);
      context.moveTo(x + particle.x + particle.radius, y + particle.y);
      context.arc(
        x + particle.x,
        y + particle.y,
        particle.radius,
        0,
        Math.PI * 2,
      );
    }
    context.fill();

    context.globalAlpha = 0.22;
    context.beginPath();
    for (let index = 0; index < 10; index += 1) {
      const particle = getSprayParticle(seed, index, radius, true);
      context.moveTo(x + particle.x + particle.radius, y + particle.y);
      context.arc(
        x + particle.x,
        y + particle.y,
        particle.radius,
        0,
        Math.PI * 2,
      );
    }
    context.fill();
    context.restore();
  };

  const stroke = (sampler, progress, color, seed, radius) => {
    const visible = getSkillMaskStampCount(progress, STAMPS_PER_GROUP);
    const paintStamps = Array.from(
      { length: visible },
      (_, index) => getStrokeStamp(sampler, index, seed, radius),
    );

    if (paintStamps.length > 1) {
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.strokeStyle = color;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo(paintStamps[0].x, paintStamps[0].y);
      paintStamps.slice(1).forEach((paintStamp) => context.lineTo(paintStamp.x, paintStamp.y));
      context.globalAlpha = 0.08;
      context.lineWidth = radius * 1.85;
      context.stroke();
      context.globalAlpha = 0.24;
      context.lineWidth = radius * 1.05;
      context.stroke();
      context.restore();
    }

    paintStamps.forEach((paintStamp, index) => {
      stamp(
        paintStamp.x,
        paintStamp.y,
        paintStamp.radius,
        color,
        seed + index * 11,
        1.2,
        0.65,
        1,
        6,
        paintStamp.angle,
        true,
      );
    });
  };

  return { clear, clearRect, copy, erase, resize, sprayStamp, stamp, stroke };
};

const buildGroupPath = (group, wall) => {
  const wallRect = wall.getBoundingClientRect();
  const contentRects = [...group.querySelectorAll('h3, p, ul')]
    .map((element) => element.getBoundingClientRect());
  const contentLeft = Math.min(...contentRects.map((rect) => rect.left));
  const contentRight = Math.max(...contentRects.map((rect) => rect.right));
  const contentTop = Math.min(...contentRects.map((rect) => rect.top));
  const contentBottom = Math.max(...contentRects.map((rect) => rect.bottom));

  const radius = Math.max(32, Math.min(50, group.clientHeight * 0.19));
  return createDiagonalFillPath({
    left: Math.max(0, contentLeft - wallRect.left - 4),
    right: Math.min(wallRect.width, contentRight - wallRect.left + 4),
    top: Math.max(0, contentTop - wallRect.top - 2),
    bottom: Math.min(wallRect.height, contentBottom - wallRect.top + 2),
  }, radius * 0.88);
};

export const initSkillsSequence = (animationMap) => {
  const root = document.querySelector('[data-skills-sequence]');
  if (!root) throw new Error('Skills spray-wall markup is missing');

  const wall = root.querySelector('[data-skills-wall]');
  const scrollCanvas = root.querySelector('[data-skills-scroll-canvas]');
  const freeCanvas = root.querySelector('[data-skills-free-canvas]');
  const experienceCanvas = root.querySelector('[data-experience-paint]');
  const experienceCan = root.querySelector('[data-experience-can]');
  const experienceRoot = root.querySelector('[data-experience-sequence]');
  const experienceStage = root.querySelector('[data-experience-stage]');
  const tool = root.querySelector('[data-skills-tool]');
  const powerCut = document.querySelector('[data-skills-entry]');
  const blackout = powerCut?.querySelector('.skills-power-cut__blackout');
  const title = document.querySelector('[data-skills-title]');
  const titleEntry = powerCut?.querySelector('[data-skills-title-entry]');
  const titleWall = root.querySelector('[data-skills-title-wall]');
  const canSlots = gsap.utils.toArray(root.querySelectorAll('[data-skills-can]'));
  const groups = gsap.utils.toArray(root.querySelectorAll('[data-skill-group]'));
  if (
    !wall
    || !scrollCanvas
    || !freeCanvas
    || !experienceCanvas
    || !experienceCan
    || !experienceRoot
    || !experienceStage
    || !tool
    || !powerCut
    || !blackout
    || !title
    || !titleEntry
    || !titleWall
    || canSlots.length === 0
    || groups.length === 0
  ) {
    throw new Error('Skills spray-wall markup is incomplete');
  }

  const config = animationMap.sections.find((section) => section.id === 'skills') || {};
  const experienceConfig = animationMap.sections.find((section) => section.id === 'experience') || {};
  experienceRoot.style.setProperty('--experience-stage-height', `${experienceConfig.stageHeightVh ?? 260}svh`);
  const distanceVh = config.scrollDistanceVh ?? 5.6;
  const transitionDistanceVh = experienceConfig.transitionDistanceVh ?? 1.6;
  const routeIntroDistanceVh = experienceConfig.routeIntroDistanceVh ?? 0.8;
  const dogEntryDistanceVh = experienceConfig.dogEntryDistanceVh ?? 0.6;
  const titleEntryDistanceVh = config.titleEntryDistanceVh ?? 0.8;
  const titleHoldDistanceVh = config.titleHoldDistanceVh ?? 0.35;
  const systemEntryStartProgress = 0.56;
  const systemEntryEndProgress = 0.74;
  const systemEntryStartVh = titleEntryDistanceVh * systemEntryStartProgress;
  const systemEntryBaseDistanceVh = titleEntryDistanceVh
    * (systemEntryEndProgress - systemEntryStartProgress);
  const systemEntryDistanceVh = systemEntryBaseDistanceVh
    + (config.systemEntryExtraDistanceVh ?? 0.5);
  const titleMotionDistanceVh = Math.max(
    titleEntryDistanceVh,
    systemEntryStartVh + systemEntryDistanceVh,
  );
  const powerOnDistanceVh = config.powerOnDistanceVh ?? 0.35;
  const powerOnStartVh = titleMotionDistanceVh + titleHoldDistanceVh;
  const skillsStartVh = powerOnStartVh + powerOnDistanceVh;
  const transitionEndVh = skillsStartVh + distanceVh + transitionDistanceVh;
  const totalDistanceVh = transitionEndVh + Math.max(routeIntroDistanceVh, dogEntryDistanceVh);
  const scrub = config.scrub ?? 0.55;
  const freeSprayStart = config.freeSprayStart ?? 0.76;
  const pixelRatioCap = config.pixelRatioCap ?? 1.5;
  const colors = config.colors ?? DEFAULT_COLORS;
  const ranges = config.groupRanges ?? DEFAULT_SKILL_GROUP_RANGES;
  const scrollPainter = createSprayPainter(scrollCanvas, pixelRatioCap);
  const freePainter = createSprayPainter(freeCanvas, pixelRatioCap);
  const experiencePainter = createSprayPainter(
    experienceCanvas,
    experienceConfig.pixelRatioCap ?? 1.15,
    LONG_CANVAS_PIXEL_BUDGET,
  );
  const continuationCanvas = document.createElement('canvas');
  const continuationPainter = createSprayPainter(
    continuationCanvas,
    experienceConfig.pixelRatioCap ?? 1.15,
    LONG_CANVAS_PIXEL_BUDGET,
  );
  const textCutoutMask = createTextCutoutMask(wall, groups, pixelRatioCap);
  const setToolX = gsap.quickSetter(tool, 'x', 'px');
  const setToolY = gsap.quickSetter(tool, 'y', 'px');
  const setToolRotation = gsap.quickSetter(tool, 'rotation', 'deg');
  const pointerX = gsap.quickTo(tool, 'x', { duration: 0.18, ease: 'power2.out' });
  const pointerY = gsap.quickTo(tool, 'y', { duration: 0.18, ease: 'power2.out' });
  const pointerRotation = gsap.quickTo(tool, 'rotation', { duration: 0.12, ease: 'power2.out' });
  const mm = gsap.matchMedia();
  let paths = [];
  let samplers = [];
  let groupRadii = [];
  let timeline = null;
  let latestProgress = 0;
  let freeMode = false;
  let spraying = false;
  let pointerSeen = false;
  let lastPointer = null;
  let freeSeed = 900;
  let selectedColorIndex = null;
  let toolColorKey = '';
  let pickupTimeline = null;
  let pickingUp = false;
  let titleProgress = 0;
  let systemProgress = 0;
  let transitionProgress = 0;
  let transitionSampler = null;
  let transitionPaintPoints = [];
  let transitionPaintIndexOffset = 0;
  let transitionStampCount = 1;
  let paintedTransitionStampCount = 0;
  let transitionRadius = 48;
  let transitionViewportHeight = 1;
  let transitionWallWidth = 1;
  let transitionWallHeight = 1;
  let syncExperienceIntro = () => {};
  let routeIntroProgress = 0;
  let dogEntryProgress = 0;

  const titleLines = [...title.querySelectorAll(
    '[data-skills-title-line] > .skills-title__text',
  )];
  const titleSystem = title.querySelector('[data-skills-title-system]');

  const syncTitleLayer = (wallOwnsTitle) => {
    const owner = wallOwnsTitle ? titleWall : titleEntry;
    const skillsOwnsTitle = !timeline?.scrollTrigger
      || timeline.scrollTrigger.isActive
      || timeline.scrollTrigger.progress < 1;
    if (title.parentElement !== owner) owner.append(title);
    gsap.set(title, { autoAlpha: skillsOwnsTitle ? 1 : 0 });
    if (timeline?.scrollTrigger?.isActive) {
      gsap.set(powerCut, { autoAlpha: wallOwnsTitle ? 0 : 1 });
    }
  };

  const renderTitle = (progress, nextSystemProgress = systemProgress) => {
    titleProgress = clamp01(progress);
    systemProgress = clamp01(nextSystemProgress);
    const lead = progressBetween(titleProgress, 0, 0.42);
    const sentence = progressBetween(titleProgress, 0.2, 0.68);
    const system = systemProgress;

    gsap.set(titleLines[0], { yPercent: (1 - lead) * 110, autoAlpha: lead });
    gsap.set(titleLines[1], { yPercent: (1 - sentence) * 110, autoAlpha: sentence });
    gsap.set(titleSystem, { yPercent: (1 - system) * 110, autoAlpha: system });
    gsap.set(title, { autoAlpha: 1 });
  };

  const setToolColor = (index, palette = colors, hues = CAN_HUES) => {
    const nextIndex = Math.max(0, Math.min(palette.length - 1, index));
    const color = palette[nextIndex];
    const hue = hues[nextIndex] ?? 0;
    const key = `${color}:${hue}`;
    if (toolColorKey === key) return;
    toolColorKey = key;
    tool.style.setProperty('--skills-tool-color', color);
    tool.style.setProperty('--can-hue', `${hue}deg`);
  };

  const setRackSelection = (index) => {
    const hasSelection = Number.isInteger(index);
    root.classList.toggle('has-selected-can', hasSelection);
    canSlots.forEach((slot, slotIndex) => {
      const selected = slotIndex === index;
      slot.classList.toggle('is-can-out', selected);
      slot.setAttribute('aria-pressed', String(selected));
    });
  };

  const setCanButtonsEnabled = (enabled) => {
    canSlots.forEach((slot) => {
      slot.disabled = !enabled;
    });
  };

  const getCanHome = (index) => {
    const wallRect = wall.getBoundingClientRect();
    const slotRect = canSlots[index].getBoundingClientRect();
    return {
      x: slotRect.left - wallRect.left + slotRect.width / 2,
      y: slotRect.top - wallRect.top + slotRect.height / 2 - tool.offsetHeight * 0.33,
    };
  };

  /**
   * Ownership contract — Skills spray can.
   * Scroll rendering owns tool x/y/rotation until free mode starts; pointer quickTo
   * calls and `pickupTimeline` own those properties in free mode. `setFreeMode(false)`
   * and `stopToolMotion()` return ownership before the Experience transition/cleanup.
   */
  const stopToolMotion = () => {
    pickupTimeline?.kill();
    pickupTimeline = null;
    pointerX.tween.pause();
    pointerY.tween.pause();
    pointerRotation.tween.pause();
  };

  const returnCan = (immediate = false) => {
    if (!Number.isInteger(selectedColorIndex)) {
      setRackSelection(null);
      return;
    }
    const returningIndex = selectedColorIndex;
    const home = getCanHome(returningIndex);
    stopToolMotion();
    spraying = false;
    pickingUp = !immediate;
    root.classList.remove('is-user-spraying');

    const finish = () => {
      selectedColorIndex = null;
      pickingUp = false;
      setRackSelection(null);
    };

    if (immediate) {
      gsap.set(tool, { x: home.x, y: home.y, rotation: 0 });
      finish();
      return;
    }

    pickupTimeline = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      onComplete: finish,
    });
    pickupTimeline
      .to(tool, { x: home.x + 20, y: home.y, rotation: 0, duration: 0.2 })
      .to(tool, { x: home.x, duration: 0.12 });
  };

  const takeCan = (index) => {
    if (!freeMode || index < 0 || index >= FREE_COLORS.length) return;
    if (selectedColorIndex === index) {
      returnCan();
      return;
    }

    const previousIndex = selectedColorIndex;
    const nextHome = getCanHome(index);
    stopToolMotion();
    spraying = false;
    pickingUp = true;
    root.classList.remove('is-user-spraying');

    pickupTimeline = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      onComplete: () => {
        pickingUp = false;
        if (!lastPointer) return;
        pointerSeen = true;
        pointerX(lastPointer.x);
        pointerY(lastPointer.y);
      },
    });

    if (Number.isInteger(previousIndex)) {
      const previousHome = getCanHome(previousIndex);
      pickupTimeline
        .to(tool, { x: previousHome.x + 20, y: previousHome.y, rotation: 0, duration: 0.2 })
        .to(tool, { x: previousHome.x, duration: 0.12 });
    }

    pickupTimeline
      .call(() => {
        selectedColorIndex = index;
        setToolColor(index, FREE_COLORS, FREE_CAN_HUES);
        setRackSelection(index);
        gsap.set(tool, { x: nextHome.x, y: nextHome.y, rotation: -4 });
      })
      .to(tool, { x: nextHome.x + 20, rotation: 0, duration: 0.22, ease: 'power3.out' });
  };

  const setFreeMode = (enabled) => {
    if (freeMode === enabled) return;
    freeMode = enabled;
    root.classList.toggle('is-free-spray', enabled);
    setCanButtonsEnabled(enabled);
    spraying = false;
    pointerSeen = false;
    lastPointer = null;
    root.classList.remove('is-user-spraying');
    if (enabled) {
      returnCan(true);
      return;
    }
    returnCan(true);
    freePainter.clear();
  };

  const stampExperiencePaint = (painter, point, index, seed) => {
    painter.stamp(
      point.x,
      point.y,
      transitionRadius,
      experienceConfig.transitionPaint ?? '#658c89',
      seed + index * 13.7,
      1.2,
      0.65,
      1,
      6,
      point.angle,
      true,
    );
  };

  const renderTransition = (progress) => {
    const state = getExperienceTransitionState(progress);
    transitionProgress = state.progress;
    const visibleStamps = Math.ceil(transitionProgress * transitionStampCount);
    if (visibleStamps < paintedTransitionStampCount) {
      const transitionResetHeight = Math.min(
        transitionWallHeight,
        transitionViewportHeight + transitionRadius * 3,
      );
      experiencePainter.clearRect(
        0,
        0,
        transitionWallWidth,
        transitionResetHeight,
      );
      experiencePainter.copy(continuationCanvas, transitionResetHeight);
      paintedTransitionStampCount = 0;
    }
    for (let index = paintedTransitionStampCount; index < visibleStamps; index += 1) {
      stampExperiencePaint(
        experiencePainter,
        transitionPaintPoints[index],
        transitionPaintIndexOffset + index,
        700,
      );
    }
    paintedTransitionStampCount = visibleStamps;

    const point = transitionSampler(transitionProgress);
    const normalizedAngle = ((point.angle + 180) % 360) - 180;
    root.classList.toggle(
      'is-experience-transition',
      state.paintVisible,
    );
    gsap.set(experienceCan, {
      autoAlpha: state.canOpacity,
      x: point.x,
      y: point.y,
      rotation: gsap.utils.clamp(-12, 12, normalizedAngle * 0.1),
    });
    root.dataset.experienceTransitionProgress = transitionProgress.toFixed(4);
    if (state.paintVisible) {
      setFreeMode(false);
    } else {
      setFreeMode(
        latestProgress >= freeSprayStart
        && Boolean(timeline?.scrollTrigger?.isActive),
      );
    }
  };

  const renderExperienceIntro = () => {
    syncExperienceIntro({
      routeProgress: routeIntroProgress,
      dogProgress: dogEntryProgress,
    });
  };

  const resize = () => {
    const width = wall.clientWidth;
    const height = wall.clientHeight;
    const experienceHeight = experienceStage.getBoundingClientRect().height;
    const longWallHeight = height + experienceHeight;
    scrollPainter.resize(width, height);
    freePainter.resize(width, height);
    paths = groups.map((group) => buildGroupPath(group, wall));
    samplers = paths.map((path) => createPolylineSampler(path));
    groupRadii = groups.map((group) => Math.max(32, Math.min(50, group.clientHeight * 0.19)));
    textCutoutMask.resize(width, height);

    root.style.setProperty('--skills-experience-wall-height', `${longWallHeight}px`);
    root.style.setProperty('--skills-wall-viewport-height', `${height}px`);
    const longWallGeometryChanged = (
      width !== transitionWallWidth
      || height !== transitionViewportHeight
      || longWallHeight !== transitionWallHeight
    );
    if (!longWallGeometryChanged) return;

    experiencePainter.resize(width, longWallHeight);
    continuationPainter.resize(width, longWallHeight);
    transitionWallWidth = width;
    transitionViewportHeight = height;
    transitionWallHeight = longWallHeight;
    transitionRadius = Math.max(48, Math.min(72, height * 0.075));
    const transitionOverscan = transitionRadius;
    const longPaintPath = createSerpentineFillPath({
      left: transitionRadius * 0.12,
      right: width - transitionRadius * 0.12,
      top: -transitionOverscan,
      bottom: longWallHeight - transitionRadius * 0.12,
    }, transitionRadius * 0.22);
    const longPaintSampler = createPolylineSampler(longPaintPath);
    const longPaintLength = longPaintPath.slice(1).reduce((length, point, index) => (
      length + Math.hypot(
        point.x - longPaintPath[index].x,
        point.y - longPaintPath[index].y,
      )
    ), 0);
    const longPaintStampCount = Math.max(
      1,
      Math.ceil(longPaintLength / (transitionRadius * 0.35)),
    );
    const longPaintPoints = Array.from({ length: longPaintStampCount }, (_, index) => (
      longPaintSampler(index / Math.max(1, longPaintStampCount - 1))
    ));
    const {
      continuation: continuationPaintPoints,
      transition,
      splitIndex,
    } = splitSerpentineFillPath(longPaintPoints, height + transitionOverscan);
    transitionPaintPoints = transition;
    transitionPaintIndexOffset = splitIndex;
    transitionSampler = createPolylineSampler(transitionPaintPoints);
    transitionStampCount = transitionPaintPoints.length;
    paintedTransitionStampCount = 0;

    for (let index = 0; index < continuationPaintPoints.length; index += 1) {
      stampExperiencePaint(
        continuationPainter,
        continuationPaintPoints[index],
        index,
        700,
      );
    }
    experiencePainter.clear();
    experiencePainter.copy(continuationCanvas);
    paintedTransitionStampCount = 0;
    renderTransition(transitionProgress);
  };

  const placeScrollTool = (state) => {
    setToolX(state.x);
    setToolY(state.y);
    const normalizedAngle = ((state.angle + 180) % 360) - 180;
    setToolRotation(gsap.utils.clamp(-12, 12, normalizedAngle * 0.1));
    root.classList.toggle('is-auto-spraying', state.spraying);
  };

  const renderSkills = (progress, allowFreeMode) => {
    latestProgress = clamp01(progress);
    scrollPainter.clear();
    groups.forEach((group, index) => {
      const groupProgress = getSkillGroupProgress(latestProgress, index, ranges);
      group.style.setProperty('--paint-progress', groupProgress.toFixed(4));
      group.classList.toggle('is-painted', groupProgress >= 0.16);
      if (samplers[index]) {
        scrollPainter.stroke(
          samplers[index],
          groupProgress,
          colors[index % colors.length],
          100 + index * 211,
          groupRadii[index] ?? 44,
        );
      }
    });
    scrollPainter.erase(textCutoutMask.canvas);

    root.style.setProperty('--skills-progress', latestProgress.toFixed(4));
    const shouldFree = allowFreeMode
      && latestProgress >= freeSprayStart
      && timeline?.scrollTrigger?.isActive;
    setFreeMode(shouldFree);
    if (!shouldFree) {
      setToolColor(getSkillColorIndex(latestProgress, ranges));
      placeScrollTool(getSkillToolState(latestProgress, paths, ranges));
    }
  };

  const render = (progress) => {
    renderSkills(progress, transitionProgress === 0);
  };

  const eventPoint = (event) => {
    const rect = wall.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (wall.clientWidth / Math.max(1, rect.width)),
      y: (event.clientY - rect.top) * (wall.clientHeight / Math.max(1, rect.height)),
    };
  };

  const drawFreeLine = (from, to) => {
    if (!Number.isInteger(selectedColorIndex)) return;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / 12));
    for (let index = 1; index <= steps; index += 1) {
      const ratio = index / steps;
      freePainter.stamp(
        from.x + (to.x - from.x) * ratio,
        from.y + (to.y - from.y) * ratio,
        44 + seeded(freeSeed) * 12,
        FREE_COLORS[selectedColorIndex],
        freeSeed,
        1.35,
      );
      freeSeed += 1;
    }
    freePainter.erase(textCutoutMask.canvas);
  };

  const movePointer = (event) => {
    if (!freeMode || event.pointerType === 'touch') return;
    const point = eventPoint(event);
    const previousPointer = lastPointer;
    lastPointer = point;
    if (!Number.isInteger(selectedColorIndex) || pickingUp) return;
    pointerSeen = true;
    pointerX(point.x);
    pointerY(point.y);
    if (previousPointer) {
      const angle = Math.atan2(point.y - previousPointer.y, point.x - previousPointer.x) * (180 / Math.PI);
      pointerRotation(gsap.utils.clamp(-12, 12, angle * 0.1));
    }
    if (spraying && (event.buttons & 1) === 1) {
      drawFreeLine(previousPointer ?? point, point);
    } else if (spraying) {
      spraying = false;
      root.classList.remove('is-user-spraying');
    }
  };

  const startSpray = (event) => {
    if (
      !freeMode
      || !Number.isInteger(selectedColorIndex)
      || pickingUp
      || event.button !== 0
      || event.pointerType === 'touch'
    ) return;
    event.preventDefault();
    const point = eventPoint(event);
    spraying = true;
    pointerSeen = true;
    lastPointer = point;
    root.classList.add('is-user-spraying');
    wall.setPointerCapture?.(event.pointerId);
    drawFreeLine(point, point);
  };

  const stopSpray = (event) => {
    spraying = false;
    root.classList.remove('is-user-spraying');
    if (event?.pointerId != null && wall.hasPointerCapture?.(event.pointerId)) {
      wall.releasePointerCapture(event.pointerId);
    }
  };

  const onCanPointerDown = (event) => event.stopPropagation();
  const onCanClick = (event) => {
    event.stopPropagation();
    takeCan(Number(event.currentTarget.dataset.skillsCan));
  };

  wall.addEventListener('pointermove', movePointer);
  wall.addEventListener('pointerdown', startSpray);
  wall.addEventListener('pointerup', stopSpray);
  wall.addEventListener('pointercancel', stopSpray);
  wall.addEventListener('pointerleave', stopSpray);
  window.addEventListener('blur', stopSpray);
  canSlots.forEach((slot) => {
    slot.addEventListener('pointerdown', onCanPointerDown);
    slot.addEventListener('click', onCanClick);
  });

  /**
   * Animation contract — About -> Skills -> Experience.
   * Owns title/blackout visibility, Skills paint/tool progress, and the transition
   * paint/can across `resume-skills-spray-wall`. It receives the About power-cut state,
   * then hands route/dog progress to Experience; matchMedia cleanup clears both sides.
   */
  mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
    root.classList.remove('is-skills-fallback');
    root.classList.add('has-negative-skill-text');
    resize();
    const playhead = { progress: 0 };
    const titlePlayhead = { progress: 0 };
    const transitionPlayhead = { progress: 0 };
    timeline = gsap.timeline({
      defaults: { ease: 'none' },
      onUpdate: () => syncTitleLayer((timeline?.time() ?? 0) >= skillsStartVh),
      scrollTrigger: {
        id: 'resume-skills-spray-wall',
        trigger: root,
        start: 'top top',
        end: () => `+=${Math.round(
          window.innerHeight * totalDistanceVh,
        )}`,
        pin: wall,
        scrub,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onRefreshInit: resize,
        onRefresh: (self) => {
          renderTitle(titleProgress, systemProgress);
          syncTitleLayer((timeline?.time() ?? 0) >= skillsStartVh);
          render(playhead.progress);
          renderTransition(transitionPlayhead.progress);
          renderExperienceIntro();
        },
        onLeave: () => timeline?.progress(1),
        onToggle: (self) => {
          root.dataset.skillsActive = String(self.isActive);
          if (self.isActive) {
            window.dispatchEvent(new CustomEvent('resume:section', { detail: 'skills' }));
            syncTitleLayer((timeline?.time() ?? 0) >= skillsStartVh);
            render(playhead.progress);
            renderExperienceIntro();
          }
          if (!self.isActive) setFreeMode(false);
        },
      },
    });
    gsap.set(blackout, { autoAlpha: 1 });
    const systemPlayhead = { progress: 0 };
    const routePlayhead = { progress: 0 };
    const dogPlayhead = { progress: 0 };
    timeline
      .to(titlePlayhead, {
        progress: 1,
        duration: titleEntryDistanceVh,
        onUpdate: () => renderTitle(titlePlayhead.progress, systemPlayhead.progress),
      }, 0)
      .to(systemPlayhead, {
        progress: 1,
        duration: systemEntryDistanceVh,
        onUpdate: () => renderTitle(titlePlayhead.progress, systemPlayhead.progress),
      }, systemEntryStartVh)
      .fromTo(blackout, {
        autoAlpha: 1,
      }, {
        autoAlpha: 0,
        duration: powerOnDistanceVh,
        immediateRender: false,
      }, powerOnStartVh)
      .set(powerCut, { autoAlpha: 0 }, skillsStartVh)
      .to(playhead, {
        progress: 1,
        duration: distanceVh,
        onUpdate: () => render(playhead.progress),
      }, skillsStartVh)
      .to(transitionPlayhead, {
        progress: 1,
        duration: transitionDistanceVh,
        onUpdate: () => renderTransition(transitionPlayhead.progress),
      }, skillsStartVh + distanceVh)
      .to(routePlayhead, {
        progress: 1,
        duration: routeIntroDistanceVh,
        onUpdate: () => {
          routeIntroProgress = routePlayhead.progress;
          renderExperienceIntro();
        },
      }, transitionEndVh)
      .to(dogPlayhead, {
        progress: 1,
        duration: dogEntryDistanceVh,
        onUpdate: () => {
          dogEntryProgress = dogPlayhead.progress;
          renderExperienceIntro();
        },
      }, transitionEndVh);
    renderTitle(0, 0);
    syncTitleLayer(false);
    render(0);
    renderTransition(0);

    return () => {
      setFreeMode(false);
      routeIntroProgress = 0;
      dogEntryProgress = 0;
      syncExperienceIntro({ active: false });
      timeline?.kill();
      timeline = null;
      titleWall.append(title);
      gsap.set(blackout, { clearProps: 'all' });
      gsap.set(powerCut, { clearProps: 'all' });
      gsap.set([title, ...title.querySelectorAll('*')], { clearProps: 'all' });
      scrollPainter.clear();
      freePainter.clear();
      experiencePainter.clear();
      continuationPainter.clear();
      root.classList.remove('is-experience-transition');
      gsap.set(experienceCan, { clearProps: 'all' });
      root.classList.remove('has-negative-skill-text');
    };
  });

  mm.add('(max-width: 767px), (prefers-reduced-motion: reduce)', () => {
    root.classList.add('is-skills-fallback');
    routeIntroProgress = 0;
    dogEntryProgress = 0;
    syncExperienceIntro({ active: false });
    titleWall.append(title);
    groups.forEach((group) => group.classList.add('is-painted'));
    setFreeMode(false);
    gsap.set(experienceCan, { autoAlpha: 0 });
    return () => root.classList.remove('is-skills-fallback');
  });

  return {
    scrollToStart(behavior = 'smooth') {
      const target = timeline?.scrollTrigger?.start ?? root.offsetTop;
      window.scrollTo({ top: target, behavior });
    },
    setExperienceIntro(sync) {
      syncExperienceIntro = typeof sync === 'function' ? sync : () => {};
      renderExperienceIntro();
    },
    destroy() {
      wall.removeEventListener('pointermove', movePointer);
      wall.removeEventListener('pointerdown', startSpray);
      wall.removeEventListener('pointerup', stopSpray);
      wall.removeEventListener('pointercancel', stopSpray);
      wall.removeEventListener('pointerleave', stopSpray);
      window.removeEventListener('blur', stopSpray);
      canSlots.forEach((slot) => {
        slot.removeEventListener('pointerdown', onCanPointerDown);
        slot.removeEventListener('click', onCanClick);
      });
      setFreeMode(false);
      syncExperienceIntro({ active: false });
      stopToolMotion();
      root.classList.remove('has-negative-skill-text');
      experiencePainter.clear();
      continuationPainter.clear();
      mm.revert();
      timeline?.kill();
      ScrollTrigger.getById('resume-skills-spray-wall')?.kill();
    },
  };
};
