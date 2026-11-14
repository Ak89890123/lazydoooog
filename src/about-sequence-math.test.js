import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ABOUT_LOCAL_PHASES,
  aboutScrollDistancePx,
  canonicalizeAboutState,
  createAboutScreenContentState,
  createAboutSemanticState,
  describeAboutPhase,
  getAboutComboHudState,
  getAboutComboHudMotion,
  getAboutComboHudPosition,
  getAboutDesktopComboHudState,
  getAboutDogGroundOffset,
  getAboutDogHorizontalPosition,
  getAboutDogTrickOffset,
  getAboutPlateState,
  getAboutScreenUnlockMask,
  mapAboutStateToDesktopProgress,
  mapDesktopProgressToAboutState,
} from './about-sequence-math.js';

const CLOSE = 1e-9;
const assertClose = (actual, expected) => {
  assert.ok(Math.abs(actual - expected) <= CLOSE, `${actual} != ${expected}`);
};

test('desktop ranges own exact endpoints canonically', () => {
  assert.deepEqual(mapDesktopProgressToAboutState(0), { stage: 1, q: 0, direction: 1 });
  assert.deepEqual(mapDesktopProgressToAboutState(0.28), { stage: 2, q: 0, direction: 1 });
  assert.deepEqual(mapDesktopProgressToAboutState(0.5), { stage: 3, q: 0, direction: 1 });
  assert.deepEqual(mapDesktopProgressToAboutState(0.8), { stage: 3, q: 0.75, direction: 1 });
  assert.deepEqual(mapDesktopProgressToAboutState(1), { stage: 3, q: 1, direction: 1 });
});

test('the frame before each desktop boundary remains in the preceding range', () => {
  const before = 1e-8;
  const stage1 = mapDesktopProgressToAboutState(0.28 - before);
  const stage2 = mapDesktopProgressToAboutState(0.5 - before);
  const stage3Action = mapDesktopProgressToAboutState(0.8 - before);

  assert.equal(stage1.stage, 1);
  assert.ok(stage1.q < 1);
  assert.equal(stage2.stage, 2);
  assert.ok(stage2.q < 1);
  assert.equal(stage3Action.stage, 3);
  assert.ok(stage3Action.q < 0.75);
});

test('reverse direction survives exact endpoint canonicalization', () => {
  assert.deepEqual(
    canonicalizeAboutState({ stage: 1, q: 1, direction: -1 }),
    { stage: 2, q: 0, direction: -1 },
  );
  assert.deepEqual(
    canonicalizeAboutState({ stage: 2, q: 1, direction: -1 }),
    { stage: 3, q: 0, direction: -1 },
  );
  assert.equal(mapDesktopProgressToAboutState(0.28, -1).direction, -1);
});

test('desktop and semantic progress round-trip across every range', () => {
  [0, 0.07, 0.279, 0.28, 0.39, 0.423, 0.499, 0.5, 0.65, 0.799, 0.8, 0.9, 1]
    .forEach((progress) => {
      const state = mapDesktopProgressToAboutState(progress, -1);
      assertClose(mapAboutStateToDesktopProgress(state), progress);
    });
});

test('kickflip receives extra scroll travel before the second switch impact', () => {
  assertClose(mapAboutStateToDesktopProgress({ stage: 2, q: 0.5 }), 0.423);
});

test('desktop combo labels use equal independent scroll windows', () => {
  const starts = [1, 2, 3]
    .map((stage) => mapAboutStateToDesktopProgress({ stage, q: 0.5 }));

  starts.forEach((start, index) => {
    assert.deepEqual(getAboutDesktopComboHudState(start - 1e-6, index), {
      opacity: 0,
      y: 0,
      entryProgress: 0,
    });
    const midpoint = getAboutDesktopComboHudState(start + 0.228, index);
    assertClose(midpoint.opacity, 0.5);
    assertClose(midpoint.y, -9);
    const end = getAboutDesktopComboHudState(start + 0.268, index);
    assertClose(end.opacity, 0);
    assertClose(end.y, -18);
  });
});

test('local phases use inclusive starts and exclusive ends', () => {
  ABOUT_LOCAL_PHASES.forEach((phase, index) => {
    assert.equal(describeAboutPhase(phase.start).phase, phase.id);
    if (index < ABOUT_LOCAL_PHASES.length - 1) {
      assert.equal(describeAboutPhase(phase.end).phase, ABOUT_LOCAL_PHASES[index + 1].id);
    }
  });
  assert.deepEqual(describeAboutPhase(1), {
    phase: 'reading_or_recovery',
    phaseRatio: 1,
  });
});

