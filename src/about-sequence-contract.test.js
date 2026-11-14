import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { heroPacingMap } from './hero-pacing.js';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const animationMap = JSON.parse(readSource('./animation-map.json'));
const aboutSource = readSource('./about-sequence.js');
const heroSource = readSource('./scroll-video.js');
const mainSource = readSource('./main.js');
const heroTvCss = readSource('./hero-tv.css');
const workflowMediaSource = readSource('./about-workflow-media.js');
const spriteManifestSource = readSource('./about-sprite-manifest.js');
const mediaReceiptSource = readSource('./about-media-receipt.js');

test('About config owns a 500vh story, pinned power cut, and three 160svh mobile stages', () => {
  const about = animationMap.sections.find((section) => section.id === 'about');

  assert.equal(about.mode, 'gsap-dom-timeline');
  assert.equal(about.pin, true);
  assert.equal(about.scrollDistanceVh, 5);
  assert.equal(about.powerCutFadeDistanceVh, 0.6);
  assert.equal(about.powerCutHoldDistanceVh, 0.15);
  assert.equal(about.scrub, 0.35);
  assert.equal(about.phaseModel, 'canonical-stage-q');
  assert.deepEqual(about.mobileFallback, {
    mode: 'three-vertical-stages',
    stageHeightSvh: 100,
    allocationSvh: 160,
  });
});

test('Hero-only distance preserves the approved scroll-per-timeline-unit ratio', () => {
  const hero = animationMap.sections.find((section) => section.id === 'hero');
  const paper = hero.paperTear;
  const heroOnlyTimeline = heroPacingMap.balanced.timelineDuration
    + hero.titleHoldDuration
    + paper.swapDuration
    + paper.duration;
  const legacySharedTimeline = heroOnlyTimeline - paper.exitFadeDuration + 4.43;
  const expectedHeroDistance = hero.sequenceScrollDistanceVh
    * heroOnlyTimeline
    / legacySharedTimeline;

  assert.ok(Math.abs(hero.heroScrollDistanceVh - expectedHeroDistance) < 1e-10);
  assert.equal(hero.sequenceScrollDistanceVh, 10.89);
  assert.equal(hero.endTime, 10.375);
});

