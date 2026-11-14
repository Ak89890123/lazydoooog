import assert from 'node:assert/strict';
import test from 'node:test';
import {
  heroPacingMap,
  mapHeroProgress,
  progressForHeroTime,
} from './hero-pacing.js';

test('balanced Hero pacing preserves the approved media endpoints', () => {
  assert.equal(mapHeroProgress(0), heroPacingMap.media.startTime);
  assert.equal(mapHeroProgress(1), heroPacingMap.media.endTime);
});

test('balanced Hero pacing stays monotone across the full film', () => {
  const samples = Array.from({ length: 101 }, (_, index) => mapHeroProgress(index / 100));
  samples.slice(1).forEach((time, index) => assert.ok(time >= samples[index]));
});

test('inverse pacing maps every approved anchor back to its progress', () => {
  heroPacingMap.balanced.anchors.forEach(({ progress, time }) => {
    assert.ok(Math.abs(progressForHeroTime(time) - progress) < 1e-9);
  });
});

test('the three selected skateboard beats receive forty percent more scroll travel', () => {
  const originalTimelineDuration = 5.6;
  const timelineDuration = heroPacingMap.balanced.timelineDuration;
  const beats = [
    { times: [3, 4.5], originalProgress: [0.24747020623802685, 0.38298189840645736] },
    { times: [5.25, 6.25], originalProgress: [0.4539262550949549, 0.5519346602061601] },
    { times: [6.25, 7], originalProgress: [0.5519346602061601, 0.6280337430636069] },
  ];

  beats.forEach(({ times, originalProgress }) => {
    const tunedDistance = (
      progressForHeroTime(times[1]) - progressForHeroTime(times[0])
    ) * timelineDuration;
    const originalDistance = (
      originalProgress[1] - originalProgress[0]
    ) * originalTimelineDuration;

    assert.ok(Math.abs(tunedDistance - originalDistance * 1.4) < 1e-8);
  });
});
