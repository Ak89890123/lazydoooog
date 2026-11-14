import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPERIENCE_CONTACT_HANDOFF,
  EXPERIENCE_PHASES,
  createExperienceRoutePath,
  createSerpentineFillPath,
  getExperienceContactHandoffState,
  getExperienceDocumentRouteState,
  getExperienceDogExitState,
  getExperienceDogRouteHoldState,
  getExperienceHandoffState,
  getDogPoseWeights,
  mapIndependentExperienceTracks,
  mapPinnedExperienceIntro,
  splitSerpentineFillPath,
} from './experience-sequence-math.js';
import { createPolylineSampler } from './skills-sequence-math.js';

const exitAt = (progress) => EXPERIENCE_CONTACT_HANDOFF.contactStart * progress;
const contactAt = (progress) => (
  EXPERIENCE_CONTACT_HANDOFF.contactStart
  + (1 - EXPERIENCE_CONTACT_HANDOFF.contactStart) * progress
);

test('transition paint fills from bottom-right in alternating horizontal rows', () => {
  const path = createSerpentineFillPath(
    { left: 10, right: 90, top: 20, bottom: 80 },
    20,
  );

  assert.deepEqual(path.slice(0, 4), [
    { x: 90, y: 80 },
    { x: 10, y: 80 },
    { x: 10, y: 60 },
    { x: 90, y: 60 },
  ]);
  assert.deepEqual(path.slice(-2), [
    { x: 10, y: 20 },
    { x: 90, y: 20 },
  ]);
});

test('one uniformly sampled spray path stays continuous across the Skills and Experience split', () => {
  const path = createSerpentineFillPath({
    left: 0,
    right: 100,
    top: 0,
    bottom: 120,
  }, 20);
  const samples = Array.from({ length: 31 }, (_, index) => (
    createPolylineSampler(path)(index / 30)
  ));
  const {
    continuation,
    transition,
    splitIndex,
  } = splitSerpentineFillPath(samples, 60);

  assert.ok(continuation.every((point) => point.y > 60));
  assert.ok(transition.every((point) => point.y <= 60));
  assert.deepEqual([...continuation, ...transition], samples);
  assert.equal(continuation.at(-1), samples[splitIndex - 1]);
  assert.equal(transition[0], samples[splitIndex]);
});

test('pinned Experience handoff keeps painting one viewport ahead while the dog enters', () => {
  assert.deepEqual(mapPinnedExperienceIntro({
    routeProgress: 0,
    dogProgress: 0,
    routeEndDistance: 900,
    routeLeadDistance: 1800,
    centerDistance: 450,
  }), {
    drawnDistance: 0,
    dogDistance: 0,
    dogVisible: false,
  });
  assert.deepEqual(mapPinnedExperienceIntro({
    routeProgress: 1,
    dogProgress: 0,
    routeEndDistance: 900,
    routeLeadDistance: 1800,
    centerDistance: 450,
  }), {
    drawnDistance: 900,
    dogDistance: 0,
    dogVisible: false,
  });
  assert.deepEqual(mapPinnedExperienceIntro({
    routeProgress: 1,
    dogProgress: 0.5,
    routeEndDistance: 900,
    routeLeadDistance: 1800,
    centerDistance: 450,
  }), {
    drawnDistance: 1350,
    dogDistance: 225,
    dogVisible: true,
  });
  assert.deepEqual(mapPinnedExperienceIntro({
    routeProgress: 1,
    dogProgress: 1,
    routeEndDistance: 900,
    routeLeadDistance: 1800,
    centerDistance: 450,
  }), {
    drawnDistance: 1800,
    dogDistance: 450,
    dogVisible: true,
  });
});

test('Experience document route stays empty until its ScrollTrigger takes ownership', () => {
  const route = {
    routeLength: 3200,
    routeLeadDistance: 1800,
  };

  assert.deepEqual(getExperienceDocumentRouteState({
    ...route,
    routeProgress: 0,
    routeActive: false,
  }), { drawnDistance: 0, visible: false });
  assert.deepEqual(getExperienceDocumentRouteState({
    ...route,
    routeProgress: 0,
    routeActive: true,
  }), { drawnDistance: 1800, visible: true });
  assert.deepEqual(getExperienceDocumentRouteState({
    ...route,
    routeProgress: 1,
    routeActive: false,
  }), { drawnDistance: 3200, visible: true });
});

test('Experience handoff reaches document scroll speed without a position jump', () => {
  assert.deepEqual(getExperienceHandoffState(0, 72), {
    backdropY: 36,
    maxShift: 36,
    stageY: 0,
  });
  assert.deepEqual(getExperienceHandoffState(0.5, 72), {
    backdropY: 27,
    maxShift: 36,
    stageY: -9,
  });
  assert.deepEqual(getExperienceHandoffState(1, 72), {
    backdropY: 0,
    maxShift: 36,
    stageY: -36,
  });

  const onePixelBeforeEnd = getExperienceHandoffState(71 / 72, 72);
  assert.ok(Math.abs((-36 - onePixelBeforeEnd.stageY) + 1) < 0.02);
});