test('About scrub is attached to top-level GSAP playheads rather than standalone triggers', () => {
  assert.match(aboutSource, /desktopAnimation\s*=\s*gsap\.to\(playhead/);
  assert.match(aboutSource, /mobileAnimations\s*=\s*stages\.map/);
  assert.match(aboutSource, /ease:\s*'none'/);
  assert.match(aboutSource, /scrollTrigger:\s*\{/);
  assert.doesNotMatch(aboutSource, /ScrollTrigger\.create\(/);
});

test('Hero and About keep separate trigger ownership around the canonical seam', () => {
  assert.match(heroSource, /addLabel\('about_handoff_complete'/);
  assert.match(heroSource, /id:\s*'resume-hero-tv-sequence'/);
  assert.match(heroSource, /const corridorRevealStart = hasPaperTear[\s\S]*?paperStart \+ tearSwapDuration/);
  assert.match(heroSource, /master\.eventCallback\('onUpdate'/);
  assert.match(heroSource, /previewActive = master\.time\(\) >= corridorRevealStart/);
  assert.match(heroTvCss, /\.is-about-preview \.motion-about-slot\s*\{[^}]*transform:\s*none !important/s);
  assert.match(aboutSource, /id:\s*'resume-about-sequence'/);
  assert.match(aboutSource, /id:\s*`resume-about-mobile-stage-\$\{index \+ 1\}`/);
  assert.match(mainSource, /id="about"[^>]*data-about-sequence/);
});

test('Hero keeps its poster visible until the first nonzero video seek completes', () => {
  assert.match(heroSource, /if \(video\.currentTime <= startTime\) return;[\s\S]*?has-hero-video-frame/);
  assert.match(heroSource, /video\.removeEventListener\('seeked', revealVideoFrame\)/);
  assert.match(heroTvCss, /\.motion-hero-media video\s*\{[^}]*display:\s*none/s);
  assert.match(heroTvCss, /@media \(min-width: 768px\) and \(prefers-reduced-motion: no-preference\)[\s\S]*?\.has-hero-video-frame \.motion-hero-media video\s*\{[^}]*display:\s*block/s);
});

test('breakpoint rebuild preserves stable semantic state with an instant scroll restore', () => {
  assert.match(aboutSource, /stableSemanticState/);
  assert.match(aboutSource, /captureBeforeMatchMediaRevert/);
  assert.match(aboutSource, /ScrollTrigger\.refresh\(\)/);
  assert.match(aboutSource, /style\.scrollBehavior\s*=\s*'auto'/);
  assert.match(aboutSource, /window\.scrollTo\(0, restoreTarget\)/);
  assert.match(aboutSource, /directionReleaseEvents/);
});

test('reduced motion keeps one complete repeat cycle inside the static viewport', () => {
  assert.match(aboutSource, /root\.classList\.remove\('is-about-rebuilding'\)/);
  assert.match(heroTvCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(heroTvCss, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\) auto\) minmax\(0, 1fr\)/);
  assert.match(heroTvCss, /\.motion-repeat-track span:nth-of-type\(n \+ 5\)/);
  assert.match(heroTvCss, /\.motion-repeat-track b:nth-of-type\(n \+ 4\)/);
});

test('workflow media uses the approved muted runtime asset and contracted lifecycle', () => {
  const about = animationMap.sections.find((section) => section.id === 'about');

  assert.deepEqual(about.workflowMedia, {
    enabled: true,
    poster: '/assets/posters/about-n8n-workflow-24s.jpg',
    sources: [{
      src: '/assets/videos/about-n8n-workflow-muted.mp4',
      type: 'video/mp4',
    }],
    approvalState: 'production-runtime-enabled',
  });
  assert.doesNotMatch(JSON.stringify(about.workflowMedia), /Desktop|[A-Za-z]:\\\\/);
  assert.match(workflowMediaSource, /loadedmetadata/);
  assert.match(workflowMediaSource, /visibilitychange/);
  assert.match(workflowMediaSource, /pagehide/);
  assert.match(workflowMediaSource, /pauseForExit/);
  assert.match(workflowMediaSource, /video\.currentTime\s*=\s*0/);
  assert.match(workflowMediaSource, /video\.preload\s*=\s*'metadata'/);
  assert.match(workflowMediaSource, /video\.loop\s*=\s*!reducedMotion/);
  assert.match(workflowMediaSource, /data-about-workflow-play/);
  assert.match(aboutSource, /IntersectionObserver/);
  assert.doesNotMatch(workflowMediaSource, /autoplay/);
});

test('middle monitor plays the approved repeat-detection film independently of scroll', () => {
  const about = animationMap.sections.find((section) => section.id === 'about');

  assert.deepEqual(about.repeatMedia, {
    enabled: true,
    mode: 'autoplay-loop',
    poster: '/assets/posters/about-repeat-detected-final.png',
    sources: [{
      src: '/assets/videos/about-repeat-detected.mp4',
      type: 'video/mp4',
    }],
    scrollControlled: false,
    approvalState: 'production-runtime-enabled',
  });
  assert.match(mainSource, /class="motion-repeat-video"[\s\S]*autoplay[\s\S]*muted[\s\S]*loop[\s\S]*playsinline/);
  assert.match(mainSource, /class="motion-repeat-video"[\s\S]*preload="none"[\s\S]*data-lazy-video[\s\S]*data-lazy-poster/);
  assert.match(mainSource, /data-lazy-src="\/assets\/videos\/about-repeat-detected\.mp4"/);
  assert.match(mainSource, /activateRepeatVideo[\s\S]*repeatVideo\.load\(\)/);
  assert.match(mainSource, /class="motion-frame"[\s\S]*loading="lazy"[\s\S]*decoding="async"/);
  assert.match(mainSource, />HOW I WORK</);
  assert.match(mainSource, /I spot repeated work and turn it into reliable automation\./);
  assert.match(mainSource, />REPEAT DETECTED</);
  assert.match(heroTvCss, /\.motion-repeat-video\s*\{[\s\S]*display:\s*none/);
  assert.doesNotMatch(JSON.stringify(about.repeatMedia), /Desktop|[A-Za-z]:\\\\/);
});

test('sprite media loads the complete manifest set and preserves deterministic frame contracts', () => {
  const about = animationMap.sections.find((section) => section.id === 'about');

  assert.deepEqual(about.spriteMedia, {
    enabled: true,
    manifests: [
      '/assets/sprites/about/entrance_roll.json',
      '/assets/sprites/about/ollie.json',
      '/assets/sprites/about/kickflip.json',
      '/assets/sprites/about/boardslide_popout.json',
      '/assets/sprites/about/exit_roll.json',
    ],
    approvalState: 'production-runtime-enabled',
  });
  assert.match(aboutSource, /createAboutSpriteFrameState/);
  assert.match(aboutSource, /fetch\(manifestPath/);
  assert.match(aboutSource, /new URL\(manifest\.sheetPath\.slice\(1\), document\.baseURI\)\.href/);
  assert.match(aboutSource, /image\.decode\(\)/);
  assert.match(aboutSource, /createAboutSpriteRenderState/);
  assert.match(aboutSource, /aboutSpriteAssetState\s*=\s*'ready'/);
  assert.match(spriteManifestSource, /wheelbaseApplicable !== derivedWheelbaseApplicable/);
  assert.match(spriteManifestSource, /columns \* manifest\.rows !== manifest\.frameCount/);
});

test('boardslide rail has separate back and foreground contact layers', () => {
  assert.match(mainSource, /data-about-rail="back"/);
  assert.match(mainSource, /data-about-rail="front"/);
  assert.match(mainSource, /boardslide-rail-v3\.png/);
  assert.match(heroTvCss, /\.motion-third-rail--front\s*\{[^}]*z-index:\s*9/s);
  assert.match(aboutSource, /railContact/);
});

test('floor switches use the generated three-state sheet and deterministic latched state', () => {
  assert.match(mainSource, /data-about-plate="1"[^>]*data-press-frame="0"/);
  assert.match(mainSource, /power-button-states\.png/);
  assert.match(heroTvCss, /data-press-frame="2"/);
  assert.match(aboutSource, /getAboutPlateState/);
  assert.doesNotMatch(aboutSource, /plate-press-y/);
  assert.doesNotMatch(heroTvCss, /plate-press-y/);
  assert.doesNotMatch(mainSource, /motion-power-cap|motion-power-base/);
});

test('desktop floor switches are accessible controls that seek completed screen states', () => {
  assert.match(mainSource, /<button[^>]*data-about-plate="1"[^>]*aria-label=/);
  assert.doesNotMatch(mainSource, /motion-buttons" aria-hidden="true"/);
  assert.match(heroTvCss, /\.motion-power\s*\{[^}]*pointer-events:\s*auto/s);
  assert.match(heroTvCss, /\.motion-power:focus-visible/);
  assert.match(aboutSource, /PLATE_COMPLETION_Q\s*=\s*0\.72/);
  assert.match(aboutSource, /addEventListener\('click', onPlateClick\)/);
  assert.match(aboutSource, /timeline\.call\([\s\S]*?, \[\], 0\.18\)/);
});

test('combo badges lock to the dog impact position instead of following its travel', () => {
  assert.match(aboutSource, /const impactState = \{ stage: index \+ 1, q: 0\.5, direction \}/);
  assert.match(aboutSource, /const impactTravel = progressBetween\(0\.5, 0, 0\.75\)/);
  assert.doesNotMatch(aboutSource, /anchorX: dog\.offsetLeft \+ x \+ dogWidth/);
});

test('first monitor is a full-bleed lazydooog reel using one isolated pose', () => {
  assert.match(mainSource, /motion-screen-content--character/);
  assert.match(mainSource, /data-about-character-reel/);
  assert.match(mainSource, /lazydooog-leaning-pose-v1\.png/);
  assert.match(mainSource, />Lazydoooog<\/span>/);
  assert.match(mainSource, /href="https:\/\/www\.threads\.com\/@lazydoooog"/);
  assert.match(mainSource, /href="https:\/\/brave-cricket-1e4\.notion\.site\/AI-23f6e83c928880d0b45ff6db26679604"/);
  assert.match(heroTvCss, /\.motion-screen-link\s*\{[^}]*position:\s*absolute[^}]*z-index:\s*6[^}]*inset:\s*0/s);
  assert.match(heroTvCss, /\.motion-workflow-play\s*\{[^}]*z-index:\s*7/s);
  assert.doesNotMatch(mainSource, /motion-portrait-sprite/);
  assert.match(heroTvCss, /@keyframes character-shot/);
  assert.match(aboutSource, /dataset\.reelState/);
});

test('media receipt validators preserve the closed PNG and ffprobe acceptance contracts', () => {
  assert.match(mediaReceiptSource, /types\[0\] !== 'IHDR'/);
  assert.match(mediaReceiptSource, /types\[1\] !== 'sRGB'/);
  assert.match(mediaReceiptSource, /types\.slice\(2, -1\).*type !== 'IDAT'/s);
  assert.match(mediaReceiptSource, /srgb\.payloadHex !== '01'/);
  assert.match(mediaReceiptSource, /stream\.side_data_list/);
  assert.match(mediaReceiptSource, /compatible_brands: 'isomiso2avc1mp41'/);
  assert.match(mediaReceiptSource, /MAX_ABOUT_VIDEO_BYTES/);
});