test('screen unlock state is preserved at canonical stage boundaries', () => {
  assert.deepEqual(getAboutScreenUnlockMask({ stage: 1, q: 0.499 }), [false, false, false]);
  assert.deepEqual(getAboutScreenUnlockMask({ stage: 1, q: 0.5 }), [true, false, false]);
  assert.deepEqual(getAboutScreenUnlockMask({ stage: 2, q: 0 }), [true, false, false]);
  assert.deepEqual(getAboutScreenUnlockMask({ stage: 2, q: 0.5 }), [true, true, false]);
  assert.deepEqual(getAboutScreenUnlockMask({ stage: 3, q: 0 }), [true, true, false]);
  assert.deepEqual(getAboutScreenUnlockMask({ stage: 3, q: 0.5 }), [true, true, true]);
});

test('semantic state carries phase, direction, and unlock mask together', () => {
  const semantic = createAboutSemanticState({ stage: 2, q: 0.6, direction: -1 });
  assertClose(semantic.phaseRatio, 0.5);
  assert.deepEqual({ ...semantic, phaseRatio: 0.5 }, {
    stage: 2,
    q: 0.6,
    direction: -1,
    phase: 'boot',
    phaseRatio: 0.5,
    screenUnlockMask: [true, true, false],
  });
});

test('all combo labels remain visible through the content hold before fading out', () => {
  assert.deepEqual(getAboutComboHudState(0.499), { opacity: 0, y: 0, entryProgress: 0 });
  assert.deepEqual(getAboutComboHudState(0.86), { opacity: 1, y: 0, entryProgress: 1 });
  const midpoint = getAboutComboHudState(0.91);
  assertClose(midpoint.opacity, 0.5);
  assertClose(midpoint.y, -9);
  assert.deepEqual(getAboutComboHudState(0.96), {
    opacity: 0,
    y: -18,
    entryProgress: 1,
  });
});

test('combo badges own three deterministic entrance motions', () => {
  assert.deepEqual(getAboutComboHudMotion({ entryProgress: 0 }, 0), {
    x: 0, y: 18, scale: 0.58, rotation: -6, rotationY: 0,
  });
  assert.deepEqual(getAboutComboHudMotion({ entryProgress: 0 }, 1), {
    x: 0, y: 0, scale: 0.72, rotation: -18, rotationY: -110,
  });
  assert.deepEqual(getAboutComboHudMotion({ entryProgress: 0 }, 2), {
    x: -46, y: 0, scale: 0.88, rotation: -3, rotationY: 0,
  });
  assert.deepEqual(getAboutComboHudMotion({ entryProgress: 1 }, 2), {
    x: 0, y: 0, scale: 1, rotation: 0, rotationY: 0,
  });
});

test('combo labels use distinct offsets anchored to the dog', () => {
  const base = {
    anchorX: 500,
    anchorY: 300,
    dogWidth: 100,
    dogHeight: 80,
    liftY: -9,
  };
  assert.deepEqual(getAboutComboHudPosition({ ...base, index: 0 }), { x: 428, y: 228.6 });
  assert.deepEqual(getAboutComboHudPosition({ ...base, index: 1 }), { x: 576, y: 212.6 });
  assert.deepEqual(getAboutComboHudPosition({ ...base, index: 2 }), { x: 412, y: 233.4 });
});

test('floor buttons depress through three frames and stay latched after impact', () => {
  assert.deepEqual(getAboutPlateState({ stage: 1, q: 0.46 }, 0), {
    pressProgress: 0,
    frame: 0,
    unlocked: false,
  });
  assert.equal(getAboutPlateState({ stage: 1, q: 0.5 }, 0).frame, 1);
  assert.deepEqual(getAboutPlateState({ stage: 1, q: 0.54 }, 0), {
    pressProgress: 1,
    frame: 2,
    unlocked: true,
  });
  assert.deepEqual(getAboutPlateState({ stage: 2, q: 0 }, 0), {
    pressProgress: 1,
    frame: 2,
    unlocked: true,
  });
});

test('dog floor path reaches each staggered plate without jumping at stage boundaries', () => {
  assertClose(getAboutDogGroundOffset({ stage: 1, q: 0 }), 0);
  assertClose(
    getAboutDogGroundOffset({ stage: 1, q: 1 }),
    getAboutDogGroundOffset({ stage: 2, q: 0 }),
  );
  assertClose(
    getAboutDogGroundOffset({ stage: 2, q: 1 }),
    getAboutDogGroundOffset({ stage: 3, q: 0 }),
  );
  assert.ok(getAboutDogGroundOffset({ stage: 2, q: 0.5 })
    > getAboutDogGroundOffset({ stage: 1, q: 0.5 }));
  assertClose(getAboutDogGroundOffset({ stage: 2, q: 0.1 }), 0.071);
  assertClose(getAboutDogGroundOffset({ stage: 3, q: 0.1 }), 0.043);
});

