import assert from 'node:assert/strict';
import test from 'node:test';
import { createAboutWorkflowPlaybackState } from './about-workflow-media.js';

const semantic = (stage, q, direction = 1) => ({ stage, q, direction });
const readyMedia = {
  enabled: true,
  ready: true,
  posterAvailable: true,
};

test('workflow media remains inert while source use is unapproved', () => {
  assert.deepEqual(
    createAboutWorkflowPlaybackState(semantic(3, 1), { enabled: false }),
    {
      mode: 'approval-pending',
      shouldPlay: false,
      resetToStart: true,
      showPoster: false,
      showVideo: false,
      showPlaceholder: true,
    },
  );
});

test('workflow lifecycle follows off, boot, active, and quiet thresholds', () => {
  const initial = createAboutWorkflowPlaybackState(semantic(3, 0.54999), readyMedia);
  const boot = createAboutWorkflowPlaybackState(semantic(3, 0.55), readyMedia);
  const active = createAboutWorkflowPlaybackState(semantic(3, 0.65), readyMedia);
  const quiet = createAboutWorkflowPlaybackState(semantic(3, 1), readyMedia);

  assert.equal(initial.mode, 'initial');
  assert.equal(initial.resetToStart, true);
  assert.equal(initial.showPoster, false);
  assert.equal(boot.mode, 'boot-poster');
  assert.equal(boot.shouldPlay, false);
  assert.equal(boot.showPoster, true);
  assert.equal(active.mode, 'playing');
  assert.equal(active.shouldPlay, true);
  assert.equal(quiet.mode, 'playing');
  assert.equal(quiet.shouldPlay, true);
});

test('visibility pauses in place while either section exit resets to the start', () => {
  const hidden = createAboutWorkflowPlaybackState(semantic(3, 0.8), {
    ...readyMedia,
    pageVisible: false,
  });
  const forwardExit = createAboutWorkflowPlaybackState(semantic(3, 1), {
    ...readyMedia,
    sectionExited: true,
    exitDirection: 1,
  });
  const backwardExit = createAboutWorkflowPlaybackState(semantic(1, 0), {
    ...readyMedia,
    sectionExited: true,
    exitDirection: -1,
  });

  assert.equal(hidden.mode, 'paused-frame');
  assert.equal(hidden.resetToStart, false);
  assert.equal(forwardExit.mode, 'initial');
  assert.equal(forwardExit.showVideo, false);
  assert.equal(forwardExit.resetToStart, true);
  assert.equal(backwardExit.mode, 'initial');
  assert.equal(backwardExit.showVideo, false);
  assert.equal(backwardExit.resetToStart, true);
});

test('reduced motion plays once while media errors use the poster', () => {
  const reduced = createAboutWorkflowPlaybackState(semantic(3, 1), {
    ...readyMedia,
    reducedMotion: true,
  });
  const failed = createAboutWorkflowPlaybackState(semantic(3, 0.8), {
    ...readyMedia,
    failed: true,
  });

  assert.equal(reduced.mode, 'reduced-playing');
  assert.equal(reduced.shouldPlay, true);
  assert.equal(reduced.showVideo, true);
  assert.equal(failed.mode, 'error');
  assert.equal(failed.shouldPlay, false);
  assert.equal(failed.showPoster, true);
});

test('autoplay blocking exposes the poster and manual play control state', () => {
  const blocked = createAboutWorkflowPlaybackState(semantic(3, 1), {
    ...readyMedia,
    playBlocked: true,
  });

  assert.equal(blocked.mode, 'blocked');
  assert.equal(blocked.shouldPlay, false);
  assert.equal(blocked.showPoster, true);
  assert.equal(blocked.showVideo, false);
});

test('metadata loading never starts playback before the content threshold', () => {
  const loading = createAboutWorkflowPlaybackState(semantic(3, 0.7), {
    enabled: true,
    ready: false,
    posterAvailable: true,
  });
  const earlierScreen = createAboutWorkflowPlaybackState(semantic(2, 1), readyMedia);

  assert.equal(loading.mode, 'loading');
  assert.equal(loading.shouldPlay, false);
  assert.equal(loading.showPoster, true);
  assert.equal(earlierScreen.mode, 'initial');
  assert.equal(earlierScreen.shouldPlay, false);
  assert.equal(earlierScreen.resetToStart, true);
});
