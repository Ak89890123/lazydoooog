const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export const createAboutWorkflowPlaybackState = (semantic, options = {}) => {
  const {
    enabled = false,
    ready = false,
    failed = false,
    posterAvailable = false,
    pageVisible = true,
    reducedMotion = false,
    playBlocked = false,
    sectionExited = false,
  } = options;

  if (!enabled) {
    return {
      mode: 'approval-pending',
      shouldPlay: false,
      resetToStart: true,
      showPoster: false,
      showVideo: false,
      showPlaceholder: true,
    };
  }

  if (failed) {
    return {
      mode: 'error',
      shouldPlay: false,
      resetToStart: false,
      showPoster: posterAvailable,
      showVideo: false,
      showPlaceholder: !posterAvailable,
    };
  }

  if (sectionExited) {
    return {
      mode: 'initial',
      shouldPlay: false,
      resetToStart: true,
      showPoster: false,
      showVideo: false,
      showPlaceholder: false,
    };
  }

  const stage = Math.round(Number(semantic?.stage) || 1);
  const q = clamp01(semantic?.q);
  const isThirdScreen = stage === 3;

  if (!isThirdScreen || q < 0.55) {
    return {
      mode: 'initial',
      shouldPlay: false,
      resetToStart: true,
      showPoster: false,
      showVideo: false,
      showPlaceholder: false,
    };
  }

  if (q < 0.65) {
    return {
      mode: 'boot-poster',
      shouldPlay: false,
      resetToStart: true,
      showPoster: posterAvailable,
      showVideo: false,
      showPlaceholder: !posterAvailable,
    };
  }

  if (!ready) {
    return {
      mode: 'loading',
      shouldPlay: false,
      resetToStart: false,
      showPoster: posterAvailable,
      showVideo: false,
      showPlaceholder: !posterAvailable,
    };
  }

  if (playBlocked) {
    return {
      mode: 'blocked',
      shouldPlay: false,
      resetToStart: false,
      showPoster: posterAvailable,
      showVideo: false,
      showPlaceholder: !posterAvailable,
    };
  }

  return {
    mode: pageVisible ? (reducedMotion ? 'reduced-playing' : 'playing') : 'paused-frame',
    shouldPlay: pageVisible,
    resetToStart: false,
    showPoster: false,
    showVideo: true,
    showPlaceholder: false,
  };
};

const normalizeSources = (sources) => (
  Array.isArray(sources)
    ? sources.filter((source) => (
      source
      && typeof source.src === 'string'
      && source.src.startsWith('/assets/')
      && typeof source.type === 'string'
    ))
    : []
);

