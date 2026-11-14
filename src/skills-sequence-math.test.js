import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createPolylineSampler,
  createDiagonalFillPath,
  getCanvasPixelRatio,
  getExperienceTransitionState,
  getSprayParticle,
  getSkillColorIndex,
  getSkillGroupProgress,
  getSkillMaskStampCount,
  getSkillToolState,
} from './skills-sequence-math.js';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('About hands one Skills title from the power cut to the real wall', () => {
  const mainSource = readSource('./main.js');
  const aboutSource = readSource('./about-sequence.js');
  const sequenceSource = readSource('./skills-sequence.js');
  const stylesSource = readSource('./styles.css');

  assert.match(mainSource, /data-skills-entry/);
  assert.match(mainSource, /skills-power-cut__blackout/);
  assert.doesNotMatch(mainSource, /skills-power-cut__beam/);
  assert.doesNotMatch(mainSource, /skills-power-cut__surface/);
  assert.doesNotMatch(sequenceSource, /transitionSurface/);
  assert.doesNotMatch(sequenceSource, /clipPath/);
  assert.doesNotMatch(sequenceSource, /workLight/);
  assert.doesNotMatch(sequenceSource, /entryTimeline/);
  assert.match(aboutSource, /document\.body\.append\(powerCut\)/);
  assert.match(aboutSource, /powerCutOwner\.prepend\(powerCut\)/);
  assert.match(aboutSource, /titleEntry\.append\(skillsTitle\)/);
  assert.match(aboutSource, /titleWall\.append\(skillsTitle\)/);
  assert.match(aboutSource, /distanceVh \+ powerCutFadeDistanceVh \+ powerCutHoldDistanceVh/);
  assert.match(aboutSource, /travelVh,\s*distanceVh,\s*distanceVh \+ powerCutFadeDistanceVh/s);
  assert.equal((mainSource.match(/data-skills-title(?:\s|>)/g) ?? []).length, 1);
  assert.match(mainSource, /data-skills-title-entry/);
  assert.match(mainSource, /data-skills-title-wall/);
  assert.match(sequenceSource, /titleEntryDistanceVh/);
  assert.match(sequenceSource, /titleHoldDistanceVh/);
  assert.match(sequenceSource, /systemEntryExtraDistanceVh/);
  assert.match(sequenceSource, /duration: systemEntryDistanceVh/);
  assert.match(sequenceSource, /powerOnDistanceVh/);
  assert.match(sequenceSource, /renderTitle/);
  assert.doesNotMatch(sequenceSource, /titleOverlay|titleParts/);
  assert.match(sequenceSource, /const syncTitleLayer = \(wallOwnsTitle\)/);
  assert.match(sequenceSource, /if \(title\.parentElement !== owner\) owner\.append\(title\)/);
  assert.match(sequenceSource, /if \(timeline\?\.scrollTrigger\?\.isActive\) \{\s*gsap\.set\(powerCut, \{ autoAlpha: wallOwnsTitle \? 0 : 1 \}\);/);
  assert.doesNotMatch(sequenceSource, /gsap\.set\(powerCut, \{ autoAlpha: 1 \}\)/);
  assert.match(sequenceSource, /onUpdate: \(\) => syncTitleLayer\(\(timeline\?\.time\(\) \?\? 0\) >= skillsStartVh\)/);
  assert.match(sequenceSource, /syncTitleLayer\(false\)/);
  assert.doesNotMatch(sequenceSource, /gsap\.set\(powerCut, \{ autoAlpha: isExperiencePhase/);
  assert.match(sequenceSource, /gsap\.set\(powerCut, \{ clearProps: 'all' \}\)/);
  assert.match(sequenceSource, /\.fromTo\(blackout,\s*\{\s*autoAlpha:\s*1,\s*\},\s*\{\s*autoAlpha:\s*0,/s);
  assert.match(sequenceSource, /}, powerOnStartVh\)/);
  assert.match(sequenceSource, /}, skillsStartVh\)/);
  assert.doesNotMatch(sequenceSource, /resume-skills-power-cut/);
  assert.match(stylesSource, /\.skills-power-cut\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*120[^}]*inset:\s*0[^}]*height:\s*100svh/s);
  assert.doesNotMatch(stylesSource, /@media \(min-width: 768px\)\s*\{\s*\.js \.skills-intro\s*\{\s*opacity:\s*0/s);
  assert.match(sequenceSource, /prefers-reduced-motion:\s*no-preference/);
  assert.doesNotMatch(mainSource, /skills-entry-gate__panel/);
  assert.match(stylesSource, /\.skills-power-cut,\s*\n\s*\.skills-can-rack/);
});

test('Skills and Experience share one long painted wall in document flow', () => {
  const mainSource = readSource('./main.js');
  const skillsSource = readSource('./skills-sequence.js');
  const experienceSource = readSource('./experience-sequence.js');
  const scrollSource = readSource('./scroll-video.js');
  const stylesSource = readSource('./styles.css');
  const animationMap = JSON.parse(readSource('./animation-map.json'));
  const experience = animationMap.sections.find((section) => section.id === 'experience');

  assert.match(mainSource, /renderSkillsSection\(resumeSections\.find\(\(item\) => item\.id === 'experience'\)\)/);
  assert.doesNotMatch(mainSource, /data-experience-transition/);
  assert.match(mainSource, /data-experience-paint/);
  assert.match(mainSource, /data-experience-can/);
  assert.doesNotMatch(mainSource, /skills-exit-line/);
  assert.doesNotMatch(skillsSource, /--skills-exit-progress/);
  assert.doesNotMatch(stylesSource, /\.skills-exit-line/);
  assert.doesNotMatch(skillsSource, /combinedDistanceVh|mapSkillsExperienceProgress/);
  assert.match(
    skillsSource,
    /syncExperienceIntro\(\{\s*routeProgress: routeIntroProgress,\s*dogProgress: dogEntryProgress,/,
  );
  assert.doesNotMatch(skillsSource, /renderPinnedRoute|renderPinnedDog|releasePinnedIntro/);
  assert.match(experienceSource, /const syncPinnedIntro = \(\{/);
  assert.match(
    scrollSource,
    /skillsController\.setExperienceIntro\(experienceController\.syncPinnedIntro\)/,
  );
  assert.match(
    scrollSource,
    /getSkillsTrigger: \(\) => ScrollTrigger\.getById\('resume-skills-spray-wall'\)/,
  );
  assert.doesNotMatch(experienceSource, /ScrollTrigger\.getById\('resume-skills-spray-wall'\)/);
  assert.match(skillsSource, /if \(self\.isActive\) \{[\s\S]*renderExperienceIntro\(\)/);
  assert.match(skillsSource, /setExperienceIntro\(sync\)/);
  assert.match(skillsSource, /onLeave: \(\) => timeline\?\.progress\(1\)/);
  assert.equal(experience.pin, false);
  assert.equal(experience.transitionPin, undefined);
  assert.equal(experience.transitionDistanceVh, 1.6);
  assert.equal(experience.routeIntroDistanceVh, 0.8);
  assert.equal(experience.dogEntryDistanceVh, 0.6);
  assert.equal(experience.routeScrub, 0.4);
  assert.equal(experience.dogScrub, 0.55);
  assert.equal(experience.handoffHoldDistanceVh, 0.7);
  assert.equal(experience.dogExitDistanceVh, undefined);
  assert.equal(experience.cardScrub, 0.7);
  assert.equal(experience.transitionPaint, '#658c89');
  assert.equal(experience.stageHeightVh, 260);
  assert.match(skillsSource, /pin: wall/);
  assert.match(skillsSource, /const totalDistanceVh = transitionEndVh \+ Math\.max\(routeIntroDistanceVh, dogEntryDistanceVh\)/);
  assert.match(skillsSource, /createSerpentineFillPath/);
  assert.match(skillsSource, /const transitionOverscan = transitionRadius/);
  assert.match(skillsSource, /top: -transitionOverscan/);
  assert.match(skillsSource, /splitSerpentineFillPath\(longPaintPoints, height \+ transitionOverscan\)/);
  assert.match(skillsSource, /transitionPaintIndexOffset \+ index/);
  assert.doesNotMatch(skillsSource, /1700/);
  assert.match(skillsSource, /continuationPainter/);
  assert.match(skillsSource, /experiencePainter\.copy\(continuationCanvas\)/);
  assert.match(skillsSource, /if \(!longWallGeometryChanged\) return/);
  assert.match(skillsSource, /--skills-experience-wall-height/);
  assert.match(
    skillsSource,
    /root\.classList\.toggle\(\s*'is-experience-transition',\s*state\.paintVisible,\s*\)/,
  );
  assert.match(
    stylesSource,
    /\.experience-paint\s*\{[^}]*clip-path:\s*inset\(var\(--skills-wall-viewport-height, 100svh\) 0 0\)/s,
  );
  assert.match(
    stylesSource,
    /\.is-experience-transition \.experience-paint\s*\{[^}]*clip-path:\s*inset\(0\)/s,
  );
  assert.match(
    skillsSource,
    /experiencePainter\.copy\(continuationCanvas\);[\s\S]*renderTransition\(transitionProgress\);/,
  );
  assert.match(
    skillsSource,
    /onRefresh: \(self\) => \{[\s\S]*renderTransition\(transitionPlayhead\.progress\);/,
  );
  assert.doesNotMatch(experienceSource, /resume-experience-paint-bridge/);
  assert.match(experienceSource, /id: 'resume-experience-document-route',\s*trigger: root/s);
  assert.match(experienceSource, /introRouteLeadDistance = getRouteDistanceAtY\([\s\S]*window\.innerHeight \* 2\.02/);
  assert.match(experienceSource, /id: 'resume-experience-document-route',[\s\S]*end: 'bottom 150%'/);
  assert.match(experienceSource, /id: 'resume-experience-document-dog',\s*trigger: root/s);
  assert.match(experienceSource, /id: 'resume-experience-document-dog',[\s\S]*onUpdate: \(\) => renderDog\(dogPlayhead\.progress\)/);
  assert.match(experienceSource, /id: 'resume-experience-intro-handoff',[\s\S]*onUpdate: \(self\) => renderIntroHandoff\(self\.progress\)/);
  assert.match(experienceSource, /getExperienceHandoffState/);
  assert.match(experienceSource, /id: `resume-experience-card-\$\{index \+ 1\}`/);
  assert.match(experienceSource, /id: 'resume-experience-contact-scene-hold'/);
  assert.match(
    experienceSource,
    /id: 'resume-experience-contact-scene-hold',\s*trigger: cards\.at\(-1\),\s*start: 'top 32%',\s*endTrigger: contact,\s*end: getSceneHoldEnd,[\s\S]*?pin: stage,\s*pinSpacing: false/s,
  );
  assert.doesNotMatch(experienceSource, /pin: root/);
  assert.match(experienceSource, /getExperienceDogExitState/);
  assert.match(experienceSource, /renderContactDogExit\(state\.exitProgress\)/);
  assert.match(mainSource, /data-experience-backdrop[\s\S]*data-experience-paint/);
  assert.match(
    mainSource,
    /data-experience-backdrop-world[\s\S]*data-skills-free-canvas[\s\S]*<\/div>\s*<\/div>\s*<canvas class="experience-paint" data-experience-paint aria-hidden="true">/,
  );
  assert.match(
    experienceSource,
    /id: 'resume-experience-background-exit',\s*trigger: cards\.at\(-1\),\s*start: 'top 32%',\s*endTrigger: contact,\s*end: getSceneHoldEnd,\s*pin: backdrop,\s*pinSpacing: false,\s*pinReparent: true/s,
  );
  assert.match(
    stylesSource,
    /\.section--skills\.is-experience-exit-background-pinned\s*\{[^}]*background:\s*transparent/s,
  );
  assert.match(stylesSource, /body > \.skills-experience-backdrop\s*\{[^}]*z-index:\s*1/s);
  assert.doesNotMatch(experienceSource, /dogExitSmoother|gsap\.quickTo/);
  assert.doesNotMatch(experienceSource, /scrub: config\.dogExitScrub/);
  assert.doesNotMatch(experienceSource, /setExitWallOffset/);
  assert.doesNotMatch(stylesSource, /--experience-exit-wall-y/);
  assert.match(mainSource, /data-experience-stage[\s\S]*data-experience-dog/);
  assert.match(experienceSource, /start: 'top top'/);
  assert.match(experienceSource, /end: 'bottom center'/);
  assert.doesNotMatch(experienceSource, /syncPinnedStage|setStageY/);
  assert.match(stylesSource, /\.is-experience-pinned-intro \.experience-stage\s*\{[^}]*position:\s*fixed/s);
  assert.match(stylesSource, /\.experience-stage\s*\{[^}]*top:\s*calc\(-1 \* var\(--experience-handoff-shift, 0px\)\)/s);
  assert.match(mainSource, /experience-route-line__mist/);
  assert.match(mainSource, /experience-route-line__speckle/);
  assert.match(stylesSource, /\.experience-route-line__mist\s*\{[^}]*stroke-width:\s*72px/s);
  assert.match(stylesSource, /\.experience-route-line__speckle\s*\{[^}]*stroke-dasharray:/s);
  assert.match(experienceSource, /viewportCenter = window\.innerHeight \/ 2/);
  assert.match(experienceSource, /onUpdate: \(self\) => renderSceneHold\(self\.progress\)/);
  assert.match(experienceSource, /finalCardBounds\.top \+ finalCardBounds\.height \/ 2/);
  assert.match(experienceSource, /routePath\.getPointAtLength\(lastDogRouteDistance\)/);
  assert.match(experienceSource, /pinnedIntroActive \|\| handoffHoldActive \|\| handoffComplete \|\| contactHandoffActive/);
  assert.match(stylesSource, /\.experience-paint\s*\{[^}]*height:\s*var\(--skills-experience-wall-height, 360svh\)/s);
  assert.match(stylesSource, /\.section--experience\s*\{[^}]*min-height:\s*var\(--experience-stage-height, 260svh\)[^}]*background:\s*transparent/s);
});

test('Experience dog entry overlaps the route intro instead of extending a blank tail', () => {
  const skillsSource = readSource('./skills-sequence.js');

  assert.match(
    skillsSource,
    /const totalDistanceVh = transitionEndVh \+ Math\.max\(routeIntroDistanceVh, dogEntryDistanceVh\)/,
  );
  assert.match(skillsSource, /}, transitionEndVh\);/);
});

test('Experience transition state is deterministic across entry, reverse, and refresh', () => {
  const preEntry = getExperienceTransitionState(0);
  const entry = getExperienceTransitionState(0.02);

  assert.deepEqual(preEntry, {
    progress: 0,
    paintVisible: false,
    canOpacity: 0,
  });
  assert.deepEqual(entry, {
    progress: 0.02,
    paintVisible: true,
    canOpacity: 0.5,
  });
  assert.deepEqual(getExperienceTransitionState(0.02), entry);
  assert.deepEqual(getExperienceTransitionState(0), preEntry);
});

test('Skills keeps the Experience intro alive until Experience takes ownership', () => {
  const skillsSource = readSource('./skills-sequence.js');
  const experienceSource = readSource('./experience-sequence.js');
  const stylesSource = readSource('./styles.css');
  const renderExperienceIntro = skillsSource.match(
    /const renderExperienceIntro = \(\) => \{([\s\S]*?)\n  \};/,
  )?.[1] ?? '';

  assert.doesNotMatch(renderExperienceIntro, /active: false/);
  assert.doesNotMatch(
    skillsSource,
    /if \(!self\.isActive && self\.progress >= 1\) \{\s*syncExperienceIntro\(\{ active: false \}\);\s*\}/,
  );
  assert.match(experienceSource, /onEnter: releasePinnedIntro/);
  assert.match(
    experienceSource,
    /const syncPinnedIntro = \([\s\S]*?if \(routeAnimation\?\.scrollTrigger\?\.isActive\) return;/,
  );
  assert.match(
    stylesSource,
    /\.is-experience-pinned-intro \.experience-stage\s*\{[^}]*top:\s*0\s*!important/s,
  );
  assert.match(
    skillsSource,
    /const skillsOwnsTitle = !timeline\?\.scrollTrigger[\s\S]*gsap\.set\(title, \{ autoAlpha: skillsOwnsTitle \? 1 : 0 \}\);/,
  );
});

test('Experience stops use one reversible wall-integrated text reveal timeline', () => {
  const experienceSource = readSource('./experience-sequence.js');
  const contentSource = readSource('./sections/resume-content.js');
  const stylesSource = readSource('./styles.css');

  assert.match(experienceSource, /import \{ SplitText \} from 'gsap\/SplitText'/);
  assert.match(
    experienceSource,
    /SplitText\.create\(title,\s*\{[\s\S]*type: 'lines',[\s\S]*mask: 'lines',[\s\S]*autoSplit: true,/,
  );
  assert.match(
    experienceSource,
    /const timeline = gsap\.timeline\(\{[\s\S]*id: `resume-experience-card-\$\{index \+ 1\}`[\s\S]*scrub: config\.cardScrub/,
  );
  assert.match(experienceSource, /window\.innerHeight \* 0\.96/);
  assert.match(experienceSource, /window\.innerHeight \* 0\.38/);
  assert.match(
    experienceSource,
    /\.fromTo\(\s*scan,[\s\S]*\.fromTo\(\s*dateTrack,[\s\S]*\.fromTo\(\s*dateValues,[\s\S]*split\.lines/,
  );
  assert.match(experienceSource, /card\.querySelector\('\.experience-company'\)/);
  assert.match(experienceSource, /scaleX: 0,[\s\S]*scaleX: 1/);
  assert.doesNotMatch(contentSource, /experience-date__marker/);
  assert.match(contentSource, /experience-date__track/);
  assert.match(contentSource, /class="experience-company"/);
  assert.match(
    experienceSource,
    /\.set\(split\.lines, \{ autoAlpha: 0, yPercent: 110 \}, 0\)[\s\S]*\.to\(\s*split\.lines,/,
  );
  assert.doesNotMatch(
    experienceSource,
    /\.to\(\s*split\.lines,\s*\{[^}]*scrollTrigger:/,
  );
  assert.doesNotMatch(experienceSource, /gsap\.set\(cards, \{ autoAlpha: 0 \}\)/);
  assert.match(
    stylesSource,
    /\.experience-stories \.career-route li\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s,
  );
  assert.doesNotMatch(stylesSource, /\.experience-stories \.career-route li::after/);
  assert.match(
    stylesSource,
    /\.is-experience-pinned-intro \.experience-stories \.career-route li\s*\{[^}]*visibility:\s*hidden !important;[^}]*opacity:\s*0 !important;/s,
  );
  assert.match(stylesSource, /\.experience-card-scan\s*\{[^}]*will-change:\s*transform, opacity/s);
  assert.match(stylesSource, /\.experience-date__track\s*\{[^}]*transform-origin:\s*left center/s);
});

test('long handoff canvases stay within their backing-store pixel budget', () => {
  const ratio = getCanvasPixelRatio(3840, 7776, 1.15, 1.25, 12_000_000);

  assert.ok((3840 * ratio) * (7776 * ratio) <= 12_000_001);
  assert.equal(getCanvasPixelRatio(1440, 3240, 1.15, 1, 12_000_000), 1);
});

test('Experience paint owns a foreground layer above the visible Skills title', () => {
  const mainSource = readSource('./main.js');
  const experienceSource = readSource('./experience-sequence.js');
  const sequenceSource = readSource('./skills-sequence.js');
  const stylesSource = readSource('./styles.css');

  assert.match(
    mainSource,
    /<\/div>\s*<\/div>\s*<canvas class="experience-paint" data-experience-paint aria-hidden="true">/,
  );
  assert.match(experienceSource, /const experiencePaint = sharedRoot\?\.querySelector/);
  assert.match(experienceSource, /const paintHome = experiencePaint\.parentElement/);
  assert.match(experienceSource, /const owner = backdropOwnsPaint \? backdrop : paintHome/);
  assert.match(
    experienceSource,
    /if \(experiencePaint\.parentElement !== owner\) owner\.append\(experiencePaint\)/,
  );
  assert.match(stylesSource, /\.skills-intro,\s*\n\.skills-grid,[\s\S]*z-index:\s*5/s);
  assert.match(stylesSource, /\.experience-paint\s*\{[^}]*z-index:\s*10/s);
  assert.doesNotMatch(sequenceSource, /state\.titleOpacity/);
});

test('full-screen spray can stays above its paint canvas', () => {
  const stylesSource = readSource('./styles.css');

  assert.match(stylesSource, /\.experience-can\s*\{[^}]*z-index:\s*11/s);
});

test('skill group progress clamps before, within, and after its range', () => {
  assert.equal(getSkillGroupProgress(0.05, 0), 0);
  assert.equal(getSkillGroupProgress(0.165, 0), 0.5);
  assert.equal(getSkillGroupProgress(0.3, 0), 1);
});

test('skill text mask reveals the same deterministic stamp count as the painter', () => {
  assert.equal(getSkillMaskStampCount(0, 46), 0);
  assert.equal(getSkillMaskStampCount(0.01, 46), 1);
  assert.equal(getSkillMaskStampCount(0.5, 46), 23);
  assert.equal(getSkillMaskStampCount(1, 46), 46);
});

test('skill spray fills from bottom-right to top-left with overlapping 45 degree lines', () => {
  const spacing = 12;
  const path = createDiagonalFillPath(
    { left: 10, right: 90, top: 20, bottom: 80 },
    spacing,
  );

  assert.ok(path.length > 10);
  path.forEach(({ x, y }) => {
    assert.ok(x >= 10 && x <= 90);
    assert.ok(y >= 20 && y <= 80);
  });
  for (let index = 0; index < path.length; index += 2) {
    const from = path[index];
    const to = path[index + 1];
    assert.ok(Math.abs(Math.abs(to.x - from.x) - Math.abs(to.y - from.y)) < 1e-9);
    assert.ok((to.x - from.x) * (to.y - from.y) < 0);
    if (index > 0) {
      const previousSum = path[index - 2].x + path[index - 2].y;
      const currentSum = from.x + from.y;
      assert.ok(previousSum > currentSum);
      assert.ok((previousSum - currentSum) / Math.SQRT2 <= spacing + 1e-9);
    }
  }
});

test('spray particles keep a dense core and a wider deterministic overspray band', () => {
  const core = getSprayParticle(1300, 4, 20);
  const outer = getSprayParticle(1300, 4, 20, true);

  assert.deepEqual(core, getSprayParticle(1300, 4, 20));
  assert.ok(Math.hypot(core.x, core.y) <= 20 * 0.66);
  assert.ok(Math.hypot(outer.x, outer.y) >= 20 * 0.68);
  assert.ok(Math.hypot(outer.x, outer.y) <= 20 * 1.7);
  assert.ok(outer.radius < core.radius);
});

test('polyline sampler follows segment distance and preserves direction', () => {
  const sample = createPolylineSampler([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ]);
  assert.deepEqual(sample(0.25), { x: 50, y: 0, angle: 0 });
  assert.deepEqual(sample(0.75), { x: 100, y: 50, angle: 90 });
});

test('tool stops spraying while travelling between skill groups', () => {
  const paths = [
    [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    [{ x: 200, y: 100 }, { x: 300, y: 100 }],
  ];
  const ranges = [
    { start: 0.1, end: 0.2 },
    { start: 0.3, end: 0.4 },
  ];
  assert.equal(getSkillToolState(0.15, paths, ranges).spraying, true);
  assert.deepEqual(getSkillToolState(0.25, paths, ranges), {
    x: 150,
    y: 50,
    angle: 0,
    spraying: false,
  });
});

test('spray can color advances with each skill range and holds the final color', () => {
  const ranges = [
    { start: 0.1, end: 0.2 },
    { start: 0.3, end: 0.4 },
    { start: 0.5, end: 0.6 },
  ];
  assert.equal(getSkillColorIndex(0, ranges), 0);
  assert.equal(getSkillColorIndex(0.2, ranges), 0);
  assert.equal(getSkillColorIndex(0.21, ranges), 1);
  assert.equal(getSkillColorIndex(0.41, ranges), 2);
  assert.equal(getSkillColorIndex(1, ranges), 2);
});
