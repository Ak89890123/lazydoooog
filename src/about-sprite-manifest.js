const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PNG_PATH_PATTERN = /^\/assets\/.+\.png$/;

export const ABOUT_SPRITE_SHEET_SPECS = Object.freeze({
  entrance_roll: Object.freeze({ frameCount: 12, columns: 6, rows: 2, canvasWidth: 768, canvasHeight: 256 }),
  ollie: Object.freeze({ frameCount: 12, columns: 6, rows: 2, canvasWidth: 768, canvasHeight: 256 }),
  kickflip: Object.freeze({ frameCount: 16, columns: 8, rows: 2, canvasWidth: 1024, canvasHeight: 256 }),
  boardslide_popout: Object.freeze({ frameCount: 20, columns: 5, rows: 4, canvasWidth: 640, canvasHeight: 512 }),
  exit_roll: Object.freeze({ frameCount: 12, columns: 6, rows: 2, canvasWidth: 768, canvasHeight: 256 }),
});

export const ABOUT_SPRITE_REGISTRATION = Object.freeze({
  cellWidth: 128,
  cellHeight: 128,
  anchorX: 64,
  anchorY: 120,
  groundBaselineY: 112,
  fps: 12,
});

export const ABOUT_BOARD_ORIENTATIONS = Object.freeze([
  'side_on_unforeshortened',
  'pitching',
  'yawed',
  'edge_on',
  'inverted',
]);

export const ABOUT_WHEEL_VISIBILITY = Object.freeze([
  'both',
  'front_only',
  'rear_only',
  'occluded',
]);

const isIntegerInRange = (value, min, max) => (
  Number.isInteger(value) && value >= min && value <= max
);

const isPoint = (value) => (
  Array.isArray(value)
  && value.length === 2
  && value.every((coordinate) => Number.isFinite(coordinate))
);

const validateWheelCenters = (frame, errors) => {
  const front = frame.wheelCenters?.front ?? null;
  const rear = frame.wheelCenters?.rear ?? null;
  const expectsFront = ['both', 'front_only'].includes(frame.wheelVisibility);
  const expectsRear = ['both', 'rear_only'].includes(frame.wheelVisibility);

  if (expectsFront !== isPoint(front)) errors.push(`frame-${frame.index}:front-wheel-center`);
  if (expectsRear !== isPoint(rear)) errors.push(`frame-${frame.index}:rear-wheel-center`);
};

const validateAlphaBbox = (frame, errors) => {
  const bbox = frame.alphaBbox;
  if (!bbox || !['x', 'y', 'width', 'height'].every((key) => Number.isInteger(bbox[key]))) {
    errors.push(`frame-${frame.index}:alpha-bbox`);
    return;
  }
  if (
    bbox.x < 0
    || bbox.y < 0
    || bbox.width <= 0
    || bbox.height <= 0
    || bbox.x + bbox.width > ABOUT_SPRITE_REGISTRATION.cellWidth
    || bbox.y + bbox.height > ABOUT_SPRITE_REGISTRATION.cellHeight
  ) {
    errors.push(`frame-${frame.index}:alpha-bbox-bounds`);
  }
};