test('Experience dog exits horizontally through the right boundary and reverses cleanly', () => {
  const stateAt = (progress) => getExperienceDogExitState({
    progress,
    startX: 620,
    endX: 1200,
    y: 410,
  });

  const forward = [0, 0.5, 1].map(stateAt);
  assert.deepEqual(forward, [
    { x: 620, y: 410, visible: true },
    { x: 910, y: 410, visible: true },
    { x: 1200, y: 410, visible: false },
  ]);
  assert.deepEqual([1, 0.5, 0].map(stateAt), [...forward].reverse());
});

test('Experience dog finishes the orange route beside the final career board before Contact', () => {
  const stateAt = (progress) => getExperienceDogRouteHoldState({
    progress,
    travelEnd: 0.4,
    startDistance: 1200,
    endDistance: 1800,
  });

  const forward = [0, 0.2, 0.4].map(stateAt);
  assert.deepEqual(forward, [
    { routeDistance: 1200, poseProgress: 0.8 },
    { routeDistance: 1500, poseProgress: 0.9 },
    { routeDistance: 1800, poseProgress: 1 },
  ]);
  assert.deepEqual([0.4, 0.2, 0].map(stateAt), [...forward].reverse());
  assert.deepEqual(stateAt(1), forward.at(-1));
});

test('Experience to Contact uses one clamped normalized ownership contract', () => {
  const start = getExperienceContactHandoffState(-1);
  const end = getExperienceContactHandoffState(2);

  assert.equal(EXPERIENCE_CONTACT_HANDOFF.stripCount, 10);
  assert.equal(start.progress, 0);
  assert.equal(start.phase, 'entry');
  assert.equal(start.exitProgress, 0);
  assert.equal(start.sceneOwner, 'experience');
  assert.equal(start.activeSection, 'experience');
  assert.equal(start.experienceVisible, true);
  assert.equal(start.contactVisible, false);
  assert.equal(start.contactInteractive, false);
  assert.equal(start.dog.visible, false);
  assert.equal(start.dog.travel, 0);
  assert.equal(start.strips.length, 10);
  assert.ok(start.strips.every((strip) => strip.progress === 0));

  assert.equal(end.progress, 1);
  assert.equal(end.phase, 'cleanup');
  assert.equal(end.exitProgress, 1);
  assert.equal(end.sceneOwner, 'contact');
  assert.equal(end.activeSection, 'contact');
  assert.equal(end.experienceVisible, false);
  assert.equal(end.contactVisible, true);
  assert.equal(end.cleanupReady, true);
  assert.equal(end.contact.phoneReady, true);
  assert.equal(end.contactInteractive, true);
  assert.ok(end.strips.every((strip) => strip.progress === 1));
});

test('Contact motion starts within the first fifth of the handoff', () => {
  const earlyHandoff = getExperienceContactHandoffState(0.2);

  assert.ok(EXPERIENCE_CONTACT_HANDOFF.contactStart < 0.2);
  assert.ok(EXPERIENCE_CONTACT_HANDOFF.stripOverlap >= 0.8);
  assert.equal(earlyHandoff.contactVisible, true);
  assert.ok(earlyHandoff.contact.progress > 0);
});

test('Contact strips launch bottom-up with overlapping left-to-right growth', () => {
  const state = getExperienceContactHandoffState(exitAt(0.42));
  const bottomUp = [...state.strips].reverse();
  const active = state.strips.filter((strip) => strip.progress > 0 && strip.progress < 1);

  assert.equal(state.phase, 'hold');
  assert.equal(bottomUp[0].index, EXPERIENCE_CONTACT_HANDOFF.stripCount - 1);
  assert.ok(bottomUp[0].progress >= bottomUp[1].progress);
  assert.ok(bottomUp[1].progress >= bottomUp[2].progress);
  assert.ok(active.length >= 2);
  assert.ok(state.strips.every((strip) => strip.origin === 'left'));
});

test('Contact strip count and overlap follow the section configuration', () => {
  const state = getExperienceContactHandoffState(exitAt(0.42), {
    stripCount: 10,
    stripOverlap: 0.6,
  });

  assert.equal(state.strips.length, 10);
  assert.ok(state.strips.filter((strip) => strip.progress > 0).length >= 2);
});

test('the same strip state retracts in exact reverse order', () => {
  const checkpoints = [0, 0.25, 0.42, 0.7, 1].map(exitAt).concat(1);
  const forward = checkpoints.map((progress) => (
    getExperienceContactHandoffState(progress).strips.map((strip) => strip.progress)
  ));
  const reverse = [...checkpoints].reverse().map((progress) => (
    getExperienceContactHandoffState(progress).strips.map((strip) => strip.progress)
  ));

  assert.deepEqual(reverse, [...forward].reverse());
});