test('dog boardslides between the second and third switches before landing on switch three', () => {
  assertClose(getAboutDogHorizontalPosition({ stage: 1, q: 0.5 }), 0.185);
  assertClose(getAboutDogHorizontalPosition({ stage: 2, q: 0.5 }), 0.505);
  assertClose(getAboutDogHorizontalPosition({ stage: 2, q: 1 }), 0.605);
  assertClose(getAboutDogHorizontalPosition({ stage: 3, q: 0 }), 0.605);
  assertClose(getAboutDogHorizontalPosition({ stage: 3, q: 0.2 }), 0.645185546875);
  assertClose(getAboutDogHorizontalPosition({ stage: 3, q: 0.3 }), 0.7225);
  assertClose(getAboutDogHorizontalPosition({ stage: 3, q: 0.42 }), 0.8087056);
  assertClose(getAboutDogHorizontalPosition({ stage: 3, q: 0.5 }), 0.82);
});

test('dog waits on each switch until its screen content is fully visible', () => {
  assertClose(getAboutDogHorizontalPosition({ stage: 1, q: 0.72 }), 0.185);
  assertClose(getAboutDogHorizontalPosition({ stage: 2, q: 0.72 }), 0.505);
  assertClose(getAboutDogHorizontalPosition({ stage: 3, q: 0.72 }), 0.82);
  assert.ok(getAboutDogHorizontalPosition({ stage: 3, q: 0.74 }) > 0.82);
  assert.ok(getAboutDogHorizontalPosition({ stage: 3, q: 0.8 }) > 0.82);
});

test('ollie, kickflip, and boardslide use distinct reversible vertical paths', () => {
  const ollie = getAboutDogTrickOffset({ stage: 1, q: 0.3 });
  const kickflip = getAboutDogTrickOffset({ stage: 2, q: 0.32 });
  const boardslide = getAboutDogTrickOffset({ stage: 3, q: 0.3 });

  assert.ok(ollie < -0.1);
  assert.ok(kickflip < -0.22);
  assertClose(boardslide, -0.08);
  assertClose(getAboutDogTrickOffset({ stage: 3, q: 0.44 }), -0.08);
  assert.ok(getAboutDogTrickOffset({ stage: 3, q: 0.46 }) > -0.08);
  assert.notEqual(ollie, kickflip);
  assert.notEqual(kickflip, boardslide);
  assertClose(getAboutDogTrickOffset({ stage: 2, q: 0.1 }), 0);
  assertClose(getAboutDogTrickOffset({ stage: 2, q: 0.5 }), 0);
  assert.ok(getAboutDogTrickOffset({ stage: 1, q: 0.12 }) > 0);
  assert.ok(getAboutDogTrickOffset({ stage: 2, q: 0.12 }) > 0);
  assertClose(
    getAboutDogTrickOffset({ stage: 2, q: 0.37, direction: 1 }),
    getAboutDogTrickOffset({ stage: 2, q: 0.37, direction: -1 }),
  );
});

test('500vh end distance is computed as an integer pixel distance', () => {
  assert.equal(aboutScrollDistancePx(900), 4500);
  assert.equal(aboutScrollDistancePx(844), 4220);
  assert.equal(aboutScrollDistancePx(844.4), 4222);
});

test('portrait drift is deterministic, bounded, and slows in quiet reading', () => {
  const activeA = createAboutScreenContentState({ stage: 3, q: 0.2 }, 0.6);
  const activeB = createAboutScreenContentState({ stage: 3, q: 0.2 }, 0.61);
  const quietA = createAboutScreenContentState({ stage: 3, q: 0.8 }, 0.9);
  const quietB = createAboutScreenContentState({ stage: 3, q: 0.8 }, 0.91);

  [activeA, activeB, quietA, quietB].forEach(({ portraitX, portraitY }) => {
    assert.ok(portraitX >= 0 && portraitX <= 1);
    assert.ok(portraitY >= 0 && portraitY <= 1);
  });
  assert.ok(Math.abs(quietB.portraitX - quietA.portraitX)
    < Math.abs(activeB.portraitX - activeA.portraitX));
  assert.equal(quietA.portraitQuiet, true);
});

test('repeat detector flows, scans, freezes, and reverses from semantic progress', () => {
  const before = createAboutScreenContentState({ stage: 2, q: 0.54 });
  const scanning = createAboutScreenContentState({ stage: 2, q: 0.64 });
  const detected = createAboutScreenContentState({ stage: 2, q: 0.72 });
  const carried = createAboutScreenContentState({ stage: 3, q: 0 });
  const reversed = createAboutScreenContentState({ stage: 2, q: 0.64, direction: -1 });

  assert.equal(before.repeatScanProgress, 0);
  assert.ok(scanning.repeatScanProgress > 0 && scanning.repeatScanProgress < 1);
  assert.equal(detected.repeatDetected, true);
  assert.equal(carried.repeatFlowOffset, 0.5);
  assert.equal(carried.repeatDetected, true);
  assert.deepEqual(reversed, scanning);
});