export const validateAboutSpriteManifest = (manifest, options = {}) => {
  const errors = [];
  const spec = ABOUT_SPRITE_SHEET_SPECS[manifest?.id];
  const expectedReferenceSha256 = options.canonicalReferenceSha256;

  if (!spec) return { valid: false, errors: ['sheet-id'] };
  if (!PNG_PATH_PATTERN.test(manifest.sheetPath || '')) errors.push('sheet-path');
  if (manifest.frameCount !== spec.frameCount) errors.push('frame-count');
  if (manifest.columns !== spec.columns || manifest.rows !== spec.rows) errors.push('grid');
  if (manifest.columns * manifest.rows !== manifest.frameCount) errors.push('undeclared-cells');
  if (
    manifest.canvas?.width !== spec.canvasWidth
    || manifest.canvas?.height !== spec.canvasHeight
    || manifest.canvas?.width !== manifest.columns * ABOUT_SPRITE_REGISTRATION.cellWidth
    || manifest.canvas?.height !== manifest.rows * ABOUT_SPRITE_REGISTRATION.cellHeight
  ) errors.push('canvas');
  if (
    manifest.cell?.width !== ABOUT_SPRITE_REGISTRATION.cellWidth
    || manifest.cell?.height !== ABOUT_SPRITE_REGISTRATION.cellHeight
  ) errors.push('cell');
  if (
    manifest.anchor?.x !== ABOUT_SPRITE_REGISTRATION.anchorX
    || manifest.anchor?.y !== ABOUT_SPRITE_REGISTRATION.anchorY
  ) errors.push('anchor');
  if (manifest.groundBaselineY !== ABOUT_SPRITE_REGISTRATION.groundBaselineY) errors.push('ground-baseline');
  if (manifest.fps !== ABOUT_SPRITE_REGISTRATION.fps) errors.push('fps');
  if (typeof manifest.loop !== 'boolean' || typeof manifest.holdLastFrame !== 'boolean') errors.push('playback-flags');
  if (manifest.transparent !== true || manifest.rowMajor !== true) errors.push('pixel-layout');
  if (manifest.antialiasFringePixels !== 0) errors.push('antialias-fringe');
  if (!isIntegerInRange(manifest.paletteSize, 1, 32)) errors.push('palette-size');
  if (!SHA256_PATTERN.test(manifest.sha256 || '')) errors.push('sheet-sha256');
  if (!SHA256_PATTERN.test(manifest.canonicalReferenceSha256 || '')) errors.push('reference-sha256');
  if (
    expectedReferenceSha256
    && manifest.canonicalReferenceSha256 !== expectedReferenceSha256
  ) errors.push('reference-hash-mismatch');

  const grounded = manifest.groundedKeyframes;
  if (
    !Array.isArray(grounded)
    || grounded.length < 2
    || grounded.some((index) => !isIntegerInRange(index, 0, spec.frameCount - 1))
    || grounded.some((index, position) => position > 0 && grounded[position - 1] >= index)
  ) errors.push('grounded-keyframes');

  if (!Array.isArray(manifest.frames) || manifest.frames.length !== spec.frameCount) {
    errors.push('frames');
  } else {
    manifest.frames.forEach((frame, index) => {
      if (frame.index !== index) errors.push(`frame-${index}:index`);
      if (!ABOUT_BOARD_ORIENTATIONS.includes(frame.boardOrientation)) {
        errors.push(`frame-${index}:board-orientation`);
      }
      if (!ABOUT_WHEEL_VISIBILITY.includes(frame.wheelVisibility)) {
        errors.push(`frame-${index}:wheel-visibility`);
      }
      const derivedWheelbaseApplicable = (
        frame.wheelVisibility === 'both'
        && frame.boardOrientation === 'side_on_unforeshortened'
      );
      if (frame.wheelbaseApplicable !== derivedWheelbaseApplicable) {
        errors.push(`frame-${index}:wheelbase-applicability`);
      }
      validateWheelCenters(frame, errors);
      validateAlphaBbox(frame, errors);
    });
  }

  return { valid: errors.length === 0, errors };
};

const frameAtRatio = (sheet, ratio) => {
  const frameCount = ABOUT_SPRITE_SHEET_SPECS[sheet].frameCount;
  const normalized = Math.min(1, Math.max(0, Number(ratio) || 0));
  return Math.min(frameCount - 1, Math.floor(normalized * frameCount));
};

export const createAboutSpriteRenderState = (manifest, frameIndex) => {
  const frame = Math.min(
    manifest.frameCount - 1,
    Math.max(0, Math.floor(Number(frameIndex) || 0)),
  );
  const column = frame % manifest.columns;
  const row = Math.floor(frame / manifest.columns);
  const x = manifest.columns > 1 ? (column / (manifest.columns - 1)) * 100 : 0;
  const y = manifest.rows > 1 ? (row / (manifest.rows - 1)) * 100 : 0;

  return {
    sheetPath: manifest.sheetPath,
    backgroundSize: `${manifest.columns * 100}% ${manifest.rows * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
  };
};

const ACTION_SHEETS = Object.freeze({
  1: 'ollie',
  2: 'kickflip',
  3: 'boardslide_popout',
});

export const createAboutSpriteFrameState = (semantic) => {
  const stage = Math.min(3, Math.max(1, Math.round(Number(semantic?.stage) || 1)));
  const q = Math.min(1, Math.max(0, Number(semantic?.q) || 0));
  const actionSheet = ACTION_SHEETS[stage];

  if (q < 0.1) {
    return {
      sheet: 'entrance_roll',
      frame: frameAtRatio('entrance_roll', q / 0.1),
      visible: true,
      pose: 'entrance',
    };
  }
  if (q < 0.5) {
    const actionRatio = stage === 3
      ? q < 0.2
        ? ((q - 0.1) / 0.1) * 0.25
        : q < 0.45
          ? 0.25 + ((q - 0.2) / 0.25) * 0.45
          : 0.7 + ((q - 0.45) / 0.05) * 0.3
      : (q - 0.1) / 0.4;
    return {
      sheet: actionSheet,
      frame: frameAtRatio(actionSheet, actionRatio),
      visible: true,
      pose: 'action',
    };
  }
  if (q < 0.72) {
    return {
      sheet: actionSheet,
      frame: ABOUT_SPRITE_SHEET_SPECS[actionSheet].frameCount - 1,
      visible: true,
      pose: 'impact-hold',
    };
  }
  return {
    sheet: 'exit_roll',
    frame: frameAtRatio('exit_roll', (q - 0.72) / 0.28),
    visible: true,
    pose: 'exit',
  };
};