export const createAboutWorkflowMediaController = (root, config = {}) => {
  const mount = root.querySelector('[data-about-workflow-media]');
  const placeholder = root.querySelector('[data-about-workflow-placeholder]');
  const placeholderLabel = placeholder?.querySelector('[data-about-workflow-fallback-label]');
  const placeholderTitle = placeholder?.querySelector('[data-about-workflow-fallback-title]');
  const playButton = root.querySelector('[data-about-workflow-play]');

  if (!mount || !placeholder) {
    throw new Error('About workflow media markup is incomplete');
  }

  const sources = normalizeSources(config.sources);
  const posterPath = typeof config.poster === 'string' && config.poster.startsWith('/assets/')
    ? config.poster
    : '';
  const requested = config.enabled === true;
  const configured = requested && sources.length > 0 && posterPath.length > 0;
  let ready = false;
  let failed = requested && !configured;
  let posterFailed = false;
  let pageVisible = document.visibilityState !== 'hidden';
  let sectionExited = false;
  let exitDirection = 0;
  let reducedMotion = false;
  let playBlocked = false;
  let destroyed = false;
  let lastSemantic = { stage: 1, q: 0, direction: 1 };
  let video = null;
  let poster = null;

  const setPlaceholderCopy = (label, title) => {
    if (placeholderLabel) placeholderLabel.textContent = label;
    if (placeholderTitle) placeholderTitle.textContent = title;
  };

  const pause = () => {
    if (video && !video.paused) video.pause();
  };

  const reset = () => {
    if (!video) return;
    pause();
    try {
      video.currentTime = 0;
    } catch {
      // Metadata may not be available yet; loadedmetadata reconciles again.
    }
  };

  const reconcile = () => {
    if (destroyed) return null;
    const state = createAboutWorkflowPlaybackState(lastSemantic, {
      enabled: requested,
      ready,
      failed,
      posterAvailable: Boolean(posterPath) && !posterFailed,
      pageVisible,
      reducedMotion,
      playBlocked,
      sectionExited,
    });

    root.dataset.aboutWorkflowMediaState = state.mode;
    mount.dataset.mediaState = state.mode;
    mount.setAttribute('aria-busy', state.mode === 'loading' ? 'true' : 'false');
    placeholder.hidden = !state.showPlaceholder;
    if (playButton) playButton.hidden = state.mode !== 'blocked';
    if (poster) poster.hidden = !state.showPoster;
    if (video) video.hidden = !state.showVideo;

    if (state.mode === 'error') {
      setPlaceholderCopy('MEDIA ERROR', 'WORKFLOW PREVIEW UNAVAILABLE');
    } else if (state.mode !== 'approval-pending') {
      setPlaceholderCopy('SANITIZED POSTER', 'WORKFLOW PREVIEW');
    }

    if (state.resetToStart) {
      reset();
    } else if (state.shouldPlay && video) {
      const playAttempt = video.play();
      if (playAttempt?.catch) {
        playAttempt.catch(() => {
          if (destroyed) return;
          pause();
          playBlocked = true;
          root.dataset.aboutWorkflowPlayback = 'blocked';
          reconcile();
        });
      }
    } else {
      pause();
    }

    root.dataset.aboutWorkflowPlayback = state.shouldPlay ? 'play-requested' : 'paused';
    return state;
  };

  const onLoadedMetadata = () => {
    ready = true;
    reconcile();
  };
  const onMediaError = () => {
    failed = true;
    ready = false;
    reconcile();
  };
  const onPosterError = () => {
    posterFailed = true;
    reconcile();
  };
  const onVisibilityChange = () => {
    pageVisible = document.visibilityState !== 'hidden';
    reconcile();
  };
  const onPageHide = () => {
    pageVisible = false;
    pause();
    root.dataset.aboutWorkflowPlayback = 'paused';
  };
  const onPageShow = () => {
    pageVisible = document.visibilityState !== 'hidden';
    reconcile();
  };
  const onPlayClick = () => {
    playBlocked = false;
    reconcile();
  };

  if (configured) {
    poster = document.createElement('img');
    poster.className = 'motion-workflow-poster';
    poster.src = posterPath;
    poster.alt = '';
    poster.decoding = 'async';
    poster.loading = 'lazy';
    poster.hidden = true;
    poster.addEventListener('error', onPosterError, { once: true });

    video = document.createElement('video');
    video.className = 'motion-workflow-video';
    video.muted = true;
    video.defaultMuted = true;
    video.loop = !reducedMotion;
    video.playsInline = true;
    video.preload = 'metadata';
    video.poster = posterPath;
    video.hidden = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-label', 'Sanitized n8n workflow preview');
    sources.forEach(({ src, type }) => {
      const source = document.createElement('source');
      source.src = src;
      source.type = type;
      video.append(source);
    });
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('error', onMediaError, { once: true });
    mount.prepend(poster, video);
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  playButton?.addEventListener('click', onPlayClick);
  reconcile();

  return {
    render(semantic, options = {}) {
      lastSemantic = { ...semantic };
      reducedMotion = options.reducedMotion === true;
      if (video) video.loop = !reducedMotion;
      sectionExited = false;
      exitDirection = 0;
      return reconcile();
    },
    pauseForExit(direction) {
      sectionExited = true;
      exitDirection = direction < 0 ? -1 : 1;
      return reconcile();
    },
    destroy() {
      destroyed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      playButton?.removeEventListener('click', onPlayClick);
      pause();
      if (video) {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('error', onMediaError);
        video.remove();
      }
      if (poster) {
        poster.removeEventListener('error', onPosterError);
        poster.remove();
      }
      root.dataset.aboutWorkflowPlayback = 'destroyed';
    },
  };
};
