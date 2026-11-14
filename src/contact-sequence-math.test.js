import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getContactRoachMotionState,
  getContactSequenceState,
} from './contact-sequence-math.js';

test('maps Contact progress through crawl, flight, airborne escape, focus, and settled phases', () => {
  assert.deepEqual(
    [-1, 0.34, 0.42, 0.53, 0.62, 0.75, 0.88, 2]
      .map((progress) => getContactSequenceState(progress).phase),
    ['approach', 'ride', 'roach-flight', 'airborne', 'escape', 'focus', 'settled', 'settled'],
  );
});

test('keeps one live phone behind the dog until the encounter and ready only in the final hold', () => {
  const riding = getContactSequenceState(0.61);
  const released = getContactSequenceState(0.62);
  const almostSettled = getContactSequenceState(0.87);
  const settled = getContactSequenceState(0.88);

  assert.equal(riding.phoneBehindDog, true);
  assert.equal(released.phoneBehindDog, false);
  assert.equal(almostSettled.phoneReady, false);
  assert.equal(settled.phoneReady, true);
  assert.equal(settled.phoneRotation, 0);
});

test('registers the phone once behind the dog without pose-specific pocket assets', () => {
  const push = getContactSequenceState(0);
  const glide = getContactSequenceState(0.1);

  assert.deepEqual(push.phoneRegistration, {
    x: 0.7,
    y: 0.55,
    rotation: 0,
    scale: 0.065,
  });
  assert.equal(push.phoneOwnership, 'dog');

  assert.deepEqual(glide.phoneRegistration, push.phoneRegistration);
});

test('leaves the phone when the airborne dog lands and escapes in panic', () => {
  const beforeRelease = getContactSequenceState(0.6199);
  const released = getContactSequenceState(0.62);

  assert.equal(beforeRelease.dogPose, 'airborne');
  assert.equal(beforeRelease.phoneOwnership, 'dog');
  assert.equal(released.dogPose, 'escape');
  assert.equal(released.phoneRegistration, null);
  assert.equal(released.phoneBehindDog, false);
  assert.equal(released.phoneOwnership, 'landed');
});

test('dog registration is clamped and independent of traversal direction', () => {
  assert.deepEqual(getContactSequenceState(-1), getContactSequenceState(0));
  assert.deepEqual(getContactSequenceState(2), getContactSequenceState(1));

  const progress = [0, 0.08, 0.16, 0.24, 0.32, 0.4, 0.48];
  const forward = progress.map(getContactSequenceState);
  const reverse = [...progress].reverse().map(getContactSequenceState).reverse();

  assert.deepEqual(reverse, forward);
  assert.ok(forward.every((state) => state.phoneOwnership === 'dog'));
});

test('selects airborne and panic escape frames deterministically in forward and reverse', () => {
  const progress = [0.02, 0.1, 0.18, 0.54, 0.61, 0.62, 0.66, 0.74, 0.75];
  const forward = progress.map((value) => getContactSequenceState(value).dogPose);
  const reverse = [...progress].reverse().map((value) => getContactSequenceState(value).dogPose);

  assert.deepEqual(forward, ['push', 'glide', 'push', 'airborne', 'airborne', 'escape', 'escape', 'escape', 'escape']);
  assert.deepEqual(reverse, [...forward].reverse());
});

test('roach crawl and flight stages remain deterministic in both scroll directions', () => {
  const progress = [0.15, 0.16, 0.3, 0.42, 0.53, 0.7, 0.71];
  const forward = progress.map(getContactRoachMotionState);
  const reverse = [...progress].reverse().map(getContactRoachMotionState);

  assert.deepEqual(forward.map(({ phase }) => phase), [
    'hidden', 'crawl', 'crawl', 'flight', 'flight', 'flight', 'gone',
  ]);
  assert.deepEqual(reverse, [...forward].reverse());
  assert.equal(forward[2].crawl > forward[1].crawl, true);
  assert.equal(forward[4].flightIn, 1);
  assert.equal(forward[5].flightOut > 0, true);
});

test('static fallback bypasses pin motion and exposes the settled phone', () => {
  assert.deepEqual(getContactSequenceState(0, { staticMode: true }), {
    progress: 1,
    phase: 'settled',
    dogPose: 'escape',
    phoneRegistration: null,
    phoneOwnership: 'settled',
    phoneRotation: 0,
    phoneBehindDog: false,
    phoneReady: true,
    staticMode: true,
  });
});
