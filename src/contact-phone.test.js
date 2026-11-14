import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CONTACT_LINKS,
  getContactLinkState,
  renderContactCameraApp,
  renderContactPhoneLinks,
} from './contact-phone.js';
import {
  getContactCameraState,
  getContactPhoneTilt,
  screenToContactWorld,
} from './contact-phone-scene.js';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const CONTACT_DOG_SPRITES = [
  'contact-dog-skate-v2-01-push.png',
  'contact-dog-skate-v2-02-glide.png',
  'contact-dog-skate-v4-03-airborne.png',
  'contact-dog-skate-v7-04-frightened-side-glide-left.png',
];

test('Contact renders exactly four accessible icon links without visible labels', () => {
  const markup = renderContactPhoneLinks();

  assert.equal(CONTACT_LINKS.length, 4);
  assert.equal((markup.match(/data-contact-link="/g) ?? []).length, 4);
  assert.equal((markup.match(/<img /g) ?? []).length, 4);
  assert.doesNotMatch(markup, /<svg/);
  assert.match(markup, /aria-label="Email"/);
  assert.match(markup, /href="mailto:a89890123@gmail\.com"/);
  assert.match(markup, /href="https:\/\/github\.com\/Ak89890123"/);
  assert.match(markup, /href="https:\/\/www\.linkedin\.com\/in\/jimmy-chen-642b53103"/);
  assert.match(markup, /href="https:\/\/www\.threads\.com\/@lazydoooog"/);
  assert.match(markup, /\/assets\/icons\/contact\/gmail-app-icon\.png/);
  assert.match(markup, /\/assets\/icons\/contact\/github-app-icon\.png/);
  assert.match(markup, /\/assets\/icons\/contact\/linkedin-in-logo\.png/);
  assert.match(markup, /\/assets\/icons\/contact\/threads-app-icon\.png/);
  assert.equal((markup.match(/data-contact-link-status="active"/g) ?? []).length, 4);
  assert.doesNotMatch(markup, /data-contact-link-status="pending"/);
  assert.doesNotMatch(markup, />\s*(Email|GitHub|LinkedIn|Threads)\s*</);
});

test('Contact only enables approved mailto and HTTPS destinations', () => {
  const external = { ...CONTACT_LINKS[1], href: 'https://github.com/approved-profile' };
  const invalid = { ...CONTACT_LINKS[1], href: 'javascript:alert(1)' };

  assert.deepEqual(getContactLinkState(CONTACT_LINKS[0]), {
    active: true,
    href: 'mailto:a89890123@gmail.com',
    target: null,
    rel: null,
  });
  assert.deepEqual(getContactLinkState(external), {
    active: true,
    href: 'https://github.com/approved-profile',
    target: '_blank',
    rel: 'noopener noreferrer',
  });
  assert.deepEqual(getContactLinkState(invalid), {
    active: false,
    href: null,
    target: null,
    rel: null,
  });
});

test('Contact page keeps one centered CSS phone and the pending-link hooks', () => {
  const mainSource = readSource('./main.js');
  const stylesSource = readSource('./styles.css');
  const contactSource = mainSource.match(
    /const renderContactSection = \(section\) => \{([\s\S]*?)\n\};/,
  )?.[1] ?? '';

  assert.match(mainSource, /data-contact-phone/);
  assert.match(mainSource, /contact-phone-body/);
  assert.match(mainSource, /contact-phone-island/);
  assert.match(mainSource, /renderContactCameraApp/);
  assert.match(mainSource, /initContactPhoneScene/);
  assert.equal((mainSource.match(/data-contact-phone-device/g) ?? []).length, 1);
  assert.doesNotMatch(mainSource, /data-contact-phone-canvas/);
  assert.doesNotMatch(mainSource, /contact-iphone-live-fallback\.png/);
  assert.doesNotMatch(mainSource, /contact-phone-copy/);
  assert.doesNotMatch(mainSource, /CHOOSE A CHANNEL/);
  assert.match(contactSource, /id="contact-title" class="sr-only">\$\{section\.label\}<\/h2>/);
  assert.doesNotMatch(contactSource, /contact-conversion|data-contact-evidence|section\.summary|section\.detail/);
  assert.doesNotMatch(stylesSource, /\.contact-conversion|\.contact-phone-support/);
  assert.match(stylesSource, /\.contact-phone-screen/);
  assert.match(stylesSource, /\.contact-camera-shutter/);
  assert.match(stylesSource, /--contact-phone-rotate-y/);
  assert.doesNotMatch(stylesSource, /--contact-impact-x/);
  assert.doesNotMatch(stylesSource, /margin-left:\s*clamp\(260px/);
  assert.match(stylesSource, /prefers-reduced-motion/);
});

test('Contact scene uses native CSS transforms without a WebGL model runtime', () => {
  const sceneSource = readSource('./contact-phone-scene.js');

  assert.doesNotMatch(sceneSource, /three|GLTFLoader|MeshoptDecoder|WebGLRenderer/i);
  assert.match(sceneSource, /style\.setProperty\('--contact-phone-rotate-x'/);
  assert.match(sceneSource, /style\.setProperty\('--contact-phone-rotate-y'/);
});

test('Contact ships four fixed-size low-frame-rate dog sprites', () => {
  CONTACT_DOG_SPRITES.forEach((name) => {
    const bytes = readFileSync(new URL(`../public/assets/sprites/contact/${name}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), 496);
    assert.equal(bytes.readUInt32BE(20), 793);
  });
});

test('Contact ships generated RGBA encounter sprites and the horizontal workshop background', () => {
  const stylesSource = readSource('./styles.css');
  const roach = readFileSync(new URL('../public/assets/sprites/contact/contact-cockroach-v1.png', import.meta.url));
  const flyingRoach = readFileSync(new URL('../public/assets/sprites/contact/contact-cockroach-flight-v1.png', import.meta.url));
  const reaction = readFileSync(new URL('../public/assets/sprites/contact/contact-exclamation-v1.png', import.meta.url));
  const background = readFileSync(new URL('../public/assets/backgrounds/contact-workshop-v1.png', import.meta.url));

  [roach, flyingRoach].forEach((sprite) => {
    assert.equal(sprite.subarray(1, 4).toString(), 'PNG');
    assert.equal(sprite.readUInt32BE(16), 384);
    assert.equal(sprite.readUInt32BE(20), 384);
    assert.equal(sprite[25], 6);
  });
  assert.equal(reaction.subarray(1, 4).toString(), 'PNG');
  assert.equal(reaction.readUInt32BE(16), 256);
  assert.equal(reaction.readUInt32BE(20), 384);
  assert.equal(reaction[25], 6);
  assert.equal(background.subarray(1, 4).toString(), 'PNG');
  assert.ok(background.readUInt32BE(16) > background.readUInt32BE(20));
  assert.match(stylesSource, /\.contact-cockroach\[data-contact-roach-phase=['"]crawl['"]\]::before\s*\{[^}]*opacity:\s*1/s);
  assert.match(stylesSource, /drop-shadow\(1px 0 0 rgb\(255 232 204 \/ 82%\)\)/);
});

test('Contact binds phone controls immediately and defers only its ScrollTrigger entrance', () => {
  const mainSource = readSource('./main.js');
  const sceneSource = readSource('./contact-phone-scene.js');

  assert.ok(mainSource.indexOf('initContactPhoneScene(animationMap)') < mainSource.indexOf('initScrollVideo(animationMap)'));
  assert.equal((mainSource.match(/data-contact-phone-device/g) ?? []).length, 1);
  assert.doesNotMatch(mainSource, /data-contact-pocket/);
  assert.match(mainSource, /experience-dog-glide-v1\.png/);
  assert.equal((mainSource.match(/data-contact-dog-pose=/g) ?? []).length, 4);
  assert.match(mainSource, /contact-cockroach-v1\.png/);
  assert.match(mainSource, /contact-cockroach-flight-v1\.png/);
  assert.equal((mainSource.match(/data-contact-roach-pose=/g) ?? []).length, 2);
  assert.match(mainSource, /contact-exclamation-v1\.png/);
  assert.doesNotMatch(mainSource, /contact-stone-v1\.png|data-contact-stone/);
  CONTACT_DOG_SPRITES.forEach((name) => assert.match(mainSource, new RegExp(name)));
  assert.match(sceneSource, /startEntrance\(options\)/);
  assert.match(mainSource, /startEntrance\(\{ staticMode: true \}\)/);
  assert.match(
    mainSource,
    /experienceHandoff: controller\.syncContactHandoff/,
  );
  assert.match(
    mainSource,
    /if \(!directContact\) contactPhoneController\?\.startEntrance\(\{ staticMode: true \}\)/,
  );
  assert.match(mainSource, /\.then\(\(\) => \{[\s\S]*?if \(directContact\) \{[\s\S]*?scrollIntoView/);
  assert.match(sceneSource, /state\.contact\.phoneOwnership === 'dog'/);
  assert.match(sceneSource, /!state\.contact\.phoneBehindDog \? phoneReveal : 0/);
  assert.match(sceneSource, /CONTACT_SEQUENCE_PHASES\.phoneDropEnd/);
  assert.match(sceneSource, /CONTACT_SEQUENCE_PHASES\.dogExit/);
  assert.match(sceneSource, /const escapeTravel = dogExit \* dogExit/);
  assert.match(sceneSource, /getContactRoachMotionState\(motionProgress\)/);
  assert.match(sceneSource, /motionProgress < CONTACT_SEQUENCE_PHASES\.roachTakeoff/);
  assert.match(sceneSource, /Math\.sin\(crawl \* Math\.PI \* 7\)/);
  assert.match(sceneSource, /Math\.sin\(crawl \* Math\.PI \* 17\)/);
  assert.match(sceneSource, /Math\.sin\(flightIn \* Math\.PI \* 5\)/);
  assert.match(sceneSource, /Math\.sin\(flightIn \* Math\.PI \* 13\)/);
  assert.match(sceneSource, /Math\.sin\(flightOut \* Math\.PI \* 6\)/);
  assert.match(sceneSource, /Math\.sin\(flightOut \* Math\.PI \* 15\)/);
  assert.match(sceneSource, /CONTACT_SEQUENCE_PHASES\.encounter - 0\.005/);
  assert.match(sceneSource, /scaleX: dogScale/);
  assert.match(sceneSource, /state\.encounterReady \? reactionRise \* \(1 - reactionFall\) : 0/);
  assert.doesNotMatch(sceneSource, /getContactPhoneDropState|phoneGrowth|compositeScale/);
  assert.match(sceneSource, /focusZoom: 1 \/ releaseTransform\.scale/);
  assert.match(sceneSource, /scale: releaseTransform\.scale/);
  assert.match(sceneSource, /const landedScreenY = releaseScreenY \+ geometry\.height \* 0\.14/);
  assert.match(sceneSource, /y:\s*screenToContactWorld\([\s\S]*?landedScreenY/);
  assert.match(sceneSource, /const cameraX = cameraState\.focus === 0[\s\S]*?\? 0[\s\S]*?: gsap\.utils\.interpolate\([\s\S]*?releaseScreenX,[\s\S]*?geometry\.width \/ 2,[\s\S]*?cameraState\.focus/);
  assert.match(sceneSource, /const cameraY = cameraState\.focus === 0[\s\S]*?\? 0[\s\S]*?: gsap\.utils\.interpolate\([\s\S]*?landedScreenY,[\s\S]*?settledYOffsetVh[\s\S]*?cameraState\.focus/);
  assert.match(sceneSource, /data-contact-camera-rig/);
  assert.match(sceneSource, /rotation:\s*0/);
  assert.doesNotMatch(sceneSource, /pocket|clipPath/);
  assert.match(mainSource, /if \(disposed\) return/);
  assert.match(mainSource, /if \(disposed\) \{\s*controller\.destroy\(\);\s*return;/);
});

test('Experience owns its DOM while Contact drives the masked handoff state', () => {
  const mainSource = readSource('./main.js');
  const contentSource = readSource('./sections/resume-content.js');
  const sceneSource = readSource('./contact-phone-scene.js');
  const experienceSource = readSource('./experience-sequence.js');
  const scrollSource = readSource('./scroll-video.js');
  const stylesSource = readSource('./styles.css');
  const animationMap = JSON.parse(readSource('./animation-map.json'));
  const contact = animationMap.sections.find((section) => section.id === 'contact');

  assert.doesNotMatch(contentSource, /id:\s*'projects'/);
  assert.equal(animationMap.sections.some((section) => section.id === 'projects'), false);
  assert.equal(contact.scrollDistanceVh, 5.4);
  assert.equal(contact.stripCount, 10);
  assert.equal(contact.stripOverlap, 0.82);
  assert.equal((mainSource.match(/data-contact-phone-device/g) ?? []).length, 1);
  assert.equal((mainSource.match(/data-experience-dog(?:[\s=>])/g) ?? []).length, 1);
  assert.equal((mainSource.match(/data-contact-dog(?:[\s=>])/g) ?? []).length, 1);
  assert.doesNotMatch(mainSource, /data-experience-contact-dog/);
  assert.match(mainSource, /class="contact-handoff-dog"/);
  assert.match(mainSource, /data-contact-handoff-reveal/);
  assert.match(mainSource, /data-contact-camera-rig/);
  assert.match(mainSource, /data-contact-handoff-strip/);
  assert.match(mainSource, /contact-handoff-strip-mask/);
  assert.match(sceneSource, /section\.querySelector\('\[data-contact-dog\]'\)/);
  assert.doesNotMatch(sceneSource, /document\.querySelector\('\[data-experience-contact-dog\]'\)/);
  assert.doesNotMatch(sceneSource, /data-experience-sequence|data-experience-backdrop/);
  assert.doesNotMatch(sceneSource, /experienceLayers|experienceStage|experienceDog/);
  assert.doesNotMatch(experienceSource, /contactLayers|contactHandoffBase|contactHandoffDogLayer/);
  assert.doesNotMatch(experienceSource, /append\(layer\.element\)|prepend\(dog\)|insertBefore/);
  assert.match(experienceSource, /pin:\s*stage/);
  assert.doesNotMatch(experienceSource, /pin:\s*sharedRoot/);
  assert.match(experienceSource, /pin:\s*backdrop/);
  assert.match(experienceSource, /pinReparent:\s*true/);
  assert.match(experienceSource, /getExperienceDogExitState/);
  assert.match(experienceSource, /const syncContactHandoff = \(\{/);
  assert.match(experienceSource, /const releaseContactHandoff = \(state = null\) =>/);
  assert.match(
    experienceSource,
    /setContactCardOwnership\(false\);[\s\S]*?sceneOwner === 'contact'[\s\S]*?is-experience-contact-handoff-complete/,
  );
  assert.match(
    stylesSource,
    /is-experience-contact-handoff-owner,[\s\S]*?is-experience-contact-handoff-complete[\s\S]*?z-index:\s*2/,
  );
  assert.match(sceneSource, /const activated = experienceHandoff\?\.\(\{ active: true, state \}\)/);
  assert.match(sceneSource, /experienceHandoff\?\.\(\{ active: true, state \}\)/);
  assert.match(sceneSource, /progress > 0 && !state\.cleanupReady && !handoffActive/);
  assert.match(sceneSource, /const motionProgress = state\.contact\.progress/);
  assert.match(sceneSource, /getExperienceContactHandoffState/);
  assert.match(sceneSource, /id:\s*'resume-experience-contact-handoff'/);
  assert.match(sceneSource, /ScrollTrigger\.create/);
  assert.match(sceneSource, /config\.scrollDistanceVh/);
  assert.match(sceneSource, /config\.stripOverlap/);
  assert.match(sceneSource, /strip\.style\.transform/);
  assert.match(sceneSource, /strip\.style\.removeProperty\('transform'\)/);
  assert.doesNotMatch(sceneSource, /strip\.setAttribute\('width'/);
  assert.match(sceneSource, /refreshProgress = handoffActive \? self\.progress : null/);
  assert.match(sceneSource, /gsap\.set\(base, \{ autoAlpha: 0 \}\)/);
  assert.match(sceneSource, /gsap\.set\(base, \{ display: 'block', autoAlpha: 0 \}\)/);
  assert.match(sceneSource, /handoffActive = false;\s*gsap\.set\(base, \{ autoAlpha: 0 \}\)/);
  assert.match(sceneSource, /experienceHandoff\?\.\(\{ active: false, state \}\)/);
  assert.match(sceneSource, /interactive: state\.contactInteractive/);
  assert.match(scrollSource, /syncContactHandoff: experienceController\.syncContactHandoff/);
  assert.match(mainSource, /experienceHandoff: controller\.syncContactHandoff/);
  assert.doesNotMatch(sceneSource, /deferActiveSection|sectionSyncFrame/);
  assert.match(
    experienceSource,
    /if \(!contactHandoffActive \|\| remeasure\) \{[\s\S]*?syncContactDogFrame\(\);[\s\S]*?\}\s*setPose\(1\);/,
  );
  assert.match(sceneSource, /scrollToSettled\(behavior/);
  assert.match(mainSource, /contactPhoneController\?\.scrollToSettled\(behavior\)/);
  assert.match(mainSource, /'hero', 'about', 'skills', 'experience', 'contact'/);
  assert.doesNotMatch(mainSource, /directContactOwns/);
  assert.match(mainSource, /entry\.target\.classList\.contains\('is-contact-static'\)/);
  assert.doesNotMatch(
    scrollSource,
    /const dispatchSection[\s\S]*?document\.documentElement\.dataset\.activeSection/,
  );
  assert.doesNotMatch(stylesSource, /--contact-dog-pose-weight/);
  assert.match(stylesSource, /data-contact-pose=['"]airborne['"]/);
  assert.match(stylesSource, /data-contact-pose=['"]escape['"]/);
  assert.doesNotMatch(stylesSource, /will-change:\s*clip-path/);
  assert.match(stylesSource, /\.contact-handoff-dog\s*\{[^}]*transform-origin:\s*50% 50%/);
  assert.match(stylesSource, /\.contact-handoff-dog\s*\{[^}]*width:\s*clamp\(240px, 20vw, 320px\)/);
  assert.match(stylesSource, /\.contact-handoff-dog-layer\s*\{[^}]*z-index:\s*3/s);
  assert.match(stylesSource, /\.contact-phone-flight\s*\{[^}]*z-index:\s*2/s);
  assert.doesNotMatch(sceneSource, /geometry\.dog(?:Width|Height) \* 1\.55/);
  assert.match(sceneSource, /geometry\.dogHeight \* contactDogScale/);
  assert.match(sceneSource, /const contactDogScale = 1\.35/);
  assert.match(sceneSource, /const dogScale = contactDogScale/);
  assert.match(sceneSource, /state\.dog\.travel/);
  assert.match(sceneSource, /geometry\.startX = -geometry\.dogWidth \* 0\.55/);
  assert.doesNotMatch(sceneSource, /gsap\.getProperty\(camera/);
  assert.match(sceneSource, /cameraConfig\.dogBoardNoseRatio/);
  assert.match(sceneSource, /cameraConfig\.encounterXRatio/);
  assert.match(
    sceneSource,
    /geometry\.roachFaceX = geometry\.cameraOriginX[\s\S]*?contactDogScale \* 0\.12/,
  );
  assert.match(sceneSource, /gsap\.set\(cameraRig/);
  assert.match(sceneSource, /onLeave:[\s\S]*?classList\.remove\('is-contact-scroll-owner'\)/);
  assert.match(sceneSource, /classList\.remove\('is-contact-owned', 'is-contact-static'/);
  assert.match(sceneSource, /delete section\.dataset\.handoffPhase/);
  assert.match(sceneSource, /device\.inert = false/);
  assert.match(sceneSource, /device\.removeAttribute\('aria-hidden'\)/);
  assert.equal(contact.camera.encounterXRatio, 0.5);
  assert.equal(contact.camera.dogBoardNoseRatio, 0.22);
  assert.equal(contact.camera.encounterZoom, 1.24);
  assert.equal(contact.camera.focusStart, 0.75);
  assert.equal(contact.camera.dropEnd, undefined);
  assert.match(stylesSource, /clip-path:\s*url\(#contact-handoff-strip-mask\)/);
  assert.match(stylesSource, /contact-workshop-v1\.png/);
  assert.match(
    stylesSource,
    /\.section--contact-phone\.is-contact-static\s*\{[^}]*z-index:\s*2[3-9]/s,
  );
});

test('Contact phone tilt stays subtle and clamps pointer input', () => {
  assert.deepEqual(getContactPhoneTilt(0, 0), { rotateX: -0, rotateY: 0 });
  assert.deepEqual(getContactPhoneTilt(2, -2), { rotateX: 3, rotateY: 7 });
  assert.deepEqual(getContactPhoneTilt(-2, 2), { rotateX: -3, rotateY: -7 });
});

test('Contact holds its frame through the encounter, then pushes into the landed phone', () => {
  const start = getContactCameraState(0);
  const track = getContactCameraState(0.3);
  const encounter = getContactCameraState(0.53);
  const escape = getContactCameraState(0.62);
  const reveal = getContactCameraState(0.74);
  const focus = getContactCameraState(0.8);
  const settled = getContactCameraState(0.88);

  assert.equal(start.scale, 1);
  assert.ok(track.scale > start.scale);
  assert.ok(encounter.scale > track.scale);
  assert.equal(escape.scale, encounter.scale);
  assert.equal(reveal.scale, encounter.scale);
  assert.ok(focus.scale > encounter.scale);
  assert.ok(settled.scale > focus.scale);
  assert.equal(screenToContactWorld(720, 920, 2), 820);
});

test('Contact keeps four contact apps on home and isolates the camera feature', () => {
  const markup = renderContactCameraApp();
  const sceneSource = readSource('./contact-phone-scene.js');
  const stylesSource = readSource('./styles.css');

  assert.match(markup, /data-phone-os data-phone-screen="home"/);
  assert.match(markup, /data-open-camera/);
  assert.match(markup, /data-open-camera[^>]*>\s*<span[\s\S]*?<\/span>\s*<\/button>/);
  assert.match(markup, /iphone-camera-app-icon\.png/);
  assert.match(markup, /data-phone-home-indicator/);
  assert.match(markup, /aria-label="返回主畫面"/);
  assert.equal((markup.match(/data-contact-link="/g) ?? []).length, CONTACT_LINKS.length);
  assert.doesNotMatch(markup, /data-camera-channel=/);
  assert.doesNotMatch(markup, /data-camera-panel=/);
  assert.doesNotMatch(markup, /選擇聯絡方式/);
  assert.match(markup, /data-camera-shutter/);
  assert.match(markup, /data-camera-flip/);
  assert.match(markup, /data-camera-flash/);
  assert.equal((markup.match(/data-camera-zoom="/g) ?? []).length, 3);
  assert.match(markup, /aria-live="polite"/);
  assert.match(sceneSource, /dataset\.cameraState = 'focusing'/);
  assert.match(sceneSource, /bindPendingContactLinks\(home\)/);
  assert.doesNotMatch(sceneSource, /getContactLinkState|window\.location\.href|window\.open/);
  assert.match(sceneSource, /setStatus\('已拍攝'\)/);
  assert.match(sceneSource, /classList\.add\('is-camera-switching'\)/);
  assert.match(sceneSource, /if \(!reducedMotion\) \{[\s\S]*?is-camera-flashing/);
  assert.match(sceneSource, /homeGestureStart - event\.clientY >= 48/);
  assert.match(sceneSource, /event\.key === 'Escape'/);
  assert.match(sceneSource, /setPhoneScreen\('home', false\)/);
  assert.match(stylesSource, /\[data-camera-state='booting'\]/);
  assert.match(stylesSource, /\[data-phone-screen='camera'\] \.contact-camera-app/);
  assert.match(stylesSource, /\.contact-camera-app button:focus-visible/);
});
