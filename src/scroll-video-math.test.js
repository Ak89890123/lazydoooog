import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  maxStepForLag,
  snapTimeToFrame,
  stepToward,
  targetTimeForProgress,
} from './scroll-video-math.js';

test('clamp keeps progress in range', () => {
  assert.equal(clamp(-0.4), 0);
  assert.equal(clamp(0.45), 0.45);
  assert.equal(clamp(2), 1);
});

test('target time preserves a small safe end padding', () => {
  assert.equal(targetTimeForProgress(0, 2.75), 0);
  assert.equal(targetTimeForProgress(1, 2.75), 2.71);
  assert.equal(targetTimeForProgress(0.5, 2.75), 1.355);
});

test('normal lag advances by two frames', () => {
  const step = maxStepForLag(0.25, 24);
  assert.equal(step, 2 / 24);
  assert.equal(stepToward(0, 1, step), step);
});

test('large lag uses bounded catch-up', () => {
  assert.equal(maxStepForLag(1.2, 24), 10 / 24);
  assert.equal(stepToward(1, 0, 0.25), 0.75);
});

test('video seeks snap to real encoded frame boundaries', () => {
  assert.equal(snapTimeToFrame(1.019, 48, 0, 10.375), 49 / 48);
  assert.equal(snapTimeToFrame(99, 48, 0, 10.375), 10.375);
  assert.equal(snapTimeToFrame(-1, 48, 0, 10.375), 0);
});