test('Experience exit and strips finish before the Contact dog starts', () => {
  const midwayExit = getExperienceContactHandoffState(exitAt(0.5));
  const boundary = getExperienceContactHandoffState(
    EXPERIENCE_CONTACT_HANDOFF.contactStart,
  );
  const contactEntry = getExperienceContactHandoffState(contactAt(0.01));

  assert.equal(midwayExit.exitProgress, 0.5);
  assert.equal(midwayExit.contact.progress, 0);
  assert.equal(midwayExit.contactVisible, false);
  assert.equal(midwayExit.dog.travel, 0);
  assert.ok(midwayExit.strips.some((strip) => strip.progress > 0));
  assert.equal(boundary.exitProgress, 1);
  assert.ok(boundary.strips.every((strip) => strip.progress === 1));
  assert.equal(boundary.contact.progress, 0);
  assert.equal(boundary.dog.visible, false);
  assert.ok(contactEntry.contact.progress > 0);
  assert.equal(contactEntry.phase, 'exit');
  assert.ok(contactEntry.dog.travel > 0);
  assert.equal(contactEntry.dog.visible, true);
});

test('the three-fifths encounter and leftward dog exit are deterministic', () => {
  const beforeEncounter = getExperienceContactHandoffState(contactAt(0.52));
  const encounter = getExperienceContactHandoffState(contactAt(0.53));
  const dogTravel = [0, 0.18, 0.44, 0.53, 0.79].map((progress) => (
    getExperienceContactHandoffState(contactAt(progress)).dog.travel
  ));

  assert.equal(beforeEncounter.encounterReady, false);
  assert.equal(encounter.encounterReady, true);
  assert.ok(dogTravel.every((travel, index) => index === 0 || travel >= dogTravel[index - 1]));
  assert.equal(getExperienceContactHandoffState(contactAt(0.74)).dog.visible, true);
  assert.equal(getExperienceContactHandoffState(contactAt(0.75)).dog.visible, false);
});

test('direct Contact navigation bypasses the animated handoff at a valid settled state', () => {
  const state = getExperienceContactHandoffState(0, { staticMode: true });

  assert.equal(state.progress, 1);
  assert.equal(state.phase, 'cleanup');
  assert.equal(state.sceneOwner, 'contact');
  assert.equal(state.maskActive, false);
  assert.equal(state.contact.phoneReady, true);
  assert.equal(state.contactInteractive, true);
});

test('Contact controls stay inert after scene takeover until the phone settles', () => {
  const beforeReady = getExperienceContactHandoffState(contactAt(0.87));
  const ready = getExperienceContactHandoffState(contactAt(0.88));

  assert.equal(beforeReady.sceneOwner, 'contact');
  assert.equal(beforeReady.activeSection, 'contact');
  assert.equal(beforeReady.contact.phoneReady, false);
  assert.equal(beforeReady.contactInteractive, false);
  assert.equal(ready.sceneOwner, 'contact');
  assert.equal(ready.activeSection, 'contact');
  assert.equal(ready.contact.phoneReady, true);
  assert.equal(ready.contactInteractive, true);
});

test('route and dog progress are independent and cards own no shared playhead state', () => {
  assert.deepEqual(mapIndependentExperienceTracks({
    routeProgress: 1,
    dogProgress: 0,
  }), {
    line: 1,
    dog: 0,
    pose: 'glide',
  });
  assert.deepEqual(mapIndependentExperienceTracks({
    routeProgress: 0,
    dogProgress: 0.36,
  }), {
    line: 0,
    dog: 0.36,
    pose: 'glide',
  });
});

test('experience route uses a gentle three-bend path that reaches the left stop before the right stop', () => {
  const path = createExperienceRoutePath({ width: 1000, height: 800 });

  assert.equal(path.split('C').length - 1, 3);
  assert.ok(path.startsWith('M 440,-16 C 340,64'));
  assert.ok(path.includes('C 340,424 600,416 720,544'));
  assert.ok(path.includes('C 790,640 670,776'));
});

test('dog owns its turn boundaries without route or card timing', () => {
  assert.deepEqual(EXPERIENCE_PHASES, {
    firstArrival: 0.34,
    firstDepart: 0.44,
    secondArrival: 0.68,
    secondDepart: 0.8,
  });
});

test('dog keeps gliding beside career boards and only changes pose to turn', () => {
  const poseAt = (dogProgress) => mapIndependentExperienceTracks({
    routeProgress: 0,
    dogProgress,
  }).pose;
  assert.equal(poseAt(0.36), 'glide');
  assert.equal(poseAt(0.5), 'turn');
  assert.equal(poseAt(0.72), 'glide');
  assert.equal(poseAt(0.86), 'turn');
  assert.equal(mapIndependentExperienceTracks({
    routeProgress: 0,
    dogProgress: 1,
  }).dog, 1);
});

test('dog never changes into the removed standing pose', () => {
  assert.deepEqual(getDogPoseWeights(0.1), { glide: 1, turn: 0 });
  assert.deepEqual(getDogPoseWeights(0.36), { glide: 1, turn: 0 });
  assert.deepEqual(getDogPoseWeights(0.5), { glide: 0, turn: 1 });

  const turnBoundary = getDogPoseWeights(EXPERIENCE_PHASES.firstDepart);
  assert.ok(turnBoundary.glide > 0);
  assert.ok(turnBoundary.turn > 0);
  assert.ok(Math.abs(turnBoundary.glide + turnBoundary.turn - 1) < 1e-9);
});
